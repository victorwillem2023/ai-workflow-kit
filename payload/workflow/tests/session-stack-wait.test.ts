// Split from session-stack.test.ts so the two halves run side by side (each file's tests run one after another): the stacked session that waits.
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

});
