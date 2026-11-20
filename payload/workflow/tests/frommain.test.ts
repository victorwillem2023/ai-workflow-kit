// workflow/tools/lib/frommain.mjs: a session folder whose kit is older than the main folder's runs the gate, the sign-off and the
// session script from the main folder, so a kit fix reaches every open session at once; in every other case its own copy runs.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newer, sameLine } from '../../workflow/tools/lib/frommain.mjs';
import { ENV, commitIn, makeRepo, roots, ran } from './session-repo';

after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });
// (what it printed and what it said beside it: the line about the kit's version goes to the error stream)
const list = (dir: string) => {
  const r = spawnSync('node', [join(dir, 'workflow', 'scripts', 'session.mjs'), '--list'], { cwd: dir, env: ENV, encoding: 'utf8' });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`;
};

describe('the kit\'s tools in a session folder', () => {
  it('compares versions by number, not by text', () => {
    assert.equal(newer('4.10.0', '4.9.3'), true);
    assert.equal(newer('4.4.1', '4.4.1'), false);
    assert.equal(newer('4.4.0', '4.4.1'), false);
    assert.equal(sameLine('4.6.0', '4.6.2'), true);
    assert.equal(sameLine('4.6.2', '4.7.0'), false);
  });
  it('run from the main folder once its kit is newer, and from the session itself otherwise', () => {
    const r = makeRepo();
    commitIn(r.main, 'workflow/record', 'version=4.4.0\n', 'the record');
    ran(r, 'a');
    const wt = r.wt('a');
    // the session's own copy says so, so which copy ran can be seen
    appendFileSync(join(wt, 'workflow', 'scripts', 'session.mjs'), '\nconsole.log("the session copy ran");\n');
    assert.match(list(wt), /the session copy ran/, 'the same kit version: its own copy');
    writeFileSync(join(r.main, 'workflow', 'record'), 'version=4.4.1\n');
    const out = list(wt);
    assert.doesNotMatch(out, /the session copy ran/);
    assert.match(out, /Ports in use by sessions/, 'the main folder\'s copy did the work');
    // a bigger step may have changed the settings: the session's own copy runs, and says to bring main in
    writeFileSync(join(r.main, 'workflow', 'record'), 'version=4.5.0\n');
    const big = list(wt);
    assert.match(big, /the session copy ran/);
    assert.match(big, /the main folder has kit 4\.5\.0, this session folder 4\.4\.0: bring main in/);
    // a session that holds the newer kit (the kit update itself) keeps its own
    writeFileSync(join(wt, 'workflow', 'record'), 'version=4.5.0\n');
    assert.match(list(wt), /the session copy ran/);
  });
});
