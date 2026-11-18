// Flaky tests are seen, not retried away: the gate keeps passes file by file after a failed run (lib/testcache.mjs), lists a
// file that failed and then passed with the same code, flags a test that waits a fixed time (lib/waits.mjs) and shares the cores
// with the other gates running tests (lib/testload.mjs). The phase also says how much ceremony a card gets (lib/levels.mjs, the
// CLAUDE.md phase block in lib/docblocks.mjs).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { afterRun, CLEAR_AFTER, failedFiles, failureOf, flakyCard, flakyLines, readRecord, updateFlaky } from '../../workflow/tools/lib/testcache.mjs';
import { addedLineNumbers, fixedWaits } from '../../workflow/tools/lib/waits.mjs';
import { concurrencyOption, shareOfCores } from '../../workflow/tools/lib/testload.mjs';
import { needs, readLevels, levelOf } from '../../workflow/tools/lib/levels.mjs';
import { bare, bigDocs, phaseBlock } from '../../workflow/tools/lib/docblocks.mjs';

const keys = { 'tests/a.test.ts': 'k1', 'tests/b.test.ts': 'k2' };
const ran = Object.keys(keys);

describe('a failed run keeps what passed', () => {
  it('reads the record before kit 4.3 (the passed map alone) and after it', () => {
    assert.deepEqual(readRecord('{"tests/a.test.ts":"k1"}'), { passed: { 'tests/a.test.ts': 'k1' }, failed: {} });
    assert.deepEqual(readRecord('{"passed":{},"failed":{"x":"k"}}'), { passed: {}, failed: { x: { key: 'k', failure: '' } } }, 'a failure kept before its output was');
    assert.deepEqual(readRecord('not json'), { passed: {}, failed: {} });
  });
  it('keeps the passing file and notes the failing one with what it said, so a second attempt runs only that one', () => {
    const out = 'FAIL saves the plan (tests/b.test.ts:12)\n    expected 2\n    actual 1\nFAIL other (tests/c.test.ts:3)\n    nope\ntests: 1 passed, 2 failed';
    const { record, flaky } = afterRun(readRecord(null), ran, keys, ['tests/b.test.ts'], false, out);
    assert.deepEqual(record, { passed: { 'tests/a.test.ts': 'k1' }, failed: { 'tests/b.test.ts': { key: 'k2', failure: 'FAIL saves the plan (tests/b.test.ts:12)\n    expected 2\n    actual 1' } } });
    assert.deepEqual(flaky, []);
  });
  it('a file that failed and now passes with the same key is flaky, with its old failure; with another key it was fixed', () => {
    const before = { passed: { 'tests/a.test.ts': 'k1' }, failed: { 'tests/b.test.ts': { key: 'k2', failure: 'boom' } } };
    const again = afterRun(before, ['tests/b.test.ts'], keys, [], true);
    assert.deepEqual(again.flaky, [{ file: 'tests/b.test.ts', key: 'k2', failure: 'boom' }]);
    assert.deepEqual(again.passedNow, ['tests/b.test.ts']);
    assert.deepEqual(afterRun(before, ['tests/b.test.ts'], keys, ['tests/b.test.ts'], false, 'FAIL x (tests/b.test.ts:4)\n    late').failedNow,
      { 'tests/b.test.ts': 'FAIL x (tests/b.test.ts:4)\n    late' });
    assert.deepEqual(afterRun(before, ['tests/b.test.ts'], { 'tests/b.test.ts': 'k3' }, [], true).flaky, []);
  });
  it('a file in a batch that never ran is neither passed nor failed', () => {
    // the gate stops at the first failing batch of 300: only the files of the batches that ran are given
    const { record } = afterRun(readRecord(null), ['tests/a.test.ts'], keys, ['tests/a.test.ts'], false, 'FAIL x (tests/a.test.ts:1)');
    assert.equal(record.passed['tests/b.test.ts'], undefined);
  });
  it('a file that could not start keeps the output\'s last lines (a missing command says the computer changed)', () => {
    assert.equal(failureOf('line 1\nError: Cannot find module tsx\n', 'tests/b.test.ts'), 'line 1\nError: Cannot find module tsx');
  });
  it('a failed run whose runner did not say which files failed keeps nothing new', () => {
    const before = readRecord(null);
    assert.deepEqual(afterRun(before, ran, keys, null, false).record, before);
    assert.deepEqual(afterRun(before, ran, keys, [], false).record, before);
  });
  it('matches the runner\'s file names (absolute, either slash, any case) to the picked files', () => {
    assert.deepEqual(failedFiles(['C:\\Repo\\tests\\b.test.ts'], 'c:/repo', ran), ['tests/b.test.ts']);
    assert.deepEqual(failedFiles(['./tests/a.test.ts'], '/x', ran), ['tests/a.test.ts']);
  });
});

