// workflow/scripts/session-stop.mjs through workflow/scripts/session.mjs: finishing a session stops its own dev server first (and only its own),
// a folder still held open is named instead of failing, --no-checks keeps the folder, --clean --yes removes empty leftovers,
// and a removal never reaches the main folder's node_modules through the link. Runs in throwaway repos (workflow/tests/session-repo.ts);
// the "dev server" is a small node parent that spawns a child listening on the session's port, as tsx watch does.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { commitIn, git, makeRepo, PORTS, roots, run, type Repo, ran } from './session-repo';

const PARENT = `const {spawn}=require('child_process');const c=spawn(process.execPath,[__dirname+'/child.cjs',process.argv[2]],{stdio:'ignore'});
require('fs').writeFileSync(__dirname+'/parent.pid',String(process.pid));setInterval(()=>{},1000);c.on('exit',()=>process.exit(0));`;
// the PID file is written under another name and renamed, so the test never reads a half-written one
const CHILD = `require('http').createServer((q,s)=>s.end('ok')).listen(Number(process.argv[2]),()=>{const fs=require('fs');
fs.writeFileSync(__dirname+'/child.tmp',String(process.pid));fs.renameSync(__dirname+'/child.tmp',__dirname+'/child.pid');});`;
const started: number[] = [];

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const portOf = (dir: string) => Number(/^PORT=(\d+)\s*$/m.exec(readFileSync(join(dir, '.env'), 'utf8'))![1]);
const waitFor = async (ok: () => boolean, what: string) => {
  // up to 30 s: stopping a process tree is slow on a busy Windows machine (the kit's self-test checks several projects at once);
  // a pass returns as soon as it is true
  for (let i = 0; i < 300; i++) { if (ok()) return; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error(`timed out waiting for ${what}`);
};

const isFree = (port: number) => new Promise<boolean>((ok) => {
  const s = createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true)));
  s.listen(port);
});
let nextPort = 8950 + PORTS;
/**
 * The session gets a port from the top of the session range: the other session tests' throwaway repos hand out ports from 8788
 * up on their own, and one of their --finish runs must not find this test's server on a port its own .env names.
 */
async function ownPort(dir: string) {
  while (!(await isFree(nextPort))) nextPort++;
  const port = nextPort++;
  writeFileSync(join(dir, '.env'), readFileSync(join(dir, '.env'), 'utf8').replace(/^PORT=\d+\s*$/m, `PORT=${port}`));
}

/** A fake dev server for the session `topic`, in a folder of its own (so it is never part of a commit): its two PIDs. */
async function startServer(r: Repo, topic: string) {
  await ownPort(r.wt(topic));
  const home = join(r.root, `server-${topic}`);
  mkdirSync(home);
  writeFileSync(join(home, 'parent.cjs'), PARENT); writeFileSync(join(home, 'child.cjs'), CHILD);
  const p = spawn(process.execPath, [join(home, 'parent.cjs'), String(portOf(r.wt(topic)))], { cwd: r.wt(topic), stdio: 'ignore' });
  started.push(p.pid!);
  await waitFor(() => existsSync(join(home, 'child.pid')), 'the fake dev server');
  const child = Number(readFileSync(join(home, 'child.pid'), 'utf8'));
  started.push(child);
  return { parent: p.pid!, child };
}
/** A session with one commit, ready to finish. */
const session = (r: Repo, topic: string) => {
  ran(r, topic);
  commitIn(r.wt(topic), `${topic}.txt`, 'x\n', `add ${topic}`);
};

