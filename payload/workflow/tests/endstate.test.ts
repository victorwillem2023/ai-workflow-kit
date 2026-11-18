// The end-state line of an approved spec (workflow/tools/lib/endstate.mjs): the gate refuses one with no best version named.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { endStateOf, endStateProblems } from '../../workflow/tools/lib/endstate.mjs';

const spec = (endState: string | null, approval = 'approved on 2026-11-18 (by running /build)') =>
  `# Spec: plan-weeks\n\nCard: #12, type feature\n${endState == null ? '' : `End state: ${endState}\n`}Owner approval: ${approval}\n`;

describe('the end state of a spec', () => {
  it('reads the line after "End state:"', () => {
    assert.equal(endStateOf(spec('one rule decides every week. This spec: is it.')), 'one rule decides every week. This spec: is it.');
    assert.equal(endStateOf(spec(null)), null);
  });
  it('refuses an approved spec whose End state line is missing, empty or still the placeholder', () => {
    for (const line of [null, '', '<the best version, in one sentence>. This spec: <is it | a step toward it>', '. This spec: is it.']) {
      const { fails } = endStateProblems([['plan-weeks.md', spec(line)]]);
      assert.equal(fails.length, 1, `refused: ${line}`);
      assert.match(fails[0], /plan-weeks\.md: the "End state:" line is/);
    }
  });
  it('passes a filled line, and leaves a spec that is not approved yet alone', () => {
    assert.deepEqual(endStateProblems([['a.md', spec('one rule decides every week. This spec: is it.')]]), { fails: [], advice: [] });
    assert.deepEqual(endStateProblems([['a.md', spec('', 'not yet')]]), { fails: [], advice: [] });
  });
  it('advises when a step names no card for the rest, and not when it does', () => {
    const step = 'one rule decides every week. This spec: a step toward it, because the store is card #9 first';
    assert.equal(endStateProblems([['a.md', spec(step)]]).advice.length, 0);
    const bare = endStateProblems([['a.md', spec('one rule decides every week. This spec: a step toward it, because it is big')]]);
    assert.equal(bare.fails.length, 0);
    assert.match(bare.advice[0], /^advice: workflow\/specs\/a\.md is a step toward its end state but names no card/);
  });
});
