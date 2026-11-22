// workflow/scripts/session.mjs --push: every finished feature goes to origin in one go; when someone pushed meanwhile they are
// replayed on top, and a conflict stops it with main as it was.
// Run in throwaway git repos: a bare "origin" and a clone in the shape of the project (workflow/tests/session-repo.ts).
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addFile, commitIn, fileMap, git, makeRepo, originHas, originMain, roots, run } from './session-repo';

const setup = () => makeRepo();

describe('pushing the finished features', () => {
  after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

  it('--push sends every finished feature to origin in one go', () => {
    const r = setup();
    for (const t of ['a', 'b', 'c']) { assert.ok(run(r, t).ok); commitIn(r.wt(t), `${t}.txt`, 'x\n', `feature ${t}`); }
    for (const t of ['a', 'b', 'c']) assert.ok(run(r, '--finish', t, '--no-checks').ok);
    assert.equal(git(r.main, 'rev-list', '--count', 'origin/main..main'), '3');
    const pushed = run(r, '--push');
    assert.ok(pushed.ok, pushed.out);
    assert.equal(originMain(r), git(r.main, 'rev-parse', 'main'));
    assert.equal(git(r.origin, 'rev-list', '--count', 'main'), '4', 'start and three features, a straight line');
    assert.match(run(r, '--push').out, /nothing/i);
  });

  it('--push stamps the stopping note as pushed, so a note written before it never reads as still waiting', () => {
    const r = setup();
    assert.ok(run(r, 'a').ok);
    commitIn(r.wt('a'), 'a.txt', 'x\n', 'feature a');
    assert.ok(run(r, '--finish', 'a', '--no-checks').ok);
    const note = join(r.main, git(r.main, 'rev-parse', '--git-common-dir'), 'workflow-stopped.json');
    writeFileSync(note, JSON.stringify({ at: new Date().toISOString(), text: 'Shipped a, not pushed; next: b' }));
    const pushed = run(r, '--push');
    assert.ok(pushed.ok, pushed.out);
    const after = JSON.parse(readFileSync(note, 'utf8'));
    assert.equal(after.text, 'Shipped a, not pushed; next: b', 'what comes next is kept');
    assert.ok(Date.parse(after.pushedAt) >= Date.parse(after.at), 'stamped as pushed after it was written');
  });

  it('--push replays unpushed features on top of what someone else pushed, then pushes', () => {
    const r = setup();
    assert.ok(run(r, 'a').ok);
    commitIn(r.wt('a'), 'mine.txt', 'mine\n', 'my feature');
    assert.ok(run(r, '--finish', 'a', '--no-checks').ok);
    const other = join(r.root, 'other');
    git(r.root, 'clone', r.origin, other);
    commitIn(other, 'theirs.txt', 'theirs\n', 'theirs'); git(other, 'push', 'origin', 'main');
    const pushed = run(r, '--push');
    assert.ok(pushed.ok, pushed.out);
    assert.ok(originHas(r, 'mine.txt') && originHas(r, 'theirs.txt'));
    assert.equal(git(r.origin, 'rev-list', '--count', 'main'), '3', 'a straight line, no merge commit');
    assert.equal(git(r.main, 'rev-parse', 'main'), originMain(r), 'the local main is what was pushed');
    assert.equal(readFileSync(r.checkLog, 'utf8'), 't', 'the checks ran once more on the replayed commits');
    assert.doesNotMatch(git(r.main, 'worktree', 'list'), /app-pushing/, 'no leftover work folder');
  });

  it('--push stops on a conflict with what someone else pushed, and leaves main as it was', () => {
    const r = setup();
    assert.ok(run(r, 'a').ok);
    commitIn(r.wt('a'), 'a.txt', 'mine\n', 'my change to a');
    assert.ok(run(r, '--finish', 'a', '--no-checks').ok);
    const other = join(r.root, 'other');
    git(r.root, 'clone', r.origin, other);
    commitIn(other, 'a.txt', 'theirs\n', 'their change to a'); git(other, 'push', 'origin', 'main');
    const mainBefore = git(r.main, 'rev-parse', 'main'); const originBefore = originMain(r);
    const pushed = run(r, '--push');
    assert.equal(pushed.ok, false);
    assert.match(pushed.out, /conflict/i);
    assert.match(pushed.out, /my change to a/, 'it says which commit');
    assert.equal(git(r.main, 'rev-parse', 'main'), mainBefore);
    assert.equal(originMain(r), originBefore);
    assert.doesNotMatch(git(r.main, 'worktree', 'list'), /app-pushing/, 'no leftover work folder');
  });

  it('two sessions that each add a file both finish, with no conflict in the file map', () => {
    const r = setup();
    assert.ok(run(r, 'a').ok); assert.ok(run(r, 'b').ok);
    addFile(r.wt('a'), 'a-file.txt', 'feature a');
    addFile(r.wt('b'), 'b-file.txt', 'feature b');
    assert.ok(run(r, '--finish', 'a', '--no-checks').ok);
    const done = run(r, '--finish', 'b', '--no-checks');
    assert.ok(done.ok, done.out);
    assert.match(fileMap(r.main), /a-file\.txt[\s\S]*b-file\.txt/, 'the map lists both');
    assert.equal(git(r.main, 'rev-list', '--count', 'origin/main..main'), '2', 'one commit each');
    assert.equal(git(r.main, 'status', '--porcelain'), '');
  });

  it('the file map is re-made after the rebase and lands in the same single commit', () => {
    const r = setup();
    assert.ok(run(r, 'a').ok);
    commitIn(r.wt('a'), 'new-file.txt', 'x\n', 'feature a'); // the map was not updated in the session
    assert.ok(run(r, '--finish', 'a', '--no-checks').ok);
    assert.equal(git(r.main, 'rev-list', '--count', 'origin/main..main'), '1');
    assert.match(git(r.main, 'show', '--name-only', '--format=', 'main'), /docs\/MAP\.md/);
    assert.match(fileMap(r.main), /new-file\.txt/);
  });

  it('a conflict in a file other than the map stops the finish with the clash left open in the folder and main untouched', () => {
    const r = setup();
    assert.ok(run(r, 'a').ok); assert.ok(run(r, 'b').ok);
    addFile(r.wt('a'), 'a-file.txt', 'feature a');
    commitIn(r.wt('a'), 'a.txt', 'from a\n', 'a changes a');
    commitIn(r.wt('b'), 'a.txt', 'from b\n', 'b changes a');
    assert.ok(run(r, '--finish', 'a', '--no-checks').ok);
    const mainBefore = git(r.main, 'rev-parse', 'main'); const sha = git(r.wt('b'), 'rev-parse', 'HEAD');
    const done = run(r, '--finish', 'b', '--no-checks');
    assert.equal(done.ok, false);
    assert.match(done.out, /change the same lines \(a\.txt\)/);
    assert.match(done.out, /then run --finish b again/);
    assert.equal(git(r.main, 'rev-parse', 'main'), mainBefore);
    assert.equal(git(r.wt('b'), 'rev-parse', 'HEAD'), sha, 'nothing committed: the merge waits to be settled');
    assert.match(git(r.wt('b'), 'status', '--porcelain'), /^UU a\.txt/m, 'the clash is open in the folder');
  });
});
