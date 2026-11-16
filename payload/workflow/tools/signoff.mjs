#!/usr/bin/env node
// A person signs off a change to sensitive files (`sensitive.paths` in workflow/config.json: money, health, legal texts,
// personal data) after checking it themselves. Writes one row in docs/company/SIGNOFFS.md; the gate's *signoff* check needs it.
//   npm run signoff             show the sensitive files this change touches, ask the checklist, write the row
//   npm run signoff -- --base <ref>   compare with this commit instead of where the branch left main
// Only at a terminal with a person typing: no input from a pipe, a typed-back code, and agents are denied the command in
// .claude/settings.local.json. This keeps a model from approving its own work; it does not stop a person who means to cheat.
import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { matchesAny } from './lib/glob.mjs';
import { CHECKLIST, fingerprint, parseSignoffs, sensitiveFiles, signoffRow } from './lib/signoff.mjs'; import { MAIN, ORIGIN_MAIN } from './lib/branch.mjs';

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
process.chdir(git('rev-parse', '--show-toplevel'));
const config = JSON.parse(readFileSync('workflow/config.json', 'utf8'));
const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : git('merge-base', 'HEAD', ORIGIN_MAIN) ?? git('merge-base', 'HEAD', MAIN) ?? 'HEAD';
const FILE = 'docs/company/SIGNOFFS.md';

const paths = config.sensitive?.paths ?? [];
if (!paths.length) { console.log('signoff: no sensitive.paths in workflow/config.json, so nothing needs a sign-off'); process.exit(0); }
const changed = [...(git('diff', '--name-only', base) ?? '').split('\n'), ...(git('ls-files', '--others', '--exclude-standard') ?? '').split('\n')].filter(Boolean);
const files = sensitiveFiles(changed, paths, matchesAny);
if (!files.length) { console.log('signoff: this change touches no sensitive file'); process.exit(0); }
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : undefined);
const print = fingerprint(files, read);
if (parseSignoffs(read(FILE)).some((r) => r.fingerprint === print)) { console.log(`signoff: this version is already signed (${print})`); process.exit(0); }

if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI) {
  console.log('signoff: refused. A sign-off is a person checking the change, so it runs only in a terminal with someone typing (not from an agent, a pipe or CI).');
  process.exit(1);
}

console.log(`These sensitive files changed since ${base.slice(0, 12)}:\n${files.map((f) => `  ${f}`).join('\n')}\n`);
console.log(git('diff', '--stat', base, '--', ...files) || '(new files: read them in full)');
console.log(`\nRead the change itself first: git diff ${base.slice(0, 12)} -- ${files.join(' ')}\nThen answer each line with "yes" (anything else stops).\n`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const stop = (why) => { rl.close(); console.log(`signoff: not signed (${why}). Fix what is wrong, or ask for a second pair of eyes.`); process.exit(1); };
for (const q of config.sensitive?.checklist ?? CHECKLIST) if ((await rl.question(`- ${q}\n  yes? `)).trim().toLowerCase() !== 'yes') stop('a "no"');
const who = (await rl.question(`Your name [${git('config', 'user.name') ?? ''}]: `)).trim() || git('config', 'user.name') || '';
if (!who) stop('no name');
const code = String(randomInt(1000, 9999));
if ((await rl.question(`Type ${code} to sign: `)).trim() !== code) stop('the code did not match');
rl.close();

if (!existsSync(FILE)) writeFileSync(FILE, '# Sign-offs\n\nOne row per checked version of the sensitive files (`sensitive.paths`), written by `npm run signoff`, never by hand or by an agent. Read workflow/guides/SENSITIVE.md for what is checked.\n\n| Date | Who | Fingerprint | Files |\n|---|---|---|---|\n');
appendFileSync(FILE, `${signoffRow({ date: new Date().toISOString().slice(0, 10), who, print, files })}\n`);
console.log(`signoff: signed ${files.length} file${files.length === 1 ? '' : 's'} (${print}) in ${FILE}; it goes in the same commit as the change`);
