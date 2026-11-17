// The docs portal: every doc of the project in one page in the browser, with what matters now at the top (the phase and what the
// next one needs, the board, what is worth doing now, the latest decisions, what changed lately). Read-only, live: each page is
// made from the files when it is opened, and an open tab reloads itself when a doc changes. It wears the project's own style
// sheet (docs/STYLE.md, lib/portaltheme.mjs), a plain look until there is one. Only on this computer (127.0.0.1), on its own
// port, outside the session range so a session's finish or clean never stops it (`portal.port` in the config; else main - 1).
//   npm run portal                 start it in the background if it is not running, and open it in a new browser tab (/portal)
//   npm run portal -- --serve      run it here, in the foreground
//   npm run portal -- --stop       stop the one running
//   --no-open                      start it, but open no tab (prints the link)
import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { docBody, markdown, menu, menuHtml, pageHtml, titleOf } from './lib/portal.mjs';
import { glanceHtml } from './lib/portalglance.mjs';
import { themeCss, themeFrom } from './lib/portaltheme.mjs';
import { shipping } from './lib/retro.mjs';
import { MAIN } from './lib/branch.mjs';

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).trim(); } catch { return ''; } };
const root = git('rev-parse', '--show-toplevel') || process.cwd();
process.chdir(root);
const args = process.argv.slice(2);
const config = (() => { try { return JSON.parse(readFileSync('workflow/config.json', 'utf8')); } catch { return {}; } })();
const port = Number(args.includes('--port') ? args[args.indexOf('--port') + 1] : config.portal?.port ?? (config.session?.mainPort ?? 8787) - 1);
const url = `http://127.0.0.1:${port}`;
const project = config.project?.name ?? (() => { try { return JSON.parse(readFileSync('package.json', 'utf8')).name; } catch { return 'The project'; } })();
const repo = config.board?.repo ?? null;
const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };

/** The docs the portal shows, as repo paths: the tracked and new Markdown under docs/ and the kit's guides, and the two at the top. */
function listDocs() {
  const files = git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'docs', 'workflow/guides', 'workflow/tools/README.md', 'README.md', 'CLAUDE.md').split('\n');
  return [...new Set(files.filter((f) => f.endsWith('.md') && existsSync(f)))].map((path) => ({ path, text: read(path) }));
}
const kitFiles = () => new Set(read('workflow/record').split(/\r?\n/).map((l) => /^sha \S+ (.+)$/.exec(l)?.[1]).filter(Boolean));

// the font the style sheet names, from the project's own packages (@fontsource, as a web app installs it), so it shows offline
const FONT_DIRS = (family) => ['@fontsource-variable', '@fontsource'].map((s) => join('node_modules', s, family.toLowerCase().replace(/\s+/g, '-'), 'files'));
function fontFile(family) {
  for (const dir of family ? FONT_DIRS(family) : []) {
    if (!existsSync(dir)) continue;
    // the basic Latin file (latin-ext holds only the accented letters)
    const files = readdirSync(dir).filter((f) => /-latin-(?!ext)/.test(f) && f.endsWith('.woff2') && !/italic/.test(f));
    // in this order, never the alphabet's: width and weight (the file a web app with a condensed voice loads), then the others
    const pick = ['wdth-normal', 'standard-normal', 'wght-normal', '-latin-400-normal'].map((k) => files.find((f) => f.includes(k))).find(Boolean);
    if (pick) return { dir, file: pick, variable: !/-\d00-/.test(pick) };
  }
  return null;
}
const fontFace = (family, font) => (font ? `@font-face{font-family:'${family}';font-style:normal;font-display:swap;src:url('/font/${font.file}') format('woff2');${font.variable ? 'font-weight:100 900;font-stretch:62% 125%;' : ''}}` : '');

/** The theme from docs/STYLE.md, with its font when the project has the file: { css, found, font }. */
function theme() {
  const th = themeFrom(read('docs/STYLE.md'));
  const font = fontFile(th.family);
  return { css: themeCss(th, fontFace(th.family, font)), found: th.found, font };
}

/** A tool's output: its lines ('' lines and its own prefix taken off), or null when it could not run. */
const tool = (file, toolArgs) => new Promise((done) => {
  if (!existsSync(file)) { done(null); return; }
  execFile(process.execPath, [file, ...toolArgs], { encoding: 'utf8', timeout: 30000, maxBuffer: 8 << 20 }, (e, out) => {
    done(e && !out ? null : String(out).split(/\r?\n/).map((l) => l.replace(/^(?:stage|board): /, '').trim()).filter(Boolean));
  });
});
const json = (lines) => { try { return lines ? JSON.parse(lines.join('\n')) : null; } catch { return null; } };

// the board and the stage ask GitHub, which takes seconds: the page never waits on them. Each answer is kept for five minutes and
// asked again in the background after that; when a new answer differs, the open tabs reload to show it
const slow = new Map();
function cached(file, toolArgs) {
  const key = `${file} ${toolArgs.join(' ')}`;
  const was = slow.get(key) ?? { at: 0, lines: null, asked: null, askedAt: 0 };
  if (Date.now() - was.at > 5 * 60 * 1000) {
    slow.set(key, { ...was, at: Date.now() });
    tool(file, toolArgs).then((lines) => {
      // a failed ask keeps the last good answer, with its time, so the page can say how old it is
      slow.set(key, lines ? { at: Date.now(), lines, asked: new Date().toLocaleTimeString(), askedAt: Date.now() } : { ...was, at: Date.now(), failed: true });
      if (JSON.stringify(lines) !== JSON.stringify(was.lines)) reloadTabs();
    });
  }
  return slow.get(key);
}

