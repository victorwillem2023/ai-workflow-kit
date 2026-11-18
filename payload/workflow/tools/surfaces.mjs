#!/usr/bin/env node
// What the product is used on (`project.surfaces` in workflow/config.json, lib/surfaces.mjs), for the skills that depend on it.
//   npm run surfaces               the surfaces, the widths a screen is drawn and checked at, and the apps they bring
//   npm run surfaces -- --widths   only the widths, one line (400 1280): /ui draws and photographs each
//   npm run surfaces -- --web      yes or no: are there web pages (to weigh, to test in a browser)?
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { appsOf, hasWeb, surfacesLine, surfacesOf, widthsOf } from './lib/surfaces.mjs';

process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const config = existsSync('workflow/config.json') ? JSON.parse(readFileSync('workflow/config.json', 'utf8')) : {};
const { names, problems } = surfacesOf(config);
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
const args = process.argv.slice(2);
if (args.includes('--widths')) console.log(widthsOf(names).join(' ') || 'none (no screens)');
else if (args.includes('--web')) console.log(hasWeb(names) ? 'yes' : 'no');
else {
  console.log(`surfaces: ${names.join(', ')}${config.project?.surfaces ? '' : ' (the kit\'s default: /setup asks)'} - ${surfacesLine(names)}`);
  console.log(`widths: ${widthsOf(names).join(', ') || 'none (no screens)'}; web pages: ${hasWeb(names) ? 'yes' : 'no'}; apps of their own: ${appsOf(names).join(', ') || 'none'}`);
}
