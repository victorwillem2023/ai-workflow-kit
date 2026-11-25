// A headless Chrome or Edge to drive from a script, over its DevTools protocol (Node's built-in WebSocket, no packages): the
// part every page check needs and agents kept writing from scratch (a memory check, pictures of a flow, a probe of the live
// app). workflow/scripts/memory.mjs is built on it; a one-off script imports it instead of starting a browser by hand:
//   const b = await openBrowser({ width: 400 });  await b.go('http://127.0.0.1:8788/');  await b.until('!!window.app');
//   console.log(await b.ev('document.title'));     await b.shot('page.png');             await b.close();
import '../tools/lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChrome } from './shots.mjs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts a headless browser with a fresh profile and one page: { send(method, params), ev(expression), until(expression, ms),
 * go(url), shot(file, { full }), close(), on(event, fn) }. `ev` runs an expression in the page (a promise is awaited) and returns its value;
 * a page error becomes an Error with the page's message. `until` waits for an expression to be truthy (10 s by default).
 */
export async function openBrowser({ width = 1280, height = 900, scale = 1, theme } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'workflow-browser-'));
  const child = spawn(findChrome(), ['--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', `--window-size=${width},${height}`, `--force-device-scale-factor=${scale}`, 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
  const waitFor = async (fn, what, ms = 15000, every = 150) => {
    const end = Date.now() + ms;
    for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error(`timed out waiting for ${what}`); await sleep(every); }
  };
  try {
    // the browser writes the port it picked into the profile
    const port = await waitFor(() => { try { return Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]) || 0; } catch { return 0; } }, 'the browser to start');
    const target = await waitFor(async () => { try { return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { return null; } }, 'its page');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, fail) => { ws.addEventListener('open', ok); ws.addEventListener('error', () => fail(new Error('could not reach the browser'))); });
    let id = 0;
    const pending = new Map();
    const listeners = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      // an event the browser sends by itself (Network.loadingFinished...): to whoever listens
      if (m.method && !m.id) for (const fn of listeners.get(m.method) ?? []) fn(m.params);
      const p = m.id && pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.error) p.fail(new Error(`${p.method}: ${m.error.message}`)); else p.ok(m.result);
    });
    const send = (method, params = {}) => new Promise((ok, fail) => { const n = ++id; pending.set(n, { ok, fail, method }); ws.send(JSON.stringify({ id: n, method, params })); });
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: width < 600 });
    if (theme) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
    const ev = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`in the page: ${r.exceptionDetails.exception?.description?.split('\n')[0] ?? r.exceptionDetails.text}`);
      return r.result.value;
    };
    // `every`: how often it looks (a timed walk looks often, so a step's time is not rounded up to the next look)
    const until = (expression, ms = 10000, every = 150) => waitFor(() => ev(expression).catch(() => false), expression, ms, every);
    const go = async (url) => { await send('Page.navigate', { url }); await until('document.readyState === "complete"', 30000, 25); };
    const shot = async (file, { full = false } = {}) => {
      const size = full ? await ev('({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })') : { w: width, h: height };
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(full ? { clip: { x: 0, y: 0, width: size.w, height: size.h, scale: 1 } } : {}) });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
    };
    // a profile the browser still holds a moment after it stops (Windows) is left in the temp folder: it must not fail the check
    const close = async () => { try { ws.close(); } catch { /* gone already */ } child.kill(); await sleep(300); try { rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch { /* left in temp */ } };
    /** Listens to a browser event (after its domain is enabled: Network.enable); returns a function that stops listening. */
    const on = (method, fn) => { listeners.set(method, [...(listeners.get(method) ?? []), fn]); return () => listeners.set(method, (listeners.get(method) ?? []).filter((f) => f !== fn)); };
    return { send, ev, until, go, shot, close, on };
  } catch (e) {
    child.kill();
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    throw e;
  }
}
