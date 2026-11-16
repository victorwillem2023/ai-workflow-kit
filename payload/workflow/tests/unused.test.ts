// The unused check's baseline (lib/unused.mjs): knip's findings one line each, and only the new ones fail.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareUnused, unusedFindings } from '../../workflow/tools/lib/unused.mjs';

const report = {
  files: ['src/old.ts'],
  issues: [
    { file: 'package.json', dependencies: [{ name: 'left-pad' }], devDependencies: [] },
    { file: 'src/a.ts', exports: [{ name: 'helper' }, { name: 'other' }], types: [{ name: 'Shape' }] },
    { file: 'src/b.ts', duplicates: [[{ name: 'one' }, { name: 'One' }]] },
  ],
};

describe('what nothing uses, with a baseline', () => {
  it('reads every kind of finding as one line, sorted', () => {
    assert.deepEqual(unusedFindings(report), [
      'dependencies: package.json: left-pad',
      'duplicates: src/b.ts: one = One',
      'exports: src/a.ts: helper',
      'exports: src/a.ts: other',
      'file: src/old.ts',
      'types: src/a.ts: Shape',
    ]);
    assert.deepEqual(unusedFindings(null), [], 'no report: nothing found, never a crash');
  });
  it('fails only on what is new since the baseline, and says what is gone', () => {
    const known = ['exports: src/a.ts: helper', 'file: src/old.ts'];
    assert.deepEqual(compareUnused(['exports: src/a.ts: helper', 'exports: src/c.ts: fresh'], known), {
      added: ['exports: src/c.ts: fresh'],
      fixed: ['file: src/old.ts'],
    });
  });
});
