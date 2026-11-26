// Which cards a goal holds (lib/goalcards.mjs): the open cards its own rule missed (gather), and its parts when it is too big.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { currentPart, gatherFor, gatherLines, laterCards, partLine, splitGoal, splitLines, wordsOf } from '../../workflow/tools/lib/goalcards.mjs';

const card = (number: number, title: string, labels: string[] = [], extra: object = {}) => ({ number, title, state: 'open', labels, column: 'Backlog', body: '', ...extra });
const areas = ['area: Routes', 'area: UI', 'area: Backend'];

describe('gathering the cards a goal missed', () => {
  const all = [
    card(1, 'Bike route ignores gravel paths', ['bug', 'area: Routes']),
    card(2, 'Bike route climbs too steep', ['bug', 'area: Routes']),
    card(3, 'Bike routes avoid gravel when asked', ['feature', 'area: Routes']), // labelled feature: the bugs rule misses it
    card(4, 'Gravel shown wrong on the map', ['bug', 'area: UI']), // another area, same word
    card(5, 'Dark mode', ['ui', 'area: Routes']), // the same area alone is no sign
    card(6, 'Export a route as a file', ['feature', 'area: Backend'], { body: 'Touches: src/route/plan.ts' }),
    card(7, 'Old gravel card', ['bug', 'area: Routes'], { state: 'closed', column: 'Done' }),
    card(8, 'Gravel twice', ['bug', 'area: Routes']),
    ...[10, 11, 12, 13, 14, 15].map((n) => card(n, `Something else ${n}`, ['feature', 'area: Backend'])),
  ];
  const goal = { name: 'Stabilise Routes: its open bugs', kind: 'bugs', area: 'area: Routes', ends: [{ text: 'gravel on a bike route', where: 'Planning › Routing' }] };
  const files = new Map([[2, ['src/route/']], [6, ['src/route/plan.ts']]]);

  it('finds cards by words, files and place, never by area alone, best first', () => {
    const found = gatherFor(goal, all, { mine: [1, 2], skip: [8], areas, files });
    assert.deepEqual(found.map((x) => x.number), [3, 6, 4], 'not the goal\'s own, a done card, a skipped one, or one that only shares the area');
    assert.match(found[0].why.join('; '), /shares "bike", "routes", "gravel".*same area \(Routes\)/);
    assert.equal(found[0].end?.where, 'Planning › Routing', 'the end of the map it is closest to');
    assert.match(found.find((x) => x.number === 6)!.why.join(), /changes src\/route\/plan\.ts/);
  });

  it('a card on the map where the goal is counts, and says where', () => {
    const found = gatherFor({ name: 'Planning on a phone', places: ['Planning › Routing'] }, all, { mine: [], areas, places: new Map([[5, ['Planning › Routing']]]) });
    assert.equal(found.find((x) => x.number === 5)?.why[0], 'it is on the app map at Planning › Routing');
  });

  it('says how to take them in and how to leave them out', () => {
    const lines = gatherLines(gatherFor(goal, all, { mine: [1, 2], areas, files }), 'Stabilise Routes');
    assert.match(lines[0], /^gather: 4 open cards look like they belong to "Stabilise Routes"/);
    assert.match(lines.at(-1)!, /--focus --add 3,6,8,4 .*--focus --not/);
    assert.deepEqual(gatherLines([], 'X'), ['gather: no other open card looks like it belongs to "X"']);
  });

  it('words are stemmed, accents off, small and empty words out', () => {
    assert.deepEqual(wordsOf('Routing the bikes: café routes, 12 km'), ['rout', 'bik', 'caf']);
    assert.deepEqual(wordsOf('Two bugs in the apps'), ['two'], 'a plural of a word that says nothing says nothing either');
  });
});

describe('a goal too big for one go, in parts', () => {
  const at = (n: number, labels: string[], extra: object = {}) => card(n, `Card ${n}`, labels, extra);
  const all = [
    ...[1, 2, 3, 4].map((n) => at(n, ['area: Routes'])),
    ...[5, 6, 7].map((n) => at(n, ['area: UI'])),
    at(8, ['area: Backend'], { column: 'In progress' }), at(9, ['area: Backend']), at(10, ['area: Backend'], { body: 'Depends on: #2' }),
    at(11, []),
  ];
  const order = all.map((c) => c.number);

  it('groups by area, the part with work running first, the rest together, what a card needs never later', () => {
    const parts = splitGoal(order, { all, areas, size: 5 });
    assert.deepEqual(parts.map((p) => [p.name, p.cards]), [['Backend', [8, 9, 10, 2]], ['Routes', [1, 3, 4]], ['UI', [5, 6, 7]], ['the rest', [11]]]);
  });

  it('by where cards sit on the map first; one group only is cut in the goal\'s order', () => {
    const places = new Map([[1, ['Planning › Routing']], [5, ['Planning › Routing']], [6, ['Planning › Routing']]]);
    assert.equal(splitGoal(order, { all, areas, places, size: 5 })[1].name, 'Routing');
    const one = all.map((c) => ({ ...c, labels: ['area: Routes'], column: 'Backlog', body: '' }));
    assert.deepEqual(splitGoal(order, { all: one, areas, size: 5 }).map((p) => p.cards.length), [4, 4, 3]);
    assert.deepEqual(splitGoal([1, 2, 3], { all, areas, size: 5 }), [], 'small enough: no parts');
  });

  it('the part now is the first with a card open; the later ones wait', () => {
    const parts = [{ name: 'Routes', cards: [1, 2] }, { name: 'UI', cards: [5, 6] }, { name: 'Backend', cards: [9] }];
    const done = all.map((c) => (c.number <= 2 ? { ...c, state: 'closed', column: 'Done' } : c));
    assert.equal(currentPart(parts, done), 1);
    assert.deepEqual(laterCards(parts, done), [9]);
    assert.equal(partLine(parts, done), 'part 2 of 3 now: UI (0 of 2 done); then Backend');
    assert.equal(partLine(parts, done.map((c) => ({ ...c, state: 'closed', column: 'Done' }))), '');
    const built = done.map((c) => (c.number === 5 || c.number === 6 ? { ...c, column: 'Waiting for your check' } : c));
    assert.equal(currentPart(parts, built), 2, 'a part whose cards wait for the owner\'s check does not hold the next one back');
    assert.deepEqual([currentPart(parts, done, [5, 6]), laterCards(parts, done, [5, 6])], [2, []], 'nor one whose cards are parked');
    assert.match(splitLines([{ name: 'UI', cards: [5, 6] }], 12).join('\n'), /12 open cards are too many.*\n  1\. UI: #5, #6\n.*--split --yes/);
  });
});
