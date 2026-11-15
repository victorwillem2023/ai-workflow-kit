// What to build next, by script (no I/O here): the open cards that can be started (nothing they depend on is still open),
// first-version cards first, then the ones that unlock the most, then by value for the effort, a low feasibility counting against. The labels come from `board.labels` (value, effort, feasibility,
// milestone); the owner sets them, the script only does the sum, so the order is the same every time and easy to argue with.

import { cardGraph } from './cardgraph.mjs';

const WORTH = { high: 3, medium: 2, low: 1 };
const COST = { small: 1, medium: 2, large: 4, unknown: 3 };
const ODDS = { high: 1, medium: 0.75, low: 0.5 };
/** The columns a card can be started from; the rest are being worked on, waiting, blocked or done. */
export const STARTABLE = ['Backlog', 'Needs a board or decision', 'Ready'];

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
 *  first-version cards, then the ones that unlock the most other cards, then value for the effort. Ties: Ready, then older. */
export function rankCards(cards, { firstVersion, columns = STARTABLE } = {}) {
  const { waitsFor, unlocks } = cardGraph(cards);
  return cards.filter((c) => c.state === 'open' && columns.includes(c.column) && !(waitsFor.get(c.number) ?? []).length)
    .map((c) => {
      const s = scoreCard(c, firstVersion);
      const u = unlocks.get(c.number) ?? 0;
      return { ...s, unlocks: u, why: u ? `unlocks ${u} card${u === 1 ? '' : 's'}, ${s.why}` : s.why };
    })
    .sort((a, b) => Number(b.v1) - Number(a.v1) || b.unlocks - a.unlocks || b.score - a.score || (a.column === 'Ready' ? -1 : 0) - (b.column === 'Ready' ? -1 : 0) || a.number - b.number);
}

/** The startable open cards that wait for another open card: [{ number, title, waitsFor: [n...] }], and the loops. */
export function waitingCards(cards, { columns = STARTABLE } = {}) {
  const { waitsFor, loops, unknown } = cardGraph(cards);
  const waiting = cards.filter((c) => c.state === 'open' && columns.includes(c.column) && (waitsFor.get(c.number) ?? []).length)
    .map((c) => ({ number: c.number, title: c.title, waitsFor: waitsFor.get(c.number) }));
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
