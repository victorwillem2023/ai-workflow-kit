// One session, one copy of the project: a git worktree on its own branch in a folder next to this one, with
// its own dev-server port, so sessions never share uncommitted files and each result can be seen live.
//   node scripts/session.mjs <topic> [--card 42]  make ../<prefix>-<topic> on branch <topic> from the local main (finished features that are
//                                               not pushed yet included), print the port and the command; with --card the board card goes to
//                                               "In progress" with a comment naming the folder and port, and the number is kept with the branch
//                                               (--card 12,14: cards that belong together, built and committed as one);
//                                               --on <other topic>: start from that session's branch instead (its card is built and waits for
//                                               the owner's check); finishing the other one moves this one onto main by itself
//   node scripts/session.mjs --restack <topic>  move a session that was built on another one onto main, once that one is finished (what
//                                               --finish does by itself; by hand after uncommitted work or a conflict was in the way)
//   node scripts/session.mjs --finish <topic> [--no-checks] [--keep-commits] [--partial "<what is left>"]
//                                               put the branch into the LOCAL main, not onto origin: squash the branch into ONE commit (with the
//                                               first commit's message; --keep-commits for a big rework that is several), rebase it on main (a
//                                               conflict only in the file map is solved by making the map again), re-make the map into the same
//                                               commit, typecheck and test, move main forward, take the session away, move the card to
//                                               "Waiting for your check" (with --no-checks the folder and branch stay until --clean --yes); with --partial the card is only partly done: it stays in "In progress"
//                                               (moved there if it was elsewhere) and the comment adds "Still open: <what is left>"
//   "flow": "pr" under "session" in workflow.config.json: --finish pushes the branch and opens a pull request instead (GitHub runs the
//                                               checks on it, the session folder stays for fixes), and
//   node scripts/session.mjs --merge <topic>    merges it when its checks are green, brings main up to date and removes the session
//   node scripts/session.mjs --push [--no-checks]  send every finished feature to origin/main in one go (fast-forward only; when someone pushed
//                                               meanwhile the unpushed commits are replayed on top of that and checked again first)
//   node scripts/session.mjs --remove <topic>   take it away again (refuses while it has uncommitted work or is not merged); first stops its
//                                               own dev server (the port in its .env, never the main folder's); a folder still open elsewhere is named and kept
//   node scripts/session.mjs --drop spike-<topic>  throw a spike away unmerged, once docs/decisions/spike-<topic>.md holds what it taught
//   node scripts/session.mjs --clean [--yes]    the sessions whose branch is on main and that have no uncommitted work: lists them; with --yes removes
//                                               them (through --remove's own checks). Other <prefix>-* folders are only named, never deleted, except
//                                               completely empty ones, which --yes removes
//   node scripts/session.mjs --check-main     is the main folder clean? fast-forwards it when it is only behind origin/main; fails (and says why) when it
//                                               has uncommitted files or has unpushed features while origin moved (ignored files such as waiting specs don't count)
//   node scripts/session.mjs --commit-notes "<subject>"  the docs and settings left in the main folder (any .md, workflow.config.json,
//                                               renovate.json, .claude/, .opencode/) as one commit of their own, after the quick gate passes; refuses code
//   node scripts/session.mjs --serve <topic>    start the session's dev server in the background and wait until its link answers (for the owner's check)
//   node scripts/session.mjs --list             the sessions, their ports and cards, and how many finished features are not pushed
// node_modules is linked to the main folder's; .env is copied and given its own PORT plus the lines of "session.env" in
// workflow.config.json ({main} in a value is the main folder: use it to share a big data folder instead of copying it).
// The board is reached through tools/workflow/lib/board.mjs; a board that cannot be reached is one warning line, never a stop.
// WORKFLOW_GH (tests): a node script that stands in for the gh command.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, openSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkPackages, describeMissing } from './packages.mjs';
import { heldMessage, removeEmptyStrangers, removeFolder, stopMessage, stopSessionServer } from './session-stop.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gitQuiet = (cwd, ...args) => { try { return git(cwd, ...args); } catch { return ''; } };
// fileURLToPath, not URL.pathname: the pathname keeps "~" and spaces encoded (C:\Users\RUNNER~1 became RUNNER%7E1, a folder that does not exist)
const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The first worktree git lists is the main folder, wherever this runs from. */
const main = git(here, 'worktree', 'list', '--porcelain').split('\n')[0].replace(/^worktree /, '');
/** Project settings: the "session" block of workflow.config.json (prefix of the session folders, ports, extra .env lines). */
const sessionCfg = (() => {
  try { return JSON.parse(readFileSync(join(main, 'workflow.config.json'), 'utf8')).session ?? {}; } catch { return {}; }
})();
const PREFIX = sessionCfg.prefix ?? basename(main);
const folderOf = (topic) => join(dirname(main), `${PREFIX}-${topic}`);
const FIRST_PORT = sessionCfg.firstPort ?? 8788;
const MAIN_PORT = sessionCfg.mainPort ?? 8787;
const SESSION_ENV = sessionCfg.env ?? {};
// 'direct': a finished feature goes to the local main and --push sends it; 'pr': it becomes a pull request and --merge lands it
const FLOW = sessionCfg.flow === 'pr' ? 'pr' : 'direct';

function usedPorts() {
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
const free = (port) => new Promise((ok) => {
  const s = createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true)));
  s.listen(port);
});

