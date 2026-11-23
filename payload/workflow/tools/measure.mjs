#!/usr/bin/env node
// Before and after a change, from a project's own measuring script: npm run measure (lib/measure.mjs). Changes nothing.
//   npm run measure -- --compare <before> <after>   what moved between two runs (each a results.json, or the folder holding one)
//   npm run measure -- --last <folder>              the two newest runs under that folder (tests/stress/results/)
//   --same   exit 1 when anything moved: a refactor that should change nothing proves it with this
// The script itself is the project's (its cases, its services; run by hand, never by npm test or the gate); it writes its run
// as results.json in the shape lib/measure.mjs describes. The kit compares.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { compareLines, compareRuns, shapeProblems } from './lib/measure.mjs';

const args = process.argv.slice(2);
const opt = (f, n = 1) => (args.includes(f) ? args.slice(args.indexOf(f) + 1, args.indexOf(f) + 1 + n) : null);
// a folder is read for its results.json (and said to lack one); a file is read as it is
const fileOf = (p) => (existsSync(p) && statSync(p).isDirectory() ? join(p, 'results.json') : p);
// a run is named by its folder when its file is results.json, else by its own name (runs/before.json and runs/after.json)
const label = (f) => (basename(f) === 'results.json' ? (dirname(f) === '.' ? basename(process.cwd()) : basename(dirname(f))) : basename(f).replace(/\.json$/, ''));

/** A run read and checked, or the reason it cannot be compared. */
function load(p) {
  const f = fileOf(p);
  if (!existsSync(f)) return { error: `${p}: no results.json there` };
  let r;
  try { r = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { return { error: `${f}: not JSON (${e.message})` }; }
  const bad = shapeProblems(r);
  return bad.length ? { error: `${f}: not the shape npm run measure reads: ${bad.slice(0, 3).join('; ')} (workflow/tools/lib/measure.mjs says the shape)` } : { r, f };
}

let pair = opt('--compare', 2);
const last = opt('--last')?.[0];
if (last) {
  // oldest first by the run's own date ("at") when every run has one, else by the folder's name (tops-2026-11-22 before
  // tops-2026-11-23): one order for all, never a mix; a copied or checked-out folder gives its files any time on disk
  const atOf = (d) => { try { return String(JSON.parse(readFileSync(join(d, 'results.json'), 'utf8')).at ?? ''); } catch { return ''; } };
  const found = existsSync(last) ? readdirSync(last).map((d) => join(last, d)).filter((d) => statSync(d).isDirectory() && existsSync(join(d, 'results.json'))).map((d) => [d, atOf(d)]) : [];
  const byAt = found.length && found.every(([, at]) => at);
  const runs = found.sort(([a, x], [b, y]) => (byAt ? x.localeCompare(y) : basename(a).localeCompare(basename(b)))).map(([d]) => d);
  if (!byAt && found.some(([, at]) => at)) console.log('measure: some runs have no "at", so the runs are ordered by folder name');
  if (runs.length < 2) { console.error(`measure: ${last} holds ${runs.length} run${runs.length === 1 ? '' : 's'} with a results.json; two are needed`); process.exit(1); }
  pair = runs.slice(-2);
}
if (!pair || pair.length < 2 || pair.some((p) => !p || p.startsWith('--'))) {
  console.error('measure: npm run measure -- --compare <before> <after>, or --last <folder of runs>');
  process.exit(1);
}
const [a, b] = pair.map(load);
const err = [a, b].find((x) => x.error);
if (err) { console.error(`measure: ${err.error}`); process.exit(1); }
const diff = compareRuns(a.r, b.r);
console.log(compareLines(diff, { before: label(a.f), after: label(b.f), total: new Set([...a.r.cases, ...b.r.cases].map((c) => String(c.id))).size }));
if (args.includes('--same') && !diff.same) process.exit(1);
