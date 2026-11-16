// The quality score (workflow/tools/lib/quality.mjs): the pass count a project's own command prints may not drop.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseScore, qualityVerdict } from '../../workflow/tools/lib/quality.mjs';

describe('quality score', () => {
  it('reads the last "79 of 106" the command printed', () => {
    assert.deepEqual(parseScore('batch 1: 20 of 21\ntotal: 79 of 106 pass'), { pass: 79, total: 106 });
    assert.deepEqual(parseScore('passed=12', 'passed=(\\d+)'), { pass: 12, total: null });
  });
  it('fails when fewer cases pass than the baseline, and when no score is printed', () => {
    assert.equal(qualityVerdict({ pass: 78, total: 106 }, { pass: 79 }).ok, false);
    assert.equal(qualityVerdict(null, { pass: 79 }).ok, false);
  });
  it('passes at the baseline or above, and with no baseline yet', () => {
    assert.equal(qualityVerdict({ pass: 80, total: 106 }, { pass: 79 }).ok, true);
    assert.equal(qualityVerdict({ pass: 3, total: 9 }, undefined).ok, true);
  });
});
