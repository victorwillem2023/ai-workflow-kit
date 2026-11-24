// Today's work (no I/O here; npm run board -- --today says it, and --next with it; /next and /work offer it first): the free room
// filled, instead of one card at a time. Free room is the limit on work in progress (board.wip) minus the work running, where a
// session's cards count once (lib/focus.mjs roomToStart). The cards to start are taken in the goal's order (the ranking, kept to
// the picked focus); each free place is one session. A small card joins another small card on the same part of the app (at most
// three in a session), or takes a place of its own when nothing shares it. A card that changes a part that a running or picked
// card changes waits, and so does one that needs a picked card first: both are said on an "after" line, so nothing is hidden.
// A card's part: its places on the app map, else the folders its "Touches" line names, else its area label; a card with none of
// them cannot be checked against the others (said, never hidden). Its files, where they are known, are checked first: what a
// running session really changes and what a waiting spec names (`claims`, lib/claims.mjs), else its "Touches" line.
import { roomToStart } from './focus.mjs';
import { cardGraph } from './cardgraph.mjs';
import { meet, touchedPaths } from './claims.mjs';

const small = (c) => c.labels.some((l) => /^effort:\s*small$/i.test(l));
const short = (s) => String(s).replace(/^area:\s*/i, '');
const tags = (ns) => ns.map((n) => `#${n}`).join(', ');
/** The folders a card's "Touches" line names ("Touches: src/web/controller.ts, src/core/geo.ts"): a guess from its text. */
export const touchedParts = (body) => {
  const line = /^\W*touches\W*[:.]\s*(.+)$/im.exec(String(body ?? ''))?.[1] ?? '';
  return [...new Set([...line.matchAll(/[\w.-]+(?:\/[\w.-]+)+/g)].map((m) => m[0].replace(/\/[^/]*\.\w+$/, '')))];
};

/**
 * { limit, count, free, sessions: [[number]], after: [{ card, by, place?, running?, needs? }], unknown: [number] }. `ranked`: the
 * cards to start, best first; `all`: every card; `places`: card number -> its places on the app map; `sessions`: the session
 * folders' cards (as roomToStart takes them); `claims`: card number -> the files it changes (a running session's, a waiting
 * spec's); `held`: what every running session changes ([{ topic, cards, files }]), whatever column its cards are in (one handed
 * over to the owner still holds its files).
 */
