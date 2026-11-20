// workflow/scripts/session.mjs --catch-up <topic>: main comes into a session mid-build without the owner's "done" and without a
// stash (which breaks after `git add -N`): a fast-forward when the session has no commit of its own, a merge when it has (which
// --finish squashes away), the loose work as it was; a conflict stops it with nothing changed.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitIn, git, makeRepo, roots, run, type Repo, ran } from './session-repo';

const read = (dir: string, f: string) => readFileSync(join(dir, f), 'utf8');
/** A fix on main after the session started (as another session's finish would put it there). */
const fixOnMain = (r: Repo, file = 'fix.txt', text = 'fixed\n') => commitIn(r.main, file, text, `fix ${file}`);

after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

describe('--catch-up', () => {
  it('no commit of its own: main comes in as a fast-forward, the loose work and a git add -N file as they were', () => {
    const r = makeRepo();
    ran(r, 'a');
    const wt = r.wt('a');
    writeFileSync(join(wt, 'a.txt'), 'one\nbeing built\n');
    writeFileSync(join(wt, 'new.txt'), 'new\n');
    git(wt, 'add', '-N', 'new.txt');
    fixOnMain(r);
    const c = run(r, '--catch-up', 'a');
    assert.ok(c.ok, c.out);
    assert.match(c.out, /Session "a" is on main again: 1 commit from main came in\. Work in progress is as it was\./);
    assert.equal(git(wt, 'rev-parse', 'HEAD'), git(r.main, 'rev-parse', 'main'));
    assert.equal(read(wt, 'fix.txt'), 'fixed\n');
    assert.equal(read(wt, 'a.txt'), 'one\nbeing built\n');
    assert.match(git(wt, 'status', '--porcelain'), /^ ?M a\.txt$/m, 'changed, not staged (the helper trims the first space)');
    assert.match(git(wt, 'status', '--porcelain'), / A new\.txt/, 'the git add -N file is still marked');
    assert.match(run(r, '--catch-up', 'a').out, /is on main already/);
  });
  it('commits of its own: main is merged in, and --finish still lands one commit', () => {
    const r = makeRepo();
    ran(r, 'b');
    const wt = r.wt('b');
    commitIn(wt, 'b.txt', 'b\n', 'add b');
    fixOnMain(r);
    writeFileSync(join(wt, 'loose.txt'), 'not yet\n');
    const c = run(r, '--catch-up', 'b');
    assert.ok(c.ok, c.out);
    assert.match(c.out, /as one merge, which --finish squashes away/);
    assert.equal(read(wt, 'fix.txt'), 'fixed\n');
    assert.equal(read(wt, 'loose.txt'), 'not yet\n');
    rmSync(join(wt, 'loose.txt'));
    const before = Number(git(r.main, 'rev-list', '--count', 'main'));
    const f = run(r, '--finish', 'b');
    assert.ok(f.ok, f.out);
    assert.equal(Number(git(r.main, 'rev-list', '--count', 'main')), before + 1, 'one commit for the feature, no merge');
    assert.match(git(r.main, 'log', '-1', '--format=%s', 'main'), /add b/);
  });
  it('the same lines changed on both sides: stops with nothing changed', () => {
    const r = makeRepo();
    ran(r, 'c');
    const wt = r.wt('c');
    commitIn(wt, 'a.txt', 'session\n', 'session edit');
    fixOnMain(r, 'a.txt', 'main\n');
    const head = git(wt, 'rev-parse', 'HEAD');
    const c = run(r, '--catch-up', 'c');
    assert.ok(!c.ok, c.out);
    assert.match(c.out, /Main and "c" change the same lines \(a\.txt\)\. Nothing was changed/);
    assert.equal(git(wt, 'rev-parse', 'HEAD'), head);
    assert.equal(git(wt, 'status', '--porcelain'), '');
  });
});
