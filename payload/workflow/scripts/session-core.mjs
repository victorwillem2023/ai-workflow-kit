// The shared base of workflow/scripts/session.mjs: git and the folders, the ports, the main folder against origin (and catching up),
// the board, the packages, rebasing and the checks. session-extras.mjs and session.mjs build on it; it runs nothing by itself.
import '../tools/lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkPackages, checkShortcuts, describeMissing } from './packages.mjs';
import { dataCopyOf, stopMessage, stopSessionServer } from './session-stop.mjs'; import { SIGNOFFS } from '../tools/lib/signoff.mjs'; import { folderEnv } from '../tools/lib/folderenv.mjs'; import { MAIN, ORIGIN_MAIN } from '../tools/lib/branch.mjs';
import { ghRun } from '../tools/lib/gh.mjs'; import { changedSince, shipPassOf } from '../tools/lib/shippass.mjs';

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

export const sameDir = (x, y) => resolve(x).toLowerCase() === resolve(y).toLowerCase();

/** The worktrees git lists, the main folder first: { dir, branch } (the porcelain form, one field per line: a path with a space stays whole). */
export const worktrees = () => git(main, 'worktree', 'list', '--porcelain').split(/\r?\n\r?\n/).filter((b) => b.trim()).map((block) => ({
  dir: /^worktree (.+)$/m.exec(block)?.[1]?.trim(), branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]?.trim(),
}));

/**
 * A session's folder: where git has its branch checked out, wherever that is (an orchestrator keeps its worktrees in a folder of
 * its own), else the place the kit makes one: ../<prefix>-<topic>, next to the main folder.
 */
export const folderOf = (topic) => worktrees().find((w) => w.branch === topic && !sameDir(w.dir, main))?.dir ?? join(dirname(main), `${PREFIX}-${topic}`);

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

/** gh with an argument list and no shell, for the board library (the kit's one runner: workflow/tools/lib/gh.mjs). */
export { ghRun };

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

/** Uncommitted work in a session's folder (the node_modules link is ours: an older project's .gitignore says "node_modules/", which matches a folder, not a link). */
export const looseWork = (dir) => git(dir, 'status', '--porcelain').split('\n').some((l) => l && !/^\?\? node_modules\/?$/.test(l));
/** Those files by name, for git add (untrimmed: the status columns come first; a rename's new name; -z leaves names unquoted). */
export const looseFiles = (dir) => execFileSync('git', ['status', '--porcelain', '-z'], { cwd: dir, encoding: 'utf8' }).split('\0')
  .filter((l) => l.length > 3 && /^[ MADRCU?!]{2} /.test(l)).map((l) => l.slice(3)).filter((f) => !/^node_modules\/?$/.test(f));

