// The worksheet (npm run board -- --map): which open cards sit on which ends of the app map (docs/flow/map.js and the
// request pages' docs/flow/requests.js), the open cards on no end, and the map's hygiene problems. Made fresh each run
// from the board and the map; nothing is stored. `worksheet()` is pure; `loadFlow()` reads the two map files.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

/** The app map's groups (requests first, as the page shows them), read by running the two browser scripts in a sandbox. */
export function loadFlow(root) {
  const window = {};
  for (const f of ['docs/flow/requests.js', 'docs/flow/map.js']) {
    const file = join(root, f);
    if (existsSync(file)) vm.runInNewContext(readFileSync(file, 'utf8'), { window }, { filename: f, timeout: 2000 });
  }
  if (!window.FLOW) throw new Error('docs/flow/map.js did not set window.FLOW.');
  // where the request pages live: `map.requests` in workflow.config.json ({ index, folder }), else the kit's own places
  let requests = {};
  try { requests = JSON.parse(readFileSync(join(root, 'workflow.config.json'), 'utf8')).map?.requests ?? {}; } catch { /* no config: the kit's places */ }
  const requestPages = [requests.index ?? 'docs/REQUESTS.md', requests.folder ?? 'docs/requests/'];
  return { groups: [...(window.FLOW_REQUESTS ? [window.FLOW_REQUESTS] : []), ...window.FLOW.groups], requestPages };
}

/** Every end of the map with where it is: group › stage, and the stage's source file (where to fix it). */
export function mapEnds(flow) {
  const ends = [];
  const walk = (nodes, at) => {
    for (const n of nodes ?? []) {
      if (n.q) {
        walk(n.yes, at); walk(n.no, at);
        for (const [, sub] of n.opts ?? []) walk(sub, at);
      } else if (n.t) ends.push({ ...at, text: n.t, status: n.s ?? 'built', cards: n.card ?? [], note: n.n ?? '' });
    }
  };
  for (const g of flow.groups) for (const st of g.stages) walk(st.tree, { where: `${g.name} › ${st.name}`, src: st.src ?? '' });
  return ends;
}

/** The ends not built (`gap`) or built with a known problem (`weak`) that no open card is on: what nobody plans yet. */
export function mapGaps(flow, cards) {
  const open = new Set(cards.filter((c) => c.state === 'open').map((c) => c.number));
  return mapEnds(flow).filter((e) => (e.status === 'gap' || e.status === 'weak') && !e.cards.some((n) => open.has(n)));
}

/** The files the map says decisions are made in (`f:` on a question or an end), and how many decisions name none. */
export function mapFiles(flow) {
  const files = new Set();
  let unnamed = 0;
  const walk = (nodes) => {
    for (const n of nodes ?? []) {
      const f = typeof n.f === 'string' && /^[\w./-]+\.\w+$/.test(n.f) ? n.f : null;
      if (f) files.add(f);
      else if (n.q) unnamed++;
      if (n.q) { walk(n.yes); walk(n.no); for (const [, sub] of n.opts ?? []) walk(sub); }
    }
  };
  for (const g of flow.groups) for (const st of g.stages) if (g.basis !== 'requests' && !String(g.name).startsWith('What someone asks')) walk(st.tree);
  return { files, unnamed };
}

/** The advice when code the map names changed and the map did not: a decision may have moved without its node. */
export function staleMapAdvice(flow, changed) {
  if (changed.includes('docs/flow/map.js')) return [];
  const { files } = mapFiles(flow);
  const hit = changed.filter((f) => files.has(f));
  return hit.length ? [`advice: ${hit.join(', ')} changed and docs/flow/map.js did not: if a decision there changed, update its node in the same commit`] : [];
}

// A note that tells history (a date) instead of what is true now: "31 boards drawn (13 to 14 Nov)".
const DATED = /\b\d{1,2}(?:\s*(?:to|-|–)\s*\d{1,2})?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/;
// Columns where a card's work is under way: a `building` end's card belongs in one of these.
const UNDER_WAY = ['Ready', 'In progress', 'Waiting for your check'];
// Card types that are about the app's decisions; a `workflow` card is about how we work and has no place on the map.
const OFF_MAP_TYPES = ['workflow'];

const short = (s, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
// an end that comes from a request page is fixed on that page (`map.requests`; the kit's places when a flow has none)
const isRequestPage = (e, pages = ['docs/REQUESTS.md', 'docs/requests/']) => pages.some((p) => e.src.startsWith(p));

/** The hygiene problems, one plain line each, saying where to fix it. */
function hygiene(ends, byNumber, requestPages) {
  const out = [];
  for (const e of ends) {
    const at = `"${short(e.text, 50)}" (${e.where}${isRequestPage(e, requestPages) ? `, fix it on ${e.src}` : ''})`;
    for (const n of e.cards) {
      const c = byNumber.get(n);
      if (!c) out.push(`#${n} is on ${at} but is no card on the board.`);
      else if (c.state !== 'open') out.push(`#${n} is closed but still on ${at}: drop it.`);
      else if (e.status === 'building' && !UNDER_WAY.includes(c.column)) out.push(`${at} is building, but #${n} is in ${c.column ?? 'no column'}.`);
    }
    if (e.status === 'built' && e.cards.some((n) => byNumber.get(n)?.state === 'open')) {
      out.push(`${at} is built but still carries ${e.cards.map((n) => `#${n}`).join(' ')}: drop the card, or mark what is left.`);
    }
    if (e.status === 'building' && !e.cards.length) out.push(`${at} is building with no card on it.`);
    if (DATED.test(e.note)) out.push(`${at} has a dated note ("${short(e.note, 40)}"): say what is true now, not when.`);
  }
  return out;
}

// Columns whose every card is listed; in the others (Backlog, Done) only the cards on the map, the rest counted.
const ACTIVE = [...UNDER_WAY, 'Blocked'];

/** The worksheet as text: open cards by column with the ends they are on, then the hygiene problems. */
export function worksheet(flow, cards, columns, { all = false } = {}) {
  const ends = mapEnds(flow);
  const byNumber = new Map(cards.map((c) => [c.number, c]));
  const lines = [];
  const open = cards.filter((c) => c.state === 'open' && !c.labels.some((l) => OFF_MAP_TYPES.includes(l)));
  const order = [...columns, null];
  for (const col of order) {
    const here = open.filter((c) => (c.column ?? null) === col || (col === null && c.column && !columns.includes(c.column)));
    if (!here.length) continue;
    const every = all || ACTIVE.includes(col);
    const shown = here.filter((c) => every || ends.some((e) => e.cards.includes(c.number)));
    lines.push(col ?? 'Not on the board');
    for (const c of shown.sort((a, b) => a.number - b.number)) {
      const on = ends.filter((e) => e.cards.includes(c.number));
      lines.push(`  #${c.number} ${short(c.title)}${on.length ? '' : '   (on no map end)'}`);
      for (const e of on) lines.push(`      ${e.where} › ${short(e.text, 60)} (${e.status})`);
    }
    if (shown.length < here.length) lines.push(`  and ${here.length - shown.length} more on no map end (--all lists them)`);
  }
  const problems = hygiene(ends, byNumber, flow.requestPages);
  lines.push('', problems.length ? `Hygiene (${problems.length})` : 'Hygiene: nothing to fix.', ...problems.map((p) => `  - ${p}`));
  return { text: lines.join('\n'), problems };
}
