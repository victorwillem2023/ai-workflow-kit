#!/usr/bin/env node
// Walks a screen the way the owner will, before it is handed over: a short list of steps (type this, click that, this text is
// there) run in a headless Chrome or Edge (browser.mjs, no packages), so "try it" is never said about a screen whose first click
// fails. The script reads the page; the agent reads one line: nothing of the page reaches the chat unless a step fails.
//   node workflow/scripts/walk.mjs <name>...        the walks tests/smoke/<name>.json, against this folder's dev server (PORT in .env;
//                                                   start it first: node workflow/scripts/session.mjs --serve <topic>)
//   node workflow/scripts/walk.mjs                  every walk in tests/smoke/
//   node workflow/scripts/walk.mjs --url <address>  another address (a staging site)        --on: only say whether walks are on
// A walk: { "path": "/", "width": 1280, "steps": [ { "type": "Goal distance", "text": "10" }, { "click": "Make plan" },
//   { "see": "14 weeks" }, { "gone": "Loading" }, { "press": "Enter" }, { "go": "/plans" }, { "swipe": "left", "on": "css:.card" } ] }
// "swipe" moves a finger left, right, up or down across the element "on" names (a css: selector; the screen's middle without
// one). Any step may have a "name" in the owner's words ("swipe to the next card"): the speed check times each step on a slow and
// a fast phone network until the "see" or "gone" after it is true (a swipe from the moment the finger lifts), so a timed step
// says what shows when it is done (workflow/tools/speed.mjs, `performance.speed.walks`). "open" names the first one.
// "type" and "click" name what a person sees: a field by its label, placeholder or name, a button or link by its text; "css:<selector>"
// when there is no such word. "see" and "gone" wait up to 5 seconds ("within": ms). An error the page throws fails the walk too.
// Off in a prototype (workflow/levels.json): screens still change every day there; from pilot on a walk is part of the hand-over
// (.claude/skills/build/try-it.md). --force runs one anyway. Exit code 1 when a step fails.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DIR = 'tests/smoke';
const KINDS = ['go', 'type', 'click', 'press', 'swipe', 'see', 'gone'];
const SWIPES = ['left', 'right', 'up', 'down'];

/** A walk's text as { path, width, steps }, or an Error that says what is wrong with it in one sentence. */
export function readWalk(text, name = 'walk') {
  let w;
  try { w = JSON.parse(text); } catch (e) { throw new Error(`${DIR}/${name}.json is not JSON: ${e.message}`); }
  if (!Array.isArray(w.steps) || !w.steps.length) throw new Error(`${DIR}/${name}.json has no "steps".`);
  w.steps.forEach((s, i) => {
    const kind = KINDS.filter((k) => typeof s?.[k] === 'string' && s[k]);
    if (kind.length !== 1) throw new Error(`${DIR}/${name}.json, step ${i + 1}: one of ${KINDS.join(', ')} with its words, not ${JSON.stringify(s)}`);
    if (kind[0] === 'type' && typeof s.text !== 'string') throw new Error(`${DIR}/${name}.json, step ${i + 1}: "type" names the field, "text" is what to type.`);
    if (kind[0] === 'swipe' && !SWIPES.includes(s.swipe)) throw new Error(`${DIR}/${name}.json, step ${i + 1}: "swipe" is one of ${SWIPES.join(', ')}, not "${s.swipe}".`);
  });
  return { path: w.path ?? '/', width: Number(w.width) || 1280, steps: w.steps, ...(typeof w.open === 'string' ? { open: w.open } : {}) };
}

/** A step in the owner's words, for the one line a failure prints. */
export const sayStep = (s) => s.name ?? (s.type ? `type "${s.text}" into "${s.type}"` : `${KINDS.find((k) => s[k])} "${s[KINDS.find((k) => s[k])]}"`);

/** Whether walks are on: not in a prototype. `levels` is the text of workflow/levels.json (none: a project without phases, on). */
export function walksOn(levels) {
  if (!levels) return true;
  try { return (JSON.parse(levels).phase ?? 'prototype') !== 'prototype'; } catch { return true; }
}

