#!/usr/bin/env node
// What is in force from workflow/levels.json (lib/levels.mjs): the phase, each quality check's level, and from which card size
// a spec, a pitch, a UI board and a fresh review are needed, and the guide and app map kept up in the card itself. The skills
// ask here (/work, /spec, /ui, /ship); the owner changes the file, never an agent.
//   npm run levels                 the levels, and what is loosened
//   npm run levels -- --needs spec medium   yes or no: does a medium card need a spec? (spec, pitch, uiBoard, review, upkeep, designs; small, medium, large)
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { FILE, fromWords, levelOf, loosenedLine, needs, QUALITY, readLevels, SAFETY } from './lib/levels.mjs';

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
const p = levels.process;
console.log(`process: a spec for ${fromWords(p.spec)}, a pitch (/shape) for ${fromWords(p.pitch)}, a UI board for ${fromWords(p.uiBoard)}, a fresh review for ${fromWords(p.review)}, the guide and app map kept up in the card for ${fromWords(p.upkeep)} (the rest: one /docs catch-up pass)`);
