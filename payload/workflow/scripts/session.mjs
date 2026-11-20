// One session, one copy of the project: a git worktree on its own branch in a folder next to this one, with
// its own dev-server port, so sessions never share uncommitted files and each result can be seen live.
//   node workflow/scripts/session.mjs <topic> [--card 42]  make ../<prefix>-<topic> on branch <topic> from the local main (finished features that are
//                                               not pushed yet included), print the port and the command; with --card the board card goes to
//                                               "In progress" with a comment naming the folder and port, and the number is kept with the branch
//                                               (--card 12,14: cards that belong together, built and committed as one);
//                                               --on <other topic>: start from that session's branch instead (its card is built and waits for
//                                               the owner's check); finishing the other one moves this one onto main by itself
//   node workflow/scripts/session.mjs --restack <topic>  move a session that was built on another one onto main, once that one is finished (what
//                                               --finish does by itself; by hand after uncommitted work or a conflict was in the way)
//   node workflow/scripts/session.mjs --finish <topic> [--subject "<s>"] [--body "<b>"] [--no-checks] [--keep-commits] [--partial "<what is left>"]
//                                               put the branch into the LOCAL main, not onto origin: squash the branch into ONE commit (with the
//                                               --subject the owner approved, else the first commit's message; --keep-commits for a big rework that is several), rebase it on main (a
//                                               conflict only in the file map is solved by making the map again), re-make the map into the same
//                                               commit, typecheck and test, move main forward, take the session away, move the card to
//                                               "Waiting for your check" (with --no-checks the folder and branch stay until --clean --yes); with --partial the card is only partly done: it stays in "In progress"
//                                               (moved there if it was elsewhere) and the comment adds "Still open: <what is left>"
//   "flow": "pr" under "session" in workflow/config.json: --finish pushes the branch and opens a pull request instead (GitHub runs the
//                                               checks on it, the session folder stays for fixes), and
//   node workflow/scripts/session.mjs --merge <topic>    merges it when its checks are green, brings main up to date and removes the session
//   node workflow/scripts/session.mjs --push [--no-checks]  send every finished feature to origin/main in one go (fast-forward only; when someone pushed
//                                               meanwhile the unpushed commits are replayed on top of that and checked again first)
//   node workflow/scripts/session.mjs --remove <topic>   take it away again (refuses while it has uncommitted work or is not merged); first stops its
//                                               own dev server (the port in its .env, never the main folder's); a folder still open elsewhere is named and kept
//   node workflow/scripts/session.mjs --drop spike-<topic>  throw a spike away unmerged, once docs/decisions/spike-<topic>.md holds what it taught
//   node workflow/scripts/session.mjs --clean [--yes]    the sessions whose branch is on main and that have no uncommitted work: lists them; with --yes removes
//                                               them (through --remove's own checks). Other <prefix>-* folders are only named, never deleted, except
//                                               completely empty ones, which --yes removes
//   node workflow/scripts/session.mjs --check-main     is the main folder clean? fast-forwards it when it is only behind origin/main; fails (and says why) when it
//                                               has uncommitted files or has unpushed features while origin moved (ignored files such as waiting specs don't count)
//   node workflow/scripts/session.mjs --sync             bring the main folder level with origin when nothing is in the way (a fast-forward), then
//                                               its packages: what merged on GitHub (an update Renovate merged by itself) is here
//   node workflow/scripts/session.mjs --commit-notes "<subject>"  the docs and settings left in the main folder (any .md, workflow/config.json,
//                                               renovate.json, .claude/, .opencode/) as one commit of their own, after the quick gate passes; refuses code
//   node workflow/scripts/session.mjs --serve <topic> [--lan] [--copy-data]  start the session's dev server in the background and wait until its link answers (for
//                                               the owner's check); it starts with the folder's .env deciding, never a PORT left set in the shell. --lan: also
//                                               on the Wi-Fi, for a phone (prints the address); --copy-data: on a copy of the real data. Both end when it is stopped
//   node workflow/scripts/session.mjs --catch-up <topic> bring main into a session mid-build (main's fixes come in). Work main also changed is saved first as a checkpoint
//                                               on the session's own branch; a clash is left open in the folder, named, and the same command goes on once it is settled
//   node workflow/scripts/session.mjs --list             the sessions, their ports and cards, and how many finished features are not pushed
// node_modules is linked to the main folder's; .env is copied and given its own PORT plus the lines of "session.env" in
// workflow/config.json ({main} in a value is the main folder: use it to share a big data folder instead of copying it).
// The board is reached through workflow/tools/lib/board.mjs; a board that cannot be reached is one warning line, never a stop.
// WORKFLOW_GH (tests): a node script that stands in for the gh command.
import '../tools/lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import '../tools/lib/frommain.mjs'; // a session folder with an older kit than the main folder's: the main folder's copy runs instead (lib/frommain.mjs)
import { appendFileSync, existsSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { heldMessage, removeEmptyStrangers, removeFolder, unlinkModules } from './session-stop.mjs';
import { git, gitQuiet, here, main, PREFIX, folderOf, FIRST_PORT, MAIN_PORT, SESSION_ENV, FLOW, usedPorts, free, mainState, waiting, looseMessage, catchUp, ghRun, onBoard, cardOf, eachCard, moveAndSay, sayPartial, isAncestor, looseWork, looseFiles, stopServer, ensurePackages, ensureShortcuts, rebaseOn, remakeMap, runChecks, finishChecks, bringSpec, dropSpecs, gh, CHECKPOINT } from './session-core.mjs';
import { sync, checkMain, commitNotes, carryNotes, onOf, branchExists, stackedOn, restack, recordShip } from './session-extras.mjs'; import { serve, catchUpSession } from './session-live.mjs'; import { MAIN, ORIGIN_MAIN } from '../tools/lib/branch.mjs';

async function make(topic, card, on) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(topic)) throw new Error('The topic is lower case words with dashes, like hill-repeats.');
  if (card !== undefined && !/^[1-9][0-9]*(,[1-9][0-9]*)*$/.test(card)) throw new Error('--card takes the number of a board card, like --card 42 (or --card 12,14 for cards built as one).');
  const dir = folderOf(topic);
  if (existsSync(dir)) throw new Error(`${dir} exists already.`);
  let from = MAIN;
  if (on !== undefined) {
    if (FLOW === 'pr') throw new Error('--on is for the direct flow; with pull requests, start from main once the other one is merged.');
    if (!branchExists(on)) throw new Error(`There is no session "${on}" to build on (node workflow/scripts/session.mjs --list).`);
    // builders do not commit while the owner tries it, so the built work is often loose, with no commit of its own yet: without one
    // the new session would not have it. It is saved here as a checkpoint on the base's own branch: nothing reaches main, so it is not the owner's stop
    // point (the agent never runs git commit for it), and --finish later squashes it under the subject the owner approves.
    if (existsSync(folderOf(on)) && looseWork(folderOf(on))) {
      // (the session's node_modules link stays out: the kit's .gitignore says "node_modules", which matches a link as well as a
      // folder; an older project's "node_modules/" matched only the folder, so on Linux and macOS the link went into this commit)
      git(folderOf(on), 'add', '-A');
      git(folderOf(on), 'commit', '-q', '-m', `${CHECKPOINT} ${on}: built, waiting for the owner's check`);
      console.log(`Saved "${on}"'s uncommitted work as a checkpoint on its own branch (not on main; --finish ${on} replaces its message with the approved one).`);
    }
    // (only now: a base whose work is all uncommitted would look as if it were on main already)
    if (isAncestor(main, on, MAIN)) console.log(`"${on}" is on main already, so this session starts from main.`);
    else from = on;
  }
  catchUp(mainState(false));
  const taken = usedPorts();
  let port = FIRST_PORT;
  while (taken.has(port) || !(await free(port))) port++;
  ensurePackages('before the new session');
  git(main, 'worktree', 'add', '-b', topic, dir, from);
  if (from !== MAIN) git(main, 'config', `branch.${topic}.kitOn`, from);
  symlinkSync(join(main, 'node_modules'), join(dir, 'node_modules'), 'junction');
  bringSpec(dir, topic);
  const env = join(dir, '.env');
  // the copy keeps the keys but not main's own PORT or the session.env names: a second line would be ambiguous
  const own = new RegExp(`^\\s*(${['PORT', ...Object.keys(SESSION_ENV)].join('|')})\\s*=`);
  if (existsSync(join(main, '.env'))) writeFileSync(env, readFileSync(join(main, '.env'), 'utf8').split(/\r?\n/).filter((l) => !own.test(l)).join('\n'));
  const extra = Object.entries(SESSION_ENV).map(([k, v]) => `${k}=${String(v).split('{main}').join(main)}`).join('\n');
  appendFileSync(env, `\n# set by workflow/scripts/session.mjs for this session\nPORT=${port}\n${extra}${extra ? '\n' : ''}`);
  if (card !== undefined) {
    git(main, 'config', `branch.${topic}.card`, card);
    await moveAndSay(card, 'In progress', `Session "${topic}" started: folder ${dir}`);
  }
  const stacked = from !== MAIN ? `\n  on:     ${from} (built on top of it; when "${from}" is finished this one moves onto main by itself)` : '';
  // no link here: whether there is anything to open depends on the change (a screen, or rules with nothing to see yet)
  console.log(`Session "${topic}" is ready.\n  folder: ${dir}\n  branch: ${topic}${stacked}\n  port:   ${port} (only for a change with a screen: node workflow/scripts/session.mjs --serve ${topic} starts it)`);
}

