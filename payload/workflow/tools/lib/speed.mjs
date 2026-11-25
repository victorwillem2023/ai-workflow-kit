// The speed check's judgement (no I/O here; workflow/tools/speed.mjs measures). Each built page on a slow phone: how long until
// the first screen shows (the largest paint), until a person can use it (the page's own "ready" test), and how long a tap on its
// main button takes to answer. Today's numbers are the baseline the first time; after that a page may not get slower than its
// baseline with a little room (timings move a bit run to run). Google's lines for good (2.5 s first screen, 200 ms a tap) are said
// as advice, never failed on alone: an older app starts from where it is.

/** How much slower than its baseline a number may get: a share of it, plus the few milliseconds each one moves run to run. */
export const ROOM = 0.25;
export const SLACK_MS = { firstMs: 150, usableMs: 150, tapMs: 50 };
/** Google's Core Web Vitals lines for good: the largest paint and the answer to a tap (https://web.dev/articles/vitals). */
export const GOOD = { firstMs: 2500, tapMs: 200 };
const NAMES = { firstMs: 'first screen', usableMs: 'usable', tapMs: 'a tap answered' };

/** The two networks a walk is timed on: the floor Google tests a phone on (Lighthouse: 150 ms, 1.6 Mbit/s, the processor slowed
 * 4 times) and the normal case (the kit's own: fast 4G, 40 ms, 9 Mbit/s, full speed). */
export const LINES = {
  slow: { label: 'slow 4G', latency: 150, downKbit: 1600, upKbit: 750, cpu: 4 },
  fast: { label: 'fast 4G', latency: 40, downKbit: 9000, upKbit: 1500, cpu: 1 },
};

/**
 * A walk's steps as the moments a person waits for: each action (open, type, click, press, swipe, go) with the waits after it
 * (see, gone), named by the action's `name`, else the first wait's, else the action itself. The first is opening the page.
 */
export function timedSteps(w, say = (s) => JSON.stringify(s)) {
  const all = [{ go: w.path ?? '/', name: w.open ?? 'open the app', opens: true }, ...w.steps];
  const groups = [];
  for (const s of all) {
    const wait = s.see !== undefined || s.gone !== undefined;
    if (wait && groups.length) { groups.at(-1).steps.push(s); groups.at(-1).name ??= s.name; continue; }
    groups.push({ name: s.name, steps: [s] });
  }
  // a name used twice gets a number, so each step has its own reference
  const seen = new Map();
  return groups.map((g) => {
    const name = g.name ?? say(g.steps[0]);
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return { ...g, name: n > 1 ? `${name} (${n})` : name };
  });
}

/** What a step downloaded, in one line: the biggest first, a run of files from one place (map tiles) as one entry. */
export function downloadLine(files) {
  const kb = (b) => Math.round(b / 102.4) / 10;
  const total = files.reduce((n, f) => n + f.bytes, 0);
  const place = (u) => { try { const x = new URL(u); return `${x.host}/${x.pathname.split('/').filter(Boolean)[0] ?? ''}`; } catch { return u; } };
  const runs = new Map();
  // the app's own scripts and styles are each named (the heavy library is the point); a run of other files from one place is one
  const named = (u) => /\.(m?js|css)(\?|$)/.test(String(u));
  for (const f of files) { const k = named(f.url) ? `file#${f.url}` : place(f.url); runs.set(k, [...(runs.get(k) ?? []), f]); }
  const items = [...runs.entries()].flatMap(([p, fs]) => (fs.length > 3 && !p.startsWith('file#') ? [{ what: `${p} x${fs.length}`, bytes: fs.reduce((n, f) => n + f.bytes, 0) }]
    : fs.map((f) => ({ what: String(f.url).split('?')[0].split('/').pop() || place(f.url), bytes: f.bytes }))));
  items.sort((a, b) => b.bytes - a.bytes);
  return `downloaded ${kb(total)} KB${items.length ? `: ${items.slice(0, 3).map((i) => `${i.what} ${kb(i.bytes)} KB`).join(', ')}${items.length > 3 ? `, and ${items.length - 3} more` : ''}` : ''}`;
}

/**
 * One timed walk's verdict: { ok, slower, lines }. `steps`: [{ name, slowMs, fastMs, downloads }] in order; `base`: { <name>:
 * { slowMs, fastMs } } from the main folder, or nothing (today's numbers become it). Every line says the reference, so a
 * hand-over can show before and after.
 */
export function walkVerdict(walk, steps, base) {
  const lines = [`speed walk ${walk}: ${steps.length} steps, each on ${LINES.slow.label} with a slowed phone and on ${LINES.fast.label}${base ? '' : '; today\'s numbers are its baseline'}`];
  const slower = [];
  for (const s of steps) {
    const was = base?.[s.name];
    const worse = was ? ['slowMs', 'fastMs'].filter((k) => s[k] != null && was[k] != null && s[k] > limitOf(was[k], 'usableMs')) : [];
    if (worse.length) slower.push(s.name);
    lines.push(`  ${s.name}: ${say(s.slowMs)} on ${LINES.slow.label}, ${say(s.fastMs)} on ${LINES.fast.label}${was ? ` (was ${say(was.slowMs)}, ${say(was.fastMs)})` : ''}${worse.length ? ' SLOWER' : ''}`);
    if (s.downloads?.length && s.downloads.reduce((n, f) => n + f.bytes, 0) >= 50 * 1024) lines.push(`    ${downloadLine(s.downloads)}`);
  }
  if (slower.length) lines.push(`  slower than before: ${slower.join(', ')}. Load what the step does not need later, or keep the heavy part off the first screen; worth it: npm run speed -- --update in the main folder, with the owner's yes.`);
  return { ok: !slower.length, slower, lines };
}

export const median = (xs) => { const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const say = (ms) => (ms >= 1000 ? `${Math.round(ms / 100) / 10} s` : `${Math.round(ms)} ms`);

/** The limit for one number (`kind`: firstMs, usableMs, tapMs): its baseline with room. */
export const limitOf = (base, kind) => Math.round(base * (1 + ROOM) + SLACK_MS[kind]);

/**
 * One page's verdict: { ok, slower: [names], lines }. `today` and `base` are { firstMs, usableMs, tapMs } (tapMs null: no tap set);
 * no base: today's numbers become it.
 */
export function speedVerdict(page, today, base) {
  const shown = Object.keys(NAMES).filter((k) => today[k] != null).map((k) => `${NAMES[k]} ${say(today[k])}`).join(', ');
  const lines = [`speed (${page}): ${shown} (a slow phone on slow 4G)${base ? '' : '; today\'s numbers are its baseline'}`];
  const slower = base ? Object.keys(NAMES).filter((k) => today[k] != null && base[k] != null && today[k] > limitOf(base[k], k)) : [];
  for (const k of slower) lines.push(`  slower than before: ${NAMES[k]} ${say(today[k])} (was ${say(base[k])}, allowed up to ${say(limitOf(base[k], k))})`);
  for (const k of Object.keys(GOOD)) if (today[k] != null && today[k] > GOOD[k]) lines.push(`  advice: ${NAMES[k]} is over Google's line for good (${say(GOOD[k])})`);
  if (slower.length) lines.push('  Load the heavy part after the first screen (import()), show the screen before its data, or make the tap do less before it answers; a slower page that is worth it: npm run speed -- --update, with the owner\'s yes and why.');
  return { ok: !slower.length, slower, lines };
}
