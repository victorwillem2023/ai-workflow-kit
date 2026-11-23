// Goals with a finish line, read from the app map (no I/O here; npm run board -- --focus shows them): instead of "the next
// three cards", one thing to make really good, with a count of how far it is.
//   a kind of request (docs/REQUESTS.md):  its page's cases that are built, and the weak and missing ends in the stages it runs
//                                          through (`kinds` in docs/flow/map.js). A kind with no page starts with writing it.
//   a part of the app (a stage of the map): its ends that are built, against the weak, missing and half-built ones.
// A goal is done when nothing is left; what is left is either on a card (those are the goal's cards) or has no card yet.
// Stages are shared: a weak end in a stage several kinds run through counts for each of them, and fixing it moves them all.

const LEFT = new Set(['weak', 'gap', 'building', 'open', 'decided', 'unmapped']);

/** A stage's ends: [{ text, status, cards, kind }]. */
function endsOf(stage) {
  const ends = [];
  const walk = (nodes) => {
    for (const n of nodes ?? []) {
      if (n.q) { walk(n.yes); walk(n.no); for (const [, sub] of n.opts ?? []) walk(sub); }
      else if (n.t) ends.push({ text: n.t, status: n.s ?? 'built', cards: n.card ?? [], kind: n.kind ?? null });
    }
  };
  walk(stage.tree);
  return ends;
}

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * One goal from what is left: the open cards on it, and how many things no open card is on. `plan`: the open cards of the
 * kind's clean-up plan (its flow page's "Cards:" line), in order: they come first and count as left until they are done.
 */
function goal(id, name, kind, done, left, open, extra = 0, notes = [], plan = []) {
  const planned = plan.filter((n) => open.has(n));
  const onEnds = [...new Set(left.flatMap((e) => e.cards.filter((n) => open.has(n))))].sort((a, b) => a - b);
  const cards = [...new Set([...planned, ...onEnds])];
  const uncarded = left.filter((e) => !e.cards.some((n) => open.has(n))).length + extra;
  const more = planned.filter((n) => !onEnds.includes(n)).length; // a refactor card sits on no end of the map
  return { id, name, kind, done, left: left.length + extra + more, total: done + left.length + extra + more, cards, plan: planned, uncarded, notes };
}

/**
 * The goals the map gives: [{ id, name, kind: 'request' | 'part', done, left, total, cards, uncarded, notes }], the kinds of
 * request first, then the parts; a part with nothing left is left out, a finished kind stays (it counts as finished).
 * `flow`: lib/worksheet.mjs loadFlow(); `cards`: the board's; `plans`: { kind: [card numbers] }, each kind's clean-up plan
 * from its flow page (docs/anatomy/<kind>.md, lib/anatomy.mjs planCards).
 */
export function mapGoals(flow, cards, { plans = {} } = {}) {
  // still to do: open and not in the Done column (--finish moves a card there; GitHub may never close it)
  const open = new Set(cards.filter((c) => c.state === 'open' && c.column !== 'Done').map((c) => c.number));
  const stages = flow.groups.flatMap((g) => g.stages.map((st) => ({ ...st, group: g.name })));
  const byId = new Map(stages.map((st) => [st.id, st]));
  // the kinds and their names: the index stage's ends carry `kind`; a page is a stage with `kind`
  const names = new Map(stages.filter((st) => !st.kind).flatMap((st) => endsOf(st).filter((e) => e.kind).map((e) => [e.kind, e.text.split(':')[0].trim()])));
  const indexStages = new Set(stages.filter((st) => !st.kind && endsOf(st).some((e) => e.kind)).map((st) => st.id));
  const goals = [];
  for (const slug of new Set([...names.keys(), ...Object.keys(flow.kinds ?? {})])) {
    const page = stages.find((st) => st.kind === slug);
    const cases = page ? endsOf(page) : [];
    const path = (flow.kinds?.[slug] ?? []).flatMap((id) => (byId.get(id) ? endsOf(byId.get(id)) : [])).filter((e) => LEFT.has(e.status));
    const open1 = cases.filter((e) => LEFT.has(e.status));
    const notes = [page ? '' : 'no page yet that says what the app does for each case: writing it comes first', open1.length ? `${count(open1.length, 'case', 'cases')} not built` : '',
      path.length ? `${count(path.filter((e) => e.status === 'weak').length, 'weak spot', 'weak spots')} and ${path.filter((e) => e.status !== 'weak').length} not built in the steps it runs through` : ''].filter(Boolean);
    // the plans are keyed by the page's name made plain (lib/anatomy.mjs slug): hill_repeats and HillRepeats find hill-repeats
    const plain = slug.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    goals.push(goal(`request:${slug}`, names.get(slug) ?? slug, 'request', cases.length - open1.length, [...open1, ...path], open, page ? 0 : 1, notes, plans[slug] ?? plans[plain] ?? []));
  }
  for (const st of stages.filter((x) => !x.kind && !indexStages.has(x.id))) {
    const ends = endsOf(st);
    const left = ends.filter((e) => LEFT.has(e.status));
    if (!left.length) continue;
    const weak = left.filter((e) => e.status === 'weak').length;
    goals.push(goal(`part:${st.id}`, st.name, 'part', ends.length - left.length, left, open, 0, [`${count(weak, 'weak spot', 'weak spots')}, ${left.length - weak} not built or half built`]));
  }
  return goals;
}
