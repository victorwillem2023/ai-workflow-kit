// The human sign-off for sensitive files (money, health, legal texts, personal data): a change to a file under
// `sensitive.paths` in workflow/config.json passes the gate only when docs/company/SIGNOFFS.md holds a row whose fingerprint is the
// fingerprint of those files as they are now, sealed by `npm run signoff`. Only a person at a terminal can run it, so a model cannot
// approve its own work; any later edit to those files changes the fingerprint and needs a new sign-off.
// The seal: an HMAC of the row made with a key kept in git's own folder (workflow-signoff.key, never committed, made by the first
// sign-off on this computer). A row written by hand, by a shell append or by an agent has no seal that checks out, and the gate
// refuses it; the stop-point hook also refuses an agent's shell command that writes the record or reads the key. On a computer
// without the key (GitHub's runners, a second clone) the gate can only see that the row is sealed, and says so.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** The questions a person answers with "yes" before signing; `sensitive.checklist` in the config replaces them. */
export const CHECKLIST = [
  'I read every changed line in these files myself (git diff), not only a summary of them.',
  'Every number, rate, limit, rule or legal text comes from the source the spec names, and I checked it there.',
  'The expected values in the tests were worked out by me or come from that source, not from the AI.',
  'No personal or sensitive data goes anywhere docs/company/PRIVACY.md does not say it goes.',
];

/** The key's file name in git's own folder (`git rev-parse --git-common-dir`). */
export const KEY_FILE = 'workflow-signoff.key';

/** The changed files that are sensitive (`changed` may hold deleted files: deleting a rule is a change too). */
export const sensitiveFiles = (changed, paths, matches) => [...new Set(changed)].filter((f) => matches(f, paths)).sort();

/** One short fingerprint of the files' content as they are now (a deleted file counts as empty). Line endings do not count. */
export function fingerprint(files, read) {
  const h = createHash('sha256');
  for (const f of [...files].sort()) h.update(`${f}\0${String(read(f) ?? '').replace(/\r\n/g, '\n')}\0`);
  return h.digest('hex').slice(0, 16);
}

/** The seal of one row: the HMAC of its date, who and fingerprint with this computer's key. */
export const seal = (key, { date, who, print }) => createHmac('sha256', String(key)).update(`${date}\0${who}\0${print}`).digest('hex').slice(0, 24);

/** The rows of docs/company/SIGNOFFS.md: | date | who | fingerprint | files | seal | */
export function parseSignoffs(md) {
  const out = [];
  for (const line of String(md ?? '').split('\n')) {
    const c = line.split('|').map((x) => x.trim());
    if (c.length < 6 || !/^\d{4}-\d{2}-\d{2}$/.test(c[1]) || !/^[0-9a-f]{16}$/.test(c[3])) continue;
    const sealed = /^[0-9a-f]{24}$/.test(c[5] ?? '') ? c[5] : null;
    out.push({ date: c[1], who: c[2], fingerprint: c[3], files: c[4].split(',').map((x) => x.trim().replace(/`/g, '')).filter(Boolean), seal: sealed });
  }
  return out;
}

/** The row `npm run signoff` appends (with the seal made from `key`). */
export const signoffRow = ({ date, who, print, files, key }) => {
  const name = String(who).replace(/\|/g, '/');
  return `| ${date} | ${name} | ${print} | ${files.map((f) => `\`${f}\``).join(', ')} | ${seal(key, { date, who: name, print })} |`;
};

const sealOk = (row, key) => {
  if (!row.seal) return false;
  if (key == null) return true; // no key on this computer: only that it is sealed can be seen
  const want = Buffer.from(seal(key, { date: row.date, who: row.who, print: row.fingerprint }));
  return want.length === row.seal.length && timingSafeEqual(want, Buffer.from(row.seal));
};

/** The gate's verdict: { ok, files, print, line, unchecked }. `key` is this computer's key, or null where there is none. */
export function signoffVerdict({ changed, paths, matches, read, signoffs, key = null }) {
  const files = sensitiveFiles(changed, paths, matches);
  if (!files.length) return { ok: true, files };
  const print = fingerprint(files, read);
  const rows = parseSignoffs(signoffs).filter((r) => r.fingerprint === print);
  if (rows.some((r) => sealOk(r, key))) return { ok: true, files, print, unchecked: key == null };
  const forged = rows.length > 0;
  return {
    ok: false, files, print,
    line: (forged
      ? `docs/company/SIGNOFFS.md has a row for this version of ${files.join(', ')}, but its seal is missing or does not check out: it was not written by npm run signoff on this computer.\n`
      : `${files.join(', ')} ${files.length === 1 ? 'is' : 'are'} sensitive (sensitive.paths) and changed without a person's sign-off for this version.\n`) +
      'The owner checks the change against its source and runs npm run signoff in a terminal (an agent cannot: it needs a person typing).\n' +
      'Any later edit to these files needs a new sign-off. Read workflow/guides/SENSITIVE.md for what to check.',
  };
}