/** Fetch origin, then the main folder against origin/main: commits only it has (ahead), commits only origin has (behind), loose files. */
function mainState(strict) {
  try { git(main, 'fetch', 'origin'); } catch (e) { if (strict) throw new Error(`Could not reach origin: ${e.stderr?.toString().trim() || e.message}`); }
  // a repo whose remote was added after git init has no origin/HEAD (a clone does), and tools that compare with the default
  // branch (Claude Code's security-review) stop without it: point it at origin/main, a local ref only
  if (!gitQuiet(main, 'rev-parse', '--verify', '--quiet', 'refs/remotes/origin/HEAD') && gitQuiet(main, 'rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main')) {
    gitQuiet(main, 'remote', 'set-head', 'origin', 'main');
  }
  const log = (range) => git(main, 'log', '--format=%h %s', range).split('\n').filter(Boolean);
  const onMain = git(main, 'branch', '--show-current') === 'main';
  return {
    ahead: log('origin/main..main'),
    behind: Number(git(main, 'rev-list', '--count', 'main..origin/main')),
    loose: !onMain ? [] : git(main, 'status', '--porcelain').split('\n').filter((l) => l && !/^\?\? node_modules\/?$/.test(l)),
  };
}
const waiting = (n) => `${n} finished feature${n === 1 ? '' : 's'}`;
const looseMessage = (loose) => `The main folder has uncommitted files:\n${loose.join('\n')}\nCommit them, move them to a session or ask the owner first.`;

/** A main that is only behind origin is moved forward; one with unpushed features of its own AND new origin commits needs --push (which replays them). */
function catchUp(s) {
  if (s.behind && s.ahead.length) {
    throw new Error(`main has ${waiting(s.ahead.length)} that ${s.ahead.length === 1 ? 'is' : 'are'} not pushed (${s.ahead.map((c) => c.slice(c.indexOf(' ') + 1)).join('; ')}) and origin/main has ${s.behind} new commit${s.behind === 1 ? '' : 's'}. Run: node scripts/session.mjs --push (it replays yours on top).`);
  }
  if (!s.behind) return;
  if (git(main, 'branch', '--show-current') === 'main') git(main, 'merge', '--ff-only', 'origin/main');
  else git(main, 'fetch', 'origin', 'main:main');
  console.log(`main was ${s.behind} commit${s.behind === 1 ? '' : 's'} behind origin/main and is up to date now.`);
}

/**
 * Docs and settings left in the main folder (by /docs, /lesson, /shape or the owner's own edits): any .md file, the workflow config,
 * the Renovate policy and the agent's settings. They are the owner's, not a feature's, and go in as their own commit (--commit-notes).
 */
const NOTE = /(\.md$|^workflow\.config\.json$|^renovate\.json$|^\.claude\/|^\.opencode\/)/i;
// untrimmed: a porcelain line can start with a space (" M file"), which git()'s trim would take off the first one
const looseFiles = () => execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: main, encoding: 'utf8' }).split('\n').filter(Boolean)
  .map((l) => l.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, '')).filter((f) => !/^node_modules\/?$/.test(f));
const notesMessage = (files) => `The main folder has docs and settings that are not committed yet (yours, not a feature's):\n${files.join('\n')}\n` +
  'Commit them as their own commit first: node scripts/session.mjs --commit-notes "<Area: what changed>" (it runs the quick gate on them).';

/** The check /ship runs first: a main that is only behind origin is fast-forwarded; finished features that are not pushed are fine. */
function checkMain() {
  const s = mainState(true);
  if (s.behind && s.ahead.length) catchUp(s);
  if (s.loose.length) { const files = looseFiles(); throw new Error(files.length && files.every((f) => NOTE.test(f)) ? notesMessage(files) : looseMessage(s.loose)); }
  catchUp(s);
  if (s.ahead.length) console.log(`main has ${waiting(s.ahead.length)} not pushed yet (node scripts/session.mjs --push sends them).`);
  else if (!s.behind) console.log('main is clean and level with origin/main.');
}

/**
 * Commits the docs and settings left in the main folder as ONE commit of their own, after the quick gate passes on them (a hand edit
 * that breaks a check is caught here, not by the next feature). Refuses when code is among them: that belongs in a session.
 */
function commitNotes(subject) {
  if (!subject) throw new Error('Say what the commit is: node scripts/session.mjs --commit-notes "Docs: what changed"');
  if (git(main, 'branch', '--show-current') !== 'main') throw new Error('The main folder is not on main.');
  const files = looseFiles();
  if (!files.length) { console.log('The main folder has nothing to commit.'); return; }
  const code = files.filter((f) => !NOTE.test(f));
  if (code.length) throw new Error(`Only docs and settings go in this way; these are not:\n${code.join('\n')}\nMove them to a session (or ask the owner).`);
  const scripts = JSON.parse(readFileSync(join(main, 'package.json'), 'utf8')).scripts ?? {};
  if (mapScript(main)) npmRun(main, 'map', true); // a new doc changes the docs index
  if (scripts.gate) { console.log('npm run gate …'); if (!npmRun(main, 'gate', false)) throw new Error('The quick gate fails on these files: fix them, then run --commit-notes again. Nothing was committed.'); }
  git(main, 'add', '-A', '--', ...looseFiles());
  git(main, 'commit', '-q', '-m', subject);
  console.log(`Committed ${files.length} file${files.length === 1 ? '' : 's'} on main: ${subject} (not pushed: --push sends it with the next feature).`);
}

