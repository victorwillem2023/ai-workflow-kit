// A goal's plan (no I/O here; npm run board -- --plan says it, --next starts with its line, /tidy focus makes it): the goal's open
// cards in waves. A wave is what can run side by side: every card it needs is in an earlier wave (or done), and no two cards in
// it change the same file (lib/claims.mjs: a spec's files, else its "Touches" line). Cards built or in progress come first, so
// wave 1 is what runs now. Beside the waves: the finish line the owner agreed (what must work when the goal is done), the
// cards that wait for one outside the goal, the ones whose files nobody wrote down, and how much the goal grew since it was picked.
import { cardGraph, isDone } from './cardgraph.mjs';
import { meet } from './claims.mjs';

const NOW = ['In progress', 'Waiting for your check'];
const tags = (ns) => ns.map((n) => `#${n}`).join(', ');

/**
 * { waves: [[{ card, why }]], outside: [{ card, on: [n] }], stuck: [n], loops: [[n]], unknown: [n] }. `goal`: the goal's card
 * numbers in its order; `all`: every card; `files`: card number -> the files it changes (empty or missing: not known).
 * `outside`: waits for an open card that is not in the goal; `stuck`: waits, further down, for one of those or for a loop.
 */
export function wavesOf(goal, { all, files = new Map() } = {}) {
  const byNo = new Map(all.map((c) => [c.number, c]));
  const open = [...new Set(goal)].filter((n) => byNo.has(n) && !isDone(byNo.get(n)));
  const inGoal = new Set(open);
  const { waitsFor, loops } = cardGraph(all);
  const need = (n) => (waitsFor.get(n) ?? []).filter((d) => inGoal.has(d));
  const outside = open.map((n) => ({ card: n, on: (waitsFor.get(n) ?? []).filter((d) => !inGoal.has(d)) })).filter((o) => o.on.length);
  // what cannot be planned: it waits outside the goal, sits in a loop, or waits for one of those (worked out to the end first)
  const blocked = new Set([...outside.map((o) => o.card), ...loops.flat().filter((n) => inGoal.has(n))]);
  for (let grew = true; grew;) { grew = false; for (const n of open) if (!blocked.has(n) && need(n).some((d) => blocked.has(d))) { blocked.add(n); grew = true; } }
  const fileOf = (n) => files.get(n) ?? [];
  // what runs now first, then the goal's own order
  const order = [...open.filter((n) => NOW.includes(byNo.get(n).column)), ...open.filter((n) => !NOW.includes(byNo.get(n).column))];
  const waveOf = new Map();
  const heldBy = new Map(); // a card that waited a wave for a file another card of that wave changes: why
  const waves = [];
  let left = order.filter((n) => !blocked.has(n));
  while (left.length) {
    const k = waves.length;
    const wave = [];
    for (const n of left) {
      if (!need(n).every((d) => waveOf.has(d) && waveOf.get(d) < k)) continue;
      // what runs already is in the first wave whatever it shares: the plan says what runs now
      const runs = k === 0 && NOW.includes(byNo.get(n).column);
      const shared = runs ? null : wave.map((w) => [w.card, meet(fileOf(n), fileOf(w.card))[0]]).find(([, f]) => f);
      if (shared) { heldBy.set(n, `after #${shared[0]}: both change ${shared[1]}`); continue; }
      wave.push({ card: n, why: [need(n).length ? `needs ${tags(need(n))}` : '', heldBy.get(n) ?? ''].filter(Boolean).join('; ') });
      waveOf.set(n, k);
    }
    if (!wave.length) break; // (cannot happen with the loops taken out; kept so a bad graph never spins)
    waves.push(wave);
    left = left.filter((n) => !waveOf.has(n));
  }
  const firstBlocked = new Set([...outside.map((o) => o.card), ...loops.flat()]);
  return { waves, outside, stuck: open.filter((n) => blocked.has(n) && !firstBlocked.has(n)), loops: loops.filter((l) => l.some((n) => inGoal.has(n))), unknown: open.filter((n) => !blocked.has(n) && !fileOf(n).length) };
}

/**
 * How the goal changed since its plan was agreed: { grew: [n] (in it now, not then), parked: [n] (made along the way, kept outside
 * it) }. `picked` takes in the cards added until the finish line is written (board --focus --add): the plan of that sitting.
 */
export function growthOf(focus, cardsNow) {
  if (!Array.isArray(focus?.picked)) return null;
  return { grew: cardsNow.filter((n) => !focus.picked.includes(n)), parked: focus.parked ?? [] };
}

/** The plan as lines, for --plan. `byNo`: card number -> card (its title and column). */
export function planLines(plan, { name, finish, growth, since, byNo = new Map() } = {}) {
  const say = (x) => `#${x.card} ${byNo.get(x.card)?.title ?? ''}${NOW.includes(byNo.get(x.card)?.column) ? ` (${byNo.get(x.card).column.toLowerCase()})` : ''}${x.why ? ` [${x.why}]` : ''}`;
  const lines = [`plan for "${name}"${since ? ` (picked ${since})` : ''}`,
    finish ? `finish line: ${finish}` : 'finish line: not written yet: say what must work when this goal is done (npm run board -- --plan --finish "<what must work>")'];
  if (!plan.waves.length) lines.push('no card of this goal can be planned yet');
  plan.waves.forEach((w, i) => lines.push(`wave ${i + 1}${i === 0 ? ' (now)' : ''}, side by side:`, ...w.map((x) => `  ${say(x)}`)));
  if (plan.outside.length) lines.push(`waits for a card outside the goal: ${plan.outside.map((o) => `#${o.card} for ${tags(o.on)}`).join('; ')} (add that card to the goal, or take the dependency out)`);
  if (plan.stuck.length) lines.push(`cannot be planned yet: ${tags(plan.stuck)} (${plan.stuck.length === 1 ? 'it waits' : 'they wait'}, further down, for one of those)`);
  for (const l of plan.loops) lines.push(`LOOP: ${l.map((n) => `#${n}`).join(' waits for ')} waits for #${l[0]}: none of them can start; take one dependency out`);
  if (plan.unknown.length) lines.push(`files not known: ${tags(plan.unknown)}: without them two cards on the same file can land in one wave (write each one's: npm run board -- --touches <n> "<files>")`);
  const g = growthLine(growth);
  if (g) lines.push(g);
  return lines;
}

/** One line for --next: the wave to start now and what comes after it. */
export function waveLine(plan) {
  if (!plan.waves.length) return '';
  const [first, ...rest] = plan.waves;
  return `plan: wave 1 of ${plan.waves.length} now: ${tags(first.map((x) => x.card))}${rest.length ? `; then ${rest.map((w) => tags(w.map((x) => x.card))).join('; then ')}` : ''} (npm run board -- --plan)`;
}

/** "grew by ..." when the goal took in cards since it was picked, or cards made along the way were parked; else ''. */
export function growthLine(growth) {
  if (!growth || (!growth.grew.length && !growth.parked.length)) return '';
  const parts = [growth.grew.length ? `${growth.grew.length} in the goal (${tags(growth.grew)})` : '', growth.parked.length ? `${growth.parked.length} parked until it is done (${tags(growth.parked)})` : ''].filter(Boolean);
  return `grew since its plan was agreed: ${parts.join(', ')}. Widening the finish line is the owner's call, never a builder's.`;
}
