// workflow/tools/lib/frommain.mjs: a session folder whose kit is older than the main folder's runs the gate, the sign-off and the
// session script from the main folder, so a kit fix reaches every open session at once; in every other case its own copy runs.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newer } from '../../workflow/tools/lib/frommain.mjs';
import { ENV, commitIn, makeRepo, roots, ran } from './session-repo';

after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });
const list = (dir: string) => {
  try { return execFileSync('node', [join(dir, 'workflow', 'scripts', 'session.mjs'), '--list'], { cwd: dir, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { const x = e as { stdout?: string; stderr?: string }; return `${x.stdout ?? ''}${x.stderr ?? ''}`; }
};

describe('the kit\'s tools in a session folder', () => {
  it('compares versions by number, not by text', () => {
    assert.equal(newer('4.10.0', '4.9.3'), true);
    assert.equal(newer('4.4.1', '4.4.1'), false);
    assert.equal(newer('4.4.0', '4.4.1'), false);
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
    // a session that holds the newer kit (the kit update itself) keeps its own
    writeFileSync(join(wt, 'workflow', 'record'), 'version=4.5.0\n');
    assert.match(list(wt), /the session copy ran/);
  });
});
