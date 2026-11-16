// The shape checks: import circles and untested files (workflow/tools/lib/structure.mjs), deep nesting and copied tests (funclen.mjs).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { importCycles, untestedFiles } from '../../workflow/tools/lib/structure.mjs';
import { deepFunctions, copiedTests } from '../../workflow/tools/lib/funclen.mjs';

describe('import circles', () => {
  it('names the files of a circle, also one that runs through a third file; a straight chain has none', () => {
    const g = new Map([['a.ts', ['b.ts']], ['b.ts', ['c.ts']], ['c.ts', ['a.ts']], ['d.ts', ['a.ts']], ['e.ts', []]]);
    assert.deepEqual(importCycles(g), [['a.ts', 'b.ts', 'c.ts']]);
    assert.deepEqual(importCycles(new Map([['a.ts', ['b.ts']], ['b.ts', ['c.ts']], ['c.ts', []]])), []);
  });
});

describe('files no test reaches', () => {
  it('a source file is fine when a test imports it, directly or through another file', () => {
    const imports = new Map([['tests/a.test.ts', ['src/a.ts']], ['src/a.ts', ['src/deep.ts']], ['src/deep.ts', []], ['src/alone.ts', []]]);
    const isTest = (f: string) => f.startsWith('tests/');
    assert.deepEqual(untestedFiles({ imports }, (f) => f.startsWith('src/'), isTest), ['src/alone.ts']);
  });
});

describe('deep nesting', () => {
  const deep = `export function pick(xs: number[]) {
  for (const x of xs) {
    if (x > 1) {
      while (x) {
        if (x === 2) {
          try {
            go();
          } catch {}
        }
      }
    }
  }
}
function flat(x: number) {
  if (x) return 1;
  return 2;
}
`;
  it('a function nested five deep is named with its depth; a flat one is not', () => {
    assert.deepEqual(deepFunctions(new Map([['src/a.ts', deep]]), 4), { 'src/a.ts:pick': 5 });
    assert.deepEqual(deepFunctions(new Map([['src/a.ts', deep]]), 5), {});
  });
  it('reads Python by its indentation too', () => {
    const py = 'def pick(xs):\n    for x in xs:\n        if x:\n            while x:\n                if x == 2:\n                    with open(x) as f:\n                        pass\n';
    assert.deepEqual(deepFunctions(new Map([['src/a.py', py]]), 4), { 'src/a.py:pick': 5 });
  });
});

describe('copied tests', () => {
  const t = (name: string, a: string, n: number) => `  it('${name}', () => {\n    const r = plan('${a}');\n    assert.equal(r.km, ${n});\n    assert.ok(r.loop);\n    assert.ok(r.name);\n  });\n`;
  it('two tests that differ only in their values are one group; a different test is not in it', () => {
    const file = `describe('x', () => {\n${t('8 km', 'easy 8 km', 8)}${t('12 km', 'easy 12 km', 12)}  it('other', () => {\n    const r = plan('x');\n    assert.equal(r.km, 1);\n    assert.ok(!r.loop);\n    assert.ok(r.name);\n  });\n});\n`;
    assert.deepEqual(copiedTests(new Map([['tests/a.test.ts', file]]), 5), [['tests/a.test.ts:"8 km"', 'tests/a.test.ts:"12 km"']]);
  });
});
