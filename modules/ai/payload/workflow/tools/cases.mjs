#!/usr/bin/env node
// Runs the AI cases (cases/*.json) through the project's own features (cases/run.ts exports `run(feature, input)`), judges each
// by code (lib/cases.mjs) and prints "N of M cases pass" for the quality score. They call the real model unless the project's
// run.ts says otherwise, so they cost money: the quality config runs them only when the wrapper or a prompt changes.
//   npm run cases [-- --only <name part>]
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { casesReport, judgeCase } from './lib/cases.mjs';

process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
// no key and no fake asked for: the cases cannot reach the model here, so they say so instead of failing or faking a score
if (!process.env.ANTHROPIC_API_KEY && process.env.AI_CASES_FAKE !== '1') { console.log('quality skipped: no ANTHROPIC_API_KEY here, so the AI cases did not run (they run where the key is; AI_CASES_FAKE=1 tries the wiring for free)'); process.exit(0); }
if (!existsSync('cases/run.ts')) { console.log('cases: cases/run.ts is missing (it says how a case reaches each feature)\n0 of 0 cases pass'); process.exit(1); }
const { run } = await import(pathToFileURL(resolve('cases/run.ts')).href);
const results = [];
for (const file of readdirSync('cases').filter((f) => f.endsWith('.json')).sort()) {
  let list;
  try { list = JSON.parse(readFileSync(join('cases', file), 'utf8')); } catch (e) { results.push({ file, name: '(the file)', ok: false, why: `not valid JSON: ${e.message}` }); continue; }
  for (const c of list) {
    if (only && !String(c.name).includes(only)) continue;
    let out;
    try { out = { value: await run(c.feature, c.input ?? {}) }; } catch (e) { out = e?.name === 'AiRefused' ? { refused: true, reason: e.reason } : { refused: true, reason: `error: ${e?.message ?? e}` }; }
    results.push({ file, name: c.name, hostile: Boolean(c.hostile), ...judgeCase(c, out) });
  }
}
console.log(casesReport(results));
process.exit(results.every((r) => r.ok) ? 0 : 1);
