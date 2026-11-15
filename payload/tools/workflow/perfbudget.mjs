#!/usr/bin/env node
// The page-weight check: builds the app (npm run build) and adds up what the browser downloads, compressed, against
// `performance.maxKb` in workflow.config.json. Runs as a `checks` entry of the gate when screens change. No budget, no build
// script or no built files: it says so and passes, so a project without screens is never blocked.
//   node tools/workflow/perfbudget.mjs [--no-build]
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { matchesAny } from './lib/glob.mjs';
import { weighPages, weightLine } from './lib/perfbudget.mjs';

process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const config = JSON.parse(readFileSync('workflow.config.json', 'utf8'));
const perf = config.performance;
if (!perf?.maxKb) { console.log('page weight: no budget ("performance.maxKb" in the config)'); process.exit(0); }
const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf8')) : {};
if (!process.argv.includes('--no-build')) {
  if (!pkg.scripts?.build) { console.log('page weight: no build script, nothing to weigh'); process.exit(0); }
  // a shell only on Windows, where npm is a .cmd file; the arguments are fixed, never outside input
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  const b = spawnSync('npm', ['run', 'build', '--silent'], { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 << 20 });
  if (b.status !== 0) { console.log(`page weight: the build failed\n${String(b.stdout + b.stderr).trim().split('\n').slice(-20).join('\n')}`); process.exit(1); }
}
// the built files are ignored by git, so they are found by walking the folders the globs start with
const roots = [...new Set(perf.files.map((g) => g.split('/')[0]))];
const walk = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).map((f) => `${dir}/${String(f).replace(/\\/g, '/')}`) : []);
const found = roots.flatMap(walk).filter((f) => matchesAny(f, perf.files) && statSync(f).isFile());
if (!found.length) { console.log(`page weight: no built files match ${perf.files.join(', ')}`); process.exit(0); }
const v = weighPages(found.map((path) => ({ path, gzipBytes: gzipSync(readFileSync(path)).length })), perf.maxKb);
console.log(weightLine(v));
process.exit(v.ok ? 0 : 1);
