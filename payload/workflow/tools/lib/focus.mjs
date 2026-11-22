// The focus block (no I/O here): the few cards the coming days are about, all of one theme, so the owner works on one kind of
// thing at a time instead of on every card at once. A theme is an area label from `board.labels.areas` (the screens, the
// backend, the code's health, ...). The script proposes blocks from the ranking (lib/rank.mjs), the owner picks one, and until
// its cards are done `board --next` offers only those. The pick is kept outside the repo (git's common folder), so it needs no
// commit and every session folder sees the same one.
import { rankCards, STARTABLE, BUILT } from './rank.mjs';

/** The area label performance, refactoring and test work goes under. */
export const HEALTH = 'area: Code health';
const DOING = 'In progress';
const EFFORT = { small: 1, medium: 2, large: 4 };
const list = (cards) => cards.map((c) => `#${c.number}`).join(', ');
const name = (theme) => String(theme).replace(/^area:\s*/i, '');

/** A card's theme: its first area label from the config, else 'no area'. */
export const themeOf = (card, areas = []) => areas.find((a) => card.labels.includes(a)) ?? 'no area';

/**
 * The blocks to choose from, best first: [{ theme, cards: [ranked card], more, days }]. Each holds the `size` best startable
 * cards of one theme; `more`: how many of that theme are left for a later block; `days`: a rough length from the effort labels
 * (small 1, medium 2, large 4 sessions; none counts as medium). First-version cards first, then the worth of the block.
 */
export function proposeBlocks(cards, { areas = [], firstVersion, size = 5, measured = null } = {}) {
  const groups = new Map();
  for (const c of rankCards(cards, { firstVersion, measured })) {
    const theme = themeOf(c, areas);
    groups.set(theme, [...(groups.get(theme) ?? []), c]);
  }
  const effort = (c) => EFFORT[/effort (\w+)/.exec(c.why)?.[1]] ?? 2;
  return [...groups].map(([theme, all]) => {
    const block = all.slice(0, size);
    return { theme, cards: block, more: all.length - block.length, days: block.reduce((t, c) => t + effort(c), 0), v1: block.filter((c) => c.v1).length, worth: block.reduce((t, c) => t + c.worth, 0) };
  }).sort((a, b) => b.v1 - a.v1 || b.worth - a.worth || a.theme.localeCompare(b.theme));
}

/**
 * Whether a block of code health work (performance, refactoring, tests) is due: { due, shipped, open, never }. `never`: no
 * such card was ever closed. `shipped`: the cards
 * closed since the last closed code health card (all of them when there never was one); due from `every` (8) on. A closed card's
 * updatedAt stands for when it closed. `open`: the open code health cards there are to do.
 */
export function upkeepDue(cards, { health = HEALTH, every = 8 } = {}) {
  const closed = cards.filter((c) => c.state === 'closed' && c.column);
  const last = Math.max(0, ...closed.filter((c) => c.labels.includes(health)).map((c) => Date.parse(c.updatedAt ?? '') || 0));
  const shipped = closed.filter((c) => !c.labels.includes(health) && (Date.parse(c.updatedAt ?? '') || 0) > last).length;
  const open = cards.filter((c) => c.state === 'open' && c.column && c.labels.includes(health)).length;
  return { due: shipped >= every, shipped, open, never: !last };
}

/**
 * Where the picked block stands: { theme, since, done, doing, check, left, held, finished }. `left`: its cards that can be started,
 * best first; `held`: its cards that wait (blocked, or for another card); `check`: built, waiting for the owner. Finished when
 * nothing is left to start, in progress or held. A card number the board no longer has counts as done.
 */
export function focusState(cards, focus, { firstVersion, measured = null } = {}) {
  const mine = new Set(focus.cards);
  const got = cards.filter((c) => mine.has(c.number));
  const open = got.filter((c) => c.state === 'open');
  const left = rankCards(cards, { firstVersion, measured }).filter((c) => mine.has(c.number));
  const doing = open.filter((c) => c.column === DOING);
  const check = open.filter((c) => BUILT.includes(c.column));
  const held = open.filter((c) => !doing.includes(c) && !check.includes(c) && !left.some((l) => l.number === c.number));
  const done = focus.cards.length - open.length;
  return { theme: focus.theme, since: focus.since ?? null, total: focus.cards.length, done, doing, check, left, held, finished: !left.length && !doing.length && !held.length };
}

/**
 * Every open card on the board for a full clean-up (/sweep), by theme: [{ theme, cards: [{ number, title, column, missing, days }] }],
 * the theme with the most to settle first. `missing`: what the card lacks to be ranked and placed (area, type, value, effort);
 * `days`: since it last changed. Within a theme the cards with the most missing come first, then the longest untouched.
 */