// Run in the page. Finds what a person would: a field by its label, placeholder, aria-label or name; something to click by its text.
const PAGE = `(() => {
  const shown = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const norm = (t) => String(t ?? '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const pick = (all, word, textOf) => { const w = norm(word); const seen = all.filter(shown);
    return seen.find((e) => textOf(e).some((t) => norm(t) === w)) ?? seen.find((e) => textOf(e).some((t) => norm(t).includes(w))); };
  const css = (word) => (word.startsWith('css:') ? document.querySelector(word.slice(4)) : undefined);
  const field = (word) => css(word) ?? pick([...document.querySelectorAll('input, textarea, select, [contenteditable="true"]')], word,
    (e) => [...(e.labels ?? [])].map((l) => l.innerText).concat(e.getAttribute('aria-label'), e.placeholder, e.name, e.id));
  const button = (word) => css(word) ?? pick([...document.querySelectorAll('button, a, [role="button"], [role="tab"], [role="link"], [role="menuitem"], input[type="submit"], input[type="button"], summary, label')], word,
    (e) => [e.innerText, e.value, e.getAttribute('aria-label'), e.title]);
  window.__walk = {
    errors: [],
    type(word, text) { const e = field(word); if (!e) return 'no field with that label, placeholder or name is on the page';
      e.focus();
      if (e.isContentEditable) e.textContent = text;
      else { const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        const opt = e instanceof HTMLSelectElement && [...e.options].find((o) => norm(o.text) === norm(text) || o.value === text);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, opt ? opt.value : text); }
      e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return ''; },
    click(word) { const e = button(word); if (!e) return 'nothing to click with that text is on the page';
      if (e.disabled) return 'it is there but switched off (disabled)';
      e.scrollIntoView({ block: 'center' }); e.click(); return ''; },
    press(key) { const e = document.activeElement ?? document.body; const o = { key, bubbles: true, cancelable: true };
      const go = e.dispatchEvent(new KeyboardEvent('keydown', o)); e.dispatchEvent(new KeyboardEvent('keyup', o));
      if (go && key === 'Enter' && e.form) e.form.requestSubmit(); return ''; },
    has(text) { return norm(document.body.innerText).includes(norm(text)); },
    near(text) { const words = norm(text).split(' ').filter((x) => x.length > 2);
      return document.body.innerText.split('\\n').map((l) => l.trim()).filter((l) => l && l.length < 160 && words.some((x) => norm(l).includes(x))).slice(0, 3); },
  };
  window.addEventListener('error', (e) => window.__walk.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__walk.errors.push(String(e.reason?.message ?? e.reason)));
})()`;

const q = (v) => JSON.stringify(v);
const arm = async (b) => { await b.ev(`window.__walk ? 0 : ${PAGE}`); };

/** Gets the browser `b` ready for a walk (touch on when the walk swipes), its first page not opened yet. */
export async function prepareWalk(b, w) {
  if (w.steps.some((s) => s.swipe)) await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  // in every page before its own scripts run, so an error thrown while it loads is caught too
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE });
}

/** Gets the browser ready for a walk and opens its first page. */
export async function startWalk(b, base, w) {
  await prepareWalk(b, w);
  await b.go(new URL(w.path, base).href);
}

