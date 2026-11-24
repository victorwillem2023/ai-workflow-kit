// The files a session holds (lib/claims.mjs): what a claim is made of, what is never held, where two claims meet, and what is
// said when they do (the refusal, the gate's advice, the note for the builder beside).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DOCS, stackOf, besideNote, claimOf, clashAdvice, clashes, clashMessage, meet, setTouches, settledFiles, sharedFiles, specFiles, specSection, touchedPaths } from '../../workflow/tools/lib/claims.mjs';

const SPEC = `# Spec: from-start
Card: #379

## What the user sees
A start you type is used for each way up.

## The rule and who shares it
The route joins the nearest way up; a link over 8 km leaves it at its own trailhead. Shared with \`src/pipeline/climb/ways-up.ts\`, read only.

## Files that change
- \`src/pipeline/climb/from-start.ts\` (new)
- \`src/pipeline/climb/route-up.ts\`
- \`workflow/config.json\`: \`board.wip\` goes to 3, read as \`c.labels\`

## Tests (written first)
- \`tests/from-start.test.ts\`

## Docs that change
- \`docs/ARCHITECTURE.md\`, guide and app map: the next \`/docs catch-up\`
`;

describe('what a session holds', () => {
  it('a spec holds the files it changes and its tests: not the files it only reads, its docs, or code names', () => {
    assert.deepEqual(specFiles(SPEC), ['src/pipeline/climb/from-start.ts', 'src/pipeline/climb/route-up.ts', 'workflow/config.json', 'tests/from-start.test.ts']);
    assert.ok(specFiles('Some text naming `src/a.ts` and nothing else').includes('src/a.ts'), 'a spec without those headings: every path it names');
  });

  it('a claim is the spec, the Touches paths and the changes, without what has a rule of its own', () => {
    const never = [...settledFiles({}), ...DOCS, ...sharedFiles('- **Shared files** (`README.md`, `docs/GUIDE.md`, `docs/guide/`, <other files every feature touches>): edit only your own')];
    assert.deepEqual(never.slice(-3), ['README.md', 'docs/GUIDE.md', 'docs/guide/**']);
    const claim = claimOf({ spec: SPEC, touches: ['src/core/'], changed: ['src/core/geo.ts', 'README.md', 'docs/guide/hikes.md', 'docs/ARCHITECTURE.md', 'docs/MAP.md', 'package-lock.json', 'workflow/specs/from-start.md'] }, never);
    assert.deepEqual(claim, ['src/core/', 'src/core/geo.ts', 'src/pipeline/climb/from-start.ts', 'src/pipeline/climb/route-up.ts', 'tests/from-start.test.ts', 'workflow/config.json']);
    assert.deepEqual(claimOf({ touches: ['docs/guide/'] }, never), [], 'a shared folder is never held whole');
    assert.deepEqual(claimOf({ changed: ['src/core/CLAUDE.md', 'src/core/geo.ts', 'docs/flow/map.js', 'apps/web/package-lock.json', 'go.sum'] }, never), ['src/core/geo.ts'], 'a folder\'s own notes, the map\'s data and every lock file are edited by their own rule');
  });

  it('reads and writes a card\'s Touches line, as /idea writes it or plain', () => {
    assert.deepEqual(touchedPaths('Why: x\n**Touches.** src/web/controller.ts, src/core/ and the results panel.'), ['src/web/controller.ts', 'src/core/']);
    assert.equal(setTouches('Why: x\n\nTouches: src/a.ts\n\nDepends on: #4', ['src/b.ts', 'src/c/']), 'Why: x\n\nTouches: src/b.ts, src/c/\n\nDepends on: #4');
    assert.equal(setTouches('Why: x', ['src/b.ts']), 'Why: x\n\nTouches: src/b.ts\n');
    assert.deepEqual(touchedPaths('Touches: package.json, index.html and board.wip, e.g. the panel'), ['package.json', 'index.html'], 'a file at the root counts, a code name does not');
    assert.deepEqual(touchedPaths('Touches: src/routes/+page.svelte, app/[slug]/page.tsx, (app/(shop)/cart/page.tsx), app/routes/$id.tsx.'), ['src/routes/+page.svelte', 'app/[slug]/page.tsx', 'app/(shop)/cart/page.tsx', 'app/routes/$id.tsx'], 'route files, and a path in brackets');
    assert.deepEqual(specFiles('## Tests (written first)\nFor `src/core` / `src/pipeline` a behaviour change needs one: `tests/a.test.ts`'), ['tests/a.test.ts'], 'a folder a spec names in passing is no claim');
    assert.deepEqual(sharedFiles('- **Shared files** (`README.md`, `docs/guide/`,\n  `src/routes.ts`, `src/i18n/en.json`): edit only your own\n  lines.\n- **Next rule**: `src/x.ts`'), ['README.md', 'docs/guide/**', 'src/routes.ts', 'src/i18n/en.json'], 'a bullet that wraps');
  });
});

