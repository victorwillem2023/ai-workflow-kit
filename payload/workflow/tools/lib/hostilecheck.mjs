// Hostile-input check: from a diff, finds added code in the input folders (config security.inputFolders) that reads input, and
// whether the diff also adds a test whose name says what is refused. Advice only; it looks at names, never judges the test.
import { addedLines } from './securityscan.mjs';
import { addsRoute, testSpeaksFor } from './routes.mjs';

const DEFAULT_FOLDERS = ['src/core/', 'src/server/'];
const READS = /\bJSON\.parse\(|\breadFile(?:Sync)?\(|\bfetch\(|\bhttpClient\.\w+\(|\.formData\(|\.arrayBuffer\(|\.text\(\)|\.json\(\)|\breq(?:uest)?\.(?:url|body|headers)\b|\bfor\s+await\s*\(\s*(?:const|let)\s+\w+\s+of\s+req(?:uest)?\b/;
const TEST_NAME = /\b(?:it|test)\s*\(\s*(['"`])(.*?)\1/;
const REFUSAL = /refuses|rejects|caps|too large|hostile/i;

/** The test files the change adds a refusal test to: [[file, lines]], each with an added test named for what it refuses. */
function refusalTests(added) {
  return [...added].filter(([file, lines]) => /(?:^|\/)tests?\/.*\.test\.[mc]?[tj]sx?$/.test(file)
    && lines.some((l) => { const m = TEST_NAME.exec(l); return m && REFUSAL.test(m[2]); }));
}

/**
 * The advice lines for a diff (it must include the tests folder): one per input-reading file (in an input folder, or a route
 * anywhere: lib/routes.mjs) that no added refusal test speaks for (named after it, or importing it).
 */
export function hostileAdvice(diff, extra = new Map(), security = {}) {
  const folders = security.inputFolders ?? DEFAULT_FOLDERS;
  const added = addedLines(diff);
  for (const [f, lines] of extra) added.set(f, [...(added.get(f) ?? []), ...lines]);
  const tests = refusalTests(added);
  return [...added].sort(([a], [b]) => a.localeCompare(b))
    .filter(([file, lines]) => /\.(?:ts|tsx|mjs|js)$/.test(file) && !/(?:^|\/)tests?\//.test(file)
      && (folders.some((d) => file.startsWith(d)) || addsRoute(file, lines, security.server))
      && lines.some((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l) && READS.test(l)))
    .filter(([file]) => !tests.some(([t, lines]) => testSpeaksFor(file, t, lines)))
    .map(([file]) => `advice: ${file} reads input but no new test says what it refuses`);
}
