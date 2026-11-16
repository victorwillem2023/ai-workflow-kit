#!/usr/bin/env node
// The numbers for the weekly retro (/retro reads them): features shipped per week for 8 weeks and the streak, how the code's
// health moved since a week ago (from workflow/tools/baseline.json and the test files), and the board's counts.
//   npm run retro
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { healthMoves, shipping } from './lib/retro.mjs'; import { MAIN, ORIGIN_MAIN } from './lib/branch.mjs';

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).trim(); } catch { return null; } };
process.chdir(git('rev-parse', '--show-toplevel'));
const config = JSON.parse(readFileSync('workflow/config.json', 'utf8'));
const now = new Date();

const log = git('log', MAIN, '--first-parent', '--since=9.weeks', '--format=%cI%x09%s') ?? '';
const s = shipping(log.split('\n').filter(Boolean).map((l) => { const [date, ...rest] = l.split('\t'); return { date, subject: rest.join('\t') }; }), now);
console.log(`Shipped per week (features on main, oldest first): ${s.weeks.map((w) => `${w.week.slice(5)} ${w.features}`).join(', ')}`);
console.log(`Streak: ${s.streak} week${s.streak === 1 ? '' : 's'} in a row with something shipped`);

const weekAgo = git('rev-list', '-1', '--first-parent', '--before=7.days', MAIN);
const file = config.baseline ?? 'workflow/tools/baseline.json';
const parse = (t) => { try { return JSON.parse(t ?? 'null'); } catch { return null; } };
const isTest = (f) => /\.test\.[cm]?[jt]sx?$|_test\.(go|py)$|^tests?\//.test(f);
const tests = (ref) => (ref ? (git('ls-tree', '-r', '--name-only', ref) ?? '').split('\n').filter(isTest).length : null);
if (weekAgo) console.log(`Health since a week ago: ${healthMoves(parse(git('show', `${weekAgo}:${file}`)), parse(git('show', `HEAD:${file}`)), tests(weekAgo), tests('HEAD')).join('; ')}`);
else console.log('Health since a week ago: no commit that old yet');

// the board: what can be started, and what waits off it (the board script does the reading; nothing here asks a model)
const board = spawnSync(process.execPath, ['workflow/tools/board.mjs', '--next', '3'], { encoding: 'utf8', timeout: 60_000 });
console.log(`Next on the board:\n${String(board.stdout || board.stderr).trim().split('\n').filter((l) => !l.startsWith('>')).join('\n')}`);
