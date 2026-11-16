// workflow/scripts/session.mjs --on and --card 12,14: a session built on top of another one that is built but not finished (its card waits
// for the owner's check), finished only after it; finishing the base moves it onto main by itself, its base's old commits left
// behind; and cards that belong together in one session. Runs in throwaway repos (workflow/tests/session-repo.ts).
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitIn, git, makeRepo, roots, run } from './session-repo';

describe('a session built on top of another one', () => {
  after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

  it('starts from the other session\'s branch, waits for it, and moves onto main by itself when it is finished', () => {
    const r = makeRepo();
    assert.ok(run(r, 'rules').ok);
    commitIn(r.wt('rules'), 'rules.txt', 'rules\n', 'Plan: rules');
    const made = run(r, 'screen', '--on', 'rules');
    assert.ok(made.ok, made.out);
    assert.match(made.out, /on:\s+rules/);
    assert.ok(existsSync(join(r.wt('screen'), 'rules.txt')), 'it has the other session\'s work');
    commitIn(r.wt('screen'), 'screen.txt', 'screen\n', 'Screen: see the plan');
    assert.match(run(r, '--list').out, /on rules/);

    const early = run(r, '--finish', 'screen');
    assert.equal(early.ok, false);
    assert.match(early.out, /built on top of "rules", which is not finished yet/);

    // a feedback round on the base after the stacked one started; then the base is finished (squashed into one commit)
    commitIn(r.wt('rules'), 'rules.txt', 'rules, fixed\n', 'Plan: a fix after the check');
    const base = run(r, '--finish', 'rules');
    assert.ok(base.ok, base.out);
    assert.match(base.out, /"screen" was built on "rules" and now sits on main/);
    assert.equal(git(r.wt('screen'), 'rev-list', '--count', 'main..HEAD'), '1', 'only its own commit is left on top of main');
    assert.equal(git(r.wt('screen'), 'show', 'HEAD:rules.txt'), 'rules, fixed', 'it has the base as finished');
    assert.doesNotMatch(run(r, '--list').out, /on rules/);

    const done = run(r, '--finish', 'screen');
    assert.ok(done.ok, done.out);
    assert.deepEqual(git(r.main, 'log', '--format=%s', '-2').split('\n'), ['Screen: see the plan', 'Plan: rules']);
  });

  it('uncommitted work in the stacked session keeps it where it is, and --restack moves it later', () => {
    const r = makeRepo();
    assert.ok(run(r, 'rules').ok);
    commitIn(r.wt('rules'), 'rules.txt', 'rules\n', 'Plan: rules');
    assert.ok(run(r, 'screen', '--on', 'rules').ok);
    commitIn(r.wt('screen'), 'screen.txt', 'screen\n', 'Screen: see the plan');
    writeFileSync(join(r.wt('screen'), 'draft.txt'), 'half done\n');
    const base = run(r, '--finish', 'rules');
    assert.ok(base.ok, base.out);
    assert.match(base.out, /still sits on it: commit its work, then run node workflow\/scripts\/session\.mjs --restack screen/);
    assert.ok(existsSync(join(r.wt('screen'), 'draft.txt')), 'the uncommitted work is untouched');
    commitIn(r.wt('screen'), 'draft.txt', 'done\n', 'Screen: the rest');
    const moved = run(r, '--restack', 'screen');
    assert.ok(moved.ok, moved.out);
    assert.equal(git(r.wt('screen'), 'rev-list', '--count', 'main..HEAD'), '2');
    assert.ok(run(r, '--finish', 'screen').ok);
  });

  it('a base whose built work is not committed is saved as a checkpoint on its own branch, and its finish needs the approved subject', () => {
    const r = makeRepo();
    assert.ok(run(r, 'rules').ok);
    writeFileSync(join(r.wt('rules'), 'rules.txt'), 'built, not committed\n');
    const made = run(r, 'screen', '--on', 'rules');
    assert.ok(made.ok, made.out);
    assert.match(made.out, /Saved "rules"'s uncommitted work as a checkpoint on its own branch/);
    assert.ok(existsSync(join(r.wt('screen'), 'rules.txt')), 'the stacked session has the built work');
    assert.match(git(r.wt('rules'), 'log', '-1', '--format=%s'), /^checkpoint: rules/);
    assert.equal(git(r.main, 'rev-list', '--count', 'main..rules'), '1', 'nothing reached main');
    const bare = run(r, '--finish', 'rules', '--no-checks');
    assert.equal(bare.ok, false);
    assert.match(bare.out, /is a checkpoint[\s\S]*--subject/);
    assert.ok(run(r, '--finish', 'rules', '--no-checks', '--subject', 'Plan: the rules', '--body', 'Why it is there.').ok);
    assert.equal(git(r.main, 'log', '-1', '--format=%s%n%b', 'main').trim(), 'Plan: the rules\nWhy it is there.');
  });

  it('a session with an earlier commit finishes under the subject the owner approved, not the first commit\'s', () => {
    const r = makeRepo();
    assert.ok(run(r, 'goal').ok);
    commitIn(r.wt('goal'), 'a.txt', 'a\n', 'wip');
    commitIn(r.wt('goal'), 'b.txt', 'b\n', 'Goals: set a goal and see it on the plan');
    assert.ok(run(r, '--finish', 'goal', '--no-checks', '--subject', 'Goals: set a goal and see it on the plan').ok);
    assert.equal(git(r.main, 'log', '-1', '--format=%s', 'main'), 'Goals: set a goal and see it on the plan');
  });

  it('a base that is on main already is not stacked on', () => {
    const r = makeRepo();
    assert.ok(run(r, 'rules').ok);
    commitIn(r.wt('rules'), 'rules.txt', 'rules\n', 'Plan: rules');
    assert.ok(run(r, '--finish', 'rules', '--no-checks').ok);
    const made = run(r, 'screen', '--on', 'rules');
    assert.ok(made.ok, made.out);
    assert.match(made.out, /on main already, so this session starts from main/);
    assert.doesNotMatch(run(r, '--list').out, /on rules/);
  });

  it('cards that belong together are kept with one session', () => {
    const r = makeRepo();
    const made = run(r, 'plan-and-screen', '--card', '1,2');
    assert.ok(made.ok, made.out);
    assert.match(run(r, '--list').out, /cards #1, #2/);
    assert.match(run(r, 'x', '--card', '1,,2').out, /--card takes the number/);
  });
});
