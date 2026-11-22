// The focus block (lib/focus.mjs): blocks of one theme to pick from, where the picked one stands, and when code health is due.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { expired, focusLine, focusState, goalLine, healthGoal, HEALTH, labelGoal, proposeBlocks, renderBlocks, renderGoals, renderSweep, roomLines, roomToStart, sourcesFor, suggestGoals, sweepGroups, toSort, upkeepDue, urgentOutside, whereYouWere } from '../../workflow/tools/lib/focus.mjs';

const card = (number: number, title: string, column: string | null, labels: string[] = [], extra: object = {}) => ({ number, title, state: 'open', labels, column, createdAt: null, updatedAt: null, body: '', ...extra });
const areas = ['area: UI', 'area: Backend', HEALTH];
const cards = [
  card(1, 'Plan page layout', 'Ready', ['ui', 'area: UI', 'value: high', 'effort: small']),
  card(2, 'Dark mode', 'Backlog', ['ui', 'area: UI', 'value: low', 'effort: medium']),
  card(3, 'Garmin sync', 'Backlog', ['feature', 'area: Backend', 'value: medium', 'effort: large']),
  card(4, 'Slow plan query', 'Backlog', ['feature', HEALTH, 'value: medium', 'effort: small']),
  card(5, 'Week header', 'In progress', ['ui', 'area: UI']),
  card(6, 'Goal form', 'Waiting for your check', ['ui', 'area: UI']),
  card(7, 'Sign-in crashes', 'Backlog', ['bug', 'area: Backend', 'value: high', 'effort: small']),
  card(8, 'Icons', 'Backlog', ['ui', 'area: UI'], { body: 'Depends on: #2' }),
];

describe('the limit on work in progress', () => {
  const doing = [card(507, 'React finish', 'In progress'), card(529, 'Old list view', 'In progress'), card(514, 'Old form', 'In progress'), card(543, 'Split the app', 'In progress'),
    card(600, 'Loose end', 'In progress'), card(610, 'Built', 'Waiting for your check'), card(620, 'Shipped', 'Done', [], { state: 'closed' })];
  const session = (topic: string, cards: number[], finished = false) => ({ topic, cards, finished });
  it('cards one session carries count as one piece of work in progress', () => {
    const r = roomToStart(doing.slice(0, 4), 5, [session('react-finish', [507, 529, 514]), session('app-split', [543])]);
    assert.deepEqual([r.count, r.room, r.doing.length], [2, 3, 4]);
    assert.deepEqual(roomLines(r), ['  react-finish: #507 React finish and 2 more (#529, #514)', '  app-split: #543 Split the app']);
    assert.deepEqual([roomToStart(doing.slice(0, 4), 5).count, roomToStart(doing.slice(0, 4), 5).room], [4, 1], 'without the sessions every card counts, as before');
  });
  it('a card in progress that no session holds still counts', () => {
    const r = roomToStart(doing, 5, [session('app-split', [543])]);
    assert.equal(r.count, 5);
    assert.equal(roomLines(r).at(-1), '  no session: #600 Loose end');
  });
  it('a session with no card in progress does not count, and is named as a leftover', () => {
    const r = roomToStart(doing, 5, [session('app-split', [543]), session('shipped', [620]), session('gone', [999]), session('built', [610])]);
    assert.deepEqual([r.work.map((w) => w.topic).filter(Boolean), r.leftover], [['app-split'], ['shipped', 'gone']], 'a session waiting for the owner is neither');
    assert.equal(roomLines(r).at(-1), 'left over: shipped, gone: clean them with node workflow/scripts/session.mjs --clean');
  });
  it('a session started without a card counts once, until its work is on main', () => {
    const r = roomToStart(doing.slice(3, 4), 5, [session('app-split', [543]), session('try-out', []), session('old-try', [], true)]);
    assert.deepEqual([r.count, r.leftover], [2, ['old-try']]);
    assert.equal(roomLines(r)[1], '  try-out: no card');
  });
});

