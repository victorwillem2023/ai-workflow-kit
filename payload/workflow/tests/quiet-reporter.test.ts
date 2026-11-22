// The quiet test reporter: a passing run prints one line, a failing one only the failures.
import test from 'node:test';
import assert from 'node:assert/strict';
import quietReporter, { actWarnings, failureText } from '../../workflow/tools/lib/quiet-reporter.mjs';

async function run(events: { type: string; data?: unknown }[]): Promise<string> {
  async function* source() { yield* events; }
  let out = '';
  for await (const chunk of quietReporter(source())) out += chunk;
  return out;
}
const totals = (pass: number, fail: number) => [
  { type: 'test:diagnostic', data: { nesting: 0, message: `tests ${pass + fail}` } },
  { type: 'test:diagnostic', data: { nesting: 0, message: `pass ${pass}` } },
  { type: 'test:diagnostic', data: { nesting: 0, message: `fail ${fail}` } },
  { type: 'test:diagnostic', data: { nesting: 0, message: 'duration_ms 44012.5' } },
];

test('a passing test run prints one line of totals and no line per test', async () => {
  const out = await run([
    { type: 'test:pass', data: { name: 'a', nesting: 0 } },
    { type: 'test:pass', data: { name: 'b', nesting: 0 } },
    { type: 'test:stdout', data: { message: 'noise from a test\n' } },
    ...totals(2, 0),
  ]);
  assert.equal(out, 'tests: 2 passed, 0 failed in 44 s\n');
});

test('React act() warnings are counted in the totals line, never printed', async () => {
  const warn = 'Warning: An update to Panel inside a test was not wrapped in act(...).\nWhen testing, code that causes React state updates should be wrapped into act(...)';
  const out = await run([
    { type: 'test:stderr', data: { file: 'tests/a.test.ts', message: warn } },
    { type: 'test:stderr', data: { file: 'tests/a.test.ts', message: `${warn}\n${warn}` } },
    { type: 'test:pass', data: { name: 'a', nesting: 0 } },
    ...totals(1, 0),
  ]);
  assert.equal(out, 'tests: 1 passed, 0 failed, 3 React act() warnings (npm run test:full shows them) in 44 s\n');
  assert.equal(actWarnings('The current testing environment is not configured to support act(...)'), 1);
  assert.equal(actWarnings('an ordinary line'), 0);
});

test('a failing test is printed with its name, file, line and the head of its message', async () => {
  const out = await run([
    { type: 'test:fail', data: { name: 'loops stay on the band', file: 'C:\\repo\\tests\\select.test.ts', line: 12,
      details: { error: { message: 'wrapper', cause: { message: 'expected 10\nactual 8' } } } } },
    ...totals(5, 1),
  ]);
  assert.match(out, /^FAIL loops stay on the band \(tests\/select\.test\.ts:12\)\n {4}expected 10\n {4}actual 8\n/);
  assert.match(out, /tests: 5 passed, 1 failed in 44 s\n$/);
});

test('a file that failed only because a test inside it did is not reported twice', async () => {
  const out = await run([
    { type: 'test:fail', data: { name: 'inner', details: { error: { message: 'boom' } } } },
    { type: 'test:fail', data: { name: 'tests/x.test.ts', details: { error: { failureType: 'subtestsFailed', message: '1 subtest failed' } } } },
    ...totals(0, 1),
  ]);
  assert.equal(out.match(/^FAIL /gm)?.length, 1);
});

test('hundreds of failures are cut to the first 40 with a count of the rest', async () => {
  const many = Array.from({ length: 45 }, (_, i) => ({ type: 'test:fail', data: { name: `t${i}`, details: { error: { message: 'x' } } } }));
  const out = await run([...many, ...totals(0, 45)]);
  assert.equal(out.match(/^FAIL /gm)?.length, 40);
  assert.match(out, /and 5 more failures/);
});

test('a very long failure message keeps its first lines and its last ones, where a command\'s error is', () => {
  const text = failureText({ name: 'n', details: { error: { message: Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n') } } });
  assert.equal(text.split('\n').length, 14);
  assert.match(text, /line 0\n {4}line 1\n {4}line 2\n {4}\.\.\. \(39 lines left out\)\n {4}line 42\n/);
  assert.match(text, /line 49\n$/, 'the last line, where the error is, is kept');
  // a --finish that failed after squashing: its progress first, the reason last (the session test that once failed this way)
  const finish = ['Squashed 2 commits into one: Plans: b and c', 'npm run test …', '> test', '> node check.cjs',
    ...Array.from({ length: 12 }, (_, i) => `check output ${i}`), 'Error: the folder could not be removed: EBUSY'].join('\n');
  assert.match(failureText({ name: 'f', details: { error: { message: finish } } }), /EBUSY/);
});

test('a file that fails with no test of its own failing shows its exit code and the last lines it wrote to stderr', async () => {
  const out = await run([
    { type: 'test:stderr', data: { file: 'tests/notes.test.ts', message: 'EBUSY: resource busy or locked, rmdir session ~x\n' } },
    { type: 'test:pass', data: { file: process.cwd() + '/tests/notes.test.ts', name: 'a test inside it' } },
    { type: 'test:fail', data: { file: process.cwd() + '/tests/notes.test.ts', name: 'tests/notes.test.ts', details: { error: { message: 'test failed', exitCode: 1 } } } },
    ...totals(1, 1),
  ]);
  assert.match(out, /FAIL tests\/notes\.test\.ts[^\n]*\n {4}test failed \(exit code 1\)\n {4}its stderr:\n {4}EBUSY: resource busy or locked/);
});
