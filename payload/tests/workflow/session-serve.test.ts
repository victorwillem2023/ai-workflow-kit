// scripts/session.mjs --serve <topic>: starts the session's dev server in the background and waits until its link answers, so the
// owner only opens it (.claude/skills/build/try-it.md); a server that runs already is left alone; no dev script says what to do
// instead. Runs in throwaway repos (tests/workflow/session-repo.ts), on a port picked free here.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { commitIn, makeRepo, PORTS, roots, run, type Repo } from './session-repo';

const SERVER = `const fs=require('fs');const port=Number(/^PORT=(\\d+)\\s*$/m.exec(fs.readFileSync('.env','utf8'))[1]);
fs.writeFileSync(process.argv[2],String(process.pid));require('http').createServer((q,s)=>s.end('ok')).listen(port,'127.0.0.1');`;
const pids: string[] = [];

const isFree = (port: number) => new Promise<boolean>((ok) => {
  const s = createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true)));
  s.listen(port, '127.0.0.1');
});
let nextPort = 8970 + PORTS;
/** A session `a` with a dev script that serves "ok" on a free port of its own. */
async function withDev(dev: boolean): Promise<Repo> {
  const r = makeRepo();
  assert.ok(run(r, 'a').ok);
  while (!(await isFree(nextPort))) nextPort++;
  const env = join(r.wt('a'), '.env');
  writeFileSync(env, readFileSync(env, 'utf8').replace(/^PORT=\d+\s*$/m, `PORT=${nextPort++}`));
  const pid = join(r.root, 'server.pid');
  pids.push(pid);
  writeFileSync(join(r.wt('a'), 'server.cjs'), SERVER);
  const scripts = dev ? { dev: `node server.cjs "${pid.replace(/\\/g, '/')}"` } : {};
  commitIn(r.wt('a'), 'package.json', JSON.stringify({ scripts }), 'dev script');
  return r;
}
const portOf = (r: Repo) => /^PORT=(\d+)\s*$/m.exec(readFileSync(join(r.wt('a'), '.env'), 'utf8'))![1];

describe('serving a session for the owner to try', () => {
  after(() => {
    for (const f of pids) { try { process.kill(Number(readFileSync(f, 'utf8'))); } catch { /* not started or stopped */ } }
    // on Windows the npm above the stopped server lets go of the folder a moment later
    for (const r of roots) rmSync(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  });

  it('starts the dev server in the background and prints the link once it answers; a second run leaves it alone', async () => {
    const r = await withDev(true);
    const url = `http://127.0.0.1:${portOf(r)}`;
    const out = run(r, '--serve', 'a');
    assert.ok(out.ok, out.out);
    assert.match(out.out, new RegExp(`The dev server runs: ${url}`));
    assert.equal(await (await fetch(url)).text(), 'ok', 'it still runs after the command ended');
    const again = run(r, '--serve', 'a');
    assert.ok(again.ok, again.out);
    assert.match(again.out, /runs already/);
  });

  it('without a dev script it says a change without a screen is tried with a command', async () => {
    const r = await withDev(false);
    const out = run(r, '--serve', 'a');
    assert.equal(out.ok, false);
    assert.match(out.out, /no "dev" script[\s\S]*try-it\.md/);
  });
});
