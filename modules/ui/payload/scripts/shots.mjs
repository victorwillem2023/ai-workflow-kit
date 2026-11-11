// Takes a picture of a page (a board file or the live app) at a chosen width and theme, with an installed Chrome or Edge
// driven over its DevTools protocol (Node's built-in WebSocket, no packages). It can click a selector or press keys first.
// Usage: node scripts/shots.mjs <url or file> [--width 1280] [--height 800] [--theme light|dark] [--click <selector>]...
//        [--press <key>]... [--wait <ms>] [--full] [--out shot.png]
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TIMEOUT_MS = 30000;

/** Reads the command line into options; throws an Error with a plain sentence when something is wrong. */
export function parseShotArgs(argv) {
  const o = { page: '', width: 1280, height: 800, theme: 'light', click: [], press: [], wait: 300, full: false, out: 'shot.png' };
  const value = (i, name) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`--${name} needs a value`);
    return v;
  };
  const number = (v, name, min, max) => {
    const n = Number(v);
    if (!/^\d+$/.test(v) || n < min || n > max) throw new Error(`--${name} must be a whole number from ${min} to ${max}, not "${v}"`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      if (o.page) throw new Error(`Only one page at a time: "${a}" is extra`);
      o.page = a;
      continue;
    }
    const name = a.slice(2);
    if (name === 'full') { o.full = true; continue; }
    if (!['width', 'height', 'theme', 'click', 'press', 'wait', 'out'].includes(name)) throw new Error(`Unknown option ${a}`);
    const v = value(i, name);
    i++;
    if (name === 'width') o.width = number(v, 'width', 200, 4000);
    else if (name === 'height') o.height = number(v, 'height', 200, 8000);
    else if (name === 'wait') o.wait = number(v, 'wait', 0, 20000);
    else if (name === 'theme') {
      if (v !== 'light' && v !== 'dark') throw new Error(`--theme must be light or dark, not "${v}"`);
      o.theme = v;
    } else if (name === 'click') o.click.push(v);
    else if (name === 'press') o.press.push(v);
    else o.out = v;
  }
  if (!o.page) throw new Error('Give the page to shoot: a URL or a file path');
  return o;
}

/** Finds Chrome or Edge: CHROME_PATH first, else the usual places for the platform. */
export function findChrome(env = process.env, platform = process.platform, exists = existsSync) {
  if (env.CHROME_PATH) {
    if (exists(env.CHROME_PATH)) return env.CHROME_PATH;
    throw new Error(`CHROME_PATH is set to "${env.CHROME_PATH}" but nothing is there`);
  }
  const win = ['ProgramFiles', 'ProgramFiles(x86)', 'LocalAppData'].flatMap((k) => env[k]
    ? [`${env[k]}/Google/Chrome/Application/chrome.exe`, `${env[k]}/Microsoft/Edge/Application/msedge.exe`] : []);
  const places = {
    win32: win,
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'],
  }[platform] ?? [];
  const found = places.find((p) => exists(p));
  if (found) return found;
  throw new Error('No Chrome or Edge found. Set CHROME_PATH to the executable of your browser.');
}

function toUrl(page) {
  return /^https?:\/\//i.test(page) || page.startsWith('file:') ? page : pathToFileURL(resolve(page)).href;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, what, ms = 10000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(100);
  }
}

// A tiny DevTools client over one page's WebSocket.
function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { ok, fail } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) fail(new Error(`${m.error.message}`)); else ok(m.result);
    } else if (m.method) listeners.forEach((l) => l(m));
  });
  const opened = new Promise((ok, fail) => { ws.addEventListener('open', ok); ws.addEventListener('error', () => fail(new Error('Could not reach Chrome'))); });
  return {
    opened,
    send: (method, params = {}) => new Promise((ok, fail) => { const n = ++id; pending.set(n, { ok, fail }); ws.send(JSON.stringify({ id: n, method, params })); }),
    on: (l) => listeners.push(l),
    close: () => ws.close(),
  };
}

const KEYS = { Escape: 27, Enter: 13, Tab: 9, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Space: 32, Backspace: 8 };

let runningChrome;

async function run(o) {
  if (!/^(https?|file):/i.test(o.page) && !existsSync(o.page)) throw new Error(`No file at "${o.page}"`);
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'shots-'));
  const child = spawn(chrome, [
    '--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank',
  ], { stdio: 'ignore' });
  runningChrome = child;
  let cdp;
  try {
    const port = await waitFor(() => {
      try { return Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]) || 0; } catch { return 0; }
    }, 'Chrome to start');
    const target = await waitFor(async () => {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        return list.find((t) => t.type === 'page');
      } catch { return null; }
    }, 'a Chrome page');
    cdp = connect(target.webSocketDebuggerUrl);
    await cdp.opened;
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: o.width, height: o.height, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: o.theme }] });
    // The pages and the app also read data-theme on the root element.
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.documentElement.setAttribute('data-theme', ${JSON.stringify(o.theme)});` });
    const loaded = new Promise((ok) => cdp.on((m) => { if (m.method === 'Page.loadEventFired') ok(); }));
    await cdp.send('Page.navigate', { url: toUrl(o.page) });
    await loaded;
    await sleep(o.wait);
    for (const sel of o.click) {
      const r = await cdp.send('Runtime.evaluate', { expression: `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`, returnByValue: true });
      if (!r.result.value) throw new Error(`Nothing matches --click "${sel}"`);
      await sleep(o.wait);
    }
    for (const key of o.press) {
      const code = KEYS[key];
      const base = code ? { key, windowsVirtualKeyCode: code } : { key, text: key.length === 1 ? key : undefined };
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(o.wait);
    }
    const shot = { format: 'png' };
    if (o.full) {
      const m = await cdp.send('Page.getLayoutMetrics');
      const w = Math.ceil(m.cssContentSize.width), h = Math.min(Math.ceil(m.cssContentSize.height), 16000);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: o.width, height: h, deviceScaleFactor: 1, mobile: false });
      await sleep(100);
      shot.clip = { x: 0, y: 0, width: Math.max(w, o.width), height: h, scale: 1 };
    }
    const { data } = await cdp.send('Page.captureScreenshot', shot);
    mkdirSync(dirname(resolve(o.out)), { recursive: true });
    writeFileSync(o.out, Buffer.from(data, 'base64'));
    console.log(`Saved ${o.out} (${o.width} wide, ${o.theme})`);
  } finally {
    try { cdp?.close(); } catch { /* already closed */ }
    child.kill();
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a temp folder Chrome still holds */ }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  let o;
  try { o = parseShotArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
  const timer = setTimeout(() => { console.error('Gave up after 30 seconds'); runningChrome?.kill(); process.exit(1); }, TIMEOUT_MS);
  run(o).then(() => { clearTimeout(timer); process.exit(0); }, (e) => { console.error(e.message); process.exit(1); });
}