export function sweepGroups(cards, { areas = [], types = [], now = new Date() } = {}) {
  const lacks = (c) => [themeOf(c, areas) === 'no area' && areas.length ? 'area' : '', types.length && !types.some((t) => c.labels.includes(t)) ? 'type' : '',
    ...['value', 'effort'].map((g) => (c.labels.some((l) => new RegExp(`^${g}:`, 'i').test(l)) ? '' : g))].filter(Boolean);
  const groups = new Map();
  for (const c of cards.filter((x) => x.state === 'open' && x.column)) {
    const row = { number: c.number, title: c.title, column: c.column, missing: lacks(c), days: c.updatedAt ? Math.max(0, Math.floor((now - new Date(c.updatedAt)) / 86_400_000)) : 0 };
    const theme = themeOf(c, areas);
    groups.set(theme, [...(groups.get(theme) ?? []), row]);
  }
  const open = (g) => g.cards.filter((c) => c.missing.length).length;
  return [...groups].map(([theme, rows]) => ({ theme, cards: rows.sort((a, b) => b.missing.length - a.missing.length || b.days - a.days || a.number - b.number) }))
    .sort((a, b) => open(b) - open(a) || b.cards.length - a.cards.length || a.theme.localeCompare(b.theme));
}

/** The sweep as text: with no theme the count per theme and where to start; with one, its cards a line each (`from`: skip that many, 25 at a time). */
export function renderSweep(groups, theme = null, from = 0, size = 25) {
  if (!theme) {
    const total = groups.reduce((t, g) => t + g.cards.length, 0);
    const lines = groups.map((g) => `- ${name(g.theme)}: ${g.cards.length} card${g.cards.length === 1 ? '' : 's'}, ${g.cards.filter((c) => c.missing.length).length} with something missing, ${g.cards.filter((c) => c.days > 60).length} untouched for two months   (npm run board -- --sweep "${g.theme}")`);
    return [`sweep: ${total} open card${total === 1 ? '' : 's'} in ${groups.length} theme${groups.length === 1 ? '' : 's'}, the one with the most to settle first`, ...lines].join('\n');
  }
  const g = groups.find((x) => x.theme.toLowerCase() === theme.toLowerCase() || name(x.theme).toLowerCase() === theme.toLowerCase());
  if (!g) return `sweep: no open card has the theme "${theme}". The themes: ${groups.map((x) => x.theme).join(', ')}.`;
  const rows = g.cards.slice(from, from + size);
  const left = g.cards.length - from - rows.length;
  return [`sweep: ${name(g.theme)}, cards ${from + 1} to ${from + rows.length} of ${g.cards.length}`,
    ...rows.map((c) => `#${c.number} ${c.title} | ${c.column} | ${c.missing.length ? `missing: ${c.missing.join(', ')}` : 'complete'} | ${c.days} day${c.days === 1 ? '' : 's'} untouched`),
    ...(left > 0 ? [`(${left} more: npm run board -- --sweep "${g.theme}" --from ${from + size})`] : ['(the last of this theme)'])].join('\n');
}

/** The cards an agent made on its own that wait for the owner's yes (the label lib/rank.mjs TO_SORT), oldest first. */
export const toSort = (cards, label) => cards.filter((c) => c.state === 'open' && c.labels.includes(label)).sort((a, b) => a.number - b.number);

/**
 * The cards to let go: open, not started, untouched for more than `days` (56), with no high value and nothing waiting on them
 * said by the owner (a first-version card stays). Oldest first. Closing is the owner's yes (board --expire --yes); a closed card
 * can be reopened.
 */
export function expired(cards, { now = new Date(), days = 56, firstVersion } = {}) {
  const age = (c) => (c.updatedAt ? Math.floor((now - new Date(c.updatedAt)) / 86_400_000) : 0);
  return cards.filter((c) => c.state === 'open' && STARTABLE.includes(c.column) && age(c) > days
    && !c.labels.some((l) => /^value:\s*high/i.test(l)) && !(firstVersion && c.labels.includes(firstVersion)))
    .map((c) => ({ number: c.number, title: c.title, days: age(c) })).sort((a, b) => b.days - a.days);
}

/**
 * Whether one more piece of work may be started: { doing: [card], limit, room, count, work: [{ topic, cards }], leftover: [topic] }.
 * Cards built and waiting for the owner do not count. With `sessions` ([{ topic, cards: [number], finished }], the cards each
 * session folder carries) the limit is on work, not cards: the cards in progress one session carries count once, a card in
 * progress no session holds counts on its own (topic null), and a session started without a card counts once until its work is
 * on main (`finished`). A session whose cards are all closed or gone is a leftover; one whose cards wait (for the owner, for
 * another card) is neither. Without `sessions` every card in progress counts.
 */
