// What to build next, by script (no I/O here): the open cards that can be started, first-version cards first, then by value
// for the effort, a low feasibility counting against. The labels come from `board.labels` (value, effort, feasibility,
// milestone); the owner sets them, the script only does the sum, so the order is the same every time and easy to argue with.

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

/** The startable open cards, best first: [{ number, title, column, score, v1, why }]. Ties: Ready before Backlog, then the older card. */
export function rankCards(cards, { firstVersion, columns = STARTABLE } = {}) {
  return cards.filter((c) => c.state === 'open' && columns.includes(c.column))
    .map((c) => scoreCard(c, firstVersion))
    .sort((a, b) => Number(b.v1) - Number(a.v1) || b.score - a.score || (a.column === 'Ready' ? -1 : 0) - (b.column === 'Ready' ? -1 : 0) || a.number - b.number);
}

/** Open issues that are not on the board yet (feedback, error alerts, ideas filed on GitHub), apart from the reports. */
export function inbox(cards, ignoreLabels = ['security-report', 'access-review']) {
  return cards.filter((c) => c.state === 'open' && !c.column && !c.labels.some((l) => ignoreLabels.includes(l)));
}
