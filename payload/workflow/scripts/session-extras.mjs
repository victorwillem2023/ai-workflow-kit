// What workflow/scripts/session.mjs gained after its first version: the main folder's own notes (--check-main, --commit-notes, --sync),
// a session's dev server (--serve), and sessions built on another one (--on, --restack). Built on session-core.mjs.
import '../tools/lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync } from 'node:child_process';
import { startHidden } from '../tools/lib/hidden.mjs';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { git, gitQuiet, here, main, PREFIX, folderOf, mainState, waiting, looseMessage, catchUp, isAncestor, looseWork, mapScript, mapPages, ensurePackages, npmRun, rebaseOn, gh } from './session-core.mjs'; import { MAIN, ORIGIN_MAIN } from '../tools/lib/branch.mjs';

/**
 * Docs and settings left in the main folder (by /docs, /lesson, /shape or the owner's own edits): any .md file, everything under
 * docs/ (the app map too), the workflow config, the Renovate policy and the agent's settings (notes.mjs). They are the owner's,
 * not a feature's, and go in as their own commit (--commit-notes).
 */
export { NOTE } from './notes.mjs';
import { NOTE } from './notes.mjs';

// untrimmed: a porcelain line can start with a space (" M file"), which git()'s trim would take off the first one
export const looseFiles = () => execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: main, encoding: 'utf8' }).split('\n').filter(Boolean)
  .map((l) => l.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, '')).filter((f) => !/^node_modules\/?$/.test(f));

export const notesMessage = (files) => `The main folder has docs and settings that are not committed yet (yours, not a feature's):\n${files.join('\n')}\n` +
  'Commit them as their own commit first: node workflow/scripts/session.mjs --commit-notes "<Area: what changed>" (it runs the quick gate on them).';

/**
 * Brings the main folder level with origin when nothing is in the way (/next and /work run it first), so what merged on GitHub
 * (an update Renovate merged by itself, a feature from elsewhere) is here without a command; then the packages it brought. Only a
 * fast-forward: uncommitted files or unpushed features with new commits on origin leave it as it is, said in one line.
 */
export function sync() {
  const s = mainState(false);
  if (s.loose.length) console.log(`main is not brought up to date: the main folder has ${s.loose.length} uncommitted file${s.loose.length === 1 ? '' : 's'} (they stay as they are).`);
  else if (s.behind && s.ahead.length) console.log(`main is not brought up to date: it has ${waiting(s.ahead.length)} not pushed and origin moved too (node workflow/scripts/session.mjs --push replays them on top).`);
  else if (s.behind) catchUp(s);
  ensurePackages('after bringing main up to date');
}

/** The check /ship runs first: a main that is only behind origin is fast-forwarded; finished features that are not pushed are fine. */
export function checkMain() {
  const s = mainState(true);
  if (s.behind && s.ahead.length) catchUp(s);
  if (s.loose.length) { const files = looseFiles(); throw new Error(files.length && files.every((f) => NOTE.test(f)) ? notesMessage(files) : looseMessage(s.loose)); }
  catchUp(s);
  if (s.ahead.length) console.log(`main has ${waiting(s.ahead.length)} not pushed yet (node workflow/scripts/session.mjs --push sends them).`);
  else if (!s.behind) console.log('main is clean and level with origin/main.');
}

/**
 * Commits the docs and settings left in the main folder as ONE commit of their own, after the quick gate passes on them (a hand edit
 * that breaks a check is caught here, not by the next feature). Refuses when code is among them: that belongs in a session.
 */
