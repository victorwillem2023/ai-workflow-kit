#!/usr/bin/env node
// Proves docs/SETUP.md: copies the committed repository into an empty folder and runs its `sh setup` blocks in order, then its
// `sh start` block until the app answers the ready address, then stops it. What it proves is what someone with a fresh clone
// gets, so uncommitted changes are not in it. GitHub runs it (.github/workflows/setup.yml) when SETUP.md or what it installs
// changes, and every week; here: npm run setup-check (bash needed: Git Bash on Windows).
//   npm run setup-check            run it
//   npm run setup-check -- --list  only say what it would run
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSetup } from './lib/setupcheck.mjs';

const STEP_MS = 15 * 60_000; // one setup block (an install) may take this long
const READY_MS = 120_000; // the app must answer within this

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const file = join(root, 'docs', 'SETUP.md');
if (!existsSync(file)) { console.log('setup-check: no docs/SETUP.md'); process.exit(0); }
const plan = readSetup(readFileSync(file, 'utf8'));
if (plan.problems.length) { console.log(plan.problems.join('\n')); process.exit(1); }
if (process.argv.includes('--list')) {
  for (const s of plan.setup) console.log(`setup (line ${s.line}):\n  ${s.script.replace(/\n/g, '\n  ')}`);
  if (plan.start) console.log(`start (line ${plan.start.line}), ready at ${plan.start.ready}:\n  ${plan.start.script}`);
  process.exit(0);
}

// Stops the start command and everything it started. Elsewhere its process group does it; on Windows the shell's children
// are not always linked to it (Git Bash), so every process whose command line runs from the fresh copy is stopped too.
function stopAll(pid, folder) {
  if (process.platform !== 'win32') { try { process.kill(-pid, 'SIGTERM'); } catch { /* already stopped */ } return; }
  spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
  const like = folder.replace(/'/g, "''");
  spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${like}*' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore', timeout: 30_000 });
}

const dir = mkdtempSync(join(tmpdir(), 'setup-check-'));
const say = (line) => console.log(`setup-check: ${line}`);
let failed = false;
try {
  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', root, dir], { stdio: 'inherit' });
  say(`a fresh copy in ${dir}`);
  for (const s of plan.setup) {
    say(`docs/SETUP.md:${s.line}: ${s.script.split('\n')[0]}${s.script.includes('\n') ? ' ...' : ''}`);
    const r = spawnSync('bash', ['-euo', 'pipefail', '-c', s.script], { cwd: dir, stdio: 'inherit', timeout: STEP_MS });
    if (r.status !== 0) { say(`docs/SETUP.md:${s.line} failed: the guide does not work from a fresh copy. Fix the step, or what it needs`); failed = true; break; }
  }
  if (!failed && plan.start) {
    say(`docs/SETUP.md:${plan.start.line}: ${plan.start.script} (waiting for ${plan.start.ready})`);
    const app = spawn('bash', ['-c', plan.start.script], { cwd: dir, stdio: 'ignore', detached: process.platform !== 'win32' });
    const until = Date.now() + READY_MS;
    let up = false;
    while (!up && Date.now() < until && app.exitCode == null) {
      up = await fetch(plan.start.ready, { signal: AbortSignal.timeout(3_000) }).then((r) => r.status < 500, () => false);
      if (!up) await new Promise((r) => setTimeout(r, 1_000));
    }
    stopAll(app.pid, dir);
    if (up) say(`the app answered ${plan.start.ready}: the guide works from a fresh copy`);
    else { say(`the app never answered ${plan.start.ready} within ${READY_MS / 1000} s${app.exitCode != null ? ` (it stopped with code ${app.exitCode})` : ''}`); failed = true; }
  } else if (!failed) say('every step worked from a fresh copy');
} finally {
  // on Windows a stopped dev server keeps its files locked for a moment: wait and retry, and never fail the check on it
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); }
  catch { say(`could not remove ${dir} yet (a file is still in use): delete it later`); }
}
process.exit(failed ? 1 : 0);
