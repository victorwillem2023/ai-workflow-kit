#!/usr/bin/env node
// The numbers for the weekly retro (/retro reads them): features shipped per week for 8 weeks and the streak, how the code's
// health moved since a week ago (from workflow/tools/baseline.json and the test files), what the shipped cards took against
// their effort labels (lib/shipped.mjs), and the board's counts.
//   npm run retro
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { healthMoves, shipping, signsDue, signsDueInProduct } from './lib/retro.mjs'; import { tookLines } from './lib/shipped.mjs'; import { shippedRecords } from './lib/codestate.mjs'; import { ghRun } from './lib/gh.mjs'; import { MAIN, ORIGIN_MAIN } from './lib/branch.mjs';

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).trim(); } catch { return null; } };
process.chdir(git('rev-parse', '--show-toplevel'));
const config = JSON.parse(readFileSync('workflow/config.json', 'utf8'));
const now = new Date();
// the retro's mark for the stage nudge (workflow/tools/stage.mjs): a retro is often not committed, so its commit cannot say it ran
git('config', 'workflow.lastRetro', now.toISOString());

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

// what the cards took against their labels: the week's by name, the labels measured over every record (npm run shipped)
console.log(tookLines(shippedRecords(process.cwd()), { since: new Date(now.getTime() - 7 * 86_400_000) }).join('\n'));

// the board: what can be started, and what waits off it (the board script does the reading; nothing here asks a model)
const board = spawnSync(process.execPath, ['workflow/tools/board.mjs', '--next', '3'], { encoding: 'utf8', timeout: 60_000 });
console.log(`Next on the board:\n${String(board.stdout || board.stderr).trim().split('\n').filter((l) => !l.startsWith('>')).join('\n')}`);

// "how we will know it worked": the signs whose date has come (/retro asks the owner to look), from docs/PRODUCT.md, where /ship
// writes every one, and from the cards' comments when there is a board (an older project's /ship wrote them only there)
const product = existsSync('docs/PRODUCT.md') ? signsDueInProduct(readFileSync('docs/PRODUCT.md', 'utf8'), now) : [];
let cards = [];
const repo = config.board?.repo;
if (repo) {
  const found = ghRun(['issue', 'list', '--repo', repo, '--state', 'all', '--search', '"How we will know it worked" in:comments', '--json', 'number,title,comments', '--limit', '100'], undefined, { timeout: 60_000 });
  try { cards = found.status === 0 ? signsDue(JSON.parse(found.stdout), now) : null; } catch { cards = null; }
}
const lines = [
  ...product.map((d) => `  ${d.what || 'shipped'}: ${d.sign} (look on ${d.on}; docs/PRODUCT.md)`),
  ...(cards ?? []).filter((c) => !product.some((d) => d.sign === c.sign)).map((d) => `  #${d.number} ${d.title}: ${d.sign} (look on ${d.on})`),
];
if (lines.length) console.log(`Did it work, due a look:\n${lines.join('\n')}\n  (after looking: add "Looked: <what you saw>" to its line in docs/PRODUCT.md, and on the card when it has one)`);
else console.log(`Did it work: nothing due a look${cards === null ? ' in docs/PRODUCT.md (the board could not be read)' : ''}`);
