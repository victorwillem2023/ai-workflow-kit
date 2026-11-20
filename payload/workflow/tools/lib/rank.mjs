// What to build next, by script (no I/O here): the open cards that can be started (nothing they depend on is still open, or only
// cards that are built and wait for the owner's check: those it starts on top of),
// first-version cards first, then by worth (its value for the effort plus that of every card it unlocks), a low feasibility counting against. The labels come from `board.labels` (value, effort, feasibility,
// milestone); the owner sets them, the script only does the sum, so the order is the same every time and easy to argue with.

import { cardGraph } from './cardgraph.mjs';

const WORTH = { high: 3, medium: 2, low: 1 };
const COST = { small: 1, medium: 2, large: 4, unknown: 3 };
const ODDS = { high: 1, medium: 0.75, low: 0.5 };
/** The columns a card can be started from; the rest are being worked on, waiting, blocked or done. */
export const STARTABLE = ['Backlog', 'Needs a board or decision', 'Ready'];
/** The label of a card an agent made on its own (an open point, something noticed): it waits for the owner's yes
 *  (board --accept) before it is ranked or offered, so the list to choose from only grows by what the owner let in. */
export const TO_SORT = 'to sort';
/** The columns of a card that is built but not finished: what depends on it can start on top of it (session.mjs --on). */
export const BUILT = ['Waiting for your check'];

/** For each open card, the open cards it waits for, split: `on` built ones it can start on top of, `waits` the ones not built yet. */
function split(cards, built) {
  const { waitsFor, unlocks, unlocked } = cardGraph(cards);
  const column = new Map(cards.map((c) => [c.number, c.column]));
  const parts = new Map([...waitsFor].map(([n, deps]) => [n, {
    on: deps.filter((d) => built.includes(column.get(d))), waits: deps.filter((d) => !built.includes(column.get(d))) }]));
  return { parts, unlocks, unlocked };
}

/** The word after "<group>: " on a card ("value: high" -> "high"). */
const word = (labels, group) => labels.map((l) => new RegExp(`^${group}:\\s*(.+)$`, 'i').exec(l)?.[1]?.trim().toLowerCase()).find(Boolean);

/** One card's score and the reason in words. */
export function scoreCard(card, firstVersion) {
  const value = word(card.labels, 'value');
  const effort = word(card.labels, 'effort') ?? 'unknown';
  const feasible = word(card.labels, 'feasibility');
  const worth = WORTH[value] ?? 1.5;
  const score = (worth / (COST[effort] ?? 3)) * (ODDS[feasible] ?? 0.85) + (card.labels.includes('bug') ? 0.5 : 0);
  const v1 = Boolean(firstVersion && card.labels.includes(firstVersion));
  const why = [v1 ? 'first version' : '', `value ${value ?? 'not set'}`, `effort ${effort}`, feasible ? `feasibility ${feasible}` : '', card.labels.includes('bug') ? 'a bug' : ''].filter(Boolean).join(', ');
  return { ...card, score: Math.round(score * 100) / 100, v1, why };
}

/** The open cards that can be started now, best first: [{ number, title, column, score, v1, unlocks, why }]. The graph comes
 *  first (lib/cardgraph.mjs): a card that waits for an open card is left out (`waitingCards` lists those), and among the rest
 *  first-version cards, then by worth: a card's own value for its effort plus that of every card it unlocks (unlocking a card of
 *  little value is worth little; unlocking a valuable one is worth as much as doing it). Ties: Ready, then older. */
export function rankCards(cards, { firstVersion, columns = STARTABLE, built = BUILT } = {}) {
  const { parts, unlocks, unlocked } = split(cards, built);
  const byNo = new Map(cards.map((c) => [c.number, c]));
  return cards.filter((c) => c.state === 'open' && columns.includes(c.column) && !c.labels.includes(TO_SORT) && !(parts.get(c.number)?.waits ?? []).length)
    .map((c) => {
      const s = scoreCard(c, firstVersion);
      const u = unlocks.get(c.number) ?? 0;
      // what it opens is worth what those cards are worth
      const opens = [...(unlocked.get(c.number) ?? [])].map((n) => byNo.get(n)).filter(Boolean).reduce((t, d) => t + scoreCard(d, firstVersion).score, 0);
      const on = parts.get(c.number)?.on ?? [];
      const top = on.length ? `starts on top of ${on.map((n) => `#${n}`).join(' and ')} (built, waiting for your check)` : '';
      return { ...s, unlocks: u, worth: Math.round((s.score + opens) * 100) / 100, on, why: [top, u ? `unlocks ${u} card${u === 1 ? '' : 's'}` : '', s.why].filter(Boolean).join(', ') };
    })
    .sort((a, b) => Number(b.v1) - Number(a.v1) || b.worth - a.worth || a.on.length - b.on.length || b.unlocks - a.unlocks || (a.column === 'Ready' ? -1 : 0) - (b.column === 'Ready' ? -1 : 0) || a.number - b.number);
}

/**
 * The cards at the top of a ranking that nothing tells apart: the same place in the graph (first version, what they unlock,
 * what they start on) and the same sum of the labels. The order between them would only be the card number: it is the owner's
 * call, asked once and kept as labels (board --rate). Empty when the first card stands alone.
 */
export function topTie(ranked) {
  const key = (c) => [Number(c.v1), c.unlocks ?? 0, (c.on ?? []).length, c.score].join('|');
  const tie = ranked.length > 1 ? ranked.filter((c) => key(c) === key(ranked[0])) : [];
  return tie.length > 1 ? tie : [];
}

/** The startable open cards that wait for another open card: [{ number, title, waitsFor: [n...] }], and the loops. */
export function waitingCards(cards, { columns = STARTABLE, built = BUILT } = {}) {
  const { loops, unknown } = cardGraph(cards);
  const { parts } = split(cards, built);
  const waiting = cards.filter((c) => c.state === 'open' && columns.includes(c.column) && (parts.get(c.number)?.waits ?? []).length)
    .map((c) => ({ number: c.number, title: c.title, waitsFor: parts.get(c.number).waits }));
  return { waiting, loops, unknown };
}

/** The issues tools keep open for themselves, by title: Renovate's Dependency Dashboard (its default title; a project that
 *  renamed it in renovate.json passes that name too). They have no label to tell them by. */
export const TOOL_ISSUES = ['Dependency Dashboard'];

/** Open issues that are not on the board yet (feedback, error alerts, ideas filed on GitHub), apart from the reports and the
 *  issues tools keep open (the SecOps report and access review by label, Renovate's dashboard by title). */
export function inbox(cards, ignoreLabels = ['security-report', 'access-review'], ignoreTitles = TOOL_ISSUES) {
  return cards.filter((c) => c.state === 'open' && !c.column && !c.labels.some((l) => ignoreLabels.includes(l)) && !ignoreTitles.includes(c.title));
}
