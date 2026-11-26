// Which cards a goal holds (no I/O here; npm run board -- --focus says it, /tidy focus acts on it): the open cards that look like
// they belong to it but sit in no goal (gather), and its parts when it is too big to finish in one go (split). A goal finds its
// own cards by one rule (the ends of the app map, one area label for bugs); a card made earlier, labelled otherwise or under a
// nearby area is missed by that rule, so the goal looks nearly done while its forgotten cards wait in the Backlog.
import { isDone, cardGraph } from './cardgraph.mjs';
import { BUILT } from './rank.mjs';
import { meet } from './claims.mjs';

// words that say nothing about what a card is about (stemmed as words are)
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'when', 'into', 'not', 'are', 'can', 'has', 'have', 'its',
  'our', 'your', 'one', 'all', 'new', 'add', 'make', 'show', 'use', 'does', 'doesn', 'don', 'should', 'would', 'could', 'also', 'more',
  'less', 'than', 'then', 'them', 'they', 'what', 'which', 'after', 'before', 'about', 'there', 'here', 'only', 'still', 'way', 'some',
  'any', 'each', 'bug', 'fix', 'card', 'goal', 'stabilise', 'stabilize', 'open', 'work', 'page', 'app', 'better', 'good', 'really',
  'says', 'say', 'get', 'set', 'too', 'out', 'off', 'how', 'why', 'who', 'where', 'now', 'yet', 'like', 'been', 'being'].map((w) => stem(w)));

function stem(w) {
  const one = w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w; // bugs, apps: one of them
  const s = one.length > 4 ? one.replace(/(ing|ed)$/, '') : one;
  return s.length > 3 ? s.replace(/e$/, '') : s;
}

