// The function-length check (workflow/tools/lib/funclen.mjs): long functions found from the text, by name.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { longFunctions } from '../../workflow/tools/lib/funclen.mjs';

const body = (n: number) => Array.from({ length: n }, (_, i) => `  const v${i} = { a: ${i} };`).join('\n');
const files = (o: Record<string, string>) => new Map(Object.entries(o));

describe('function length', () => {
  it('a function of the limit or more is listed with its file, name and length', () => {
    const f = files({ 'src/a.ts': `export function long(x: number) {\n${body(8)}\n}\nfunction short() {\n  return 1;\n}\n` });
    assert.deepEqual(longFunctions(f, 10), { 'src/a.ts:long': 10 });
  });
  it('an arrow function and a method count, a one-line arrow and a declaration do not', () => {
    const f = files({ 'src/a.ts': `const one = (a: number) => a + 1;\nexport const big = async (a: number) => {\n${body(5)}\n};\nclass K {\n  run(a: string): void {\n${body(5)}\n  }\n}\ndeclare function later(a: string): void;\n` });
    assert.deepEqual(Object.keys(longFunctions(f, 7)).sort(), ['src/a.ts:big', 'src/a.ts:run']);
  });
  it('a Rust fn is read too, and braces inside a string or after // are not counted', () => {
    const f = files({ 'src/lib.rs': `pub async fn fetch(url: &str) -> String {\n    let s = "}{";\n    // }\n${body(4)}\n    s.to_string()\n}\n` });
    assert.deepEqual(longFunctions(f, 8), { 'src/lib.rs:fetch': 9 });
  });
  it('two long functions of one name in a file get different keys', () => {
    const f = files({ 'src/a.ts': `function go() {\n${body(4)}\n}\nfunction go() {\n${body(4)}\n}\n` });
    assert.deepEqual(Object.keys(longFunctions(f, 6)), ['src/a.ts:go', 'src/a.ts:go#2']);
  });
});
