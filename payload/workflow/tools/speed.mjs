#!/usr/bin/env node
// The speed check: how fast each built page is on a slow phone (a processor slowed 4 times, slow 4G: 150 ms round trips, 1.6 Mbit/s
// down), in a headless Chrome or Edge (the ui module's workflow/scripts/browser.mjs). For each page (`performance.pages`, or every
// .html at the top of the build, as the page-weight check finds them): the first screen (the largest paint), when it is usable
// (`performance.speed.pages.<name>.ready`, a test in the page, true once a person can use it; else the page has loaded), and a
// tap on its main button (`.tap`, a selector) until the page has answered (`.tapDone`: a test true once the answer shows; else
// the tap's own work until the next paint; `.path`: the page's address, when it is not the built file's).
// The median of a few runs (`performance.speed.runs`, 3). The first time, today's numbers are the baseline
// (workflow/tools/speed-baseline.json: this computer's, taken in the main folder, never in a session); after that a page that got slower fails (lib/speed.mjs says how much is
// allowed). On a shared runner (CI) the numbers are shown, never judged. A `checks` entry of the gate when screens change; in a
// prototype it advises.
// No web pages, no build, no browser: it says so and passes.
//   node workflow/tools/speed.mjs [--no-build] [--update] [--url <address>]   (--update: today's numbers are the baseline again;
//   --url: time a running app instead of the build, its pages by their paths)
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { cpus } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildApp } from './lib/buildapp.mjs';
import { builtPages, startupFiles } from './lib/perfbudget.mjs';
import { median, speedVerdict } from './lib/speed.mjs';
import { hasWeb, surfacesOf } from './lib/surfaces.mjs';

const BASELINE_AT = 'workflow/tools/speed-baseline.json';
// the computer the numbers were taken on: its processor and how many, nothing that names a person
const MACHINE = `${cpus()[0]?.model?.trim() ?? 'unknown'} x${cpus().length}`;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json' };

