// Which cards go together (no I/O here; npm run board -- --together and --next say it, .claude/skills/work/together.md has the
// rules a person reads): the script proposes, from what the cards themselves say, so the owner is offered the grouping instead
// of having to see it. Three ways:
//   one session        small cards that touch the same place (the same part of the app map, else the same area): one
//                      change, one check, one commit, instead of a session each. At most three.
//   one after another  a card that needs another one first (its "Depends on:" line), or two bigger cards on the same place:
//                      side by side they would change the same files, so the second starts on top of the first.
//   side by side       cards in different places with nothing shared: each in its own session at the same time, as many as
//                      there is free room for (a small card with nothing to share takes a place of its own).
// A guess from labels and the map, never from the code: /work still reads the cards and may sort them again.
import { cardGraph } from './cardgraph.mjs';
import { meet, touchedPaths } from './claims.mjs';

const word = (labels, group) => labels.map((l) => new RegExp(`^${group}:\\s*(.+)$`, 'i').exec(l)?.[1]?.trim().toLowerCase()).find(Boolean);
const tag = (cards) => cards.map((c) => `#${c.number}`);
const short = (s) => String(s).replace(/^area:\s*/i, '');

/**
 * The groups: [{ how: 'one session' | 'one after another' | 'side by side', cards: [number], why }]. `cards`: the candidates,
 * best first (startable, ranked); `all`: every card (for what waits on a candidate); `places`: card number -> the places it
 * touches (parts of the app map), when there is a map; `areas`: the config's area labels; `room`: how many may run at once;
 * `claims`: card number -> the files it changes (a waiting spec's; lib/claims.mjs), else its "Touches" line's.
 */
export function together(cards, { all = cards, places = new Map(), areas = [], room = 3, claims = new Map() } = {}) {
  const groups = [];
  const used = new Set();
  const area = (c) => areas.find((a) => c.labels.includes(a)) ?? null;
  const at = (c) => [...(places.get(c.number) ?? [])];
  const filesOf = (c) => claims.get(c.number) ?? touchedPaths(c.body);
  const shared = (a, b) => at(a).find((p) => at(b).includes(p)) ?? meet(filesOf(a), filesOf(b))[0] ?? null;
  const small = (c) => word(c.labels, 'effort') === 'small';
  const take = (how, list, why) => { groups.push({ how, cards: list.map((c) => c.number), why }); for (const c of list) used.add(c.number); };

  // one session: small cards on the same place, else small cards of the same area
  const key = (c) => at(c)[0] ?? area(c);
  const byKey = new Map();
  for (const c of cards.filter((x) => small(x) && key(x))) byKey.set(key(c), [...(byKey.get(key(c)) ?? []), c]);
  for (const [k, list] of byKey) if (list.length >= 2) take('one session', list.slice(0, 3), `${list.length > 2 ? 'all' : 'both'} small and on ${short(k)}: one change, one check, one commit`);

  // one after another: what waits only for a candidate; then two bigger cards on the same place
  const { waitsFor } = cardGraph(all);
  const byNo = new Map(all.map((c) => [c.number, c]));
  for (const c of cards.filter((x) => !used.has(x.number))) {
    const next = [...waitsFor].filter(([n, deps]) => deps.length === 1 && deps[0] === c.number && byNo.get(n)?.state === 'open').map(([n]) => byNo.get(n))[0];
    if (next) take('one after another', [c, next], `#${next.number} needs #${c.number} first: it can start on top of it while you try #${c.number}`);
  }
  const rest = () => cards.filter((x) => !used.has(x.number));
  for (const a of rest()) {
    if (used.has(a.number)) continue;
    const b = rest().find((x) => x.number !== a.number && shared(a, x));
    if (b) take('one after another', [a, b], `both change ${short(shared(a, b))}: side by side they would touch the same files`);
  }

  // side by side: different places and areas, nothing shared, as many as may run at once
  const apart = [];
  for (const c of rest()) {
    if (apart.length >= room) break;
    if (apart.every((x) => !shared(x, c) && (area(x) ?? x.number) !== (area(c) ?? c.number))) apart.push(c);
  }
  if (apart.length >= 2) take('side by side', apart, `different parts (${apart.map((c) => short(at(c)[0] ?? area(c) ?? 'no area')).join(', ')}) with nothing shared: about as long as the longest, and ${apart.length} things to try at the end`);
  return groups;
}

/** The groups as lines for --next and --together, each with the command that starts it. */
export function togetherLines(groups) {
  return groups.map((g) => {
    const nums = g.cards.map((n) => `#${n}`);
    const say = g.how === 'one after another' ? nums.join(' then ') : g.how === 'one session' ? nums.join(' + ') : nums.join(', ');
    return `together, ${g.how}: ${say} (${g.why}) (/work ${g.cards.join(' ')})`;
  });
}
