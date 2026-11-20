// workflow/scripts/session.mjs --finish: a session's branch goes into the local main safely (also when the main folder is not on
// main): squashed into one commit, rebased on main, the session taken away; a refusal leaves everything as it was.
// Run in throwaway git repos: a bare "origin" and a clone in the shape of the project (workflow/tests/session-repo.ts).
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitIn, git, makeRepo, originHas, originMain, roots, run } from './session-repo';

const setup = () => makeRepo();

describe('finishing a session', () => {
  after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });


  it('squashes a branch of several commits into one before it goes to main, with the first commit\'s message', () => {
    const r = setup();
    assert.ok(run(r, 'many').ok);
    commitIn(r.wt('many'), 'one.txt', '1\n', 'Feature: the whole idea\n\nThe body that says what it does.');
    commitIn(r.wt('many'), 'two.txt', '2\n', 'fix after a browser check');
    commitIn(r.wt('many'), 'three.txt', '3\n', 'docs: a missing row');
    const before = git(r.origin, 'rev-list', '--count', 'main');
    const done = run(r, '--finish', 'many', '--no-checks');
    assert.ok(done.ok, done.out);
    assert.match(done.out, /Squashed 3 commits into one/);
    assert.ok(run(r, '--push').ok);
    assert.equal(Number(git(r.origin, 'rev-list', '--count', 'main')), Number(before) + 1, 'one commit on origin, not three');
    assert.match(git(r.origin, 'log', '-1', '--format=%B', 'main'), /^Feature: the whole idea\n\nThe body that says what it does\./);
    for (const f of ['one.txt', 'two.txt', 'three.txt']) assert.ok(originHas(r, f), f);
  });

  it('keeps the commits of a big rework when asked (--keep-commits)', () => {
    const r = setup();
    assert.ok(run(r, 'big').ok);
    commitIn(r.wt('big'), 'one.txt', '1\n', 'Stage one');
    commitIn(r.wt('big'), 'two.txt', '2\n', 'Stage two');
    const before = git(r.origin, 'rev-list', '--count', 'main');
    const done = run(r, '--finish', 'big', '--no-checks', '--keep-commits');
    assert.ok(done.ok, done.out);
    assert.ok(run(r, '--push').ok);
    assert.equal(Number(git(r.origin, 'rev-list', '--count', 'main')), Number(before) + 2);
  });

  it('puts the branch into main (and into origin after --push), and takes the session away, when the main folder is on main', () => {
    const r = setup();
    assert.ok(run(r, 'a').ok);
    commitIn(r.wt('a'), 'new.txt', 'hello\n', 'add new');
    const done = run(r, '--finish', 'a');
    assert.ok(done.ok, done.out);
    assert.ok(run(r, '--push').ok);
    assert.ok(originHas(r, 'new.txt'), 'on origin');
    assert.equal(git(r.main, 'rev-parse', 'main'), originMain(r));
    assert.ok(existsSync(join(r.main, 'new.txt')), 'the main folder has the file too');
    assert.equal(existsSync(r.wt('a')), false, 'the session folder is gone');
    assert.equal(git(r.main, 'branch', '--list', 'a'), '');
  });

  it('does not touch another session\'s branch or files when the main folder is on that branch', () => {
    const r = setup();
    git(r.main, 'checkout', '-b', 'trips');
    commitIn(r.main, 'trip.txt', 'trip work\n', 'trip commit');
    writeFileSync(join(r.main, 'wip.txt'), 'half done\n');
    const tripSha = git(r.main, 'rev-parse', 'trips');
    assert.ok(run(r, 'a').ok);
    commitIn(r.wt('a'), 'new.txt', 'hello\n', 'add new');
    const done = run(r, '--finish', 'a', '--no-checks');
    assert.ok(done.ok, done.out);
    assert.ok(run(r, '--push').ok);
    assert.ok(originHas(r, 'new.txt'));
    assert.equal(git(r.main, 'rev-parse', 'main'), originMain(r), 'the local main follows');
    assert.equal(git(r.main, 'branch', '--show-current'), 'trips', 'the main folder stays on the other branch');
    assert.equal(git(r.main, 'rev-parse', 'trips'), tripSha, 'and that branch is as it was');
    assert.equal(readFileSync(join(r.main, 'wip.txt'), 'utf8'), 'half done\n', 'and its uncommitted file');
    assert.equal(existsSync(join(r.main, 'new.txt')), false, 'the other branch\'s files are not changed');
  });

  it('is rebased on what others pushed to origin since it started', () => {
    const r = setup();
    assert.ok(run(r, 'a').ok);
    commitIn(r.wt('a'), 'mine.txt', 'mine\n', 'mine');
    // someone else pushes to origin/main meanwhile
    const other = join(r.root, 'other');
    git(r.root, 'clone', r.origin, other);
    commitIn(other, 'theirs.txt', 'theirs\n', 'theirs'); git(other, 'push', 'origin', 'main');
    const done = run(r, '--finish', 'a', '--no-checks');
    assert.ok(done.ok, done.out);
    assert.ok(run(r, '--push').ok);
    assert.ok(originHas(r, 'mine.txt') && originHas(r, 'theirs.txt'), 'both are on main');
    assert.equal(git(r.origin, 'rev-list', '--count', 'main'), '3', 'a straight line of three commits');
  });

  it('refuses with uncommitted work and leaves everything as it was', () => {
    const r = setup();
    assert.ok(run(r, 'a').ok);
    commitIn(r.wt('a'), 'new.txt', 'x\n', 'add');
    writeFileSync(join(r.wt('a'), 'loose.txt'), 'not committed\n');
    const before = originMain(r);
    const done = run(r, '--finish', 'a', '--no-checks');
    assert.equal(done.ok, false);
    assert.match(done.out, /uncommitted/i);
    assert.equal(originMain(r), before);
    assert.ok(existsSync(r.wt('a')));
  });

  it('stops on a conflict with main, puts the squash and the rebase back and changes nothing', () => {
    const r = setup();
    assert.ok(run(r, 'a').ok);
    commitIn(r.wt('a'), 'a.txt', 'mine\n', 'mine changes a');
    const other = join(r.root, 'other');
    git(r.root, 'clone', r.origin, other);
    commitIn(other, 'a.txt', 'theirs\n', 'theirs changes a'); git(other, 'push', 'origin', 'main');
    const before = originMain(r);
    const sha = git(r.wt('a'), 'rev-parse', 'HEAD');
    const done = run(r, '--finish', 'a', '--no-checks');
    assert.equal(done.ok, false);
    assert.match(done.out, /conflict/i);
    assert.equal(originMain(r), before, 'main is untouched');
    assert.equal(git(r.wt('a'), 'rev-parse', 'HEAD'), sha, 'the session is as it was');
    assert.equal(git(r.wt('a'), 'status', '--porcelain').replace(/\?\? node_modules\/?\n?/, ''), '', 'no rebase left half done');
  });

  it('--remove still refuses a branch that is not in main, and uncommitted work, whichever branch the main folder is on', () => {
    const r = setup();
    git(r.main, 'checkout', '-b', 'trips');
    assert.ok(run(r, 'a').ok);
    commitIn(r.wt('a'), 'new.txt', 'x\n', 'add');
    const unmerged = run(r, '--remove', 'a');
    assert.equal(unmerged.ok, false);
    assert.match(unmerged.out, /not merged into main/i);
    assert.ok(existsSync(r.wt('a')) && git(r.main, 'branch', '--list', 'a') !== '', 'nothing was removed');
    assert.ok(run(r, 'b').ok);
    writeFileSync(join(r.wt('b'), 'loose.txt'), 'x\n');
    assert.match(run(r, '--remove', 'b').out, /uncommitted/i);
    assert.ok(existsSync(r.wt('b')));
  });

  it('says there is nothing to finish for a session with no commits of its own', () => {
    const r = setup();
    assert.ok(run(r, 'a').ok);
    const done = run(r, '--finish', 'a', '--no-checks');
    assert.equal(done.ok, false);
    assert.match(done.out, /nothing to finish/i);
    assert.ok(existsSync(r.wt('a')), 'the session is left for the owner to decide');
  });
});