/** A finger across the element `on` names (or the screen's middle), in about a quarter of a second. */
async function swipe(b, dir, on) {
  const box = await b.ev(`(() => { const e = ${on ? `document.querySelector(${q(String(on).replace(/^css:/, ''))})` : 'null'};
    if (${on ? 'true' : 'false'} && !e) return null;
    if (e) e.scrollIntoView({ block: 'center' });
    const r = e ? e.getBoundingClientRect() : { x: 0, y: 0, width: innerWidth, height: innerHeight }; return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  if (!box) return `nothing on the page matches "${on}"`;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = { left: -0.35, right: 0.35, up: 0, down: 0 }[dir] * box.w;
  const dy = { left: 0, right: 0, up: -0.35, down: 0.35 }[dir] * box.h;
  const at = (k) => [{ x: cx - dx + (2 * dx * k) / 15, y: cy - dy + (2 * dy * k) / 15 }];
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let k = 1; k <= 15; k++) { await new Promise((r) => setTimeout(r, 16)); await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(k) }); }
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return '';
}

/** One step: '' when it passed, else why not, in a few words. */
export async function runStep(b, base, s) {
  const waitText = async (text, want, ms) => { try { await b.until(`!!window.__walk && window.__walk.has(${q(text)}) === ${want}`, ms, 20); return true; } catch { return false; } };
  await arm(b); // (a page that was open before the walk started)
  if (s.go) { await b.go(new URL(s.go, base).href); return ''; }
  if (s.type) return b.ev(`window.__walk.type(${q(s.type)}, ${q(s.text)})`);
  if (s.click) return b.ev(`window.__walk.click(${q(s.click)})`);
  if (s.press) return b.ev(`window.__walk.press(${q(s.press)})`);
  if (s.swipe) return swipe(b, s.swipe, s.on);
  if (s.see && !(await waitText(s.see, true, s.within ?? 5000))) {
    await arm(b);
    const near = await b.ev(`window.__walk.near(${q(s.see)})`);
    return `the page does not show it${near.length ? `; it shows: ${near.map((l) => `"${l}"`).join(', ')}` : ''}`;
  }
  if (s.gone && !(await waitText(s.gone, false, s.within ?? 5000))) return 'it is still on the page';
  return '';
}

/** Runs one walk in the browser `b` against `base`: '' when every step passes, else the one line that says which did not and why. */
export async function walk(b, base, w) {
  await startWalk(b, base, w);
  for (const [i, s] of w.steps.entries()) {
    const why = await runStep(b, base, s);
    if (why) return `step ${i + 1} of ${w.steps.length} (${sayStep(s)}): ${why}`;
  }
  await arm(b);
  await new Promise((r) => setTimeout(r, 300)); // what the last step started gets a moment to fail
  const errors = await b.ev('window.__walk.errors');
  return errors.length ? `every step passed, but the page threw: ${errors[0]}` : '';
}

async function main(argv) {
  const flag = (f) => argv.includes(f);
  const on = walksOn(existsSync('workflow/levels.json') ? readFileSync('workflow/levels.json', 'utf8') : null);
  if (flag('--on')) { console.log(on ? 'walks: on' : 'walks: off in a prototype (workflow/levels.json); from pilot on they are part of the hand-over'); return 0; }
  if (!on && !flag('--force')) { console.log('walks: off in a prototype (workflow/levels.json), nothing run. --force runs them anyway.'); return 0; }
  const at = argv.indexOf('--url');
  const names = argv.filter((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1));
  const all = names.length ? names : existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort() : [];
  if (!all.length) { console.log(`walks: none in ${DIR}/ yet.`); return 0; }
  const port = existsSync('.env') ? /^PORT=(\d+)\s*$/m.exec(readFileSync('.env', 'utf8'))?.[1] : undefined;
  const base = at >= 0 ? argv[at + 1] : port ? `http://127.0.0.1:${port}` : null;
  if (!base) throw new Error('No address to walk: this folder\'s .env names no PORT. Give one: --url http://127.0.0.1:<port>');
  try { await fetch(base, { signal: AbortSignal.timeout(3000) }); } catch { throw new Error(`${base} does not answer. Start the session's dev server first: node workflow/scripts/session.mjs --serve <topic>`); }
  const walks = all.map((n) => { if (!existsSync(join(DIR, `${n}.json`))) throw new Error(`There is no ${DIR}/${n}.json.`); return [n, readWalk(readFileSync(join(DIR, `${n}.json`), 'utf8'), n)]; });
  const { openBrowser } = await import('./browser.mjs');
  let failed = 0;
  for (const [name, w] of walks) {
    const b = await openBrowser({ width: w.width });
    try {
      const why = await walk(b, base, w).catch((e) => `stopped: ${e.message}`);
      if (!why) continue;
      failed++;
      const shot = join(tmpdir(), `walk-${name}.png`);
      await b.shot(shot).catch(() => {});
      console.log(`walk ${name} FAILED at ${why}\n  picture of the page at that moment: ${shot}`);
    } finally { await b.close(); }
  }
  if (!failed) console.log(`walks: ${walks.length} passed (${walks.reduce((n, [, w]) => n + w.steps.length, 0)} steps) at ${base}`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(1); });
}
