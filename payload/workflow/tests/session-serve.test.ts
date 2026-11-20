// workflow/scripts/session.mjs --serve <topic>: starts the session's dev server in the background and waits until its link answers, so the
// owner only opens it (.claude/skills/build/try-it.md); a server that runs already is left alone; no dev script says what to do
// instead. Runs in throwaway repos (workflow/tests/session-repo.ts), on a port picked free here.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { commitIn, git, makeRepo, PORTS, roots, run, type Repo, ran } from './session-repo';

// (as an app does: the environment's PORT first, the folder's .env only when it names none)
const SERVER = `const fs=require('fs');const port=Number(process.env.PORT||/^PORT=(\\d+)\\s*$/m.exec(fs.readFileSync('.env','utf8'))[1]);
fs.writeFileSync(process.argv[2],String(process.pid));require('http').createServer((q,s)=>s.end('ok')).listen(port,'127.0.0.1');`;
const pids: string[] = [];

// free on 127.0.0.1 and on every address: on Windows a port can be free on the first while another test's server holds it on
// the second (the cleanup tests' servers listen on every address), and a request to 127.0.0.1 then reaches that server
const freeOn = (port: number, host?: string) => new Promise<boolean>((ok) => {
  const s = createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true)));
  if (host) s.listen(port, host); else s.listen(port);
});
const isFree = async (port: number) => (await freeOn(port, '127.0.0.1')) && freeOn(port);
let nextPort = 8970 + PORTS;
/** A session `a` with a dev script that serves "ok" on a free port of its own. */
async function withDev(dev: boolean): Promise<Repo> {
  const r = makeRepo();
  ran(r, 'a');
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
    // a PORT left set in the owner's shell must not send the session's server to another port: the folder's .env decides
    r.env.PORT = '1';
    const out = run(r, '--serve', 'a');
    assert.ok(out.ok, out.out);
    assert.match(out.out, new RegExp(`The dev server runs: ${url}`));
    assert.match(out.out, /logs: +node workflow\/scripts\/logs\.mjs a --follow/, 'how to watch its log comes with the link');
    assert.equal(await (await fetch(url)).text(), 'ok', 'it still runs after the command ended');
    const again = run(r, '--serve', 'a');
    assert.ok(again.ok, again.out);
    assert.match(again.out, /runs already/);
  });

  it('--copy-data: the server runs on a copy of the main folder\'s data, which goes when the session is removed', async () => {
    const r = await withDev(true);
    mkdirSync(join(r.main, 'data'));
    writeFileSync(join(r.main, 'data', 'real.txt'), 'real\n'); // (not committed: .gitignore has no line for it here, so it is removed again below)
    // the server answers with the data folder it was given
    writeFileSync(join(r.wt('a'), 'server.cjs'), SERVER.replace("s.end('ok')", "s.end(process.env.DATA_DIR||'none')"));
    const out = run(r, '--serve', 'a', '--copy-data');
    rmSync(join(r.main, 'data'), { recursive: true });
    assert.ok(out.ok, out.out);
    assert.match(out.out, /data: +a copy of .*DATA_DIR=/);
    const copy = await (await fetch(`http://127.0.0.1:${portOf(r)}`)).text();
    assert.equal(readFileSync(join(copy, 'real.txt'), 'utf8'), 'real\n');
    assert.ok(!copy.startsWith(r.root), 'the copy is outside the session folder');
    git(r.wt('a'), 'add', '-A'); git(r.wt('a'), 'commit', '-qm', 'the server');
    const f = run(r, '--finish', 'a', '--no-checks');
    assert.ok(f.ok, f.out);
    assert.match(f.out, /Stopped the dev server/);
    assert.equal(existsSync(copy), false, 'the copy went with the server');
  });

  const onNetwork = Object.values(networkInterfaces()).flat().some((a) => a && a.family === 'IPv4' && !a.internal);
  it('--lan: the server listens on every address and the address for a phone is printed once it answers there', { skip: !onNetwork && 'this computer has no network address' }, async () => {
    const r = await withDev(true);
    // (as an app does: it listens where HOST says, on this computer alone without it)
    writeFileSync(join(r.wt('a'), 'server.cjs'), SERVER.replace(".listen(port,'127.0.0.1')", ".listen(port,process.env.HOST||'127.0.0.1')"));
    const out = run(r, '--serve', 'a', '--lan');
    assert.ok(out.ok, out.out);
    assert.match(out.out, new RegExp(`Wi-Fi: +http://[0-9.]+:${portOf(r)} `), out.out);
    // an app that does not read HOST: said, with the setting to name, instead of an address that does not open
    writeFileSync(join(r.wt('a'), 'server.cjs'), SERVER);
    const deaf = run(r, '--serve', 'a', '--lan');
    assert.ok(deaf.ok, deaf.out);
    assert.match(deaf.out, /does not answer: the app does not listen on every address with HOST=0\.0\.0\.0/);
  });

  it('without a dev script it says a change without a screen is tried with a command', async () => {
    const r = await withDev(false);
    const out = run(r, '--serve', 'a');
    assert.equal(out.ok, false);
    assert.match(out.out, /no "dev" script[\s\S]*try-it\.md/);
  });

  it('a server that answers once and is gone a moment later is not said to run', async () => {
    const r = await withDev(true);
    // the same server, stopping itself 300 ms after its first answer (as one another session's --finish stopped)
    writeFileSync(join(r.wt('a'), 'server.cjs'), SERVER.replace("s.end('ok')", "(s.end('ok'),setTimeout(()=>process.exit(0),300))"));
    const out = run(r, '--serve', 'a');
    assert.equal(out.ok, false, out.out);
    assert.match(out.out, /The dev server answered at http:\/\/127\.0\.0\.1:\d+ and then stopped/);
    assert.doesNotMatch(out.out, /The dev server runs/);
  });
});