/** A text's words that can say what it is about, stemmed (lower case, accents off; short and common words left out): stem -> the word as written. */
function stemsOf(text) {
  const raw = String(text ?? '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? [];
  const out = new Map();
  for (const w of raw.filter((x) => x.length > 2 && !/^\d+$/.test(x))) { const s = stem(w); if (s.length > 2 && !STOP.has(s) && !out.has(s)) out.set(s, w); }
  return out;
}
export const wordsOf = (text) => [...stemsOf(text).keys()];

const plain = (area) => String(area).replace(/^area:\s*/i, '');
const quoted = (ws) => ws.map((w) => `"${w}"`).join(', ');

/**
 * The open cards that look like they belong to the goal, best first: [{ number, title, column, score, why: [reason], end }].
 * `goal`: { name, area?, words?, places?, files?, ends? } (lib/goals.mjs gives the map's; a bugs goal its area); `mine`: the
 * goal's cards (done ones too: their titles say what it is about); `skip`: cards never to offer (parked, "not this goal").
 * `places`: card number -> where it sits on the app map; `files`: card number -> the files it changes (its "Touches" line).
 * A card is offered on a sign of its own: words of the goal in its title, a file the goal changes, a place of the goal on the
 * map. The same area only adds to that, so a busy area does not flood the list. `end`: what is left on the map that its title
 * is closest to, so it can be put on that end (card: [n]) and the goal finds it by itself from then on.
 */
export function gatherFor(goal, all, { mine = [], skip = [], areas = [], places = new Map(), files = new Map() } = {}) {
  const held = new Set([...mine, ...skip]);
  const open = all.filter((c) => !isDone(c) && c.column);
  const own = all.filter((c) => mine.includes(c.number));
  // a word on many cards says little about this goal (a quarter of the board), unless most of the goal's own cards have it;
  // a word on one or two cards says a lot
  const df = new Map();
  for (const c of open) for (const w of wordsOf(c.title)) df.set(w, (df.get(w) ?? 0) + 1);
  const common = Math.max(5, Math.ceil(open.length * 0.25));
  const topic = (w) => own.length >= 2 && own.filter((c) => wordsOf(c.title).includes(w)).length >= own.length / 2;
  const goalWords = new Set([goal.name, ...(goal.words ?? []), ...own.map((c) => c.title)].flatMap(wordsOf).filter((w) => (df.get(w) ?? 0) <= common || topic(w)));
  // the goal's area: the one it is about, else the ones many of its cards have
  const counted = areas.map((a) => [a, own.filter((c) => c.labels.includes(a)).length]).filter(([, n]) => n && n >= own.length * 0.3);
  const goalAreas = new Set([goal.area, ...counted.map(([a]) => a)].filter(Boolean));
  const goalFiles = [...new Set([...(goal.files ?? []), ...own.flatMap((c) => files.get(c.number) ?? [])])];
  const goalPlaces = new Set([...(goal.places ?? []), ...own.flatMap((c) => places.get(c.number) ?? [])]);
  const ends = (goal.ends ?? []).map((e) => ({ ...e, words: wordsOf(e.text) }));
  const found = [];
  for (const c of open.filter((x) => !held.has(x.number))) {
    const asWritten = stemsOf(c.title);
    const words = [...asWritten.keys()];
    const shared = words.filter((w) => goalWords.has(w));
    const why = [];
    let score = 0;
    if (shared.length) { score += Math.min(4, shared.reduce((t, w) => t + ((df.get(w) ?? 0) <= 2 ? 2 : 1), 0)); why.push(`its title shares ${quoted(shared.slice(0, 4).map((w) => asWritten.get(w)))} with the goal`); }
    const file = meet(files.get(c.number) ?? [], goalFiles)[0];
    if (file) { score += 2; why.push(`it changes ${file}, as the goal does`); }
    const place = (places.get(c.number) ?? []).find((p) => goalPlaces.has(p));
    if (place) { score += 3; why.push(`it is on the app map at ${place}`); }
    if (!score) continue; // the same area alone is no sign
    const area = areas.find((a) => goalAreas.has(a) && c.labels.includes(a));
    if (area) { score += 1; why.push(`same area (${plain(area)})`); }
    if (goal.kind === 'bugs' && c.labels.includes('bug')) { score += 1; why.push('a bug, as the goal is'); }
    if (score < 2) continue;
    const best = ends.map((e) => ({ e, n: e.words.filter((w) => words.includes(w)).length })).sort((a, b) => b.n - a.n)[0];
    found.push({ number: c.number, title: c.title, column: c.column, score, why, end: best?.n ? { text: best.e.text, where: best.e.where } : null });
  }
  return found.sort((a, b) => b.score - a.score || a.number - b.number);
}

/** The cards gathered as lines: each with why, and how to take them in or leave them out for good. */
export function gatherLines(found, name, { shown = 15 } = {}) {
  if (!found.length) return [`gather: no other open card looks like it belongs to "${name}"`];
  const rows = found.slice(0, shown);
  const ns = (xs) => xs.map((x) => x.number).join(',');
  return [`gather: ${found.length} open card${found.length === 1 ? ' looks' : 's look'} like ${found.length === 1 ? 'it belongs' : 'they belong'} to "${name}" and ${found.length === 1 ? 'is' : 'are'} not in it, best first:`,
    ...rows.flatMap((x) => [`  #${x.number} ${x.title} (${x.column}): ${x.why.join('; ')}`, ...(x.end ? [`      closest end on the map: "${x.end.text}" (${x.end.where})`] : [])]),
    ...(found.length > rows.length ? [`  (${found.length - rows.length} more, weaker: --focus --gather --all)`] : []),
    `take in the ones that belong: npm run board -- --focus --add ${ns(rows)} (minus the others); the others: --focus --not <n,m> (never offered for this goal again)`];
}

const chunk = (ns, size) => { const parts = Math.ceil(ns.length / size); const each = Math.ceil(ns.length / parts); return Array.from({ length: parts }, (_, i) => ns.slice(i * each, (i + 1) * each)).filter((p) => p.length); };
const NOW = ['In progress', 'Waiting for your check'];

/**
 * A goal too big for one go cut into parts of a few days each: [{ name, cards }] in the order to do them. `order`: the goal's
 * cards in its order (its waves); `places`: card -> where it sits on the app map; `size`: about how many cards a part holds.
 * The cards are grouped by where they sit on the map, else by area; with one group only, the goal's order is cut in pieces.
 * A part with work running comes first, and what a card needs is never in a later part. [] when it is small enough.
 */
export function splitGoal(order, { all, places = new Map(), areas = [], size = 5 } = {}) {
  const byNo = new Map(all.map((c) => [c.number, c]));
  const open = [...new Set(order)].filter((n) => byNo.has(n) && !isDone(byNo.get(n)));
  if (open.length <= size) return [];
  const keyOf = (n) => places.get(n)?.[0]?.split(' › ').at(-1) ?? plain(areas.find((a) => byNo.get(n).labels.includes(a)) ?? '');
  const groups = new Map();
  for (const n of open) groups.set(keyOf(n), [...(groups.get(keyOf(n)) ?? []), n]);
  const kept = [...groups].filter(([k, ns]) => k && ns.length >= 2);
  const rest = open.filter((n) => !kept.some(([, ns]) => ns.includes(n)));
  let parts = kept.length <= 1 ? chunk(open, size).map((ns, i) => ({ name: `part ${i + 1}`, cards: ns }))
    : [...kept.map(([name, cards]) => ({ name, cards })), ...(rest.length ? [{ name: 'the rest', cards: rest }] : [])]
      .flatMap((p) => (p.cards.length > size * 1.5 ? chunk(p.cards, size).map((ns, i) => ({ name: `${p.name} ${i + 1}`, cards: ns })) : [p]));
  // what runs now first, then the goal's order
  const runs = (p) => p.cards.some((n) => NOW.includes(byNo.get(n).column));
  parts = [...parts.filter(runs), ...parts.filter((p) => !runs(p))];
  // what a card needs moves up to its part (only ever to an earlier part, so it ends)
  const { waitsFor } = cardGraph(all);
  for (let moved = true; moved;) {
    moved = false;
    parts.forEach((p, i) => {
      for (const n of [...p.cards]) for (const d of waitsFor.get(n) ?? []) {
        const j = parts.findIndex((q) => q.cards.includes(d));
        if (j > i) { parts[j].cards = parts[j].cards.filter((x) => x !== d); p.cards.push(d); moved = true; }
      }
    });
  }
  return parts.filter((p) => p.cards.length);
}

/**
 * The part to work on now: the first with a card still to build (a card the board no longer has counts as done; one built and
 * waiting for the owner's check, or parked until the goal is done, does not hold the next part back); -1 when nothing is left to build.
 */
export function currentPart(parts, all, parked = []) {
  const byNo = new Map(all.map((c) => [c.number, c]));
  return (parts ?? []).findIndex((p) => p.cards.some((n) => byNo.has(n) && !parked.includes(n) && !isDone(byNo.get(n)) && !BUILT.includes(byNo.get(n).column)));
}

/** The cards of the parts after the one now: they wait, so --next does not offer them yet. */
export function laterCards(parts, all, parked = []) {
  const at = currentPart(parts, all, parked);
  return at < 0 ? [] : parts.slice(at + 1).flatMap((p) => p.cards);
}

/** Where a split goal stands, in one line: the part now, how far it is, and the parts after it; '' without parts. */
export function partLine(parts, all, parked = []) {
  const at = currentPart(parts, all, parked);
  if (!parts?.length || at < 0) return '';
  const byNo = new Map(all.map((c) => [c.number, c]));
  const p = parts[at];
  const done = p.cards.filter((n) => !byNo.has(n) || isDone(byNo.get(n))).length;
  const next = parts.slice(at + 1).map((q) => q.name);
  return `part ${at + 1} of ${parts.length} now: ${p.name} (${done} of ${p.cards.length} done)${next.length ? `; then ${next.join(', then ')}` : ''}`;
}

/** A proposed split as lines, with the command that takes it as it is. */
export function splitLines(parts, open) {
  if (!parts.length) return [`split: ${open} open card${open === 1 ? '' : 's'}: small enough for one go`];
  return [`split: ${open} open cards are too many for one go; in ${parts.length} parts, one after another:`,
    ...parts.map((p, i) => `  ${i + 1}. ${p.name}: #${p.cards.join(', #')}`),
    'take it: npm run board -- --focus --split --yes; your own: --focus --split "<name>: <n,m>" "<name>: <n,m>"; none: --focus --split --none'];
}
