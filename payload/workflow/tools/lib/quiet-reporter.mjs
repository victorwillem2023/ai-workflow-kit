// A test reporter for `node --test` that prints only what failed and one line of totals, so a passing
// run costs a few tokens instead of a line per test (the default prints one line per test).
//   node --test --test-reporter=./workflow/tools/lib/quiet-reporter.mjs
// `npm run test:full` keeps the default, line-per-test output; `npm run test:one -- <file>` runs one file through this one.
// React's act() warnings (a test that lets a state update happen outside act) are counted in the totals line, never printed:
// the default output prints each in full, dozens of lines a run, and a count still shows that a change added one.
// With WORKFLOW_TEST_RESULTS set (the gate sets it) it also writes there which files failed, { failed: [file] }, so the gate keeps
// the passes of a failed run and sees a flaky file (lib/testcache.mjs).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MAX_FAILURES = 40; // a broken import can fail hundreds of tests the same way: show the first, count the rest
const MAX_LINES = 12;    // lines of one failure's message

/**
 * A long message cut to MAX_LINES: its first lines and its last ones. The last ones matter most: a test that asserts a
 * command's output prints the command's progress first and its error last ("Squashed 2 commits ... npm run test ..." and
 * only then what broke), so keeping only the head cut away exactly the cause.
 */
export function shortMessage(text) {
  const lines = String(text).split('\n').filter((l) => l.trim());
  if (lines.length <= MAX_LINES) return lines;
  const head = 3;
  const tail = MAX_LINES - head - 1;
  return [...lines.slice(0, head), `... (${lines.length - head - tail} lines left out)`, ...lines.slice(-tail)];
}

/** The short text of one failure: the test, where it is, and its error (head and tail when it is long). */
export function failureText(data) {
  const err = data.details?.error;
  const cause = err?.cause ?? err;
  const message = shortMessage(cause?.message ?? err?.message ?? 'failed').join('\n    ');
  const where = data.file ? ` (${data.file.replace(/\\/g, '/').replace(/^.*\/(?=tests\/)/, '')}${data.line ? `:${data.line}` : ''})` : '';
  return `FAIL ${data.name}${where}\n    ${message}\n`;
}

/**
 * A whole file that failed with no test of its own failing ("test failed": a hook, an error after the tests, a process that
 * exited non-zero) says nothing by itself: its exit code and the last lines it wrote to stderr say why.
 */
export function fileFailureText(data, stderr = '') {
  const err = data.details?.error;
  const code = err?.exitCode ?? err?.cause?.exitCode;
  const tail = String(stderr).split(/\r?\n/).filter((l) => l.trim()).slice(-MAX_LINES).join('\n    ');
  return `${failureText(data).trimEnd()}${code != null ? ` (exit code ${code})` : ''}${tail ? `\n    its stderr:\n    ${tail}` : ''}\n`;
}

/** How many of React's act() warnings a piece of a test file's stderr holds. */
export const actWarnings = (text) => (String(text).match(/not wrapped in act\(|not configured to support act\(/g) ?? []).length;

export default async function* quietReporter(source) {
  let acts = 0;
  const totals = {};
  const stderr = new Map(); // file -> what it wrote to stderr, for a file that fails as a whole
  // (its stderr names the file as it was given, its failure by the full path: one key for both)
  const key = (f) => resolve(f).replace(/\\/g, '/').toLowerCase();
  let failures = 0;
  const failedFiles = new Set();
  for await (const event of source) {
    const data = event.data ?? {};
    if (event.type === 'test:stderr') acts += actWarnings(data.message);
    if (event.type === 'test:stderr' && data.file) stderr.set(key(data.file), `${stderr.get(key(data.file)) ?? ''}${data.message ?? ''}`.slice(-8000));
    if (event.type === 'test:fail') {
      if (data.file) failedFiles.add(data.file);
      // a file or suite that failed only because a test inside it did is not a failure of its own
      if (data.details?.error?.failureType === 'subtestsFailed') continue;
      failures++;
      const wholeFile = data.file && data.name && data.name.replace(/\\/g, '/').endsWith(data.file.replace(/\\/g, '/').split('/').pop());
      if (failures <= MAX_FAILURES) yield wholeFile ? fileFailureText(data, stderr.get(key(data.file))) : failureText(data);
    } else if (event.type === 'test:diagnostic' && !data.nesting) {
      const m = /^(tests|pass|fail|cancelled|skipped|todo|duration_ms) (\S+)/.exec(String(data.message));
      if (m) totals[m[1]] = m[2];
    }
  }
  if (process.env.WORKFLOW_TEST_RESULTS) {
    try { writeFileSync(process.env.WORKFLOW_TEST_RESULTS, JSON.stringify({ failed: [...failedFiles] })); } catch { /* the gate then keeps nothing new */ }
  }
  if (failures > MAX_FAILURES) yield `... and ${failures - MAX_FAILURES} more failures (npm run test:full shows all)\n`;
  const seconds = totals.duration_ms ? ` in ${Math.round(Number(totals.duration_ms) / 1000)} s` : '';
  const extra = ['cancelled', 'skipped', 'todo'].filter((k) => Number(totals[k]) > 0).map((k) => `, ${totals[k]} ${k}`).join('');
  const react = acts ? `, ${acts} React act() warning${acts === 1 ? '' : 's'} (npm run test:full shows them)` : '';
  yield `tests: ${totals.pass ?? '?'} passed, ${totals.fail ?? failures} failed${extra}${react}${seconds}\n`;
}
