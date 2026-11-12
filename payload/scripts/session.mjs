// One session, one copy of the project: a git worktree on its own branch in a folder next to this one, with
// its own dev-server port, so sessions never share uncommitted files and each result can be seen live.
//   node scripts/session.mjs <topic> [--card 42]  make ../<prefix>-<topic> on branch <topic> from the local main (finished features that are
//                                               not pushed yet included), print the port and the command; with --card the board card goes to
//                                               "In progress" with a comment naming the folder and port, and the number is kept with the branch
//   node scripts/session.mjs --finish <topic> [--no-checks] [--keep-commits] [--partial "<what is left>"]
//                                               put the branch into the LOCAL main, not onto origin: squash the branch into ONE commit (with the
//                                               first commit's message; --keep-commits for a big rework that is several), rebase it on main (a
//                                               conflict only in the file map is solved by making the map again), re-make the map into the same
//                                               commit, typecheck and test, move main forward, take the session away, move the card to
//                                               "Waiting for your check"; with --partial the card is only partly done: it stays in "In progress"
//                                               (moved there if it was elsewhere) and the comment adds "Still open: <what is left>"
//   node scripts/session.mjs --push [--no-checks]  send every finished feature to origin/main in one go (fast-forward only; when someone pushed
//                                               meanwhile the unpushed commits are replayed on top of that and checked again first)
//   node scripts/session.mjs --remove <topic>   take it away again (refuses while it has uncommitted work or is not merged)
//   node scripts/session.mjs --clean [--yes]    the sessions whose branch is on main and that have no uncommitted work: lists them; with --yes removes
//                                               them (through --remove's own checks). Other <prefix>-* folders are only named, never deleted
//   node scripts/session.mjs --check-main     is the main folder clean? fast-forwards it when it is only behind origin/main; fails (and says why) when it
//                                               has uncommitted files or has unpushed features while origin moved (ignored files such as waiting specs don't count)
//   node scripts/session.mjs --list             the sessions, their ports and cards, and how many finished features are not pushed
// node_modules is linked to the main folder's; .env is copied and given its own PORT plus the lines of "session.env" in
// workflow.config.json ({main} in a value is the main folder: use it to share a big data folder instead of copying it).
// The board is reached through tools/workflow/lib/board.mjs; a board that cannot be reached is one warning line, never a stop.
// WORKFLOW_GH (tests): a node script that stands in for the gh command.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gitQuiet = (cwd, ...args) => { try { return git(cwd, ...args); } catch { return ''; } };
const here = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
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

/** The check /ship runs first: a main that is only behind origin is fast-forwarded; finished features that are not pushed are fine. */
function checkMain() {
  const s = mainState(true);
  if (s.behind && s.ahead.length) catchUp(s);
  if (s.loose.length) throw new Error(looseMessage(s.loose));
  catchUp(s);
  if (s.ahead.length) console.log(`main has ${waiting(s.ahead.length)} not pushed yet (node scripts/session.mjs --push sends them).`);
  else if (!s.behind) console.log('main is clean and level with origin/main.');
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
const cardOf = (topic) => gitQuiet(main, 'config', '--get', `branch.${topic}.card`);
const moveAndSay = (card, column, text) => onBoard(`Move card #${card} to "${column}"`, (lib, board, run) => {
  lib.moveCard(board, run, Number(card), column);
  lib.commentCard(board, run, Number(card), text);
});
/** A card that is only partly done stays in "In progress" (moved there only when it is somewhere else) and the comment says what is left. */
const sayPartial = (card, text) => onBoard(`Keep card #${card} in "In progress"`, (lib, board, run) => {
  if (lib.readCard(board, run, Number(card)).column !== 'In progress') lib.moveCard(board, run, Number(card), 'In progress');
  lib.commentCard(board, run, Number(card), text);
});

async function make(topic, card) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(topic)) throw new Error('The topic is lower case words with dashes, like hill-repeats.');
  if (card !== undefined && !/^[1-9][0-9]*$/.test(card)) throw new Error('--card takes the number of a board card, like --card 42.');
  const dir = folderOf(topic);
  if (existsSync(dir)) throw new Error(`${dir} exists already.`);
  catchUp(mainState(false));
  const taken = usedPorts();
  let port = FIRST_PORT;
  while (taken.has(port) || !(await free(port))) port++;
  git(main, 'worktree', 'add', '-b', topic, dir, 'main');
  symlinkSync(join(main, 'node_modules'), join(dir, 'node_modules'), 'junction');
  const env = join(dir, '.env');
  // the copy keeps the keys but not main's own PORT or the session.env names: a second line would be ambiguous
  const own = new RegExp(`^\\s*(${['PORT', ...Object.keys(SESSION_ENV)].join('|')})\\s*=`);
  if (existsSync(join(main, '.env'))) writeFileSync(env, readFileSync(join(main, '.env'), 'utf8').split(/\r?\n/).filter((l) => !own.test(l)).join('\n'));
  const extra = Object.entries(SESSION_ENV).map(([k, v]) => `${k}=${String(v).split('{main}').join(main)}`).join('\n');
  appendFileSync(env, `\n# set by scripts/session.mjs for this session\nPORT=${port}\n${extra}${extra ? '\n' : ''}`);
  if (card !== undefined) {
    git(main, 'config', `branch.${topic}.card`, card);
    await moveAndSay(card, 'In progress', `Session "${topic}" started: folder ${dir}, http://127.0.0.1:${port}`);
  }
  console.log(`Session "${topic}" is ready.\n  folder: ${dir}\n  branch: ${topic}\n  open:   http://127.0.0.1:${port}\n  start:  cd "${dir}" && npm run dev`);
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
  rmSync(join(dir, 'node_modules'), { force: true }); // the link only, not the main folder's modules
  git(main, 'worktree', 'remove', dir);
  // -D: "-d" asks whether it is merged into the branch the main folder has checked out, which may be another session's; main was checked above
  git(main, 'branch', '-D', topic);
  console.log(`Session "${topic}" is removed.`);
}

