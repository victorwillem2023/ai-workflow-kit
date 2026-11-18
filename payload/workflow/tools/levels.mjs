#!/usr/bin/env node
// What is in force from workflow/levels.json (lib/levels.mjs): the phase, each quality check's level, and from which card size
// a spec, a pitch and a UI board are needed. The skills ask here (/work, /spec, /ui); the owner changes the file, never an agent.
//   npm run levels                 the levels, and what is loosened
//   npm run levels -- --needs spec medium   yes or no: does a medium card need a spec? (spec, pitch, uiBoard; small, medium, large)
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { FILE, levelOf, loosenedLine, needs, QUALITY, readLevels, SAFETY } from './lib/levels.mjs';

process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const config = existsSync('workflow/config.json') ? JSON.parse(readFileSync('workflow/config.json', 'utf8')) : {};
const own = (config.checks ?? []).map((c) => c.name);
const levels = readLevels(existsSync(FILE) ? readFileSync(FILE, 'utf8') : null, own);
if (levels.problems.length) { console.log(levels.problems.join('\n')); process.exit(1); }
const args = process.argv.slice(2);
if (args[0] === '--needs') {
  const [what, effort] = args.slice(1);
  if (!(what in levels.process)) { console.error(`levels: --needs <${Object.keys(levels.process).join('|')}> <small|medium|large>`); process.exit(1); }
  console.log(needs(levels.process[what], effort) ? 'yes' : 'no');
  process.exit(0);
}
console.log(loosenedLine(levels));
console.log(`checks: ${[...QUALITY, ...own].map((n) => `${n} ${levelOf(levels, n)}`).join(', ')}`);
console.log(`safety stops (no level): ${SAFETY.join(', ')}`);
console.log(`process: a spec from ${levels.process.spec} cards, a pitch (/shape) from ${levels.process.pitch}, a UI board from ${levels.process.uiBoard}`);
