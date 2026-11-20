// The human sign-off for sensitive files (money, health, legal texts, personal data): a change to a file under
// `sensitive.paths` in workflow/config.json passes the gate only when docs/company/SIGNOFFS.md holds a row for the files as they
// are now, signed by one of the people in docs/company/SIGNERS.md. Why: workflow/guides/SENSITIVE.md.
// How it holds: each signer has a key pair (ed25519, node:crypto). The private key stays on their computer, encrypted with a
// passphrase only they know (`npm run signoff -- --init` makes it); the public key is committed in SIGNERS.md. A row is signed
// with the private key, so writing one needs the passphrase: an agent that reads every file on the computer still cannot make
// one, and any computer (a second one, GitHub's runners) can check one with the committed public keys.
// Which signers count: the ones on the branch the change left (main), plus a new one that one of them endorsed; a key added in
// the change itself counts for nothing until then. The first signer of a project goes in on its own (`--init`), before a sign-off.
import { createHash, generateKeyPairSync, sign, verify, createPrivateKey, createPublicKey } from 'node:crypto';

/** The questions a person answers with "yes" before signing; `sensitive.checklist` in the config replaces them. */
export const CHECKLIST = [
  'I read every changed line in these files myself (git diff), not only a summary of them.',
  'Every number, rate, limit, rule or legal text comes from the source the spec names, and I checked it there.',
  'The expected values in the tests were worked out by me or come from that source, not from the AI.',
  'No personal or sensitive data goes anywhere docs/company/PRIVACY.md does not say it goes.',
];

export const SIGNOFFS = 'docs/company/SIGNOFFS.md';
export const SIGNERS = 'docs/company/SIGNERS.md';

/**
 * True when `path` (one entry of sensitive.paths) covers the file `f`: a glob as it is written; a plain name also as a folder, so
 * "src/accounts/" and "src/accounts" cover every file under it (as a glob alone, a folder's name matched none of its files, and
 * the gate passed a change to them with no sign-off).
 */
export function coversFile(f, path, matches) {
  const p = String(path).replace(/\\/g, '/').replace(/^\.\//, '');
  return matches(f, [p]) || (!/[*?{}]/.test(p) && f.startsWith(`${p.replace(/\/+$/, '')}/`));
}

/** The changed files that are sensitive (`changed` may hold deleted files: deleting a rule is a change too). */
export const sensitiveFiles = (changed, paths, matches) => [...new Set(changed)].filter((f) => paths.some((p) => coversFile(f, p, matches))).sort();

/** The entries of sensitive.paths that cover none of `files` (the project's files): a typing mistake, or code that is not written yet. */
export const deadPaths = (paths, files, matches) => paths.filter((p) => !files.some((f) => coversFile(f, p, matches)));

/** One short fingerprint of the files' content as they are now (a deleted file counts as empty). Line endings do not count. */
export function fingerprint(files, read) {
  const h = createHash('sha256');
  for (const f of [...files].sort()) h.update(`${f}\0${String(read(f) ?? '').replace(/\r\n/g, '\n')}\0`);
  return h.digest('hex').slice(0, 16);
}

/** A new key pair: the public key (base64, for SIGNERS.md) and the private key (PEM, encrypted with the passphrase). */
export function makeKey(passphrase) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase },
  });
  return { publicKey: publicKey.toString('base64'), privateKey };
}

