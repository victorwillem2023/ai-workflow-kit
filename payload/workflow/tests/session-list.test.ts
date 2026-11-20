// workflow/scripts/session.mjs --list and --clean: what each session holds (its card, finished or uncommitted work), and taking
// the finished ones away while a folder git does not know is only named.
// Run in throwaway git repos: a bare "origin" and a clone in the shape of the project (workflow/tests/session-repo.ts).
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitIn, git, makeRepo, roots, run, type Repo } from './session-repo';

const setup = () => makeRepo();

describe('listing and cleaning up sessions', () => {
  after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

  it('--list shows each session\'s card and how many finished features are not pushed', () => {
    const r = setup();
    assert.ok(run(r, 'a', '--card', '42').ok);
    assert.ok(run(r, 'b').ok);
    commitIn(r.wt('b'), 'b.txt', 'x\n', 'feature b');
    assert.ok(run(r, '--finish', 'b', '--no-checks').ok);
    const listed = run(r, '--list');
    assert.ok(listed.ok, listed.out);
    assert.match(listed.out, /app-a\b.*port \d+.*card #42/);
    assert.match(listed.out, /1 finished feature.*not pushed/);
  });

  /** A session with one commit that was merged into main by hand, so its folder and branch are still there. */
  const merged = (r: Repo, topic: string) => {
    assert.ok(run(r, topic).ok);
    commitIn(r.wt(topic), `${topic}.txt`, 'x\n', `add ${topic}`);
    git(r.main, 'merge', '--ff-only', topic);
  };

  it('--list marks a session whose branch is on main as finished, and one with uncommitted files as having uncommitted work', () => {
    const r = setup();
    merged(r, 'done');
    assert.ok(run(r, 'busy').ok);
    commitIn(r.wt('busy'), 'busy.txt', 'x\n', 'add busy');
    writeFileSync(join(r.wt('busy'), 'loose.txt'), 'wip\n');
    assert.ok(run(r, 'fresh').ok); // just started, no commits yet: not finished
    const listed = run(r, '--list');
    assert.ok(listed.ok, listed.out);
    const line = (t: string) => listed.out.split('\n').find((l) => l.includes(`app-${t} `)) ?? '';
    assert.match(line('done'), /finished \(merged\)/);
    assert.match(line('busy'), /uncommitted work/);
    assert.doesNotMatch(line('busy'), /finished/);
    assert.doesNotMatch(line('fresh'), /finished|uncommitted/);
  });

  it('--clean without --yes lists the sessions it would remove and removes nothing', () => {
    const r = setup();
    merged(r, 'done');
    const out = run(r, '--clean');
    assert.ok(out.ok, out.out);
    assert.match(out.out, /would remove/i);
    assert.match(out.out, /done/);
    assert.match(out.out, /--clean --yes/);
    assert.ok(existsSync(r.wt('done')) && git(r.main, 'branch', '--list', 'done') !== '', 'nothing was removed');
  });

  it('--clean --yes removes a merged session with no uncommitted work, and keeps one that is not merged or has uncommitted files', () => {
    const r = setup();
    merged(r, 'done');
    merged(r, 'dirty');
    writeFileSync(join(r.wt('dirty'), 'loose.txt'), 'wip\n');
    assert.ok(run(r, 'open').ok);
    commitIn(r.wt('open'), 'open.txt', 'x\n', 'add open');
    assert.ok(run(r, 'fresh').ok);
    const out = run(r, '--clean', '--yes');
    assert.ok(out.ok, out.out);
    assert.match(out.out, /removed/i);
    assert.equal(existsSync(r.wt('done')), false);
    assert.equal(git(r.main, 'branch', '--list', 'done'), '');
    for (const t of ['dirty', 'open', 'fresh']) assert.ok(existsSync(r.wt(t)) && git(r.main, 'branch', '--list', t) !== '', `${t} is kept`);
  });

  it('--clean names a folder git does not know as a session and does not delete it', () => {
    const r = setup();
    const stray = join(r.root, 'app-board-shots');
    mkdirSync(stray); writeFileSync(join(stray, 'keep.txt'), 'mine\n');
    const preview = run(r, '--clean');
    assert.match(preview.out, /app-board-shots/);
    const listed = run(r, '--list');
    assert.match(listed.out, /app-board-shots/);
    const yes = run(r, '--clean', '--yes');
    assert.ok(yes.ok, yes.out);
    assert.match(yes.out, /app-board-shots/);
    assert.equal(readFileSync(join(stray, 'keep.txt'), 'utf8'), 'mine\n', 'the folder is untouched');
    assert.equal(existsSync(join(r.root, 'app-pushing')), false);
  });
});
