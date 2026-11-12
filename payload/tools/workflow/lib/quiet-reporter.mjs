// A test reporter for `node --test` that prints only what failed and one line of totals, so a passing
// run costs a few tokens instead of a line per test (the default prints one line per test).
//   node --test --test-reporter=./tools/workflow/lib/quiet-reporter.mjs
// `npm run test:full` keeps the default, line-per-test output.
const MAX_FAILURES = 40; // a broken import can fail hundreds of tests the same way: show the first, count the rest
const MAX_LINES = 12;    // lines of one failure's message

/** The short text of one failure: the test, where it is, and the head of its error. */
export function failureText(data) {
  const err = data.details?.error;
  const cause = err?.cause ?? err;
  const message = String(cause?.message ?? err?.message ?? 'failed').split('\n').filter((l) => l.trim()).slice(0, MAX_LINES).join('\n    ');
  const where = data.file ? ` (${data.file.replace(/\\/g, '/').replace(/^.*\/(?=tests\/)/, '')}${data.line ? `:${data.line}` : ''})` : '';
  return `FAIL ${data.name}${where}\n    ${message}\n`;
}

export default async function* quietReporter(source) {
  const totals = {};
  let failures = 0;
  for await (const event of source) {
    const data = event.data ?? {};
    if (event.type === 'test:fail') {
      // a file or suite that failed only because a test inside it did is not a failure of its own
      if (data.details?.error?.failureType === 'subtestsFailed') continue;
      failures++;
      if (failures <= MAX_FAILURES) yield failureText(data);
    } else if (event.type === 'test:diagnostic' && !data.nesting) {
      const m = /^(tests|pass|fail|cancelled|skipped|todo|duration_ms) (\S+)/.exec(String(data.message));
      if (m) totals[m[1]] = m[2];
    }
  }
  if (failures > MAX_FAILURES) yield `... and ${failures - MAX_FAILURES} more failures (npm run test:full shows all)\n`;
  const seconds = totals.duration_ms ? ` in ${Math.round(Number(totals.duration_ms) / 1000)} s` : '';
  const extra = ['cancelled', 'skipped', 'todo'].filter((k) => Number(totals[k]) > 0).map((k) => `, ${totals[k]} ${k}`).join('');
  yield `tests: ${totals.pass ?? '?'} passed, ${totals.fail ?? failures} failed${extra}${seconds}\n`;
}
