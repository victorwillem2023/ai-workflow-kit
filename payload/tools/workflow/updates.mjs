#!/usr/bin/env node
// What Dependabot found, in plain lines, with a verdict on each update (take, look at, hold): npm run updates.
//   npm run updates               the security alerts, then each waiting pull request and what to do with it
//   npm run updates -- --short    one line (the start of /work, the health screen)
// Reads GitHub through gh and changes nothing. GitHub that cannot be reached is one line, never a failure (exit 0).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { holdSnippet, judgePr, readAlerts, runtimeNode, shortLine, updateTools } from './lib/updates.mjs';

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

const list = (author) => gh(['pr', 'list', '--repo', repo, '--author', author, '--state', 'open', '--limit', '50', '--json', 'number,title,body,url,statusCheckRollup']);
const prsRes = list('app/dependabot');
if (prsRes.error || prsRes.status !== 0) {
  const why = prsRes.error ? 'gh is not installed (https://cli.github.com)' : String(prsRes.stderr || prsRes.stdout).trim().split('\n').pop().slice(0, 160);
  console.log(`updates: GitHub could not be reached (${why}); nothing checked`);
  process.exit(0);
}
const renovateRes = list('app/renovate');
let pkg;
try { pkg = JSON.parse(read('package.json') ?? 'null'); } catch { pkg = null; }
const node = runtimeNode({ pkg, toolVersions: read('.tool-versions'), dockerfile: read('Dockerfile'), nvmrc: read('.nvmrc') });
const prs = [...(json(prsRes) ?? []), ...(renovateRes.status === 0 ? json(renovateRes) ?? [] : [])].map((pr) => judgePr(pr, { node, hold: config.updates?.hold ?? {} }));

// Renovate runs once its app is installed: it keeps a "Dependency Dashboard" issue
const dash = gh(['issue', 'list', '--repo', repo, '--state', 'open', '--search', 'Dependency Dashboard in:title', '--json', 'number', '--limit', '1']);
const tools = updateTools({ renovateJson: read('renovate.json'), dependabotYml: read('.github/dependabot.yml'), dashboard: dash.status === 0 && (json(dash) ?? []).length > 0 });
const toolLine = tools.renovateIdle ? 'Renovate is not running yet: install its GitHub app for this repository (https://github.com/apps/renovate)'
  : tools.both ? 'Renovate and Dependabot both open version updates: take the version updates out of .github/dependabot.yml (keep the file only if it has other settings)' : null;

const alertsRes = gh(['api', `repos/${repo}/dependabot/alerts?state=open&per_page=100`]);
const alerts = alertsRes.status === 0 ? readAlerts(json(alertsRes)) : [];
const alertsOff = alertsRes.status !== 0 ? (/disabled|not enabled|403/i.test(alertsRes.stdout + alertsRes.stderr)
  ? 'security alerts: off for this repository (npm run secops -- --enable turns them on)'
  : 'security alerts: could not be read') : null;

if (short) { console.log([shortLine(prs, alerts), alertsOff, toolLine].filter(Boolean).join('; ')); process.exit(0); }

const say = { take: 'take it', look: 'look first', hold: 'hold' };
for (const line of [alertsOff, toolLine]) if (line) console.log(line);
for (const a of alerts) console.log(`ALERT ${a.severity.padEnd(8)} ${a.name}: ${a.summary}${a.fixed ? ` (fixed in ${a.fixed})` : ' (no fixed version yet)'}  ${a.url ?? ''}`);
if (!prs.length) console.log('updates: no pull request from Dependabot or Renovate waiting');
for (const p of prs) {
  console.log(`#${p.number} ${say[p.verdict]}: ${p.title}  ${p.url}`);
  for (const u of p.updates) console.log(`    ${u.name} ${u.from} -> ${u.to}: ${say[u.verdict]}, ${u.why}`);
}
const held = [...new Set(prs.flatMap((p) => p.updates.filter((u) => u.verdict === 'hold').map((u) => u.name)))];
if (held.length) {
  console.log(tools.renovate
    ? `
To stop these coming back, close the pull request and add to packageRules in renovate.json:
    { "matchPackageNames": ${JSON.stringify(held)}, "matchUpdateTypes": ["major"], "enabled": false }`
    : `
To stop these coming back every week, close the pull request and add under the npm entry of .github/dependabot.yml:
${holdSnippet(held)}`);
}
console.log(`
${shortLine(prs, alerts)}`);