/**
 * Starts the session's dev server in the background (unless its port answers already) and waits until the link answers, so the
 * owner only opens it. Its output goes to a file outside the folder (a file inside would be uncommitted work); --finish stops it.
 */
async function serve(topic) {
  const dir = folderOf(topic);
  if (!existsSync(dir)) throw new Error(`${dir} is not there.`);
  const env = join(dir, '.env');
  const port = existsSync(env) ? /^PORT=(\d+)\s*$/m.exec(readFileSync(env, 'utf8'))?.[1] : undefined;
  if (!port) throw new Error(`${env} names no PORT.`);
  const url = `http://127.0.0.1:${port}`;
  const answers = async () => { try { await fetch(url, { signal: AbortSignal.timeout(2000) }); return true; } catch { return false; } };
  if (await answers()) { console.log(`The dev server runs already: ${url}`); return; }
  ensurePackages('before the dev server starts');
  const scripts = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts ?? {};
  if (!scripts.dev) throw new Error(`${dir} has no "dev" script, so there is nothing to open: a change without a screen is tried with a command (.claude/skills/build/try-it.md).`);
  const log = join(tmpdir(), `${PREFIX}-${topic}-dev.log`);
  const out = openSync(log, 'w');
  // a shell only on Windows, where npm is a .cmd file; the arguments are fixed, never outside input
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  spawn('npm', ['run', 'dev'], { cwd: dir, detached: true, stdio: ['ignore', out, out], shell: process.platform === 'win32', windowsHide: true }).unref();
  for (let i = 0; i < 120; i++) {
    if (await answers()) { console.log(`The dev server runs: ${url} (its output: ${log}; --finish stops it)`); return; }
    await new Promise((r) => setTimeout(r, 500));
  }
  const last = readFileSync(log, 'utf8').trim().split('\n').slice(-15).join('\n');
  throw new Error(`The dev server did not answer at ${url} within 60 seconds. Its last lines (${log}):\n${last}`);
}

/** gh with an argument list and no shell, for the board library; on Windows also where its installer puts it. */
let ghPath = 'gh';
function ghRun(args, input) {
  const custom = process.env.WORKFLOW_GH;
  const go = () => spawnSync(custom ? process.execPath : ghPath, custom ? [custom, ...args] : args, { input, encoding: 'utf8', shell: false, windowsHide: true, maxBuffer: 64 << 20 });
  let res = go();
  if (!custom && res.error?.code === 'ENOENT' && process.platform === 'win32' && ghPath === 'gh') { ghPath = 'C:\\Program Files\\GitHub CLI\\gh.exe'; res = go(); }
  return res;
}

/** Runs fn(lib, boardConfig, ghRun); any failure is one warning line, because the board never blocks a start or a finish. */
async function onBoard(what, fn) {
  try {
    const lib = await import(pathToFileURL(join(main, 'tools', 'workflow', 'lib', 'board.mjs')).href);
    const board = JSON.parse(readFileSync(join(main, 'workflow.config.json'), 'utf8')).board;
    if (!board) throw new Error('workflow.config.json has no "board" block.');
    fn(lib, board, ghRun);
  } catch (e) {
    console.log(`Board warning: ${(e.message ?? String(e)).split('\n')[0]} ${what} by hand on the board.`);
  }
}
/** The session's cards, kept with its branch: "42", or "12,14" when cards that belong together are built as one. */
const cardOf = (topic) => gitQuiet(main, 'config', '--get', `branch.${topic}.card`);
const eachCard = (cards) => String(cards ?? '').split(',').filter(Boolean);
const moveAndSay = async (cards, column, text) => {
  for (const card of eachCard(cards)) {
    await onBoard(`Move card #${card} to "${column}"`, (lib, board, run) => {
      lib.moveCard(board, run, Number(card), column);
      lib.commentCard(board, run, Number(card), text);
    });
  }
};
/** A card that is only partly done stays in "In progress" (moved there only when it is somewhere else) and the comment says what is left. */
const sayPartial = async (cards, text) => {
  for (const card of eachCard(cards)) {
    await onBoard(`Keep card #${card} in "In progress"`, (lib, board, run) => {
      if (lib.readCard(board, run, Number(card)).column !== 'In progress') lib.moveCard(board, run, Number(card), 'In progress');
      lib.commentCard(board, run, Number(card), text);
    });
  }
};

/**
 * Stacked sessions: a session made with --on <base> starts from the base session's branch, so a card can be built on one that is
 * built but not finished (waiting for the owner's check). The base is kept with the branch (branch.<topic>.kitOn); when the base
 * is finished, --finish moves every session on it onto main (git rebase --onto main <where it forked>), and only then is the
 * stacked one finished in its turn. The fork point is kept too (kitFork), so a move that could not happen yet can be done later.
 */
const onOf = (topic) => gitQuiet(main, 'config', '--get', `branch.${topic}.kitOn`);
const branchExists = (name) => Boolean(gitQuiet(main, 'rev-parse', '--verify', '--quiet', `refs/heads/${name}`));
const stackedOn = (base) => gitQuiet(main, 'config', '--get-regexp', '^branch\\..*\\.kiton$').split('\n').filter(Boolean)
  .map((l) => /^branch\.(.+)\.kiton (.+)$/i.exec(l)).filter((m) => m && m[2] === base).map((m) => m[1]);
