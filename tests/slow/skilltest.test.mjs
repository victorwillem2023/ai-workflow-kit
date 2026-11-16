// The skill scenarios (scripts/skilltest.mjs) catch a misbehaving agent and pass a well-behaved one: proven with a stand-in agent
// (tests/slow/fake-agent.mjs), free and in seconds, so a real run's verdict can be trusted.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runScenario } from '../../scripts/skilltest.mjs';

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
  });
  it('lesson-outside-kit-parts fails when a kit part of CLAUDE.md changed', () => {
    assert.equal(run('lesson-outside-kit-parts', 'own-rule').ok, true);
    assert.equal(run('lesson-outside-kit-parts', 'board').ok, true, 'a card for a check is a place too');
    assert.match(run('lesson-outside-kit-parts', 'kit-part').problems.join(), /changed a kit part of CLAUDE\.md/);
    assert.match(run('lesson-outside-kit-parts', '').problems.join(), /the rule was written nowhere/, 'doing nothing is not keeping the lesson');
  });
});
