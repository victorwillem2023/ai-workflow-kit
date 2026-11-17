// Which tests the gate runs (lib/testplan.mjs): the kit's own tests only when what they test may have changed, so an app change
// runs the app's tests and not the kit's 40-odd files.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesAny } from '../../workflow/tools/lib/glob.mjs';
import { testPlan } from '../../workflow/tools/lib/testplan.mjs';

const allTests = ['tests/core/plan.test.ts', 'tests/server/goal.test.ts', 'workflow/tests/board.test.ts', 'workflow/tests/session-stack.test.ts'];
const base = { whole: false, unknown: false, reached: [] as string[], allTests, changed: ['src/core/plan.ts'], forced: false, matches: matchesAny };

describe('which tests the gate runs', () => {
  it('gate:all for an app change runs every one of the app\'s tests and none of the kit\'s, and says so', () => {
    const p = testPlan({ ...base, whole: true });
    assert.equal(p.mode, 'files');
    assert.deepEqual(p.files, ['tests/core/plan.test.ts', 'tests/server/goal.test.ts']);
    assert.match(p.note, /^all 2 of the project's test files; the kit's own tests skipped/);
  });
  it('the whole suite when the machinery changed (a kit update, a tool, the packages) or when forced', () => {
    for (const changed of [['workflow/tools/gate.mjs'], ['workflow/record'], ['package-lock.json'], ['workflow/scripts/session.mjs']]) {
      assert.equal(testPlan({ ...base, whole: true, changed }).mode, 'suite', changed[0]);
    }
    assert.equal(testPlan({ ...base, whole: true, forced: true }).mode, 'suite', 'GitHub, --kit, the kit\'s self-test');
  });
  it('the owner\'s settings under workflow/ are not machinery: the kit\'s tests stay skipped', () => {
    for (const changed of [['workflow/levels.json'], ['workflow/tools/baseline.json'], ['workflow/specs/x.md']]) {
      assert.notEqual(testPlan({ ...base, whole: true, changed }).mode, 'suite', changed[0]);
    }
  });
  it('an unknown file runs the app\'s tests, not the whole suite with the kit\'s', () => {
    const p = testPlan({ ...base, unknown: true, changed: ['public/logo.png'] });
    assert.equal(p.mode, 'files');
    assert.match(p.note, /\(an unknown file changed\); the kit's own tests skipped/);
  });
  it('the quick gate drops a reached kit test unless the machinery changed', () => {
    const reached = ['tests/core/plan.test.ts', 'workflow/tests/board.test.ts'];
    assert.deepEqual(testPlan({ ...base, reached }).files, ['tests/core/plan.test.ts']);
    assert.deepEqual(testPlan({ ...base, reached, changed: ['workflow/tools/lib/board.mjs'] }).files, reached);
    assert.equal(testPlan({ ...base }).mode, 'none');
  });
  it('a project with too many test files for one command line takes the whole suite', () => {
    const many = Array.from({ length: 5 }, (_, i) => `tests/t${i}.test.ts`);
    assert.equal(testPlan({ ...base, whole: true, allTests: many, maxFiles: 3 }).mode, 'suite');
  });
});
