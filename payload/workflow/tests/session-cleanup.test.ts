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
import { commitIn, git, makeRepo, PORTS, roots, run, type Repo } from './session-repo';

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
  assert.ok(run(r, topic).ok);
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

  it('a folder still held open is named, with what to close, while the feature still goes on main and the branch is deleted', () => {
    const r = makeRepo();
    session(r, 'a');
    r.env.WORKFLOW_HOLD_TEST = '1';
    const done = run(r, '--finish', 'a');
    delete r.env.WORKFLOW_HOLD_TEST;
    assert.ok(done.ok, done.out);
    assert.match(done.out, /\.\.\/app-a is still open in another program \(a terminal or an editor window in that folder\)\. Close it, then run: node workflow\/scripts\/session\.mjs --clean --yes/);
    assert.doesNotMatch(done.out, /Permission denied|resource busy/i);
    assert.ok(existsSync(join(r.main, 'a.txt')), 'the feature is on main');
    assert.equal(git(r.main, 'branch', '--list', 'a'), '', 'the branch is deleted');
    assert.ok(existsSync(r.wt('a')), 'the folder is still there');
    const cleaned = run(r, '--clean', '--yes');
    assert.ok(cleaned.ok, cleaned.out);
    assert.equal(existsSync(r.wt('a')), false, '--clean --yes takes the empty folder away once it is closed');
  });

  it('finishing with --no-checks keeps the folder and says how to remove it after the checks pass', async () => {
    const r = makeRepo();
    session(r, 'a');
    const server = await startServer(r, 'a');
    const done = run(r, '--finish', 'a', '--no-checks');
    assert.ok(done.ok, done.out);
    assert.ok(existsSync(join(r.main, 'a.txt')), 'the feature is on main');
    assert.ok(existsSync(r.wt('a')), 'the folder is kept');
    assert.match(done.out, /checks were skipped/i);
    assert.match(done.out, /Stopped the dev server on port \d+ \(\d+ process(?:es)?\)/, 'its server is stopped all the same');
    assert.match(done.out, /npm run gate:all[\s\S]*--clean --yes/);
    await waitFor(() => !alive(server.child), 'its server to stop');
    const cleaned = run(r, '--clean', '--yes');
    assert.ok(cleaned.ok, cleaned.out);
    assert.equal(existsSync(r.wt('a')), false, '--clean --yes removes it afterwards');
  });

  it('clean removes empty leftover folders and still only names ones with files in them', () => {
    const r = makeRepo();
    const empty = join(r.root, 'app-empty');
    const nested = join(r.root, 'app-nested');
    const full = join(r.root, 'app-full');
    mkdirSync(empty); mkdirSync(join(nested, 'src', 'web'), { recursive: true });
    mkdirSync(join(full, 'deep'), { recursive: true }); writeFileSync(join(full, 'deep', 'keep.txt'), 'mine\n');
    const preview = run(r, '--clean');
    assert.ok(existsSync(empty) && existsSync(nested), 'without --yes nothing is removed');
    assert.match(preview.out, /app-empty/);
    const yes = run(r, '--clean', '--yes');
    assert.ok(yes.ok, yes.out);
    assert.equal(existsSync(empty), false);
    assert.equal(existsSync(nested), false, 'a folder with only empty folders in it is empty too');
    assert.equal(readFileSync(join(full, 'deep', 'keep.txt'), 'utf8'), 'mine\n', 'the one with a file is untouched');
    assert.match(yes.out, /app-full/);
  });

  it('removing a session never reaches the main folder\'s node_modules through the link', () => {
    const r = makeRepo();
    const marker = join(r.main, 'node_modules', 'marker.txt');
    writeFileSync(marker, 'keep\n');
    session(r, 'a');
    assert.ok(existsSync(join(r.wt('a'), 'node_modules', 'marker.txt')), 'the session sees main\'s modules through the link');
    const done = run(r, '--finish', 'a');
    assert.ok(done.ok, done.out);
    assert.equal(existsSync(r.wt('a')), false);
    assert.equal(readFileSync(marker, 'utf8'), 'keep\n', 'main\'s modules are untouched');
    session(r, 'b');
    r.env.WORKFLOW_HOLD_TEST = '1';
    assert.ok(run(r, '--finish', 'b').ok);
    delete r.env.WORKFLOW_HOLD_TEST;
    assert.ok(existsSync(marker), 'also when the folder is held');
  });
});
