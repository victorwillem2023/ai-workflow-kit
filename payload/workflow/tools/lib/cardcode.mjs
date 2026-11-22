// A card joined to the state of the code (no I/O here; npm run board -- --next and --show say it as a "code:" line): when the
// card is likely to change a file the code's state already points at (lib/hotspots.mjs: changed often and too big, changed
// often with no test, in an import circle, in the way of earlier cards), the refactor is offered at the moment it pays, right
// before the card that would pay for the mess again. Which files a card will change is read from two things only:
//   the card itself     a path its title or text names
//   its area's history  the files the shipped cards of its area usually changed (lib/shipped.mjs areaFiles)
// A guess, said as one: /spec reads the code and decides.
import { areaFiles } from './shipped.mjs';
import { isDone } from './cardgraph.mjs'; // a split card in Done is finished, not "that work"

const name = (a) => String(a).replace(/^area:\s*/i, '');

/** The file paths a text names ("src/core/plan.ts", `tests/a.test.ts`): something with a folder and an extension. */
export function filesNamed(text) {
  const found = String(text ?? '').match(/(?<![\w/.:-])(?:[\w.@-]+\/)+[\w.@-]+\.[A-Za-z][A-Za-z0-9]{0,4}(?![\w/])/g) ?? [];
  return [...new Set(found.filter((f) => !/^(https?|www\.)/i.test(f)))];
}

// what is wrong with the file, and what to do first, by the kind of suggestion
const SAY = {
  hotspot: (h, f) => [`it ${h.what.slice(f.length + 1).split(': ')[0]}`, 'split it first, or in this card when that fits its size'],
  'untested-churn': () => ['it is changed often and no test reaches it', 'pin what it does with a test first'],
  circles: () => ['it sits in an import circle, so it cannot change alone', 'untangle the circle first'],
  'in-the-way': (h) => [`it ${h.what.split(' ').slice(1).join(' ').split(': ')[0]}`, 'clean that up first, or in this card when that fits its size'],
};

/**
 * The line for one card, or null: { file, kind, line }. `spots`: lib/hotspots.mjs's suggestions, best first; `records`: the
 * shipped records; `areas`: the config's area labels; `open`: the open cards (one under `health` that names the file is
 * that work already, and is named instead of a new one). A code health card gets no line: it is the work itself.
 */
export function codeAdvice(card, { spots = [], records = [], areas = [], open = [], health = 'area: Code health' } = {}) {
  if (card.labels.includes(health)) return null;
  const named = filesNamed(`${card.title}\n${card.body ?? ''}`);
  const area = areas.find((a) => card.labels.includes(a));
  const usual = area ? areaFiles(records, area) : [];
  for (const h of spots.filter((x) => SAY[x.kind])) {
    const file = h.files.find((f) => named.includes(f)) ?? h.files.find((f) => usual.some((u) => u.file === f));
    if (!file) continue;
    const u = usual.find((x) => x.file === file);
    const reason = named.includes(file) ? 'the card names it' : `${u.of} of the last ${u.total} ${name(area)} cards changed it`;
    const [wrong, first] = SAY[h.kind](h, file);
    const has = open.find((c) => c.number !== card.number && !isDone(c) && c.labels.includes(health) && `${c.title}\n${c.body ?? ''}`.includes(file));
    const then = has ? `#${has.number} is that work: do it first (npm run board -- --depends ${card.number} ${has.number})` : `${first} (${h.principle.split(':')[0]})`;
    return { file, kind: h.kind, card: has?.number ?? null, line: `code: #${card.number} is likely to change ${file} (${reason}), and ${wrong}: ${then}` };
  }
  return null;
}
