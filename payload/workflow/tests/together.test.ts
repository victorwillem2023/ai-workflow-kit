// Which cards go together (lib/together.mjs): one session, one after another, or side by side, from the labels, the
// dependencies and the places on the app map.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { together, togetherLines } from '../../workflow/tools/lib/together.mjs';

const card = (number: number, labels: string[], body = '') => ({ number, title: `Card ${number}`, state: 'open', labels, column: 'Backlog', body });
const areas = ['area: UI', 'area: Backend', 'area: Trips'];

describe('cards that go together', () => {
  it('puts small cards on the same place in one session, at most three', () => {
    const cards = [1, 2, 3, 4].map((n) => card(n, ['area: UI', 'effort: small']));
    const g = together(cards, { areas });
    assert.deepEqual(g, [{ how: 'one session', cards: [1, 2, 3], why: 'all small and on UI: one change, one check, one commit' }]);
    assert.deepEqual(togetherLines(g), ['together, one session: #1 + #2 + #3 (all small and on UI: one change, one check, one commit) (/work 1 2 3)']);
  });
  it('orders a card before the one that needs it, and two bigger cards on the same part of the map', () => {
    const a = card(1, ['area: Backend', 'effort: medium']), b = card(2, ['area: UI', 'effort: medium'], 'Depends on: #1');
    assert.deepEqual(together([a], { all: [a, b], areas }).map((g) => [g.how, g.cards]), [['one after another', [1, 2]]]);
    const c = card(3, ['area: Trips', 'effort: large']), d = card(4, ['area: Trips', 'effort: medium']);
    const g = together([c, d], { areas, places: new Map([[3, ['Planning › The days']], [4, ['Planning › The days']]]) });
    assert.deepEqual(g.map((x) => [x.how, x.cards, x.why]), [['one after another', [3, 4], 'both change Planning › The days: side by side they would touch the same files']]);
  });
  it('offers bigger cards of different parts side by side, as many as may run at once; a lone card gets no group', () => {
    const cards = [card(1, ['area: UI', 'effort: medium']), card(2, ['area: Backend', 'effort: large']), card(3, ['area: Trips', 'effort: medium']), card(4, ['area: UI', 'effort: medium'])];
    assert.deepEqual(together(cards, { areas, room: 2 }).map((g) => [g.how, g.cards]), [['side by side', [1, 2]]]);
    assert.deepEqual(together([cards[0]], { areas }), []);
    assert.deepEqual(together([cards[0], cards[3]], { areas }), [], 'two bigger cards of one area: nothing says they go together');
  });
});
