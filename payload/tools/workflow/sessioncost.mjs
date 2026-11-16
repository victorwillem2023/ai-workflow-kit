#!/usr/bin/env node
// What the AI sessions on this project used, from Claude Code's own records (~/.claude/projects/<this folder>, and the session
// folders next to it: ../<prefix>-<topic>): tokens by model, by command and by day, and money when `session.prices` in
// workflow.config.json has the prices (per million tokens: { "<model>": { "input", "output", "cacheWrite", "cacheRead" } },
// with "pricesChecked": "<year>-<month>"). /retro shows the week; the rules for spending less: docs/workflow/TOKENS.md.
//   node tools/workflow/sessioncost.mjs            the last 7 days
//   node tools/workflow/sessioncost.mjs --days 30
// Reads only; OpenCode's sessions are not in these records.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { answerUse, costLines, sumUse } from './lib/sessioncost.mjs';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
// the main folder (a session folder's records belong to the same project): git's common folder is the main one's .git
const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim();
const main = common.replace(/[\\/]\.git$/, '');
const config = JSON.parse(readFileSync(join(main, 'workflow.config.json'), 'utf8'));
const daysAt = process.argv.indexOf('--days');
const days = Number(daysAt >= 0 ? process.argv[daysAt + 1] : 7) || 7;

// Claude Code names a project's folder after its path, every ":", "\" and "/" a "-"; the session folders sit next to it
const records = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects');
const name = main.replace(/[:\\/]/g, '-').toLowerCase();
const dirs = existsSync(records) ? readdirSync(records).filter((d) => d.toLowerCase() === name || d.toLowerCase().startsWith(`${name}-`)) : [];
const files = dirs.flatMap((d) => readdirSync(join(records, d), { recursive: true }).map((f) => join(records, d, String(f)))).filter((f) => f.endsWith('.jsonl'));

const since = new Date(Date.now() - days * 86400000);
const answers = [];
for (const f of files) {
  if (statSync(f).mtime < since) continue; // a record not written to since then holds nothing newer
  for (const text of readFileSync(f, 'utf8').split('\n')) {
    if (!text.includes('"usage"')) continue;
    try { const a = answerUse(JSON.parse(text)); if (a) answers.push(a); } catch { /* a line being written */ }
  }
}
console.log(costLines(sumUse(answers, since), { prices: config.session?.prices ?? null, checked: config.session?.pricesChecked ?? null, label: `the last ${days} days` }).join('\n'));
