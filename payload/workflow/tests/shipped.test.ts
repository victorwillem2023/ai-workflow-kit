// What each shipped card took (lib/shipped.mjs): the record a finish keeps, what the builder notes on it, and what the records
// say together: what the effort labels really mean here, which files got in the way, what the review keeps finding.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addRecord, areaFiles, calibrate, hardFiles, parseHard, parseNumstat, parseRecords, parseReview, recordsText, reviewPatterns, shipRecord, tookLines, withNote } from '../../workflow/tools/lib/shipped.mjs';
import { rankCards, scoreCard } from '../../workflow/tools/lib/rank.mjs';
import { hotspots } from '../../workflow/tools/lib/hotspots.mjs';

const rec = (topic: string, effort: string | null, lines: number, more: Record<string, unknown> = {}) => ({ at: '2026-11-01T10:00:00.000Z', topic, cards: [], subject: '', started: null, days: null,
  files: ['src/a.ts'], lines, effort, areas: [] as string[], type: null, tokens: null, rounds: null, review: null, hard: [] as { file: string; why: string }[], ...more });
const many = (effort: string, sizes: number[], more: Record<string, unknown> = {}) => sizes.map((n, i) => rec(`${effort}-${n}-${i}`, effort, n, more));

describe('the record a finish keeps', () => {
  it('counts the lines and files of the change, without the files a script writes', () => {
    const files = parseNumstat('10\t2\tsrc/a.ts\n-\t-\tlogo.png\n400\t0\tpackage-lock.json\n90\t90\tdocs/MAP.md\n3\t0\tdocs/guide/plans.md\n');
    assert.deepEqual(files, [{ file: 'src/a.ts', lines: 12 }, { file: 'logo.png', lines: 0 }, { file: 'docs/guide/plans.md', lines: 3 }]);
  });
  it('takes the effort, area and type from the cards\' labels, the biggest effort when cards were built as one', () => {
    const r = shipRecord({ topic: 'rest-week', cards: ['12', '14'], subject: 'Plans: a rest week', at: '2026-11-10T12:00:00Z', started: '2026-11-08T09:00:00+01:00',
      numstat: '10\t2\tsrc/a.ts\n', labels: ['feature', 'effort: small', 'effort: large', 'area: Plans', 'value: high'], areas: ['area: UI', 'area: Plans'], types: ['ui', 'feature'] });
    assert.deepEqual([r.cards, r.effort, r.areas, r.type, r.lines, r.days], [[12, 14], 'large', ['area: Plans'], 'feature', 12, 2]);
    assert.deepEqual([r.rounds, r.review, r.hard], [null, null, []]);
  });
  it('keeps a record without labels or a start, and reads its own lines back', () => {
    const r = shipRecord({ topic: 'x', numstat: '' });
    assert.deepEqual([r.effort, r.days, r.lines, r.tokens], [null, null, 0, null]);
    assert.deepEqual(parseRecords(recordsText([r]) + 'not json\n{"other":1}\n'), [r]);
  });
  it('a finish of the same topic again replaces its record and keeps what was noted', () => {
    const first = { ...rec('pr', 'small', 100), rounds: 2 };
    const again = addRecord([rec('other', 'small', 5), first], rec('pr', 'small', 140, { at: '2026-11-03T10:00:00.000Z' }));
    assert.deepEqual(again.map((r) => [r.topic, r.lines, r.rounds]), [['other', 5, null], ['pr', 140, 2]]);
    assert.equal(addRecord([first], rec('pr', 'small', 9, { at: '2027-03-01T10:00:00.000Z' })).length, 2, 'months later it is another feature');
  });
});

