// The board's "what next" as data (no I/O here; `npm run board -- --next <n> --json` prints it, the docs portal shows it): the
// same ranking, tie, waiting cards and triage the text of --next says, as fields a page can lay out instead of sentences.

const word = (labels, group) => labels.map((l) => new RegExp(`^${group}:\\s*(.+)$`, 'i').exec(l)?.[1]?.trim().toLowerCase()).find(Boolean) ?? null;
const TYPES = ['feature', 'bug', 'ui', 'workflow', 'spike'];

/** One ranked card as fields: { number, title, column, type, value, effort, feasibility, score, v1, unlocks, on, url }. */
export const cardFacts = (c, repo) => ({
  number: c.number, title: c.title, column: c.column ?? null, type: c.labels.find((l) => TYPES.includes(l)) ?? null,
  value: word(c.labels, 'value'), effort: word(c.labels, 'effort'), feasibility: word(c.labels, 'feasibility'),
  score: c.score ?? null, v1: Boolean(c.v1), unlocks: c.unlocks ?? 0, on: c.on ?? [],
  url: repo ? `https://github.com/${repo}/issues/${c.number}` : null,
});

/** Each kind of triage finding in a few words: [title, what to do]; `what` and `suggest` say it in full for /tidy. */
const SHORT = {
  'too-much-started': (f) => [`${/^(\d+)/.exec(f.what)?.[1] ?? f.cards.length} in progress, the limit is ${/limit is (\d+)/.exec(f.what)?.[1] ?? '?'}`, 'Finish one first'],
  'waiting-for-you': (f) => [`${f.cards.length} waiting for your check`, 'Try them, say done'],
  stalled: (f) => [`${f.cards.length} in progress, untouched for weeks`, 'Move back or split'],
  'blocked-long': (f) => [`${f.cards.length} blocked for weeks`, 'Unblock or close'],
  inbox: (f) => [`${/^(\d+)/.exec(f.what)?.[1] ?? f.cards.length} issues not on the board`, 'Adopt or close'],
  unranked: (f, view) => [`${view.unranked} cards without a value`, 'Set value and effort'],
  duplicate: (f) => [`${f.cards.map((c) => `#${c.number}`).join(' and ')} look the same`, 'Merge into the older one'],
  prune: (f) => [`${/^(\d+)/.exec(f.what)?.[1] ?? 'Many'} cards in the backlog`, 'Close old, low-value ones'],
};

/**
 * The view: { tie: [card], next: [card], waiting: [{ number, title, waitsFor, url }], loops, unranked, inbox, decisions:
 * [{ kind, what, suggest, cards: [n] }], counts: { open, doing, backlog, inbox } }. `ranked`, `tie`, `waiting` and `loops` come
 * from lib/rank.mjs, `triage` from lib/triage.mjs; `n`: how many cards after the tie.
 */
export function boardView({ ranked, tie, waiting, loops = [], inboxCount = 0, triage, n = 3, repo = null }) {
  const tied = new Set(tie.map((c) => c.number));
  const url = (num) => (repo ? `https://github.com/${repo}/issues/${num}` : null);
  const view = { unranked: ranked.filter((c) => !word(c.labels, 'value') && !tied.has(c.number)).length };
  const decision = (f) => {
    const [title, hint] = (SHORT[f.kind] ?? (() => [f.what, f.suggest]))(f, view);
    return { kind: f.kind, title, hint, what: f.what, suggest: f.suggest, cards: f.cards.map((c) => c.number) };
  };
  return {
    tie: tie.map((c) => cardFacts(c, repo)),
    next: ranked.filter((c) => !tied.has(c.number)).slice(0, n).map((c) => cardFacts(c, repo)),
    waiting: waiting.map((c) => ({ number: c.number, title: c.title, waitsFor: c.waitsFor, url: url(c.number) })),
    loops,
    unranked: view.unranked,
    inbox: inboxCount,
    decisions: (triage?.findings ?? []).map(decision),
    counts: triage?.counts ?? null,
  };
}
