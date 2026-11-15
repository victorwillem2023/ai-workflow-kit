// What the import graph sees (tools/workflow/lib/graph.mjs) and a layer rule's stated exception (lib/boundaries.mjs).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../../tools/workflow/lib/graph.mjs';
import { findViolations } from '../../tools/workflow/lib/boundaries.mjs';

const files = new Map(Object.entries({
  'src/web/main.tsx': "if (import.meta.env.DEV) import('../variants');\n",
  'src/web/app.tsx': "const s = require('../server/s');\nconst t = import(`../server/t`);\n",
  'src/variants/index.tsx': 'export {};\n',
  'src/server/s.ts': 'export {};\n',
  'src/server/t.ts': 'export {};\n',
}));
const graph = buildGraph(files);

describe('imports the graph sees', () => {
  it('a folder import is its index file, also index.tsx', () => {
    assert.deepEqual(graph.imports.get('src/web/main.tsx'), ['src/variants/index.tsx']);
  });
  it('require() and import() with a plain template string count as imports, so no layer rule can be slipped past with them', () => {
    assert.deepEqual([...(graph.imports.get('src/web/app.tsx') ?? [])].sort(), ['src/server/s.ts', 'src/server/t.ts']);
  });
});

describe('a stated exception to a layer rule', () => {
  const rule = { name: 'variants are throwaway', from: 'src/web/**', forbid: ['src/variants/**'] };
  it('without it the start file loading the variants page is a violation; with it, only that file is let through', () => {
    assert.equal(findViolations(graph, [rule]).length, 1);
    assert.deepEqual(findViolations(graph, [{ ...rule, except: ['src/**/main.{ts,tsx}'] }]), []);
    const other = buildGraph(new Map([...files, ['src/web/list.tsx', "import { A } from '../variants';\n"]]));
    assert.deepEqual(findViolations(other, [{ ...rule, except: ['src/**/main.{ts,tsx}'] }]).map((v) => v.file), ['src/web/list.tsx']);
  });
});
