// The app's own build (npm run build), for the checks that weigh or time what it makes (perfbudget.mjs, speed.mjs).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

/** Runs the build: { ok, none } (none: there is no build script, so nothing to check), with its last lines when it failed. */
export function buildApp() {
  const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf8')) : {};
  if (!pkg.scripts?.build) return { ok: false, none: true, tail: '' };
  // a shell only on Windows, where npm is a .cmd file; the arguments are fixed, never outside input
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  const b = spawnSync('npm', ['run', 'build', '--silent'], { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 << 20 });
  return { ok: b.status === 0, none: false, tail: String(b.stdout + b.stderr).trim().split('\n').slice(-20).join('\n') };
}
