#!/usr/bin/env node
// What the AI sessions on this project used, from Claude Code's own records (~/.claude/projects/<this folder>, and the session
// folders next to it: ../<prefix>-<topic>): tokens by model, by command and by day, and money when `session.prices` in
// workflow/config.json has the prices (per million tokens: { "<model>": { "input", "output", "cacheWrite", "cacheRead" } },
// with "pricesChecked": "<year>-<month>"). /retro shows the week; the rules for spending less: workflow/guides/TOKENS.md.
//   node workflow/tools/sessioncost.mjs            the last 7 days
//   node workflow/tools/sessioncost.mjs --days 30
//   node workflow/tools/sessioncost.mjs --by-kit   what one use of each command took under each kit version (the last 60 days, or
//                                                  --days): whether a kit update made a command cost more or less, from real use
// Reads only; OpenCode's sessions are not in these records.
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { answerUse, costLines, kitLines, sumUse, useByKit } from './lib/sessioncost.mjs'; import { MAIN } from './lib/branch.mjs';
import { recordFiles } from './lib/sessionfiles.mjs';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
// the main folder (a session folder's records belong to the same project): git's common folder is the main one's .git
const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim();
const main = common.replace(/[\\/]\.git$/, '');
const config = JSON.parse(readFileSync(join(main, 'workflow/config.json'), 'utf8'));
const daysAt = process.argv.indexOf('--days');
const byKit = process.argv.includes('--by-kit');
const days = Number(daysAt >= 0 ? process.argv[daysAt + 1] : byKit ? 60 : 7) || 7;

const since = new Date(Date.now() - days * 86400000);
const answers = [];
for (const f of recordFiles(main, since)) { // lib/sessionfiles.mjs: Claude Code's folders for this project and its session folders
  for (const text of readFileSync(f, 'utf8').split('\n')) {
    if (!text.includes('"usage"')) continue;
    try { const a = answerUse(JSON.parse(text)); if (a) answers.push(a); } catch { /* a line being written */ }
  }
}
if (byKit) {
  // when the project got each kit version: the commits on main that changed workflow/record, and the version each one names
  const git = (...a) => { try { return execFileSync('git', a, { cwd: main, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
  const periods = git('log', MAIN, '--first-parent', '--format=%H %cI', '--', 'workflow/record').split('\n').filter(Boolean).map((l) => {
    const [hash, from] = l.split(' ');
    return { from, version: /^version=(\S+)/m.exec(git('show', `${hash}:workflow/record`))?.[1] ?? null };
  }).filter((p) => p.version);
  console.log(kitLines(useByKit(answers.filter((a) => !a.at || new Date(a.at) >= since), periods), { label: `the last ${days} days` }).join('\n'));
  process.exit(0);
}
console.log(costLines(sumUse(answers, since), { prices: config.session?.prices ?? null, checked: config.session?.pricesChecked ?? null, label: `the last ${days} days` }).join('\n'));
