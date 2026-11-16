// How much of the code the tests run (lib/coverage.mjs), read from an lcov report: the total, and the files with the most lines
// no test runs.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { coverageLines, coverageSummary, readLcov } from '../../tools/workflow/lib/coverage.mjs';

const lcov = 'TN:\nSF:C:\\app\\src\\core\\plan.ts\nLH:90\nLF:100\nend_of_record\nSF:C:\\app\\src\\web\\Screen.tsx\nLH:10\nLF:200\nend_of_record\nSF:C:\\app\\src\\web\\tiny.ts\nLH:0\nLF:5\nend_of_record\n';

describe('coverage', () => {
  it('reads lines run per file from lcov', () => {
    assert.deepEqual(readLcov(lcov), [{ file: 'C:/app/src/core/plan.ts', hit: 90, found: 100 }, { file: 'C:/app/src/web/Screen.tsx', hit: 10, found: 200 }, { file: 'C:/app/src/web/tiny.ts', hit: 0, found: 5 }]);
  });
  it('gives the total and the files with the most lines no test runs, the biggest gap first', () => {
    const s = coverageSummary(readLcov(lcov), { root: 'c:/app' });
    assert.equal(s.percent, 32.8);
    assert.deepEqual(s.least.map((f) => [f.file, f.missed]), [['src/web/Screen.tsx', 190], ['src/core/plan.ts', 10]], 'a file under 10 lines is not worth naming');
    assert.match(coverageLines(s)[0], /the tests run 32\.8% of the 305 lines in 3 source files/);
  });
});