export function roomToStart(cards, limit = 2, sessions = null) {
  const doing = cards.filter((c) => c.state === 'open' && c.column === DOING);
  const held = new Set();
  const work = [];
  const leftover = [];
  for (const s of sessions ?? []) {
    const mine = doing.filter((c) => s.cards.includes(c.number) && !held.has(c.number));
    for (const c of mine) held.add(c.number);
    if (mine.length || (!s.cards.length && !s.finished)) work.push({ topic: s.topic, cards: mine });
    else if (!s.cards.some((n) => cards.some((c) => c.number === n && c.state === 'open'))) leftover.push(s.topic);
  }
  for (const c of doing) if (!held.has(c.number)) work.push({ topic: null, cards: [c] });
  return { doing, limit, room: Math.max(0, limit - work.length), count: work.length, work, leftover };
}

/** The work in progress as lines, one per session (or per card no session holds), then the leftover sessions to clean. */
export function roomLines({ work, leftover }) {
  const said = ({ cards: [first, ...rest] }) => (!first ? 'no card' : `#${first.number} ${first.title}${rest.length ? ` and ${rest.length} more (${list(rest)})` : ''}`);
  return [...work.map((w) => `  ${w.topic ?? 'no session'}: ${said(w)}`),
    ...(leftover.length ? [`left over: ${leftover.join(', ')}: clean ${leftover.length === 1 ? 'it' : 'them'} with node workflow/scripts/session.mjs --clean`] : [])];
}

/**
 * Where goals come from, by phase (workflow/levels.json; `direction.goals` there overrides the list). A prototype is steered by
 * the product itself: the kinds of request and the parts of the app (the app map, lib/goals.mjs), an area where bugs gather,
 * and the code's health with what its state says to work on (lib/hotspots.mjs). Once
 * people use it, what they reported comes first; once they rely on it, what the running app reports comes before that.
 * `areas` (the blocks by area label) is what a project without an app map chooses from.
 */
export const DIRECTION = {
  prototype: ['requests', 'parts', 'bugs', 'health', 'areas'],
  pilot: ['feedback', 'bugs', 'requests', 'parts', 'health', 'areas'],
  production: ['signals', 'feedback', 'bugs', 'health', 'requests', 'parts', 'areas'],
};
export const sourcesFor = (phase, own) => (Array.isArray(own) && own.length ? own : DIRECTION[phase] ?? DIRECTION.production);

/** A goal made of the open cards on the board that carry one of `labels` (what users reported, what the running app reports). */
export function labelGoal(id, name, cards, labels) {
  const mine = cards.filter((c) => c.state === 'open' && c.column && c.labels.some((l) => labels.includes(l)));
  return { id, name, kind: id, done: 0, left: mine.length, total: mine.length, cards: mine.map((c) => c.number), uncarded: 0, notes: [], due: mine.length > 0 };
}

/**
 * The code health goal: its cards are the open ones under the health area; `numbers` are today's measures ({ label: n }, from
 * the gate's baseline and the flaky list) and `seen` the same when the goal was last picked. Due when a number rose since
 * then, or enough cards shipped since the last health card closed (upkeepDue).
 */
export function healthGoal(cards, numbers = {}, seen = null, { health = HEALTH, every = 8 } = {}) {
  const upkeep = upkeepDue(cards, { health, every });
  const worse = seen ? Object.keys(numbers).filter((k) => numbers[k] > (seen[k] ?? Infinity)) : [];
  const mine = cards.filter((c) => c.state === 'open' && c.column && c.labels.includes(health)).map((c) => c.number);
  const said = Object.entries(numbers).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
  const notes = [said.join(', '), worse.length ? `worse since this goal was last picked: ${worse.map((k) => `${k} ${seen[k]} to ${numbers[k]}`).join(', ')}` : '',
    upkeep.due ? upkeepLine(upkeep, health).replace(/^code health is due: /, '').replace(/; .*$/, '') : ''].filter(Boolean);
  const due = upkeep.due || worse.length > 0;
  return { id: 'health', name: 'Code health: fast, reliable, easy to change', kind: 'health', done: 0, left: mine.length || (due ? 1 : 0), total: mine.length || (due ? 1 : 0), cards: mine, uncarded: mine.length ? 0 : (due ? 1 : 0), notes, due };
}

