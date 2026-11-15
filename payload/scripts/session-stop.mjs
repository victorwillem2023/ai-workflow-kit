// Taking a session's folder away cleanly: stop the session's own dev server first (the process listening on the port in its
// .env, and the node/npm/tsx processes above it, never a shell or editor, never the main folder's port), then unlink node_modules on its
// own and let git remove the folder; a folder another program still holds open is reported as `held` instead of an error.
// Also removes leftover session folders that hold no files at all. Used by scripts/session.mjs.
// Every command goes through execFileSync with an argument list (no shell); PIDs are digits checked before use.
// WORKFLOW_HOLD_TEST (tests only): the removal acts as Windows does when a terminal is open in the folder (the files go,
// git forgets the worktree, the empty folder stays and git says "Permission denied").
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';

// how many ports a project's sessions may use, counted from its first session port (`session.firstPort` in the config)
const PORT_SPAN = 212;
const WAIT_MS = 3000;
const SERVER_NAMES = /^(node|npm|npx|tsx)(\.exe|\.cmd)?$/i;
const isWindows = process.platform === 'win32';
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, maxBuffer: 32 << 20 });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const pidOf = (s) => (/^\d+$/.test(String(s).trim()) ? Number(String(s).trim()) : undefined);

/** The PORT line of a session folder's .env, or undefined. */
export function sessionPort(dir) {
  const env = join(dir, '.env');
  if (!existsSync(env)) return undefined;
  const m = /^PORT=(\d+)\s*$/m.exec(readFileSync(env, 'utf8'));
  return m ? Number(m[1]) : undefined;
}
/** Only a session's own range: main's port, or anything else, is never stopped. */
export const stoppablePort = (port, { mainPort = 8787, firstPort = 8788 } = {}) => Number.isInteger(port) && port !== mainPort && port >= firstPort && port < firstPort + PORT_SPAN;

/**
 * PIDs listening on `port`. Mac/Linux: lsof. Windows: netstat's listing cannot be trusted alone (on some Windows builds it
 * shows a live listener as CLOSED or FIN_WAIT_1, or leaves it out), so a small node helper connects to the port first: a
 * refused connection means nothing listens; while connected it reads netstat and takes the PID of the row that is the other
 * end of its own connection (and of any listener row). The state word is never read (it is translated, too).
 */
function listenersOn(port) {
  if (!isWindows) {
    try { return sh('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']).split('\n').map(pidOf).filter(Boolean); }
    catch { return []; } // no lsof, or nothing listening (lsof exits 1 then)
  }
  try {
    const out = execFileSync(process.execPath, ['-e', WINDOWS_PROBE, String(port)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: 15000 });
    return out.trim().split(/\s+/).map(pidOf).filter((p) => p && p !== process.pid);
  } catch { return []; }
}
const WINDOWS_PROBE = String.raw`const net=require('net'),{execFileSync}=require('child_process');const port=Number(process.argv[1]);
const open=(host)=>new Promise((ok)=>{const s=net.connect({port,host});const t=setTimeout(()=>{s.destroy();ok(null)},1500);
s.once('connect',()=>{clearTimeout(t);ok(s)});s.once('error',()=>{clearTimeout(t);ok(null)})});
(async()=>{const s=(await open('127.0.0.1'))||(await open('::1'));if(!s)return;const me=':'+s.localPort;const pids=new Set();
for(let i=0;i<5&&!pids.size;i++){const out=execFileSync('netstat',['-ano'],{encoding:'utf8',windowsHide:true,maxBuffer:32<<20});
for(const line of out.split(/\r?\n/)){const [proto,local,remote,...rest]=line.trim().split(/\s+/);
if(!/^TCP/i.test(proto||'')||!(local||'').endsWith(':'+port))continue;
if(/:0$/.test(remote||'')||(remote||'').endsWith(me)){const pid=rest[rest.length-1];if(/^[1-9][0-9]*$/.test(pid||''))pids.add(pid)}}}
s.destroy();console.log([...pids].join(' '))})();`;

/** Every process as { pid, ppid, name }. */
function processTable() {
  if (isWindows) {
    const csv = sh('powershell', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Csv -NoTypeInformation']);
    return csv.split(/\r?\n/).slice(1).map((l) => l.replace(/"/g, '').split(',')).map(([pid, ppid, name]) => ({ pid: pidOf(pid), ppid: pidOf(ppid), name: name ?? '' })).filter((p) => p.pid);
  }
  return sh('ps', ['-A', '-o', 'pid=,ppid=,comm=']).split('\n').map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l)).filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), name: basename(m[3].trim()) }));
}

/** This script and the processes above it: never stopped, and the walk up stops before them. */
function ownLine(table) {
  const byPid = new Map(table.map((p) => [p.pid, p]));
  const mine = new Set();
  for (let pid = process.pid; pid && !mine.has(pid); pid = byPid.get(pid)?.ppid) mine.add(pid);
  return mine;
}

/** From the listener up through its node/npm/tsx parents (tsx watch, npm run dev), stopping at a shell, an editor or this script's own line. */
function topOfServer(pid, table, mine) {
  const byPid = new Map(table.map((p) => [p.pid, p]));
  let top = pid;
  for (let i = 0; i < 20; i++) {
    const parent = byPid.get(byPid.get(top)?.ppid);
    if (!parent || mine.has(parent.pid) || !SERVER_NAMES.test(parent.name)) break;
    top = parent.pid;
  }
  return top;
}