describe('the flaky list', () => {
  it('one pass proves nothing: it clears only after ten passes in a row, and a failure starts the count again', () => {
    const yes = () => true;
    const f = 'tests/b.test.ts';
    const seen = { file: f, key: 'k2', failure: 'FAIL x (tests/b.test.ts:1)\n    expected 2' };
    let list = updateFlaky({}, [seen], [], {}, yes, '2026-11-18');
    assert.deepEqual(list, { [f]: { since: '2026-11-18', failure: seen.failure, passes: 0 } });
    assert.equal(updateFlaky(list, [seen], [], {}, yes, '2026-11-20')[f].since, '2026-11-18', 'keeps its first date');
    assert.deepEqual(updateFlaky(list, [], [], {}, yes, '2026-11-20'), list, 'not run: stays as it is');
    // nine passes, in whichever session and under whichever code: still listed
    for (let i = 0; i < CLEAR_AFTER - 1; i++) list = updateFlaky(list, [], [f], {}, yes, '2026-11-20');
    assert.equal(list[f].passes, CLEAR_AFTER - 1);
    const failedAgain = updateFlaky(list, [], [], { [f]: 'FAIL x (tests/b.test.ts:1)\n    timed out' }, yes, '2026-11-21');
    assert.deepEqual([failedAgain[f].passes, failedAgain[f].failure], [0, 'FAIL x (tests/b.test.ts:1)\n    timed out'], 'back to nought, with the newest failure');
    assert.deepEqual(updateFlaky(list, [], [f], {}, yes, '2026-11-21'), {}, 'the tenth pass in a row clears it');
    assert.deepEqual(updateFlaky(list, [], [], {}, () => false, '2026-11-20'), {}, 'the file is gone');
  });
  it('says what failed and how far it is from clearing, and the card carries the whole failure', () => {
    const list = { 'tests/b.test.ts': { since: '2026-11-18', passes: 3, failure: 'FAIL x (tests/b.test.ts:1)\n    expected 2' } };
    const line = flakyLines(list, () => '.git/workflow-flaky/tests-b.test.ts.md')[0];
    assert.match(line, /^flaky: tests\/b\.test\.ts .*since 2026-11-18; 3 of 10 passes in a row clear it\): expected 2\..*--add "Flaky test: tests\/b\.test\.ts" --label bug --body-file \.git\/workflow-flaky\/tests-b\.test\.ts\.md$/);
    assert.match(flakyCard('tests/b.test.ts', list['tests/b.test.ts']), /```\nFAIL x \(tests\/b\.test\.ts:1\)\n {4}expected 2\n```/);
  });
});

describe('fixed waits in tests', () => {
  it('flags a wait of a fixed number of milliseconds, in each language it reads', () => {
    const text = ['await new Promise((r) => setTimeout(r, 20));', 'await new Promise((r) => setTimeout(() => r(), 30));', 'await sleep(50);',
      'setTimeout(r, 0);', 'clock.tick(20);', 'await waitFor(() => screen.getByText("Saved"));', 'await sleep(100); // wait-ok: the rate limit is real'].join('\n');
    assert.deepEqual(fixedWaits('tests/x.test.ts', text).map((f) => f.line), [1, 2, 3]);
    assert.deepEqual(fixedWaits('tests/test_x.py', 'time.sleep(0.05)\ntime.sleep(0)\n').map((f) => f.line), [1]);
    assert.deepEqual(fixedWaits('x_test.go', 'time.Sleep(10 * time.Millisecond)').map((f) => f.line), [1]);
    assert.deepEqual(fixedWaits('README.md', 'setTimeout(r, 20)'), []);
  });
  it('knows the added lines by number: one new wait among six of the same is one finding', () => {
    const diff = ['diff --git a/tests/x.test.ts b/tests/x.test.ts', '--- a/tests/x.test.ts', '+++ b/tests/x.test.ts',
      '@@ -4,0 +5 @@ b', '+setTimeout(r, 20);', '@@ -9 +10,2 @@', '-old', '+new', '+newer', '@@ -12,1 +13,0 @@', '-gone'].join('\n');
    assert.deepEqual([...(addedLineNumbers(diff).get('tests/x.test.ts') ?? [])], [5, 10, 11]);
  });
});

