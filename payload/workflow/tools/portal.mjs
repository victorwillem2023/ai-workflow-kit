// The docs portal: every doc of the project in one page in the browser, with what matters now at the top (the phase and what the
// next one needs, the stage, the board, the latest decisions, what changed lately). Read-only, live: each page is made from the
// files when it is opened, and an open tab reloads itself when a doc changes. Only on this computer (127.0.0.1), on its own port,
// outside the session range so a session's finish or clean never stops it (`portal.port` in the config; else the main port - 1).
//   npm run portal                 start it in the background if it is not running, and open it in a new browser tab (/portal)
//   npm run portal -- --serve      run it here, in the foreground
//   npm run portal -- --stop       stop the one running
//   --no-open                      start it, but open no tab (prints the link)
import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { about, glanceHtml, markdown, menu, menuHtml, pageHtml, titleOf } from './lib/portal.mjs';

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).trim(); } catch { return ''; } };
const root = git('rev-parse', '--show-toplevel') || process.cwd();
process.chdir(root);
const args = process.argv.slice(2);
const config = (() => { try { return JSON.parse(readFileSync('workflow/config.json', 'utf8')); } catch { return {}; } })();
const port = Number(args.includes('--port') ? args[args.indexOf('--port') + 1] : config.portal?.port ?? (config.session?.mainPort ?? 8787) - 1);
const url = `http://127.0.0.1:${port}`;
const project = config.project?.name ?? (() => { try { return JSON.parse(readFileSync('package.json', 'utf8')).name; } catch { return 'The project'; } })();
const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };

/** The docs the portal shows, as repo paths: the tracked and new Markdown under docs/ and the kit's guides, and the two at the top. */
function listDocs() {
  const files = git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'docs', 'workflow/guides', 'workflow/tools/README.md', 'README.md', 'CLAUDE.md').split('\n');
  return [...new Set(files.filter((f) => f.endsWith('.md') && existsSync(f)))].map((path) => ({ path, text: read(path) }));
}
const kitFiles = () => new Set(read('workflow/record').split(/\r?\n/).map((l) => /^sha \S+ (.+)$/.exec(l)?.[1]).filter(Boolean));

/** A tool's output lines, without waiting on it for long; '' lines and the tool's own prefix taken off. */
const tool = (file, toolArgs) => new Promise((done) => {
  if (!existsSync(file)) { done(null); return; }
  execFile(process.execPath, [file, ...toolArgs], { encoding: 'utf8', timeout: 20000, maxBuffer: 8 << 20 }, (e, out) => {
    done(e && !out ? null : String(out).split(/\r?\n/).map((l) => l.replace(/^(?:stage|board): /, '').trim()).filter(Boolean));
  });
});

// the board and the stage ask GitHub, which takes seconds: the page never waits on them. Each answer is kept for five minutes and
// asked again in the background after that; when a new answer differs, the open tabs reload to show it
const slow = new Map();
function cached(file, toolArgs) {
  const key = `${file} ${toolArgs.join(' ')}`;
  const was = slow.get(key) ?? { at: 0, lines: null, asked: null };
  if (Date.now() - was.at > 5 * 60 * 1000) {
    slow.set(key, { ...was, at: Date.now() });
    tool(file, toolArgs).then((lines) => {
      slow.set(key, { at: Date.now(), lines, asked: new Date().toLocaleTimeString() });
      if (JSON.stringify(lines) !== JSON.stringify(was.lines)) reloadTabs();
    });
  }
  return slow.get(key);
}

/** Docs under a folder by when git last changed them, newest first: [{ path, title, date }]. */
function byDate(paths, n) {
  const log = git('log', '--name-only', '--format=%x00%cs', '-n', '200', '--', ...paths);
  const seen = new Map();
  let date = '';
  for (const line of log.split('\n')) {
    if (line.startsWith('\u0000')) { date = line.slice(1); continue; }
    if (line.endsWith('.md') && !seen.has(line) && existsSync(line)) seen.set(line, date);
  }
  return [...seen].slice(0, n).map(([path, d]) => ({ path, title: titleOf(path, read(path)), date: d }));
}