const forget = (topic) => { gitQuiet(main, 'config', '--unset', `branch.${topic}.kitOn`); gitQuiet(main, 'config', '--unset', `branch.${topic}.kitFork`); };

/**
 * Moves a session that was built on another one onto main, once that other one is finished. `oldTip` is the base's last commit
 * before its finish squashed it (the fork point is worked out from it and kept); without it, the kept fork point is used.
 * Returns false when it could not move now (uncommitted work, or a conflict), with what to do said; it never loses work.
 */
function restack(topic, oldTip) {
  const dir = folderOf(topic);
  const base = onOf(topic);
  const fork = oldTip ? git(main, 'merge-base', topic, oldTip) : gitQuiet(main, 'config', '--get', `branch.${topic}.kitFork`);
  if (!fork) throw new Error(`"${topic}" does not say where it left "${base}". Move it by hand: cd "${dir}" && git rebase --onto main <the last commit of ${base} it has>`);
  git(main, 'config', `branch.${topic}.kitFork`, fork);
  // moved already (by hand after a conflict, or an earlier run): nothing left to do
  if (existsSync(dir) && isAncestor(dir, 'main', 'HEAD')) { forget(topic); return true; }
  if (!existsSync(dir) || looseWork(dir)) {
    console.log(`"${topic}" was built on "${base}" and still sits on it: commit its work, then run node scripts/session.mjs --restack ${topic}`);
    return false;
  }
  try { rebaseOn(dir, 'main', `Moving "${topic}" onto main`, { mapConflicts: true, from: fork }); }
  catch (e) { console.log(`${e.message}\nWhen that is solved: node scripts/session.mjs --restack ${topic}`); return false; }
  forget(topic);
  console.log(`"${topic}" was built on "${base}" and now sits on main.`);
  return true;
}
const isAncestor = (dir, a, b) => { try { git(dir, 'merge-base', '--is-ancestor', a, b); return true; } catch { return false; } };

async function make(topic, card, on) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(topic)) throw new Error('The topic is lower case words with dashes, like hill-repeats.');
  if (card !== undefined && !/^[1-9][0-9]*(,[1-9][0-9]*)*$/.test(card)) throw new Error('--card takes the number of a board card, like --card 42 (or --card 12,14 for cards built as one).');
  const dir = folderOf(topic);
  if (existsSync(dir)) throw new Error(`${dir} exists already.`);
  let from = 'main';
  if (on !== undefined) {
    if (FLOW === 'pr') throw new Error('--on is for the direct flow; with pull requests, start from main once the other one is merged.');
    if (!branchExists(on)) throw new Error(`There is no session "${on}" to build on (node scripts/session.mjs --list).`);
    if (isAncestor(main, on, 'main')) console.log(`"${on}" is on main already, so this session starts from main.`);
    else {
      from = on;
      // builders do not commit while the owner tries it, so the built work is often loose: without a commit the new session would not have it
      if (existsSync(folderOf(on)) && looseWork(folderOf(on))) {
        throw new Error(`"${on}" has uncommitted work, which a session on top of it would not get. Commit it there first, as one commit with the feature's subject (--finish squashes later rounds into it):\n  cd "${folderOf(on)}" && git add -A && git commit -m "<Area: what changed>"`);
      }
    }
  }
  catchUp(mainState(false));
  const taken = usedPorts();
  let port = FIRST_PORT;
  while (taken.has(port) || !(await free(port))) port++;
  ensurePackages('before the new session');
  git(main, 'worktree', 'add', '-b', topic, dir, from);
  if (from !== 'main') git(main, 'config', `branch.${topic}.kitOn`, from);
  symlinkSync(join(main, 'node_modules'), join(dir, 'node_modules'), 'junction');
  const env = join(dir, '.env');
  // the copy keeps the keys but not main's own PORT or the session.env names: a second line would be ambiguous
  const own = new RegExp(`^\\s*(${['PORT', ...Object.keys(SESSION_ENV)].join('|')})\\s*=`);
  if (existsSync(join(main, '.env'))) writeFileSync(env, readFileSync(join(main, '.env'), 'utf8').split(/\r?\n/).filter((l) => !own.test(l)).join('\n'));
  const extra = Object.entries(SESSION_ENV).map(([k, v]) => `${k}=${String(v).split('{main}').join(main)}`).join('\n');
  appendFileSync(env, `\n# set by scripts/session.mjs for this session\nPORT=${port}\n${extra}${extra ? '\n' : ''}`);
  if (card !== undefined) {
    git(main, 'config', `branch.${topic}.card`, card);
    await moveAndSay(card, 'In progress', `Session "${topic}" started: folder ${dir}`);
  }
  const stacked = from !== 'main' ? `\n  on:     ${from} (built on top of it; when "${from}" is finished this one moves onto main by itself)` : '';
  // no link here: whether there is anything to open depends on the change (a screen, or rules with nothing to see yet)
  console.log(`Session "${topic}" is ready.\n  folder: ${dir}\n  branch: ${topic}${stacked}\n  port:   ${port} (only for a change with a screen: node scripts/session.mjs --serve ${topic} starts it)`);
}

