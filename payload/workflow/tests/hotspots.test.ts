// What the state of the code says to work on (lib/hotspots.mjs): files changed often that are too big or untested, areas
// where bugs gather, flaky tests and import circles, each with the principle behind it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { churn, hotspotLines, hotspots } from '../../workflow/tools/lib/hotspots.mjs';

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
});
