// workflow/scripts/session.mjs --finish runs the quick gate after the rebase, not the whole suite again: /ship's gate:all ran it,
// so only what the rebase can have broken is checked, from where the feature sat before (its files and what came in under it).
// A gate that fails stops the finish with main where it was.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitIn, git, makeRepo, roots, run, type Repo, ran } from './session-repo';

// a stand-in for the project's gate: it writes down how it was called, and fails when GATE_FAIL is set
const GATE = `import fs from 'node:fs';
fs.appendFileSync(process.env.CHECK_LOG, 'gate ' + process.argv.slice(2).join(' ') + '\\n');
process.exit(process.env.GATE_FAIL ? 1 : 0);`;

function gateRepo(): Repo {
  const r = makeRepo();
  writeFileSync(join(r.main, 'workflow', 'tools', 'gate.mjs'), GATE);
  git(r.main, 'add', '-A'); git(r.main, 'commit', '-m', 'gate'); git(r.main, 'push', 'origin', 'main');
  return r;
}
/** A feature started on main, then a commit on main under it: the rebase brings something in. Returns where the feature sat. */
function featureWithMainMoved(r: Repo, topic: string) {
  ran(r, topic);
  const sat = git(r.main, 'rev-parse', 'main');
  commitIn(r.wt(topic), `${topic}.txt`, 'new\n', `add ${topic}`);
  commitIn(r.main, 'other.txt', 'from main\n', 'another feature on main');
  return sat;
}
const log = (r: Repo) => (existsSync(r.checkLog) ? readFileSync(r.checkLog, 'utf8') : '');

after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

describe('the checks at --finish', () => {
  it('run the quick gate from where the feature sat, not the whole test suite', () => {
    const r = gateRepo();
    const sat = featureWithMainMoved(r, 'quick');
    const f = run(r, '--finish', 'quick');
    assert.ok(f.ok, f.out);
    assert.equal(log(r), `gate --base ${sat}\n`, 'the gate once, with the old base; npm test not run');
    assert.match(git(r.main, 'log', '-1', '--format=%s', 'main'), /add quick/);
  });
  it('stop with main where it was when the quick gate fails', () => {
    const r = gateRepo();
    featureWithMainMoved(r, 'broken');
    const before = git(r.main, 'rev-parse', 'main');
    r.env.GATE_FAIL = '1';
    const f = run(r, '--finish', 'broken');
    assert.ok(!f.ok, f.out);
    assert.match(f.out, /quick gate fails after the rebase/);
    assert.equal(git(r.main, 'rev-parse', 'main'), before);
  });
});