/** Uncommitted work in a session's folder (the node_modules link is ours: .gitignore's "node_modules/" matches a folder, not a link). */
const looseWork = (dir) => git(dir, 'status', '--porcelain').split('\n').some((l) => l && !/^\?\? node_modules\/?$/.test(l));

function remove(topic) {
  const dir = folderOf(topic);
  if (!existsSync(dir)) throw new Error(`${dir} is not there.`);
  // check everything first: a refusal must leave the session as it was
  if (looseWork(dir)) throw new Error(`${dir} has uncommitted work. Commit it (or ask the owner) first.`);
  try { git(main, 'merge-base', '--is-ancestor', topic, 'main'); }
  catch { throw new Error(`Branch "${topic}" is not merged into main yet. Finish it first: node scripts/session.mjs --finish ${topic}`); }
  stopServer(dir);
  const held = removeFolder(main, dir) === 'held';
  // -D: "-d" asks whether it is merged into the branch the main folder has checked out, which may be another session's; main was checked above
  try { git(main, 'branch', '-D', topic); } catch (e) { if (!held) throw e; console.log(`Branch "${topic}" is kept: git still sees it in use.`); }
  console.log(held ? heldMessage(dir) : `Session "${topic}" is removed.`);
}
/**
 * A spike's code is thrown away, never merged: only a topic named spike-..., and only once its decision note
 * (docs/decisions/<topic>.md) is in the main folder, so what it taught is kept. Uncommitted work in the folder goes with it.
 */
function drop(topic) {
  if (!/^spike-/.test(topic)) throw new Error(`Only a spike is dropped unmerged (its topic starts with "spike-"). For "${topic}": --finish or --remove.`);
  const dir = folderOf(topic);
  if (!existsSync(dir)) throw new Error(`${dir} is not there.`);
  const note = join(main, 'docs', 'decisions', `${topic}.md`);
  if (!existsSync(note)) throw new Error(`Write what the spike taught first: docs/decisions/${topic}.md in the main folder (the /spike skill says what goes in it).`);
  stopServer(dir);
  git(main, 'worktree', 'remove', '--force', dir);
  try { git(main, 'branch', '-D', topic); } catch { console.log(`Branch "${topic}" is kept: git still sees it in use.`); }
  console.log(`Spike "${topic}" is dropped; what it taught is in docs/decisions/${topic}.md.`);
}
const stopServer = (dir) => { const said = stopMessage(stopSessionServer(dir, { mainPort: MAIN_PORT, firstPort: FIRST_PORT })); if (said) console.log(said); };

/** The file map is written by a script (`map` in package.json); its path comes from the config. */
const mapScript = (dir) => existsSync(join(dir, 'package.json')) && Boolean(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts?.map);
function mapFile(dir) {
  try { return JSON.parse(readFileSync(join(dir, 'workflow.config.json'), 'utf8')).map?.out ?? 'docs/MAP.md'; } catch { return 'docs/MAP.md'; }
}
/**
 * The main folder's packages as package-lock.json lists them (scripts/packages.mjs): every session uses them through its link, so a
 * card that added a package and landed on main would leave the others without it. What is missing is installed, or said.
 */
