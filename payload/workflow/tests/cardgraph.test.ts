// Which cards need which (lib/cardgraph.mjs) and the order it gives (lib/rank.mjs): the graph first, then value for the effort.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addDepends, cardGraph, dependsOn, removeDepends, renderTree } from '../../workflow/tools/lib/cardgraph.mjs';
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
  it('offers only the cards nothing open holds back, the ones that unlock the most first, whatever their value', () => {
    const ranked = rankCards(board);
    assert.deepEqual(ranked.map((c) => c.number), [1, 5], '#2 has the highest value but waits; #1 and #5 each unlock three (a tie: the older first)');
    assert.match(ranked[0].why, /^unlocks 3 cards/);
    assert.deepEqual(waitingCards(board).waiting.map((c) => [c.number, c.waitsFor]), [[2, [1, 3]], [3, [1, 5]], [4, [2]]]);
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
