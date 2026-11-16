#!/usr/bin/env node
// The restore drill: proves the backups can be used. Restores the latest backup into a new, empty folder, starts the app on it,
// asks it the health address and a few read-only paths, stops it, and writes the date and the timings into docs/run/RECOVERY.md
// (the weekly SecOps report flags a drill older than 3 months). Settings: recovery.drill in workflow/config.json:
//   { "restore": "<command that restores the latest backup into {dir}>", "start": "<command that starts the app on the data in
//     {dir}, listening on {port}>", "port": 8799, "paths": ["/health"], "waitSeconds": 120, "pingEnv": "<name of an env var
//     holding a dead man's switch URL, e.g. Healthchecks.io>" }
// The commands are the project's own (litestream restore, pgbackrest restore, restic restore, the platform's CLI), so it works
// with any backup tool and any platform. Run it on a computer or server that may hold the data; it never touches production.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drillRow } from './lib/drill.mjs';

const stop = (line) => { console.log(line); process.exit(1); };
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
const cfg = JSON.parse(readFileSync('workflow/config.json', 'utf8')).recovery?.drill;
if (!cfg?.restore || !cfg?.start) stop('Not set up yet: put "recovery": { "drill": { "restore": ..., "start": ... } } in workflow/config.json (the header of workflow/tools/drill.mjs says how; /launch sets it up).');
const port = cfg.port ?? 8799;
const dir = mkdtempSync(join(tmpdir(), 'restore-drill-'));
const fill = (c) => c.replaceAll('{dir}', dir).replaceAll('{port}', String(port));
const seconds = (t) => (Date.now() - t) / 1000;
let app;

try {
  console.log(`Restoring the latest backup into ${dir}...`);
  const t0 = Date.now();
  // recovery.drill.restore and .start come from workflow/config.json, the project's own file, never from outside input
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  if (spawnSync(fill(cfg.restore), { shell: true, stdio: 'inherit' }).status !== 0) throw new Error('the restore command failed');
  const restoreSeconds = seconds(t0);
  const t1 = Date.now();
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  app = spawn(fill(cfg.start), { shell: true, stdio: 'inherit', detached: process.platform !== 'win32', env: { ...process.env, PORT: String(port) } });
  const paths = cfg.paths ?? ['/health'];
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  while (!up && seconds(t1) < (cfg.waitSeconds ?? 120)) {
    up = await fetch(base + paths[0], { signal: AbortSignal.timeout(5000) }).then((r) => r.ok, () => false);
    if (!up) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!up) throw new Error(`the app did not answer ${paths[0]} on port ${port} within ${cfg.waitSeconds ?? 120} s`);
  const upSeconds = seconds(t1);
  for (const p of paths.slice(1)) {
    const r = await fetch(base + p, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`${p} answered ${r.status} on the restored data`);
  }
  const date = new Date().toISOString().slice(0, 10);
  if (existsSync('docs/run/RECOVERY.md')) writeFileSync('docs/run/RECOVERY.md', drillRow(readFileSync('docs/run/RECOVERY.md', 'utf8'), { date, restoreSeconds, upSeconds }));
  if (cfg.pingEnv && process.env[cfg.pingEnv]) await fetch(process.env[cfg.pingEnv], { signal: AbortSignal.timeout(10_000) }).catch(() => {});
  console.log(`Drill passed: restored in ${Math.round(restoreSeconds)} s, the app answered ${paths.length} path${paths.length === 1 ? '' : 's'} ${Math.round(upSeconds)} s later. docs/run/RECOVERY.md has the date: commit it with the next change.`);
} catch (e) {
  console.log(`Drill FAILED: ${e.message}. The backups may not be usable: this is a card for today (docs/run/RECOVERY.md, Backups).`);
  process.exitCode = 1;
} finally {
  if (app?.pid) { try { process.platform === 'win32' ? spawnSync('taskkill', ['/pid', String(app.pid), '/t', '/f'], { stdio: 'ignore' }) : process.kill(-app.pid, 'SIGTERM'); } catch {} }
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