describe('where two sessions meet', () => {
  it('the same file, or a file inside a folder the other holds; nothing for neighbours in one folder', () => {
    assert.deepEqual(meet(['src/core/geo.ts', 'src/web/'], ['src/core/geo.ts', 'src/web/panels/results.ts']), ['src/core/geo.ts', 'src/web/panels/results.ts']);
    assert.deepEqual(meet(['src/core/geo.ts'], ['src/core/pace.ts']), []);
  });

  it('names the sessions it meets, never the one it is stacked on, and says the ways on', () => {
    const others = [{ topic: 'climb-trip', cards: [653], files: ['src/pipeline/climb/route-up.ts', 'src/core/intent/build.ts'] }, { topic: 'base', cards: [600], files: ['src/pipeline/climb/route-up.ts'] }, { topic: 'far', cards: [1], files: ['src/web/a.ts'] }];
    const found = clashes(['src/pipeline/climb/route-up.ts', 'src/pipeline/climb/from-start.ts'], others, { skip: ['base'] });
    assert.deepEqual(found.map((o) => [o.topic, o.files]), [['climb-trip', ['src/pipeline/climb/route-up.ts']]]);
    const said = clashMessage('from-start', '379', found);
    assert.match(said, /#653 \(session "climb-trip"\): src\/pipeline\/climb\/route-up.ts/);
    assert.match(said, /session.mjs from-start --card 379 --on climb-trip/);
    assert.match(said, /--anyway/);
    const pr = clashMessage('from-start', '379', found, { stack: false });
    assert.doesNotMatch(pr, /--on/, 'with pull requests a session cannot start on another one');
    assert.match(pr, /wait until "climb-trip" is merged/);
    assert.match(clashAdvice(found)[0], /^advice: src\/pipeline\/climb\/route-up.ts is also changed in session "climb-trip" \(#653\)/);
  });

  it('a session built on others shares files with every one below it and every one built on it, at any depth', () => {
    const all = [{ topic: 'a' }, { topic: 'b', on: 'a' }, { topic: 'c', on: 'b' }, { topic: 'd', on: 'c' }, { topic: 'x' }];
    assert.deepEqual(stackOf('c', all).sort(), ['a', 'b', 'd']);
    assert.deepEqual(stackOf('new', all, 'b').sort(), ['a', 'b'], 'a new one stacked on b');
    assert.deepEqual(stackOf('x', all), []);
  });

  it('the note for the builder beside gives each one\'s shared files and its spec\'s rule', () => {
    const note = besideNote('from-start', [{ topic: 'climb-trip', cards: [653], files: ['src/pipeline/climb/route-up.ts'], spec: SPEC }]);
    assert.match(note, /1 running session changes files it changes too/);
    assert.match(note, /#653, session "climb-trip": shares src\/pipeline\/climb\/route-up.ts/);
    assert.match(note, /a link over 8 km leaves it at its own trailhead/);
    assert.match(besideNote('x', [{ topic: 'y', cards: [], files: ['a/b.ts'] }]), /no spec: ask its chat/);
    assert.match(besideNote('x', []), /no running session changes the files it changes/);
    assert.equal(specSection(SPEC, 'What the user sees'), 'A start you type is used for each way up.');
  });
});