describe('gates share the cores', () => {
  it('takes its share when others run tests, at least one', () => {
    assert.equal(shareOfCores(16, 0), 16);
    assert.equal(shareOfCores(16, 3), 4);
    assert.equal(shareOfCores(4, 9), 1);
  });
  it('caps node --test by itself; another runner only when the config says how', () => {
    assert.equal(concurrencyOption({ testFiles: 'node --import tsx --test --test-reporter=x' }), '--test-concurrency={n}');
    assert.equal(concurrencyOption({ testFiles: 'npx vitest run' }), null);
    assert.equal(concurrencyOption({ testFiles: 'npx vitest run', testConcurrency: '--maxWorkers={n}' }), '--maxWorkers={n}');
    assert.equal(concurrencyOption({ testFiles: 'node --test', testConcurrency: '' }), null);
  });
});

describe('the phase sets the ceremony', () => {
  it('a prototype reviews only large cards and lets the guide and app map wait; pilot and production keep them in the card', () => {
    const proto = readLevels('{ "phase": "prototype" }').process;
    assert.equal(needs(proto.review, 'medium'), false);
    assert.equal(needs(proto.review, 'large'), true);
    assert.equal(needs(proto.upkeep, 'large'), false);
    for (const phase of ['pilot', 'production']) {
      const p = readLevels(`{ "phase": "${phase}" }`).process;
      assert.equal(needs(p.review, 'medium'), true, phase);
      assert.equal(needs(p.upkeep, 'small'), true, phase);
    }
  });
  it('fixed waits advise in a prototype and fail from pilot', () => {
    assert.equal(levelOf(readLevels('{ "phase": "prototype" }'), 'waits'), 'advise');
    assert.equal(levelOf(readLevels('{ "phase": "pilot" }'), 'waits'), 'fail');
  });
  it('CLAUDE.md says in full words which code rules are advice in this phase, and that a step is fine in a prototype', () => {
    const proto = phaseBlock('{ "phase": "prototype" }');
    assert.match(proto, /^\*\*Phase: prototype\*\* .*The size rules below \(1, 2, 3 and 5\) are advice in this phase, not a stop: a file in the baseline may grow/);
    assert.match(proto, /A spec and a fresh review for large cards\. The user guide and the app map wait for one `\/docs catch-up` pass/);
    assert.match(proto, /A step toward the end state is fine \(rule 6\)/);
    assert.match(phaseBlock('{ "phase": "pilot" }'), /A spec for large cards, a fresh review for medium cards and up\. Every card keeps the user guide and the app map up\.$/);
    const prod = phaseBlock(null);
    assert.match(prod, /Every rule below holds: the gate fails on each\./);
    assert.doesNotMatch(prod, /step toward|catch-up/);
  });
  it('the big docs are measured, biggest first, CLAUDE.md left out, and filling the block cannot change a size', () => {
    assert.equal(bigDocs([['docs/A.md', 20000], ['workflow/tools/README.md', 54000], ['CLAUDE.md', 17000], ['docs/b.md', 100]], 12000),
      '  `workflow/tools/README.md` 53 KB, `docs/A.md` 20 KB.');
    assert.equal(bare('a\n<!-- generated: bigdocs -->\nlong\n<!-- /generated -->\nb'), 'a\n<!-- generated: bigdocs --><!-- /generated -->\nb');
  });
});
