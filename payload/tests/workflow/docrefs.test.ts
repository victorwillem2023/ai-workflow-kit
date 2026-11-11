// The docs check (tools/workflow/lib/docrefs.mjs): a doc that names a file or npm script that no longer exists.
// Pure function, in-memory docs; no disk.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findStaleRefs, newStaleRefs } from '../../tools/workflow/lib/docrefs.mjs';

const docs = (o: Record<string, string>) => new Map(Object.entries(o));
const has = (...paths: string[]) => (p: string) => paths.includes(p);

describe('doc references', () => {
  it('a doc that names a file that does not exist fails with the doc, line and path', () => {
    const d = docs({ 'docs/GUIDE.md': 'Intro\n\nSee `src/web/ui/old.ts` and `src/web/ui/new.ts`.' });
    const stale = findStaleRefs(d, has('src/web/ui/new.ts'), []);
    assert.deepEqual(stale, [{ doc: 'docs/GUIDE.md', line: 3, ref: 'src/web/ui/old.ts' }]);
  });
  it('a path with a line number or an anchor is checked without it', () => {
    const d = docs({ 'a.md': '`src/a.ts:41` `src/a.ts#L12` `src/b.ts:3-9`' });
    const stale = findStaleRefs(d, has('src/a.ts'), []);
    assert.deepEqual(stale.map((s) => s.ref), ['src/b.ts']);
  });
  it('a glob or a <placeholder> path in a doc is not checked', () => {
    const d = docs({ 'a.md': '`src/web/ui/*.ts` `specs/<topic>.md` `tests/<name>.test.ts` `docs/{a,b}.md`' });
    assert.deepEqual(findStaleRefs(d, () => false, []), []);
  });
  it('npm run <script> in a doc fails when package.json has no such script', () => {
    const d = docs({ 'a.md': 'Use `npm run gate` or `npm run nope`.\n```sh\nnpm run gone   # old\nnpm run gate\n```' });
    const stale = findStaleRefs(d, () => true, ['gate']);
    assert.deepEqual(stale.map((s) => [s.line, s.ref]), [[1, 'npm run nope'], [3, 'npm run gone']]);
  });
  it('a bare file name without a folder is not checked', () => {
    const d = docs({ 'a.md': 'The `service.ts` file and `README.md` and `lib/x.ts`.' });
    assert.deepEqual(findStaleRefs(d, () => false, []), []);
  });
  it('a reference already in the baseline is accepted and a new one is refused', () => {
    const d = docs({ 'a.md': '`src/old.ts` `src/newer.ts`' });
    const stale = findStaleRefs(d, () => false, []);
    const fresh = newStaleRefs(stale, ['a.md|src/old.ts']);
    assert.deepEqual(fresh.map((s) => s.ref), ['src/newer.ts']);
  });
});
