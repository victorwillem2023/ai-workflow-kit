// Protecting main (tools/workflow/protect.mjs): the rule sent to GitHub, what its answer means, and the push guard tried with real git.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoName, ruleset, verdict } from '../../tools/workflow/lib/protect.mjs';

const script = fileURLToPath(new URL('../../tools/workflow/protect.mjs', import.meta.url));

describe('the GitHub rule', () => {
  it('forbids deleting the default branch and pushes that rewrite it, and nothing else', () => {
    const r = ruleset();
    assert.deepEqual(r.rules.map((x) => x.type), ['deletion', 'non_fast_forward']);
    assert.deepEqual((r.conditions as { ref_name: { include: string[] } }).ref_name.include, ['~DEFAULT_BRANCH']);
  });
  it('asks GitHub about the repository by its full name, never with the owner twice', () => {
    assert.equal(repoName({ owner: 'me', repo: 'me/app' }), 'me/app', 'the installer writes board.repo as owner/name');
    assert.equal(repoName({ owner: 'me', repo: 'app' }), 'me/app', 'a bare name gets the owner in front');
  });
  it('a refusal for a private repository on the free plan is said in plain words, and is not a crash', () => {
    const v = verdict(1, '{"message":"Upgrade to GitHub Pro or make this repository public to enable this feature.","status":"403"}');
    assert.equal(v.ok, false);
    assert.match(v.line, /paid plan .* or a public repository; the guard on this computer still works/);
    assert.equal(verdict(0, '{}').ok, true);
    assert.doesNotMatch(verdict(1, 'gh: Resource not accessible by integration (HTTP 403)').line, /paid plan/, 'another refusal is passed on as it is');
  });
});

describe('the guard on this computer', () => {
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const push = (cwd: string, ...a: string[]) => spawnSync('git', ['push', ...a], { cwd, encoding: 'utf8' });
  it('refuses a force push and a delete of main, and lets a normal push and another branch through', () => {
    const dir = mkdtempSync(join(tmpdir(), 'protect-'));
    try {
      git(dir, 'init', '--bare', '-b', 'main', 'origin.git');
      git(dir, 'clone', 'origin.git', 'work');
      const work = join(dir, 'work');
      for (const [k, v] of [['user.name', 't'], ['user.email', 't@example.com'], ['commit.gpgsign', 'false']]) git(work, 'config', k, v);
      const commit = (name: string) => { writeFileSync(join(work, name), name); git(work, 'add', '.'); git(work, 'commit', '-m', name); };
      git(work, 'checkout', '-b', 'main');
      commit('one'); commit('two');
      // gh stands in as a script that answers like GitHub does for a private repository on the free plan, and like GitHub
      // does for an address that does not exist when it is asked about any other repository
      writeFileSync(join(work, 'workflow.config.json'), JSON.stringify({ board: { owner: 'me', repo: 'me/app' } }));
      const fakeGh = join(dir, 'gh.mjs');
      writeFileSync(fakeGh, [
        'if (!process.argv.includes("repos/me/app/rulesets")) { console.log("gh: Not Found (HTTP 404)"); process.exit(1); }',
        'console.log(JSON.stringify({ message: "Upgrade to GitHub Pro or make this repository public to enable this feature.", status: "403" })); process.exit(1);',
      ].join('\n'));
      const out = execFileSync(process.execPath, [script], { cwd: work, encoding: 'utf8', env: { ...process.env, WORKFLOW_GH: fakeGh } });
      assert.match(out, /refused \(git hook pre-push\)/);
      assert.match(out, /GitHub: not set\. Rules for a private repository need a paid plan/);
      assert.equal(push(work, 'origin', 'main').status, 0, 'a normal push goes through');
      git(work, 'reset', '--hard', 'HEAD~1');
      commit('other');
      const forced = push(work, '--force', 'origin', 'main');
      assert.notEqual(forced.status, 0);
      assert.match(forced.stderr + forced.stdout, /refused: this push would rewrite main/);
      const deleted = push(work, 'origin', ':main');
      assert.match(deleted.stderr + deleted.stdout, /refused: this push would delete main/);
      assert.equal(push(work, '--force', 'origin', 'main:scratch').status, 0, 'another branch is not guarded');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
