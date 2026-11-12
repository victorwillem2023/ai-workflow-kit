// The quiet test reporter: a passing run prints one line, a failing one only the failures.
import test from 'node:test';
import assert from 'node:assert/strict';
import quietReporter, { failureText } from '../../tools/workflow/lib/quiet-reporter.mjs';

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

test('a very long failure message is cut to its first lines', () => {
  const text = failureText({ name: 'n', details: { error: { message: Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n') } } });
  assert.equal(text.split('\n').length, 14);
});