describe('the focus block', () => {
  it('proposes one block per theme from the startable cards, best first, with a rough length', () => {
    const blocks = proposeBlocks(cards, { areas, size: 1 });
    assert.deepEqual(blocks.map((b) => [b.theme, b.cards.map((c) => c.number), b.more]), [['area: Backend', [7], 1], ['area: UI', [1], 1], [HEALTH, [4], 0]]);
    assert.equal(proposeBlocks(cards, { areas })[0].days, 5); // small + large
    assert.match(renderBlocks(blocks), /- Backend: 1 card, about 1 session \(1 more for a later block\)\n    #7 Sign-in crashes .*\n    pick it: npm run board -- --focus "area: Backend"/);
  });
  it('says where the picked block stands, and offers only its cards', () => {
    const s = focusState(cards, { theme: 'area: UI', cards: [1, 2, 5, 6, 8, 99] });
    assert.deepEqual([s.done, s.left.map((c) => c.number), s.doing.map((c) => c.number), s.check.map((c) => c.number), s.held.map((c) => c.number), s.finished], [1, [1, 2], [5], [6], [8], false]);
    assert.equal(focusLine(s), 'focus: UI (1 of 6 done, #5 in progress, #6 waiting for you to try, 2 to start, #8 held up)');
  });
  it('is finished when only cards waiting for the owner are left', () => {
    assert.equal(focusState(cards, { theme: 'area: UI', cards: [6, 99] }).finished, true);
  });
  it('names what the owner was on, and an urgent bug outside the block', () => {
    assert.equal(whereYouWere(cards), 'in progress: #5 Week header | built, waiting for you to try: #6 Goal form');
    assert.deepEqual(urgentOutside(cards, { theme: 'area: UI', cards: [1, 2] }).map((c) => c.number), [7]);
  });
  it('lists every open card for a full clean-up, by theme, the most incomplete first, a page at a time', () => {
    const now = new Date('2026-11-20T00:00:00Z');
    const groups = sweepGroups([...cards, card(9, 'Old idea', 'Backlog', [], { updatedAt: '2026-08-01T00:00:00Z' })], { areas, types: ['ui', 'feature', 'bug'], now });
    assert.deepEqual(groups.map((g) => [g.theme, g.cards.map((c) => c.number)]), [['area: UI', [5, 6, 8, 1, 2]], ['no area', [9]], ['area: Backend', [3, 7]], [HEALTH, [4]]]);
    assert.deepEqual(groups[1].cards[0], { number: 9, title: 'Old idea', column: 'Backlog', missing: ['area', 'type', 'value', 'effort'], days: 111 });
    assert.match(renderSweep(groups), /^sweep: 9 open cards in 4 themes.*\n- UI: 5 cards, 3 with something missing, 0 untouched for two months {3}\(npm run board -- --sweep "area: UI"\)/);
    assert.equal(renderSweep(groups, 'ui', 0, 2), 'sweep: UI, cards 1 to 2 of 5\n#5 Week header | In progress | missing: value, effort | 0 days untouched\n#6 Goal form | Waiting for your check | missing: value, effort | 0 days untouched\n(3 more: npm run board -- --sweep "area: UI" --from 2)');
    assert.match(renderSweep(groups, 'Trips'), /no open card has the theme "Trips"/);
  });
  it('keeps the cards an agent made apart until the owner lets them in, and finds the old ones to let go', () => {
    const now = new Date('2026-11-20T00:00:00Z');
    const more = [card(10, 'Noticed', 'Backlog', ['bug', 'to sort']), card(11, 'Old', 'Backlog', ['feature'], { updatedAt: '2026-08-01T00:00:00Z' }),
      card(12, 'Old but wanted', 'Backlog', ['feature', 'value: high'], { updatedAt: '2026-08-01T00:00:00Z' })];
    assert.deepEqual(toSort([...cards, ...more], 'to sort').map((c) => c.number), [10]);
    assert.deepEqual(expired([...cards, ...more], { now }), [{ number: 11, title: 'Old', days: 111 }]);
    assert.deepEqual([roomToStart(cards, 1).room, roomToStart(cards, 3).room], [0, 2]);
    assert.ok(!proposeBlocks([...cards, ...more], { areas }).some((b) => b.cards.some((c) => c.number === 10)), 'a card waiting for the yes is never offered');
  });
  it('takes the goals from where the phase says, and suggests what is due, the closest and the biggest', () => {
    assert.deepEqual([sourcesFor('prototype')[0], sourcesFor('pilot')[0], sourcesFor('production')[0], sourcesFor('pilot', ['health'])], ['requests', 'feedback', 'signals', ['health']]);
    const fb = labelGoal('feedback', 'What your users reported', [card(30, 'Hard to find', 'Backlog', ['feedback'])], ['feedback']);
    assert.deepEqual([fb.cards, fb.due], [[30], true]);
    const goal = (id: string, done: number, left: number) => ({ id, name: id, kind: 'request', done, left, total: done + left, cards: [], uncarded: left, notes: [] });
    const goals = [goal('a', 9, 1), goal('b', 2, 12), goal('c', 5, 3), goal('d', 4, 0), fb];
    assert.deepEqual(suggestGoals(goals, 4).map((g) => g.id), ['feedback', 'a', 'c', 'b']);
    assert.match(renderGoals(suggestGoals(goals, 2), goals), /^1 of 4 kinds of request are finished\ngoals to pick from[^]*- What your users reported \(from your users, due\): 1 card\n {4}1 card \(#30\)\n {4}pick it: npm run board -- --focus "feedback"[^]*\(2 more goals/);
  });
  it('a health goal is due when a number got worse since it was picked, and says the numbers', () => {
    const g = healthGoal(cards, { 'long functions': 9, 'flaky tests': 1 }, { 'long functions': 7, 'flaky tests': 1 });
    assert.deepEqual([g.due, g.cards, g.notes], [true, [4], ['9 long functions, 1 flaky tests', 'worse since this goal was last picked: long functions 7 to 9']]);
    assert.equal(healthGoal(cards, { 'long functions': 9 }, { 'long functions': 9 }).due, false);
    const s = focusState(cards, { theme: 'x', cards: [1, 5] });
    assert.equal(goalLine({ id: 'request:a', name: 'Hikes to a top', kind: 'request', done: 14, left: 12, total: 26, cards: [1, 5], uncarded: 3, notes: [] }, s), 'goal: Hikes to a top: 14 of 26 done (#5 in progress, 1 to start; 3 things left with no card yet)');
  });
  it('finds code health due after enough shipped cards since the last such card', () => {
    const closed = (n: number, labels: string[], at: string) => card(n, 'x', 'Done', labels, { state: 'closed', updatedAt: at });
    const shipped = [closed(20, [HEALTH], '2026-11-01T00:00:00Z'), closed(21, ['ui'], '2026-10-01T00:00:00Z'), ...[22, 23, 24].map((n) => closed(n, ['ui'], '2026-11-10T00:00:00Z'))];
    assert.deepEqual(upkeepDue([...cards, ...shipped], { every: 3 }), { due: true, shipped: 3, open: 1, never: false });
    assert.equal(upkeepDue([...cards, ...shipped]).due, false);
    assert.match(renderBlocks(proposeBlocks(cards, { areas }), { due: true, shipped: 9, open: 1 }), /^code health is due: 9 cards shipped since the last block .*take that block next\n[^]*- Code health: 1 card, about 1 session \(due\)/);
    assert.match(renderBlocks(proposeBlocks(cards, { areas }), { due: true, shipped: 9, open: 1 }, { show: 1 }), /- Backend[^]*- Code health[^]*\(1 more theme: UI; all of them: --focus --all\)$/);
    assert.match(renderBlocks(proposeBlocks(cards, { areas: [] })), /\(5 cards have no area label, so no block: the board tidy-up gives each one\)$/);
    assert.match(renderBlocks([], { due: true, shipped: 9, open: 0 }), /no such card is open: .*npm run health/);
    assert.match(renderBlocks([], { due: true, shipped: 9, open: 0, never: true }), /9 cards shipped and none of them was performance/);
  });
});
