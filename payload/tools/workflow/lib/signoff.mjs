// The human sign-off for sensitive files (money, health, legal texts, personal data): a change to a file under
// `sensitive.paths` in workflow.config.json passes the gate only when docs/SIGNOFFS.md holds a row whose fingerprint is the
// fingerprint of those files as they are now. `npm run signoff` writes the row, and only a person at a terminal can run it,
// so a model cannot approve its own work; any later edit to those files changes the fingerprint and needs a new sign-off.
import { createHash } from 'node:crypto';

/** The questions a person answers with "yes" before signing; `sensitive.checklist` in the config replaces them. */
export const CHECKLIST = [
  'I read every changed line in these files myself (git diff), not only a summary of them.',
  'Every number, rate, limit, rule or legal text comes from the source the spec names, and I checked it there.',
  'The expected values in the tests were worked out by me or come from that source, not from the AI.',
  'No personal or sensitive data goes anywhere docs/PRIVACY.md does not say it goes.',
];

/** The changed files that are sensitive (`changed` may hold deleted files: deleting a rule is a change too). */
export const sensitiveFiles = (changed, paths, matches) => [...new Set(changed)].filter((f) => matches(f, paths)).sort();

/** One short fingerprint of the files' content as they are now (a deleted file counts as empty). Line endings do not count. */
export function fingerprint(files, read) {
  const h = createHash('sha256');
  for (const f of [...files].sort()) h.update(`${f}\0${String(read(f) ?? '').replace(/\r\n/g, '\n')}\0`);
  return h.digest('hex').slice(0, 16);
}

/** The rows of docs/SIGNOFFS.md: | date | who | fingerprint | files | */
export function parseSignoffs(md) {
  const out = [];
  for (const line of String(md ?? '').split('\n')) {
    const c = line.split('|').map((x) => x.trim());
    if (c.length < 6 || !/^\d{4}-\d{2}-\d{2}$/.test(c[1]) || !/^[0-9a-f]{16}$/.test(c[3])) continue;
    out.push({ date: c[1], who: c[2], fingerprint: c[3], files: c[4].split(',').map((x) => x.trim().replace(/`/g, '')).filter(Boolean) });
  }
  return out;
}

/** The row `npm run signoff` appends. */
export const signoffRow = ({ date, who, print, files }) => `| ${date} | ${String(who).replace(/\|/g, '/')} | ${print} | ${files.map((f) => `\`${f}\``).join(', ')} |`;

/** The gate's verdict: { ok, files, print, line }. */
export function signoffVerdict({ changed, paths, matches, read, signoffs }) {
  const files = sensitiveFiles(changed, paths, matches);
  if (!files.length) return { ok: true, files };
  const print = fingerprint(files, read);
  if (parseSignoffs(signoffs).some((r) => r.fingerprint === print)) return { ok: true, files, print };
  return {
    ok: false, files, print,
    line: `${files.join(', ')} ${files.length === 1 ? 'is' : 'are'} sensitive (sensitive.paths) and changed without a person's sign-off for this version.\n` +
      'The owner checks the change against its source and runs npm run signoff in a terminal (an agent cannot: it needs a person typing).\n' +
      'Any later edit to these files needs a new sign-off. Read docs/SENSITIVE.md for what to check.',
  };
}
