// The pull-request flow of scripts/session.mjs ("flow": "pr"): --finish opens a pull request and leaves main alone, --merge
// lands it only with green checks. gh is a stand-in that merges in the throwaway origin the way GitHub's squash does.
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, run, git, commitIn, roots, originHas, type Repo } from './session-repo';

// pr view: none open yet; pr create: an address; pr checks: fails while CHECKS_RED is set; pr merge: one new commit on origin's main
const FAKE_GH = `const fs=require('fs'),{execFileSync}=require('child_process');const a=process.argv.slice(2);
fs.appendFileSync(process.env.GH_LOG,JSON.stringify({args:a})+'\\n');
const cmd=a.slice(0,2).join(' ');const g=(...x)=>execFileSync('git',x,{cwd:process.env.ORIGIN,encoding:'utf8'}).trim();
if(cmd==='pr view')process.exit(1);
else if(cmd==='pr create')console.log('https://github.com/me/app/pull/7');
else if(cmd==='pr checks'){if(process.env.CHECKS_RED){console.log('gate\\tfail');process.exit(1)}}
else if(cmd==='pr merge'){const c=g('commit-tree',a[2]+'^{tree}','-p','main','-m','squashed');g('update-ref','refs/heads/main',c)}
else console.log('{}');`;

function prRepo(): Repo {
  const r = makeRepo();
  const cfg = JSON.parse(readFileSync(join(r.main, 'workflow.config.json'), 'utf8'));
  cfg.session.flow = 'pr';
  writeFileSync(join(r.main, 'workflow.config.json'), JSON.stringify(cfg));
  git(r.main, 'commit', '-am', 'pull requests'); git(r.main, 'push', 'origin', 'main');
  writeFileSync(join(r.root, 'fake-gh.cjs'), FAKE_GH);
  r.env = { ...r.env, ORIGIN: r.origin, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  return r;
}

describe('the pull-request flow', () => {
  after(() => { for (const d of roots) rmSync(d, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

  it('--finish pushes the branch and opens a pull request; main is not touched and the session folder stays', () => {
    const r = prRepo();
    run(r, 'tiles');
    commitIn(r.wt('tiles'), 'b.txt', 'b\n', 'Map: tiles');
    const before = git(r.main, 'rev-parse', 'main');
    const done = run(r, '--finish', 'tiles');
    assert.ok(done.ok, done.out);
    assert.match(done.out, /Pull request: https:\/\/github.com\/me\/app\/pull\/7/);
    assert.equal(git(r.main, 'rev-parse', 'main'), before, 'the local main did not move');
    assert.ok(!originHas(r, 'b.txt'), 'origin main does not have it yet');
    assert.equal(git(r.origin, 'rev-parse', 'tiles'), git(r.wt('tiles'), 'rev-parse', 'HEAD'), 'the branch is on origin');
    assert.ok(existsSync(r.wt('tiles')));
  });

  it('--merge refuses while the checks are red, and --push says this project uses pull requests', () => {
    const r = prRepo();
    run(r, 'tiles'); commitIn(r.wt('tiles'), 'b.txt', 'b\n', 'Map: tiles'); run(r, '--finish', 'tiles');
    r.env = { ...r.env, CHECKS_RED: '1' };
    const red = run(r, '--merge', 'tiles');
    assert.equal(red.ok, false);
    assert.match(red.out, /not green, so it is not merged/);
    assert.ok(!originHas(r, 'b.txt'));
    assert.match(run(r, '--push').out, /works with pull requests/);
  });

  it('--merge with green checks lands it, brings the local main up to date and removes the session', () => {
    const r = prRepo();
    run(r, 'tiles'); commitIn(r.wt('tiles'), 'b.txt', 'b\n', 'Map: tiles'); run(r, '--finish', 'tiles');
    const merged = run(r, '--merge', 'tiles');
    assert.ok(merged.ok, merged.out);
    assert.ok(originHas(r, 'b.txt'));
    assert.ok(existsSync(join(r.main, 'b.txt')), 'the local main has the feature');
    assert.ok(!existsSync(r.wt('tiles')), 'the session folder is gone');
    assert.equal(git(r.main, 'branch', '--list', 'tiles'), '');
  });
});