function ensurePackages(when) {
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
const npmRun = (dir, step, quiet) => spawnSync('npm', ['run', step], { cwd: dir, stdio: quiet ? 'ignore' : 'inherit', shell: process.platform === 'win32' }).status === 0;

/** Rebases the checked-out branch of `dir` on `upstream`. A conflict only in the file map is solved by writing the map again; any other stops it, with the rebase put back. */
function rebaseOn(dir, upstream, what, { mapConflicts, from }) {
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
function remakeMap(dir) {
  if (!mapScript(dir)) return;
  npmRun(dir, 'map', true);
  const map = mapFile(dir);
  if (git(dir, 'status', '--porcelain', '--', map)) { git(dir, 'add', map); git(dir, 'commit', '-q', '--amend', '--no-edit'); }
}

/** typecheck and test of the project in `dir`, if it has them. */
function runChecks(dir, again) {
  const scripts = existsSync(join(dir, 'package.json')) ? JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts ?? {} : {};
  for (const step of ['typecheck', 'test']) {
    if (!scripts[step]) continue;
    console.log(`npm run ${step} …`);
    if (!npmRun(dir, step, false)) throw new Error(`npm run ${step} failed. Fix it in ${dir} and run ${again} again. Nothing was pushed.`);
  }
}

/**
 * A session's branch into the LOCAL main, whatever the main folder is doing; origin is not touched (--push does that).
 * The branch is squashed into one commit (a feature is one commit, whatever the number of rounds it took; the first commit's
 * message is kept, `--keep-commits` leaves a big rework's stages as they are), rebased on main (a conflict only in the file map
 * is solved by making the map again; any other stops it with nothing changed), the map is re-made into the same commit, checked
 * (typecheck and tests, unless --no-checks) and main moves forward. The main folder is never switched to another branch and
 * another session's branch or files in it are never touched: when it is on another branch, only the main ref moves.
 */
async function finish(topic, o) {
  if (o.partial !== undefined && !o.partial.trim()) throw new Error('--partial needs the words for what is left, for example --partial "the map part".');
  const dir = folderOf(topic);
  if (!existsSync(dir)) throw new Error(`${dir} is not there.`);
  if (git(dir, 'branch', '--show-current') !== topic) throw new Error(`${dir} is not on branch "${topic}".`);
  if (looseWork(dir)) throw new Error(`${dir} has uncommitted work. Commit it first (or ask the owner).`);
  const on = onOf(topic);
  // built on another session: that one is finished first (its check comes first), which moves this one onto main
  if (on && branchExists(on) && !isAncestor(main, on, 'main')) throw new Error(`"${topic}" is built on top of "${on}", which is not finished yet. Finish "${on}" first (that moves "${topic}" onto main by itself), then this one.`);
  if (on && !restack(topic)) throw new Error(`"${topic}" could not move onto main yet (see above). Nothing was finished.`);
  catchUp(mainState(false));
  const base = git(dir, 'merge-base', 'main', 'HEAD');
  const own = Number(git(dir, 'rev-list', '--count', 'main..HEAD'));
  if (own === 0) throw new Error(`Nothing to finish: "${topic}" has no commits of its own on top of main.`);
  const original = git(dir, 'rev-parse', 'HEAD');
  try {
    if (own > 1 && !o.keepCommits) {
      const first = git(dir, 'rev-list', '--reverse', `${base}..HEAD`).split('\n')[0];
      const msgFile = join(dir, '.git-squash-message');
      writeFileSync(msgFile, `${git(dir, 'log', '-1', '--format=%B', first)}\n`);
      try { git(dir, 'reset', '--soft', base); git(dir, 'commit', '-q', '-F', msgFile); } finally { rmSync(msgFile, { force: true }); }
      console.log(`Squashed ${own} commits into one: ${git(dir, 'log', '-1', '--format=%s')}`);
    }
    rebaseOn(dir, 'main', `Rebasing "${topic}" on main`, { mapConflicts: !o.keepCommits });
    remakeMap(dir);
  } catch (e) {
    if (git(dir, 'rev-parse', 'HEAD') !== original) git(dir, 'reset', '--hard', original);
    throw e;
  }
  if (!o.noChecks) runChecks(dir, '--finish');
  const card = cardOf(topic);
  const subject = git(dir, 'log', '-1', '--format=%s');
  if (FLOW === 'pr') return openPullRequest(topic, dir, card, subject, o);
  if (git(main, 'branch', '--show-current') === 'main') git(main, 'merge', '--ff-only', topic);
  else git(main, 'fetch', '.', `${topic}:main`); // only the ref moves: the branch checked out in the main folder is left alone
  // the sessions built on this one leave its old commits behind and sit on main now (or say what is in the way)
  for (const s of stackedOn(topic)) restack(s, original);
  // the change may have added a package: the main folder (and every session through its link) gets it now
  ensurePackages('now that it is on main');
  if (!o.noChecks) remove(topic);
  else {
    stopServer(dir);
    console.log(`The checks were skipped (--no-checks), so ../${basename(dir)} is kept. After npm run gate:all passes on main, remove it with: node scripts/session.mjs --clean --yes`);
  }
  if (card && o.partial !== undefined) await sayPartial(card, `Finished on the local main: ${subject}. Still open: ${o.partial.trim()}`);
  else if (card) await moveAndSay(card, 'Waiting for your check', `Finished on the local main: ${subject}`);
  const n = Number(git(main, 'rev-list', '--count', 'origin/main..main'));
  console.log(`On local main, not pushed (${n} feature${n === 1 ? '' : 's'} waiting). Push with: node scripts/session.mjs --push`);
}

/** gh that must work: its output, or an error with the first line it printed. */
function gh(...args) {
  const r = ghRun(args);
  if (r.error || r.status !== 0) throw new Error(`gh ${args.slice(0, 2).join(' ')} failed: ${(r.stderr || r.stdout || r.error?.message || '').trim().split('\n')[0]}`);
  return r.stdout.trim();
}

/** The pull-request flow's finish: the checked branch goes to origin (its own branch, so rewriting it is fine) and becomes a pull request. */
async function openPullRequest(topic, dir, card, subject, o) {
  try { git(dir, 'push', '--force-with-lease', '-u', 'origin', `${topic}:${topic}`); }
  catch (e) { throw new Error(`origin did not take branch "${topic}" (${(e.stderr?.toString() ?? '').trim().split('\n').pop() || 'refused'}).`); }
  const seen = ghRun(['pr', 'view', topic, '--json', 'url,state', '--jq', 'select(.state=="OPEN") | .url']);
  const url = seen.status === 0 && seen.stdout.trim() ? seen.stdout.trim() : gh('pr', 'create', '--base', 'main', '--head', topic, '--fill');
  if (card && o.partial !== undefined) await sayPartial(card, `Pull request: ${url} (${subject}). Still open: ${o.partial.trim()}`);
  else if (card) await moveAndSay(card, 'Waiting for your check', `Pull request: ${url} (${subject})`);
  console.log(`Pull request: ${url}\nGitHub runs the checks on it; the session folder stays for fixes (finish again to update it).\nWhen the checks are green and the owner says so: node scripts/session.mjs --merge ${topic}`);
}

/** Lands a pull request: only with green checks; then main is brought up to date and the session is taken away. */
async function merge(topic) {
  if (FLOW !== 'pr') throw new Error('This project sends features straight to main (node scripts/session.mjs --push). For pull requests: "flow": "pr" under "session" in workflow.config.json.');
  const checks = ghRun(['pr', 'checks', topic]);
  const said = `${checks.stdout ?? ''}${checks.stderr ?? ''}`.trim();
  if (checks.error || (checks.status !== 0 && !/no checks reported/i.test(said))) {
    throw new Error(checks.status === 8 ? `The checks of "${topic}" are still running. Run --merge again when they are done.` : `The checks of "${topic}" are not green, so it is not merged:\n${said || checks.error?.message}`);
  }
  gh('pr', 'merge', topic, '--squash');
  gitQuiet(main, 'push', 'origin', '--delete', topic);
  catchUp(mainState(true));
  const card = cardOf(topic);
  // GitHub made one new commit of the branch, so git does not see the branch as merged: it is removed by name
  const dir = folderOf(topic);
  if (existsSync(dir) && looseWork(dir)) console.log(`${dir} has uncommitted work, so it is kept.`);
  else {
    if (existsSync(dir)) { stopServer(dir); if (removeFolder(main, dir) === 'held') console.log(heldMessage(dir)); }
    gitQuiet(main, 'branch', '-D', topic);
  }
  for (const c of eachCard(card)) await onBoard(`Say on card #${c} that it is merged`, (lib, board, run) => lib.commentCard(board, run, Number(c), 'Merged into main.'));
  console.log(`Merged "${topic}" into main; the local main is up to date.`);
}

/**
 * Every finished feature to origin/main. Level or ahead: a plain push. When someone pushed meanwhile, the unpushed commits are
 * replayed on top of origin/main in a throwaway work folder, checked again, pushed, and only then does the local main move to them;
 * a conflict stops it with nothing changed and names the commit. The push is fast-forward only, never forced.
 */
function push(o) {
  if (FLOW === 'pr') throw new Error('This project works with pull requests: node scripts/session.mjs --merge <topic> lands one.');
  const s = mainState(true);
  if (!s.ahead.length) { catchUp(s); console.log('Nothing to push: no finished feature is waiting.'); return; }
  if (s.loose.length) throw new Error(looseMessage(s.loose));
  const refused = (e) => new Error(`origin/main did not take it (${(e.stderr?.toString() ?? '').split('\n').find((l) => /rejected|denied|fatal|error/i.test(l))?.trim() ?? 'refused'}). Someone may have pushed first: run --push again.`);
  if (!s.behind) {
    try { git(main, 'push', 'origin', 'main:main'); } catch (e) { throw refused(e); }
    console.log(`Pushed ${waiting(s.ahead.length)} to origin/main.`);
    return;
  }
  const tmp = join(dirname(main), `${PREFIX}-pushing`);
  if (existsSync(tmp)) throw new Error(`${tmp} is left from a push that was interrupted. Remove it (git worktree remove --force "${tmp}") and run --push again.`);
  const old = git(main, 'rev-parse', 'main');
  git(main, 'worktree', 'add', '--detach', tmp, 'main');
  try {
    symlinkSync(join(main, 'node_modules'), join(tmp, 'node_modules'), 'junction');
    console.log(`origin/main has ${s.behind} new commit${s.behind === 1 ? '' : 's'}: replaying ${waiting(s.ahead.length)} on top.`);
    rebaseOn(tmp, 'origin/main', 'Replaying the finished features on origin/main', { mapConflicts: true });
    remakeMap(tmp);
    if (!o.noChecks) runChecks(tmp, '--push');
    const now = git(tmp, 'rev-parse', 'HEAD');
    try { git(tmp, 'push', 'origin', 'HEAD:main'); } catch (e) { throw refused(e); }
    if (git(main, 'branch', '--show-current') === 'main') git(main, 'reset', '--keep', now);
    else git(main, 'update-ref', 'refs/heads/main', now, old);
    console.log(`Pushed ${waiting(s.ahead.length)} to origin/main.`);
  } finally {
    rmSync(join(tmp, 'node_modules'), { force: true });
    gitQuiet(main, 'worktree', 'remove', '--force', tmp);
    rmSync(tmp, { recursive: true, force: true });
    gitQuiet(main, 'worktree', 'prune');
  }
}

const sameDir = (x, y) => resolve(x).toLowerCase() === resolve(y).toLowerCase();

/**
 * What a session's folder holds: 'uncommitted' (loose files), 'merged' (its branch is on main, the very thing --remove accepts)
 * or '' (still work in progress). A branch with no commit of its own yet (one reflog entry: just created) is not "merged", though
 * git calls it an ancestor of main; a branch whose history cannot be read stays '' too, so --clean never guesses.
 */
function sessionState(branch, dir) {
  if (!branch || !existsSync(dir)) return '';
  if (looseWork(dir)) return 'uncommitted';
  try { git(main, 'merge-base', '--is-ancestor', branch, 'main'); } catch { return ''; }
  return gitQuiet(main, 'reflog', 'show', '--format=%H', `refs/heads/${branch}`).split('\n').filter(Boolean).length > 1 ? 'merged' : '';
}

/** The worktrees git lists besides the main folder, with the branch and state of each. */
// the porcelain form, one field per line: a folder with a space in its path (C:\Users\John Smith) stays whole
const sessions = () => git(main, 'worktree', 'list', '--porcelain').split(/\r?\n\r?\n/).filter((b) => b.trim()).map((block) => {
  const dir = /^worktree (.+)$/m.exec(block)?.[1]?.trim();
  const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]?.trim();
  return { row: `${dir}  ${branch ? `[${branch}]` : '(detached)'}`, branch, dir, isMain: sameDir(dir, main), state: sessionState(branch, dir) };
});

/** `<prefix>-*` folders next to the main folder that git does not list as a worktree: named, never deleted (they may hold work). */
function strangers(known) {
  return readdirSync(dirname(main), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith(`${PREFIX}-`) && !known.some((s) => sameDir(s.dir, join(dirname(main), e.name))))
    .map((e) => join(dirname(main), e.name));
}
const strangerNote = (dirs) => (dirs.length ? `\nFolders next to ${basename(main)} that git does not know as sessions (not touched; check them by hand):\n${dirs.map((d) => `  ${d}`).join('\n')}` : '');

/** Without --yes: says which sessions it would remove. With --yes: removes them, one by one, through remove() and its checks. */
function clean(yes) {
  const all = sessions();
  const todo = all.filter((s) => !s.isMain && s.state === 'merged');
  if (!todo.length) console.log('No finished session to remove (a session is removed when its branch is on main and it has no uncommitted work).');
  else if (!yes) {
    console.log(`Would remove ${todo.length} finished session${todo.length === 1 ? '' : 's'}:\n${todo.map((s) => `  ${s.branch}  (${s.dir})`).join('\n')}\nRemoves nothing yet. Run: node scripts/session.mjs --clean --yes`);
  } else {
    for (const s of todo) {
      try { remove(s.branch); } catch (e) { console.log(`Kept "${s.branch}": ${(e.stderr?.toString().trim() || e.message).split('\n')[0]}`); }
    }
  }
  let odd = strangers(all);
  if (yes) {
    const { removed, kept } = removeEmptyStrangers(odd);
    for (const d of removed) console.log(`Removed the empty leftover folder ${d}.`);
    odd = kept;
  }
  console.log(strangerNote(odd).trimStart());
}

function list() {
  const ports = usedPorts();
  const all = sessions();
  for (const s of all) {
    const env = join(s.dir, '.env');
    const port = s.isMain || !existsSync(env) ? undefined : /^PORT=(\d+)\s*$/m.exec(readFileSync(env, 'utf8'))?.[1];
    const cards = s.branch && port ? eachCard(cardOf(s.branch)) : [];
    const on = s.branch && port ? onOf(s.branch) : '';
    const mark = s.isMain ? '' : s.state === 'merged' ? '  finished (merged)' : s.state === 'uncommitted' ? '  uncommitted work' : '';
    const shown = cards.length ? `  card${cards.length > 1 ? 's' : ''} ${cards.map((c) => `#${c}`).join(', ')}` : '';
    console.log(`${s.row}${port ? `  port ${port}` : ''}${shown}${on ? `  on ${on}` : ''}${mark}`);
  }
  const odd = strangers(all);
  if (odd.length) console.log(strangerNote(odd));
  if (all.some((s) => !s.isMain && s.state === 'merged')) console.log('\nFinished sessions can be taken away: node scripts/session.mjs --clean');
  console.log(`\nPorts in use by sessions: ${[...ports].sort().join(', ') || 'none'} (main uses ${MAIN_PORT}, see ${basename(main)}/.env)`);
  const s = mainState(false);
  console.log(s.ahead.length ? `${waiting(s.ahead.length)} not pushed yet: node scripts/session.mjs --push` : 'No finished feature is waiting to be pushed.');
}

const argv = process.argv.slice(2);
const [a, b] = argv;
const has = (flag) => argv.includes(flag);
const valueOf = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] ?? '' : undefined);
// a flag's text: empty when it is missing or the next word is another flag
const textOf = (flag) => { const v = valueOf(flag); return v === undefined ? undefined : v.startsWith('--') ? '' : v; };
try {
  if (a === '--list') list();
  else if (a === '--clean') clean(has('--yes'));
  else if (a === '--check-main') checkMain();
  else if (a === '--commit-notes') commitNotes(textOf('--commit-notes'));
  else if (a === '--serve' && b) await serve(b);
  else if (a === '--push') push({ noChecks: has('--no-checks') });
  else if (a === '--merge' && b) await merge(b);
  else if (a === '--remove' && b) remove(b);
  else if (a === '--drop' && b) drop(b);
  else if (a === '--finish' && b) await finish(b, { noChecks: has('--no-checks'), keepCommits: has('--keep-commits'), partial: textOf('--partial') });
  else if (a === '--restack' && b) { if (!onOf(b)) console.log(`"${b}" is not built on another session.`); else if (!restack(b)) process.exit(1); }
  else if (a && !a.startsWith('--')) await make(a, valueOf('--card'), valueOf('--on'));
  else console.log('usage: node scripts/session.mjs <topic> [--card <n>[,<m>]] [--on <topic>] | --check-main | --commit-notes "<subject>" | --serve <topic> | --restack <topic> | --finish <topic> [--no-checks] [--keep-commits] [--partial "<what is left>"] | --push [--no-checks] | --merge <topic> | --remove <topic> | --drop spike-<topic> | --clean [--yes] | --list');
} catch (e) {
  console.error(e.stderr?.toString().trim() || e.message);
  process.exit(1);
}
