// A goal's plan (lib/goalplan.mjs): its cards in waves, by what they need first and the files they change, with what cannot be
// planned said, and how much the goal grew since it was picked.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { growthLine, growthOf, planLines, waveLine, wavesOf } from '../../workflow/tools/lib/goalplan.mjs';

const card = (number: number, body = '', column = 'Ready', state = 'open') => ({ number, title: `Card ${number}`, state, labels: [], column, body });
const ids = (plan: ReturnType<typeof wavesOf>) => plan.waves.map((w) => w.map((x) => x.card));

describe("a goal's plan", () => {
  it('puts what a card needs in an earlier wave, and what runs now in the first', () => {
    const all = [card(4), card(5, 'Depends on: #4'), card(6, 'Depends on: #5'), card(7, '', 'In progress'), card(8, 'Depends on: #3'), card(3, '', 'Done')];
    const plan = wavesOf([4, 5, 6, 7, 8], { all });
    assert.deepEqual(ids(plan), [[7, 4, 8], [5], [6]]);
    assert.equal(plan.waves[1][0].why, 'needs #4');
    assert.deepEqual(plan.unknown, [4, 5, 6, 7, 8], 'no files known for any of them');
  });

  it('never puts two cards on one file in the same wave, and says why the second waits', () => {
    const files = new Map([[1, ['src/core/geo.ts']], [2, ['src/core/']], [3, ['src/web/a.ts']]]);
    const plan = wavesOf([1, 2, 3], { all: [card(1), card(2), card(3)], files });
    assert.deepEqual(ids(plan), [[1, 3], [2]]);
    assert.equal(plan.waves[1][0].why, 'after #1: both change src/core/geo.ts');
    assert.deepEqual(plan.unknown, []);
  });

  it('keeps what runs already in the first wave, even two running cards on one file', () => {
    const files = new Map([[7, ['src/core/geo.ts']], [9, ['src/core/geo.ts']], [10, ['src/core/geo.ts']]]);
    const plan = wavesOf([7, 9, 10], { all: [card(7, '', 'In progress'), card(9, '', 'In progress'), card(10)], files });
    assert.deepEqual(ids(plan), [[7, 9], [10]]);
  });

  it('says what waits outside the goal, what waits for that, and a loop, instead of dropping them', () => {
    const all = [card(1, 'Depends on: #99'), card(2, 'Depends on: #1'), card(99), card(10, 'Depends on: #11'), card(11, 'Depends on: #10'), card(12)];
    const plan = wavesOf([1, 2, 10, 11, 12], { all });
    assert.deepEqual(ids(plan), [[12]]);
    assert.deepEqual(plan.outside, [{ card: 1, on: [99] }]);
    assert.deepEqual(plan.stuck, [2]);
    assert.deepEqual(plan.loops, [[10, 11]]);
    const lines = planLines(plan, { name: 'Hikes to a top', byNo: new Map(all.map((c) => [c.number, c])) });
    assert.match(lines.join('\n'), /finish line: not written yet/);
    assert.match(lines.join('\n'), /waits for a card outside the goal: #1 for #99/);
    assert.match(lines.join('\n'), /cannot be planned yet: #2/);
    assert.match(lines.join('\n'), /LOOP: #10 waits for #11 waits for #10/);
  });

  it('says the plan in one line for --next, and how much the goal grew since it was picked', () => {
    const plan = wavesOf([1, 2], { all: [card(1), card(2, 'Depends on: #1')] });
    assert.equal(waveLine(plan), 'plan: wave 1 of 2 now: #1; then #2 (npm run board -- --plan)');
    const growth = growthOf({ picked: [1], parked: [9] }, [1, 2]);
    assert.deepEqual(growth, { grew: [2], parked: [9] });
    assert.match(growthLine(growth), /^grew since its plan was agreed: 1 in the goal \(#2\), 1 parked until it is done \(#9\)/);
    assert.equal(growthOf({}, [1]), null, 'a goal picked before the kit counted it says nothing');
    assert.equal(growthLine({ grew: [], parked: [] }), '');
    assert.match(planLines(plan, { name: 'x', finish: 'a hike to any top works, with or without a start' }).join('\n'), /finish line: a hike to any top works/);
  });
});
