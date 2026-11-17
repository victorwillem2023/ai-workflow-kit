#!/usr/bin/env node
// The page-weight check: builds the app (npm run build) and adds up what the browser downloads, compressed, against
// `performance.maxKb` in workflow/config.json. Runs as a `checks` entry of the gate when screens change. No budget, no build
// script or no built files: it says so and passes, so a project without screens is never blocked.
// Already over the budget the first time (an older project): that weight becomes the baseline (workflow/tools/perf-baseline.json),
// and only heavier than it, with a little room, fails.
//   node workflow/tools/perfbudget.mjs [--no-build] [--update]   (--update: today's weight is the baseline again)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { matchesAny } from './lib/glob.mjs';
import { weighPages, weightLine } from './lib/perfbudget.mjs';
import { hasWeb, surfacesOf } from './lib/surfaces.mjs';

process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const config = JSON.parse(readFileSync('workflow/config.json', 'utf8'));
const perf = config.performance;
if (!perf?.maxKb) { console.log('page weight: no budget ("performance.maxKb" in the config)'); process.exit(0); }
// a product with no web pages (a phone app only, a command line, an API: project.surfaces) has no page to weigh
if (!hasWeb(surfacesOf(config).names)) { console.log(`page weight: no web pages (project.surfaces: ${surfacesOf(config).names.join(', ')})`); process.exit(0); }
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
if (!found.length) {
  // a build ran and none of its files match: the setting points at the wrong folder, and passing would check nothing at all.
  // Where the build did write (the usual output folders), with the setting that names it.
  const outputs = ['dist', 'build', 'out', '.next/static', 'public/build', 'www'].filter((d) => walk(d).some((f) => /\.(js|css)$/.test(f)));
  if (process.argv.includes('--no-build') || !outputs.length) { console.log(`page weight: no built files match ${perf.files.join(', ')}`); process.exit(0); }
  console.log(`page weight: the build wrote no file that "performance.files" names (${perf.files.join(', ')}), so nothing was weighed. `
    + `Its files are in ${outputs.join(', ')}: set "performance.files" to ${JSON.stringify(outputs.flatMap((d) => [`${d}/**/*.js`, `${d}/**/*.css`]))}`);
  process.exit(1);
}
const files = found.map((path) => ({ path, gzipBytes: gzipSync(readFileSync(path)).length }));
// a page already over the budget the first time it is weighed gets today's weight as its baseline (--update takes it again)
const BASELINE = 'workflow/tools/perf-baseline.json';
let baselineKb = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).kb ?? null : null;
const today = weighPages(files, perf.maxKb).kb;
if ((baselineKb === null || process.argv.includes('--update')) && today > perf.maxKb) {
  baselineKb = today;
  writeFileSync(BASELINE, `${JSON.stringify({ note: 'The page weight when it was first weighed over the budget; heavier than this (plus a little room) fails. Under performance.maxKb: delete this file.', kb: today }, null, 2)}\n`);
  console.log(`page weight: over the budget when first weighed, so ${today} KB is the baseline (${BASELINE}); make a card to bring it under ${perf.maxKb} KB`);
}
if (baselineKb !== null && today <= perf.maxKb) console.log(`page weight: under the budget again: ${BASELINE} is not needed any more (delete it)`);
const v = weighPages(files, perf.maxKb, baselineKb);
console.log(weightLine(v));
process.exit(v.ok ? 0 : 1);