/**
 * The few goals to choose from, out of all: what is due first (what the running app or users report, code health when a
 * number got worse), then the goal closest to its finish line, then the one with the most left. At most `n`.
 */
export function suggestGoals(goals, n = 4) {
  const live = goals.filter((g) => g.left > 0);
  const due = live.filter((g) => g.due);
  const rest = live.filter((g) => !g.due && g.kind !== 'health');
  const closest = [...rest].sort((a, b) => a.left - b.left || b.total - a.total || a.name.localeCompare(b.name));
  const biggest = [...rest].sort((a, b) => b.left - a.left || a.name.localeCompare(b.name))[0];
  const picked = [...due, ...closest.slice(0, Math.max(1, n - due.length - 1)), ...(biggest ? [biggest] : [])];
  return [...new Set(picked)].slice(0, n);
}

const KIND = { request: 'a kind of request', part: 'a part of the app', health: 'quality', bugs: 'stabilise', feedback: 'from your users', signals: 'from the running app' };
/** A goal's count in a few words: "11 of 14 done" for a goal with a finish line, "3 cards" for one made of cards. */
export const goalCount = (g) => (g.kind === 'request' || g.kind === 'part' ? `${g.done} of ${g.total} done` : `${g.cards.length} card${g.cards.length === 1 ? '' : 's'}`);

/** The goals as text: how many kinds of request are finished, then each goal with its count, what is left and how to pick it. */
export function renderGoals(shown, all = shown) {
  const kinds = all.filter((g) => g.kind === 'request');
  const out = kinds.length ? [`${kinds.filter((g) => g.left === 0).length} of ${kinds.length} kinds of request are finished`] : [];
  out.push('goals to pick from (one at a time; each has a finish line):');
  for (const g of shown) {
    const cards = g.cards.length ? `${g.cards.length} card${g.cards.length === 1 ? '' : 's'} (${g.cards.slice(0, 8).map((x) => `#${x}`).join(', ')}${g.cards.length > 8 ? ', ...' : ''})` : 'no card yet';
    out.push(`- ${g.name} (${KIND[g.kind] ?? g.kind}${g.due ? ', due' : ''}): ${goalCount(g)}`);
    for (const note of g.notes) out.push(`    ${note}`);
    out.push(`    ${cards}${g.uncarded ? `; ${g.uncarded} thing${g.uncarded === 1 ? '' : 's'} left with no card yet` : ''}`, `    pick it: npm run board -- --focus "${g.id}"`);
  }
  const more = all.filter((g) => g.left > 0).length - shown.length;
  if (more > 0) out.push(`(${more} more goal${more === 1 ? '' : 's'}: --focus --all; blocks by area label instead: --focus --areas)`);
  return out.join('\n');
}

/**
 * The cards in progress, said by the work they belong to: with `sessions` (as roomToStart takes them) "#a, #b, #c in progress
 * (2 sessions)", and a card no session holds as "#d in progress with no session"; without them, the cards.
 */
export function doingWords(doing, sessions = null) {
  if (!doing.length) return '';
  if (!sessions) return `${list(doing)} in progress`;
  const { work } = roomToStart(doing, 0, sessions);
  const held = work.filter((w) => w.topic && w.cards.length);
  const loose = work.filter((w) => !w.topic).flatMap((w) => w.cards);
  return [held.length ? `${held.map((w) => list(w.cards)).join(', ')} in progress (${held.length} session${held.length === 1 ? '' : 's'})` : '',
    loose.length ? `${list(loose)} in progress with no session` : ''].filter(Boolean).join(', ');
}

/** How long ago a focus was picked (`since`: its date, YYYY-MM-DD), in a few words, or '' without one. */
export function pickedWords(since, now = new Date()) {
  const at = Date.parse(since ?? '');
  if (!Number.isFinite(at)) return '';
  const days = Math.max(0, Math.floor((Date.parse(now.toISOString().slice(0, 10)) - at) / 86_400_000));
  return `picked ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}`;
}

/**
 * A picked goal in one line, from the goal as it stands now and its cards' state (focusState). A kind of request or a part of the
 * app counts what it measures (14 of 26 cases); any other goal counts its picked cards (5 of 11 done), so the line moves as
 * they ship. `sessions`: the work in progress by session folder; `now`: for how long ago it was picked.
 */
