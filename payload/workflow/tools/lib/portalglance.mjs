// The portal's "At a glance" page (no I/O here; workflow/tools/portal.mjs gathers the data): where the project stands and what to
// do next on one screen. Four numbers on top; the board on the left (a tie as a question, the next cards with value, effort,
// feasibility and score in columns, what waits, what needs a decision); on the right the numbered needs of the next phase, what
// is worth doing now, the latest decisions and what changed. A quiet part (no tie, no warning) is not shown at all.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

// the skills that take a word after them (/advise roadmap): the chip copies both
const WITH_TOPIC = new Set(['advise', 'arch', 'market', 'estimate', 'work', 'build', 'ship', 'spec', 'shape', 'spike', 'debug', 'find', 'idea']);

/** A line from a tool as HTML: commands as chips that copy on a click, card numbers as links to the card. */
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

const caption = (s) => `<div class="cap">${s}</div>`;
const num = (c) => (c.url ? `<a class="num" href="${esc(c.url)}" target="_blank" rel="noopener">#${c.number}</a>` : `<span class="num">#${c.number}</span>`);
const facts = (c) => [c.column, cap(c.type), c.v1 ? 'First version' : '', c.unlocks ? `unlocks ${c.unlocks}` : '', c.on.length ? `starts on ${c.on.map((n) => `#${n}`).join(', ')}` : ''].filter(Boolean).join(' · ');
const tile = (label, value, note) => `<div class="tile">${caption(label)}<div class="stat">${esc(value)}</div><div class="note">${note}</div></div>`;

/** The next cards as rows with value, effort, feasibility and score in their own columns (the ranked board's view). */
function cardRows(cards, repo) {
  const cell = (v, missing = 'not set') => (v ? esc(cap(v)) : `<span class="unset">${missing}</span>`);
  const rows = cards.map((c) => `<div class="row">${num(c)}<div class="what"><div class="title">${rich(c.title, repo)}</div><div class="facts">${esc(facts(c))}</div></div>`
    + `<div class="col">${cell(c.value)}</div><div class="col">${cell(c.effort)}</div><div class="col">${cell(c.feasibility)}</div><div class="score">${esc(c.score)}</div></div>`);
  return `<div class="ranked"><div class="row head"><span></span><span></span><div class="col">Value</div><div class="col">Effort</div><div class="col">Feasible</div><div class="score">Score</div></div>${rows.join('')}</div>`;
}

/** The board's side: the tie as a question, the next cards, what waits, what needs a decision. */
function boardPart(b, repo, note) {
  if (!b) return `<h2>On the board</h2><p class="quiet">${rich(note)}</p>`;
  const out = ['<h2>On the board</h2>'];
  if (b.tie.length) {
    out.push(`<section class="question">${caption('Question')}<div class="ask">${b.tie.map((c) => `#${c.number}`).join(' and ')} score the same. Which comes first?</div>`
      + `<p class="quiet">Nothing in the graph or the labels puts one first. ${rich('/tidy asks once and keeps your answer as value labels.')}</p>${cardRows(b.tie, repo)}</section>`);
  }
  if (b.next.length) out.push(`<section class="panel">${caption(b.tie.length ? 'Then' : 'Next')}${cardRows(b.next, repo)}`
    + `${b.waiting.length ? `<div class="sub">${caption('Waiting for other cards')}${b.waiting.map((w) => `<div class="line">${num(w)} waits for ${w.waitsFor.map((n) => rich(`#${n}`, repo)).join(' and ')}</div>`).join('')}<div class="quiet">${rich('The tree: npm run board -- --graph')}</div></div>` : ''}</section>`);
  const warn = (title, text) => `<div class="warn" role="note"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3l8 14H2z"/><path d="M10 8v4"/><path d="M10 14.5v.5"/></svg><div><strong>${title}</strong> ${text}</div></div>`;
  for (const d of b.decisions.filter((x) => x.kind !== 'unranked')) out.push(warn(`${cap(d.kind.replace(/-/g, ' '))}.`, `${rich(d.what, repo)}${d.cards.length && !/#d/.test(d.what) ? `: ${d.cards.slice(0, 6).map((n) => rich(`#${n}`, repo)).join(', ')}` : ''}. ${esc(cap(d.suggest))}.`));
  if (b.unranked) out.push(warn('Unranked.', `${b.unranked} startable card${b.unranked === 1 ? ' has' : 's have'} no value label. Set one: the order is only as good as the labels.`));
  if (b.inbox) out.push(warn('Inbox.', rich(`${b.inbox} open issue${b.inbox === 1 ? ' is' : 's are'} not on the board yet: npm run board -- --inbox`)));
  for (const l of b.loops ?? []) out.push(warn('Loop.', `${l.map((n) => rich(`#${n}`, repo)).join(' → ')} wait for each other, so none can start.`));
  return out.join('');
}

/** The other side: the next phase's needs as a numbered list with how far along, what is worth doing now, decisions, changes. */
function sidePart(g) {
  const out = [];
  const p = g.phase;
  if (p?.next) {
    const done = p.needs.filter((n) => n.done).length;
    out.push(`<h2>Before the ${esc(p.next)} phase</h2><section class="panel list"><div class="progress"><span>${done} of ${p.needs.length} done</span><span class="bar"><i style="width:${p.needs.length ? Math.round((done / p.needs.length) * 100) : 100}%"></i></span></div>`
      + `<ol class="needs">${p.needs.map((n) => `<li class="${n.done ? 'done' : ''}">${n.done ? '<span class="tick" aria-label="done">✓</span> ' : ''}${rich(cap(n.what))}</li>`).join('')}</ol></section>`);
  }
  if (g.stage?.length) out.push(`<h2>Worth doing now</h2><section class="panel list"><ol class="needs">${g.stage.map((l) => `<li>${rich(l, g.repo)}</li>`).join('')}</ol></section>`);
  const docs = (title, xs) => (xs?.length ? `<h2>${title}</h2><section class="panel docs">${xs.map((d) => `<a href="/doc/${esc(d.path)}" data-ts="${d.ts ?? ''}"><span>${esc(d.title)}</span><small>${esc(d.date)}</small></a>`).join('')}</section>` : '');
  out.push(docs('Latest decisions', g.decisions), docs('Changed lately', g.recent));
  return out.join('');
}

/**
 * The page: g = { project, repo, phase: { phase, status, next, needs }, stage: [lines], shipped, board (lib/boardview.mjs) or
 * null, boardNote, boardAge: 'fresh' | 'asking' | 'old' | 'failed', asked, decisions, recent, styled }.
 */
export function glanceHtml(g) {
  const b = g.board;
  const phaseName = cap(g.phase?.phase ?? 'unknown');
  const why = esc(/\(([^)]*)\)/.exec(g.phase?.status ?? '')?.[1] ?? '');
  const retro = (g.stage ?? []).some((l) => /\/retro\b/.test(l));
  const decisions = b?.decisions ?? [];
  const tiles = [tile('Phase', phaseName, cap(why)), g.shipped == null ? '' : tile('Shipped this week', g.shipped, retro ? 'No retro yet' : '')];
  if (b) tiles.push(tile('Board decisions waiting', decisions.length, esc(cap(decisions.map((d) => d.kind.replace(/-/g, ' ')).join(', ') || 'none'))),
    tile('Startable, no value label', b.unranked, b.unranked ? 'The order is only as good as the labels' : 'Every card has its value'));
  const age = { fresh: `board as of ${esc(g.asked)}, asked every five minutes`, asking: 'asking the board…', old: `<span class="warn-text">board as of ${esc(g.asked)}: older than a quarter of an hour</span>`, failed: '<span class="warn-text">the board could not be reached (GitHub and the gh command)</span>' }[g.boardAge] ?? '';
  const tidy = decisions.length ? '<button class="primary" data-copy="/tidy" title="Copy /tidy">Tidy the board · /tidy</button>' : '';
  const unstyled = g.styled ? '' : `<div class="notice" role="note">${rich('This project has no style sheet yet, so the portal wears a plain look. /ui writes docs/STYLE.md (the ui module); the portal follows it from then on.')}</div>`;
  return `${unstyled}<header class="top"><div>${caption(`At a glance${age ? ` · ${age}` : ''}`)}<h1>${esc(g.project)}</h1></div>${tidy}</header>`
    + `<section class="tiles" aria-label="Numbers">${tiles.filter(Boolean).join('')}</section>`
    + `<div class="split"><div class="main-col">${boardPart(b, g.repo, g.boardNote ?? 'The board is not set up.')}</div><div class="side-col">${sidePart(g)}</div></div>`;
}