describe('what the builder notes at /ship', () => {
  it('reads the review\'s findings by kind; an unknown kind counts as other, none as a clean review', () => {
    assert.deepEqual(parseReview('two-ways=1, tests: 2; naming'), { 'two-ways': 1, tests: 2, other: 1 });
    assert.deepEqual([parseReview('none'), parseReview(undefined)], [{}, null]);
  });
  it('a file that got in the way needs the file and the reason', () => {
    assert.deepEqual(parseHard('src\\core\\plan.ts: every caller builds its own week'), { file: 'src/core/plan.ts', why: 'every caller builds its own week' });
    assert.equal(parseHard('the planner was hard'), null);
  });
  it('adds the note to the topic\'s last record, and says when there is none', () => {
    const { records, found } = withNote([rec('a', 'small', 10), rec('b', 'small', 10)], 'a', { rounds: 3, review: { tests: 1 }, hard: [{ file: 'src/a.ts', why: 'two jobs' }] });
    assert.deepEqual([found, records[0].rounds, records[0].review, records[0].hard.length, records[1].rounds], [true, 3, { tests: 1 }, 1, null]);
    assert.equal(withNote(records, 'nope', { rounds: 1 }).found, false);
  });
});

describe('what the records say together', () => {
  const records = [...many('small', [80, 100, 120, 90, 110]), ...many('medium', [300, 340, 280, 360, 320]), ...many('large', [900, 1000])];
  it('measures a medium card in small ones once both have five shipped cards; a label with fewer keeps its usual cost', () => {
    const c = calibrate(records);
    assert.deepEqual([c.by.small.lines, c.by.medium.lines, c.cost], [100, 320, { small: 1, medium: 3.2, large: 4, measured: ['small', 'medium'] }]);
    assert.equal(calibrate(many('small', [80, 100, 120, 90, 110])).cost, null, 'small alone measures nothing');
    assert.equal(calibrate(records.slice(1)).cost, null, 'four small cards are not enough');
  });
  it('keeps the measured cost between sensible ends, and a large card never cheaper than a medium one', () => {
    const c = calibrate([...many('small', [10, 10, 10, 10, 10]), ...many('medium', [900, 900, 900, 900, 900]), ...many('large', [20, 20, 20, 20, 20])]);
    assert.deepEqual([c.cost?.medium, c.cost?.large], [4, 4]);
  });
  it('names an area whose cards run bigger than their label, and the cards far bigger than they looked', () => {
    const ui = many('small', [200, 220, 180, 210], { areas: ['area: UI'] });
    const c = calibrate([...records, ...ui, rec('huge', 'small', 400, { cards: [41], rounds: 4 })]);
    // (its own cards pull the label's usual size up too: 150 lines now, so twice a plain small card reads as 1.4 times the label)
    assert.deepEqual(c.areas, { 'area: UI': 1.4 });
    assert.deepEqual(c.outliers.map((r) => r.topic), ['huge']);
  });
  it('the ranking counts effort with what was measured, and says so', () => {
    const card = (number: number, labels: string[]) => ({ number, title: `card ${number}`, state: 'open', labels, column: 'Backlog' });
    const cards = [card(1, ['value: high', 'effort: medium']), card(2, ['value: medium', 'effort: small']), card(3, ['value: high', 'effort: small', 'area: UI'])];
    assert.deepEqual(rankCards(cards).map((c) => c.number), [3, 2, 1], 'by the labels: a small card of high value first, then medium for small against high for medium, by number');
    const measured = { cost: { small: 1, medium: 1.2, large: 4, measured: ['small', 'medium'] }, areas: { 'area: UI': 2 } };
    const ranked = rankCards(cards, { measured });
    assert.deepEqual(ranked.map((c) => c.number), [1, 2, 3]);
    assert.match(ranked[0].why, /effort medium \(measured: 1\.2 small ones\)/);
    assert.match(ranked[2].why, /effort small \(UI cards run 2 times their label\)/);
    assert.equal(scoreCard(card(4, ['value: high']), undefined, measured).score, scoreCard(card(4, ['value: high'])).score, 'a card with no effort label is counted as before');
  });
  it('a file that got in the way of two cards is named, and is one of the things the code says to work on', () => {
    const hard = hardFiles([rec('a', 'small', 10, { cards: [12], hard: [{ file: 'src/plan.ts', why: 'two jobs in one function' }] }), rec('b', 'small', 10, { hard: [{ file: 'src/plan.ts', why: 'no seam for the week' }, { file: 'src/once.ts', why: 'x' }] })]);
    assert.deepEqual(hard, [{ file: 'src/plan.ts', cards: ['#12', 'b'], whys: ['two jobs in one function', 'no seam for the week'] }]);
    const spot = hotspots({ hard })[0];
    assert.deepEqual([spot.kind, spot.files], ['in-the-way', ['src/plan.ts']]);
    assert.match(spot.what, /^src\/plan\.ts got in the way of 2 shipped cards \(#12, b\): no seam for the week$/);
  });
  it('the files an area\'s cards usually change: in half of its last cards and at least two, docs left out', () => {
    const ui = (files: string[]) => rec('u', 'small', 10, { areas: ['area: UI'], files });
    const list = areaFiles([ui(['src/web/page.ts', 'README.md']), ui(['src/web/page.ts', 'src/web/once.ts', 'README.md']), ui(['src/web/other.ts']), rec('p', 'small', 10, { areas: ['area: Plans'], files: ['src/web/page.ts'] })], 'area: UI');
    assert.deepEqual(list, [{ file: 'src/web/page.ts', of: 2, total: 3 }]);
  });
  it('a kind of finding the review keeps making is said, with where to catch it', () => {
    const reviewed = [{ 'two-ways': 1 }, { 'two-ways': 2, tests: 1 }, {}, { 'two-ways': 1 }].map((review, i) => rec(`r${i}`, 'small', 10, { review }));
    assert.deepEqual(reviewPatterns(reviewed).map((p) => [p.kind, p.cards, p.of]), [['two-ways', 3, 4]]);
    assert.deepEqual(reviewPatterns(reviewed.slice(0, 2)), [], 'two cards are no pattern');
  });
  it('says it all in plain lines, and says so when nothing is on record', () => {
    assert.match(tookLines([])[0], /no record yet/);
    const lines = tookLines([...records, rec('huge', 'small', 400, { cards: [41], rounds: 4, at: '2026-11-19T10:00:00.000Z' })], { since: new Date('2026-11-15') });
    assert.match(lines[0], /13 shipped features on record, 1 since 2026-11-15/);
    assert.ok(lines.some((l) => /small \(6\): typically 105 lines changed in 1 file, 4 rounds with you/.test(l)), lines.join('\n'));
    assert.ok(lines.some((l) => /measured: a medium card is 3 small ones and a large one 4/.test(l)), lines.join('\n'));
    assert.ok(lines.some((l) => /bigger than they looked: #41 \(small: 400 lines, 4 rounds\)/.test(l)), lines.join('\n'));
  });
});

describe('what a card cost under each kit version', async () => {
  const { kitLine } = await import('../../workflow/tools/lib/shipped.mjs');
  it('keeps the kit version on the record', () => {
    assert.equal(shipRecord({ topic: 'a', kit: '4.7.0' }).kit, '4.7.0');
    assert.equal(shipRecord({ topic: 'a' }).kit, null);
  });
  it('says nothing until two kit versions have three cards of one size with a token count, then one line', () => {
    const on = (kit: string, tokens: number[]) => tokens.map((t, i) => rec(`${kit}-${i}`, 'small', 40, { kit, tokens: t }));
    assert.equal(kitLine([...on('4.6.0', [300_000, 310_000, 320_000]), ...on('4.7.0', [200_000, 210_000])]), null);
    assert.equal(kitLine([...on('4.6.0', [300_000, 310_000, 320_000]), ...on('4.6.1', [100_000]), ...on('4.7.0', [200_000, 210_000, 260_000])]),
      "  what a small card's session used, by kit version: kit 4.6: 305 k tokens (4 cards); kit 4.7: 210 k tokens (3 cards)");
  });
});
