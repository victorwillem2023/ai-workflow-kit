// What the state of the code says to work on (no I/O here; npm run health -- --hotspots shows it, the code health goal names the
// first ones). Each suggestion comes from a principle that real teams work by, and names the files and the numbers behind it:
//   hotspot          a file changed often that is also too big or has long functions: the code you keep paying for. Refactor
//                    where you work, not where it is ugly (changes x size, after Adam Tornhill's "Your Code as a Crime Scene").
//   untested-churn   a file changed often with no test: every change is a guess. Pin what it does with tests first
//                    (Michael Feathers, "Working Effectively with Legacy Code").
//   bug-cluster      an area with several open bugs: stabilise it before building more on it (stop the line).
//   fix-streak       an area with many fixes in a short time (bug cards closed, bug cards shipped), even when no file stands
//                    out: the shape is wrong, not the details. Step back and draw its flow before the next fix.
//   flaky            tests that fail now and then: a check nobody trusts is a check nobody reads. Fix them first.
//   circles          files that import each other in a circle: nothing in it can change alone. Untangle the circle.
//   in-the-way       a file the builders of several shipped cards said got in their way (lib/shipped.mjs, noted at /ship): the
//                    people who just changed it said so, which no count of lines can.

/** How often each file changed: a Map from `git log --name-only --format=` output (one file per line, blank lines between). */
export function churn(log) {
  const m = new Map();
  for (const line of String(log).split(/\r?\n/)) { const f = line.trim(); if (f) m.set(f, (m.get(f) ?? 0) + 1); }
  return m;
}

/**
 * The suggestions, best first: [{ kind, principle, what, files, score }]. `changes`: churn(); `baseline`: the gate's
 * (sizes { file: lines }, functions { "file|name": lines } or [..], untested [file], cycles [[file]]); `bugs`: open bug cards
 * with their area; `flaky`: the flaky list's files; `hard`: lib/shipped.mjs hardFiles(); `fixes`: fixStreaks(). At most `n`.
 */