function remove(topic) {
  const dir = folderOf(topic);
  if (!existsSync(dir)) throw new Error(`${dir} is not there.`);
  // check everything first: a refusal must leave the session as it was
  if (looseWork(dir)) throw new Error(`${dir} has uncommitted work. Commit it (or ask the owner) first.`);
  try { git(main, 'merge-base', '--is-ancestor', topic, MAIN); }
  catch { throw new Error(`Branch "${topic}" is not merged into main yet. Finish it first: node workflow/scripts/session.mjs --finish ${topic}`); }
  stopServer(dir);
  const held = removeFolder(main, dir) === 'held';
  ensureShortcuts(); // a removal that went through the link anyway leaves main without tsc: put back here, not in the next gate
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
  // the link first, by itself: "worktree remove --force" follows it on Windows and empties the main folder's node_modules/.bin
  unlinkModules(dir);
  git(main, 'worktree', 'remove', '--force', dir);
  ensureShortcuts();
  try { git(main, 'branch', '-D', topic); } catch { console.log(`Branch "${topic}" is kept: git still sees it in use.`); }
  console.log(`Spike "${topic}" is dropped; what it taught is in docs/decisions/${topic}.md.`);
}

/**
 * A session's branch into the LOCAL main, whatever the main folder is doing; origin is not touched (--push does that).
 * The branch is squashed into one commit (a feature is one commit, whatever the number of rounds it took; the first commit's
 * message is kept, `--keep-commits` leaves a big rework's stages as they are), rebased on main (a conflict only in the file map
 * is solved by making the map again; any other stops it with nothing changed), the map is re-made into the same commit, checked
 * (the quick gate on what the rebase can have broken, unless --no-checks: /ship ran the whole suite) and main moves forward. The main folder is never switched to another branch and
 * another session's branch or files in it are never touched: when it is on another branch, only the main ref moves.
 */
