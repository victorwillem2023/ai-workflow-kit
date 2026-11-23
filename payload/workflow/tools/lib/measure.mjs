// Before and after a change: what moved between two runs of a project's own measuring script (no I/O here; npm run measure
// reads the files). The cases and how they are measured are the project's (ten mountains, its own router); recording a run in
// one shape and showing only what moved is the same in every project, so it is the kit's. The shape, `results.json`:
//   { "name": "tops", "at": "<ISO date>", "tolerance": { "<value>": <how much it may move> },
//     "cases": [ { "id": "aconcagua", "values": { "<name>": 12.3 | "text" | true | null },
//                  "items": [ { "id": "<one option>", "values": { ... } } ] } ] }
// `items` (the options a case gives) are optional. A number moves when it changes by more than its tolerance (`tolerance` in the
// file, else 0: any change); true that became false is called out as lost.

/** A file's problems with the shape, or []: so a script that writes something else is told what, not compared wrongly. */
export function shapeProblems(r) {
  if (!r || typeof r !== 'object') return ['not a JSON object'];
  if (!Array.isArray(r.cases)) return ['no "cases" list'];
  const twice = (list) => [...new Set(list.filter((id, i) => id != null && list.indexOf(id) !== i))];
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  return [
    ...r.cases.flatMap((c, i) => [
      ...(c?.id == null ? [`case ${i + 1} has no "id"`] : []),
      // values may be left out, never null or another kind of thing: they are read as an object of named values
      ...(c && 'values' in c && !isObj(c.values) ? [`case ${c.id}: "values" is not an object`] : []),
      ...(c?.items != null && !Array.isArray(c.items) ? [`case ${c.id}: "items" is not a list`] : []),
      ...(Array.isArray(c?.items) ? c.items.flatMap((x, j) => [...(x?.id == null ? [`case ${c.id}: option ${j + 1} has no "id"`] : []),
        ...(x && 'values' in x && !isObj(x.values) ? [`case ${c.id}: option ${x.id ?? j + 1}: "values" is not an object`] : [])]) : []),
      ...(Array.isArray(c?.items) ? twice(c.items.map((x) => (x?.id == null ? null : String(x.id)))).map((id) => `case ${c.id}: two options are "${id}"`) : []),
    ]),
    // one id twice: the second would replace the first, and a case would drop out with no word
    ...twice(r.cases.map((c) => (c?.id == null ? null : String(c.id)))).map((id) => `two cases are "${id}"`),
  ];
}

const show = (v) => (v === null || v === undefined ? '-' : typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v));

/** What moved in one set of values: [{ name, before, after, how }], how: 'lost' (true to false), 'gained', 'changed'. */
function moved(before = {}, after = {}, tolerance = {}) {
  const out = [];
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[name], b = after[name];
    if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(b - a) > (tolerance[name] ?? 0)) out.push({ name, before: a, after: b, how: 'changed' }); continue; }
    // lists and objects are the same when their text is: a list of stops written twice has not moved
    if (a === b || (typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b))) continue;
    out.push({ name, before: a, after: b, how: a === true && b !== true ? 'lost' : b === true && a !== true ? 'gained' : 'changed' });
  }
  return out;
}

/**
 * What moved between two runs: { cases: [{ id, added?, removed?, values, items: { gained, lost, moved: [{ id, values }] } }],
 * same: true when nothing did }. Only cases with a change are listed.
 */
export function compareRuns(before, after) {
  const tolerance = { ...(before.tolerance ?? {}), ...(after.tolerance ?? {}) };
  const byId = (list) => new Map((list ?? []).map((x) => [String(x.id), x]));
  const was = byId(before.cases), now = byId(after.cases);
  const cases = [];
  for (const id of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(id), b = now.get(id);
    if (!a || !b) { cases.push({ id, added: !a, removed: !b, values: [], items: { gained: [], lost: [], moved: [] } }); continue; }
    const ia = byId(a.items), ib = byId(b.items);
    const items = { gained: [...ib.keys()].filter((k) => !ia.has(k)), lost: [...ia.keys()].filter((k) => !ib.has(k)),
      moved: [...ia.keys()].filter((k) => ib.has(k)).map((k) => ({ id: k, values: moved(ia.get(k).values, ib.get(k).values, tolerance) })).filter((m) => m.values.length) };
    const values = moved(a.values, b.values, tolerance);
    if (values.length || items.gained.length || items.lost.length || items.moved.length) cases.push({ id, values, items });
  }
  // a case that lost a true (a top no longer reached) first, wherever it is in the file
  const lost = (c) => c.values.some((v) => v.how === 'lost') || c.items.moved.some((m) => m.values.some((v) => v.how === 'lost'));
  return { cases: [...cases.filter(lost), ...cases.filter((c) => !lost(c))], same: cases.length === 0 };
}

/** The comparison as lines: one block per case that moved, what was lost first, and a total. */
export function compareLines(diff, { before = 'before', after = 'after', total = 0 } = {}) {
  if (diff.same) return `measure: nothing moved between ${before} and ${after}${total ? ` (${total} cases)` : ''}`;
  const v = (x) => `${x.name} ${show(x.before)} -> ${show(x.after)}${x.how === 'lost' ? ' (lost)' : ''}`;
  const lines = [`measure: ${diff.cases.length}${total ? ` of ${total}` : ''} cases moved between ${before} and ${after}:`];
  for (const c of diff.cases) {
    if (c.added || c.removed) { lines.push(`  ${c.id}: ${c.added ? 'new in' : 'gone from'} ${c.added ? after : before}`); continue; }
    lines.push(`  ${c.id}:`);
    const lost = c.values.filter((x) => x.how === 'lost');
    for (const x of [...lost, ...c.values.filter((y) => y.how !== 'lost')]) lines.push(`    ${v(x)}`);
    if (c.items.lost.length) lines.push(`    options lost: ${c.items.lost.join(', ')}`);
    if (c.items.gained.length) lines.push(`    options gained: ${c.items.gained.join(', ')}`);
    for (const m of c.items.moved) lines.push(`    ${m.id}: ${m.values.map(v).join('; ')}`);
  }
  return lines.join('\n');
}