/** `top` and everything below it, top first. */
function treeOf(top, table) {
  const tree = [top];
  for (let i = 0; i < tree.length; i++) for (const p of table) if (p.ppid === tree[i] && !tree.includes(p.pid)) tree.push(p.pid);
  return tree;
}

function stopTree(top, tree) {
  if (isWindows) { try { sh('taskkill', ['/PID', String(top), '/T', '/F']); } catch { /* gone already */ } return; }
  const signal = (sig) => { for (const pid of tree) { try { process.kill(pid, sig); } catch { /* gone already */ } } };
  signal('SIGTERM');
  for (let t = 0; t < 15 && tree.some(alive); t++) sleep(100);
  signal('SIGKILL');
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** Waits (up to WAIT_MS) for the port to free and the stopped processes to be gone: a process that is still exiting holds the folder. */
function waitUntilStopped(port, look, pids) {
  const done = () => !look(port).length && !pids.some(alive);
  for (let t = 0; t < WAIT_MS / 100 && !done(); t++) sleep(100);
  return !look(port).length;
}

/**
 * Stops the dev server of the session in `dir`: { port, stopped } with the number of processes stopped (0 when nothing was
 * listening), or { port, refused } for a port outside the session range. `deps` replaces the process calls (tests) and carries
 * the project's ports (`mainPort`, `firstPort`).
 */
export function stopSessionServer(dir, deps = {}) {
  const port = sessionPort(dir);
  if (port === undefined) return { port, stopped: 0 };
  if (!stoppablePort(port, deps)) return { port, refused: true, stopped: 0 };
  const { listeners = listenersOn, table = processTable, stop = stopTree } = deps;
  const pids = listeners(port);
  if (!pids.length) return { port, stopped: 0 };
  const all = table();
  const mine = ownLine(all);
  const tops = [...new Set(pids.filter((p) => !mine.has(p)).map((p) => topOfServer(p, all, mine)))];
  const gone = [];
  for (const top of tops) { const tree = treeOf(top, all); stop(top, tree); gone.push(...tree); }
  const free = waitUntilStopped(port, listeners, deps.stop ? [] : gone);
  return { port, stopped: gone.length, free };
}

/** The line the session script prints for what stopSessionServer did ('' when there was nothing to say). */
export function stopMessage(r) {
  if (r.refused) return `Port ${r.port} in the session's .env is not a session port, so nothing was stopped.`;
  if (!r.stopped) return '';
  const what = `Stopped the dev server on port ${r.port} (${r.stopped} process${r.stopped === 1 ? '' : 'es'}).`;
  return r.free === false ? `${what} The port is still in use after ${WAIT_MS / 1000} s.` : what;
}

/** The node_modules link (a junction on Windows) is unlinked by itself, never followed: the main folder's modules stay. */
export function unlinkModules(dir) {
  const link = join(dir, 'node_modules');
  let st;
  try { st = lstatSync(link); } catch { return; }
  if (st.isSymbolicLink()) unlinkSync(link);
  else if (isWindows && st.isDirectory()) { try { rmdirSync(link); } catch { /* a real folder with files: git handles it */ } }
}

const HELD = /EBUSY|EPERM|Permission denied|resource busy/i;

/** Takes the session folder away: 'removed', or 'held' when another program still has it open (git is made to forget it). */
export function removeFolder(main, dir) {
  unlinkModules(dir);
  const git = (...args) => execFileSync('git', args, { cwd: main, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git('worktree', 'remove', dir);
    if (process.env.WORKFLOW_HOLD_TEST) { mkdirSync(dir, { recursive: true }); throw new Error(`error: failed to delete '${dir}': Permission denied`); }
    return 'removed';
  } catch (e) {
    const text = `${e.stderr?.toString() ?? ''}${e.message ?? ''}`;
    if (!HELD.test(text)) throw e;
    try { git('worktree', 'prune'); } catch { /* git forgets it on the next prune */ }
    return 'held';
  }
}
export const heldMessage = (dir) => `../${basename(dir)} is still open in another program (a terminal or an editor window in that folder). Close it, then run: node scripts/session.mjs --clean --yes`;

/** True when `dir` holds no file and no link at any depth (only empty folders). */
function holdsNothing(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.isSymbolicLink()) return false;
    if (lstatSync(join(dir, e.name)).isSymbolicLink() || !holdsNothing(join(dir, e.name))) return false;
  }
  return true;
}
/** Empty folders go from the deepest up; rmdir never removes a file, so nothing with content can be lost. */
function removeEmptyTree(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) removeEmptyTree(join(dir, e.name));
  rmdirSync(dir);
}

/** Of the leftover folders, removes the ones that hold nothing; returns { removed, kept }. */
export function removeEmptyStrangers(dirs) {
  const removed = []; const kept = [];
  for (const d of dirs) {
    let gone = false;
    try { if (holdsNothing(d)) { removeEmptyTree(d); gone = true; } } catch { /* still open somewhere: kept */ }
    (gone ? removed : kept).push(d);
  }
  return { removed, kept };
}
