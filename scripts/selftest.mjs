#!/usr/bin/env node
// The kit checks itself: install it into a fresh project in a temporary folder, the way a person would, and run everything
// there: the kit's own tests (they need a real project around them), the file map, the first baseline and the full gate.
// Then do it again with --update over the result, so an update is proven too. Used by .github/workflows/selftest.yml.
//   node scripts/selftest.mjs [--keep]      --keep leaves the folder for a look (its path is printed)
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const kit = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'kit-selftest-'));
const win = process.platform === 'win32';
const steps = [];

function step(name, cmd, args, opts = {}) {
  const t0 = Date.now();
  // npm is a .cmd file on Windows; the arguments are fixed here, never outside input
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  const r = spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', shell: win && cmd === 'npm', maxBuffer: 256 << 20, env: { ...process.env, CI: process.env.CI ?? '' }, ...opts });
  const ok = r.status === 0;
  steps.push(`${ok ? 'ok  ' : 'FAIL'} ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(steps.at(-1));
  if (!ok) {
    console.log(String((r.stdout ?? '') + (r.stderr ?? '')).trim().split('\n').slice(-60).join('\n'));
    finish(1);
  }
  return String(r.stdout ?? '');
}
function finish(code) {
  if (process.argv.includes('--keep')) console.log(`kept: ${dir}`);
  else rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  process.exit(code);
}
const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });

git('init', '-q', '-b', 'main');
git('config', 'user.name', 'Kit selftest');
git('config', 'user.email', 'selftest@example.invalid');
// every module, the optional ones too (--with ai), so each is proven in a real project
const install = [join(kit, 'install.mjs'), dir, '--project', 'Selftest App', '--repo', 'example/selftest-app', '--prefix', 'selftest', '--with', 'ai'];
const said = step('install', process.execPath, install);
// what the installer's "step 1" asks a person to run: the line it prints (one or more "npm i" joined by &&), so the test proves that line too
const line = /^\s*(?:1\.|step 1:)\s*(npm i [^\n]+)$/m.exec(said)?.[1];
if (!line) { console.log(`FAIL the installer printed no "npm i" step:\n${said}`); finish(1); }
for (const part of line.split('&&').map((p) => p.trim().split(/\s+/).slice(2))) {
  step(`libraries: npm i ${part.join(' ')}`, 'npm', ['install', '--no-audit', '--no-fund', '--silent', ...part]);
}
git('add', '-A');
git('commit', '-q', '-m', 'Start from the kit');
step('file map', 'npm', ['run', 'map', '--silent']);
step('first baseline', process.execPath, ['tools/workflow/gate.mjs', '--update-baseline']);
step('the kit\'s own tests', 'npm', ['test', '--silent']);
step('full gate', 'npm', ['run', 'gate:all', '--silent']);
git('add', '-A');
git('commit', '-q', '-m', 'The first baseline');
step('update over itself', process.execPath, [...install.filter((a) => a !== '--with' && a !== 'ai'), '--update']);
step('full gate after the update', 'npm', ['run', 'gate:all', '--silent']);
console.log(`selftest: all ${steps.length} steps passed`);
finish(0);
