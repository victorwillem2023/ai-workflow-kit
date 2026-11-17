// The portal's "At a glance" page (no I/O here; workflow/tools/portal.mjs gathers the data): where the project stands and what to
// do next on one screen, in a few words each. Four numbers on top; the board on the left (a tie as a question, the next cards with
// value, effort, feasibility and score in columns, what waits, what needs a decision); on the right the next phase's needs as a
// numbered list, what is worth doing now, the latest decisions and what changed. A quiet part (no tie, no warning) is left out.
// The full sentences stay with the command-line tools (npm run board -- --next, npm run phase, /next); here each item is a short
// title, and its command is a chip.
import { FACT_SHORT } from './phase.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

// the skills that take a word after them (/advise roadmap): the chip copies both
const WITH_TOPIC = new Set(['advise', 'arch', 'market', 'estimate', 'work', 'build', 'ship', 'spec', 'shape', 'spike', 'debug', 'find', 'idea']);

/** A line as HTML: commands as chips that copy on a click, card numbers as links to the card. */
export function rich(text, repo = null) {
  let t = esc(text);
  t = t.replace(/(^|[\s(])(npm run [\w:-]+(?: -- [\w-]+(?: [\w#-]+)?)?)/g, (_, b, cmd) => `${b}<button class="chip" data-copy="${cmd}" title="Copy">${cmd}</button>`);
  t = t.replace(/(^|[\s(])\/([a-z][\w-]*)(?: ([a-z][\w-]*))?(?=[\s.,;:)]|$)/g, (m, b, skill, word) => {
    const cmd = word && WITH_TOPIC.has(skill) ? `/${skill} ${word}` : `/${skill}`;
    const rest = word && !WITH_TOPIC.has(skill) ? ` ${word}` : '';
    return `${b}<button class="chip" data-copy="${cmd}" title="Copy">${cmd}</button>${rest}`;
  });
  if (repo) t = t.replace(/(^|[\s(,])#(\d+)\b/g, (_, b, n) => `${b}<a class="num" href="https://github.com/${repo}/issues/${n}" target="_blank" rel="noopener">#${n}</a>`);
  return t;
}

const chip = (cmd) => (cmd ? `<button class="chip" data-copy="${esc(cmd)}" title="Copy">${esc(cmd)}</button>` : '');
const caption = (s) => `<div class="cap">${s}</div>`;
const num = (c) => (c.url ? `<a class="num" href="${esc(c.url)}" target="_blank" rel="noopener">#${c.number}</a>` : `<span class="num">#${c.number}</span>`);
const facts = (c) => [c.column, cap(c.type), c.v1 ? 'First version' : '', c.unlocks ? `Unlocks ${c.unlocks}` : '', c.on.length ? `On ${c.on.map((n) => `#${n}`).join(', ')}` : ''].filter(Boolean).join(' · ');
const tile = (label, value, note) => `<div class="tile">${caption(label)}<div class="stat">${esc(value)}</div><div class="note">${esc(note)}</div></div>`;
const kindWord = (k) => k.replace(/-/g, ' ');

/** The next cards as rows with value, effort, feasibility and score in their own columns (the ranked board's view). */
function cardRows(cards, repo) {
  const cell = (v) => (v ? esc(cap(v)) : '<span class="unset">Not set</span>');
  const rows = cards.map((c) => `<div class="row">${num(c)}<div class="what"><div class="title">${rich(c.title, repo)}</div><div class="facts">${esc(facts(c))}</div></div>`
    + `<div class="col">${cell(c.value)}</div><div class="col">${cell(c.effort)}</div><div class="col">${cell(c.feasibility)}</div><div class="score">${esc(c.score)}</div></div>`);
  return `<div class="ranked"><div class="row head"><span></span><span></span><div class="col">Value</div><div class="col">Effort</div><div class="col">Feasible</div><div class="score">Score</div></div>${rows.join('')}</div>`;
}

const warnIcon = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3l8 14H2z"/><path d="M10 8v4"/><path d="M10 14.5v.5"/></svg>';
const warn = (title, rest) => `<div class="warn" role="note">${warnIcon}<div><strong>${title}</strong>${rest ? ` <span class="hint">${rest}</span>` : ''}</div></div>`;

/** The board's side: the tie as a question, the next cards, what waits, what needs a decision. */
function boardPart(b, repo, note) {
  if (!b) return `<h2>On the board</h2><p class="quiet">${rich(note)}</p>`;
  const out = ['<h2>On the board</h2>'];
  if (b.tie.length) {
    out.push(`<section class="question">${caption('Question')}<div class="ask">${b.tie.map((c) => `#${c.number}`).join(' and ')} score the same. Which first?</div>`
      + `<p class="quiet">Pick one with ${chip('/tidy')}: it is kept as their value.</p>${cardRows(b.tie, repo)}</section>`);
  }
  if (b.next.length) {
    const waiting = b.waiting.length ? `<div class="sub">${caption('Waiting')}${b.waiting.map((w) => `<div class="line">${num(w)} waits for ${w.waitsFor.map((n) => rich(`#${n}`, repo)).join(' and ')}</div>`).join('')}<div class="quiet">Tree: ${chip('npm run board -- --graph')}</div></div>` : '';
    out.push(`<section class="panel">${caption(b.tie.length ? 'Then' : 'Next')}${cardRows(b.next, repo)}${waiting}</section>`);
  }
  // what needs a decision, a line each; the cards without a value are the tile's, not a warning of their own
  for (const d of b.decisions.filter((x) => x.kind !== 'unranked')) {
    const cards = d.cards.length && !/#\d/.test(d.title) ? `: ${d.cards.slice(0, 6).map((n) => rich(`#${n}`, repo)).join(', ')}${d.cards.length > 6 ? '…' : ''}` : '';
    out.push(warn(`${rich(d.title, repo)}${cards}.`, `${esc(d.hint)}.`));
  }
  for (const l of b.loops ?? []) out.push(warn(`${l.map((n) => rich(`#${n}`, repo)).join(' → ')} wait for each other.`, 'None can start.'));
  return out.join('');
}

/** The other side: the next phase's needs with how far along, what is worth doing now, decisions, changes. */
function sidePart(g) {
  const out = [];
  const p = g.phase;
  if (p?.next) {
    const done = p.needs.filter((n) => n.done).length;
    const item = (n) => `<li class="${n.done ? 'done' : ''}"><span class="item">${n.done ? '<span class="tick" aria-label="done">✓</span> ' : ''}${esc(n.short ?? cap(n.what))}</span>${!n.done && n.how ? `<span class="how">${rich(n.how)}</span>` : ''}</li>`;
    out.push(`<h2>Before the ${esc(p.next)} phase</h2><section class="panel list"><div class="progress"><span>${done} of ${p.needs.length} done</span><span class="bar"><i style="width:${p.needs.length ? Math.round((done / p.needs.length) * 100) : 100}%"></i></span></div>`
      + `<ol class="needs">${p.needs.map(item).join('')}</ol></section>`);
  }
  if (g.stage?.length) {
    const item = (s) => `<li><span class="item">${rich(s.title, g.repo)}</span>${s.command || s.time ? `<span class="how">${chip(s.command)}${s.time ? ` <small>${esc(s.time)}</small>` : ''}</span>` : ''}</li>`;
    out.push(`<h2>Worth doing now</h2><section class="panel list"><ol class="needs">${g.stage.map(item).join('')}</ol></section>`);
  }
  const docs = (title, xs) => (xs?.length ? `<h2>${title}</h2><section class="panel docs">${xs.map((d) => `<a href="/doc/${esc(d.path)}" data-ts="${d.ts ?? ''}"><span>${esc(d.title)}</span><small>${esc(d.date)}</small></a>`).join('')}</section>` : '');
  out.push(docs('Latest decisions', g.decisions), docs('Changed lately', g.recent));
  return out.join('');
}

/**
 * The page: g = { project, repo, phase: { phase, facts: [id], next, needs: [{ short, how, done }] }, stage: [{ title, command,
 * time }], shipped, board (lib/boardview.mjs) or null, boardNote, boardAge: 'fresh' | 'asking' | 'old' | 'failed', asked,
 * decisions, recent, styled }.
 */
export function glanceHtml(g) {
  const b = g.board;
  const why = (g.phase?.facts ?? []).map((f) => FACT_SHORT[f] ?? f).join(' · ') || 'Nothing depends on it yet';
  const retro = (g.stage ?? []).some((s) => s.command === '/retro');
  const decisions = b?.decisions ?? [];
  const tiles = [tile('Phase', cap(g.phase?.phase ?? 'unknown'), why), g.shipped == null ? '' : tile('Shipped this week', g.shipped, retro ? 'No retro yet' : '')];
  if (b) tiles.push(tile('Board decisions', decisions.length, cap(decisions.map((d) => kindWord(d.kind)).join(', ')) || 'None'),
    tile('Without a value', b.unranked, b.unranked ? 'Set value and effort' : 'Every card has one'));
  const age = { fresh: `board ${esc(g.asked)}`, asking: 'asking the board…', old: `<span class="warn-text">board ${esc(g.asked)}, over 15 minutes old</span>`, failed: '<span class="warn-text">board not reachable</span>' }[g.boardAge] ?? '';
  const tidy = decisions.length ? '<button class="primary" data-copy="/tidy" title="Copy /tidy">Tidy the board · /tidy</button>' : '';
  const unstyled = g.styled ? '' : `<div class="notice" role="note">No style sheet yet, so a plain look. ${chip('/ui')} writes <code>docs/STYLE.md</code>; the portal follows it.</div>`;
  return `${unstyled}<header class="top"><div>${caption(`At a glance${age ? ` · ${age}` : ''}`)}<h1>${esc(g.project)}</h1></div>${tidy}</header>`
    + `<section class="tiles" aria-label="Numbers">${tiles.filter(Boolean).join('')}</section>`
    + `<div class="split"><div class="main-col">${boardPart(b, g.repo, g.boardNote ?? 'No board yet: /setup makes it.')}</div><div class="side-col">${sidePart(g)}</div></div>`;
}
