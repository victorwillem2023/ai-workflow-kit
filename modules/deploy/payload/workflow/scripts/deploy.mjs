#!/usr/bin/env node
// Deploys the commit you are on and proves it runs, or puts the old version back. Settings: `deploy` in workflow/config.json
// ({ "url": "https://app.example.com", "command": "<the host's deploy command, {version} is the commit>", "rollback": "<the same for an
// older {version}>", "health": "/health", "waitSeconds": 120 }); how the app answers /health is in docs/run/DEPLOY.md.
//   node workflow/scripts/deploy.mjs                      deploy: run the command, wait until /health names this commit, watch it (the canary,
//                                                "watch" in the config: 5 minutes by default); if it never comes up or fails the watch, roll back
//   node workflow/scripts/deploy.mjs --smoke              only ask the running app: is it up, and which version
//   node workflow/scripts/deploy.mjs --rollback [<commit>]  put an older version back (default: the one deployed before, from this computer's list)
//   --env <name>                                 any of the above for that environment (deploy.environments.<name>: staging, production)
// A production environment (--env production) is refused until the phase is production (workflow/levels.json, npm run phase).
// Only when the owner says so. Refuses uncommitted files and a commit that is not on origin/main: what runs is a commit you can find again.
import '../tools/lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fill, healthUrl, ask, waitFor, previous, watchDeploy } from '../tools/lib/deploy.mjs';
import { FILE as LEVELS_FILE, readLevels } from '../tools/lib/levels.mjs';
import { deployRefusal } from '../tools/lib/phase.mjs';
import { isProductionEnv } from '../tools/lib/production.mjs';

const args = process.argv.slice(2);
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const root = git('rev-parse', '--show-toplevel');
process.chdir(root);
const all = JSON.parse(readFileSync('workflow/config.json', 'utf8')).deploy ?? {};
const stop = (line) => { console.log(line); process.exit(1); };
// --env <name>: that environment's settings (deploy.environments.<name>: url, command, rollback, watch) over the shared ones
const envName = args.includes('--env') ? args[args.indexOf('--env') + 1] : null;
if (envName && !all.environments?.[envName]) stop(`No "${envName}" under deploy.environments in workflow/config.json. The environments: ${Object.keys(all.environments ?? {}).join(', ') || 'none yet (/launch sets them)'}.`);
const { environments: _envs, ...shared } = all;
const cfg = envName ? { ...shared, ...all.environments[envName] } : shared;
if (!cfg.url) stop('Not set up yet: put "deploy": { "url": ..., "command": ..., "rollback": ... } in workflow/config.json (docs/run/DEPLOY.md says how).');
// a production deploy goes only in the production phase (lib/phase.mjs); --smoke and --rollback always may: they only look or go back
if (envName && isProductionEnv(envName) && !args.includes('--smoke') && !args.includes('--rollback')) {
  const refused = deployRefusal(readLevels(existsSync(LEVELS_FILE) ? readFileSync(LEVELS_FILE, 'utf8') : null).phase);
  if (refused) stop(refused);
}

const url = healthUrl(cfg.url, cfg.health);
const get = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(10_000) }); return { status: r.status, body: await r.text() }; };
const pauseMs = Number(process.env.WORKFLOW_DEPLOY_PAUSE_MS ?? 3000); // tests shorten it
const waiting = { tries: Math.max(1, Math.ceil(((cfg.waitSeconds ?? 120) * 1000) / Math.max(pauseMs, 1))), pause: () => new Promise((r) => setTimeout(r, pauseMs)) };
// deploy.command and deploy.rollback come from workflow/config.json, the project's own file, never from outside input
// nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
const run = (command) => spawnSync(command, { shell: true, stdio: 'inherit' }).status === 0;
// the versions deployed from this computer, oldest first (kept beside the repository's git data, never committed)
const logFile = join(resolve(root, git('rev-parse', '--git-common-dir')), `deploys${envName ? `-${envName}` : ''}.log`);
const log = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : []);

