#!/usr/bin/env node
// Walks a screen the way the owner will, before it is handed over: a short list of steps (type this, click that, this text is
// there) run in a headless Chrome or Edge (browser.mjs, no packages), so "try it" is never said about a screen whose first click
// fails. The script reads the page; the agent reads one line: nothing of the page reaches the chat unless a step fails.
//   node workflow/scripts/walk.mjs <name>...        the walks tests/smoke/<name>.json, against this folder's dev server (PORT in .env;
//                                                   start it first: node workflow/scripts/session.mjs --serve <topic>)
//   node workflow/scripts/walk.mjs                  every walk in tests/smoke/
//   node workflow/scripts/walk.mjs --url <address>  another address (a staging site)        --on: only say whether walks are on
// A walk: { "path": "/", "width": 1280, "steps": [ { "type": "Goal distance", "text": "10" }, { "click": "Make plan" },
//   { "see": "14 weeks" }, { "gone": "Loading" }, { "press": "Enter" }, { "go": "/plans" } ] }
// "type" and "click" name what a person sees: a field by its label, placeholder or name, a button or link by its text; "css:<selector>"
// when there is no such word. "see" and "gone" wait up to 5 seconds ("within": ms). An error the page throws fails the walk too.
// Off in a prototype (workflow/levels.json): screens still change every day there; from pilot on a walk is part of the hand-over
// (.claude/skills/build/try-it.md). --force runs one anyway. Exit code 1 when a step fails.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DIR = 'tests/smoke';
const KINDS = ['go', 'type', 'click', 'press', 'see', 'gone'];

/** A walk's text as { path, width, steps }, or an Error that says what is wrong with it in one sentence. */
export function readWalk(text, name = 'walk') {
  let w;
  try { w = JSON.parse(text); } catch (e) { throw new Error(`${DIR}/${name}.json is not JSON: ${e.message}`); }
  if (!Array.isArray(w.steps) || !w.steps.length) throw new Error(`${DIR}/${name}.json has no "steps".`);
  w.steps.forEach((s, i) => {
    const kind = KINDS.filter((k) => typeof s?.[k] === 'string' && s[k]);
    if (kind.length !== 1) throw new Error(`${DIR}/${name}.json, step ${i + 1}: one of ${KINDS.join(', ')} with its words, not ${JSON.stringify(s)}`);
    if (kind[0] === 'type' && typeof s.text !== 'string') throw new Error(`${DIR}/${name}.json, step ${i + 1}: "type" names the field, "text" is what to type.`);
  });
  return { path: w.path ?? '/', width: Number(w.width) || 1280, steps: w.steps };
}

/** A step in the owner's words, for the one line a failure prints. */
export const sayStep = (s) => (s.type ? `type "${s.text}" into "${s.type}"` : `${KINDS.find((k) => s[k])} "${s[KINDS.find((k) => s[k])]}"`);

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

/** Runs one walk in the browser `b` against `base`: '' when every step passes, else the one line that says which did not and why. */
export async function walk(b, base, w) {
  const q = (v) => JSON.stringify(v);
  const arm = async () => { await b.ev(`window.__walk ? 0 : ${PAGE}`); };
  const waitText = async (text, want, ms) => { try { await b.until(`!!window.__walk && window.__walk.has(${q(text)}) === ${want}`, ms); return true; } catch { return false; } };
  // in every page before its own scripts run, so an error thrown while it loads is caught too
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE });
  await b.go(new URL(w.path, base).href);
  for (const [i, s] of w.steps.entries()) {
    await arm(); // (a page that was open before the line above)
    let why = '';
    if (s.go) await b.go(new URL(s.go, base).href);
    else if (s.type) why = await b.ev(`window.__walk.type(${q(s.type)}, ${q(s.text)})`);
    else if (s.click) why = await b.ev(`window.__walk.click(${q(s.click)})`);
    else if (s.press) why = await b.ev(`window.__walk.press(${q(s.press)})`);
    else if (s.see && !(await waitText(s.see, true, s.within ?? 5000))) {
      await arm();
      const near = await b.ev(`window.__walk.near(${q(s.see)})`);
      why = `the page does not show it${near.length ? `; it shows: ${near.map((l) => `"${l}"`).join(', ')}` : ''}`;
    } else if (s.gone && !(await waitText(s.gone, false, s.within ?? 5000))) why = 'it is still on the page';
    if (why) return `step ${i + 1} of ${w.steps.length} (${sayStep(s)}): ${why}`;
  }
  await arm();
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