/** Docs under the paths by when git last changed them, newest first: [{ path, title, date, ts }]. */
function byDate(paths, n) {
  const log = git('log', '--name-only', '--format=%x00%ct', '-n', '300', '--', ...paths);
  const seen = new Map();
  let ts = 0;
  for (const line of log.split('\n')) {
    if (line.startsWith('\u0000')) { ts = Number(line.slice(1)); continue; }
    if (line.endsWith('.md') && !seen.has(line) && existsSync(line)) seen.set(line, ts);
  }
  const day = (t) => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return [...seen].slice(0, n).map(([path, t]) => ({ path, title: titleOf(path, read(path)), date: day(t), ts: t }));
}

/** Features that went onto main this week (lib/retro.mjs, as /retro and the stage count them). */
function shippedThisWeek() {
  const log = git('log', MAIN, '--first-parent', '--since=9.weeks', '--format=%cI%x09%s');
  if (!log) return null;
  const commits = log.split('\n').filter(Boolean).map((l) => { const [date, ...rest] = l.split('\t'); return { date, subject: rest.join('\t') }; });
  return shipping(commits, new Date()).weeks.at(-1)?.features ?? 0;
}

let phaseCache = null;
let docsCache = null;
async function glance(styled) {
  // the phase is read from the files: asked again only after one changed (the watch clears it), or a minute later
  // (and the dates from git's history with it: they change with a commit, so a minute is soon enough)
  if (!phaseCache || Date.now() - phaseCache.at > 60 * 1000) {
    const recent = byDate(['docs', 'README.md'], 10).filter((d) => !/^docs\/(?:MAP|README)\.md$/.test(d.path)).slice(0, 8);
    phaseCache = { at: Date.now(), phase: json(await tool('workflow/tools/phase.mjs', ['--json'])), decisions: byDate(['docs/decisions'], 5), recent, shipped: shippedThisWeek() };
  }
  const stage = cached('workflow/tools/stage.mjs', []);
  const board = config.board?.project ? cached('workflow/tools/board.mjs', ['--next', '3', '--json']) : null;
  const old = board?.askedAt && Date.now() - board.askedAt > 15 * 60 * 1000;
  const boardAge = !board ? '' : !board.asked ? (board.failed ? 'failed' : 'asking') : board.failed || old ? 'old' : 'fresh';
  return glanceHtml({
    project, repo, styled, phase: phaseCache.phase, stage: stage.lines ?? [], shipped: phaseCache.shipped,
    board: json(board?.lines), boardAge, asked: board?.asked,
    boardNote: !board ? 'The board is not set up (/setup makes it).' : board.failed && !board.lines ? 'The board could not be reached (GitHub and the gh command).' : 'Asking the board…',
    decisions: phaseCache.decisions, recent: phaseCache.recent,
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
  // the docs and the look are read again only after a doc changed (the watch clears them; docs/STYLE.md is a doc)
  docsCache ??= { docs: listDocs(), kit: kitFiles(), theme: theme() };
  const { docs, kit, theme: th } = docsCache;
  const known = new Set(docs.map((d) => d.path));
  if (path === '/search.json') return send(200, 'application/json', JSON.stringify(docs.map((d) => ({ path: d.path, title: titleOf(d.path, d.text), text: d.text.toLowerCase() }))));
  // the style sheet's font, from the project's own packages (only that one folder, only .woff2)
  if (path.startsWith('/font/')) {
    const name = path.slice(6);
    if (!th.font || name !== th.font.file) return send(404, 'text/plain', 'not found');
    res.writeHead(200, { 'content-type': 'font/woff2', 'cache-control': 'max-age=86400' });
    return res.end(readFileSync(join(th.font.dir, name)));
  }
  const maps = { file: known.has('docs/MAP.md'), app: existsSync('docs/flow/index.html') };
  const page = (o) => pageHtml({ project, theme: th.css, nav: menuHtml(menu(docs, kit, project), o.doc ?? '', maps), ...o });
  if (path === '/') return send(200, TYPES['.html'], page({ title: 'At a glance', body: await glance(th.found) }));
  if (path.startsWith('/doc/')) {
    const doc = docs.find((d) => d.path === path.slice(5));
    if (!doc) return send(404, TYPES['.html'], page({ title: 'Not found', body: '<h1>Not found</h1><p class="quiet">That doc is not in the project (any more).</p>' }));
    // the path alone: the doc's first sentence follows right under its title
    const crumb = `${doc.path}${kit.has(doc.path) ? ' · the kit’s guide (an update replaces it)' : ''}`;
    return send(200, TYPES['.html'], page({ title: titleOf(doc.path, doc.text), doc: doc.path, crumb, body: docBody(markdown(doc.text, { from: doc.path, known })) }));
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
