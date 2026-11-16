// The shared base of workflow/scripts/session.mjs: git and the folders, the ports, the main folder against origin (and catching up),
// the board, the packages, rebasing and the checks. session-extras.mjs and session.mjs build on it; it runs nothing by itself.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkPackages, describeMissing } from './packages.mjs';
import { stopMessage, stopSessionServer } from './session-stop.mjs'; import { MAIN, ORIGIN_MAIN } from '../tools/lib/branch.mjs';

export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export const gitQuiet = (cwd, ...args) => { try { return git(cwd, ...args); } catch { return ''; } };

// fileURLToPath, not URL.pathname: the pathname keeps "~" and spaces encoded (C:\Users\RUNNER~1 became RUNNER%7E1, a folder that does not exist)
export const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The first worktree git lists is the main folder, wherever this runs from. */
export const main = git(here, 'worktree', 'list', '--porcelain').split('\n')[0].replace(/^worktree /, '');

/** Project settings: the "session" block of workflow/config.json (prefix of the session folders, ports, extra .env lines). */
export const sessionCfg = (() => {
  try { return JSON.parse(readFileSync(join(main, 'workflow/config.json'), 'utf8')).session ?? {}; } catch { return {}; }
})();

export const PREFIX = sessionCfg.prefix ?? basename(main);

export const folderOf = (topic) => join(dirname(main), `${PREFIX}-${topic}`);

export const FIRST_PORT = sessionCfg.firstPort ?? 8788;

export const MAIN_PORT = sessionCfg.mainPort ?? 8787;

export const SESSION_ENV = sessionCfg.env ?? {};

// 'direct': a finished feature goes to the local main and --push sends it; 'pr': it becomes a pull request and --merge lands it
export const FLOW = sessionCfg.flow === 'pr' ? 'pr' : 'direct';

export function usedPorts() {
  const ports = new Set();
  for (const line of git(main, 'worktree', 'list', '--porcelain').split('\n')) {
    if (!line.startsWith('worktree ')) continue;
    const env = join(line.slice(9), '.env');
    if (!existsSync(env)) continue;
    const m = /^PORT=(\d+)\s*$/m.exec(readFileSync(env, 'utf8'));
    if (m) ports.add(Number(m[1]));
  }
  return ports;
}

export const free = (port) => new Promise((ok) => {
  const s = createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true)));
  s.listen(port);
});

/** Fetch origin, then the main folder against origin/main: commits only it has (ahead), commits only origin has (behind), loose files. */
export function mainState(strict) {
  try { git(main, 'fetch', 'origin'); } catch (e) { if (strict) throw new Error(`Could not reach origin: ${e.stderr?.toString().trim() || e.message}`); }
  // a repo whose remote was added after git init has no origin/HEAD (a clone does), and tools that compare with the default
  // branch (Claude Code's security-review) stop without it: point it at origin/main, a local ref only
  if (!gitQuiet(main, 'rev-parse', '--verify', '--quiet', 'refs/remotes/origin/HEAD') && gitQuiet(main, 'rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main')) {
    gitQuiet(main, 'remote', 'set-head', 'origin', MAIN);
  }
  const log = (range) => git(main, 'log', '--format=%h %s', range).split('\n').filter(Boolean);
  const onMain = git(main, 'branch', '--show-current') === MAIN;
  return {
    ahead: log('origin/main..main'),
    behind: Number(git(main, 'rev-list', '--count', 'main..origin/main')),
    loose: !onMain ? [] : git(main, 'status', '--porcelain').split('\n').filter((l) => l && !/^\?\? node_modules\/?$/.test(l)),
  };
}

export const waiting = (n) => `${n} finished feature${n === 1 ? '' : 's'}`;

export const looseMessage = (loose) => `The main folder has uncommitted files:\n${loose.join('\n')}\nCommit them, move them to a session or ask the owner first.`;

