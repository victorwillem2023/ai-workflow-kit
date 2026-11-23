// A session while it is being built: its dev server for the owner to try (--serve, also on the Wi-Fi and on a copy of the data),
// main brought into it mid-build (--catch-up), and the hand-over before the owner tries it (--handover). Built on session-core.mjs; used by workflow/scripts/session.mjs.
import '../tools/lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { startHidden } from '../tools/lib/hidden.mjs';
import { dataCopyOf, pidFileOf } from './session-stop.mjs'; import { orcaNote, orcaOpen } from './session-adopt.mjs'; import { MAIN } from '../tools/lib/branch.mjs';
import { CHECKPOINT, FIRST_PORT, PREFIX, cardOf, moveAndSay, catchUp, conflictsIn, ensurePackages, folderEnv, folderOf, git, gitQuiet, keepBoth, looseFiles, looseWork, main, mainState, mapPages, mapScript, npmRun, sessionCfg, splitConflicts, stopServer } from './session-core.mjs';

// "serve" under "session" in workflow/config.json: `lan` is what makes the app listen on every address (its own setting names),
// `data` the setting that names the data folder and where the real one is (from the main folder).
const SERVE = { device: sessionCfg.serve?.device ?? 'iPhone 12', lan: sessionCfg.serve?.lan ?? { HOST: '0.0.0.0' }, data: { env: 'DATA_DIR', from: 'data', ...(sessionCfg.serve?.data ?? {}) } };

/** This computer's address on the local network (the first private IPv4 one), or undefined. */
function lanAddress() {
  const all = Object.values(networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
  return all.find((a) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a)) ?? all[0];
}