export function goalLine(g, s, { sessions = null, now = new Date() } = {}) {
  const cards = [pickedWords(s.since, now), doingWords(s.doing, sessions), s.check.length ? `${list(s.check)} waiting for you to try` : '', s.left.length ? `${s.left.length} to start` : '', s.held.length ? `${list(s.held)} held up` : ''].filter(Boolean).join(', ');
  const noCard = g.uncarded ? `${g.uncarded} thing${g.uncarded === 1 ? '' : 's'} left with no card yet` : '';
  const count = g.kind === 'request' || g.kind === 'part' ? goalCount(g) : `${s.done} of ${s.total} done`;
  return `goal: ${g.name}: ${g.left === 0 ? 'done' : count}${[cards, noCard].filter(Boolean).length ? ` (${[cards, noCard].filter(Boolean).join('; ')})` : ''}`;
}

/** The cards the owner was on, whatever their theme: in progress and built-waiting-for-a-check. One line, or ''. */
export function whereYouWere(cards) {
  const open = cards.filter((c) => c.state === 'open');
  const doing = open.filter((c) => c.column === DOING), check = open.filter((c) => BUILT.includes(c.column));
  const say = (c) => `#${c.number} ${c.title.length > 60 ? `${c.title.slice(0, 57).trimEnd()}...` : c.title}`;
  return [doing.length ? `in progress: ${doing.map(say).join('; ')}` : '', check.length ? `built, waiting for you to try: ${check.map(say).join('; ')}` : ''].filter(Boolean).join(' | ');
}

/** Urgent cards outside the block: startable bugs of high value. They are said, never hidden by a focus. */
export const urgentOutside = (cards, focus) => cards.filter((c) => c.state === 'open' && STARTABLE.includes(c.column) && !focus.cards.includes(c.number) && c.labels.includes('bug') && c.labels.some((l) => /^value:\s*high/i.test(l)));

/** The picked block in one line (`sessions` and `now` as goalLine takes them). */
export function focusLine(s, { sessions = null, now = new Date() } = {}) {
  const parts = [`${s.done} of ${s.total} done`, pickedWords(s.since, now), doingWords(s.doing, sessions), s.check.length ? `${list(s.check)} waiting for you to try` : '', s.left.length ? `${s.left.length} to start` : '', s.held.length ? `${list(s.held)} held up` : ''];
  return `focus: ${name(s.theme)} (${parts.filter(Boolean).join(', ')})`;
}

/** Why a block of code health work is due, in one sentence (the same words in --focus and --next). */
export function upkeepLine(upkeep, health = HEALTH) {
  const since = upkeep.never ? `${upkeep.shipped} cards shipped and none of them was performance, refactoring or test work ("${health}")` : `${upkeep.shipped} cards shipped since the last block of performance, refactoring or test work`;
  const then = upkeep.open ? `${upkeep.open} such card${upkeep.open === 1 ? ' waits' : 's wait'}: take that block next` : `no such card is open: look at what slowed down or grew (npm run health) and make the cards with the label "${health}"`;
  return `code health is due: ${since}; ${then}`;
}

/** The blocks to pick from as text (the `show` best; the rest counted), with the command that picks each, and the code health
 *  line when one is due. Cards without an area label are a block too, said last: they need a label more than a pick. */
export function renderBlocks(blocks, upkeep, { health = HEALTH, show = 5 } = {}) {
  const out = upkeep?.due ? [upkeepLine(upkeep, health)] : [];
  if (!blocks.length) return [...out, 'no card can be started, so there is no block to pick'].join('\n');
  const loose = blocks.find((b) => b.theme === 'no area');
  const themed = blocks.filter((b) => b !== loose);
  // a due code health block is always among the ones shown
  const shown = [...themed.slice(0, show), ...themed.slice(show).filter((b) => upkeep?.due && b.theme === health)];
  out.push('blocks to pick from, best first (one theme at a time; the rest waits):');
  const tail = [
    ...(themed.length > shown.length ? [`(${themed.length - shown.length} more theme${themed.length - shown.length === 1 ? '' : 's'}: ${themed.filter((b) => !shown.includes(b)).map((b) => name(b.theme)).join(', ')}; all of them: --focus --all)`] : []),
    ...(loose ? [`(${loose.cards.length + loose.more} card${loose.cards.length + loose.more === 1 ? ' has' : 's have'} no area label, so no block: the board tidy-up gives each one)`] : [])];
  for (const b of shown.length ? shown : [loose]) {
    out.push(`- ${name(b.theme)}: ${b.cards.length} card${b.cards.length === 1 ? '' : 's'}, about ${b.days} session${b.days === 1 ? '' : 's'}${b.more ? ` (${b.more} more for a later block)` : ''}${upkeep?.due && b.theme === health ? ' (due)' : ''}`);
    for (const c of b.cards) out.push(`    #${c.number} ${c.title} (${c.why})`);
    out.push(`    pick it: npm run board -- --focus "${b.theme}"`);
  }
  return [...out, ...tail].join('\n');
}
