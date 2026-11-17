// The gate skips a picked test that passed before with the same code under it (workflow/tools/lib/testcache.mjs), and "reach":
// "direct" picks only the tests that import a changed file themselves (lib/graph.mjs, affectedTests' depth).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cacheSalt, recordPasses, splitByCache, testKey } from '../../workflow/tools/lib/testcache.mjs';
import { affectedTests } from '../../workflow/tools/lib/graph.mjs';

// tests/a.test.ts -> src/a.ts -> src/core.ts; tests/b.test.ts -> src/b.ts; tests/core.test.ts -> src/core.ts
function graphOf(texts: Record<string, string>) {
  const edges: Record<string, string[]> = {
    'tests/a.test.ts': ['src/a.ts'], 'src/a.ts': ['src/core.ts'], 'tests/b.test.ts': ['src/b.ts'], 'tests/core.test.ts': ['src/core.ts'],
  };
  const imports = new Map(Object.entries(edges));
  const importedBy = new Map<string, Set<string>>();
  for (const [from, tos] of imports) for (const to of tos) { if (!importedBy.has(to)) importedBy.set(to, new Set()); importedBy.get(to)!.add(from); }
  const names = ['tests/a.test.ts', 'src/a.ts', 'src/core.ts', 'tests/b.test.ts', 'src/b.ts', 'tests/core.test.ts'];
  return { files: new Map(names.map((f) => [f, texts[f] ?? `// ${f}`])), imports, importedBy, known: new Set(names), nodeImports: new Map(), uses: new Map() };
}
const isTest = (f: string) => f.endsWith('.test.ts');

describe('what passed before', () => {
  it('a test keeps its key until something under it changes, all the way down', () => {
    const before = graphOf({});
    const after = graphOf({ 'src/core.ts': '// changed' });
    assert.equal(testKey('tests/a.test.ts', before), testKey('tests/a.test.ts', graphOf({})));
    assert.notEqual(testKey('tests/a.test.ts', before), testKey('tests/a.test.ts', after), 'core is under a, two steps down');
    assert.equal(testKey('tests/b.test.ts', before), testKey('tests/b.test.ts', after), 'b does not lean on core');
    assert.notEqual(testKey('tests/b.test.ts', before, 'x'), testKey('tests/b.test.ts', before, 'y'), 'the salt counts');
  });
  it('skips what passed under the same key, runs the rest, and a failed run records nothing new', () => {
    const keys = { 'tests/a.test.ts': 'k1', 'tests/b.test.ts': 'k2' };
    assert.deepEqual(splitByCache(Object.keys(keys), keys, { 'tests/a.test.ts': 'k1', 'tests/b.test.ts': 'old' }), { run: ['tests/b.test.ts'], skipped: ['tests/a.test.ts'] });
    assert.deepEqual(recordPasses({ 'tests/a.test.ts': 'k1' }, ['tests/b.test.ts'], keys), keys);
  });
  it('the salt changes with any of the files it is made of, not with their order', () => {
    assert.equal(cacheSalt([['a', '1'], ['b', null]]), cacheSalt([['b', null], ['a', '1']]));
    assert.notEqual(cacheSalt([['package-lock.json', 'v1']]), cacheSalt([['package-lock.json', 'v2']]));
  });
});

describe('how far the gate looks for tests', () => {
  it('the chain by default: every test that leans on the change; direct: only the tests importing it', () => {
    const g = graphOf({});
    assert.deepEqual(affectedTests(g, ['src/core.ts'], { isTest }).tests, ['tests/a.test.ts', 'tests/core.test.ts']);
    assert.deepEqual(affectedTests(g, ['src/core.ts'], { isTest, depth: 1 }).tests, ['tests/core.test.ts']);
    assert.deepEqual(affectedTests(g, ['tests/b.test.ts'], { isTest, depth: 1 }).tests, ['tests/b.test.ts'], 'a changed test runs itself');
  });
});
