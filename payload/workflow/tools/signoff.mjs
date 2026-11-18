#!/usr/bin/env node
// A person signs off a change to sensitive files (`sensitive.paths` in workflow/config.json: money, health, legal texts,
// personal data) after checking it themselves. Writes one signed row in docs/company/SIGNOFFS.md; the gate's *signoff* check
// needs it. Why and how it holds: workflow/tools/lib/signoff.mjs and workflow/guides/SENSITIVE.md.
//   npm run signoff                    show the sensitive files this change touches, ask the checklist and the passphrase, sign
//   npm run signoff -- --init          once per person: make your key (asks a passphrase); the project's first signer is added to
//                                      docs/company/SIGNERS.md (commit it on main on its own, before the first sign-off:
//                                      node workflow/scripts/session.mjs --commit-notes "Sign-offs: the first signer"; no push needed)
//   npm run signoff -- --show-key      your public key, to send to a signer who adds you
//   npm run signoff -- --add-signer "<name>" <public key>   a signer adds another person (or your own second computer's key)
//   --base <ref>                       compare with this commit instead of where the branch left main
// The private key is ~/.config/ai-workflow-kit/signoff-key.pem (WORKFLOW_SIGNOFF_KEY: another path), encrypted with the passphrase. Every
// part that signs asks for it in a terminal with a person typing (no pipe, no CI), so an agent cannot sign.
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { randomInt, createPublicKey } from 'node:crypto';
import { matchesAny } from './lib/glob.mjs';
import { CHECKLIST, SIGNERS, SIGNOFFS, fingerprint, makeKey, parseSigners, sensitiveFiles, signerRow, signoffRow, signoffVerdict } from './lib/signoff.mjs';
import { MAIN, ORIGIN_MAIN } from './lib/branch.mjs';

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
process.chdir(git('rev-parse', '--show-toplevel'));
const config = JSON.parse(readFileSync('workflow/config.json', 'utf8'));
const args = process.argv.slice(2);
const today = new Date().toISOString().slice(0, 10);
const keyFile = process.env.WORKFLOW_SIGNOFF_KEY || join(homedir(), '.config', 'ai-workflow-kit', 'signoff-key.pem');
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : undefined);
const myKey = () => (existsSync(keyFile) ? createPublicKey(readFileSync(keyFile, 'utf8')).export({ type: 'spki', format: 'der' }).toString('base64') : null);

if (args.includes('--show-key')) {
  console.log(myKey() ?? `signoff: no key yet (${keyFile}): npm run signoff -- --init makes one`);
  process.exit(0);
}

if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI) {
  console.log('signoff: refused. A sign-off is a person checking the change, so it runs only in a terminal with someone typing (not from an agent, a pipe or CI).');
  process.exit(1);
}
const rl = createInterface({ input: process.stdin, output: process.stdout });
const stop = (why) => { rl.close(); console.log(`signoff: not signed (${why}).`); process.exit(1); };
/** A question whose answer is not shown while it is typed. */
async function secret(q) {
  const write = rl._writeToOutput;
  rl._writeToOutput = (s) => { if (s.startsWith(q)) write.call(rl, s); };
  try { return await rl.question(q); } finally { rl._writeToOutput = write; process.stdout.write('\n'); }
}
const signersText = () => read(SIGNERS) ?? `# Signers\n\nWho may sign off a change to the sensitive files (\`sensitive.paths\`): each person's public key, written by \`npm run signoff -- --init\` or \`--add-signer\`, never by hand. A signer added after the first is endorsed by an existing one; the gate trusts only the signers on main. Read workflow/guides/SENSITIVE.md.\n\n| Who | Public key | Added | Endorsed by |\n|---|---|---|---|\n`;

if (args.includes('--init')) {
  if (!myKey()) {
    const pass = await secret('A passphrase for your signing key (at least 12 characters; only you know it): ');
    if (pass.length < 12) stop('the passphrase is shorter than 12 characters');
    if ((await secret('The same again: ')) !== pass) stop('the two did not match');
    const { privateKey } = makeKey(pass);
    mkdirSync(dirname(keyFile), { recursive: true });
    writeFileSync(keyFile, privateKey, { mode: 0o600 });
    console.log(`signoff: your key is ${keyFile} (encrypted with your passphrase; to sign on another computer, copy it there or have it added with --add-signer)`);
  }
  const key = myKey();
  if (parseSigners(read(SIGNERS)).some((s) => s.key === key)) { rl.close(); console.log(`signoff: you are in ${SIGNERS} already`); process.exit(0); }
  if (parseSigners(read(SIGNERS)).length) {
    rl.close();
    console.log(`signoff: ${SIGNERS} has signers already, so one of them adds you:\n  npm run signoff -- --add-signer "<your name>" ${key}`);
    process.exit(0);
  }
  const who = (await rl.question(`Your name [${git('config', 'user.name') ?? ''}]: `)).trim() || git('config', 'user.name') || '';
  if (!who) stop('no name');
  rl.close();
  writeFileSync(SIGNERS, `${signersText().replace(/\n*$/, '\n')}${signerRow({ who, key, date: today })}\n`);
  console.log(`signoff: you are the first signer in ${SIGNERS}. Commit it on main on its own (the gate trusts the signers on main; no push needed): node workflow/scripts/session.mjs --commit-notes "Sign-offs: the first signer". Then sign off changes.`);
  process.exit(0);
}

