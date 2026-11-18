// Split from session-notes.test.ts so the two halves run side by side: --sync, --card and --carry-notes.
// workflow/scripts/session.mjs --check-main and --commit-notes: docs and settings left in the main folder (by /docs, /lesson, /shape or the
// owner's own edits) are named as theirs and go in as one commit of their own after the quick gate; code left there still stops /ship.
// Runs in throwaway repos (workflow/tests/session-repo.ts).
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ghCalls, git, makeRepo, OPTION, roots, run, type Repo } from './session-repo';

/** A repo whose quick gate passes or fails, committed so package.json itself is not left over. */
function repo(gatePasses: boolean): Repo {
  const r = makeRepo();
  const gate = gatePasses ? 'node -e ""' : 'node -e "process.exit(1)"';
  writeFileSync(join(r.main, 'package.json'), JSON.stringify({ scripts: { map: 'node map.cjs', test: 'node check.cjs', gate } }));
  git(r.main, 'add', '-A'); git(r.main, 'commit', '-m', 'gate'); git(r.main, 'push', '-q', 'origin', 'main');
  return r;
}
/** The owner's edits in the main folder: a changed setting and a new doc in a new folder. */
function ownerNotes(r: Repo) {
  writeFileSync(join(r.main, 'workflow/config.json'), JSON.stringify({ project: { audience: 'me' } }));
  mkdirSync(join(r.main, 'docs'), { recursive: true });
  writeFileSync(join(r.main, 'docs', 'PRODUCT.md'), '# Product\n');
}
const count = (r: Repo) => Number(git(r.main, 'rev-list', '--count', 'main'));

describe('docs and settings left in the main folder', () => {
  after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

  it('--sync brings in what merged on GitHub when nothing is in the way, and leaves uncommitted work alone', () => {
    const r = repo(true);
    // an update merged on GitHub (Renovate, or a feature from elsewhere): a commit origin has and the main folder not yet
    const other = join(r.root, 'elsewhere');
    git(r.root, 'clone', '-q', r.origin, other);
    writeFileSync(join(other, 'merged.txt'), 'merged on GitHub\n');
    git(other, 'add', '-A'); git(other, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'Update: a small one'); git(other, 'push', '-q', 'origin', 'main');
    writeFileSync(join(r.main, 'notes.md'), 'mine, not committed\n');
    const held = run(r, '--sync');
    assert.ok(held.ok, held.out);
    assert.match(held.out, /not brought up to date: the main folder has 1 uncommitted file/);
    assert.equal(existsSync(join(r.main, 'merged.txt')), false, 'nothing moved under uncommitted work');
    rmSync(join(r.main, 'notes.md'));
    const synced = run(r, '--sync');
    assert.ok(synced.ok, synced.out);
    assert.match(synced.out, /main was 1 commit behind origin\/main and is up to date now/);
    assert.ok(existsSync(join(r.main, 'merged.txt')), 'the update is here without a command');
  });

  it('starting a session with --card moves the card to In progress and says so on it, with no board warning', () => {
    const r = repo(true);
    // the fake gh knows card 42 on project 1 (workflow/tests/session-repo.ts)
    const cfg = JSON.parse(readFileSync(join(r.main, 'workflow/config.json'), 'utf8'));
    writeFileSync(join(r.main, 'workflow/config.json'), JSON.stringify({ ...cfg, board: { ...cfg.board, project: 1 } }));
    // --allow-empty: the fixture copies the project's own config, which may already name project 1
    git(r.main, 'add', '-A'); git(r.main, 'commit', '-q', '--allow-empty', '-m', 'board');
    const made = run(r, 'a', '--card', '42');
    assert.ok(made.ok, made.out);
    assert.doesNotMatch(made.out, /Board warning/, 'a broken board library would only show here, as a warning');
    const calls = ghCalls(r).map((c) => c.args);
    const move = calls.find((a) => a[0] === 'project' && a[1] === 'item-edit');
    assert.ok(move, 'the card was moved');
    assert.equal(move[move.indexOf('--single-select-option-id') + 1], OPTION['In progress']);
    assert.ok(calls.some((a) => a[0] === 'issue' && a[1] === 'comment' && a.includes('42')), 'and the comment names the session');
  });

  it('--carry-notes moves the notes into the session (a project whose notes go in with the feature) and leaves main as it was', () => {
    const r = repo(true);
    assert.ok(run(r, 'a').ok);
    ownerNotes(r);
    const carried = run(r, '--carry-notes', 'a');
    assert.ok(carried.ok, carried.out);
    assert.match(carried.out, /Carried 2 notes into \.\.\/app-a/);
    assert.ok(existsSync(join(r.wt('a'), 'docs', 'PRODUCT.md')), 'the new doc is in the session');
    assert.match(readFileSync(join(r.wt('a'), 'workflow/config.json'), 'utf8'), /audience/, 'and the changed setting');
    assert.equal(git(r.main, 'status', '--porcelain'), '', 'the main folder is as it was');
  });

  it('--carry-notes refuses a note the session changed too, instead of overwriting it', () => {
    const r = repo(true);
    assert.ok(run(r, 'a').ok);
    writeFileSync(join(r.wt('a'), 'workflow/config.json'), '{"the":"session\'s own"}');
    ownerNotes(r);
    const refused = run(r, '--carry-notes', 'a');
    assert.equal(refused.ok, false);
    assert.match(refused.out, /The session changed these too[\s\S]*workflow\/config\.json/);
    assert.match(readFileSync(join(r.wt('a'), 'workflow/config.json'), 'utf8'), /session's own/, 'nothing overwritten');
  });

  it('without a subject it says how to give one', () => {
    const r = repo(true);
    ownerNotes(r);
    assert.match(run(r, '--commit-notes').out, /Say what the commit is/);
  });

  it('--push replays the finished features on what someone pushed meanwhile, checks them there, and pushes', () => {
    const r = repo(true);
    // a finished feature waiting on the local main, and a commit someone else pushed to origin in the meantime
    writeFileSync(join(r.main, 'feature.txt'), 'mine\n');
    git(r.main, 'add', '-A'); git(r.main, 'commit', '-qm', 'Feature: mine');
    const other = join(r.root, 'elsewhere');
    git(r.root, 'clone', '-q', r.origin, other);
    writeFileSync(join(other, 'theirs.txt'), 'theirs\n');
    git(other, 'add', '-A'); git(other, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'Feature: theirs'); git(other, 'push', '-q', 'origin', 'main');
    const pushed = run(r, '--push');
    assert.ok(pushed.ok, pushed.out);
    assert.match(pushed.out, /replaying 1 finished feature/);
    assert.ok(existsSync(r.checkLog), 'the checks ran on the replayed features (runChecks, kit 4.3.0: it was not imported and this path threw)');
    const log = git(r.origin, 'log', '--format=%s', 'main');
    assert.match(log, /^Feature: mine\nFeature: theirs/, 'mine on top of theirs, on origin');
  });
});