/** The public key of an encrypted private key, as makeKey gives it; throws when the passphrase is wrong. */
export function publicOf(privateKey, passphrase) {
  return createPublicKey(createPrivateKey({ key: privateKey, passphrase })).export({ type: 'spki', format: 'der' }).toString('base64');
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const toKey = (b64) => ({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' });
const signText = (text, privateKey, passphrase) => sign(null, Buffer.from(text), { key: privateKey, passphrase }).toString('base64');
const checks = (text, signature, publicKey) => {
  try { return B64.test(signature) && verify(null, Buffer.from(text), toKey(publicKey), Buffer.from(signature, 'base64')); } catch { return false; }
};
const rowText = ({ date, who, print }) => `signoff\0${date}\0${who}\0${print}`;
const signerText = ({ who, key }) => `signer\0${who}\0${key}`;

/** The rows of a markdown table whose first cell matches `first`: the trimmed cells after it. */
const rows = (md, first) => String(md ?? '').split('\n').map((l) => l.split('|').map((x) => x.trim()))
  .filter((c) => c.length >= 4 && first.test(c[1] ?? '')).map((c) => c.slice(1, -1));

/** The rows of SIGNOFFS.md: | date | who | fingerprint | files | signature | */
export function parseSignoffs(md) {
  return rows(md, /^\d{4}-\d{2}-\d{2}$/).filter((c) => /^[0-9a-f]{16}$/.test(c[2] ?? ''))
    .map((c) => ({ date: c[0], who: c[1], fingerprint: c[2], files: (c[3] ?? '').split(',').map((x) => x.trim().replace(/`/g, '')).filter(Boolean), signature: c[4] ?? '' }));
}

/** The rows of SIGNERS.md: | who | public key | added | endorsed by | (the key in backticks or bare; "first" for the first signer) */
export function parseSigners(md) {
  return rows(md, /\S/).filter((c) => B64.test((c[1] ?? '').replace(/`/g, '')) && (c[1] ?? '').replace(/`/g, '').length > 40)
    .map((c) => ({ who: c[0], key: c[1].replace(/`/g, ''), added: c[2] ?? '', endorsed: (c[3] ?? '').replace(/`/g, '') }));
}

/** The row `npm run signoff` appends, signed with the signer's private key. */
export function signoffRow({ date, who, print, files, privateKey, passphrase }) {
  const name = String(who).replace(/\|/g, '/');
  return `| ${date} | ${name} | ${print} | ${files.map((f) => `\`${f}\``).join(', ')} | ${signText(rowText({ date, who: name, print }), privateKey, passphrase)} |`;
}

/** A row of SIGNERS.md: the first signer ("first"), or one endorsed by an existing signer's private key. */
export function signerRow({ who, key, date, endorser }) {
  const name = String(who).replace(/\|/g, '/');
  const by = endorser ? signText(signerText({ who: name, key }), endorser.privateKey, endorser.passphrase) : 'first';
  return `| ${name} | \`${key}\` | ${date} | ${by === 'first' ? 'first' : `\`${by}\``} |`;
}

/**
 * The public keys that count: the signers on the branch the change left (`baseSigners`, SIGNERS.md there), and the ones the
 * change adds that one of those endorsed. With none on that branch, nothing counts yet: the first signer goes in on its own.
 */
export function trustedKeys(baseSigners, nowSigners) {
  const base = parseSigners(baseSigners).map((s) => s.key);
  const added = parseSigners(nowSigners).filter((s) => !base.includes(s.key) && base.some((k) => checks(signerText(s), s.endorsed, k)));
  return [...base, ...added.map((s) => s.key)];
}

/** The gate's verdict: { ok, files, print, line }. `baseSigners`/`signers`: SIGNERS.md where the branch left main, and now. */
export function signoffVerdict({ changed, paths, matches, read, signoffs, baseSigners, signers }) {
  const files = sensitiveFiles(changed, paths, matches);
  if (!files.length) return { ok: true, files };
  const print = fingerprint(files, read);
  const keys = trustedKeys(baseSigners, signers);
  const mine = parseSignoffs(signoffs).filter((r) => r.fingerprint === print);
  if (mine.some((r) => keys.some((k) => checks(rowText({ date: r.date, who: r.who, print }), r.signature, k)))) return { ok: true, files, print };
  const why = !keys.length
    ? `${SIGNERS} has no signer yet on the branch this change left: the owner runs npm run signoff -- --init and commits it on main on its own first (node workflow/scripts/session.mjs --commit-notes "Sign-offs: the first signer"; no push needed).\n`
    : mine.length
      ? `${SIGNOFFS} has a row for this version of ${files.join(', ')}, but no signer in ${SIGNERS} signed it: it was not written by npm run signoff.\n`
      : `${files.join(', ')} ${files.length === 1 ? 'is' : 'are'} sensitive (sensitive.paths) and changed without a person's sign-off for this version.\n`;
  return {
    ok: false, files, print,
    line: `${why}The owner checks the change against its source and runs npm run signoff in a terminal (it asks for their passphrase: an agent cannot sign).\n` +
      'Any later edit to these files needs a new sign-off. Read workflow/guides/SENSITIVE.md for what to check.',
  };
}
