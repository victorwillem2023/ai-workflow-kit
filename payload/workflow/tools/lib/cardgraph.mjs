// Which cards need which (no I/O here): a card's text says what must be done before it, one line `Depends on: #1, #3` (also
// "After:", "Needs:", "Blocked by:"). From those lines: what each open card still waits for, how many open cards each one
// unlocks (directly or further down), and the loops, so the order of work follows the graph before it follows value.

const LINE = /^\s*(?:[-*]\s*)?\**(?:depends on|after|needs|blocked by)\**\s*:?\s*(.+)$/gim;

/** The card numbers a card's text says it depends on. */
export function dependsOn(body) {
  const out = new Set();
  for (const m of String(body ?? '').matchAll(LINE)) for (const n of m[1].matchAll(/#(\d+)/g)) out.add(Number(n[1]));
  return [...out].sort((a, b) => a - b);
}

/** Only the dependency lines of a card's text (what the board keeps, so it never carries whole card texts around). */
export const dependsOnLines = (body) => (String(body ?? '').match(LINE) ?? []).map((l) => l.trim()).join('\n');

/** A card's text with a dependency line added (or the existing "Depends on:" line extended), for --depends. */
export function addDepends(body, numbers) {
  return setDepends(body, [...dependsOn(body), ...numbers]);
}
/** The card text without those dependencies (the line goes when none are left). */
export function removeDepends(body, numbers) {
  return setDepends(body, dependsOn(body).filter((n) => !numbers.includes(n)));
}
function setDepends(body, numbers) {
  const all = [...new Set(numbers)].sort((a, b) => a - b);
  const text = String(body ?? '');
  // [ \t] and not \s at the start: \s would swallow the blank line above the existing line
  const existing = /^[ \t]*\**depends on\**[ \t]*:?.*$/im;
  if (!all.length) return text.replace(/\n*^[ \t]*\**depends on\**[ \t]*:?.*$/im, '');
  const line = `Depends on: ${all.map((n) => `#${n}`).join(', ')}`;
  return existing.test(text) ? text.replace(existing, line) : `${text.replace(/\s*$/, '')}\n\n${line}\n`;
}

/** The graph as text: each card that nothing waits on at the top, what depends on it indented below, so the order reads down. */
export function renderTree(cards) {
  const open = cards.filter((c) => !isDone(c));
  const { waitsFor, loops } = cardGraph(cards);
  const byNo = new Map(cards.map((c) => [c.number, c]));
  const children = new Map();
  for (const [n, ws] of waitsFor) for (const d of ws) children.set(d, [...(children.get(d) ?? []), n]);
  const lines = [];
  const shown = new Set();
  const draw = (n, depth) => {
    const c = byNo.get(n);
    lines.push(`${'  '.repeat(depth)}${depth ? '└ ' : ''}#${n} ${c?.title ?? ''}${shown.has(n) ? ' (above)' : ''}`);
    if (shown.has(n)) return;
    shown.add(n);
    for (const k of (children.get(n) ?? []).sort((a, b) => a - b)) draw(k, depth + 1);
  };
  for (const c of open.filter((x) => !(waitsFor.get(x.number) ?? []).length).sort((a, b) => a.number - b.number)) draw(c.number, 0);
  if (loops.length) lines.push('', ...loops.map((l) => `LOOP: ${l.map((n) => `#${n}`).join(' waits for ')} waits for #${l[0]}: none of them can start; take one dependency out`));
  return lines.join('\n');
}

/** A card counts as done when it is closed or in the Done column. */
const isDone = (c) => !c || c.state !== 'open' || c.column === 'Done';

/** The graph of the open cards: { waitsFor: Map<n, [open deps]>, unlocks: Map<n, count>, unknown: Map<n, [missing #]>, loops: [[n...]] }. */
export function cardGraph(cards) {
  const byNo = new Map(cards.map((c) => [c.number, c]));
  const deps = new Map(cards.map((c) => [c.number, dependsOn(c.body).filter((d) => d !== c.number)]));
  const waitsFor = new Map(), unknown = new Map();
  for (const c of cards.filter((x) => !isDone(x))) {
    const ds = deps.get(c.number);
    waitsFor.set(c.number, ds.filter((d) => byNo.has(d) && !isDone(byNo.get(d))));
    const missing = ds.filter((d) => !byNo.has(d));
    if (missing.length) unknown.set(c.number, missing);
  }
  // who needs whom, the other way round: dependents[n] = the open cards that list n
  const dependents = new Map();
  for (const [n, ws] of waitsFor) for (const d of ws) dependents.set(d, [...(dependents.get(d) ?? []), n]);
  const unlocks = new Map(), unlocked = new Map();
  for (const n of waitsFor.keys()) {
    const seen = new Set();
    const walk = (x) => { for (const y of dependents.get(x) ?? []) if (!seen.has(y) && y !== n) { seen.add(y); walk(y); } };
    walk(n);
    unlocks.set(n, seen.size);
    unlocked.set(n, seen);
  }
  return { waitsFor, unlocks, unlocked, unknown, loops: findLoops(waitsFor) };
}

/** Cards that wait for each other in a circle (none of them can ever start): each loop once, smallest number first. */
function findLoops(waitsFor) {
  const loops = [], seen = new Set();
  const visit = (n, path) => {
    if (path.includes(n)) {
      const loop = path.slice(path.indexOf(n));
      const key = [...loop].sort((a, b) => a - b).join(',');
      if (!seen.has(key)) { seen.add(key); const i = loop.indexOf(Math.min(...loop)); loops.push([...loop.slice(i), ...loop.slice(0, i)]); }
      return;
    }
    if (path.length > 50) return;
    for (const d of waitsFor.get(n) ?? []) visit(d, [...path, n]);
  };
  for (const n of waitsFor.keys()) visit(n, []);
  return loops;
}
