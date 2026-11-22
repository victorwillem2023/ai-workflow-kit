// A card joined to the state of the code (lib/cardcode.mjs): the file it is likely to change, when the code's state already
// points at that file, said under the card so the clean-up is offered right before the card that would pay for the mess again.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { codeAdvice, filesNamed } from '../../workflow/tools/lib/cardcode.mjs';
import { churn, hotspots } from '../../workflow/tools/lib/hotspots.mjs';

const card = (number: number, title: string, labels: string[] = [], body = '') => ({ number, title, state: 'open', labels, body });
const spots = hotspots({
  changes: churn(['src/web/page.ts', 'src/web/page.ts', 'src/web/page.ts', 'src/core/plan.ts', 'src/core/plan.ts', 'src/core/plan.ts'].join('\n')),
  baseline: { sizes: { 'src/web/page.ts': 600 }, untested: ['src/core/plan.ts'] },
});
const shipped = (files: string[]) => ({ at: '2026-11-01T10:00:00.000Z', topic: 't', cards: [], subject: '', started: null, days: null, files, lines: 10, effort: 'small', areas: ['area: UI'], type: null, tokens: null, rounds: null, review: null, hard: [] });

describe('a finished split card', () => {
  it('in Done is not named as the work to do first', () => {
    const split = { ...card(77, 'Split the route page', ['area: Code health'], 'src/web/page.ts in parts'), column: 'Done' };
    const a = codeAdvice(card(42, 'A filter on the route page', [], 'It goes in src/web/page.ts.'), { spots, open: [split], health: 'area: Code health' });
    assert.equal(a?.card, null);
  });
});

describe('the file paths a card names', () => {
  it('finds a path with a folder and an extension, never a web address or a bare word', () => {
    assert.deepEqual(filesNamed('Split `src/web/page.ts` (see tests/web/page.test.ts, src/web/page.ts). Not https://example.com/a/b.html, v1.2/3 or page.ts'), ['src/web/page.ts', 'tests/web/page.test.ts']);
  });
});

describe('a card that will change a file the code points at', () => {
  it('says so when the card names the file, with what is wrong and what to do first', () => {
    const a = codeAdvice(card(42, 'A filter on the route page', [], 'It goes in src/web/page.ts, next to the list.'), { spots });
    assert.equal(a?.line, 'code: #42 is likely to change src/web/page.ts (the card names it), and it changed in 3 commits in 90 days, 600 lines: split it first, or in this card when that fits its size (refactor where you work)');
  });
  it('says so when the shipped cards of its area usually changed the file', () => {
    const records = [shipped(['src/web/page.ts']), shipped(['src/web/page.ts', 'src/web/b.ts']), shipped(['src/web/c.ts'])];
    const a = codeAdvice(card(43, 'A filter on the route page', ['area: UI']), { spots, records, areas: ['area: UI', 'area: Plans'] });
    assert.match(a?.line ?? '', /^code: #43 is likely to change src\/web\/page\.ts \(2 of the last 3 UI cards changed it\), and it changed in 3 commits/);
    assert.equal(codeAdvice(card(44, 'A new plan', ['area: Plans']), { spots, records, areas: ['area: UI', 'area: Plans'] }), null, 'another area has no such history');
  });
  it('asks for a test first when the file is changed often and untested', () => {
    const a = codeAdvice(card(45, 'Rest weeks in src/core/plan.ts'), { spots });
    assert.match(a?.line ?? '', /it is changed often and no test reaches it: pin what it does with a test first \(a test before the change\)$/);
  });
  it('names the open code health card that is that work, instead of asking for a new one', () => {
    const open = [card(77, 'Split src/web/page.ts by what changes together', ['area: Code health']), card(78, 'Mentions src/web/page.ts but is a feature', ['feature'])];
    const a = codeAdvice(card(42, 'A filter in src/web/page.ts'), { spots, open });
    assert.equal(a?.card, 77);
    assert.match(a?.line ?? '', /: #77 is that work: do it first \(npm run board -- --depends 42 77\)$/);
  });
  it('says nothing for a card that touches no such file, or that is the clean-up itself', () => {
    assert.equal(codeAdvice(card(46, 'A new export in src/web/export.ts'), { spots }), null);
    assert.equal(codeAdvice(card(77, 'Split src/web/page.ts', ['area: Code health']), { spots }), null);
  });
  it('a file that got in the way of earlier cards is said in the builders\' words', () => {
    const hard = hotspots({ hard: [{ file: 'src/core/week.ts', cards: ['#12', '#15'], whys: ['every caller builds its own week'] }] });
    assert.match(codeAdvice(card(47, 'Rest weeks, in src/core/week.ts'), { spots: hard })?.line ?? '', /and it got in the way of 2 shipped cards \(#12, #15\): clean that up first/);
  });
});
