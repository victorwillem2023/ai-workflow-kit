// The data and permission checks on a change (no I/O here; why: workflow/guides/DATA.md and workflow/guides/PERMISSIONS.md):
// - a migration that was there before this change and is edited, renamed or deleted: it has run somewhere, so it never changes;
// - SQL text built from a value (a filled-in or joined string) where a parameter belongs: advice;
// - a new server route with no new test named for who is refused, in an app with sign-in (`security.signIn`): advice.
// TypeScript, JavaScript, Python, Go and Rust; the advice never fails the gate.
import { addedLines } from './securityscan.mjs';
import { addsRoute, CLIENT_FOLDERS, testSpeaksFor } from './routes.mjs';

/** The migrations a change edits, renames or deletes: [{ file, how }], from `git diff --name-status -M <base>`. */
export function editedMigrations(nameStatus, globs, matches) {
  const how = { M: 'changed', T: 'changed', D: 'deleted', R: 'renamed' };
  return String(nameStatus).split('\n').map((l) => l.split('\t')).filter(([s, f]) => how[s?.[0]] && f && matches(f, globs))
    .map(([s, f]) => ({ file: f, how: how[s[0]] }));
}

const SHAPE = String.raw`(?:\bSELECT\b[^\n]{0,300}?\bFROM\b|\bINSERT\s+INTO\b|\bUPDATE\b[^\n]{0,300}?\bSET\b|\bDELETE\s+FROM\b)`;
// a later line of a query written over several lines ("WHERE id = " + id): only in capitals, so plain text is left alone
const CLAUSE = String.raw`\b(?:WHERE|VALUES|AND|ORDER BY|LIMIT)\b`;
const JOINED = new RegExp(`["'][^"'\\n]*(?:${SHAPE}|${CLAUSE})[^"'\\n]*["']\\s*\\+\\s*[\\w(]`);
const BY_LANGUAGE = [
  [/\.(?:[mc]?[jt]sx?)$/, [JOINED]],
  [/\.py$/, [JOINED, new RegExp(`\\bf(?:"""|'''|"|')[^\\n]*?(?:${SHAPE}|${CLAUSE})[^\\n]*\\{[^}\\n]+\\}`, 'i'), new RegExp(`${SHAPE}[^\\n]*["']\\s*(?:\\.format\\(|%\\s*[\\w(])`, 'i')]],
  [/\.go$/, [JOINED, new RegExp(`Sprintf\\(\\s*["\`][^"\`\\n]*${SHAPE}[^"\`\\n]*%[svdq]`, 'i')]],
  [/\.rs$/, [new RegExp(`format!\\(\\s*"[^"\\n]*${SHAPE}[^"\\n]*\\{`, 'i')]],
];
const TESTS = /(?:^|\/)tests?\/|\.test\.|_test\.|(?:^|\/)test_/;
const COMMENT = /^\s*(?:\/\/|\*|\/\*|#)/;
// a name from a fixed list in the code (a column to sort by) may be filled in: the line or the query says so
const WAIVED = /fixed list/i;

/** True when a JavaScript or TypeScript text fills a value into SQL in a plain template (a tagged one, sql`...`, passes parameters). */
function templateSql(text) {
  // (a query in a template usually runs over several lines, so SELECT and FROM may be lines apart)
  const shape = new RegExp(SHAPE.replaceAll('[^\\n]', '[^`]'), 'i');
  for (const m of text.matchAll(/([\w$.\])]?)`([^`]*)`/g)) {
    if (m[1] || !m[2].includes('${') || !shape.test(m[2])) continue;
    // the waiver may stand in the query or in a comment after it, on the line where it ends
    const lineEnd = text.indexOf('\n', m.index + m[0].length);
    if (!WAIVED.test(text.slice(m.index, lineEnd < 0 ? undefined : lineEnd))) return true;
  }
  return false;
}

/** The advice lines for SQL built from a value: one per file; `added` is file -> its added lines. */
export function sqlAdvice(added) {
  const out = [];
  for (const [file, all] of [...added].sort(([a], [b]) => a.localeCompare(b))) {
    const patterns = BY_LANGUAGE.find(([ext]) => ext.test(file))?.[1];
    if (!patterns || TESTS.test(file)) continue;
    const lines = all.filter((l) => !COMMENT.test(l));
    const hit = lines.some((l) => !WAIVED.test(l) && patterns.some((re) => re.test(l))) || (/\.(?:[mc]?[jt]sx?)$/.test(file) && templateSql(lines.join('\n')));
    if (hit) out.push(`advice: ${file} builds SQL text from a value: pass it as a parameter (a name from a fixed list: say "fixed list" in a comment on that line). workflow/guides/DATA.md, *Queries*`);
  }
  return out;
}

const WHO = /signed[\s_-]?out|not[\s_]signed[\s_]in|without[\s_](?:a[\s_])?(?:session|sign-?in)|another[\s_]?(?:user|customer|account|tenant)|someone[\s_]?else|other[\s_]?(?:user|customer|tenant)|anonymous/i;

/**
 * The advice lines for routes added without a test that says who is refused: one per file that adds a route (lib/routes.mjs, the
 * same routes as the security advice), none for a file an added test speaks for (named after it, or importing it) with a name
 * for a signed-out caller or another user's thing. One such test elsewhere in the change does not quiet the others.
 */
export function permissionAdvice(added, security = {}) {
  if (!security.signIn) return [];
  const server = security.server ?? 'src/server/';
  const tests = [...added].filter(([f, lines]) => TESTS.test(f) && lines.some((l) => WHO.test(l)));
  return [...added].sort(([a], [b]) => a.localeCompare(b))
    .filter(([f, lines]) => !TESTS.test(f) && addsRoute(f, lines, server, security.clientFolders ?? CLIENT_FOLDERS))
    .filter(([f]) => !tests.some(([t, lines]) => testSpeaksFor(f, t, lines)))
    .map(([f]) => `advice: ${f} adds a route but no new test says who is refused (signed out, another user's id): workflow/guides/PERMISSIONS.md, *Tests*`);
}

/** Both advice lists for a diff, as the gate's other advice takes it: the diff text, the new files git does not know yet, the config. */
export function dataAdvice(diff, extra = new Map(), config = {}) {
  const added = addedLines(diff);
  for (const [f, lines] of extra) added.set(f, [...(added.get(f) ?? []), ...lines]);
  return [...sqlAdvice(added), ...permissionAdvice(added, config.security)];
}