/** The file map is written by a script (`map` in package.json); its path comes from the config. */
const mapScript = (dir) => existsSync(join(dir, 'package.json')) && Boolean(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts?.map);
function mapFile(dir) {
  try { return JSON.parse(readFileSync(join(dir, 'workflow.config.json'), 'utf8')).map?.out ?? 'docs/MAP.md'; } catch { return 'docs/MAP.md'; }
}
const npmRun = (dir, step, quiet) => spawnSync('npm', ['run', step], { cwd: dir, stdio: quiet ? 'ignore' : 'inherit', shell: process.platform === 'win32' }).status === 0;

/** Rebases the checked-out branch of `dir` on `upstream`. A conflict only in the file map is solved by writing the map again; any other stops it, with the rebase put back. */
function rebaseOn(dir, upstream, what, { mapConflicts }) {
  const env = { ...process.env, GIT_EDITOR: 'true' };
  const step = (...args) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try { step('rebase', upstream); return; } catch { /* a conflict, or something else: look at it */ }
  const map = mapFile(dir);
  for (let i = 0; i < 100; i++) { // bounded: one round per commit that conflicts
    const files = gitQuiet(dir, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
    if (!(mapConflicts && mapScript(dir) && files.length && files.every((f) => f === map))) {
      const commit = gitQuiet(dir, 'log', '-1', '--format=%s', 'REBASE_HEAD');
      try { step('rebase', '--abort'); } catch { /* nothing to abort */ }
      throw new Error(`${what} hit a conflict${commit ? ` in "${commit}"` : ''}${files.length ? ` (${files.join(', ')})` : ''}. Nothing was changed. Resolve it in ${dir} (git rebase ${upstream}), then run it again.`);
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
  if (git(main, 'branch', '--show-current') === 'main') git(main, 'merge', '--ff-only', topic);
  else git(main, 'fetch', '.', `${topic}:main`); // only the ref moves: the branch checked out in the main folder is left alone
  remove(topic);
  if (card && o.partial !== undefined) await sayPartial(card, `Finished on the local main: ${subject}. Still open: ${o.partial.trim()}`);
  else if (card) await moveAndSay(card, 'Waiting for your check', `Finished on the local main: ${subject}`);
  const n = Number(git(main, 'rev-list', '--count', 'origin/main..main'));
  console.log(`On local main, not pushed (${n} feature${n === 1 ? '' : 's'} waiting). Push with: node scripts/session.mjs --push`);
}

/**
 * Every finished feature to origin/main. Level or ahead: a plain push. When someone pushed meanwhile, the unpushed commits are
 * replayed on top of origin/main in a throwaway work folder, checked again, pushed, and only then does the local main move to them;
 * a conflict stops it with nothing changed and names the commit. The push is fast-forward only, never forced.
 */
function push(o) {
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
const sessions = () => git(main, 'worktree', 'list').split('\n').filter(Boolean).map((r) => {
  const branch = /\[(.+)\]$/.exec(r)?.[1];
  const dir = r.split(/\s+/)[0];
  return { row: r, branch, dir, isMain: sameDir(dir, main), state: sessionState(branch, dir) };
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
  console.log(strangerNote(strangers(all)).trimStart());
}

function list() {
  const ports = usedPorts();
  const all = sessions();
  for (const s of all) {
    const env = join(s.dir, '.env');
    const port = s.isMain || !existsSync(env) ? undefined : /^PORT=(\d+)\s*$/m.exec(readFileSync(env, 'utf8'))?.[1];
    const card = s.branch && port ? cardOf(s.branch) : '';
    const mark = s.isMain ? '' : s.state === 'merged' ? '  finished (merged)' : s.state === 'uncommitted' ? '  uncommitted work' : '';
    console.log(`${s.row}${port ? `  port ${port}` : ''}${card ? `  card #${card}` : ''}${mark}`);
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
  else if (a === '--push') push({ noChecks: has('--no-checks') });
  else if (a === '--remove' && b) remove(b);
  else if (a === '--finish' && b) await finish(b, { noChecks: has('--no-checks'), keepCommits: has('--keep-commits'), partial: textOf('--partial') });
  else if (a && !a.startsWith('--')) await make(a, valueOf('--card'));
  else console.log('usage: node scripts/session.mjs <topic> [--card <n>] | --check-main | --finish <topic> [--no-checks] [--keep-commits] [--partial "<what is left>"] | --push [--no-checks] | --remove <topic> | --clean [--yes] | --list');
} catch (e) {
  console.error(e.stderr?.toString().trim() || e.message);
  process.exit(1);
}
