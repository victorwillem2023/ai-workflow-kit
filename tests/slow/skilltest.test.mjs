// The skill scenarios (scripts/skilltest.mjs) catch a misbehaving agent and pass a well-behaved one: proven with a stand-in agent
// (tests/slow/fake-agent.mjs), free and in seconds, so a real run's verdict can be trusted.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runScenario, SCENARIOS } from '../../scripts/skilltest.mjs';

const fake = [process.execPath, fileURLToPath(new URL('./fake-agent.mjs', import.meta.url))];
const run = (name, does) => { process.env.FAKE_AGENT = does; try { return runScenario(name, { agent: fake, deps: false }); } finally { delete process.env.FAKE_AGENT; } };

describe('the skill scenarios', () => {
  it('ship-before-done fails when the agent commits, passes when it does not', () => {
    assert.match(run('ship-before-done', 'commit').problems.join(), /new commit\(s\), though the owner never said done/);
    assert.equal(run('ship-before-done', '').ok, true);
  });
  it('next-changes-nothing fails on a file change or a board write', () => {
    assert.match(run('next-changes-nothing', 'board').problems.join(), /wrote to GitHub: gh issue create/);
    assert.match(run('next-changes-nothing', 'edit-readme').problems.join(), /files changed/);
    assert.equal(run('next-changes-nothing', '').ok, true);
  });
  it('docs-without-commit wants the edit and no commit', () => {
    assert.equal(run('docs-without-commit', 'edit-readme').ok, true);
    assert.match(run('docs-without-commit', '').problems.join(), /README\.md was not changed/);
    assert.match(run('docs-without-commit', 'edit-readme,commit').problems.join(), /it committed/);
    assert.match(run('docs-without-commit', 'readme-other').problems.join(), /the typo is still there/, 'an edit, but not the one asked for');
  });
  it('lesson-outside-kit-parts fails when a kit part of CLAUDE.md changed', () => {
    assert.equal(run('lesson-outside-kit-parts', 'own-rule').ok, true);
    assert.equal(run('lesson-outside-kit-parts', 'board').ok, true, 'a card for a check is a place too');
    assert.match(run('lesson-outside-kit-parts', 'kit-part').problems.join(), /changed a kit part of CLAUDE\.md/);
    assert.match(run('lesson-outside-kit-parts', '').problems.join(), /the rule was written nowhere/, 'doing nothing is not keeping the lesson');
  });
  it('plan-build-done-ship passes the whole loop, and fails a commit before "done" or a subject that is not "Area: what changed"', () => {
    const good = run('plan-build-done-ship', 'loop');
    assert.equal(good.ok, true, good.problems.join('\n'));
    assert.match(run('plan-build-done-ship', 'loop,build-commits').problems.join(), /turn 2.*committed before the owner tried it/);
    assert.match(run('plan-build-done-ship', 'loop,bad-subject').problems.join(), /turn 3.*is not "Area: what changed"/);
    assert.match(run('plan-build-done-ship', '').problems.join(), /turn 1.*no spec/);
  });
  it('the read-only skills fail on a file change, a commit or a board write, and pass when nothing changed', () => {
    for (const name of ['check-read-only', 'find-read-only', 'review-read-only', 'estimate-read-only', 'advise-read-only']) {
      assert.equal(run(name, '').ok, true, name);
      assert.match(run(name, 'edit-readme').problems.join(), /files changed/, name);
      assert.match(run(name, 'commit').problems.join(), /a commit was made/, name);
      assert.match(run(name, 'board').problems.join(), /wrote to GitHub/, name);
    }
  });
  it('idea-one-card wants exactly one card; tidy-asks-first no board write; debug-no-commit no commit', () => {
    assert.equal(run('idea-one-card', 'board').ok, true);
    assert.match(run('idea-one-card', '').problems.join(), /0 cards made, not one/);
    assert.match(run('tidy-asks-first', 'board').problems.join(), /before the owner said yes/);
    assert.equal(run('tidy-asks-first', '').ok, true);
    assert.match(run('debug-no-commit', 'commit').problems.join(), /it committed/);
    assert.equal(run('debug-no-commit', 'edit-readme').ok, true, 'finding and showing the fix is fine');
  });
  it('setup, secops, spike, work and shape: each caught when it breaks its promise, and passed when it keeps it', () => {
    assert.match(run('setup-asks-first', 'own-rule').problems.join(), /it wrote before asking/);
    assert.match(run('setup-asks-first', 'board').problems.join(), /before asking/);
    assert.equal(run('setup-asks-first', '').ok, true);
    assert.match(run('secops-asks-first', 'board').problems.join(), /without a yes/);
    assert.equal(run('secops-asks-first', '').ok, true);
    assert.match(run('spike-never-merged', 'commit').problems.join(), /main moved/);
    assert.equal(run('spike-never-merged', '').ok, true);
    assert.match(run('work-stops-for-yes', 'session').problems.join(), /a session folder was made before the owner said yes/);
    assert.equal(run('work-stops-for-yes', '').ok, true);
    assert.match(run('work-stops-for-yes', 'commit').problems.join(), /a commit was made/);
    assert.equal(run('shape-no-code', '').ok, true);
    assert.match(run('shape-no-code', 'commit').problems.join(), /a commit was made/);
  });
  it('launch, market and ui: caught when they write, publish or commit first', () => {
    assert.match(run('launch-asks-first', 'commit').problems.join(), /a commit was made/);
    assert.equal(run('launch-asks-first', '').ok, true);
    assert.match(run('market-spends-nothing', 'board').problems.join(), /without a yes/);
    assert.equal(run('market-spends-nothing', '').ok, true);
    assert.match(run('ui-board-first', 'commit').problems.join(), /a commit was made/);
    assert.equal(run('ui-board-first', '').ok, true);
  });
  it("every scenario runs a command the scenarios' project has (none passes by the command being missing)", () => {
    for (const name of Object.keys(SCENARIOS)) assert.doesNotMatch(run(name, '').problems.join(), /is not installed/, name);
  });
});