/** Stops the session's dev server (the one --serve recorded, and whatever listens on its port) and takes away the copy of the data --serve --copy-data made for it. */
export const stopServer = (dir) => {
  const said = stopMessage(stopSessionServer(dir, { mainPort: MAIN_PORT, firstPort: FIRST_PORT })); if (said) console.log(said);
  try { rmSync(dataCopyOf(dir), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* still held: the temp folder is cleared by the system */ }
};

/** The first word of a checkpoint commit's subject: work saved by --on or --catch-up on the session's own branch, never a feature's subject (--finish squashes it away). */
export const CHECKPOINT = 'checkpoint:';

/** The environment a folder's commands start with: the folder's .env decides, never a name left set in the shell (lib/folderenv.mjs). */
export { folderEnv };

/** The file map is written by a script (`map` in package.json); its path comes from the config. */
export const mapScript = (dir) => existsSync(join(dir, 'package.json')) && Boolean(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts?.map);

/** Every whole page `npm run map` writes: the file map, the docs index and the infra map (the generated blocks inside hand-written docs are not whole pages). */
export function mapPages(dir) {
  let map = {};
  try { map = JSON.parse(readFileSync(join(dir, 'workflow/config.json'), 'utf8')).map ?? {}; } catch { /* the defaults */ }
  return [map.out ?? 'docs/MAP.md', 'docs/README.md', map.infraOut ?? 'docs/run/INFRA-MAP.md'];
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

/** After a session folder is removed: the main folder's command shortcuts (node_modules/.bin) are all there, or npm rebuild puts them back. */
export function ensureShortcuts() {
  const gone = checkShortcuts(main);
  if (!gone.length) return;
  console.log(`The main folder's node_modules/.bin lost ${gone.length} command${gone.length === 1 ? '' : 's'} (${gone.slice(0, 4).map((g) => g.bin).join(', ')}${gone.length > 4 ? ', ...' : ''}): putting them back (npm rebuild)...`);
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  spawnSync('npm', ['rebuild'], { cwd: main, stdio: 'ignore', shell: process.platform === 'win32' });
  const left = checkShortcuts(main);
  console.log(left.length ? `Still missing: ${left.map((g) => g.bin).join(', ')}. Run npm rebuild in ${main} and read what it says.` : 'They are back.');
}

// a shell only on Windows, where npm is a .cmd file; the arguments are fixed script names, never outside input
// nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
export const npmRun = (dir, step, quiet) => spawnSync('npm', ['run', step], { cwd: dir, env: folderEnv(dir), stdio: quiet ? 'ignore' : 'inherit', shell: process.platform === 'win32' }).status === 0;

/** Files where a clash is never a choice: both sides only added rows (each sign-off is a row of its own), so both are kept. */
const ROWS = [SIGNOFFS];

/** The files git holds in conflict in `dir`, each with git's two letters (UU and AA: both sides changed the text; a D: one side deleted it). */
export const conflictsIn = (dir) => execFileSync('git', ['status', '--porcelain', '-z'], { cwd: dir, encoding: 'utf8' }).split('\0')
  .filter((l) => /^(DD|AU|UD|UA|DU|AA|UU) /.test(l)).map((l) => ({ code: l.slice(0, 2), file: l.slice(3) }));

/** A clash's files by who settles them: `pages` the map writes again, `rows` keep both sides, `rest` is a person's or the builder's choice. */
export function splitConflicts(dir, files, map = true) {
  const pages = map && mapScript(dir) ? mapPages(dir) : [];
  return { pages: files.filter((f) => pages.includes(f)), rows: files.filter((f) => ROWS.includes(f) && !pages.includes(f)), rest: files.filter((f) => !pages.includes(f) && !ROWS.includes(f)) };
}

/** Settles a clash in a file of rows: the lines of both sides, staged (git merge-file --union on the three versions git holds). */
export function keepBoth(dir, f) {
  const tmp = mkdtempSync(join(tmpdir(), 'kit-rows-'));
  try {
    const part = (n) => {
      let text = '';
      try { text = execFileSync('git', ['show', `:${n}:${f}`], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* that side has no such file */ }
      writeFileSync(join(tmp, String(n)), text);
      return join(tmp, String(n));
    };
    const [base, ours, theirs] = [1, 2, 3].map(part);
    try { execFileSync('git', ['merge-file', '--union', ours, base, theirs], { cwd: dir, stdio: 'ignore' }); } catch { /* its exit code counts clashes; with --union there are none left */ }
    copyFileSync(ours, join(dir, f));
    git(dir, 'add', '--', f);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/**
 * Rebases the checked-out branch of `dir` on `upstream`. A conflict only in what a script writes is settled here: the pages the
 * map writes (file map, docs index, infra map) are written again, the sign-off rows of both sides are kept. Any other stops it,
 * with the rebase put back; `hint` then says what to do instead of a rebase by hand.
 */
export function rebaseOn(dir, upstream, what, { mapConflicts, from, hint }) {
  const env = { ...process.env, GIT_EDITOR: 'true' };
  const step = (...args) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  // with `from`: only the commits after it move (a stacked session leaves its base's old commits behind)
  const how = from ? ['--onto', upstream, from] : [upstream];
  try { step('rebase', ...how); return; } catch { /* a conflict, or something else: look at it */ }
  for (let i = 0; i < 100; i++) { // bounded: one round per commit that conflicts
    const files = gitQuiet(dir, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
    const clash = splitConflicts(dir, files, mapConflicts);
    if (!files.length || clash.rest.length) {
      const commit = gitQuiet(dir, 'log', '-1', '--format=%s', 'REBASE_HEAD');
      try { step('rebase', '--abort'); } catch { /* nothing to abort */ }
      throw new Error(`${what} hit a conflict${commit ? ` in "${commit}"` : ''}${files.length ? ` (${(clash.rest.length ? clash.rest : files).join(', ')})` : ''}. Nothing was changed. ${hint ?? `Resolve it in ${dir} (git rebase ${how.join(' ')}), then run it again.`}`);
    }
    for (const f of clash.rows) keepBoth(dir, f);
    if (clash.pages.length) stageMap(dir);
    try { step('rebase', '--continue'); return; } catch { /* the next commit conflicts too */ }
  }
  try { step('rebase', '--abort'); } catch { /* nothing to abort */ }
  throw new Error(`${what} did not come to an end. Nothing was changed.`);
}

/**
 * Writes the map and stages whatever it changed: the file map, and also the docs index, the infra map and the generated blocks
 * in the docs. Only run where everything else is committed or staged (finish refuses loose work), so every change is the map's;
 * one left out would stop a rebase from going on, or the folder from being removed. Returns how many files it staged.
 */
function stageMap(dir) {
  npmRun(dir, 'map', true);
  // (the session's node_modules is a link to the main folder's, which git may list as new: never committed)
  const changed = [...gitQuiet(dir, 'diff', '--name-only').split('\n'), ...gitQuiet(dir, 'ls-files', '--others', '--exclude-standard').split('\n')]
    .filter((f) => f && !/^node_modules\/?$/.test(f));
  if (changed.length) git(dir, 'add', '-A', '--', ...new Set(changed));
  return changed.length;
}

/** After a rebase the map is made again and what it changed goes into the last commit (so the feature stays one commit). */
export function remakeMap(dir) {
  if (mapScript(dir) && stageMap(dir)) git(dir, 'commit', '-q', '--amend', '--no-edit');
}

/**
 * A new session folder gets TypeScript's notes from the main folder's last typecheck (--incremental): its first typecheck starts
 * warm (about 40 s less in a real project); tsc checks them against the files, so a stale one only costs its time.
 */
export function warmTypecheck(dir) {
  for (const f of readdirSync(main).filter((n) => n.endsWith('.tsbuildinfo'))) { try { copyFileSync(join(main, f), join(dir, f)); } catch { /* a cold start */ } }
}

/** typecheck and test of the project in `dir`, if it has them. */
export function runChecks(dir, again, since) {
  // after a rebase: /ship's gate:ship ran what the phase asks already, so only what the rebase can have broken runs again, the quick gate
  // on the feature's files and what came in under it (since = where it sat before); GitHub's gate runs the whole suite after the push
  const gate = join(dir, 'workflow', 'tools', 'gate.mjs');
  if (since && existsSync(gate)) {
    console.log(`the quick gate on what changed since ${since.slice(0, 7)} (the whole suite ran at /ship) …`);
    const r = spawnSync(process.execPath, [gate, '--base', since], { cwd: dir, env: folderEnv(dir), stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`The quick gate fails after the rebase. Fix it in ${dir} and run ${again} again. Nothing was pushed.`);
    return;
  }
  const scripts = existsSync(join(dir, 'package.json')) ? JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts ?? {} : {};
  for (const step of ['typecheck', 'test']) {
    if (!scripts[step]) continue;
    console.log(`npm run ${step} …`);
    if (!npmRun(dir, step, false)) throw new Error(`npm run ${step} failed. Fix it in ${dir} and run ${again} again. Nothing was pushed.`);
  }
}

/**
 * The checks after the squash, rebase and map: none when gate:ship passed on exactly these files (lib/shippass.mjs), the quick
 * gate on what differs from them when it passed on others (what the rebase brought in), else the quick gate on the feature.
 */
export function finishChecks(dir, base) {
  const passed = shipPassOf(dir);
  if (!passed) return runChecks(dir, '--finish', base);
  const pages = mapPages(dir);
  const differ = changedSince(dir, passed).filter((f) => !pages.includes(f));
  if (!differ.length) return console.log('gate:ship passed on exactly these files: not checked again.');
  console.log(`gate:ship passed; ${differ.length} file${differ.length === 1 ? '' : 's'} changed since (the rebase), so those are checked:`);
  runChecks(dir, '--finish', passed);
}

/** A topic's files in a folder's workflow/specs/ (its spec, its try command): ignored by git, so they are moved by hand here. */
const specFilesOf = (dir, topic) => { const d = join(dir, 'workflow/specs'); return existsSync(d) ? readdirSync(d).filter((f) => f.startsWith(`${topic}.`)).map((f) => join(d, f)) : []; };
/** A new session folder gets the spec waiting in the main folder (git does not carry it: workflow/specs/ is ignored). */
export function bringSpec(dir, topic) {
  const spec = join(main, 'workflow/specs', `${topic}.md`);
  if (!existsSync(spec)) return;
  mkdirSync(join(dir, 'workflow/specs'), { recursive: true });
  copyFileSync(spec, join(dir, 'workflow/specs', `${topic}.md`));
}
/** A finished topic's spec and try command go, in each folder given: the feature's commit says what was built. */
export const dropSpecs = (topic, dirs) => { for (const d of dirs) for (const f of specFilesOf(d, topic)) rmSync(f, { force: true }); };

/** gh that must work: its output, or an error with the first line it printed. */
export function gh(...args) {
  const r = ghRun(args);
  if (r.error || r.status !== 0) throw new Error(`gh ${args.slice(0, 2).join(' ')} failed: ${(r.stderr || r.stdout || r.error?.message || '').trim().split('\n')[0]}`);
  return r.stdout.trim();
}