export function today(ranked, { all = ranked, places = new Map(), areas = [], limit = 2, sessions = null, perSession = 3, claims = new Map(), held: running = [] } = {}) {
  const room = roomToStart(all, limit, sessions);
  const partsOf = (c) => { const p = places.get(c.number); if (p?.length) return [...p]; const t = touchedParts(c.body); if (t.length) return t; const a = areas.find((x) => c.labels.includes(x)); return a ? [a] : []; };
  const filesOf = (c) => claims.get(c.number) ?? touchedPaths(c.body);
  const held = new Map(); // a part -> the card that changes it: the running ones first, then the ones picked here
  const heldFiles = []; // { by, files, running }: the same, by the files themselves
  // known exactly: a claim, not a guess from the map, a folder or an area; two exact claims are compared by their files only
  const exact = (c) => claims.has(c.number);
  for (const c of room.doing) for (const p of partsOf(c)) if (!held.has(p)) held.set(p, { by: c.number, running: true, exact: exact(c) });
  for (const s of running) if (s.files?.length) heldFiles.push({ by: s.cards?.[0] ?? s.topic, cards: s.cards ?? [], files: s.files, running: true });
  const inSession = new Set(running.flatMap((s) => s.cards ?? []));
  for (const c of room.doing) if (!inSession.has(c.number) && filesOf(c).length) heldFiles.push({ by: c.number, files: filesOf(c), running: true });
  const picked = [];
  const after = [];
  for (const c of ranked) {
    const parts = partsOf(c);
    const join = small(c) && picked.find((s) => s.small && s.cards.length < perSession && parts.some((p) => s.parts.includes(p)));
    // a part held by work outside the session it would join (running, or another picked session) makes it wait, joined or not
    const mine = filesOf(c);
    // (never against its own session: a card a session holds whose board move failed is still ranked)
    const onFile = heldFiles.filter((h) => !h.cards?.includes(c.number)).map((h) => [meet(mine, h.files)[0], h]).find(([f, h]) => f && !(join && join.cards.includes(h.by)));
    const clash = onFile ?? parts.map((p) => [p, held.get(p)]).find(([, h]) => h && !(h.exact && exact(c)) && !(join && join.cards.includes(h.by)));
    if (clash) { after.push({ card: c.number, by: clash[1].by, place: clash[0], running: clash[1].running }); continue; }
    const s = join || (picked.length < room.room ? { cards: [], small: small(c), parts: [] } : null);
    if (!s) continue; // the room is full: it comes on a later day
    if (!join) picked.push(s);
    s.cards.push(c.number);
    // every part a card in the session changes is the session's: a later card on one of them waits
    for (const p of parts) { if (!s.parts.includes(p)) s.parts.push(p); if (!held.has(p)) held.set(p, { by: c.number, running: false, exact: exact(c) }); }
    if (mine.length) { heldFiles.push({ by: c.number, files: mine, running: false }); s.parts.push(...mine.filter((f) => !s.parts.includes(f))); }
  }
  // what needs a picked card first starts after it (its "Depends on:" line)
  const { waitsFor } = cardGraph(all);
  const mine = new Set(picked.flatMap((s) => s.cards));
  for (const [n, deps] of waitsFor) {
    const on = deps.find((d) => mine.has(d));
    if (on && all.find((c) => c.number === n)?.state === 'open' && !after.some((a) => a.card === n)) after.push({ card: n, by: on, needs: true });
  }
  return { limit, count: room.count, free: room.room, sessions: picked.map((s) => s.cards), after, unknown: picked.filter((s) => !s.parts.length).flatMap((s) => s.cards) };
}

const who = (by) => (typeof by === 'number' ? `#${by}` : `session "${by}"`);
const afterWords = (a) => (a.needs ? `#${a.card} needs #${a.by} first` : `#${a.card} after ${who(a.by)}${a.running ? ' (in progress)' : ''}, both change ${short(a.place)}`);

/** Today's plan as lines: the one command first, then what waits and why. */
export function todayLines(t, { show = 4 } = {}) {
  if (!t.free) return [`today: no room (${t.count} of ${t.limit} in progress): finish or try what is built first (npm run board -- --room)`];
  const after = t.after.length ? [`after: ${t.after.slice(0, show).map(afterWords).join('; ')}${t.after.length > show ? `; and ${t.after.length - show} more` : ''}`] : [];
  if (!t.sessions.length) return [`today: ${t.free} of ${t.limit} free, but nothing can start beside the work running`, ...after];
  const nums = t.sessions.flat();
  const grouped = t.sessions.filter((s) => s.length > 1).map((s) => `${s.map((n) => `#${n}`).join(' + ')} in one session`);
  const how = t.sessions.length > 1 ? `${t.sessions.length} sessions side by side` : nums.length > 1 ? 'one session' : 'one card';
  const left = t.free - t.sessions.length;
  return [`today: ${t.free} of ${t.limit} free -> /work ${nums.join(' ')} (${how}${grouped.length && t.sessions.length > 1 ? `; ${grouped.join('; ')}` : ''}${left > 0 ? `; ${left} place${left === 1 ? '' : 's'} left: nothing else can start beside these` : ''})`,
    ...after, ...(t.unknown.length ? [`(${tags(t.unknown)}: no part on the app map, no "Touches" line and no area label, so nothing could check them against the others)`] : [])];
}

/** One card asked about (--together <n>): whether it fits beside the work running, and if not, what it waits for. */
export function besideLine(t, number) {
  if (t.sessions.flat().includes(number)) return `board: #${number} fits beside the work running (${t.count} of ${t.limit} in progress, ${t.free} free): /work ${number}`;
  const a = t.after.find((x) => x.card === number);
  if (a) return `board: #${number} waits: ${afterWords(a)}`;
  return `board: no room for #${number} now (${t.count} of ${t.limit} in progress): finish or try what is built first`;
}
