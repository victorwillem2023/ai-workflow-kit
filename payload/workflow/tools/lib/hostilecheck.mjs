// Hostile-input check: from a diff, finds added code in the input folders (config security.inputFolders) that reads input, and
// whether the diff also adds a test whose name says what is refused. Advice only; it looks at names, never judges the test.
import { addedLines } from './securityscan.mjs';

const DEFAULT_FOLDERS = ['src/core/', 'src/server/'];
const READS = /\bJSON\.parse\(|\breadFile(?:Sync)?\(|\bfetch\(|\bhttpClient\.\w+\(|\.formData\(|\.arrayBuffer\(|\.text\(\)|\.json\(\)|\breq(?:uest)?\.(?:url|body|headers)\b|\bfor\s+await\s*\(\s*(?:const|let)\s+\w+\s+of\s+req(?:uest)?\b/;
const TEST_NAME = /\b(?:it|test)\s*\(\s*(['"`])(.*?)\1/;
const REFUSAL = /refuses|rejects|caps|too large|hostile/i;

/** True when an added line in a test file opens a test named for what it refuses. */
function addsRefusalTest(added) {
  for (const [file, lines] of added) {
    if (!/^tests\/.*\.test\.[mc]?[tj]s$/.test(file)) continue;
    for (const l of lines) { const m = TEST_NAME.exec(l); if (m && REFUSAL.test(m[2])) return true; }
  }
  return false;
}

/** The advice lines for a diff (it must include the tests folder): one per input-reading file, none if a refusal test was added. */
export function hostileAdvice(diff, extra = new Map(), security = {}) {
  const folders = security.inputFolders ?? DEFAULT_FOLDERS;
  const added = addedLines(diff);
  for (const [f, lines] of extra) added.set(f, [...(added.get(f) ?? []), ...lines]);
  if (addsRefusalTest(added)) return [];
  return [...added].sort(([a], [b]) => a.localeCompare(b))
    .filter(([file, lines]) => folders.some((d) => file.startsWith(d)) && /\.(?:ts|tsx|mjs|js)$/.test(file) && lines.some((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l) && READS.test(l)))
    .map(([file]) => `advice: ${file} reads input but no new test says what it refuses`);
}
