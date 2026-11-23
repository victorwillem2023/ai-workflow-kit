// What the state of the code says to work on (lib/hotspots.mjs): files changed often that are too big or untested, areas
// where bugs gather, flaky tests and import circles, each with the principle behind it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { churn, fixStreaks, hotspotLines, hotspots } from '../../workflow/tools/lib/hotspots.mjs';

describe('what the code says to work on', () => {
  const changes = churn(['src/a.ts', '', 'src/a.ts', 'src/b.ts', '', 'src/a.ts', 'src/b.ts', 'src/c.ts', '', 'src/b.ts', 'src/c.ts', 'src/c.ts'].join('\n'));
  const baseline = { sizes: { 'src/a.ts': 600, 'src/z.ts': 900 }, functions: { 'src/a.ts|plan': 90 }, untested: ['src/b.ts', 'src/q.ts'], cycles: [['src/x.ts', 'src/y.ts']] };
  it('counts how often each file changed', () => {
    assert.deepEqual([changes.get('src/a.ts'), changes.get('src/c.ts'), changes.get('src/z.ts')], [3, 3, undefined]);
  });
  it('names the file changed often that is too big, never one that is big but left alone', () => {
    const list = hotspots({ changes, baseline });
    assert.deepEqual(list.map((h) => h.kind), ['hotspot', 'untested-churn', 'circles']);
    assert.match(list[0].what, /^src\/a\.ts changed in 3 commits in 90 days, 600 lines, 1 long function/);
    assert.deepEqual(list[1].files, ['src/b.ts']);
  });
  it('makes an area with three open bugs a suggestion, and flaky tests one that comes first', () => {
    const bugs = [1, 2, 3].map((number) => ({ number, area: 'area: UI' })).concat([{ number: 4, area: 'area: Trips' }]);
    const list = hotspots({ changes: new Map(), baseline: {}, bugs, flaky: ['tests/a.test.ts', 'tests/b.test.ts'] });
    assert.deepEqual(list.map((h) => [h.kind, h.what.split(':')[0]]), [['flaky', '2 flaky test files'], ['bug-cluster', '3 open bugs in UI (#1, #2, #3)']]);
    assert.match(hotspotLines(list), /^what the code says to work on, best first:\n1\. 2 flaky test files[^]*\n {3}why: a check nobody trusts/);
    assert.match(hotspotLines([]), /^nothing stands out/);
  });
  it('finds a streak of fixes in one area within the days, a card counted once, and says to step back', () => {
    const now = new Date('2026-11-23T12:00:00Z');
    const day = (d: number) => new Date(now.getTime() - d * 864e5).toISOString();
    const hikes = [1, 2, 3, 4].map((card, i) => ({ area: 'area: Hikes', at: day(i), card }));
    const fixes = [...hikes, { area: 'area: Hikes', at: day(1), card: 4 }, { area: 'area: Hikes', at: day(2), topic: 'summit-path' },
      { area: 'area: Hikes', at: day(9), card: 9 }, { area: 'area: Bike', at: day(1), card: 20 }, { area: null, at: day(1), card: 30 }];
    const streaks = fixStreaks(fixes, {}, now);
    assert.deepEqual(streaks, [{ area: 'area: Hikes', fixes: ['#1', '#2', '#3', '#4', 'summit-path'], days: 7 }], 'five in a week; the old one, the other area and no area left out');
    assert.deepEqual(fixStreaks(fixes, { count: 6 }, now), []);
    assert.deepEqual(fixStreaks(fixes, false, now), [], 'false turns it off');
    assert.equal(fixStreaks(fixes, { days: 14, count: 6 }, now)[0]?.fixes.length, 6);
    const list = hotspots({ fixes: streaks });
    assert.equal(list[0].kind, 'fix-streak');
    assert.match(list[0].what, /^5 fixes in Hikes in 7 days \(#1, #2, #3, #4, summit-path\): stop patching it and look at how its flow is built first/);
  });
});