const privateKey = existsSync(keyFile) ? readFileSync(keyFile, 'utf8') : null;
if (!privateKey) stop(`you have no key yet: npm run signoff -- --init`);
if (!parseSigners(read(SIGNERS)).some((s) => s.key === myKey())) stop(`your key is not in ${SIGNERS}: a signer adds you with --add-signer (npm run signoff -- --show-key prints it)`);

if (args.includes('--add-signer')) {
  const at = args.indexOf('--add-signer');
  const [who, key] = [args[at + 1], args[at + 2]];
  if (!who || !key || who.startsWith('--')) stop('say who and their key: --add-signer "<name>" <public key>');
  try { createPublicKey({ key: Buffer.from(key, 'base64'), format: 'der', type: 'spki' }); } catch { stop('that is not a public key (npm run signoff -- --show-key prints one)'); }
  const passphrase = await secret('Your passphrase (to endorse them): ');
  rl.close();
  let row;
  try { row = signerRow({ who, key, date: today, endorser: { privateKey, passphrase } }); } catch { stop('the passphrase is wrong'); }
  writeFileSync(SIGNERS, `${signersText().replace(/\n*$/, '\n')}${row}\n`);
  console.log(`signoff: ${who} added to ${SIGNERS}, endorsed by you. Their sign-offs count once this is on main.`);
  process.exit(0);
}

const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : git('merge-base', 'HEAD', ORIGIN_MAIN) ?? git('merge-base', 'HEAD', MAIN) ?? 'HEAD';
const paths = config.sensitive?.paths ?? [];
if (!paths.length) { rl.close(); console.log('signoff: no sensitive.paths in workflow/config.json, so nothing needs a sign-off'); process.exit(0); }
const changed = [...(git('diff', '--name-only', base) ?? '').split('\n'), ...(git('ls-files', '--others', '--exclude-standard') ?? '').split('\n')].filter(Boolean);
const files = sensitiveFiles(changed, paths, matchesAny);
if (!files.length) { rl.close(); console.log('signoff: this change touches no sensitive file'); process.exit(0); }
const print = fingerprint(files, read);
const verdict = signoffVerdict({ changed: files, paths, matches: matchesAny, read, signoffs: read(SIGNOFFS), baseSigners: git('show', `${base}:${SIGNERS}`), signers: read(SIGNERS) });
if (verdict.ok) { rl.close(); console.log(`signoff: this version is already signed (${print})`); process.exit(0); }

console.log(`These sensitive files changed since ${base.slice(0, 12)}:\n${files.map((f) => `  ${f}`).join('\n')}\n`);
console.log(git('diff', '--stat', base, '--', ...files) || '(new files: read them in full)');
console.log(`\nRead the change itself first: git diff ${base.slice(0, 12)} -- ${files.join(' ')}\nThen answer each line with "yes" (anything else stops).\n`);
for (const q of config.sensitive?.checklist ?? CHECKLIST) if ((await rl.question(`- ${q}\n  yes? `)).trim().toLowerCase() !== 'yes') stop('a "no"');
const who = (await rl.question(`Your name [${git('config', 'user.name') ?? ''}]: `)).trim() || git('config', 'user.name') || '';
if (!who) stop('no name');
const code = String(randomInt(1000, 9999));
if ((await rl.question(`Type ${code} to sign: `)).trim() !== code) stop('the code did not match');
const passphrase = await secret('Your passphrase: ');
rl.close();
let row;
try { row = signoffRow({ date: today, who, print, files, privateKey, passphrase }); } catch { stop('the passphrase is wrong'); }

if (!existsSync(SIGNOFFS)) writeFileSync(SIGNOFFS, '# Sign-offs\n\nOne row per checked version of the sensitive files (`sensitive.paths`), written by `npm run signoff`, never by hand or by an agent: each row is signed with a signer\'s key (docs/company/SIGNERS.md). Read workflow/guides/SENSITIVE.md for what is checked.\n\n| Date | Who | Fingerprint | Files | Signature |\n|---|---|---|---|---|\n');
appendFileSync(SIGNOFFS, `${row}\n`);
console.log(`signoff: signed ${files.length} file${files.length === 1 ? '' : 's'} (${print}) in ${SIGNOFFS}; it goes in the same commit as the change`);
if (!verdict.line?.includes('no signer yet') && !parseSigners(git('show', `${base}:${SIGNERS}`)).some((s) => s.key === myKey())) console.log(`  (your key is not on main yet: the gate counts this once ${SIGNERS} with you in it is there)`);
