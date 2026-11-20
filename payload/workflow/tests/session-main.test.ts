// workflow/scripts/session.mjs --check-main and what a finish leaves on the local main: the main folder is checked before a ship
// (behind origin, unpushed features, uncommitted files), and a finished feature stays local until --push.
// Run in throwaway git repos: a bare "origin" and a clone in the shape of the project (workflow/tests/session-repo.ts).
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitIn, git, makeRepo, originMain, roots, run } from './session-repo';

const setup = () => makeRepo();

describe('the main folder before and after a finish', () => {
  after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

  it('check-main fast-forwards a main that is only behind origin and passes', () => {
    const r = setup();
    const other = join(r.root, 'other');
    git(r.root, 'clone', r.origin, other);
    commitIn(other, 'theirs.txt', 't\n', 'theirs'); git(other, 'push', 'origin', 'main');
    const checked = run(r, '--check-main');
    assert.ok(checked.ok, checked.out);
    assert.equal(git(r.main, 'rev-parse', 'main'), originMain(r));
    assert.ok(existsSync(join(r.main, 'theirs.txt')));
  });

  it('check-main passes with finished features that are not pushed, and says how many', () => {
    const r = setup();
    commitIn(r.main, 'done.txt', 's\n', 'A finished feature');
    const before = git(r.main, 'rev-parse', 'main');
    const checked = run(r, '--check-main');
    assert.ok(checked.ok, checked.out);
    assert.match(checked.out, /1 finished feature.*not pushed/);
    assert.equal(git(r.main, 'rev-parse', 'main'), before, 'nothing changed');
  });

  it('check-main stops when main has unpushed features and origin has new commits too, and points to --push', () => {
    const r = setup();
    commitIn(r.main, 'done.txt', 's\n', 'A finished feature');
    const other = join(r.root, 'other');
    git(r.root, 'clone', r.origin, other);
    commitIn(other, 'theirs.txt', 't\n', 'theirs'); git(other, 'push', 'origin', 'main');
    const checked = run(r, '--check-main');
    assert.equal(checked.ok, false);
    assert.match(checked.out, /--push/);
  });

  it('check-main refuses when the main folder has uncommitted files, but not for an ignored file such as a waiting spec', () => {
    const r = setup();
    mkdirSync(join(r.main, 'workflow/specs'));
    writeFileSync(join(r.main, 'workflow/specs', 'waiting.md'), 'a waiting spec\n');
    assert.ok(run(r, '--check-main').ok, 'a waiting spec does not count');
    writeFileSync(join(r.main, 'loose.txt'), 'not committed\n');
    const checked = run(r, '--check-main');
    assert.equal(checked.ok, false);
    assert.match(checked.out, /loose\.txt/);
  });

  it('check-main ignores uncommitted files of another session\'s branch checked out in the main folder, and still fast-forwards main', () => {
    const r = setup();
    git(r.main, 'checkout', '-b', 'trips');
    writeFileSync(join(r.main, 'wip.txt'), 'half done\n');
    const other = join(r.root, 'other');
    git(r.root, 'clone', r.origin, other);
    commitIn(other, 'theirs.txt', 't\n', 'theirs'); git(other, 'push', 'origin', 'main');
    const checked = run(r, '--check-main');
    assert.ok(checked.ok, checked.out);
    assert.equal(git(r.main, 'rev-parse', 'main'), originMain(r), 'main followed origin');
    assert.equal(git(r.main, 'branch', '--show-current'), 'trips', 'the other branch stays checked out');
    assert.equal(readFileSync(join(r.main, 'wip.txt'), 'utf8'), 'half done\n', 'and its file is untouched');
  });

  it('finishing puts the feature on the local main and does not push it', () => {
    const r = setup();
    assert.ok(run(r, 'a').ok);
    commitIn(r.wt('a'), 'new.txt', 'hello\n', 'add new');
    const before = originMain(r);
    const done = run(r, '--finish', 'a', '--no-checks');
    assert.ok(done.ok, done.out);
    assert.equal(originMain(r), before, 'origin is as it was');
    assert.ok(existsSync(join(r.main, 'new.txt')), 'the local main has it');
    assert.equal(git(r.main, 'rev-list', '--count', 'origin/main..main'), '1');
    assert.match(done.out, /On local main, not pushed \(1 feature waiting\)\. Push with: node workflow\/scripts\/session\.mjs --push/);
  });

  it('a second session finishes on top of the first one\'s unpushed feature', () => {
    const r = setup();
    assert.ok(run(r, 'a').ok); assert.ok(run(r, 'b').ok);
    commitIn(r.wt('a'), 'a-file.txt', '1\n', 'feature a');
    commitIn(r.wt('b'), 'b-file.txt', '2\n', 'feature b');
    assert.ok(run(r, '--finish', 'a', '--no-checks').ok);
    const done = run(r, '--finish', 'b', '--no-checks');
    assert.ok(done.ok, done.out);
    assert.match(done.out, /2 features waiting/);
    assert.equal(git(r.main, 'log', '--format=%s', 'origin/main..main'), 'feature b\nfeature a', 'a straight line, a then b');
    assert.ok(existsSync(join(r.main, 'a-file.txt')) && existsSync(join(r.main, 'b-file.txt')));
  });

  it('a new session starts with the finished features that are not pushed yet', () => {
    const r = setup();
    assert.ok(run(r, 'a').ok);
    commitIn(r.wt('a'), 'a-file.txt', '1\n', 'feature a');
    assert.ok(run(r, '--finish', 'a', '--no-checks').ok);
    const made = run(r, 'b');
    assert.ok(made.ok, made.out);
    assert.ok(existsSync(join(r.wt('b'), 'a-file.txt')), 'the new session has the unpushed feature');
  });
});
