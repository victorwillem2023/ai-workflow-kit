#!/usr/bin/env node
// Secrets, a second net: gitleaks (its few hundred rules) over what the change adds, compared with the main branch, when gitleaks
// is installed on this computer or the CI runner. Without it, it says so and passes: the gate's own *secrets* check (a handful of
// patterns on the added lines) still runs either way. A `checks` entry of the gate, so `gitleaks` is never a must.
//   node workflow/tools/leaks.mjs            what this change adds (its commits since it left main, and what is not committed)
// gitleaks: https://github.com/gitleaks/gitleaks (a single binary; brew, scoop, or the release page).
import { execFileSync, spawnSync } from 'node:child_process';
import { MAIN, ORIGIN_MAIN } from './lib/branch.mjs';

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 << 20 }).trim(); } catch { return null; } };
process.chdir(git('rev-parse', '--show-toplevel') ?? '.');
if (spawnSync('gitleaks', ['version'], { stdio: 'ignore', shell: process.platform === 'win32' }).status !== 0) {
  console.log('leaks: gitleaks is not installed here, so only the gate\'s own secrets check ran (install gitleaks for the wider net)');
  process.exit(0);
}
const base = git('merge-base', 'HEAD', ORIGIN_MAIN) ?? git('merge-base', 'HEAD', MAIN) ?? 'HEAD';
// what the change adds, committed or not, as one diff: gitleaks reads it from its input
const diff = git('diff', base) ?? '';
if (!diff.trim()) { console.log('leaks: nothing added to scan'); process.exit(0); }
// a shell only on Windows, where gitleaks may be a .cmd shim; the arguments are fixed, never outside input
// nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
const r = spawnSync('gitleaks', ['stdin', '--redact', '--no-banner', '--exit-code', '1'], { input: diff, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 << 20 });
if (r.status === 0) { console.log('leaks: gitleaks found nothing in what this change adds'); process.exit(0); }
console.log(`${(r.stdout + r.stderr).trim()}\nleaks: gitleaks found what looks like a secret in this change. Take it out, read it from the environment, and change the key if it was ever pushed (a false alarm: a .gitleaksignore line with the finding's fingerprint).`);
process.exit(1);