/** The value a folder's .env gives a name, or undefined. */
const envValue = (dir, name) => {
  const f = join(dir, '.env');
  const m = existsSync(f) ? new RegExp(`^\\s*${name}\\s*=\\s*(.*?)\\s*$`, 'm').exec(readFileSync(f, 'utf8')) : null;
  return m ? m[1].replace(/^(["'])(.*)\1$/, '$2') || undefined : undefined;
};

/** Copies the real data (the folder the main folder's .env names, else `serve.data.from`) to a folder outside the session; stopping the server removes it. */
function copyData(dir) {
  const named = envValue(main, SERVE.data.env) ?? String(SERVE.data.from).split('{main}').join(main);
  const from = isAbsolute(named) ? named : resolve(main, named);
  if (!existsSync(from) || !statSync(from).isDirectory()) throw new Error(`There is no data folder to copy at ${from} (${SERVE.data.env} in the main folder's .env, else "serve": { "data": { "env": "<the setting>", "from": "<the folder>" } } under "session" in workflow/config.json).`);
  const to = dataCopyOf(dir);
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  return { from, to };
}

/**
 * Starts the session's dev server in the background (unless its port answers already) and waits until the link answers, so the
 * owner only opens it. Its output goes to a file outside the folder (a file inside would be uncommitted work), and the process is
 * recorded, so --finish and --remove stop it whatever port it took. It starts with the folder's .env deciding (folderEnv), never
 * a PORT or data folder left set in the shell. `lan`: it listens on every address, for a phone on the same Wi-Fi. `copyData`: it
 * runs on a copy of the real data. Neither is written into the folder: both end when the server is stopped.
 */
export async function serve(topic, { lan = false, copyData: withCopy = false, phone = false } = {}) {
  const dir = folderOf(topic);
  if (!existsSync(dir)) throw new Error(`${dir} is not there.`);
  const env = join(dir, '.env');
  const port = existsSync(env) ? /^PORT=(\d+)\s*$/m.exec(readFileSync(env, 'utf8'))?.[1] : undefined;
  if (!port) throw new Error(`${env} names no PORT.`);
  const url = `http://127.0.0.1:${port}`;
  const answersAt = async (u) => { try { await fetch(u, { signal: AbortSignal.timeout(2000) }); return true; } catch { return false; } };
  const answers = () => answersAt(url);
  // how to watch it while trying it: one readable line per request (workflow/scripts/logs.mjs); --ref <reference> for one request
  const watch = `  logs:   node workflow/scripts/logs.mjs ${topic} --follow   (one line per request; --ref <reference> shows one request)`;
  // asked again a few seconds later before "runs": a server that answers once and is gone (stopped by another session's finish,
  // crashed after start) is not said to run
  const stillAnswers = async () => { await new Promise((r) => setTimeout(r, Number(process.env.WORKFLOW_SERVE_RECHECK_MS ?? 3000))); return answers(); };
  const special = lan || withCopy;
  // asked to run another way than a server that is up may run: that one is stopped first
  if (special) stopServer(dir);
  else if (await answers() && await stillAnswers()) { console.log([`The dev server runs already: ${url}`, ...(phone ? [orcaOpen(dir, url, SERVE.device)].filter(Boolean) : []), watch].join('\n')); return; }
  ensurePackages('before the dev server starts');
  const scripts = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts ?? {};
  if (!scripts.dev) throw new Error(`${dir} has no "dev" script, so there is nothing to open: a change without a screen is tried with a command (.claude/skills/build/try-it.md).`);
  const extra = {};
  const said = [];
  if (withCopy) {
    const { from, to } = copyData(dir);
    extra[SERVE.data.env] = to;
    said.push(`  data:   a copy of ${from} (${SERVE.data.env}=${to}); the real data is not touched, and the copy goes when the server is stopped`);
  }
  const address = lan ? lanAddress() : undefined;
  if (lan) Object.assign(extra, SERVE.lan);
  const log = join(tmpdir(), `${PREFIX}-${topic.replace(/[^\w.-]/g, '-')}-dev.log`);
  // a shell only on Windows, where npm is a .cmd file; the arguments are fixed, never outside input. Started through
  // lib/hidden.mjs: a plain detached start opened a console window on Windows for the server and for each of its restarts
  const pid = startHidden('npm', ['run', 'dev'], { cwd: dir, log, shell: process.platform === 'win32', env: folderEnv(dir, extra) });
  if (pid) writeFileSync(pidFileOf(dir), String(pid));
  const lastLines = () => readFileSync(log, 'utf8').trim().split('\n').slice(-15).join('\n') || '(the server printed nothing)';
  for (let i = 0; i < 120; i++) {
    if (await answers()) {
      if (!(await stillAnswers())) throw new Error(`The dev server answered at ${url} and then stopped. Its last lines (${log}):\n${lastLines()}`);
      if (lan) said.push(await lanLines(address, port, answersAt));
      // with an orchestrator the link opens where the session is: its own browser tab (--phone: as a phone)
      const tab = orcaOpen(dir, url, phone ? SERVE.device : undefined);
      console.log([`The dev server runs: ${url} (--finish stops it)`, ...said, ...(tab ? [tab] : []), watch].join('\n'));
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`The dev server did not answer at ${url} within 60 seconds. Its last lines (${log}):\n${lastLines()}`);
}

/** What --lan says: the address for a phone, checked from here, and the one firewall line Windows needs. */
async function lanLines(address, port, answersAt) {
  const names = Object.entries(SERVE.lan).map(([k, v]) => `${k}=${v}`).join(' ');
  if (!address) return '  Wi-Fi:  this computer has no address on a local network, so there is nothing to open from a phone';
  if (!(await answersAt(`http://${address}:${port}`))) return `  Wi-Fi:  http://${address}:${port} does not answer: the app does not listen on every address with ${names}. Name the setting that does: "serve": { "lan": { "<NAME>": "<value>" } } under "session" in workflow/config.json`;
  const lines = [`  Wi-Fi:  http://${address}:${port}   (open it on a phone on the same network; every device on it can, until the server is stopped)`];
  if (process.platform === 'win32') lines.push(`  if the phone gets no answer, Windows blocks it. Once, in a terminal run as administrator:\n          netsh advfirewall firewall add rule name="${PREFIX} sessions" dir=in action=allow protocol=TCP localport=${FIRST_PORT}-${FIRST_PORT + 211} profile=private`);
  return lines.join('\n');
}

const MARKS = /^(<<<<<<<|>>>>>>>)( |$)/m;

/**
 * --catch-up <topic>: brings main into a session while it is being built (main has a fix the build or its review needs), without
 * the owner's "done". No commit of its own yet: a fast-forward. Commits of its own: main is merged in (one merge commit, which
 * --finish squashes away with the rest). Loose work stays loose (no stash: that breaks after a `git add -N`), unless main changed
 * the same files: then it is saved first as a checkpoint commit on the session's own branch (as --on does; nothing reaches main,
 * and --finish puts it under the approved subject). A clash in what a script writes is settled here: the map's pages are made
 * again, sign-off rows of both sides are kept. A clash in other files is left open in the folder, named, to settle where the
 * work is; the same command then goes on. So a clash comes out mid-build, not at --finish.
 */
export function catchUpSession(topic, { again } = {}) {
  const dir = folderOf(topic);
  if (!existsSync(dir)) throw new Error(`${dir} is not there.`);
  if (gitQuiet(dir, 'branch', '--show-current') !== topic) throw new Error(`${dir} is not on branch "${topic}".`);
  const step = (...args) => execFileSync('git', args, { cwd: dir, env: { ...process.env, GIT_EDITOR: 'true' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const why = (e) => (e.stderr?.toString() ?? '').trim().split('\n').filter(Boolean).slice(0, 4).join(' | ');
  const merging = () => Boolean(gitQuiet(dir, 'rev-parse', '--verify', '--quiet', 'MERGE_HEAD'));
  const own = () => Number(git(dir, 'rev-list', '--count', `${MAIN}..HEAD`));
  let came = 'the clash is settled';
  let saved = false;
  if (!merging()) {
    catchUp(mainState(false));
    const behind = Number(git(dir, 'rev-list', '--count', `HEAD..${MAIN}`));
    if (!behind) { console.log(`Session "${topic}" is on main already.`); return; }
    came = `${behind} commit${behind === 1 ? '' : 's'} from main came in`;
    const merge = () => { try { step('merge', own() ? '--no-edit' : '--ff-only', MAIN); return null; } catch (e) { return e; } };
    let failed = merge();
    if (failed && !merging() && looseWork(dir)) {
      // git starts no merge over loose work main also changed: that work is saved on the session's own branch, then main comes in
      git(dir, 'add', '-A', '--', ...looseFiles(dir));
      git(dir, 'commit', '-q', '-m', `${CHECKPOINT} ${topic}: work in progress, saved to bring main in`);
      saved = true;
      failed = merge();
    }
    if (failed && !merging()) throw new Error(`Main could not come into "${topic}" (${why(failed)}).${saved ? ' Its work in progress is saved as a checkpoint on its own branch.' : ' Nothing was changed.'}`);
  }
  const merged = own() > 0;
  if (merging()) {
    const found = conflictsIn(dir);
    const clash = splitConflicts(dir, found.map((c) => c.file));
    // settled by hand already: both sides changed the text and no marker is left; a file one side deleted is always a choice
    const open = found.filter((c) => clash.rest.includes(c.file) && (!/^(UU|AA)$/.test(c.code) || !existsSync(join(dir, c.file)) || MARKS.test(readFileSync(join(dir, c.file), 'utf8'))));
    if (open.length) {
      const gone = open.filter((c) => !/^(UU|AA)$/.test(c.code)).map((c) => c.file);
      throw new Error(`Main and "${topic}" change the same lines (${open.map((c) => c.file).join(', ')}).${saved ? ' The work in progress is saved as a checkpoint on the session\'s own branch.' : ''} The merge is left open in ${dir}: settle ${open.length === 1 ? 'that file' : 'those files'} there (keep what both sides need, take out the <<<<<<< ======= >>>>>>> lines${gone.length ? `; ${gone.join(', ')} was deleted on one side: git add it to keep it, git rm it to drop it` : ''}), then run ${again ?? `--catch-up ${topic}`} again: it goes on from there. To go back instead: cd "${dir}" && git merge --abort`);
    }
    for (const f of clash.rows) keepBoth(dir, f);
    if (clash.rest.length) step('add', '--', ...clash.rest);
    if (clash.pages.length) { npmRun(dir, 'map', true); step('add', '--', ...mapPages(dir).filter((p) => existsSync(join(dir, p)))); }
    step('commit', '-q', '--no-edit');
  }
  console.log(`Session "${topic}" is on main again: ${came}${merged ? ' (as one merge, which --finish squashes away)' : ''}. ${saved ? 'Its work in progress is saved as a checkpoint commit on its own branch (not on main; --finish puts it under the approved subject).' : 'Work in progress is as it was.'}`);
}

/** Before the owner tries it: main comes in (a clash is left open to settle, then the same command goes on), and the cards wait for the check. */
export async function handover(topic) {
  if (!existsSync(folderOf(topic))) throw new Error(`${folderOf(topic)} is not there.`);
  catchUpSession(topic, { again: `--handover ${topic}` });
  const card = cardOf(topic);
  orcaNote(folderOf(topic), 'in-review', 'built: ready for your check');
  if (card) await moveAndSay(card, 'Waiting for your check', `Built in session "${topic}": ready for your check`);
  else console.log(`No card is kept with "${topic}" (started without --card): move it to "Waiting for your check" by hand.`);
}
