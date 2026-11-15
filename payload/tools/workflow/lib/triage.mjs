// The board triage behind /tidy (no I/O here): what on the board needs a decision so cards do not pile up and the focus is clear.
// Too much started at once, cards waiting for the owner, work that stopped moving, blocks that may be over, the inbox, cards
// that cannot be ranked, likely duplicates, and an old backlog to prune; then the focus: the few cards to do next.
import { rankCards, inbox, STARTABLE } from './rank.mjs';

const DAY = 86_400_000;
const STOP = new Set('the a an and or of to in on for with from by at is be add make new when can not no it its as this that'.split(' '));
const words = (title) => new Set(String(title).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w.length > 2 && !STOP.has(w)));
const daysSince = (iso, now) => (iso ? Math.floor((now - new Date(iso)) / DAY) : 0);
const list = (cards) => cards.map((c) => `#${c.number}`).join(', ');

/** Pairs of open cards whose titles share most of their words (all of them for short titles): [[a, b], ...]. */
export function likelyDuplicates(cards, threshold = 0.6) {
  const open = cards.filter((c) => c.state === 'open').map((c) => ({ c, w: words(c.title) })).filter((x) => x.w.size >= 2);
  const out = [];
  for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) {
    const a = open[i].w, b = open[j].w;
    const shared = [...a].filter((w) => b.has(w)).length;
    // short titles (three meaningful words or fewer) pair only with the same words: "Garmin sync bug" is not "Garmin sync"
    const bar = Math.min(a.size, b.size) <= 3 ? 1 : threshold;
    if (shared / (a.size + b.size - shared) >= bar) out.push([open[i].c, open[j].c]);
  }
  return out;
}

/** The triage: { focus, findings, counts }. Each finding: { kind, what, cards, suggest }. */
export function triage(cards, { now = new Date(), wip = 2, staleDays = 14, waitDays = 3, backlogMax = 30, firstVersion, columns = [], toolIssues } = {}) {
  const open = cards.filter((c) => c.state === 'open');
  const inCol = (name) => open.filter((c) => c.column === name);
  const findings = [];
  const add = (kind, what, found, suggest) => { if (found.length) findings.push({ kind, what, cards: found, suggest }); };

  const doing = inCol('In progress');
  if (doing.length > wip) add('too-much-started', `${doing.length} cards in progress (the limit is ${wip})`, doing, 'finish or move back the ones not touched this week before starting another');
  add('waiting-for-you', `waiting for your check for more than ${waitDays} days`, inCol('Waiting for your check').filter((c) => daysSince(c.updatedAt, now) > waitDays), 'try each and say done, or what is wrong: they block the next start');
  add('stalled', `in progress, unchanged for more than ${staleDays} days`, doing.filter((c) => daysSince(c.updatedAt, now) > staleDays), 'still wanted? move it back to Ready with a note, or split what is left into a smaller card');
  add('blocked-long', `blocked for more than ${staleDays} days`, inCol('Blocked').filter((c) => daysSince(c.updatedAt, now) > staleDays), 'is the reason still true? unblock, or close it with why');
  const waiting = inbox(cards, undefined, toolIssues);
  add('inbox', `${waiting.length} open issue${waiting.length === 1 ? '' : 's'} not on the board (oldest ${Math.max(0, ...waiting.map((c) => daysSince(c.createdAt, now)))} days)`, waiting, 'adopt each with a type, or close it with a reply');
  const startable = open.filter((c) => STARTABLE.includes(c.column));
  add('unranked', 'startable cards without a value label, so the order is a guess', startable.filter((c) => !c.labels.some((l) => /^value:/i.test(l))).slice(0, 8), 'set value and effort (/shape), or close the ones nobody would miss');
  for (const [a, b] of likelyDuplicates(open)) add('duplicate', `#${a.number} and #${b.number} look like the same card`, [a, b], 'merge into the older one (move what the newer adds, close it as a duplicate)');
  const backlog = inCol(columns[0] ?? 'Backlog');
  if (backlog.length > backlogMax) {
    const old = backlog.filter((c) => daysSince(c.updatedAt, now) > 60 && !c.labels.some((l) => /^value:\s*high/i.test(l))).sort((x, y) => new Date(x.updatedAt) - new Date(y.updatedAt)).slice(0, 10);
    add('prune', `${backlog.length} cards in the backlog (more than ${backlogMax} is more than anyone reads)`, old, 'close these untouched, not high-value cards; a good idea comes back');
  }
  const ranked = rankCards(cards, { firstVersion, columns: STARTABLE });
  const room = Math.max(0, wip - doing.length);
  const focus = { finish: doing, start: ranked.slice(0, Math.max(1, room)) };
  return { focus, findings, counts: { open: open.length, doing: doing.length, inbox: waiting.length, backlog: backlog.length } };
}

/** The triage as text: one line for the board's state, the focus, then each finding with its cards and what to do. */
export function renderTriage({ focus, findings, counts }) {
  const out = [`board: ${counts.open} open, ${counts.doing} in progress, ${counts.backlog} in the backlog, ${counts.inbox} in the inbox`];
  out.push(`focus: ${focus.finish.length ? `finish ${list(focus.finish)}` : 'nothing in progress'}${focus.start.length ? `; then start #${focus.start[0].number} ${focus.start[0].title} (${focus.start[0].why})` : ''}`);
  if (!findings.length) out.push('nothing piles up: the board is in order');
  for (const f of findings) out.push(`- ${f.what}: ${list(f.cards)}. ${f.suggest}`);
  return out.join('\n');
}

/** One line for the start of a session: quiet when nothing needs a decision. */
export const triageLine = ({ findings }) => (findings.length ? `(the board needs ${findings.length} decision${findings.length === 1 ? '' : 's'}: ${[...new Set(findings.map((f) => f.kind))].join(', ')}; /tidy sorts them)` : '');
