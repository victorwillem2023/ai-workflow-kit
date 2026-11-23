// Before and after a change (lib/measure.mjs): what moved between two runs of a project's own measuring script, and nothing else.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareLines, compareRuns, shapeProblems } from '../../workflow/tools/lib/measure.mjs';

const run = (cases: unknown[], tolerance?: Record<string, number>) => ({ name: 'tops', cases, ...(tolerance ? { tolerance } : {}) }) as never;
const before = run([
  { id: 'aconcagua', values: { reachesTop: true, belowTopM: 0, km: 30.2 }, items: [{ id: 'normal route', values: { km: 30.2 } }, { id: 'polish glacier', values: { km: 34 } }] },
  { id: 'rainier', values: { reachesTop: true, km: 26 } },
  { id: 'denali', values: { reachesTop: false } },
]);

describe('before and after a change', () => {
  it('says nothing moved when nothing did, also within a tolerance', () => {
    assert.equal(compareRuns(before, before).same, true);
    const nudged = run([{ id: 'rainier', values: { km: 26.04 } }], { km: 0.1 });
    assert.equal(compareRuns(run([{ id: 'rainier', values: { km: 26 } }], { km: 0.1 }), nudged).same, true);
    assert.match(compareLines(compareRuns(before, before), { total: 3 }), /^measure: nothing moved between before and after \(3 cases\)$/);
    // two runs read from two files, not one object compared with itself: a list written twice has not moved
    const twice = () => JSON.parse(JSON.stringify(run([{ id: 'x', values: { stops: ['a', 'b'], at: { lat: 1 } } }])));
    assert.equal(compareRuns(twice(), twice()).same, true);
  });
  it('lists only the cases that moved: a top no longer reached first, options gained and lost, values past the tolerance', () => {
    const after = run([
      { id: 'aconcagua', values: { km: 30.2, belowTopM: 120, reachesTop: false }, items: [{ id: 'normal route', values: { km: 31.5 } }, { id: 'false polish', values: { km: 28 } }] },
      { id: 'rainier', values: { reachesTop: true, km: 26 } },
      { id: 'kilimanjaro', values: { reachesTop: true } },
    ]);
    const d = compareRuns(before, after);
    assert.deepEqual(d.cases.map((c) => c.id), ['aconcagua', 'denali', 'kilimanjaro']);
    // a case that lost a true comes first even when it comes later in the file
    const late = compareRuns(run([{ id: 'a', values: { km: 1 } }, { id: 'b', values: { ok: true } }]), run([{ id: 'a', values: { km: 2 } }, { id: 'b', values: { ok: false } }]));
    assert.deepEqual(late.cases.map((c) => c.id), ['b', 'a']);
    const text = compareLines(d, { before: 'tops-22', after: 'tops-23', total: 4 });
    assert.match(text, /^measure: 3 of 4 cases moved between tops-22 and tops-23:/);
    assert.match(text, /aconcagua:\n {4}reachesTop true -> false \(lost\)\n {4}belowTopM 0 -> 120/);
    assert.match(text, /options lost: polish glacier\n {4}options gained: false polish\n {4}normal route: km 30\.2 -> 31\.5/);
    assert.match(text, /denali: gone from tops-22\n {2}kilimanjaro: new in tops-23/);
  });
  it('tells a script that writes another shape what is wrong, instead of comparing it wrongly', () => {
    assert.deepEqual(shapeProblems({ mountains: [] }), ['no "cases" list']);
    assert.deepEqual(shapeProblems({ cases: [{ values: {} }, { id: 'x', items: {} }] }), ['case 1 has no "id"', 'case x: "items" is not a list']);
    assert.deepEqual(shapeProblems({ cases: [] }), []);
    assert.deepEqual(shapeProblems({ cases: [{ id: 'x', items: [null, { id: 'o' }, { id: 'o' }] }] }), ['case x: option 1 has no "id"', 'case x: two options are "o"']);
    assert.deepEqual(shapeProblems({ cases: [{ id: 'rainier' }, { id: 'rainier' }] }), ['two cases are "rainier"']);
    assert.deepEqual(shapeProblems({ cases: [{ id: 'a', values: null, items: [{ id: 'o', values: 'abc' }] }] }), ['case a: "values" is not an object', 'case a: option o: "values" is not an object']);
  });
});
