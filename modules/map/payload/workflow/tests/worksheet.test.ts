// The worksheet (workflow/tools/lib/worksheet.mjs, npm run board -- --map): which open cards sit on which app map ends,
// and the map's hygiene problems. A small map and card list from memory; no board, no files.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { worksheet, mapEnds, mapGaps, mapFiles, staleMapAdvice } from '../../workflow/tools/lib/worksheet.mjs';
import type { Flow } from '../../workflow/tools/lib/worksheet.mjs';

const COLUMNS = ['Backlog', 'Ready', 'In progress', 'Waiting for your check', 'Blocked', 'Done'];
const flow: Flow = { groups: [{ name: 'Planning', stages: [{ name: 'Places', src: 'src/pipeline/resolve.ts', tree: [
  { q: 'A top?', yes: [{ t: 'Ways up as a choice', s: 'building', card: [23] }],
    no: [{ q: 'A lake?', opts: [['big', [{ t: 'Shore towns', s: 'gap', card: [340] }]], ['small', [{ t: 'Around it' }]]] }] },
  { t: 'Old wait', s: 'gap', card: [283], n: '31 boards drawn (13 to 14 Nov).' },
  { t: 'Built long ago', card: [50] },
  { t: 'Being built, nobody on it', s: 'building' },
] }] }] };
const card = (number: number, column: string, state = 'open', labels = ['feature']) => ({ number, title: `Card ${number}`, state, labels, column });
const cards = [card(23, 'In progress'), card(340, 'Backlog'), card(283, 'Done', 'closed'), card(50, 'Backlog'),
  card(99, 'Backlog'), card(77, 'Waiting for your check'), card(5, 'In progress', 'open', ['workflow'])];

describe('the worksheet maps board cards to the app map', () => {
  it('finds every end of the map, inside yes, no and multiple-choice branches, with built as the default status', () => {
    const ends = mapEnds(flow);
    assert.deepEqual(ends.map((e) => e.text), ['Ways up as a choice', 'Shore towns', 'Around it', 'Old wait', 'Built long ago', 'Being built, nobody on it']);
    assert.equal(ends[2].status, 'built');
    assert.equal(ends[0].where, 'Planning › Places');
  });

  it('lists an open card under its column with the map ends it is on', () => {
    const { text } = worksheet(flow, cards, COLUMNS);
    assert.match(text, /In progress\n {2}#23 Card 23\n {6}Planning › Places › Ways up as a choice \(building\)/);
    assert.match(text, /#340 Card 340\n {6}Planning › Places › Shore towns \(gap\)/);
  });

  it('lists every card in a column under way, but only counts the Backlog cards on no map end', () => {
    const { text } = worksheet(flow, cards, COLUMNS);
    assert.match(text, /#77 Card 77 {3}\(on no map end\)/);
    assert.doesNotMatch(text, /#99/);
    assert.match(text, /and 1 more on no map end/);
    assert.match(worksheet(flow, cards, COLUMNS, { all: true }).text, /#99 Card 99 {3}\(on no map end\)/);
  });

  it('leaves workflow cards and closed cards out of the list', () => {
    const { text } = worksheet(flow, cards, COLUMNS);
    assert.doesNotMatch(text, /#5 /);
    assert.doesNotMatch(text, /#283 Card/);
  });

  it('says what to fix: a closed card on an end, a card on a built end, a building end with no card, a dated note', () => {
    const { problems } = worksheet(flow, cards, COLUMNS);
    assert.ok(problems.some((p) => /#283 is done but still on "Old wait"/.test(p)));
    assert.ok(problems.some((p) => /"Built long ago".* is built but still carries #50/.test(p)));
    assert.ok(problems.some((p) => /"Being built, nobody on it".* is building with no card/.test(p)));
    assert.ok(problems.some((p) => /"Old wait".* has a dated note/.test(p)));
    assert.equal(problems.length, 4);
  });

  it('says when a building end has its card back in the Backlog, and names a card that does not exist', () => {
    const moved = cards.map((c) => (c.number === 23 ? { ...c, column: 'Backlog' } : c)).filter((c) => c.number !== 340);
    const { problems } = worksheet(flow, moved, COLUMNS);
    assert.ok(problems.some((p) => /"Ways up as a choice".* is building, but #23 is in Backlog/.test(p)));
    assert.ok(problems.some((p) => /#340 is on "Shore towns".* but is no card on the board/.test(p)));
  });
});

describe('the app map steers', () => {
  it('finds the gap and weak ends no open card is on: what nobody plans yet', () => {
    const gaps = mapGaps(flow, [card(340, 'Backlog'), card(283, 'Done', 'closed')]);
    assert.deepEqual(gaps.map((e) => e.text), ['Old wait'], 'Shore towns has an open card; Old wait only a closed one');
  });
  it('knows the files decisions are made in, counts the decisions that name none, and advises when that code changed alone', () => {
    const named: Flow = { groups: [{ name: 'Plan', stages: [{ name: 'Rules', tree: [
      { q: 'A goal?', f: 'src/core/plan/check-goal.ts', yes: [{ t: 'Planned', f: 'src/core/plan/build-plan.ts' }], no: [{ q: 'Asked again?', yes: [{ t: 'x' }] }] },
    ] }] }] };
    const { files, unnamed } = mapFiles(named);
    assert.deepEqual([...files].sort(), ['src/core/plan/build-plan.ts', 'src/core/plan/check-goal.ts']);
    assert.equal(unnamed, 1);
    assert.match(staleMapAdvice(named, ['src/core/plan/check-goal.ts', 'tests/x.test.ts'])[0], /^advice: src\/core\/plan\/check-goal\.ts changed and docs\/flow\/map\.js did not/);
    assert.deepEqual(staleMapAdvice(named, ['src/core/plan/check-goal.ts', 'docs/flow/map.js']), [], 'the map changed with it');
    assert.deepEqual(staleMapAdvice(named, ['src/web/main.tsx']), [], 'code the map does not name');
  });
});