/** A main that is only behind origin is moved forward; one with unpushed features of its own AND new origin commits needs --push (which replays them). */
export function catchUp(s) {
  if (s.behind && s.ahead.length) {
    throw new Error(`main has ${waiting(s.ahead.length)} that ${s.ahead.length === 1 ? 'is' : 'are'} not pushed (${s.ahead.map((c) => c.slice(c.indexOf(' ') + 1)).join('; ')}) and origin/main has ${s.behind} new commit${s.behind === 1 ? '' : 's'}. Run: node workflow/scripts/session.mjs --push (it replays yours on top).`);
  }
  if (!s.behind) return;
  if (git(main, 'branch', '--show-current') === MAIN) git(main, 'merge', '--ff-only', ORIGIN_MAIN);
  else git(main, 'fetch', 'origin', 'main:main');
  console.log(`main was ${s.behind} commit${s.behind === 1 ? '' : 's'} behind origin/main and is up to date now.`);
}

/** gh with an argument list and no shell, for the board library; on Windows also where its installer puts it. */
export let ghPath = 'gh';

export function ghRun(args, input) {
  const custom = process.env.WORKFLOW_GH;
  const go = () => spawnSync(custom ? process.execPath : ghPath, custom ? [custom, ...args] : args, { input, encoding: 'utf8', shell: false, windowsHide: true, maxBuffer: 64 << 20 });
  let res = go();
  if (!custom && res.error?.code === 'ENOENT' && process.platform === 'win32' && ghPath === 'gh') { ghPath = 'C:\\Program Files\\GitHub CLI\\gh.exe'; res = go(); }
  return res;
}

/** Runs fn(lib, boardConfig, ghRun); any failure is one warning line, because the board never blocks a start or a finish. */
export async function onBoard(what, fn) {
  try {
    const lib = await import(pathToFileURL(join(main, 'workflow', 'tools', 'lib', 'board.mjs')).href);
    const board = JSON.parse(readFileSync(join(main, 'workflow/config.json'), 'utf8')).board;
    if (!board) throw new Error('workflow/config.json has no "board" block.');
    fn(lib, board, ghRun);
  } catch (e) {
    console.log(`Board warning: ${(e.message ?? String(e)).split('\n')[0]} ${what} by hand on the board.`);
  }
}

/** The session's cards, kept with its branch: "42", or "12,14" when cards that belong together are built as one. */
export const cardOf = (topic) => gitQuiet(main, 'config', '--get', `branch.${topic}.card`);

export const eachCard = (cards) => String(cards ?? '').split(',').filter(Boolean);

export const moveAndSay = async (cards, column, text) => {
  for (const card of eachCard(cards)) {
    await onBoard(`Move card #${card} to "${column}"`, (lib, board, run) => {
      lib.moveCard(board, run, Number(card), column);
      lib.commentCard(board, run, Number(card), text);
    });
  }
};

/** A card that is only partly done stays in "In progress" (moved there only when it is somewhere else) and the comment says what is left. */
export const sayPartial = async (cards, text) => {
  for (const card of eachCard(cards)) {
    await onBoard(`Keep card #${card} in "In progress"`, (lib, board, run) => {
      if (lib.readCard(board, run, Number(card)).column !== 'In progress') lib.moveCard(board, run, Number(card), 'In progress');
      lib.commentCard(board, run, Number(card), text);
    });
  }
};

export const isAncestor = (dir, a, b) => { try { git(dir, 'merge-base', '--is-ancestor', a, b); return true; } catch { return false; } };

/** Uncommitted work in a session's folder (the node_modules link is ours: .gitignore's "node_modules/" matches a folder, not a link). */
export const looseWork = (dir) => git(dir, 'status', '--porcelain').split('\n').some((l) => l && !/^\?\? node_modules\/?$/.test(l));

export const stopServer = (dir) => { const said = stopMessage(stopSessionServer(dir, { mainPort: MAIN_PORT, firstPort: FIRST_PORT })); if (said) console.log(said); };

/** The file map is written by a script (`map` in package.json); its path comes from the config. */
export const mapScript = (dir) => existsSync(join(dir, 'package.json')) && Boolean(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts?.map);

