// Checks run by dev.cmd before `npm run dev`:
//   1. the installed packages match package.json + package-lock.json (a `git pull` may have added one;
//      the dev server restarts on a changed source file but never installs anything), else `npm install`;
//   2. nothing already listens on the server's port (an earlier start.cmd or dev window still open).
// Exit code 0: go on. 1: npm install failed. 2: the port is taken.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARK = join('node_modules', '.deps-hash');

/** A fingerprint of what the installed packages should match. */
export function depsHash(root) {
  const h = createHash('sha256');
  for (const f of ['package.json', 'package-lock.json']) {
    const p = join(root, f);
    h.update(f).update(existsSync(p) ? readFileSync(p) : '');
  }
  return h.digest('hex');
}

/** True when the packages were never checked against this package.json / lock file, or those have changed since. */
export function depsStale(root) {
  const mark = join(root, MARK);
  return !existsSync(mark) || readFileSync(mark, 'utf8').trim() !== depsHash(root);
}

export function markDeps(root) {
  writeFileSync(join(root, MARK), depsHash(root) + '\n');
}

/** The port the server will use: PORT in the environment, else in .env, else 8787 (match session.mainPort in workflow.config.json). */
export function serverPort(root, env = process.env) {
  if (Number(env.PORT)) return Number(env.PORT);
  const p = join(root, '.env');
  if (existsSync(p)) {
    const m = /^\s*PORT\s*=\s*"?(\d+)"?\s*(#.*)?$/m.exec(readFileSync(p, 'utf8'));
    if (m) return Number(m[1]);
  }
  return 8787;
}

/** Whether something already accepts connections on the port (the host is local only). */
export function portBusy(port, host = '127.0.0.1', timeoutMs = 800) {
  return new Promise((done) => {
    const s = connect({ port, host });
    const end = (busy) => { s.destroy(); done(busy); };
    s.setTimeout(timeoutMs, () => end(false));
    s.once('connect', () => end(true));
    s.once('error', () => end(false));
  });
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  if (depsStale(root)) {
    console.log('Checking the installed packages against package.json (npm install)...');
    const r = spawnSync('npm', ['install'], { cwd: root, stdio: 'inherit', shell: true });
    if (r.status !== 0) { console.error('npm install failed: fix that and run dev.cmd again.'); process.exit(1); }
    markDeps(root);
  }
  const port = serverPort(root);
  if (await portBusy(port)) {
    console.error(`\nSomething already runs on port ${port}: probably start.cmd or another dev.cmd window.\nClose that window first (Ctrl+C), then run dev.cmd again.`);
    process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
