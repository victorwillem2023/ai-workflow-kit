// What the import graph sees (workflow/tools/lib/graph.mjs) and a layer rule's stated exception (lib/boundaries.mjs).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aliasesFrom, buildGraph, projectAliases } from '../../workflow/tools/lib/graph.mjs';
import { findViolations } from '../../workflow/tools/lib/boundaries.mjs';

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

describe('path aliases from tsconfig (Next.js and shadcn/ui import with @/)', () => {
  const tsconfig = `{
    // Next.js writes this one
    "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"], "~lib": ["./src/lib/index.ts"], }, },
  }`;
  const aliased = new Map(Object.entries({
    'src/core/plan.ts': "import { db } from '@/server/db';\nimport { z } from 'zod';\nimport { l } from '~lib';\n",
    'src/server/db.ts': 'export const db = 1;\n',
    'src/lib/index.ts': 'export const l = 1;\n',
    'apps/web/src/page.tsx': "import { a } from '@/ui/button';\n",
    'apps/web/src/ui/button.tsx': 'export const a = 1;\n',
  }));
  const aliases = [...aliasesFrom(tsconfig), ...aliasesFrom('{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }', 'apps/web')];
  const g = buildGraph(aliased, [], { aliases });
  it('follows an aliased import like a relative one, so a layer rule sees it, and leaves a package outside', () => {
    assert.deepEqual(g.imports.get('src/core/plan.ts'), ['src/server/db.ts', 'src/lib/index.ts']);
    assert.deepEqual(g.uses.get('src/core/plan.ts'), ['zod']);
    const rule = { name: 'core is pure', from: 'src/core/**', forbid: ['src/server/**'] };
    assert.deepEqual(findViolations(g, [rule]).map((v) => v.target), ['src/server/db.ts']);
  });
  it("an app's own tsconfig applies to that app's files", () => {
    assert.deepEqual(g.imports.get('apps/web/src/page.tsx'), ['apps/web/src/ui/button.tsx']);
  });
  it('reads the root tsconfig and each app\'s', () => {
    const read = (p: string) => (p === 'tsconfig.json' ? tsconfig : p === 'apps/web/tsconfig.json' ? '{}' : null);
    assert.equal(projectAliases([{ root: 'apps/web' }], read).length, 3);
  });
});
