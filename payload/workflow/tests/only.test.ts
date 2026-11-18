// `gate.mjs --only <files>` (workflow/tools/lib/only.mjs): one builder of several sees its own type errors, not its neighbours'.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { onlyCheck, onlyFiles, ownErrors } from '../../workflow/tools/lib/only.mjs';

const tsc = [
  'src/map/fix.ts(12,5): error TS2322: Type \'string\' is not assignable to type \'number\'.',
  'src\\web\\menu.ts(3,1): error TS2304: Cannot find name \'x\'.',
  'src/web/menu.ts:9:2 - error TS2554: Expected 1 arguments, but got 0.',
  'Found 3 errors in 2 files.',
].join('\n');

describe('gate --only', () => {
  it('reads the files after --only up to the next flag, commas too', () => {
    assert.deepEqual(onlyFiles(['--only', 'src/a.ts', '.\\src\\b.ts,src/c.ts', '--fresh']), ['src/a.ts', 'src/b.ts', 'src/c.ts']);
    assert.equal(onlyFiles(['--ship']), null);
  });
  it('counts only the type errors in your own files, and how many are elsewhere', () => {
    assert.deepEqual(ownErrors(tsc, ['src/web/menu.ts']), { mine: ['src/web/menu.ts(3,1): error TS2304: Cannot find name \'x\'.', 'src/web/menu.ts:9:2 - error TS2554: Expected 1 arguments, but got 0.'], others: 1 });
    assert.deepEqual(ownErrors(tsc, ['src/web/menu.tsx']).mine, [], 'a file whose name starts the same is not yours');
  });
  it('fails on your own type error, before any test runs', () => {
    const ran: string[] = [];
    const r = onlyCheck({ files: ['src/map/fix.ts'], typecheck: 'tsc', testFiles: 'node --test', tests: ['tests/fix.test.ts'], run: (c) => { ran.push(c); return { ok: false, out: tsc }; } });
    assert.equal(r.ok, false);
    assert.match(r.lines[0], /FAIL typecheck: 1 in your files \(2 in other files, not yours/);
    assert.deepEqual(ran, ['tsc']);
  });
  it('passes with the neighbours\' errors left, and runs the tests that reach your files', () => {
    const ran: string[] = [];
    const r = onlyCheck({ files: ['src/core/plan.ts'], typecheck: 'tsc', testFiles: 'node --test', tests: ['tests/plan.test.ts'], run: (c) => { ran.push(c); return c === 'tsc' ? { ok: false, out: tsc } : { ok: true, out: '' }; } });
    assert.equal(r.ok, true, r.lines.join('\n'));
    assert.deepEqual(ran, ['tsc', 'node --test tests/plan.test.ts']);
  });
});
