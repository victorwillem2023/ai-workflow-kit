#!/usr/bin/env node
// What Dependabot found, in plain lines, with a verdict on each update (take, look at, hold): npm run updates.
//   npm run updates               the security alerts, then each waiting pull request and what to do with it
//   npm run updates -- --short    one line (the start of /work, the health screen)
// Reads GitHub through gh and changes nothing. GitHub that cannot be reached is one line, never a failure (exit 0).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { holdSnippet, judgePr, readAlerts, runtimeNode, shortLine } from './lib/updates.mjs';

const short = process.argv.includes('--short');
process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const config = JSON.parse(readFileSync('workflow.config.json', 'utf8'));
const repo = String(config.board?.repo ?? '').includes('/') ? config.board.repo : `${config.board?.owner}/${config.board?.repo}`;
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : undefined);

// gh with an argument list and no shell; on Windows also where its installer puts it. WORKFLOW_GH (tests): a node script that stands in for gh.
function gh(args) {
  const custom = process.env.WORKFLOW_GH;
  const go = (cmd) => spawnSync(custom ? process.execPath : cmd, custom ? [custom, ...args] : args, { encoding: 'utf8', shell: false, windowsHide: true, timeout: 30_000, maxBuffer: 64 << 20 });
  const res = go('gh');
  return res.error?.code === 'ENOENT' && process.platform === 'win32' ? go('C:\\Program Files\\GitHub CLI\\gh.exe') : res;
}
const json = (res) => { try { return JSON.parse(res.stdout); } catch { return null; } };

const prsRes = gh(['pr', 'list', '--repo', repo, '--author', 'app/dependabot', '--state', 'open', '--limit', '50', '--json', 'number,title,body,url,statusCheckRollup']);
if (prsRes.error || prsRes.status !== 0) {
  const why = prsRes.error ? 'gh is not installed (https://cli.github.com)' : String(prsRes.stderr || prsRes.stdout).trim().split('\n').pop().slice(0, 160);
  console.log(`updates: GitHub could not be reached (${why}); nothing checked`);
  process.exit(0);
}
let pkg;
try { pkg = JSON.parse(read('package.json') ?? 'null'); } catch { pkg = null; }
const node = runtimeNode({ pkg, dockerfile: read('Dockerfile'), nvmrc: read('.nvmrc') });
const prs = (json(prsRes) ?? []).map((pr) => judgePr(pr, { node, hold: config.updates?.hold ?? {} }));

const alertsRes = gh(['api', `repos/${repo}/dependabot/alerts?state=open&per_page=100`]);
const alerts = alertsRes.status === 0 ? readAlerts(json(alertsRes)) : [];
const alertsOff = alertsRes.status !== 0 ? (/disabled|not enabled|403/i.test(alertsRes.stdout + alertsRes.stderr)
  ? 'security alerts: off for this repository (GitHub: Settings, Advanced Security, Dependabot alerts)'
  : 'security alerts: could not be read') : null;

if (short) { console.log(shortLine(prs, alerts) + (alertsOff ? `; ${alertsOff}` : '')); process.exit(0); }

const say = { take: 'take it', look: 'look first', hold: 'hold' };
if (alertsOff) console.log(alertsOff);
for (const a of alerts) console.log(`ALERT ${a.severity.padEnd(8)} ${a.name}: ${a.summary}${a.fixed ? ` (fixed in ${a.fixed})` : ' (no fixed version yet)'}  ${a.url ?? ''}`);
if (!prs.length) console.log('updates: no Dependabot pull request waiting');
for (const p of prs) {
  console.log(`#${p.number} ${say[p.verdict]}: ${p.title}  ${p.url}`);
  for (const u of p.updates) console.log(`    ${u.name} ${u.from} -> ${u.to}: ${say[u.verdict]}, ${u.why}`);
}
const held = [...new Set(prs.flatMap((p) => p.updates.filter((u) => u.verdict === 'hold').map((u) => u.name)))];
if (held.length) {
  console.log(`\nTo stop these coming back every week, close the pull request and add under the npm entry of .github/dependabot.yml:\n${holdSnippet(held)}`);
}
console.log(`\n${shortLine(prs, alerts)}`);
