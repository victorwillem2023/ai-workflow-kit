// Counted patterns that may not rise (tools/workflow/lib/ratchet.mjs) and copied functions (funclen.mjs), for the gate and `npm run health`.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countPatterns, risen } from '../../tools/workflow/lib/ratchet.mjs';
import { copiedFunctions } from '../../tools/workflow/lib/funclen.mjs';

const files = new Map(Object.entries({
  'src/plan/a.ts': "if (shape === 'loop') go();\nif (isBike(x) && shape === 'oneway') stop();\n",
  'src/web/b.ts': "if (shape === 'loop') draw();\n",
}));
const kind = [{ name: 'kind checks', include: ['src/plan/**'], patterns: ["shape === '", 'isBike\\('] }];

describe('ratchets', () => {
  it('counts the patterns only in the files the ratchet names', () => {
    assert.deepEqual(countPatterns(files, kind), { 'kind checks': 3 });
  });
  it('a count above the baseline is named with what it was; a lower one, or no baseline yet, passes', () => {
    assert.deepEqual(risen({ 'kind checks': 3 }, { 'kind checks': 2 }), [{ name: 'kind checks', was: 2, now: 3 }]);
    assert.deepEqual(risen({ 'kind checks': 1 }, { 'kind checks': 2 }), []);
    assert.deepEqual(risen({ 'kind checks': 9 }, {}), []);
  });
});

describe('copied functions', () => {
  it('two functions with the same body in two files are one group; a short body is not counted', () => {
    const body = '  const a = 1;\n  const b = 2;\n  const c = a + b;\n  return c * 2;';
    const f = new Map(Object.entries({
      'src/a.ts': `export function hours(x: number) {\n${body}\n}\nfunction tiny() {\n  return 1;\n}\n`,
      'src/b.ts': `function hm(x: number) {\n${body}\n}\nfunction tiny() {\n  return 1;\n}\n`,
    }));
    assert.deepEqual(copiedFunctions(f), [['src/a.ts:hours', 'src/b.ts:hm']]);
  });
});