/** The finished commit's message: the approved --subject (and --body), else the first commit's; never a checkpoint's. */
function finishMessage(dir, base, o) {
  if (o.subject !== undefined && !o.subject.trim()) throw new Error('--subject needs the approved subject, for example --subject "Plans: a rest week every fourth week".');
  if (o.subject) return [o.subject.trim(), o.body?.trim()].filter(Boolean).join('\n\n');
  const first = git(dir, 'rev-list', '--reverse', `${base}..HEAD`).split('\n')[0];
  const kept = git(dir, 'log', '-1', '--format=%B', first);
  if (kept.startsWith(CHECKPOINT) && !o.keepCommits) throw new Error(`The first commit is a checkpoint ("${kept.split('\n')[0]}"): finish with the subject the owner approved, --subject "<Area: what changed>".`);
  return kept;
}

async function finish(topic, o) {
  if (o.partial !== undefined && !o.partial.trim()) throw new Error('--partial needs the words for what is left, for example --partial "the map part".');
  const dir = folderOf(topic);
  if (!existsSync(dir)) throw new Error(`${dir} is not there.`);
  if (git(dir, 'branch', '--show-current') !== topic) throw new Error(`${dir} is not on branch "${topic}".`);
  if (looseWork(dir) && !o.subject) throw new Error(`${dir} has uncommitted work. Finish with --subject "<the approved subject>" (it goes into the feature's one commit), or ask the owner.`);
  // with the approved subject, what is left goes in too: it is squashed under that subject below anyway (never the node_modules link)
  if (looseWork(dir)) { git(dir, 'add', '-A', '--', ...looseFiles(dir)); git(dir, 'commit', '-q', '-m', 'the work left at --finish'); }
  const on = onOf(topic);
  // built on another session: that one is finished first (its check comes first), which moves this one onto main
  if (on && branchExists(on) && !isAncestor(main, on, MAIN)) throw new Error(`"${topic}" is built on top of "${on}", which is not finished yet. Finish "${on}" first (that moves "${topic}" onto main by itself), then this one.`);
  if (on && !restack(topic)) throw new Error(`"${topic}" could not move onto main yet (see above). Nothing was finished.`);
  catchUp(mainState(false));
  const base = git(dir, 'merge-base', MAIN, 'HEAD');
  const own = Number(git(dir, 'rev-list', '--count', 'main..HEAD'));
  if (own === 0) throw new Error(`Nothing to finish: "${topic}" has no commits of its own on top of main.`);
  const original = git(dir, 'rev-parse', 'HEAD');
  const message = finishMessage(dir, base, o);
  try {
    if (!o.keepCommits && (own > 1 || o.subject)) {
      // one commit, under the message the owner approved (/ship step 6: --subject, --body); without one, the first commit's,
      // unless that is a checkpoint (a stacked base saved by --on), which is never a feature's subject
      const msgFile = join(dir, '.git-squash-message');
      writeFileSync(msgFile, `${message}\n`);
      try { git(dir, 'reset', '--soft', base); git(dir, 'commit', '-q', '-F', msgFile); } finally { rmSync(msgFile, { force: true }); }
      console.log(own > 1 ? `Squashed ${own} commits into one: ${git(dir, 'log', '-1', '--format=%s')}` : `Committed as: ${git(dir, 'log', '-1', '--format=%s')}`);
    }
    // a clash in the feature's own files is not settled in a rebase by hand: --catch-up brings main in as one merge, settled once
    rebaseOn(dir, MAIN, `Rebasing "${topic}" on main`, { mapConflicts: !o.keepCommits, hint: `Bring main into the session first: node workflow/scripts/session.mjs --catch-up ${topic} (it leaves the clash open in ${dir} to settle where the work is), then run --finish again.` });
    remakeMap(dir);
  } catch (e) {
    if (git(dir, 'rev-parse', 'HEAD') !== original) git(dir, 'reset', '--hard', original);
    throw e;
  }
  if (!o.noChecks) finishChecks(dir, base);
  const card = cardOf(topic);
  const subject = git(dir, 'log', '-1', '--format=%s');
  recordShip(topic, dir, card, subject); // what it took, kept for the retro and the ranking (workflow/tools/shipped.mjs)
  if (FLOW === 'pr') return openPullRequest(topic, dir, card, subject, o);
  if (git(main, 'branch', '--show-current') === MAIN) git(main, 'merge', '--ff-only', topic);
  else git(main, 'fetch', '.', `${topic}:main`); // only the ref moves: the branch checked out in the main folder is left alone
  dropSpecs(topic, [main, dir]); // on main now: the commit says what was built
  // the sessions built on this one leave its old commits behind and sit on main now (or say what is in the way)
  for (const s of stackedOn(topic)) restack(s, original);
  // the change may have added a package: the main folder (and every session through its link) gets it now
  ensurePackages('now that it is on main');
  // the feature is on main now: a folder that cannot go is said, and the card is still told
  if (!o.noChecks) { try { remove(topic); } catch (e) { console.log(`${e.message} The feature is on main; remove the folder later with: node workflow/scripts/session.mjs --remove ${topic}`); } }
  else {
    stopServer(dir);
    console.log(`The checks were skipped (--no-checks), so ../${basename(dir)} is kept. After npm run gate:ship passes on main, remove it with: node workflow/scripts/session.mjs --clean --yes`);
  }
  if (card && o.partial !== undefined) await sayPartial(card, `Finished on the local main: ${subject}. Still open: ${o.partial.trim()}`);
  else if (card) await moveAndSay(card, 'Waiting for your check', `Finished on the local main: ${subject}`);
  const n = Number(git(main, 'rev-list', '--count', 'origin/main..main'));
  console.log(`On local main, not pushed (${n} feature${n === 1 ? '' : 's'} waiting). Push with: node workflow/scripts/session.mjs --push`);
}

