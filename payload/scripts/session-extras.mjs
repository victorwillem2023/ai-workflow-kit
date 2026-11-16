// What scripts/session.mjs gained after its first version: the main folder's own notes (--check-main, --commit-notes, --sync),
// a session's dev server (--serve), and sessions built on another one (--on, --restack). Built on session-core.mjs.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, gitQuiet, here, main, PREFIX, folderOf, mainState, waiting, looseMessage, catchUp, isAncestor, looseWork, mapScript, ensurePackages, npmRun, rebaseOn, gh } from './session-core.mjs';

/**
 * Docs and settings left in the main folder (by /docs, /lesson, /shape or the owner's own edits): any .md file, the workflow config,
 * the Renovate policy and the agent's settings. They are the owner's, not a feature's, and go in as their own commit (--commit-notes).
 */
export const NOTE = /(\.md$|^workflow\.config\.json$|^renovate\.json$|^\.claude\/|^\.opencode\/)/i;

// untrimmed: a porcelain line can start with a space (" M file"), which git()'s trim would take off the first one
export const looseFiles = () => execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: main, encoding: 'utf8' }).split('\n').filter(Boolean)
  .map((l) => l.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, '')).filter((f) => !/^node_modules\/?$/.test(f));

export const notesMessage = (files) => `The main folder has docs and settings that are not committed yet (yours, not a feature's):\n${files.join('\n')}\n` +
  'Commit them as their own commit first: node scripts/session.mjs --commit-notes "<Area: what changed>" (it runs the quick gate on them).';

/**
 * Brings the main folder level with origin when nothing is in the way (/next and /work run it first), so what merged on GitHub
 * (an update Renovate merged by itself, a feature from elsewhere) is here without a command; then the packages it brought. Only a
 * fast-forward: uncommitted files or unpushed features with new commits on origin leave it as it is, said in one line.
 */
export function sync() {
  const s = mainState(false);
  if (s.loose.length) console.log(`main is not brought up to date: the main folder has ${s.loose.length} uncommitted file${s.loose.length === 1 ? '' : 's'} (they stay as they are).`);
  else if (s.behind && s.ahead.length) console.log(`main is not brought up to date: it has ${waiting(s.ahead.length)} not pushed and origin moved too (node scripts/session.mjs --push replays them on top).`);
  else if (s.behind) catchUp(s);
  ensurePackages('after bringing main up to date');
}

/** The check /ship runs first: a main that is only behind origin is fast-forwarded; finished features that are not pushed are fine. */
export function checkMain() {
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
export function commitNotes(subject) {
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
export async function serve(topic) {
  const dir = folderOf(topic);
  if (!existsSync(dir)) throw new Error(`${dir} is not there.`);
  const env = join(dir, '.env');
  const port = existsSync(env) ? /^PORT=(\d+)\s*$/m.exec(readFileSync(env, 'utf8'))?.[1] : undefined;
  if (!port) throw new Error(`${env} names no PORT.`);
  const url = `http://127.0.0.1:${port}`;
  const answers = async () => { try { await fetch(url, { signal: AbortSignal.timeout(2000) }); return true; } catch { return false; } };
  // how to watch it while trying it: one readable line per request (scripts/logs.mjs); --ref <reference> for one request
  const watch = `  logs:   node scripts/logs.mjs ${topic} --follow   (one line per request; --ref <reference> shows one request)`;
  if (await answers()) { console.log(`The dev server runs already: ${url}\n${watch}`); return; }
  ensurePackages('before the dev server starts');
  const scripts = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts ?? {};
  if (!scripts.dev) throw new Error(`${dir} has no "dev" script, so there is nothing to open: a change without a screen is tried with a command (.claude/skills/build/try-it.md).`);
  const log = join(tmpdir(), `${PREFIX}-${topic}-dev.log`);
  const out = openSync(log, 'w');
  // a shell only on Windows, where npm is a .cmd file; the arguments are fixed, never outside input
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  spawn('npm', ['run', 'dev'], { cwd: dir, detached: true, stdio: ['ignore', out, out], shell: process.platform === 'win32', windowsHide: true }).unref();
  for (let i = 0; i < 120; i++) {
    if (await answers()) { console.log(`The dev server runs: ${url} (--finish stops it)\n${watch}`); return; }
    await new Promise((r) => setTimeout(r, 500));
  }
  const last = readFileSync(log, 'utf8').trim().split('\n').slice(-15).join('\n');
  throw new Error(`The dev server did not answer at ${url} within 60 seconds. Its last lines (${log}):\n${last}`);
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