export function mapFile(dir) {
  try { return JSON.parse(readFileSync(join(dir, 'workflow/config.json'), 'utf8')).map?.out ?? 'docs/MAP.md'; } catch { return 'docs/MAP.md'; }
}

/**
 * The main folder's packages as package-lock.json lists them (workflow/scripts/packages.mjs): every session uses them through its link, so a
 * card that added a package and landed on main would leave the others without it. What is missing is installed, or said.
 */
export function ensurePackages(when) {
  const missing = checkPackages(main);
  if (!missing.length) return;
  console.log(`${describeMissing(missing)} ${when}: installing them in the main folder (npm install)...`);
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  const ok = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: main, stdio: 'inherit', shell: process.platform === 'win32' }).status === 0;
  const left = checkPackages(main);
  if (!ok || left.length) console.log(`Still not as the lock lists them${left.length ? `: ${describeMissing(left)}` : ''}. Run npm install in ${main} and read what it says.`);
}

// a shell only on Windows, where npm is a .cmd file; the arguments are fixed script names, never outside input
// nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
export const npmRun = (dir, step, quiet) => spawnSync('npm', ['run', step], { cwd: dir, stdio: quiet ? 'ignore' : 'inherit', shell: process.platform === 'win32' }).status === 0;

/** Rebases the checked-out branch of `dir` on `upstream`. A conflict only in the file map is solved by writing the map again; any other stops it, with the rebase put back. */
export function rebaseOn(dir, upstream, what, { mapConflicts, from }) {
  const env = { ...process.env, GIT_EDITOR: 'true' };
  const step = (...args) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  // with `from`: only the commits after it move (a stacked session leaves its base's old commits behind)
  const how = from ? ['--onto', upstream, from] : [upstream];
  try { step('rebase', ...how); return; } catch { /* a conflict, or something else: look at it */ }
  const map = mapFile(dir);
  for (let i = 0; i < 100; i++) { // bounded: one round per commit that conflicts
    const files = gitQuiet(dir, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
    if (!(mapConflicts && mapScript(dir) && files.length && files.every((f) => f === map))) {
      const commit = gitQuiet(dir, 'log', '-1', '--format=%s', 'REBASE_HEAD');
      try { step('rebase', '--abort'); } catch { /* nothing to abort */ }
      throw new Error(`${what} hit a conflict${commit ? ` in "${commit}"` : ''}${files.length ? ` (${files.join(', ')})` : ''}. Nothing was changed. Resolve it in ${dir} (git rebase ${how.join(' ')}), then run it again.`);
    }
    npmRun(dir, 'map', true);
    step('add', map);
    try { step('rebase', '--continue'); return; } catch { /* the next commit conflicts too */ }
  }
  try { step('rebase', '--abort'); } catch { /* nothing to abort */ }
  throw new Error(`${what} did not come to an end. Nothing was changed.`);
}

/** After a rebase the map is made again and, when it changed, goes into the last commit (so the feature stays one commit). */
export function remakeMap(dir) {
  if (!mapScript(dir)) return;
  npmRun(dir, 'map', true);
  const map = mapFile(dir);
  if (git(dir, 'status', '--porcelain', '--', map)) { git(dir, 'add', map); git(dir, 'commit', '-q', '--amend', '--no-edit'); }
}

/** typecheck and test of the project in `dir`, if it has them. */
export function runChecks(dir, again) {
  const scripts = existsSync(join(dir, 'package.json')) ? JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts ?? {} : {};
  for (const step of ['typecheck', 'test']) {
    if (!scripts[step]) continue;
    console.log(`npm run ${step} …`);
    if (!npmRun(dir, step, false)) throw new Error(`npm run ${step} failed. Fix it in ${dir} and run ${again} again. Nothing was pushed.`);
  }
}

/** gh that must work: its output, or an error with the first line it printed. */
export function gh(...args) {
  const r = ghRun(args);
  if (r.error || r.status !== 0) throw new Error(`gh ${args.slice(0, 2).join(' ')} failed: ${(r.stderr || r.stdout || r.error?.message || '').trim().split('\n')[0]}`);
  return r.stdout.trim();
}
