// Today's work (lib/today.mjs): the free room filled in the goal's order, one session per free place, and what waits said on an
// "after" line with why.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { besideLine, today, todayLines, touchedParts } from '../../workflow/tools/lib/today.mjs';

const card = (number: number, labels: string[], column = 'Ready', body = '') => ({ number, title: `Card ${number}`, state: 'open', labels, column, body });
const areas = ['area: UI', 'area: Backend', 'area: Trips', 'area: Places'];

describe("today's work", () => {
  it('with 2 of 5 in progress, today offers 3 sessions that share no part, and a small card gets a place of its own', () => {
    const running = [card(500, ['area: UI', 'effort: medium'], 'In progress'), card(501, ['area: Backend', 'effort: medium'], 'In progress')];
    const ranked = [card(561, ['effort: small', 'area: Trips']), card(131, ['effort: medium']), card(562, ['effort: medium']), card(383, ['effort: large'])];
    const places = new Map([[131, ['Finding the places']], [562, ['Finding the places']], [383, ['Making the candidates']]]);
    const t = today(ranked, { all: [...running, ...ranked], places, areas, limit: 5 });
    assert.deepEqual(t.sessions, [[561], [131], [383]]);
    assert.deepEqual(t.after, [{ card: 562, by: 131, place: 'Finding the places', running: false }], 'the clash lands on the after line');
    const lines = todayLines(t);
    assert.equal(lines[0], 'today: 3 of 5 free -> /work 561 131 383 (3 sessions side by side)');
    assert.equal(lines[1], 'after: #562 after #131, both change Finding the places');
  });
  it('a small card joins another small card on the same part; a card on a part already in progress waits for it', () => {
    const running = [card(500, ['area: UI', 'effort: medium'], 'In progress')];
    const ranked = [card(1, ['area: Trips', 'effort: small']), card(2, ['area: Trips', 'effort: small']), card(3, ['area: UI', 'effort: medium'])];
    const t = today(ranked, { all: [...running, ...ranked], areas, limit: 3 });
    assert.deepEqual(t.sessions, [[1, 2]]);
    assert.match(todayLines(t).join('\n'), /#3 after #500 \(in progress\), both change UI/);
  });
  it('a card that needs a picked card first is said after it; no room says so; one card asked about says whether it fits', () => {
    const ranked = [card(10, ['area: Trips', 'effort: medium'])];
    const all = [...ranked, card(11, ['area: UI', 'effort: medium'], 'Backlog', 'Depends on: #10')];
    const t = today(ranked, { all, areas, limit: 2 });
    assert.match(todayLines(t).join('\n'), /#11 needs #10 first/);
    assert.equal(besideLine(t, 10), 'board: #10 fits beside the work running (0 of 2 in progress, 2 free): /work 10');
    const full = today(ranked, { all: [card(1, [], 'In progress'), card(2, [], 'In progress'), ...ranked], areas, limit: 2 });
    assert.match(todayLines(full)[0], /^today: no room \(2 of 2 in progress\)/);
  });
  it('names the cards it could not check: no part on the map and no area', () => {
    const t = today([card(131, ['effort: medium'])], { areas, limit: 2 });
    assert.match(todayLines(t).join('\n'), /#131: no part on the app map, no "Touches" line and no area label/);
  });
  it('a small card that joins a session still waits for a part in progress, and what it changes is the session\'s from then on', () => {
    const running = [card(500, ['effort: medium'], 'In progress', 'Touches: src/core/geo.ts')];
    const a = card(1, ['effort: small'], 'Ready', 'Touches: src/web/a.ts');
    const b = card(2, ['effort: small'], 'Ready', 'Touches: src/web/b.ts, src/core/pace.ts');
    const c = card(3, ['effort: small'], 'Ready', 'Touches: src/web/c.ts, src/data/store.ts');
    const big = card(4, ['effort: medium'], 'Ready', 'Touches: src/data/load.ts');
    const t = today([a, b, c, big], { all: [...running, a, b, c, big], areas, limit: 4 });
    assert.deepEqual(t.sessions, [[1, 3]], '#2 would join, but src/core is in progress');
    assert.deepEqual(t.after.map((x) => [x.card, x.by]), [[2, 500], [4, 3]], '#4 changes src/data, which the joined #3 changes');
  });
  it('checks the files a running session really changes first, and two exact claims in one folder do not wait for each other', () => {
    const running = [card(653, ['effort: medium'], 'In progress')];
    const a = card(379, ['effort: medium']);
    const b = card(380, ['effort: medium']);
    const claims = new Map([[653, ['src/pipeline/climb/route-up.ts']], [379, ['src/pipeline/climb/route-up.ts', 'src/pipeline/climb/from-start.ts']], [380, ['src/pipeline/climb/notes.ts']]]);
    const places = new Map([[379, ['Finding the way up']], [380, ['Finding the way up']], [653, ['Finding the way up']]]);
    const t = today([a, b], { all: [...running, a, b], places, areas, limit: 4, claims, held: [{ topic: 'climb-trip', cards: [653], files: ['src/pipeline/climb/route-up.ts'] }] });
    assert.deepEqual(t.sessions, [[380]], 'the same place on the map, but not the same files');
    assert.deepEqual(t.after, [{ card: 379, by: 653, place: 'src/pipeline/climb/route-up.ts', running: true }]);
    const idle = today([b], { all: [b], areas, limit: 4, held: [{ topic: 'spike-notes', cards: [], files: ['src/pipeline/climb/notes.ts'] }], claims });
    assert.match(todayLines(idle).join('\n'), /#380 after session "spike-notes" \(in progress\), both change src\/pipeline\/climb\/notes.ts/);
    const handed = today([a], { all: [card(653, ['effort: medium'], 'Waiting for your check'), a], areas, limit: 4, claims, held: [{ topic: 'climb-trip', cards: [653], files: ['src/pipeline/climb/route-up.ts'] }] });
    assert.deepEqual(handed.after.map((x) => [x.card, x.by]), [[379, 653]], 'a session handed over to the owner still holds its files');
    const own = today([a], { all: [a], areas, limit: 4, claims, held: [{ topic: 'from-start', cards: [379], files: ['src/pipeline/climb/route-up.ts'] }] });
    assert.deepEqual(own.after, [], 'a card never waits for its own session');
  });
  it('reads a card\'s Touches line for its parts when the map has none, so two cards on one folder do not run side by side', () => {
    assert.deepEqual(touchedParts('Why: x\n**Touches:** src/web/controller.ts, src/web/panels/results.ts and src/core/geo.ts'), ['src/web', 'src/web/panels', 'src/core']);
    const a = card(131, ['effort: medium'], 'Ready', 'Touches: src/core/geo.ts');
    const b = card(378, ['effort: medium'], 'Ready', 'Touches: src/core/scoring.ts');
    const t = today([a, b], { areas, limit: 3 });
    assert.deepEqual([t.sessions, t.after.map((x) => [x.card, x.by, x.place])], [[[131]], [[378, 131, 'src/core']]]);
  });
});