/** The pull-request flow's finish: the checked branch goes to origin (its own branch, so rewriting it is fine) and becomes a pull request. */
async function openPullRequest(topic, dir, card, subject, o) {
  try { git(dir, 'push', '--force-with-lease', '-u', 'origin', `${topic}:${topic}`); }
  catch (e) { throw new Error(`origin did not take branch "${topic}" (${(e.stderr?.toString() ?? '').trim().split('\n').pop() || 'refused'}).`); }
  const seen = ghRun(['pr', 'view', topic, '--json', 'url,state', '--jq', 'select(.state=="OPEN") | .url']);
  const url = seen.status === 0 && seen.stdout.trim() ? seen.stdout.trim() : gh('pr', 'create', '--base', MAIN, '--head', topic, '--fill');
  if (card && o.partial !== undefined) await sayPartial(card, `Pull request: ${url} (${subject}). Still open: ${o.partial.trim()}`);
  else if (card) await moveAndSay(card, 'Waiting for your check', `Pull request: ${url} (${subject})`);
  console.log(`Pull request: ${url}\nGitHub runs the checks on it; the session folder stays for fixes (finish again to update it).\nWhen the checks are green and the owner says so: node workflow/scripts/session.mjs --merge ${topic}`);
}

/** Lands a pull request: only with green checks; then main is brought up to date and the session is taken away. */
async function merge(topic) {
  if (FLOW !== 'pr') throw new Error('This project sends features straight to main (node workflow/scripts/session.mjs --push). For pull requests: "flow": "pr" under "session" in workflow/config.json.');
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
    if (existsSync(dir)) { stopServer(dir); if (removeFolder(main, dir) === 'held') console.log(heldMessage(dir)); ensureShortcuts(); }
    gitQuiet(main, 'branch', '-D', topic);
  }
  dropSpecs(topic, [main]);
  for (const c of eachCard(card)) await onBoard(`Say on card #${c} that it is merged`, (lib, board, run) => lib.commentCard(board, run, Number(c), 'Merged into main.'));
  console.log(`Merged "${topic}" into main; the local main is up to date.`);
}

