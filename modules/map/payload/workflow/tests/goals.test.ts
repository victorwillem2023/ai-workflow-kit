// Goals with a finish line from the app map (workflow/tools/lib/goals.mjs): a kind of request by its page and the steps it runs
// through, a part of the app by its ends. A small map from memory; no board, no files.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapGoals } from '../../workflow/tools/lib/goals.mjs';

const flow = {
  kinds: { 'to-a-top': ['places', 'make'], loop: ['make'] },
  groups: [
    { name: 'What someone asks', stages: [
      { id: 'kinds', name: 'The kinds', tree: [{ t: 'A hike to a top: "to the top of".', kind: 'to-a-top' }, { t: 'A loop on foot: no finish.', kind: 'loop' }] },
      { id: 'k-to-a-top', kind: 'to-a-top', name: 'A hike to a top', tree: [
        { q: 'a top named', opts: [['the app', [{ t: 'goes up' }]]] },
        { q: 'a top far away', opts: [['the app', [{ t: 'says so', s: 'decided', card: [7] }]]] },
      ] },
    ] },
    { name: 'Planning', stages: [
      { id: 'places', name: 'Finding the places', tree: [{ q: 'a name?', yes: [{ t: 'found' }], no: [{ t: 'asks', s: 'weak', card: [8, 99] }] }] },
      { id: 'make', name: 'Making the candidates', tree: [{ t: 'loops' }, { t: 'one way', s: 'gap' }] },
      { id: 'pick', name: 'Picking', tree: [{ t: 'the best five' }] },
    ] },
  ],
};
const cards = [7, 8].map((number) => ({ number, state: 'open' }));

describe('goals from the app map', () => {
  const goals = mapGoals(flow, cards);
  it('measures a kind by its page\'s cases and the weak and missing ends in the steps it runs through', () => {
    const top = goals.find((g) => g.id === 'request:to-a-top');
    assert.deepEqual([top?.name, top?.done, top?.left, top?.total, top?.cards, top?.uncarded], ['A hike to a top', 1, 3, 4, [7, 8], 1]);
    assert.deepEqual(top?.notes, ['1 case not built', '1 weak spot and 1 not built in the steps it runs through']);
  });
  it('a kind with no page starts with writing it', () => {
    const loop = goals.find((g) => g.id === 'request:loop');
    assert.deepEqual([loop?.left, loop?.uncarded], [2, 2]);
    assert.match(loop?.notes[0] ?? '', /^no page yet/);
  });
  it('a part with something left is a goal; a finished part and the list of kinds are not', () => {
    assert.deepEqual(goals.filter((g) => g.kind === 'part').map((g) => [g.id, g.done, g.total]), [['part:places', 1, 2], ['part:make', 1, 2]]);
  });
  it('takes in the kind\'s clean-up plan from its flow page first, in its order, refactor cards on no end counted as left', () => {
    const withPlan = mapGoals(flow, [...cards, { number: 20, state: 'open' }, { number: 21, state: 'open' }, { number: 22, state: 'closed' }], { plans: { 'to-a-top': [21, 22, 20, 8] } });
    const top = withPlan.find((g) => g.id === 'request:to-a-top');
    assert.deepEqual(top?.cards, [21, 20, 8, 7], 'the plan first in its order (the closed one left out), then the cards on the ends');
    assert.deepEqual(top?.plan, [21, 20, 8]);
    assert.equal(top?.left, 5, 'the two refactor cards count as left: the goal is not done while the reshaping waits');
    for (const kind of ['To_A_Top', 'ToATop']) {
      const odd = mapGoals({ ...flow, kinds: { [kind]: ['make'] } }, [...cards, { number: 21, state: 'open' }], { plans: { 'to-a-top': [21] } });
      assert.deepEqual(odd.find((g) => g.id === `request:${kind}`)?.plan, [21], `${kind} finds the to-a-top page`);
    }
  });
  it('says what a goal is about, so the cards its ends miss can be found (lib/goalcards.mjs)', () => {
    const top = goals.find((g) => g.id === 'request:to-a-top');
    assert.deepEqual(top?.places, ['What someone asks › A hike to a top', 'Planning › Finding the places', 'Planning › Making the candidates']);
    assert.deepEqual(top?.ends, [{ text: 'says so', where: 'What someone asks › A hike to a top' }, { text: 'asks', where: 'Planning › Finding the places' }, { text: 'one way', where: 'Planning › Making the candidates' }]);
    const make = goals.find((g) => g.id === 'part:make');
    assert.deepEqual([make?.places, make?.words], [['Planning › Making the candidates'], ['Making the candidates', 'one way']]);
  });
});
