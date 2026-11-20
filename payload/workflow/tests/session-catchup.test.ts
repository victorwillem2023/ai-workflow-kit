// workflow/scripts/session.mjs --catch-up <topic>: main comes into a session mid-build without the owner's "done" and without a
// stash (which breaks after `git add -N`): a fast-forward when the session has no commit of its own, a merge when it has (which
// --finish squashes away), the loose work as it was (saved as a checkpoint on its own branch when main changed the same files); a
// clash is left open in the folder to settle there, and what a script writes (the map, the sign-off rows) is settled by itself.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  it('the same lines changed on both sides: the merge is left open and named, and the same command goes on once it is settled', () => {
    const r = makeRepo();
    ran(r, 'c');
    const wt = r.wt('c');
    commitIn(wt, 'a.txt', 'session\n', 'session edit');
    fixOnMain(r, 'a.txt', 'main\n');
    const c = run(r, '--catch-up', 'c');
    assert.ok(!c.ok, c.out);
    assert.match(c.out, /Main and "c" change the same lines \(a\.txt\)\. The merge is left open/);
    assert.match(c.out, /run --catch-up c again/);
    assert.match(read(wt, 'a.txt'), /<<<<<<< /, 'the clash is in the file, to settle where the work is');
    // run again with the clash still in the file: still open, nothing committed
    assert.match(run(r, '--catch-up', 'c').out, /change the same lines \(a\.txt\)/);
    writeFileSync(join(wt, 'a.txt'), 'session and main\n');
    const again = run(r, '--catch-up', 'c');
    assert.ok(again.ok, again.out);
    assert.match(again.out, /is on main again: the clash is settled/);
    assert.equal(read(wt, 'a.txt'), 'session and main\n');
    assert.equal(git(wt, 'status', '--porcelain'), '');
    // --finish has no clash left: one commit on main
    const f = run(r, '--finish', 'c');
    assert.ok(f.ok, f.out);
    assert.equal(git(r.main, 'show', 'main:a.txt'), 'session and main');
  });
  it('loose work in a file main also changed: saved as a checkpoint on the session\'s branch, then main comes in', () => {
    const r = makeRepo();
    ran(r, 'd');
    const wt = r.wt('d');
    writeFileSync(join(wt, 'a.txt'), 'one\nbeing built\n');
    fixOnMain(r, 'a.txt', 'zero\none\n');
    const c = run(r, '--catch-up', 'd');
    assert.ok(c.ok, c.out);
    assert.match(c.out, /saved as a checkpoint commit on its own branch/);
    assert.equal(read(wt, 'a.txt'), 'zero\none\nbeing built\n', 'both changes are there');
    assert.match(git(wt, 'log', '--format=%s', 'main..HEAD'), /^checkpoint: d: work in progress/m);
    assert.equal(git(r.main, 'show', 'main:a.txt'), 'zero\none', 'nothing of the session reached main');
    // a checkpoint is never a feature's subject: --finish asks for the approved one
    assert.match(run(r, '--finish', 'd').out, /The first commit is a checkpoint/);
    const f = run(r, '--finish', 'd', '--subject', 'A: being built');
    assert.ok(f.ok, f.out);
    assert.equal(git(r.main, 'log', '-1', '--format=%s', 'main'), 'A: being built');
  });
  it('sign-off rows added on both sides are both kept, with no clash to settle', () => {
    const r = makeRepo();
    const rows = 'docs/company/SIGNOFFS.md';
    mkdirSync(join(r.main, 'docs', 'company'), { recursive: true });
    commitIn(r.main, rows, '# Sign-offs\n\n| Date |\n|---|\n', 'the record');
    git(r.main, 'push', 'origin', 'main');
    ran(r, 'e');
    const wt = r.wt('e');
    commitIn(wt, rows, '# Sign-offs\n\n| Date |\n|---|\n| session row |\n', 'signed in the session');
    fixOnMain(r, rows, '# Sign-offs\n\n| Date |\n|---|\n| main row |\n');
    const c = run(r, '--catch-up', 'e');
    assert.ok(c.ok, c.out);
    assert.match(read(wt, rows), /\| session row \|/);
    assert.match(read(wt, rows), /\| main row \|/);
    assert.doesNotMatch(read(wt, rows), /<<<<<<<|=======/);
  });
  it('--finish with a clash in the feature\'s own file changes nothing and points to --catch-up', () => {
    const r = makeRepo();
    ran(r, 'f');
    const wt = r.wt('f');
    commitIn(wt, 'a.txt', 'session\n', 'session edit');
    fixOnMain(r, 'a.txt', 'main\n');
    const head = git(wt, 'rev-parse', 'HEAD');
    const f = run(r, '--finish', 'f');
    assert.ok(!f.ok, f.out);
    assert.match(f.out, /Nothing was changed\. Bring main into the session first: node workflow\/scripts\/session\.mjs --catch-up f/);
    assert.equal(git(wt, 'rev-parse', 'HEAD'), head);
  });
});
