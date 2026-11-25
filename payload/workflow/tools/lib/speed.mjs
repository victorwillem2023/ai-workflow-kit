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