async function rollback(to, why) {
  if (!cfg.rollback) stop(`${why}No "rollback" command in workflow/config.json: put the old version back by hand.`);
  if (!to) stop(`${why}No earlier deploy is known on this computer. Name the commit: npm run rollback -- <commit>`);
  console.log(`${why}Putting ${to} back...`);
  const back = run(fill(cfg.rollback, to)) && (await waitFor(get, url, to, waiting)).ok;
  console.log(back ? `Rolled back: ${cfg.url} runs ${to} again.` : `The rollback did not come up either: ${url} is not answering with ${to}. Look at the host now.`);
  return back;
}

if (args.includes('--smoke')) {
  const now = await ask(get, url);
  console.log(now.up ? `up: ${cfg.url} runs ${now.version ?? 'a version it does not name (see docs/run/DEPLOY.md, the health address)'}` : `DOWN: ${url} does not answer 200`);
  process.exit(now.up ? 0 : 1);
}
if (args.includes('--rollback')) {
  const named = args[args.indexOf('--rollback') + 1];
  const live = (await ask(get, url)).version;
  process.exit((await rollback(named && !named.startsWith('--') ? named : previous(log(), live), '')) ? 0 : 1);
}

if (!cfg.command) stop('No "command" under "deploy" in workflow/config.json (docs/run/DEPLOY.md says how).');
if (git('status', '--porcelain')) stop('There are uncommitted files: commit them first (only a commit is deployed).');
try { git('merge-base', '--is-ancestor', 'HEAD', 'origin/main'); } catch { stop('This commit is not on origin/main yet: push first (node workflow/scripts/session.mjs --push).'); }
const version = git('rev-parse', '--short=12', 'HEAD');
const before = (await ask(get, url)).version;
console.log(`Deploying ${version}${before ? ` (running now: ${before})` : ''}...`);
const sent = run(fill(cfg.command, version));
const now = sent ? await waitFor(get, url, version, waiting) : { ok: false, up: false, version: null };
// the canary: once it answers, watch it for a while before calling the deploy good ("watch": { "seconds": 300, "every": 15,
// "maxMisses": 1, "errors": "<a command that fails when errors rose, e.g. a query to the error tracker>" }; "seconds": 0 skips it)
let watched = { ok: true };
if (now.ok && (cfg.watch?.seconds ?? 300) > 0) {
  const every = Math.max(1, cfg.watch?.every ?? 15) * 1000;
  const wait = Number(process.env.WORKFLOW_DEPLOY_PAUSE_MS ?? every);
  console.log(`Up: ${cfg.url} runs ${version}. Watching it for ${cfg.watch?.seconds ?? 300} seconds before calling it good...`);
  // deploy.watch.errors comes from workflow/config.json, the project's own file, never from outside input
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  const errorsOk = cfg.watch?.errors ? async () => spawnSync(fill(cfg.watch.errors, version), { shell: true, stdio: 'inherit' }).status === 0 : undefined;
  watched = await watchDeploy(get, url, version, { checks: Math.max(1, Math.round(((cfg.watch?.seconds ?? 300) * 1000) / every)), pause: () => new Promise((r) => setTimeout(r, wait)), maxMisses: cfg.watch?.maxMisses ?? 1, errorsOk });
}
if (now.ok && watched.ok) {
  appendFileSync(logFile, version + '\n');
  console.log(`Live: ${cfg.url} runs ${version}${cfg.watch?.seconds === 0 ? '' : ', and stayed healthy through the watch'}.`);
  process.exit(0);
}
const why = !watched.ok ? `It came up, but ${watched.why}. ` : !sent ? 'The deploy command failed. ' : now.up ? `The app answers, but with version ${now.version ?? 'unknown'}, not ${version}. ` : `The new version did not come up (${url} gave no 200). `;
if (before && before !== version) await rollback(before, why); else console.log(`${why}Nothing was running before, so there is nothing to put back.`);
process.exit(1);
