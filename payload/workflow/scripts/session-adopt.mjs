// Sessions in folders the kit did not make: an orchestrator (Orca) owns the worktrees, the terminals and the agents in them, and
// the kit keeps what no orchestrator does: the port, the packages, the spec, the card, one commit when the owner says done.
//   node workflow/scripts/session.mjs --adopt [--card 42]   in a worktree someone else made (an orchestrator's setup script, `git worktree add`,
//                                               `claude --worktree`): it becomes a session where it is, named after its branch: its own
//                                               PORT in .env, node_modules linked to the main folder's, the waiting spec, the card moved.
//                                               Running it twice changes nothing; in the main folder it does nothing
//   node workflow/scripts/session.mjs --release             before an orchestrator deletes the folder (its archive script): stops the session's dev
//                                               server and unlinks node_modules, so the delete never follows the link into the main folder's
//   node workflow/scripts/session.mjs --serve <topic> [--phone]  with Orca the link opens in the session's own browser tab (--phone: as the phone
//                                               "serve": { "device": "<name>" } names, an iPhone 12 without one); the card is a link on the session
//   node workflow/scripts/session.mjs --connect orca        once per project: "orchestrator": "orca" in workflow/config.json, the project added to
//                                               Orca, the sessions that exist shown there with their cards
// With "orchestrator": "orca" under "session" in workflow/config.json a new session is made by Orca (its own folder and terminal,
// seen in its sidebar and on the phone) and its state follows the card (in progress, in review). Orca that cannot be reached is one
// warning line, never a stop: the folder is then made next to the main one, as without an orchestrator. ORCA: not yet tried in a real project.
// WORKFLOW_ORCA (tests): a node script that stands in for the orca command.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { git, gitQuiet, main, sessionCfg, worktrees, sameDir, FIRST_PORT, SESSION_ENV, usedPorts, free, warmTypecheck, bringSpec, cardOf, moveAndSay, stopServer } from './session-core.mjs';
import { unlinkModules } from './session-stop.mjs'; import { MAIN } from '../tools/lib/branch.mjs'; import { noteSessionFolder } from '../tools/lib/sessionfiles.mjs';

/** Who makes the session folders and runs the agents in them: 'orca', or '' (the kit itself, in folders next to the main one). */
export const ORCHESTRATOR = String(sessionCfg.orchestrator ?? '').toLowerCase() === 'orca' ? 'orca' : '';
/** The command a started agent runs in its terminal ("agent" under "session"): the Claude CLI itself, so its flags and modes are the owner's. */
export const AGENT = sessionCfg.agent ?? 'claude';
const MARK = '# set by workflow/scripts/session.mjs for this session';

/** The folder's own PORT when the kit set it (its mark is in the .env), else undefined. */
const keptPort = (dir) => {
  const env = join(dir, '.env');
  if (!existsSync(env)) return undefined;
  const text = readFileSync(env, 'utf8');
  return text.includes(MARK) ? /^PORT=(\d+)\s*$/m.exec(text)?.[1] : undefined;
};

/**
 * What makes a worktree a session, whoever made the folder: the main folder's packages (a link), TypeScript's notes, the waiting
 * spec, and a .env of its own (the main folder's keys, its own PORT, the "session.env" lines). A folder that has them keeps them.
 */
export async function prepare(dir, topic) {
  const had = keptPort(dir);
  let exists = true;
  try { lstatSync(join(dir, 'node_modules')); } catch { exists = false; }
  if (!exists && existsSync(join(main, 'node_modules'))) symlinkSync(join(main, 'node_modules'), join(dir, 'node_modules'), 'junction');
  warmTypecheck(dir);
  bringSpec(dir, topic);
  if (!sameDir(dirname(dir), dirname(main))) noteSessionFolder(main, dir); // for the cost report (lib/sessionfiles.mjs)
  if (had) return Number(had);
  const taken = usedPorts();
  let port = FIRST_PORT;
  while (taken.has(port) || !(await free(port))) port++;
  const env = join(dir, '.env');
  // the copy keeps the keys but not main's own PORT or the session.env names: a second line would be ambiguous. An .env an
  // orchestrator copied in is the main folder's too, so it is written again from there
  const own = new RegExp(`^\\s*(${['PORT', ...Object.keys(SESSION_ENV)].join('|')})\\s*=`);
  const from = existsSync(join(main, '.env')) ? join(main, '.env') : existsSync(env) ? env : null;
  writeFileSync(env, from ? readFileSync(from, 'utf8').split(/\r?\n/).filter((l) => !own.test(l)).join('\n') : '');
  const extra = Object.entries(SESSION_ENV).map(([k, v]) => `${k}=${String(v).split('{main}').join(main)}`).join('\n');
  appendFileSync(env, `\n${MARK}\nPORT=${port}\n${extra}${extra ? '\n' : ''}`);
  return port;
}