export function commitNotes(subject) {
  if (!subject) throw new Error('Say what the commit is: node workflow/scripts/session.mjs --commit-notes "Docs: what changed"');
  if (git(main, 'branch', '--show-current') !== MAIN) throw new Error('The main folder is not on main.');
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
export async function serve(topic) {
  const dir = folderOf(topic);
  if (!existsSync(dir)) throw new Error(`${dir} is not there.`);
  const env = join(dir, '.env');
  const port = existsSync(env) ? /^PORT=(\d+)\s*$/m.exec(readFileSync(env, 'utf8'))?.[1] : undefined;
  if (!port) throw new Error(`${env} names no PORT.`);
  const url = `http://127.0.0.1:${port}`;
  const answers = async () => { try { await fetch(url, { signal: AbortSignal.timeout(2000) }); return true; } catch { return false; } };
  // how to watch it while trying it: one readable line per request (workflow/scripts/logs.mjs); --ref <reference> for one request
  const watch = `  logs:   node workflow/scripts/logs.mjs ${topic} --follow   (one line per request; --ref <reference> shows one request)`;
  // asked again a few seconds later before "runs": a server that answers once and is gone (stopped by another session's finish,
  // crashed after start) is not said to run
  const stillAnswers = async () => { await new Promise((r) => setTimeout(r, Number(process.env.WORKFLOW_SERVE_RECHECK_MS ?? 3000))); return answers(); };
  if (await answers() && await stillAnswers()) { console.log(`The dev server runs already: ${url}\n${watch}`); return; }
  ensurePackages('before the dev server starts');
  const scripts = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts ?? {};
  if (!scripts.dev) throw new Error(`${dir} has no "dev" script, so there is nothing to open: a change without a screen is tried with a command (.claude/skills/build/try-it.md).`);
  const log = join(tmpdir(), `${PREFIX}-${topic}-dev.log`);
  // a shell only on Windows, where npm is a .cmd file; the arguments are fixed, never outside input. Started through
  // lib/hidden.mjs: a plain detached start opened a console window on Windows for the server and for each of its restarts
  startHidden('npm', ['run', 'dev'], { cwd: dir, log, shell: process.platform === 'win32' });
  for (let i = 0; i < 120; i++) {
    if (await answers()) {
      if (await stillAnswers()) { console.log(`The dev server runs: ${url} (--finish stops it)\n${watch}`); return; }
      const last = readFileSync(log, 'utf8').trim().split('\n').slice(-15).join('\n');
      throw new Error(`The dev server answered at ${url} and then stopped. Its last lines (${log}):\n${last}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const last = readFileSync(log, 'utf8').trim().split('\n').slice(-15).join('\n');
  throw new Error(`The dev server did not answer at ${url} within 60 seconds. Its last lines (${log}):\n${last}`);
}

/**
 * --catch-up <topic>: brings a session onto main while it is being built (main has a fix the build or its review needs), without
 * the owner's "done": nothing of the session's own work is committed. Its loose work stays as it is (no stash: that breaks after
 * a `git add -N`). No commit of its own yet: a fast-forward. Commits of its own: main is merged in (one merge commit, which
 * --finish squashes away with the rest). A conflict only in the map's pages is settled by making the map again (only those pages
 * are staged); any other conflict, or loose work main would overwrite, stops it with nothing changed.
 */
export function catchUpSession(topic) {
  const dir = folderOf(topic);
  if (!existsSync(dir)) throw new Error(`${dir} is not there.`);
  if (gitQuiet(dir, 'branch', '--show-current') !== topic) throw new Error(`${dir} is not on branch "${topic}".`);
  catchUp(mainState(false));
  const behind = Number(git(dir, 'rev-list', '--count', `HEAD..${MAIN}`));
  if (!behind) { console.log(`Session "${topic}" is on main already.`); return; }
  const own = Number(git(dir, 'rev-list', '--count', `${MAIN}..HEAD`));
  const step = (...args) => execFileSync('git', args, { cwd: dir, env: { ...process.env, GIT_EDITOR: 'true' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const why = (e) => (e.stderr?.toString() ?? '').trim().split('\n').filter(Boolean).slice(0, 4).join(' | ');
  try {
    step('merge', own ? '--no-edit' : '--ff-only', MAIN);
  } catch (e) {
    const files = gitQuiet(dir, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
    const pages = mapPages(dir);
    if (!files.length) throw new Error(`Main could not come into "${topic}" (${why(e)}). Nothing was changed.`);
    if (!(mapScript(dir) && files.every((f) => pages.includes(f)))) {
      try { step('merge', '--abort'); } catch { /* nothing to abort */ }
      throw new Error(`Main and "${topic}" change the same lines (${files.join(', ')}). Nothing was changed: it is settled at --finish, or by hand in ${dir}.`);
    }
    npmRun(dir, 'map', true);
    step('add', '--', ...pages.filter((p) => existsSync(join(dir, p))));
    step('commit', '-q', '--no-edit');
  }
  console.log(`Session "${topic}" is on main again: ${behind} commit${behind === 1 ? '' : 's'} from main came in${own ? ' (as one merge, which --finish squashes away)' : ''}. Work in progress is as it was.`);
}

/**
 * Stacked sessions: a session made with --on <base> starts from the base session's branch, so a card can be built on one that is
 * built but not finished (waiting for the owner's check). The base is kept with the branch (branch.<topic>.kitOn); when the base
 * is finished, --finish moves every session on it onto main (git rebase --onto main <where it forked>), and only then is the
 * stacked one finished in its turn. The fork point is kept too (kitFork), so a move that could not happen yet can be done later.
 */
export const onOf = (topic) => gitQuiet(main, 'config', '--get', `branch.${topic}.kitOn`);

export const branchExists = (name) => Boolean(gitQuiet(main, 'rev-parse', '--verify', '--quiet', `refs/heads/${name}`));

export const stackedOn = (base) => gitQuiet(main, 'config', '--get-regexp', '^branch\\..*\\.kiton$').split('\n').filter(Boolean)
  .map((l) => /^branch\.(.+)\.kiton (.+)$/i.exec(l)).filter((m) => m && m[2] === base).map((m) => m[1]);

export const forget = (topic) => { gitQuiet(main, 'config', '--unset', `branch.${topic}.kitOn`); gitQuiet(main, 'config', '--unset', `branch.${topic}.kitFork`); };

/**
 * Moves a session that was built on another one onto main, once that other one is finished. `oldTip` is the base's last commit
 * before its finish squashed it (the fork point is worked out from it and kept); without it, the kept fork point is used.
 * Returns false when it could not move now (uncommitted work, or a conflict), with what to do said; it never loses work.
 */
export function restack(topic, oldTip) {
  const dir = folderOf(topic);
  const base = onOf(topic);
  const fork = oldTip ? git(main, 'merge-base', topic, oldTip) : gitQuiet(main, 'config', '--get', `branch.${topic}.kitFork`);
  if (!fork) throw new Error(`"${topic}" does not say where it left "${base}". Move it by hand: cd "${dir}" && git rebase --onto main <the last commit of ${base} it has>`);
  git(main, 'config', `branch.${topic}.kitFork`, fork);
  // moved already (by hand after a conflict, or an earlier run): nothing left to do
  if (existsSync(dir) && isAncestor(dir, MAIN, 'HEAD')) { forget(topic); return true; }
  if (!existsSync(dir) || looseWork(dir)) {
    console.log(`"${topic}" was built on "${base}" and still sits on it: commit its work, then run node workflow/scripts/session.mjs --restack ${topic}`);
    return false;
  }
  try { rebaseOn(dir, MAIN, `Moving "${topic}" onto main`, { mapConflicts: true, from: fork }); }
  catch (e) { console.log(`${e.message}\nWhen that is solved: node workflow/scripts/session.mjs --restack ${topic}`); return false; }
  forget(topic);
  console.log(`"${topic}" was built on "${base}" and now sits on main.`);
  return true;
}

/**
 * For a project whose notes go in with the feature (`commits.notes: "with-feature"` in workflow/config.json, a project that allows
 * no commit of docs alone): the docs and settings left in the main folder move into the session folder, at the same paths, and the
 * main folder is put back as it was, so they are part of the feature's one commit. Code among them is refused, and so is a file
 * the session changed itself (it would be overwritten).
 */
export function carryNotes(topic) {
  const dir = folderOf(topic);
  if (!existsSync(dir)) throw new Error(`${dir} is not there.`);
  if (git(main, 'branch', '--show-current') !== MAIN) throw new Error('The main folder is not on main.');
  const status = execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: main, encoding: 'utf8' }).split('\n').filter(Boolean)
    .map((l) => ({ code: l.slice(0, 2), file: l.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, '') })).filter((x) => !/^node_modules\/?$/.test(x.file));
  if (!status.length) { console.log('The main folder has no notes to carry.'); return; }
  const code = status.filter((x) => !NOTE.test(x.file)).map((x) => x.file);
  if (code.length) throw new Error(`Only docs and settings are carried; these are not:\n${code.join('\n')}\nMove them to a session (or ask the owner).`);
  const clash = status.filter((x) => git(dir, 'status', '--porcelain', '--', x.file)).map((x) => x.file);
  if (clash.length) throw new Error(`The session changed these too, so carrying the main folder's would overwrite them:\n${clash.join('\n')}\nMerge them by hand first.`);
  for (const { code: c, file } of status) {
    const from = join(main, file), to = join(dir, file);
    if (existsSync(from)) { mkdirSync(dirname(to), { recursive: true }); copyFileSync(from, to); } else rmSync(to, { force: true });
    // the main folder as it was: a changed or deleted file back from git, a new one taken away
    if (c === '??') rmSync(from, { force: true }); else git(main, 'checkout', '--', file);
  }
  console.log(`Carried ${status.length} note${status.length === 1 ? '' : 's'} into ../${basename(dir)}: they go in with the feature's commit (commits.notes: with-feature).`);
}