export function hotspots({ changes = new Map(), baseline = {}, bugs = [], flaky = [], hard = [], fixes = [], days = 90, n = 6 } = {}) {
  const out = [];
  const sizes = baseline.sizes ?? {};
  const fnFiles = new Map();
  for (const k of Array.isArray(baseline.functions) ? baseline.functions : Object.keys(baseline.functions ?? {})) {
    const f = String(k).split('|')[0];
    fnFiles.set(f, (fnFiles.get(f) ?? 0) + 1);
  }
  const hot = [...changes].filter(([f, c]) => c >= 3 && (sizes[f] || fnFiles.get(f))).map(([f, c]) => ({ f, c, score: c * ((sizes[f] ? sizes[f] / 100 : 0) + (fnFiles.get(f) ?? 0)) }))
    .sort((a, b) => b.score - a.score).slice(0, 3);
  for (const h of hot) out.push({ kind: 'hotspot', principle: 'refactor where you work: a file you change often costs you on every change', score: h.score,
    what: `${h.f} changed in ${h.c} commits in ${days} days${sizes[h.f] ? `, ${sizes[h.f]} lines` : ''}${fnFiles.get(h.f) ? `, ${fnFiles.get(h.f)} long function${fnFiles.get(h.f) === 1 ? '' : 's'}` : ''}: split it along what changes together`, files: [h.f] });
  const untested = new Set(baseline.untested ?? []);
  const risky = [...changes].filter(([f, c]) => c >= 3 && untested.has(f)).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (risky.length) out.push({ kind: 'untested-churn', principle: 'a test before the change: code you change often with no test is a guess every time', score: risky.reduce((t, [, c]) => t + c, 0) * 2,
    what: `changed often with no test: ${risky.map(([f, c]) => `${f} (${c})`).join(', ')}: pin what each does with tests`, files: risky.map(([f]) => f) });
  const byArea = new Map();
  // bugs with no area are no cluster: nothing says they belong together (the board tidy-up gives each an area)
  for (const b of bugs.filter((x) => x.area)) byArea.set(b.area, [...(byArea.get(b.area) ?? []), b.number]);
  for (const [area, nums] of [...byArea].filter(([, x]) => x.length >= 3).sort((a, b) => b[1].length - a[1].length).slice(0, 2)) {
    out.push({ kind: 'bug-cluster', principle: 'stabilise before you build on it: bugs gather where the design is weak', score: nums.length * 5,
      what: `${nums.length} open bugs in ${String(area).replace(/^area:\s*/i, '')} (${nums.slice(0, 6).map((x) => `#${x}`).join(', ')}): fix them as one goal, and look for the shared cause`, files: [] });
  }
  for (const s of fixes.slice(0, 2)) out.push({ kind: 'fix-streak', principle: STREAK, score: s.fixes.length * 6,
    what: streakLine(s), files: [], area: s.area });
  if (flaky.length) out.push({ kind: 'flaky', principle: 'a check nobody trusts is a check nobody reads: fix flaky tests first', score: flaky.length * 8,
    what: `${flaky.length} flaky test file${flaky.length === 1 ? '' : 's'}: ${flaky.slice(0, 4).join(', ')}`, files: flaky });
  const cycles = baseline.cycles ?? [];
  if (cycles.length) out.push({ kind: 'circles', principle: 'parts that import each other cannot change alone: untangle the circle', score: cycles.length * 3,
    what: `${cycles.length} import circle${cycles.length === 1 ? '' : 's'}, the first: ${[].concat(cycles[0]).slice(0, 4).join(' -> ')}`, files: [].concat(cycles[0]) });
  for (const h of hard.slice(0, 2)) out.push({ kind: 'in-the-way', principle: 'ask who just changed it: a file that got in the way of several cards will get in the way of the next', score: h.cards.length * 6,
    what: `${h.file} got in the way of ${h.cards.length} shipped cards (${h.cards.slice(0, 4).join(', ')}): ${h.whys.at(-1)}`, files: [h.file] });
  return out.sort((a, b) => b.score - a.score).slice(0, n);
}

const STREAK = 'step back: a run of fixes in one place means its shape is wrong, not its details';
const areaName = (a) => String(a).replace(/^area:\s*/i, '');
/** "<n> fixes in <area> in <days> days (#1, #2, ...): ..." for one streak. */
export const streakLine = (s) => `${s.fixes.length} fixes in ${areaName(s.area)} in ${s.days} days (${s.fixes.slice(0, 6).join(', ')}${s.fixes.length > 6 ? ', ...' : ''}): ` +
  'stop patching it and draw its flow first: its jobs in order, each with one home (docs/anatomy/<flow>.md)';

/**
 * The areas with a streak of fixes, most first: [{ area, fixes: ['#12' | '<topic>'], days }]. `fixes`: [{ area, at, card?,
 * topic? }] (closed bug cards, shipped bug records); counted once per card within `days` of `now`, from `count` on.
 * `setting`: board.fixStreak in workflow/config.json ({ count, days }, false turns it off).
 */
export function fixStreaks(fixes, setting = {}, now = new Date()) {
  if (setting === false) return [];
  const count = setting?.count ?? 5, days = setting?.days ?? 7;
  const since = now.getTime() - days * 864e5;
  const byArea = new Map();
  for (const f of fixes) {
    const t = Date.parse(f.at ?? '');
    if (!f.area || !(t >= since)) continue;
    const key = f.card ? `#${f.card}` : f.topic;
    if (!key) continue;
    byArea.set(f.area, new Set([...(byArea.get(f.area) ?? []), key]));
  }
  return [...byArea].filter(([, s]) => s.size >= count).sort((a, b) => b[1].size - a[1].size).map(([area, s]) => ({ area, fixes: [...s], days }));
}

/** The suggestions as text, one per line with its principle under it. */
export const hotspotLines = (list) => (list.length
  ? ['what the code says to work on, best first:', ...list.flatMap((h, i) => [`${i + 1}. ${h.what}`, `   why: ${h.principle}`])]
  : ['nothing stands out: no file is both changed often and too big, no bug cluster, no flaky test, no file that got in the way twice']).join('\n');
