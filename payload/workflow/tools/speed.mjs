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
// Timed walks (`performance.speed.walks`: names of tests/smoke walks, the steps in the owner's words): each step on slow 4G with a
// slowed phone and on fast 4G (lib/speed.mjs LINES), with what it downloaded, against the built app `performance.speed.serve`
// starts ({ "command", "port" }), else the running dev server (a guide); --walks times only them. They sit beside the trace a
// real phone records, never in place of it: a computer playing a phone is not the owner's iPhone.
// No web pages, no build, no browser: it says so and passes.
//   node workflow/tools/speed.mjs [--no-build] [--update] [--url <address>]   (--update: today's numbers are the baseline again;
//   --url: time a running app instead of the build, its pages by their paths)
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { cpus } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildApp } from './lib/buildapp.mjs';
import { builtPages, startupFiles } from './lib/perfbudget.mjs';
import { LINES, median, speedVerdict, timedSteps, walkVerdict } from './lib/speed.mjs';
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
  const onlyWalks = args.includes('--walks');
  const walkNames = perf.speed?.walks ?? [];
  if (!pages.length && !walkNames.length) { console.log('speed: no built page to time (no .html at the top of the build; "performance.pages" names them)'); return 0; }
  const { openBrowser } = await import(pathToFileURL(browserAt).href);
  const runs = perf.speed?.runs ?? 3;
  const file = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
  // numbers from another computer are no measure for this one's: shown, not judged (`--update` there takes this one's)
  const other = file.machine && file.machine !== MACHINE && !args.includes('--update');
  const mine = !file.machine || file.machine === MACHINE;
  const saved = mine ? file.pages ?? {} : {};
  const savedWalks = mine ? file.walks ?? {} : {};
  const baselines = { ...saved };
  const walkBaselines = { ...savedWalks };
  const update = args.includes('--update') && !inSession;
  // what a number is held to: shown only on a shared runner or another computer, waiting for one in a session without it
  const judged = (head, base, note = '') => {
    const plain = `${head.replace(/; today's numbers are its baseline$/, '')}${note}`;
    if (shared || other) { console.log(`${plain}; ${shared ? 'on a shared runner' : `on another computer than the baseline's (${file.machine})`}: shown, not judged`); return false; }
    if (!base && inSession) { console.log(`${plain}; not judged yet: no baseline for it (npm run speed in the main folder takes one)`); return false; }
    return true;
  };
  let ok = true;
  if (pages.length && !onlyWalks) {
    let b;
    try { b = await openBrowser({ width: 390, height: 844, scale: 2 }); } catch (e) { console.log(`speed: not timed: no headless browser here (${e.message})`); return 0; }
    const hosts = new Map();
    try {
      await throttle(b, LINES.slow);
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
        const base = update ? null : saved[page.name];
        const v = speedVerdict(page.name, today, base);
        if (!judged(v.lines[0], base)) continue;
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
  }
  if (onlyWalks && !walkNames.length) console.log('speed walks: none named yet ("performance.speed.walks" lists the smoke walks in tests/smoke/ to time, each step with a "name")');
  if (walkNames.length) ok = (await timeWalks({ openBrowser, perf, given, walkNames, savedWalks, walkBaselines, update, judged, runs, canKeep: !shared && !other && !inSession })) && ok;
  if (!shared && !other && !inSession && (JSON.stringify(baselines) !== JSON.stringify(saved) || JSON.stringify(walkBaselines) !== JSON.stringify(savedWalks))) {
    writeFileSync(BASELINE, `${JSON.stringify({ note: 'Each page and each timed walk step on a slow phone the first time (ms), on this computer, in the main folder; every session is held to it. Slower than this, with a little room, fails. npm run speed -- --update takes today\'s numbers again, with the owner\'s yes. Commit it with the next settings.', machine: MACHINE, pages: baselines, walks: walkBaselines }, null, 2)}\n`);
    console.log(`speed: the baseline is in ${BASELINE_AT}; commit it with the next settings`);
  }
  return ok ? 0 : 1;
}

/** Sets a network line and a processor speed on a browser (lib/speed.mjs LINES). */
async function throttle(b, line) {
  await b.send('Network.enable');
  await b.send('Network.setCacheDisabled', { cacheDisabled: true });
  await b.send('Network.emulateNetworkConditions', { offline: false, latency: line.latency, downloadThroughput: (line.downKbit * 1024) / 8, uploadThroughput: (line.upKbit * 1024) / 8 });
  await b.send('Emulation.setCPUThrottlingRate', { rate: line.cpu });
}

/**
 * The app to walk: an address given, the built app started by `performance.speed.serve` ({ "command", "port", "env" }), or this
 * folder's running dev server (a guide only: a dev server is not what people get). { base, stop, note } or null.
 */
async function walkServer(speedCfg, given) {
  const answers = async (url) => { try { await fetch(url, { signal: AbortSignal.timeout(3000) }); return true; } catch { return false; } };
  if (given) return { base: given, stop: () => {}, note: '' };
  const s = speedCfg?.serve;
  if (s?.command) {
    // a free port unless one is named, so two sessions can time their walks at once
    const port = s.port ?? (await freePort());
    // localhost, as the app may listen on it alone (::1 on some systems)
    const base = `http://localhost:${port}`;
    // something already on the port would be timed in the app's place
    if (await answers(base)) throw new Error(`port ${port} is in use already, so the built app cannot start there: give "performance.speed.serve" a free "port"`);
    // the project's own start command, from its config: a shell runs it as the owner wrote it
    // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
    const child = spawn(s.command, { shell: true, detached: process.platform !== 'win32', stdio: 'ignore', windowsHide: true, env: { ...process.env, PORT: String(port), ...(s.env ?? {}) } });
    const stop = () => {
      try {
        if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        else process.kill(-child.pid, 'SIGTERM');
      } catch { /* gone already */ }
    };
    let gone = false;
    child.on('exit', () => { gone = true; });
    for (let i = 0; i < 120 && !gone && !(await answers(base)); i++) await new Promise((r) => setTimeout(r, 500));
    if (gone) throw new Error(`the app stopped before it answered ("performance.speed.serve": ${s.command})`);
    if (!(await answers(base))) { stop(); throw new Error(`the app did not answer at ${base} within a minute ("performance.speed.serve": ${s.command})`); }
    return { base, stop, note: '' };
  }
  const port = existsSync('.env') ? /^PORT=(\d+)\s*$/m.exec(readFileSync('.env', 'utf8'))?.[1] : undefined;
  if (port && (await answers(`http://127.0.0.1:${port}`))) return { base: `http://127.0.0.1:${port}`, stop: () => {}, note: ' (the dev server: a guide only; "performance.speed.serve" starts the built app)' };
  return null;
}

/** A port nothing listens on now. */
function freePort() {
  return new Promise((ok, fail) => { const s = createNetServer(); s.on('error', fail); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
}

/** Times each named step of the walks `performance.speed.walks` names (tests/smoke/<name>.json) on both lines. */
async function timeWalks({ openBrowser, perf, given, walkNames, savedWalks, walkBaselines, update, judged, runs, canKeep }) {
  const walkAt = resolve('workflow/scripts/walk.mjs');
  if (!existsSync(walkAt)) { console.log('speed walks: not timed: they need the walks of the ui module (workflow/scripts/walk.mjs)'); return true; }
  const wm = await import(pathToFileURL(walkAt).href);
  let server;
  try { server = await walkServer(perf.speed, given); } catch (e) { console.log(`speed walks: not timed: ${e.message}`); return false; }
  if (!server) { console.log(`speed walks: not timed: no app to walk (start the dev server, or name the command that starts the built app in "performance.speed.serve")`); return true; }
  let ok = true;
  try {
    for (const name of walkNames) {
      const at = join(wm.DIR, `${name}.json`);
      if (!existsSync(at)) { console.log(`speed walk ${name}: there is no ${at} ("performance.speed.walks" names it)`); ok = false; continue; }
      const text = readFileSync(at, 'utf8');
      const w = wm.readWalk(text, name);
      // timed as a phone: a walk that names no width gets a phone's, not the desktop width a smoke walk takes by default
      if (JSON.parse(text).width == null) w.width = 390;
      const timed = {};
      let failed = '';
      // the middle of a few runs on each line: one run of a whole walk moves too much to judge
      for (const [key, line] of Object.entries(LINES)) {
        const all = [];
        for (let i = 0; i < runs && !failed; i++) {
          const r = await walkOnce(openBrowser, wm, server.base, w, line);
          if (r.noBrowser) { console.log(`speed walks: not timed: no headless browser here (${r.noBrowser})`); return ok; }
          if (r.failed) failed = `on ${line.label}, at ${r.failed}`;
          else all.push(r.steps);
        }
        if (failed) break;
        timed[key] = all[0].map((s, i) => ({ ...s, ms: median(all.map((r) => r[i]?.ms ?? null)) }));
      }
      if (failed) { console.log(`speed walk ${name}: FAILED ${failed}`); ok = false; continue; }
      const steps = timed.slow.map((s, i) => ({ name: s.name, slowMs: s.ms, fastMs: timed.fast[i]?.ms ?? null, downloads: s.downloads }));
      const base = update ? null : savedWalks[name];
      const v = walkVerdict(name, steps, base);
      // the dev server's numbers are a guide: shown, never judged or kept
      // numbers that are shown, not judged, say no verdict either
      const shownOnly = () => { for (const l of v.lines.slice(1)) if (!/^ {2}slower than before/.test(l)) console.log(l.replace(/ SLOWER$/, '')); };
      if (server.note) { console.log(`${v.lines[0].replace(/; today's numbers are its baseline$/, '')}${server.note}: shown, not judged`); shownOnly(); continue; }
      if (!judged(v.lines[0], base)) { shownOnly(); continue; }
      console.log(v.lines[0]);
      for (const l of v.lines.slice(1)) console.log(l);
      if (!base) walkBaselines[name] = Object.fromEntries(steps.map((s) => [s.name, { slowMs: s.slowMs, fastMs: s.fastMs }]));
      else if (canKeep) {
        // a step added or renamed since: today's number becomes its reference
        const fresh = steps.filter((s) => !base[s.name]);
        if (fresh.length) { walkBaselines[name] = { ...base, ...Object.fromEntries(fresh.map((s) => [s.name, { slowMs: s.slowMs, fastMs: s.fastMs }])) }; console.log(`  new since the baseline, today's numbers kept: ${fresh.map((s) => s.name).join(', ')}`); }
      }
      ok &&= v.ok;
    }
  } finally {
    server.stop();
  }
  return ok;
}

/** One walk on one line, in a fresh browser: { steps: [{ name, ms, downloads }] }, or { failed } with the step that did not pass. */
async function walkOnce(openBrowser, wm, base, w, line) {
  let b;
  try { b = await openBrowser({ width: w.width, height: 844, scale: 2 }); } catch (e) { return { noBrowser: e.message }; }
  try {
    await throttle(b, line);
    // a download counts for the step it started in, whenever it finishes
    const started = new Map();
    const got = [];
    let at = 0;
    b.on('Network.requestWillBeSent', (p) => started.set(p.requestId, { url: p.request?.url, step: at }));
    b.on('Network.loadingFinished', (p) => { const r = started.get(p.requestId); if (r) (got[r.step] ??= []).push({ url: r.url ?? '?', bytes: p.encodedDataLength ?? 0 }); });
    await wm.prepareWalk(b, w);
    const steps = [];
    for (const [gi, g] of timedSteps(w, wm.sayStep).entries()) {
      at = gi;
      let t0 = performance.now();
      for (const [i, s] of g.steps.entries()) {
        // a step that throws (a page that never loads, a selector that is no selector) is a failed step, not a stopped check
        const why = await wm.runStep(b, base, s).catch((e) => `stopped: ${e.message}`);
        if (why) return { failed: `${g.name} (${wm.sayStep({ ...s, name: undefined })}): ${why}` };
        // a swipe is timed from the moment the finger lifts: the finger's own path is the walk's, not the app's
        if (i === 0 && s.swipe) t0 = performance.now();
      }
      steps.push({ name: g.name, ms: Math.round(performance.now() - t0) });
    }
    await new Promise((r) => setTimeout(r, 300)); // what the last step started gets a moment to finish
    return { steps: steps.map((s, i) => ({ ...s, downloads: got[i] ?? [] })) };
  } finally {
    await b.close();
  }
}

main().then((code) => process.exit(code), (e) => { console.log(`speed: ${e.message}`); process.exit(1); });