/** The worktree a command was run in: the orchestrator's own name for it when it gives one, else the folder git says this is. */
function hereDir() {
  const named = process.env.ORCA_WORKTREE_PATH;
  if (named && existsSync(named)) return resolve(named);
  const top = gitQuiet(process.cwd(), 'rev-parse', '--show-toplevel');
  if (!top) throw new Error('This folder is not in a git repository.');
  return resolve(top);
}

/** A worktree someone else made becomes a session where it is (see the top of this file). */
export async function adopt(card) {
  if (card !== undefined && !/^[1-9][0-9]*(,[1-9][0-9]*)*$/.test(card)) throw new Error('--card takes the number of a board card, like --card 42 (or --card 12,14 for cards built as one).');
  const dir = hereDir();
  if (sameDir(dir, main)) { console.log('This is the main folder: nothing to adopt (a session is a worktree of its own).'); return; }
  const topic = gitQuiet(dir, 'branch', '--show-current');
  if (!topic) throw new Error(`${dir} is on no branch (a detached HEAD). Give it one first: git switch -c <topic>`);
  if (topic === MAIN) throw new Error(`${dir} has main checked out. A session has a branch of its own: git switch -c <topic>`);
  const fresh = !keptPort(dir);
  const port = await prepare(dir, topic);
  const before = cardOf(topic);
  if (card !== undefined && card !== before) {
    git(main, 'config', `branch.${topic}.card`, card);
    await moveAndSay(card, 'In progress', `Session "${topic}" started: folder ${dir}`);
  }
  const cards = card ?? before;
  orcaNote(dir, 'in-progress', sessionNote(cards, port));
  if (card !== undefined && card !== before) orcaCards(dir, card);
  console.log(`Session "${topic}" ${fresh ? 'is ready' : 'was ready already'}.\n  folder: ${dir}\n  branch: ${topic}${cards ? `\n  card:   #${String(cards).split(',').join(', #')}` : ''}\n  port:   ${port} (only for a change with a screen: node workflow/scripts/session.mjs --serve ${topic} starts it)`);
}

/** Before the folder is deleted by someone else: nothing of the main folder's goes with it. Never a failure: a delete is not held up by it. */
export function release() {
  try {
    const dir = hereDir();
    if (sameDir(dir, main)) return;
    stopServer(dir);
    unlinkModules(dir);
    console.log(`Session folder ${dir} is let go: its dev server is stopped and node_modules is unlinked.`);
  } catch (e) { console.log(`Release warning: ${(e.message ?? String(e)).split('\n')[0]}`); }
}

export const sessionNote = (cards, port) => [cards ? `card #${String(cards).split(',').join(', #')}` : '', port ? `port ${port}` : ''].filter(Boolean).join(' · ');

// ---- Orca (https://orca.dev): its command line, as its own guide for agents gives it (skill-guides/orca-cli.md) ----
let orcaDown = false;
let active = ORCHESTRATOR === 'orca'; // --connect orca switches it on for its own run, before the setting is read again
const quoted = (a) => (/^[\w@%+=:,./\\-]+$/.test(a) ? a : `"${String(a).replace(/"/g, '\\"')}"`);

/** Runs orca with `args`: spawnSync's result. On Windows the command may be a .cmd file, which needs a shell (the arguments are quoted). */
export function orcaRun(args, { timeout = 30000 } = {}) {
  const custom = process.env.WORKFLOW_ORCA;
  const opts = { encoding: 'utf8', windowsHide: true, maxBuffer: 16 << 20, timeout };
  if (custom) return spawnSync(process.execPath, [custom, ...args], opts);
  const res = spawnSync('orca', args, opts);
  if (res.error?.code !== 'ENOENT' || process.platform !== 'win32') return res;
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  return spawnSync(['orca', ...args.map(quoted)].join(' '), { ...opts, shell: true });
}

/** orca's answer as JSON, or null with the reason in `why` (not installed, not running, refused). After one failure it is not asked again. */
function orca(args, why = {}, { extra = false } = {}) {
  if (orcaDown) return null;
  const r = orcaRun([...args, '--json']);
  if (r.error || r.status !== 0) {
    // an extra (a browser tab, a link to the card) that is refused is only left out: Orca is still asked the rest
    if (!extra || r.error) orcaDown = true;
    why.said = r.error?.code === 'ENOENT' ? 'the orca command is not found (install it from Orca\'s settings)' : (r.stderr || r.stdout || r.error?.message || 'no answer').trim().split('\n')[0];
    return null;
  }
  try { return JSON.parse(r.stdout || '{}'); } catch { return {}; }
}

/** Every object in a JSON answer, however deep (the shape of orca's answers is its own: only an id next to this project's path is read). */
function* objectsIn(x, depth = 0) {
  if (!x || typeof x !== 'object' || depth > 8) return;
  if (!Array.isArray(x)) yield x;
  for (const v of Object.values(x)) yield* objectsIn(v, depth + 1);
}
const samePath = (a, b) => typeof a === 'string' && resolve(a).replace(/\\/g, '/').toLowerCase() === resolve(b).replace(/\\/g, '/').toLowerCase();

/** This project's id in Orca (`--repo id:<it>`), added to Orca when it is not there yet; null when Orca cannot say. */
export function orcaRepo(why = {}) {
  const find = () => {
    for (const o of objectsIn(orca(['repo', 'list'], why))) if (o.id && Object.values(o).some((v) => samePath(v, main))) return String(o.id);
    return null;
  };
  const id = find();
  if (id || orcaDown) return id;
  orca(['repo', 'add', '--path', main], why);
  return find();
}

/** The session's state in Orca's sidebar (todo, in-progress, in-review, completed) and a short note; said nowhere when Orca is not there. */
export function orcaNote(dir, status, comment) {
  if (!active) return;
  orca(['worktree', 'set', '--worktree', `path:${dir}`, '--workspace-status', status, ...(comment ? ['--comment', comment] : [])], {}, { extra: true });
}

/** The board's cards as links on the session in Orca (its sidebar opens the issue): the board's repo in workflow/config.json says where they are. */
export function orcaCards(dir, cards) {
  if (!active || !cards) return;
  let board;
  try { board = JSON.parse(readFileSync(join(main, 'workflow/config.json'), 'utf8')).board; } catch { return; }
  if (!board?.owner || !board?.repo) return;
  for (const n of String(cards).split(',').filter(Boolean)) orca(['reference', 'add', `https://github.com/${board.owner}/${board.repo}/issues/${n}`, '--worktree', `path:${dir}`], {}, { extra: true });
}

/**
 * The session's link in its own browser tab in Orca, so the owner tries it where the session is (and clicks an element there to
 * send it to the agent: Orca's Design Mode); `device`: the tab as that phone. The line to say, or '' when Orca did not open it.
 */
export function orcaOpen(dir, url, device) {
  if (!active || !orca(['tab', 'create', '--url', url, '--worktree', `path:${dir}`], {}, { extra: true })) return '';
  const phone = device && orca(['set', 'device', '--name', device, '--worktree', `path:${dir}`], {}, { extra: true });
  return `  Orca:   open in the session's own browser tab${phone ? `, as ${device}` : ''} (Annotate there sends a clicked element to the agent)`;
}

/**
 * A new session's folder, made by Orca on a branch named `topic` from `from`: its path, or null (with one warning line) when Orca
 * could not, so the caller makes the folder itself. The folder is found as the one git lists that was not there before.
 */
export function orcaCreate(topic, from) {
  if (!active) return null;
  const why = {};
  const warn = (said) => { console.log(`Orca warning: ${said}. The folder is made next to the main one instead (Orca shows it once the project's non-Orca worktrees are shown: node workflow/scripts/session.mjs --connect orca).`); return null; };
  const repo = orcaRepo(why);
  if (orcaDown) return warn(why.said);
  const before = worktrees().map((w) => w.dir);
  const made = orca(['worktree', 'create', '--name', topic, ...(repo ? ['--repo', `id:${repo}`] : []), '--base-branch', from, '--setup', 'skip'], why);
  if (!made) return warn(why.said);
  const fresh = worktrees().find((w) => !before.some((d) => sameDir(d, w.dir)));
  if (!fresh) return warn('it made no worktree git can see');
  // the kit's names: the branch is the topic, and it starts where the local main (or the session it is built on) is now,
  // finished features that are not pushed included; a folder this new holds no work that could be lost
  if (fresh.branch !== topic) git(fresh.dir, fresh.branch ? 'branch' : 'switch', fresh.branch ? '-m' : '-c', topic);
  if (git(fresh.dir, 'rev-parse', 'HEAD') !== git(main, 'rev-parse', from)) git(fresh.dir, 'reset', '-q', '--hard', from);
  gitQuiet(fresh.dir, 'branch', '--unset-upstream');
  return fresh.dir;
}

/** The agent in a terminal of its own in the session's folder (the Claude CLI with `prompt`, as typed); else the line to type by hand. */
export function startAgent(dir, topic, prompt) {
  const command = `${AGENT} ${quoted(prompt)}`;
  const why = {};
  const made = active ? orca(['terminal', 'create', '--worktree', `path:${dir}`, '--title', topic, '--command', command], why) : null;
  console.log(made ? `  agent:  started in Orca, in a terminal of its own: ${command}` : `  agent:  ${why.said ? `Orca did not start it (${why.said}). ` : ''}Open a terminal in ${dir} and run: ${command}`);
}

/** Sets "orchestrator" under "session" in the config's text; null when it is there already or the text has no "session" block. */
export function withOrchestrator(text, name) {
  const has = /("session"\s*:\s*\{[^}]*?"orchestrator"\s*:\s*")([^"]*)(")/s.exec(text);
  if (has) return has[2] === name ? null : text.replace(has[0], `${has[1]}${name}${has[3]}`);
  const at = /"session"\s*:\s*\{(\r?\n)?(\s*)/.exec(text);
  return at ? text.replace(at[0], `${at[0]}"orchestrator": "${name}",${at[1] ?? ' '}${at[2]}`) : null;
}

/** Once per project: the setting, the project in Orca with its other worktrees shown, and each session's card and port in the sidebar. */
export function connect(name) {
  if (name !== 'orca') throw new Error('--connect takes the orchestrator: --connect orca (the one the kit knows; any other tool that makes git worktrees works with --adopt in its setup script).');
  const at = join(main, 'workflow/config.json');
  const now = existsSync(at) ? withOrchestrator(readFileSync(at, 'utf8'), 'orca') : null;
  if (now) { writeFileSync(at, now); console.log('workflow/config.json: "orchestrator": "orca" under "session" (commit it with: node workflow/scripts/session.mjs --commit-notes "<subject>").'); }
  if (!existsSync(join(main, 'orca.yaml'))) console.log('No orca.yaml in the main folder: run the kit\'s installer again, it adds one (the setup and archive scripts Orca runs for each worktree).');
  active = true;
  const why = {};
  const repo = orcaRepo(why);
  if (!repo) throw new Error(`Orca did not answer${why.said ? `: ${why.said}` : ''}. Open Orca, install its command line from its settings, and run this again. The setting is kept: until then sessions are made next to the main folder.`);
  orca(['repo', 'set', '--repo', `id:${repo}`, '--external-worktree-visibility', 'show'], why);
  const shown = worktrees().filter((w) => !sameDir(w.dir, main) && w.branch);
  for (const w of shown) { orcaNote(w.dir, 'in-progress', sessionNote(cardOf(w.branch), keptPort(w.dir)) || w.branch); orcaCards(w.dir, cardOf(w.branch)); }
  console.log(orcaDown ? `Orca has the project, but it stopped answering: ${why.said ?? 'no answer'}.` : `Orca has the project (id ${repo}) and shows its ${shown.length} open session${shown.length === 1 ? '' : 's'}${shown.length ? `: ${shown.map((w) => w.branch).join(', ')}` : ''}. New sessions are made by Orca from now on.`);
}