/** The built folder served as a host would: compressed when the browser asks, never outside the folder. */
function serve(dir, base = '') {
  const root = resolve(dir);
  const packed = new Map();
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (base && p.startsWith(`/${base}/`)) p = p.slice(base.length + 1); // a site served under a path (Vite's "base")
    if (p.endsWith('/')) p += 'index.html';
    let f = normalize(join(root, p));
    // no base given and the file is not there: the site may be served under a path ("/app/assets/x.js" is "assets/x.js")
    if (!base && !existsSync(f) && p.split('/').length > 2) f = normalize(join(root, p.split('/').slice(2).join('/')));
    if (!f.startsWith(root + sep) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    const type = TYPES[extname(f)] ?? 'application/octet-stream';
    const gzip = /gzip/.test(String(req.headers['accept-encoding'])) && /text|javascript|json|svg|wasm|manifest/.test(type);
    if (gzip && !packed.has(f)) packed.set(f, gzipSync(readFileSync(f)));
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', ...(gzip ? { 'content-encoding': 'gzip' } : {}) });
    res.end(gzip ? packed.get(f) : readFileSync(f));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

// records the largest paint, the first paint, each answer to an input and the moment the page's own ready test is true
const RECORDER = (ready) => `(() => { const s = window.__speed = { lcp: 0, fcp: 0, usable: 0, taps: [] };
  const watch = (type, fn, more) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true, ...more }); } catch { /* none */ } };
  watch('largest-contentful-paint', (e) => { s.lcp = e.startTime; });
  watch('paint', (e) => { if (e.name === 'first-contentful-paint') s.fcp = e.startTime; });
  watch('event', (e) => { s.taps.push(e.duration); }, { durationThreshold: 16 });
  const ready = () => { try { return !!(${ready}); } catch { return false; } };
  const poll = () => { if (ready()) s.usable = performance.now(); else requestAnimationFrame(poll); };
  requestAnimationFrame(poll); })()`;

/** One run on a page: { firstMs, usableMs, tapMs }, tapMs null when the page has no tap set. */
async function run(b, url, o) {
  await b.go('about:blank');
  await b.go(url);
  await b.until('window.__speed && window.__speed.usable > 0', 60000);
  await new Promise((r) => setTimeout(r, 500)); // the largest paint may still change a moment after
  const s = await b.ev('({ lcp: __speed.lcp, fcp: __speed.fcp, usable: __speed.usable })');
  let tapMs = null;
  if (o.tap) {
    const at = await b.ev(`(() => { const r = document.querySelector(${JSON.stringify(o.tap)})?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
    if (!at) throw new Error(`${url}: no element matches the tap "${o.tap}" (performance.speed.pages)`);
    await b.ev('__speed.taps.length = 0');
    // with `tapDone` (a test true once the answer shows), the tap is timed until then, however long its fetch takes
    const done = o.tapDone ? b.ev(`new Promise((ok) => { const t0 = performance.now(); const f = () => { let yes = false; try { yes = !!(${o.tapDone}); } catch { /* not yet */ }
      if (yes) ok(performance.now() - t0); else if (performance.now() - t0 > 30000) ok(-1); else requestAnimationFrame(f); }; f(); })`) : null;
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
    await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const doneMs = done ? await done : null;
    if (doneMs === -1) throw new Error(`${url}: the tap's answer never showed in 30 s ("tapDone": ${o.tapDone})`);
    await new Promise((r) => setTimeout(r, 1000));
    // the tap's own work until the next paint (an answer under 16 ms is not reported by the browser: it is that fast)
    tapMs = Math.round(Math.max(16, doneMs ?? 0, ...(await b.ev('__speed.taps'))));
  }
  return { firstMs: Math.round(s.lcp || s.fcp), usableMs: Math.round(s.usable), tapMs };
}

async function main() {
  process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
  const config = JSON.parse(readFileSync('workflow/config.json', 'utf8'));
  const perf = config.performance ?? {};
  const args = process.argv.slice(2);
  const given = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;
  // a shared runner (GitHub) is not the computer the baseline was taken on: its numbers are shown, never judged or kept
  const shared = Boolean(process.env.CI);
  // the baseline is taken in the main folder only: a session that took it would make its own slowdown the measure
  const gitDir = resolve(execFileSync('git', ['rev-parse', '--git-dir'], { encoding: 'utf8' }).trim());
  const common = resolve(execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim());
  const inSession = gitDir !== common;
  // one baseline, in the main folder, read by every session: the measure a session is held to is never its own
  const BASELINE = join(dirname(common), BASELINE_AT);
  if (inSession && args.includes('--update')) console.log('speed: a baseline is taken in the main folder only (npm run speed -- --update there); timing against the one there');
  if (!hasWeb(surfacesOf(config).names)) { console.log(`speed: no web pages (project.surfaces: ${surfacesOf(config).names.join(', ')})`); return 0; }
  const browserAt = resolve('workflow/scripts/browser.mjs');
  if (!existsSync(browserAt)) { console.log('speed: not timed: it needs the headless browser of the ui module (workflow/scripts/browser.mjs)'); return 0; }
  if (!given && !args.includes('--no-build')) {
    const b = buildApp();
    if (b.none) { console.log('speed: no build script, nothing to time'); return 0; }
    if (!b.ok) { console.log(`speed: the build failed\n${b.tail}`); return 1; }
  }
  const roots = [...new Set((perf.files ?? ['dist/assets/*.js']).map((g) => g.split('/')[0]))];
  const own = perf.speed?.pages ?? {};
  let pages = builtPages(perf, roots, (r) => (existsSync(r) && statSync(r).isDirectory() ? readdirSync(r) : []));
  // a running app with no build here: the pages the config names, by their paths
  if (given && !pages.length) pages = Object.keys(own).map((name) => ({ name, html: null, root: null }));
  // an HTML the build writes beside the app with none of its scripts (a bundle report, stats.html) is no page to time
  pages = pages.filter((p) => {
    if (!p.html || own[p.name]) return true;
    const read = (f) => { const at = p.root ? `${p.root}/${f}` : f; return existsSync(at) && statSync(at).isFile() ? readFileSync(at, 'utf8') : null; };
    const s = startupFiles(readFileSync(p.html, 'utf8'), p.root ? p.html.slice(p.root.length + 1) : p.html, read);
    return s.files.length + s.missing.length > 0;
  });
  if (!pages.length) { console.log('speed: no built page to time (no .html at the top of the build; "performance.pages" names them)'); return 0; }
  const { openBrowser } = await import(pathToFileURL(browserAt).href);
  const runs = perf.speed?.runs ?? 3;
  const file = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
  // numbers from another computer are no measure for this one's: shown, not judged (`--update` there takes this one's)
  const other = file.machine && file.machine !== MACHINE && !args.includes('--update');
  const saved = file.machine && file.machine !== MACHINE ? {} : file.pages ?? {};
  const baselines = { ...saved };
  let ok = true;
  let b;
  try { b = await openBrowser({ width: 390, height: 844, scale: 2 }); } catch (e) { console.log(`speed: not timed: no headless browser here (${e.message})`); return 0; }
  const hosts = new Map();
  try {
    await b.send('Network.enable');
    await b.send('Network.setCacheDisabled', { cacheDisabled: true });
    await b.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await b.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    for (const page of pages) {
      const o = own[page.name] ?? {};
      const key = `${page.root}|${page.base ?? ''}`;
      if (!given && !hosts.has(key)) hosts.set(key, await serve(page.root || '.', page.base));
      const rel = page.html ? (page.root ? page.html.slice(page.root.length + 1) : page.html) : null;
      const path = o.path ?? (rel ? `${page.base ? `${page.base}/` : ''}${rel}` : page.name === 'index' ? '' : page.name);
      const url = `${given ? given.replace(/\/$/, '') : hosts.get(key).url}/${String(path).replace(/^\//, '')}`;
      const script = await b.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER(o.ready ?? 'document.readyState === "complete"') });
      const all = [];
      for (let i = 0; i < runs; i++) all.push(await run(b, url, o));
      await b.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script.identifier });
      const today = { firstMs: median(all.map((r) => r.firstMs)), usableMs: median(all.map((r) => r.usableMs)), tapMs: o.tap ? median(all.map((r) => r.tapMs)) : null };
      const base = args.includes('--update') && !inSession ? null : saved[page.name];
      const v = speedVerdict(page.name, today, base);
      if (shared || other) { console.log(`${v.lines[0].replace(/; today's numbers are its baseline$/, '')}; ${shared ? 'on a shared runner' : `on another computer than the baseline's (${file.machine})`}: shown, not judged`); continue; }
      if (!base && inSession) { console.log(`${v.lines[0].replace(/; today's numbers are its baseline$/, '')}; not judged yet: no baseline for it (npm run speed in the main folder takes one)`); continue; }
      for (const l of v.lines) console.log(l);
      // no baseline yet, or a number it lacks (a tap set after the first run): today's number becomes it
      if (!base) baselines[page.name] = today;
      else if (!inSession) for (const k of Object.keys(today)) if (base[k] == null && today[k] != null) { baselines[page.name] = { ...baselines[page.name], [k]: today[k] }; console.log(`  ${k === 'tapMs' ? 'the tap' : k}: today's number is its baseline`); }
      ok &&= v.ok;
    }
  } finally {
    await b.close();
    for (const h of hosts.values()) h.close();
  }
  if (!shared && !other && !inSession && JSON.stringify(baselines) !== JSON.stringify(saved)) {
    writeFileSync(BASELINE, `${JSON.stringify({ note: 'Each page timed on a slow phone the first time (ms), on this computer, in the main folder; every session is held to it. Slower than this, with a little room, fails. npm run speed -- --update takes today\'s numbers again, with the owner\'s yes. Commit it with the next settings.', machine: MACHINE, pages: baselines }, null, 2)}\n`);
    console.log(`speed: the baseline is in ${BASELINE_AT}; commit it with the next settings`);
  }
  return ok ? 0 : 1;
}

main().then((code) => process.exit(code), (e) => { console.log(`speed: ${e.message}`); process.exit(1); });