let phaseCache = null;
let docsCache = null;
async function glance() {
  // the phase is read from the files: asked again only after one changed (the watch clears it), or a minute later
  // (and the dates from git's history with it: they change with a commit, so a minute is soon enough)
  if (!phaseCache || Date.now() - phaseCache.at > 60 * 1000) {
    const lines = await Promise.all([tool('workflow/tools/phase.mjs', []), tool('workflow/tools/phase.mjs', ['--ready'])]);
    const recent = byDate(['docs', 'README.md'], 10).filter((d) => !/^docs\/(?:MAP|README)\.md$/.test(d.path)).slice(0, 8);
    phaseCache = { at: Date.now(), lines, decisions: byDate(['docs/decisions'], 5), recent };
  }
  const [phase, missing] = phaseCache.lines;
  const stage = cached('workflow/tools/stage.mjs', []);
  const board = cached('workflow/tools/board.mjs', ['--next', '3']);
  const boardNote = !board.asked ? 'Asking the board…' : board.lines ? `As of ${board.asked} (asked every five minutes)` : 'The board could not be reached (GitHub and the gh command).';
  return glanceHtml({
    phase: phase?.filter((l) => !/still missing|^- |^Nothing missing/.test(l)) ?? [],
    missing: missing?.filter((l) => l.startsWith('- ')).map((l) => l.slice(2)) ?? [],
    stage: stage.lines ?? [],
    board: board.lines, boardNote,
    decisions: phaseCache.decisions,
    recent: phaseCache.recent,
  });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const listeners = new Set();

/** One request: the glance, a doc, a project file git tracks (the app map, a picture a doc shows), search, or the live reload. */
async function answer(req, res) {
  const path = decodeURIComponent(new URL(req.url, url).pathname);
  const send = (status, type, body) => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
  if (path === '/__portal') return send(200, 'application/json', JSON.stringify({ portal: true, root }));
  if (path === '/__portal/stop') { send(200, 'text/plain', 'stopping'); setTimeout(() => process.exit(0), 50); return; }
  if (path === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(': live\n\n');
    listeners.add(res);
    req.on('close', () => listeners.delete(res));
    return;
  }
  // the docs are read again only after one changed (the watch clears them)
  docsCache ??= { docs: listDocs(), kit: kitFiles() };
  const { docs, kit } = docsCache;
  const known = new Set(docs.map((d) => d.path));
  if (path === '/search.json') return send(200, 'application/json', JSON.stringify(docs.map((d) => ({ path: d.path, title: titleOf(d.path, d.text), text: d.text.toLowerCase() }))));
  const maps = { file: known.has('docs/MAP.md'), app: existsSync('docs/flow/index.html') };
  const nav = (current) => menuHtml(menu(docs, kit), current, maps);
  if (path === '/') return send(200, TYPES['.html'], pageHtml({ project, title: 'At a glance', nav: nav(''), body: `<h1>${project}</h1>${await glance()}` }));
  if (path.startsWith('/doc/')) {
    const doc = docs.find((d) => d.path === path.slice(5));
    if (!doc) return send(404, TYPES['.html'], pageHtml({ project, title: 'Not found', nav: nav(''), body: '<h1>Not found</h1><p>That doc is not in the project (any more).</p>' }));
    const crumb = `${doc.path}${kit.has(doc.path) ? ' · the kit\'s guide (an update replaces it)' : ''} · ${about(doc.text)}`;
    return send(200, TYPES['.html'], pageHtml({ project, title: titleOf(doc.path, doc.text), nav: nav(doc.path), crumb, body: markdown(doc.text, { from: doc.path, known }) }));
  }
  if (path.startsWith('/file/')) {
    const file = path.slice(6);
    // only a file git knows (tracked or new, not ignored): never a secret in .env or anything outside the project
    const listed = !file.includes('..') && git('ls-files', '--cached', '--others', '--exclude-standard', '--', file) === file;
    if (!listed || !existsSync(file) || statSync(file).isDirectory()) return send(404, 'text/plain', 'not found');
    return send(200, TYPES[extname(file).toLowerCase()] ?? 'text/plain; charset=utf-8', readFileSync(file));
  }
  send(404, 'text/plain', 'not found');
}

/** Tells every open tab to reload (a burst of changes is one reload). */
let reloadTimer = null;
function reloadTabs() { clearTimeout(reloadTimer); reloadTimer = setTimeout(() => { for (const res of listeners) res.write('data: reload\n\n'); }, 300); }

/** Reloads the open tabs when a doc changes (and the phase is read again: a doc or levels.json may change it). */
function watchDocs() {
  const changed = () => { phaseCache = null; docsCache = null; reloadTabs(); };
  for (const dir of ['docs', 'workflow/guides', 'workflow/levels.json', 'README.md', 'CLAUDE.md']) {
    if (!existsSync(dir)) continue;
    try { watch(dir, { recursive: statSync(dir).isDirectory() }, changed); } catch { /* a system without recursive watching: no live reload there */ }
  }
}

const running = async () => { try { const r = await fetch(`${url}/__portal`, { signal: AbortSignal.timeout(1500) }); return (await r.json()).root ?? ''; } catch { return null; } };
function openTab() {
  if (args.includes('--no-open') || process.env.WORKFLOW_PORTAL_NO_OPEN) return;
  const [cmd, cmdArgs] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]];
  try { spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch { /* no browser to open: the link is printed */ }
}

if (args.includes('--serve')) {
  createServer((req, res) => answer(req, res).catch((e) => { res.writeHead(500); res.end(String(e?.message ?? e)); }))
    .on('error', (e) => { console.error(`portal: port ${port} is in use (${e.code}). Set "portal": { "port": <n> } in workflow/config.json.`); process.exit(1); })
    .listen(port, '127.0.0.1', () => { watchDocs(); console.log(`portal: ${url} (${root})`); });
} else if (args.includes('--stop')) {
  const at = await running();
  if (at === null) console.log('portal: not running.');
  else { await fetch(`${url}/__portal/stop`).catch(() => {}); console.log('portal: stopped.'); }
} else {
  const at = await running();
  if (at !== null && at !== root) { console.error(`portal: port ${port} has another project's portal (${at}). Set "portal": { "port": <n> } in workflow/config.json.`); process.exit(1); }
  if (at === null) {
    spawn(process.execPath, [fileURLToPath(import.meta.url), '--serve', '--port', String(port)], { cwd: root, detached: true, stdio: 'ignore', windowsHide: true }).unref();
    for (let i = 0; i < 50 && (await running()) === null; i++) await new Promise((r) => setTimeout(r, 100));
    if ((await running()) === null) { console.error(`portal: it did not start on ${url}. Run npm run portal -- --serve to see why.`); process.exit(1); }
  }
  openTab();
  console.log(`portal: ${url}${at === null ? ' (started; it runs until you stop it: npm run portal -- --stop)' : ' (running already)'}`);
}
