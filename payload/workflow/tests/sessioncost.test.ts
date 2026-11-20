// What the AI sessions used (lib/sessioncost.mjs), from Claude Code's record lines: tokens by model, command and day, and money
// only from prices the project wrote down.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { answerUse, costLines, money, sumUse } from '../../workflow/tools/lib/sessioncost.mjs';

const line = (o: Record<string, unknown>) => ({ type: 'assistant', timestamp: '2026-11-16T10:00:00Z', sessionId: 's1', message: { model: 'opus', usage: { input_tokens: 10, output_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 10000 } }, ...o });

describe('what the AI sessions used', () => {
  it('reads an answer\'s tokens, model and command, and skips what is not an answer', () => {
    assert.deepEqual(answerUse(line({ attributionSkill: 'spec' })), { at: '2026-11-16T10:00:00Z', model: 'opus', skill: 'spec', session: 's1', side: false, input: 10, output: 100, cacheWrite: 1000, cacheRead: 10000 });
    assert.equal(answerUse({ type: 'user', message: { content: 'hi' } }), null);
  });
  it('sums by model, command and day, leaving out what came before the window', () => {
    const answers = [answerUse(line({ attributionSkill: 'build' })), answerUse(line({ message: { model: 'haiku', usage: { input_tokens: 1, output_tokens: 1 } } })), answerUse(line({ timestamp: '2026-10-01T00:00:00Z' }))].filter((a) => a !== null);
    const sum = sumUse(answers, new Date('2026-11-01'));
    assert.equal(sum.total.answers, 2);
    assert.deepEqual([...sum.byModel.keys()].sort(), ['haiku', 'opus']);
    assert.deepEqual([...sum.bySkill.keys()].sort(), ['(no command)', '/build']);
  });
  it('turns tokens into money only with prices, per million tokens', () => {
    const use = { input: 1e6, output: 1e6, cacheWrite: 0, cacheRead: 2e6, answers: 1 };
    assert.equal(money(use, { input: 3, output: 15, cacheRead: 0.3 }), 18.6);
    assert.equal(money(use, null), null);
    const lines = costLines(sumUse([answerUse(line({}))].filter((a) => a !== null)), { prices: { opus: { input: 1, output: 1, cacheRead: 1 } }, checked: '2026-11' });
    assert.match(lines[0], /about 0\.01 \(prices checked 2026-11\)/);
    assert.match(costLines(sumUse([]))[0], /No AI answers recorded/);
  });
  it('compares what one use of a command took across kit versions, once each has enough uses', async () => {
    const { useByKit, kitLines } = await import('../../workflow/tools/lib/sessioncost.mjs');
    const periods = [{ from: '2026-10-01T00:00:00Z', version: '4.6.0' }, { from: '2026-10-10T00:00:00Z', version: '4.6.1' }, { from: '2026-11-01T00:00:00Z', version: '4.7.0' }];
    const use = (skill: string, session: string, at: string, n: number) => ({ at, model: 'opus', skill, session, side: false, input: n, output: 0, cacheWrite: 0, cacheRead: 0 });
    const answers = [
      // three chats of /work on kit 4.6 (two fix releases are one line), each two answers; three on 4.7, each costing more
      ...['a', 'b', 'c'].flatMap((s, i) => [use('work', s, '2026-10-05T10:00:00Z', 500_000), use('work', s, `2026-10-1${i}T10:00:00Z`, 500_000)]),
      ...['d', 'e', 'f'].map((s) => use('work', s, '2026-11-05T10:00:00Z', 1_500_000)),
      // /next has too few uses on 4.7 to say anything; an answer from before the first kit is left out
      ...['g', 'h', 'i'].map((s) => use('next', s, '2026-10-05T10:00:00Z', 10_000)), use('next', 'j', '2026-11-05T10:00:00Z', 10_000), use('work', 'old', '2026-09-01T10:00:00Z', 9e9),
    ];
    const by = useByKit(answers, periods);
    assert.deepEqual(by, [{ skill: '/work', rows: [{ kit: '4.6', uses: 3, median: 1_000_000 }, { kit: '4.7', uses: 3, median: 1_500_000 }] }]);
    assert.match(kitLines(by).join('\n'), /\/work: kit 4\.6: 1\.0 M \(3 uses\); kit 4\.7: 1\.5 M \(3 uses\): 50% more since 4\.6/);
    assert.match(kitLines([])[0], /nothing to compare/);
  });
});
