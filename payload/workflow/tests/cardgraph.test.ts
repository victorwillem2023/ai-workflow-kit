// Which cards need which (lib/cardgraph.mjs) and the order it gives (lib/rank.mjs): the graph first, then value for the effort.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addDepends, cardGraph, dependsOn, freshlyUnlocked, removeDepends, renderTree } from '../../workflow/tools/lib/cardgraph.mjs';
import { rankCards, topTie, waitingCards } from '../../workflow/tools/lib/rank.mjs';

const card = (number: number, title: string, deps = '', labels: string[] = [], column = 'Backlog', state = 'open') =>
  ({ number, title, state, labels, column, body: deps });

// the shape of a real board: the rules first, then saving, the screen, logging; sign-in before anything is saved
const board = [
  card(1, 'Training rules: a plan from a goal', '', ['effort: large']),
  card(2, 'Screen: set a goal and see the plan', 'Depends on: #1, #3', ['value: high', 'effort: medium']),
  card(3, 'Store the goal and plan', 'Depends on: #1, #5', ['effort: medium']),
  card(4, 'Log a workout and let the plan react', '**Depends on:** #2', ['effort: medium']),
  card(5, 'Sign in with Google', '', ['effort: large']),
];

describe('the card graph', () => {
  it('reads the dependency lines, in the ways people write them', () => {
    assert.deepEqual(dependsOn('Some text.\n\nDepends on: #3, #1\n- After: #7\n**Blocked by:** #9 and #9'), [1, 3, 7, 9]);
    assert.deepEqual(dependsOn('This card is about #4 and nothing else.'), [], 'a number in the text is not a dependency');
  });
  it('knows what each card waits for, how many it unlocks further down, and a number that is no card', () => {
    const g = cardGraph([...board, card(6, 'x', 'Depends on: #42')]);
    assert.deepEqual(g.waitsFor.get(2), [1, 3]);
    assert.deepEqual([g.unlocks.get(1), g.unlocks.get(5), g.unlocks.get(4)], [3, 3, 0]);
    assert.deepEqual(g.unknown.get(6), [42]);
  });
  it('offers only the cards nothing open holds back, by what they and the cards they unlock are worth', () => {
    const ranked = rankCards(board);
    assert.deepEqual(ranked.map((c) => c.number), [1, 5], '#2 has the highest value but waits; #1 and #5 each unlock the same three (a tie: the older first)');
    assert.match(ranked[0].why, /^unlocks 3 cards/);
    assert.deepEqual(waitingCards(board).waiting.map((c) => [c.number, c.waitsFor]), [[2, [1, 3]], [3, [1, 5]], [4, [2]]]);
  });
  it('unlocking a card of little value does not put a card above one worth more (#22 and #26 above #382)', () => {
    const b = [
      card(22, 'Rename a label', '', ['value: low', 'effort: medium']),
      card(23, 'Show the renamed label', 'Depends on: #22', ['value: low', 'effort: medium']),
      card(382, 'Weekly plan from a goal', '', ['value: high', 'effort: small']),
    ];
    assert.deepEqual(rankCards(b).map((c) => c.number), [382, 22]);
  });
  it('unlocking a valuable card is worth as much as doing it', () => {
    const b = [
      card(10, 'Store the goal', '', ['value: low', 'effort: small']),
      card(11, 'Screen: see the plan', 'Depends on: #10', ['value: high', 'effort: small']),
      card(12, 'A nicer footer', '', ['value: medium', 'effort: small']),
    ];
    assert.deepEqual(rankCards(b).map((c) => c.number), [10, 12]);
  });
  it('lets a card start once what it depends on is done or closed', () => {
    const later = board.map((c) => (c.number === 1 ? { ...c, column: 'Done' } : c.number === 5 ? { ...c, state: 'closed' } : c));
    assert.deepEqual(rankCards(later).map((c) => c.number), [3]);
  });
  it('finds cards that wait for each other in a loop', () => {
    const loop = [card(1, 'a', 'Depends on: #2'), card(2, 'b', 'Depends on: #3'), card(3, 'c', 'Depends on: #1')];
    assert.deepEqual(cardGraph(loop).loops, [[1, 2, 3]]);
    assert.deepEqual(rankCards(loop), []);
    assert.match(renderTree(loop), /LOOP: #1 waits for #2 waits for #3 waits for #1/);
  });
  it('draws the tree top-down, and writes or extends the dependency line of a card', () => {
    assert.equal(renderTree(board), [
      '#1 Training rules: a plan from a goal', '  └ #2 Screen: set a goal and see the plan', '    └ #4 Log a workout and let the plan react',
      '  └ #3 Store the goal and plan', '    └ #2 Screen: set a goal and see the plan (above)',
      '#5 Sign in with Google', '  └ #3 Store the goal and plan (above)',
    ].join('\n'));
    assert.equal(addDepends('The text.', [5, 1]), 'The text.\n\nDepends on: #1, #5\n');
    assert.equal(addDepends('The text.\n\nDepends on: #1\n', [5]), 'The text.\n\nDepends on: #1, #5\n');
    assert.equal(removeDepends('The text.\n\nDepends on: #1, #5\n', [5]), 'The text.\n\nDepends on: #1\n', 'one taken off');
    assert.equal(removeDepends('The text.\n\nDepends on: #1\n', [1]), 'The text.\n', 'the line goes with the last one');
  });

  it('a card whose dependency is built and waits for the owner\'s check can start on top of it; one being built still waits', () => {
    const cards = [
      card(1, 'Training rules', '', [], 'Waiting for your check'),
      card(2, 'Screen: see the plan', 'Depends on: #1'),
      card(3, 'Store the plan', '', [], 'In progress'),
      card(4, 'Log a workout', 'Depends on: #1, #3'),
      card(5, 'Sign in', ''),
    ];
    const ranked = rankCards(cards);
    assert.deepEqual(ranked.map((c) => c.number), [5, 2], 'the card with nothing open first, then the one on top of a built card');
    assert.deepEqual(ranked[1].on, [1]);
    assert.match(ranked[1].why, /^starts on top of #1 \(built, waiting for your check\)/);
    assert.deepEqual(waitingCards(cards).waiting.map((c) => [c.number, c.waitsFor]), [[4, [3]]], 'only what is not built yet is waited for');
  });

  it('cards nothing tells apart are a tie at the top, never an order by card number; a label breaks it', () => {
    const free = [card(11, 'Cycling plans', 'Depends on: #1'), card(12, 'Hiking plans', 'Depends on: #1'), card(14, 'Ultra goals', 'Depends on: #1'),
      card(1, 'Training rules', '', [], 'Done', 'closed')];
    assert.deepEqual(topTie(rankCards(free)).map((c) => c.number), [11, 12, 14]);
    const rated = free.map((c) => (c.number === 14 ? { ...c, labels: ['value: high'] } : c));
    assert.deepEqual(topTie(rankCards(rated)), [], 'one value label and #14 stands alone at the top');
    assert.equal(rankCards(rated)[0].number, 14);
    assert.deepEqual(topTie(rankCards(board)).map((c) => c.number), [1, 5], 'two cards that unlock as much, with the same labels, are a tie too');
  });
});

describe('what a card says it waits for, and what finishing one lets start', () => {
  it('counts a dependency line only with its colon: a sentence that starts with "Needs" is not one', () => {
    assert.deepEqual(dependsOn('Needs its own spec (behaviour change). Kinds: later a ride up a top (#380).'), []);
    assert.deepEqual(dependsOn('After the trip work, #12 can go.'), []);
    assert.deepEqual(dependsOn('Needs: #4\n**Depends on:** #5\n**After**: #6\n- Blocked by: #7'), [4, 5, 6, 7]);
    assert.deepEqual(dependsOn('Depends on #8, #9'), [8, 9], 'written by hand without the colon, the number right after');
    assert.match(addDepends('Depends on #8', [10]), /Depends on: #8, #10/, '--depends keeps what was there');
  });
  it('names the cards a card finished in the last days lets start, also one still waiting for the owner\'s yes', () => {
    const now = Date.parse('2026-11-23T20:00:00Z');
    const cards = [
      { number: 607, title: 'measure', state: 'closed', labels: [], column: 'Done', body: '', closedAt: '2026-11-23T18:00:00Z' },
      { number: 3, title: 'done weeks ago, commented today', state: 'open', labels: [], column: 'Done', body: '', updatedAt: '2026-11-23T19:00:00Z' },
      { number: 4, title: 'waits for 3', state: 'open', labels: [], column: 'Backlog', body: 'Depends on: #3' },
      { number: 5, title: 'shipped today, still open', state: 'open', labels: [], column: 'Done', body: '' },
      { number: 6, title: 'waits for 5', state: 'open', labels: [], column: 'Ready', body: 'Depends on: #5' },
      { number: 609, title: 'climb module', state: 'open', labels: ['to sort'], column: 'Backlog', body: 'Depends on: #607' },
      { number: 610, title: 'end state', state: 'open', labels: [], column: 'Backlog', body: 'Depends on: #609' },
      { number: 611, title: 'started already', state: 'open', labels: [], column: 'In progress', body: 'Depends on: #607' },
      { number: 612, title: 'built, waiting for a check', state: 'open', labels: [], column: 'Waiting for your check', body: 'Depends on: #607' },
      { number: 613, title: 'blocked', state: 'open', labels: [], column: 'Blocked', body: 'Depends on: #607' },
      { number: 614, title: 'off the board', state: 'open', labels: [], column: null, body: 'Depends on: #607' },
      { number: 1, title: 'old', state: 'closed', labels: [], column: 'Done', body: '', closedAt: '2026-10-01T00:00:00Z' },
      { number: 2, title: 'freed long ago', state: 'open', labels: [], column: 'Backlog', body: 'Depends on: #1' },
    ];
    assert.deepEqual(freshlyUnlocked(cards, { now, shippedAt: { 5: '2026-11-23T17:00:00Z' } }).map((u) => [u.card.number, u.by]), [[6, [5]], [609, [607]]]);
  });
});
