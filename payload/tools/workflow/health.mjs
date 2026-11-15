#!/usr/bin/env node
// The numbers that say whether the code is staying healthy, in one screen: npm run health. Reads the same settings as the
// gate (workflow.config.json) and changes nothing. A number going the wrong way between two runs is a card.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { matchesAny } from './lib/glob.mjs';
import { codeTest } from './lib/lang.mjs';
import { lineCount, oversize } from './lib/size.mjs';
import { longFunctions, copiedFunctions } from './lib/funclen.mjs';
import { countPatterns } from './lib/ratchet.mjs';

process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const config = JSON.parse(readFileSync('workflow.config.json', 'utf8'));
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
row(`files over ${config.size.maxLines} lines`, Object.keys(oversize(files, config.size.maxLines)).length);
row(`functions of ${max} lines or more`, `${long.length} (${long.filter((n) => n >= 100).length} of 100 or more)`);
row('functions copied word for word', copies.length ? `${copies.length}: ${copies.slice(0, 5).map((g) => g.join(' = ')).join('; ')}${copies.length > 5 ? '; ...' : ''}` : 0);
for (const [name, n] of Object.entries(countPatterns(files, config.ratchets))) row(name, `${n}${baseline.ratchets?.[name] != null ? ` (baseline ${baseline.ratchets[name]})` : ''}`);
const tests = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n')
  .filter((f) => f && matchesAny(f, [config.tests]) && !f.startsWith('tests/workflow/') && existsSync(f)).map((f) => [f, lineCount(readFileSync(f, 'utf8'))]).sort((x, y) => y[1] - x[1]);
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
