// The weekly retro's numbers (no I/O here): what shipped per week and the streak, and whether the code's health moved
// (the baseline's known exceptions, the tests) since a week ago. A script counts; /retro reads the counts and asks why.
import { isoWeek } from './secops.mjs';

const weekKey = (d) => { const w = isoWeek(d); return `${w.year}-W${String(w.week).padStart(2, '0')}`; };
const FEATURE = (s) => /^[A-Z][\w &/-]{0,30}:\s/.test(s) && !/^(Workflow|Decisions):/.test(s) && !/^(Merge|Revert "|Release v?\d)/.test(s);

/** Features shipped per week, the newest last, over `weeks` weeks ending at `now`: [{ week, features }]; and the streak (weeks
 *  in a row, up to now, with at least one). `commits`: [{ date, subject }] of main's own line. */
export function shipping(commits, now = new Date(), weeks = 8) {
  const keys = [];
  for (let i = weeks - 1; i >= 0; i--) keys.push(weekKey(new Date(now.getTime() - i * 7 * 86_400_000)));
  const count = new Map(keys.map((k) => [k, 0]));
  for (const c of commits) { const k = weekKey(new Date(c.date)); if (count.has(k) && FEATURE(c.subject)) count.set(k, count.get(k) + 1); }
  const list = keys.map((week) => ({ week, features: count.get(week) }));
  let streak = 0;
  // the current week may still be young: the streak counts from last week when this one has nothing yet
  const from = list.at(-1).features ? list.length - 1 : list.length - 2;
  for (let i = from; i >= 0 && list[i].features > 0; i--) streak++;
  return { weeks: list, streak };
}

/** How the code's health moved between two baselines (parsed workflow/tools/baseline.json) and test counts: [line]. */
export function healthMoves(then, now, testsThen, testsNow) {
  const n = (b, k) => (Array.isArray(b?.[k]) ? b[k].length : b?.[k] && typeof b[k] === 'object' ? Object.keys(b[k]).length : 0);
  const out = [];
  for (const [k, say] of [['sizes', 'big files'], ['functions', 'long functions'], ['boundaries', 'layer exceptions'], ['copies', 'copied functions'], ['cycles', 'import circles'], ['untested', 'files no test reaches'], ['docs', 'stale doc references']]) {
    const a = n(then, k);
    const b = n(now, k);
    if (a !== b) out.push(`${say}: ${a} -> ${b} (${b < a ? 'better' : 'worse: a baseline grew, look at why'})`);
  }
  if (testsThen != null && testsNow != null && testsThen !== testsNow) out.push(`test files: ${testsThen} -> ${testsNow}`);
  return out.length ? out : ['no change in the known exceptions or the number of test files'];
}

// the sign and the first date after it, whatever the words between ("look on", "check by", "(2026-12-01)")
const SIGN = /How we will know it worked:?\s*([\s\S]+?)[\s,;(]*(?:\b(?:look|check|see)\w*(?:\s+(?:again|back|at it))?\s+(?:on|by|after)\s+|\bby\s+|\bon\s+)?(\d{4}-\d{2}-\d{2})/i;
const LOOKED = /^Looked(?: on \d{4}-\d{2}-\d{2})?:/i;

/**
 * The shipped cards whose "how we will know it worked" is due a look: [{ number, title, sign, on }], oldest first. Read from
 * the comment /ship writes ("Shipped. How we will know it worked: <sign>, look on <date>."); a later comment starting
 * "Looked:" (what /retro writes once the owner looked) closes it. `issues`: gh's JSON, { number, title, comments: [{ body }] }.
 */
export function signsDue(issues, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const out = [];
  for (const i of issues ?? []) {
    const bodies = (i.comments ?? []).map((c) => String(c.body ?? ''));
    const at = bodies.findLastIndex((b) => SIGN.test(b));
    if (at < 0 || bodies.slice(at + 1).some((b) => LOOKED.test(b.trim()))) continue;
    const [, sign, on] = SIGN.exec(bodies[at]);
    if (on <= today) out.push({ number: i.number, title: i.title, sign: sign.replace(/[.\s]+$/, ''), on });
  }
  return out.sort((a, b) => a.on.localeCompare(b.on));
}

const PRODUCT_SIGN = /^- (\d{4}-\d{2}-\d{2}):\s*(.+?)(?:\s+\(([^)]*)\))?\s*$/;

/**
 * The same from docs/PRODUCT.md, *Signs to look at*, where /ship writes every sign (with a board or without): one line each,
 * "- <date>: <sign> (<what shipped>)"; a line with "Looked:" in it is done. [{ sign, on, what }], oldest first.
 */
export function signsDueInProduct(md, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const lines = String(md ?? '').split('\n');
  const start = lines.findIndex((l) => /^## Signs to look at\s*$/.test(l));
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? undefined : end).map((l) => PRODUCT_SIGN.exec(l.trim()))
    .filter((m) => m && !/\bLooked:/i.test(m[0]) && m[1] <= today)
    .map((m) => ({ sign: m[2], on: m[1], what: m[3] ?? '' }))
    .sort((a, b) => a.on.localeCompare(b.on));
}
