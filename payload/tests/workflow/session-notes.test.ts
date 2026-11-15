// scripts/session.mjs --check-main and --commit-notes: docs and settings left in the main folder (by /docs, /lesson, /shape or the
// owner's own edits) are named as theirs and go in as one commit of their own after the quick gate; code left there still stops /ship.
// Runs in throwaway repos (tests/workflow/session-repo.ts).
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, makeRepo, roots, run, type Repo } from './session-repo';

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
  writeFileSync(join(r.main, 'workflow.config.json'), JSON.stringify({ project: { audience: 'me' } }));
  mkdirSync(join(r.main, 'docs'), { recursive: true });
  writeFileSync(join(r.main, 'docs', 'PRODUCT.md'), '# Product\n');
}
const count = (r: Repo) => Number(git(r.main, 'rev-list', '--count', 'main'));

describe('docs and settings left in the main folder', () => {
  after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

  it('--check-main names them as the owner\'s and says how to commit them, every file by its full name', () => {
    const r = repo(true);
    ownerNotes(r);
    const out = run(r, '--check-main');
    assert.equal(out.ok, false);
    assert.match(out.out, /docs and settings that are not committed yet/);
    assert.match(out.out, /^workflow\.config\.json$/m, 'the first file keeps its first letter');
    assert.match(out.out, /^docs\/PRODUCT\.md$/m, 'a file in a new folder is named, not the folder');
    assert.match(out.out, /--commit-notes/);
  });

  it('--commit-notes runs the quick gate and makes one commit of them, and --check-main is clean after', () => {
    const r = repo(true);
    ownerNotes(r);
    const before = count(r);
    const done = run(r, '--commit-notes', 'Product: the problem and the first users');
    assert.ok(done.ok, done.out);
    assert.equal(count(r), before + 1, 'one commit');
    assert.equal(git(r.main, 'log', '-1', '--format=%s'), 'Product: the problem and the first users');
    assert.equal(git(r.main, 'status', '--porcelain'), '');
    assert.ok(run(r, '--check-main').ok);
  });

  it('a quick gate that fails commits nothing', () => {
    const r = repo(false);
    ownerNotes(r);
    const before = count(r);
    const done = run(r, '--commit-notes', 'Docs: x');
    assert.equal(done.ok, false);
    assert.match(done.out, /quick gate fails/);
    assert.equal(count(r), before);
  });

  it('code among them is refused by --commit-notes and still stops --check-main with the old message', () => {
    const r = repo(true);
    ownerNotes(r);
    writeFileSync(join(r.main, 'a.txt'), 'changed\n');
    const done = run(r, '--commit-notes', 'Docs: x');
    assert.equal(done.ok, false);
    assert.match(done.out, /these are not:\na\.txt/);
    const check = run(r, '--check-main');
    assert.equal(check.ok, false);
    assert.match(check.out, /The main folder has uncommitted files/);
  });

  it('without a subject it says how to give one', () => {
    const r = repo(true);
    ownerNotes(r);
    assert.match(run(r, '--commit-notes').out, /Say what the commit is/);
  });
});
