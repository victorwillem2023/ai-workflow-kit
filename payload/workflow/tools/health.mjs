#!/usr/bin/env node
// The numbers that say whether the code is staying healthy, in one screen: npm run health. Reads the same settings as the
// gate (workflow/config.json) and changes nothing. A number going the wrong way between two runs is a card.
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { matchesAny } from './lib/glob.mjs';
import { codeTest } from './lib/lang.mjs';
import { allowanceUsed, limitOf, lineCount, measureOf, oversize } from './lib/size.mjs';
import { longFunctions, copiedFunctions } from './lib/funclen.mjs';
import { countPatterns } from './lib/ratchet.mjs';
import { hookProblem } from './lib/hookcheck.mjs';
import { codeHotspots } from './lib/codestate.mjs';
import { hotspotLines } from './lib/hotspots.mjs';

process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const config = JSON.parse(readFileSync('workflow/config.json', 'utf8'));
const baseline = existsSync(config.baseline) ? JSON.parse(readFileSync(config.baseline, 'utf8')) : {};
const isCode = codeTest(config);
const inSize = (f) => matchesAny(f, config.size.include) && !matchesAny(f, ['tools/**']);
const files = new Map(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 << 20 })
  .split('\n').filter((f) => f && isCode(f) && inSize(f) && existsSync(f) && !matchesAny(f, config.skipFiles ?? [])).map((f) => [f, readFileSync(f, 'utf8')]));

const max = config.functions?.maxLines ?? 60;
const long = Object.values(longFunctions(files, max));
const copies = copiedFunctions(files);
const row = (label, value) => console.log(`${label.padEnd(34)} ${value}`);
row('code files', `${files.size}, ${[...files.values()].reduce((n, t) => n + lineCount(t), 0)} lines`);
const sizeMax = limitOf(config.size, measureOf(baseline));
row(`files over ${sizeMax} lines${baseline.sizeMeasure === 'work' ? ' of work' : ''}`, Object.keys(oversize(files, sizeMax, measureOf(baseline))).length);
// what the big files took of their allowance, card by card (size.allowance; lib/size.mjs): adding up to a split card
const used = Object.entries(allowanceUsed(baseline.allowed)).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
if (used.length) row('allowance used by big files', used.slice(0, 4).map(([f, n]) => `${f} ${n} of ${config.size.allowanceTotal ?? (config.size.allowance ?? 0) * 5} (cards ${baseline.allowed[f].map((r) => (r.card ? `#${r.card}` : '?')).join(', ')})`).join('; '));
row(`functions of ${max} lines or more`, `${long.length} (${long.filter((n) => n >= 100).length} of 100 or more)`);
row('functions copied word for word', copies.length ? `${copies.length}: ${copies.slice(0, 5).map((g) => g.join(' = ')).join('; ')}${copies.length > 5 ? '; ...' : ''}` : 0);
for (const [name, n] of Object.entries(countPatterns(files, config.ratchets))) row(name, `${n}${baseline.ratchets?.[name] != null ? ` (baseline ${baseline.ratchets[name]})` : ''}`);
const tests = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n')
  .filter((f) => f && matchesAny(f, [config.tests]) && !f.startsWith('workflow/tests/') && existsSync(f)).map((f) => [f, lineCount(readFileSync(f, 'utf8'))]).sort((x, y) => y[1] - x[1]);
const codeLines = [...files.values()].reduce((n, t) => n + lineCount(t), 0);
const testLines = tests.reduce((n, [, l]) => n + l, 0);
row('test files', `${tests.length}, ${testLines} lines (${codeLines ? (testLines / codeLines).toFixed(1) : 0} per line of code)${tests.length ? `; biggest: ${tests.slice(0, 3).map(([f, l]) => `${f} ${l}`).join(', ')}` : ''}`);
row('import circles / untested files', `${(baseline.cycles ?? []).length} / ${(baseline.untested ?? []).length} in the baseline`);
row('layer exceptions in the baseline', (baseline.boundaries ?? []).length);
row('stale doc references in the baseline', (baseline.docs ?? []).length);
// the prices in docs/STACK.md (hosts, AI models) go stale: say when they were last looked up
const checked = existsSync('docs/STACK.md') ? /Prices checked:\s*(\d{4}-\d{2}-\d{2})/.exec(readFileSync('docs/STACK.md', 'utf8'))?.[1] : null;
if (checked) { const days = Math.floor((Date.now() - Date.parse(checked)) / 86_400_000); row('prices in docs/STACK.md', `checked ${checked}, ${days} days ago${days > 90 ? ': look them up again (hosts, AI models) and update the page' : ''}`); }
if (baseline.quality) row('quality score in the baseline', `${baseline.quality.pass}${baseline.quality.total != null ? ' of ' + baseline.quality.total : ''}`);
// what Dependabot waits with (security alerts, updates to take, look at or hold): the same line /work starts with
if (!process.argv.includes('--offline')) {
  try {
    const line = execFileSync(process.execPath, ['workflow/tools/updates.mjs', '--short'], { encoding: 'utf8', timeout: 40_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    row('dependency updates', line.replace(/^updates: /, ''));
  } catch { row('dependency updates', 'not checked (npm run updates)'); }
}
// the stop points must start: a hook script that cannot load lets every commit, push and main-folder edit through (lib/hookcheck.mjs)
row('stop points', hookProblem('.') ?? 'start');
// what the state of the code says to work on, each with the principle behind it (lib/hotspots.mjs); the code health goal names the same
console.log(`\n${hotspotLines(codeHotspots(process.cwd(), config))}`);