/**
 * Every finished feature to origin/main. Level or ahead: a plain push. When someone pushed meanwhile, the unpushed commits are
 * replayed on top of origin/main in a throwaway work folder, checked again, pushed, and only then does the local main move to them;
 * a conflict stops it with nothing changed and names the commit. The push is fast-forward only, never forced.
 */
function push(o) {
  if (FLOW === 'pr') throw new Error('This project works with pull requests: node workflow/scripts/session.mjs --merge <topic> lands one.');
  const s = mainState(true);
  if (!s.ahead.length) { catchUp(s); console.log('Nothing to push: no finished feature is waiting.'); return; }
  if (s.loose.length) throw new Error(looseMessage(s.loose));
  const refused = (e) => new Error(`${ORIGIN_MAIN} did not take it (${(e.stderr?.toString() ?? '').split('\n').find((l) => /rejected|denied|fatal|error/i.test(l))?.trim() ?? 'refused'}). Someone may have pushed first: run --push again.`);
  if (!s.behind) {
    try { git(main, 'push', 'origin', 'main:main'); } catch (e) { throw refused(e); }
    console.log(`Pushed ${waiting(s.ahead.length)} to origin/main.`);
    return;
  }
  const tmp = join(dirname(main), `${PREFIX}-pushing`);
  if (existsSync(tmp)) throw new Error(`${tmp} is left from a push that was interrupted. Remove it (git worktree remove --force "${tmp}") and run --push again.`);
  const old = git(main, 'rev-parse', MAIN);
  const met = git(main, 'merge-base', MAIN, ORIGIN_MAIN); // where the local features left origin: the quick gate looks from there
  git(main, 'worktree', 'add', '--detach', tmp, MAIN);
  try {
    symlinkSync(join(main, 'node_modules'), join(tmp, 'node_modules'), 'junction');
    console.log(`${ORIGIN_MAIN} has ${s.behind} new commit${s.behind === 1 ? '' : 's'}: replaying ${waiting(s.ahead.length)} on top.`);
    rebaseOn(tmp, ORIGIN_MAIN, 'Replaying the finished features on origin/main', { mapConflicts: true });
    remakeMap(tmp);
    if (!o.noChecks) runChecks(tmp, '--push', met);
    const now = git(tmp, 'rev-parse', 'HEAD');
    try { git(tmp, 'push', 'origin', 'HEAD:main'); } catch (e) { throw refused(e); }
    if (git(main, 'branch', '--show-current') === MAIN) git(main, 'reset', '--keep', now);
    else git(main, 'update-ref', 'refs/heads/main', now, old);
    console.log(`Pushed ${waiting(s.ahead.length)} to origin/main.`);
  } finally {
    unlinkModules(tmp);
    gitQuiet(main, 'worktree', 'remove', '--force', tmp);
    rmSync(tmp, { recursive: true, force: true });
    gitQuiet(main, 'worktree', 'prune');
    ensureShortcuts();
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
  try { git(main, 'merge-base', '--is-ancestor', branch, MAIN); } catch { return ''; }
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
    console.log(`Would remove ${todo.length} finished session${todo.length === 1 ? '' : 's'}:\n${todo.map((s) => `  ${s.branch}  (${s.dir})`).join('\n')}\nRemoves nothing yet. Run: node workflow/scripts/session.mjs --clean --yes`);
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
  if (all.some((s) => !s.isMain && s.state === 'merged')) console.log('\nFinished sessions can be taken away: node workflow/scripts/session.mjs --clean');
  console.log(`\nPorts in use by sessions: ${[...ports].sort().join(', ') || 'none'} (main uses ${MAIN_PORT}, see ${basename(main)}/.env)`);
  const s = mainState(false);
  console.log(s.ahead.length ? `${waiting(s.ahead.length)} not pushed yet: node workflow/scripts/session.mjs --push` : 'No finished feature is waiting to be pushed.');
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
  else if (a === '--sync') sync();
  else if (a === '--commit-notes') commitNotes(textOf('--commit-notes'));
  else if (a === '--carry-notes' && b) carryNotes(b);
  else if (a === '--serve' && b) await serve(b, { lan: has('--lan'), copyData: has('--copy-data') });
  else if (a === '--catch-up' && b) catchUpSession(b);
  else if (a === '--push') push({ noChecks: has('--no-checks') });
  else if (a === '--merge' && b) await merge(b);
  else if (a === '--remove' && b) remove(b);
  else if (a === '--drop' && b) drop(b);
  else if (a === '--finish' && b) await finish(b, { noChecks: has('--no-checks'), keepCommits: has('--keep-commits'), partial: textOf('--partial'), subject: textOf('--subject'), body: textOf('--body') });
  else if (a === '--restack' && b) { if (!onOf(b)) console.log(`"${b}" is not built on another session.`); else if (!restack(b)) process.exit(1); }
  else if (a && !a.startsWith('--')) await make(a, valueOf('--card'), valueOf('--on'));
  else console.log('usage: node workflow/scripts/session.mjs <topic> [--card <n>[,<m>]] [--on <topic>] | --check-main | --sync | --commit-notes "<subject>" | --carry-notes <topic> | --serve <topic> [--lan] [--copy-data] | --catch-up <topic> | --restack <topic> | --finish <topic> [--subject "<approved subject>"] [--body "<why>"] [--no-checks] [--keep-commits] [--partial "<what is left>"] | --push [--no-checks] | --merge <topic> | --remove <topic> | --drop spike-<topic> | --clean [--yes] | --list');
} catch (e) {
  console.error(e.stderr?.toString().trim() || e.message);
  process.exit(1);
}
