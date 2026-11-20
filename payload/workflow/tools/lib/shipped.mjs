// What each shipped card took (no I/O here; workflow/tools/shipped.mjs keeps and shows the records, session.mjs --finish writes
// one per feature): the size of the change, the days, the rounds with the owner, what the review found and which files got in
// the way. The plan side of a card is its labels; this is the other side, so the kit can compare them instead of asking the
// owner to remember:
//   calibrate    what a small, medium and large card really are here (lib/rank.mjs then counts effort with those numbers), the
//                areas where cards run bigger than their label, and the cards that were far bigger than they looked
//   hardFiles    the files builders said got in the way of more than one card (lib/hotspots.mjs makes them a suggestion)
//   areaFiles    the files the cards of an area usually change (lib/cardcode.mjs: what the next card of that area will touch)
//   tookLines    all of it as text, for npm run shipped and the weekly retro
// The records live in git's common folder (workflow-shipped.jsonl, a line each): no commit, and every session folder of the
// project writes to the same file.

export const FILE = 'workflow-shipped.jsonl';
/** The kinds of review finding a record counts, so they add up over cards (.claude/skills/review/SKILL.md asks them in this order). */
export const FINDINGS = ['missing', 'extra', 'tests', 'two-ways', 'messier', 'rule-copied', 'safety', 'data', 'other'];
const SAY = { missing: 'something the spec asked for was missing', extra: 'something was built that the spec never asked for', tests: 'a test that would not catch its mistake',
  'two-ways': 'a second way of doing one job', messier: 'code that grew messier to fit the change', 'rule-copied': 'a rule written a second time', safety: 'a safety finding', data: 'an unsafe data change', other: 'another finding' };
const EFFORTS = ['small', 'medium', 'large'];
// files a script writes: they say nothing about the size of the work
const GENERATED = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|go\.sum|uv\.lock)$|^docs\/(MAP|README)\.md$/;

