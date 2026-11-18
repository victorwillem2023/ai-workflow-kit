#!/usr/bin/env node
// The gate's `unused` check: knip (files, dependencies and exports nothing uses), with a baseline like the gate's other checks.
// The first run records what the project has (an existing project is not failed for its past) and passes; after that only a
// finding a change adds fails, named. workflow/tools/unused-baseline.json is the baseline; lib/unused.mjs reads knip's report.
//   node workflow/tools/unused.mjs            fail on what is new since the baseline
//   node workflow/tools/unused.mjs --update   take today's findings as the baseline (say why in the commit)
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { compareUnused, unusedFindings } from './lib/unused.mjs';

process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const FILE = 'workflow/tools/unused-baseline.json';
// knip not installed (a fresh clone, a session whose packages are not in yet): say so and how, instead of knip's own error
if (!existsSync('node_modules/knip/package.json')) {
  console.log('unused: knip is not installed here, so nothing was checked. Install the packages first: npm install'
    + ' (in a session folder: node workflow/scripts/packages.mjs says how), then run it again.');
  process.exit(1);
}
// a shell only on Windows, where npx is a .cmd file; the arguments are fixed, never outside input
// nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
const r = spawnSync('npx', ['--no-install', 'knip', '--no-progress', '--reporter', 'json'], { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 << 20 });
let report;
try { report = JSON.parse(r.stdout); } catch {
  console.log(`unused: knip did not run (${String(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' ') || `exit ${r.status}`})`);
  process.exit(1);
}
const now = unusedFindings(report);
const save = (list) => writeFileSync(FILE, `${JSON.stringify({ note: 'What knip finds unused that was there before; only new findings fail (node workflow/tools/unused.mjs --update takes today\'s).', unused: list }, null, 2)}\n`);
if (!existsSync(FILE) || process.argv.includes('--update')) {
  save(now);
  console.log(`unused: ${now.length} found and taken as the baseline (${FILE}); from now on only new ones fail`);
  process.exit(0);
}
const { added, fixed } = compareUnused(now, JSON.parse(readFileSync(FILE, 'utf8')).unused ?? []);
const gone = fixed.length ? `; ${fixed.length} known one${fixed.length === 1 ? ' is' : 's are'} gone (--update takes them out)` : '';
if (added.length) {
  console.log(`unused: ${added.length} new, nothing uses ${added.length === 1 ? 'it' : 'them'}: take it out, or use it\n${added.map((f) => `  ${f}`).join('\n')}${gone ? `\n(${gone.slice(2)})` : ''}`);
  process.exit(1);
}
console.log(`unused: nothing new (${now.length} known${gone})`);
