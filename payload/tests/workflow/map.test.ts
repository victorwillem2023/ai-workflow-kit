// The file map (tools/workflow/lib/map.mjs): one line per source file, from its opening comment and imports.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { summaryOf, renderMap, sameMap, findInMap, usesInMap, withoutImports } from '../../tools/workflow/lib/map.mjs';
import { buildGraph } from '../../tools/workflow/lib/graph.mjs';

describe('file map', () => {
  it('takes the first sentence of a file\'s opening comment, across lines', () => {
    const src = '// The energy an outing costs (D11, board 43), from your weight\n// along the route. Pure.\nimport x from "./x";\n';
    assert.equal(summaryOf(src), 'The energy an outing costs (D11, board 43), from your weight along the route.');
  });
  it('skips a shebang and reads a block comment too', () => {
    assert.equal(summaryOf('#!/usr/bin/env node\n// The gate: one command. More.\n'), 'The gate: one command.');
    assert.equal(summaryOf('/* Styles for x.\n * more */\n'), 'Styles for x.');
  });
  it('says "(no opening comment)" for a file that has none', () => {
    assert.equal(summaryOf('export const a = 1;\n'), '(no opening comment)');
  });
  it('lists each file with the project files it imports, grouped by folder', () => {
    const files = new Map([
      ['src/core/a.ts', '// Alpha thing. Detail.\nimport { b } from "./b";\n'],
      ['src/core/b.ts', '// Beta thing.\n'],
      ['src/web/c.ts', '// Gamma.\nimport { a } from "../core/a";\nimport { b } from "../core/b";\n'],
    ]);
    const md = renderMap(buildGraph(files), ['src/core/**', 'src/web/**']);
    assert.match(md, /## src\/core\n/);
    assert.match(md, /- `a\.ts`: Alpha thing\. → b\n/);
    assert.match(md, /- `b\.ts`: Beta thing\.\n/);
    assert.match(md, /- `c\.ts`: Gamma\. → core\/a, core\/b\n/);
  });
});

describe('file map banners', () => {
  it('ignores ==== banner lines around a title', () => {
    const src = '// ==========\n// Famous recipes. Official versions.\n// ==========\n';
    assert.equal(summaryOf(src), 'Famous recipes.');
  });
});

describe('file map staleness', () => {
  it('a map that differs from what the code would write now is out of date, line endings aside', () => {
    assert.ok(sameMap('a\r\nb\r\n', 'a\nb\n'));
    assert.ok(!sameMap('a\nb\n', 'a\nc\n'));
    assert.ok(!sameMap(null, 'a\n'));
  });
});

describe('file map find', () => {
  const map = [
    '# File map', '', 'intro line', '',
    '## src/core', '- `a.ts`: Alpha route thing.', '- `b.ts`: Beta thing.', '',
    '## src/web', '- `c.ts`: Gamma Route view. \u2192 core/a', '- `d.ts`: Delta.', '',
  ].join('\n');
  it('map find returns exactly the two lines that contain the word, each under its folder heading', () => {
    const r = findInMap(map, ['route'], 40);
    assert.deepEqual(r.lines, ['## src/core', '- `a.ts`: Alpha route thing.', '## src/web', '- `c.ts`: Gamma Route view. \u2192 core/a']);
    assert.equal(r.more, 0);
  });
  it('map find needs every word and ignores case', () => {
    assert.deepEqual(findInMap(map, ['ROUTE', 'gamma'], 40).lines, ['## src/web', '- `c.ts`: Gamma Route view. \u2192 core/a']);
    assert.deepEqual(findInMap(map, ['route', 'delta'], 40).lines, []);
  });
  it('map find says nothing matches for an unknown word and exits 1', () => {
    const r = spawnSync(process.execPath, ['tools/workflow/map.mjs', '--find', 'zzqxunknownword'], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /map: nothing matches zzqxunknownword/);
  });
  it('map find matches the description only, not the files that import a word', () => {
    assert.deepEqual(findInMap(map, ['core'], 25).lines, []);
    assert.equal(findInMap(map, ['gamma'], 25).lines.length, 2);
  });
  it('map uses lists the files that import a given file, each under its folder heading', () => {
    const m = map + '- `e.ts`: Epsilon. \u2192 core/a, core/ab\n';
    assert.deepEqual(usesInMap(m, 'core/a', 25).lines, ['## src/web', '- `c.ts`: Gamma Route view. \u2192 core/a', '- `e.ts`: Epsilon. \u2192 core/a, core/ab']);
    assert.equal(usesInMap(m, 'core/ab', 25).lines.length, 2);
    assert.deepEqual(usesInMap(m, 'core', 25).lines, []);
  });
  it('map uses says nothing matches for a file nobody imports and exits 1', () => {
    const r = spawnSync(process.execPath, ['tools/workflow/map.mjs', '--uses', 'core/zzqxnobody'], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /map: nothing matches core\/zzqxnobody/);
  });
  it('map find prints a line without its imports (--imports keeps them)', () => {
    assert.equal(withoutImports('- `c.ts`: Gamma Route view. \u2192 core/a'), '- `c.ts`: Gamma Route view.');
    assert.equal(withoutImports('- `d.ts`: Delta.'), '- `d.ts`: Delta.');
    assert.equal(withoutImports('## src/web'), '## src/web');
  });
  it('map find stops at 25 lines and says how many more there are', () => {
    const big = '## d\n' + Array.from({ length: 45 }, (_, i) => '- `f' + i + '.ts`: thing.').join('\n') + '\n';
    const r = findInMap(big, ['thing'], 25);
    assert.equal(r.lines.length, 24, 'heading plus 23 files; the last line is kept for the note');
    assert.equal(r.more, 22);
  });
});