const median = (list) => { const s = [...list].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round1 = (n) => Math.round(n * 10) / 10;
const word = (labels, group) => labels.map((l) => new RegExp(`^${group}:\\s*(.+)$`, 'i').exec(l)?.[1]?.trim().toLowerCase()).find(Boolean);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const tag = (r) => (r.cards.length ? r.cards.map((n) => `#${n}`).join(', ') : r.topic);

/** `git diff --numstat --no-renames` as [{ file, lines }], without the files a script writes (a binary file counts 0 lines). */
export function parseNumstat(text) {
  return String(text ?? '').split(/\r?\n/).map((l) => /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(l)).filter(Boolean)
    .map((m) => ({ file: m[3], lines: (Number(m[1]) || 0) + (Number(m[2]) || 0) })).filter((f) => !GENERATED.test(f.file));
}

/**
 * One record, from what the finish knows: { at, topic, cards, subject, started, days, files, lines, effort, areas, type, tokens }.
 * `labels`: the labels of its cards together; the effort is the biggest of them (cards built as one are as big as the biggest).
 */
export function shipRecord({ topic, cards = [], subject = '', at = new Date(), started = null, numstat = '', labels = [], areas = [], types = [], tokens = null }) {
  const changed = parseNumstat(numstat);
  const efforts = labels.map((l) => /^effort:\s*(\w+)/i.exec(l)?.[1]?.toLowerCase()).filter((e) => EFFORTS.includes(e));
  const begun = started ? new Date(started) : null;
  return {
    at: new Date(at).toISOString(), topic, cards: cards.map(Number).filter(Boolean), subject,
    started: begun && !Number.isNaN(begun.getTime()) ? begun.toISOString() : null,
    days: begun && !Number.isNaN(begun.getTime()) ? Math.max(0, Math.round((new Date(at) - begun) / 86_400_000)) : null,
    files: changed.map((f) => f.file), lines: changed.reduce((t, f) => t + f.lines, 0),
    effort: EFFORTS.findLast((e) => efforts.includes(e)) ?? null, areas: areas.filter((a) => labels.includes(a)), type: types.find((t) => labels.includes(t)) ?? null,
    tokens: tokens || null, rounds: null, review: null, hard: [],
  };
}

/** The records of a file's text, oldest first (a line that is no record is left out). */
export function parseRecords(text) {
  return String(text ?? '').split(/\r?\n/).filter((l) => l.trim()).flatMap((l) => { try { const r = JSON.parse(l); return r?.topic && Array.isArray(r.files) ? [{ cards: [], areas: [], hard: [], ...r }] : []; } catch { return []; } });
}
export const recordsText = (records) => records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');

/** The records with `record` added; a finish of the same topic within two weeks (a pull request finished again) replaces its
 *  earlier one and keeps what was noted on it. */
export function addRecord(records, record) {
  const at = records.findLastIndex((r) => r.topic === record.topic && new Date(record.at) - new Date(r.at) < 14 * 86_400_000);
  if (at < 0) return [...records, record];
  const old = records[at];
  return [...records.slice(0, at), { ...record, started: record.started ?? old.started, days: record.days ?? old.days, rounds: old.rounds, review: old.review, hard: old.hard }, ...records.slice(at + 1)];
}

/** "two-ways=1, tests=2" (or "none") as { kind: count }; a kind the list does not have counts as "other". Null when nothing was said. */
export function parseReview(text) {
  if (text == null || !String(text).trim()) return null;
  const out = {};
  if (/^none$/i.test(String(text).trim())) return out;
  for (const part of String(text).split(/[,;]+/)) {
    const m = /^\s*([\w-]+)\s*(?:[=:]\s*(\d+))?\s*$/.exec(part);
    if (!m) continue;
    const kind = FINDINGS.includes(m[1].toLowerCase()) ? m[1].toLowerCase() : 'other';
    out[kind] = (out[kind] ?? 0) + (Number(m[2]) || 1);
  }
  return out;
}

/** "src/core/plan.ts: every caller builds its own week" as { file, why }, or null when it names no file. */
export function parseHard(text) {
  const m = /^\s*([^\s:]+\.[A-Za-z0-9]+)\s*:\s*(.+?)\s*$/.exec(String(text ?? ''));
  return m ? { file: m[1].replace(/\\/g, '/'), why: m[2].slice(0, 200) } : null;
}

/** The records with what the builder noted added to the last one of `topic`: { records, found }. */
export function withNote(records, topic, { rounds = null, review = null, hard = [] } = {}) {
  const at = records.findLastIndex((r) => r.topic === topic);
  if (at < 0) return { records, found: false };
  const r = records[at];
  const files = new Set((r.hard ?? []).map((h) => h.file));
  const next = { ...r, rounds: rounds ?? r.rounds, review: review ?? r.review, hard: [...(r.hard ?? []), ...hard.filter((h) => h && !files.has(h.file))] };
  return { records: [...records.slice(0, at), next, ...records.slice(at + 1)], found: true };
}

/**
 * What the effort labels mean here, from the records: { n, by: { small: { n, lines, files, rounds, days, tokens } ... },
 * cost: { small: 1, medium, large } | null, areas: { "<area label>": factor }, outliers: [record] }.
 * `cost`: a medium and a large card in small ones, by the size of the change (the lines changed, the one number every record
 * has), only for a label with `min` (5) records and only when small has them too; kept between sensible ends (medium 1.2 to 4,
 * large 2 to 8). `areas`: where cards run 1.4 times their label or more (or 0.7 and less), from four cards on. `outliers`: the
 * cards two and a half times their label's usual size, newest first.
 */
export function calibrate(records, { min = 5 } = {}) {
  const by = {};
  for (const e of [...EFFORTS, 'none']) {
    const mine = records.filter((r) => (r.effort ?? 'none') === e);
    const known = (k) => mine.map((r) => r[k]).filter((v) => v != null);
    if (mine.length) by[e] = { n: mine.length, lines: Math.round(median(mine.map((r) => r.lines))), files: Math.round(median(mine.map((r) => r.files.length))),
      rounds: known('rounds').length ? median(known('rounds')) : null, days: known('days').length ? median(known('days')) : null, tokens: known('tokens').length ? Math.round(median(known('tokens'))) : null };
  }
  const enough = (e) => (by[e]?.n ?? 0) >= min && by[e].lines > 0;
  let cost = null;
  if (enough('small') && (enough('medium') || enough('large'))) {
    const medium = enough('medium') ? round1(clamp(by.medium.lines / by.small.lines, 1.2, 4)) : 2;
    const large = enough('large') ? round1(clamp(by.large.lines / by.small.lines, Math.max(2, medium), 8)) : Math.max(4, medium);
    cost = { small: 1, medium, large, measured: EFFORTS.filter(enough) };
  }
  const areas = {};
  for (const a of new Set(records.flatMap((r) => r.areas ?? []))) {
    const ratios = records.filter((r) => (r.areas ?? []).includes(a) && enough(r.effort)).map((r) => r.lines / by[r.effort].lines);
    const f = ratios.length >= 4 ? round1(clamp(median(ratios), 0.5, 2.5)) : 1;
    if (f >= 1.4 || f <= 0.7) areas[a] = f;
  }
  const outliers = records.filter((r) => enough(r.effort) && r.lines >= 2.5 * by[r.effort].lines).reverse();
  return { n: records.length, by, cost, areas, outliers };
}

/** The files builders said got in the way of `min` (2) cards or more: [{ file, cards: [tag], whys }], the most named first. */
export function hardFiles(records, { min = 2 } = {}) {
  const m = new Map();
  for (const r of records) for (const h of r.hard ?? []) m.set(h.file, [...(m.get(h.file) ?? []), { tag: tag(r), why: h.why }]);
  return [...m].filter(([, list]) => list.length >= min).map(([file, list]) => ({ file, cards: list.map((x) => x.tag), whys: list.map((x) => x.why) }))
    .sort((a, b) => b.cards.length - a.cards.length || a.file.localeCompare(b.file));
}

/** The files the last `last` (8) shipped cards of an area changed in at least half of them (and twice): [{ file, of, total }]. Docs are left out. */
export function areaFiles(records, area, { last = 8 } = {}) {
  const mine = records.filter((r) => (r.areas ?? []).includes(area)).slice(-last);
  const count = new Map();
  for (const r of mine) for (const f of new Set(r.files)) if (!/\.md$/i.test(f)) count.set(f, (count.get(f) ?? 0) + 1);
  return [...count].filter(([, c]) => c >= 2 && c * 2 >= mine.length).map(([file, c]) => ({ file, of: c, total: mine.length })).sort((a, b) => b.of - a.of || a.file.localeCompare(b.file));
}

/** The kinds of finding the review keeps making: in three or more of the last `last` (8) reviewed cards, and at least half of them. */
export function reviewPatterns(records, { last = 8 } = {}) {
  const seen = records.filter((r) => r.review).slice(-last);
  return FINDINGS.map((kind) => ({ kind, say: SAY[kind], cards: seen.filter((r) => r.review[kind] > 0).length, of: seen.length }))
    .filter((p) => p.cards >= 3 && p.cards * 2 >= p.of).sort((a, b) => b.cards - a.cards);
}

const name = (a) => String(a).replace(/^area:\s*/i, '');

/** What the shipped cards took, as lines (npm run shipped, the retro). `all`: every record (what the labels mean is measured
 *  over all of them); `since`: only cards shipped after it are named one by one. */
export function tookLines(all, { since = null, min = 5 } = {}) {
  if (!all.length) return ['What the cards took: no record yet (one is kept each time a feature is finished).'];
  const c = calibrate(all, { min });
  const recent = since ? all.filter((r) => new Date(r.at) >= since) : all;
  const out = [`What the cards took (${plural(all.length, 'shipped feature')} on record${since ? `, ${recent.length} since ${since.toISOString().slice(0, 10)}` : ''}):`];
  for (const e of [...EFFORTS, 'none']) {
    const b = c.by[e];
    if (!b) continue;
    out.push(`  ${e === 'none' ? 'no effort label' : e} (${b.n}): typically ${plural(b.lines, 'line')} changed in ${plural(b.files, 'file')}${b.days != null ? `, ${plural(b.days, 'day')}` : ''}${b.rounds != null ? `, ${plural(b.rounds, 'round')} with you` : ''}${b.tokens ? `, ${Math.round(b.tokens / 1000)} k tokens in its session folder` : ''}`);
  }
  if (c.cost) out.push(`  measured: a medium card is ${c.cost.medium} small ones and a large one ${c.cost.large} (the ranking counts effort with these; a label with fewer than ${min} cards keeps the usual 2 and 4)`);
  else out.push(`  the ranking still counts a medium card as 2 small ones and a large as 4: it measures them once small and one other label have ${min} shipped cards each`);
  for (const [a, f] of Object.entries(c.areas)) out.push(`  ${name(a)} cards run about ${f} times their label: ${f > 1 ? 'label the next ones a size up, or split them' : 'their labels can go a size down'}`);
  const big = c.outliers.filter((r) => recent.includes(r)).slice(0, 4);
  if (big.length) out.push(`  bigger than they looked: ${big.map((r) => `${tag(r)} (${r.effort}: ${r.lines} lines${r.rounds != null ? `, ${plural(r.rounds, 'round')}` : ''})`).join('; ')}`);
  for (const p of reviewPatterns(all)) out.push(`  the review found ${p.say} on ${p.cards} of the last ${p.of} reviewed cards: the plan is not catching it (a line in the spec's template or a check, through /lesson)`);
  const hard = hardFiles(all).slice(0, 3);
  if (hard.length) out.push(`  got in the way more than once: ${hard.map((h) => `${h.file} (${h.cards.join(', ')}: ${h.whys.at(-1)})`).join('; ')}`);
  return out;
}