describe('cleaning up after a session', () => {
  after(() => {
    for (const pid of started) { try { process.kill(pid); } catch { /* stopped already */ } }
    for (const r of roots) rmSync(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  });

  it('finishing a session stops its dev server and the watcher above it, and removes the folder', async () => {
    const r = makeRepo();
    session(r, 'a');
    const server = await startServer(r, 'a');
    const port = portOf(r.wt('a'));
    const done = run(r, '--finish', 'a');
    assert.ok(done.ok, done.out);
    // how many processes it finds is the system's (on Linux the watcher above the server is not one of them): that it stops is ours
    assert.match(done.out, new RegExp(`Stopped the dev server on port ${port} \\(\\d+ process(?:es)?\\)\\.`));
    await waitFor(() => !alive(server.child) && !alive(server.parent), 'both processes to stop');
    assert.equal(existsSync(r.wt('a')), false, 'the folder is gone');
    assert.equal(git(r.main, 'branch', '--list', 'a'), '');
  });

  it('the dev server of another session, on its own port, keeps running when one session finishes', async () => {
    const r = makeRepo();
    session(r, 'a');
    session(r, 'b');
    const other = await startServer(r, 'b');
    const done = run(r, '--finish', 'a');
    assert.ok(done.ok, done.out);
    assert.doesNotMatch(done.out, /Stopped/);
    assert.ok(alive(other.child) && alive(other.parent), 'b\'s server still runs');
  });

  it('a session whose .env says port 8787 never has that port\'s process stopped', async () => {
    const { stopSessionServer } = await import(pathToFileURL(resolve('workflow/scripts/session-stop.mjs')).href);
    const r = makeRepo();
    for (const port of [8787, 80, 9000]) {
      const dir = join(r.root, `env-${port}`);
      mkdirSync(dir);
      writeFileSync(join(dir, '.env'), `KEY=x\nPORT=${port}\n`);
      const calls: string[] = [];
      const deps = { listeners: () => { calls.push('look'); return [4242]; }, table: () => [{ pid: 4242, ppid: 1, name: 'node' }], stop: () => calls.push('stop') };
      const out = stopSessionServer(dir, deps);
      assert.equal(out.refused, true, `port ${port} is refused`);
      assert.deepEqual(calls, [], `port ${port}: no process was looked up or stopped`);
    }
  });
  it('walks up through a watcher that Node 26 names "node-MainThread" on Linux and macOS', async () => {
    const { stopSessionServer } = await import(pathToFileURL(resolve('workflow/scripts/session-stop.mjs')).href);
    const r = makeRepo();
    const dir = join(r.root, 'env-mainthread');
    mkdirSync(dir);
    writeFileSync(join(dir, '.env'), 'PORT=8960\n');
    let looks = 0;
    const stopped: number[] = [];
    const deps = {
      listeners: () => (looks++ ? [] : [200]),
      table: () => [{ pid: 200, ppid: 100, name: 'node-MainThread' }, { pid: 100, ppid: 1, name: 'node-MainThread' }],
      stop: (top: number) => stopped.push(top),
    };
    assert.equal(stopSessionServer(dir, deps).stopped, 2);
    assert.deepEqual(stopped, [100], 'the watcher above the listener is stopped, so it cannot start the server again');
  });
  it('a server on the session\'s port that runs from another folder of the project is left running, and named', async () => {
    const { stopMessage, stopSessionServer } = await import(pathToFileURL(resolve('workflow/scripts/session-stop.mjs')).href);
    const r = makeRepo();
    // a leftover folder whose .env names the port a live session's server has
    const dir = join(r.root, 'app-leftover');
    const live = join(r.root, 'app-live');
    for (const d of [dir, live]) { mkdirSync(d); writeFileSync(join(d, '.git'), 'gitdir: x\n'); }
    writeFileSync(join(dir, '.env'), 'PORT=8960\n');
    const stopped: number[] = [];
    const table = (cmd: string) => () => [
      { pid: 300, ppid: 200, name: 'node', cmd: 'node --import tsx src/server/index.ts' },
      { pid: 200, ppid: 1, name: 'node', cmd },
    ];
    const vite = (d: string) => `node "${join(d, 'node_modules', '.bin', '..', 'tsx', 'dist', 'cli.mjs')}" watch src/server/index.ts`;
    const deps = (cmd: string) => ({ listeners: () => [300], table: table(cmd), stop: (top: number) => stopped.push(top), cwd: () => '' });
    const other = stopSessionServer(dir, deps(vite(live)));
    assert.deepEqual([other.stopped, other.others, stopped], [0, [300], []], 'the live session\'s server runs on');
    assert.match(stopMessage(other), /^Port 8960 is used by a server that runs from another folder \(process 300\), so it was left running\.$/);
    // its own server, named through its own node_modules/.bin: stopped; a server that names no folder: stopped, as before
    assert.equal(stopSessionServer(dir, deps(vite(dir))).stopped, 2);
    assert.equal(stopSessionServer(dir, deps('node server.cjs')).stopped, 2);
    // on Linux and macOS the working folder says it too
    assert.equal(stopSessionServer(dir, { ...deps('node server.cjs'), cwd: (pid: number) => (pid === 300 ? live : '') }).stopped, 0);
    assert.deepEqual(stopped, [200, 200]);
  });
  it('the throwaway sessions stay off the real session ports (8788 to 8999) unless WORKFLOW_TEST_PORTS asks for them', () => {
    const r = makeRepo();
    const { session } = JSON.parse(readFileSync(join(r.main, 'workflow/config.json'), 'utf8'));
    if (process.env.WORKFLOW_TEST_PORTS === undefined) assert.equal(PORTS, 10000);
    if (PORTS > 0) for (const p of [session.mainPort, session.firstPort, session.firstPort + 211, 8950 + PORTS, 8970 + PORTS]) assert.ok(p < 8787 || p > 8999, `${p} is clear of the real sessions`);
  });

});
