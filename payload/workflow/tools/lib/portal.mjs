// The docs portal's pure parts (no I/O here; workflow/tools/portal.mjs serves them): Markdown to HTML for the kit's own doc style
// (headings, paragraphs, lists, tables, code, quotes, links between docs), the menu grouped as the docs index groups it
// (lib/docsindex.mjs), the "at a glance" block, and the page around them, with search and the live reload.
import { posix } from 'node:path';
import { SUBJECTS, describe } from './docsindex.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const slug = (s) => String(s).toLowerCase().replace(/<[^>]+>|`/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

/** Where a link in `from` (a repo path) goes in the portal: a listed doc, a project file, or the web as it is. */
export function linkTo(href, from, known = new Set()) {
  if (/^(?:[a-z]+:|#)/i.test(href)) return href;
  const [file, hash] = href.split('#');
  const path = posix.normalize(posix.join(posix.dirname(from), decodeURI(file)));
  if (path.startsWith('..')) return null;
  const anchor = hash ? `#${hash}` : '';
  return known.has(path) ? `/doc/${path}${anchor}` : `/file/${path}${anchor}`;
}

/** Text inside a block: code spans, images, links, bold, italic; a code span that names a listed doc becomes its link. */
export function inline(text, from = '', known = new Set()) {
  const spans = [];
  const keep = (html) => `\u0000${spans.push(html) - 1}\u0000`;
  let t = String(text).replace(/`([^`]+)`/g, (_, code) => {
    const doc = [code, `docs/${code}`].find((p) => known.has(p));
    return keep(doc ? `<a href="/doc/${doc}"><code>${esc(code)}</code></a>` : `<code>${esc(code)}</code>`);
  });
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, alt, src) => keep(`<img src="${esc(linkTo(src, from, known) ?? src)}" alt="${esc(alt)}">`));
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_, label, href) => {
    const to = linkTo(href, from, known);
    return keep(to ? `<a href="${esc(to)}"${/^https?:/.test(to) ? ' target="_blank" rel="noopener"' : ''}>${inline(label, from, known)}</a>` : esc(label));
  });
  t = t.replace(/<(https?:\/\/[^>\s]+)>/g, (_, u) => keep(`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`));
  t = esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => spans[Number(i)]);
}

const cells = (row) => row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

/** A list starting at line i: [html, next i]. Items by their marker, a deeper indent is a list inside the item. */
function list(lines, i, ctx) {
  const indent = /^(\s*)/.exec(lines[i])[1].length;
  const ordered = /^\s*\d+[.)]\s/.test(lines[i]);
  const items = [];
  while (i < lines.length) {
    const m = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
    if (!m || m[1].length !== indent) break;
    let body = m[2];
    let sub = '';
    i++;
    while (i < lines.length && lines[i].trim() && !/^\s*(?:[-*+]|\d+[.)])\s/.test(lines[i]) && /^\s+/.test(lines[i])) body += ` ${lines[i++].trim()}`;
    if (i < lines.length && /^(\s*)(?:[-*+]|\d+[.)])\s/.exec(lines[i])?.[1].length > indent) [sub, i] = list(lines, i, ctx);
    items.push(`<li>${inline(body, ctx.from, ctx.known)}${sub}</li>`);
  }
  return [`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`, i];
}

/** A table starting at line i (a header row and its |---| line): [html, next i]. */
function table(lines, i, ctx) {
  const head = cells(lines[i]).map((c) => `<th>${inline(c, ctx.from, ctx.known)}</th>`).join('');
  const rows = [];
  for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(`<tr>${cells(lines[i]).map((c) => `<td>${inline(c, ctx.from, ctx.known)}</td>`).join('')}</tr>`);
  return [`<div class="table"><table><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`, i];
}

/** Raw HTML a doc carries (a centred logo): its relative src and href pointed into the portal. */
const rawHtml = (line, ctx) => line.replace(/\b(src|href)="([^"]+)"/g, (m, attr, v) => `${attr}="${esc(linkTo(v, ctx.from, ctx.known) ?? v)}"`);

/** Markdown in the kit's doc style as HTML. `from`: the doc's repo path (for its links); `known`: the listed docs. */
export function markdown(md, { from = '', known = new Set() } = {}) {
  const ctx = { from, known };
  const lines = String(md).replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    const fence = /^\s*(```+|~~~+)\s*([\w-]*)/.exec(line);
    if (fence) {
      const body = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) body.push(lines[i]);
      out.push(`<pre><code${fence[2] ? ` class="lang-${esc(fence[2])}"` : ''}>${esc(body.join('\n'))}</code></pre>`);
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line);
    if (h) { out.push(`<h${h[1].length} id="${slug(h[2])}">${inline(h[2], from, known)}</h${h[1].length}>`); i++; continue; }
    if (/^\s*\|/.test(line) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) { let html; [html, i] = table(lines, i, ctx); out.push(html); continue; }
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) { let html; [html, i] = list(lines, i, ctx); out.push(html); continue; }
    if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^\s*>/.test(line)) {
      const quote = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quote.push(lines[i].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${markdown(quote.join('\n'), ctx)}</blockquote>`);
      continue;
    }
    if (/^\s*<[a-z][^>]*>/i.test(line)) { out.push(rawHtml(line, ctx)); i++; continue; }
    if (!line.trim()) { i++; continue; }
    const para = [];
    for (; i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*~~~|\s*\||\s*(?:[-*+]|\d+[.)])\s|\s*>)/.test(lines[i]); i++) para.push(lines[i].trim());
    if (!para.length) { out.push(`<p>${inline(lines[i++].trim(), from, known)}</p>`); continue; }
    out.push(`<p>${inline(para.join(' '), from, known)}</p>`);
  }
  return out.join('\n');
}

/** A doc's one line (lib/docsindex.mjs), leaving out a doc's raw HTML lines (a centred logo is not what it is about). */
export const about = (text) => describe(String(text ?? '').replace(/^\s*<[^\n]*$/gm, ''));

/** A doc's title: its first "# " heading outside a code block, else its file name. */
export const titleOf = (path, text) => /^#\s+(.+)$/m.exec(String(text ?? '').replace(/^\s*(```|~~~)[\s\S]*?^\s*\1.*$/gm, ''))?.[1].replace(/`/g, '').trim() ?? posix.basename(path, '.md');

/**
 * The menu: sections of { title, items: [{ path, label, what, kit }] }, in the order a project meets them: start here, the
 * product and how it is built, the subject folders, the other folders under docs/, then the kit's own guides.
 */
export function menu(docs, kit = new Set()) {
  const item = (d) => ({ path: d.path, label: posix.basename(d.path, '.md'), what: about(d.text), kit: kit.has(d.path) });
  const sorted = (xs) => xs.map(item).sort((a, b) => a.label.localeCompare(b.label));
  const where = (re) => docs.filter((d) => re.test(d.path));
  const sections = [
    { title: 'Start here', items: sorted(where(/^(?:README|CLAUDE)\.md$/)) },
    { title: 'The product and how it is built', items: sorted(where(/^docs\/[^/]+\.md$/).filter((d) => !/^docs\/(?:README|MAP)\.md$/.test(d.path))) },
    ...SUBJECTS.map(([folder, name]) => ({ title: name, items: sorted(where(new RegExp(`^docs/${folder}/[^/]+\\.md$`))) })),
  ];
  const subjects = new Set(SUBJECTS.map(([f]) => f));
  const others = [...new Set(docs.map((d) => /^docs\/([^/]+)\//.exec(d.path)?.[1]).filter((f) => f && !subjects.has(f)))].sort();
  for (const f of others) sections.push({ title: `${f[0].toUpperCase()}${f.slice(1)}`, items: sorted(where(new RegExp(`^docs/${f}/`))), folder: true });
  sections.push({ title: 'How we work with the AI (the kit\'s guides)', items: sorted(where(/^workflow\/(?:guides\/[^/]+|tools\/README)\.md$/)), folder: true });
  return sections.filter((s) => s.items.length);
}

/** The menu as HTML, the open doc marked. */
export function menuHtml(sections, current = '', maps = {}) {
  const link = (it) => `<a href="/doc/${esc(it.path)}" title="${esc(it.what)}"${it.path === current ? ' class="here"' : ''}>${esc(it.label)}${it.kit ? ' <small>kit</small>' : ''}</a>`;
  const block = (s) => {
    const open = !s.folder || s.items.some((it) => it.path === current) ? ' open' : '';
    return `<details${open}><summary>${esc(s.title)} <small>${s.items.length}</small></summary>${s.items.map(link).join('')}</details>`;
  };
  const mapLinks = [maps.file && '<a href="/doc/docs/MAP.md">File map</a>', maps.app && '<a href="/file/docs/flow/index.html" target="_blank">App map</a>'].filter(Boolean);
  return `<a class="home${current ? '' : ' here'}" href="/">At a glance</a>${mapLinks.length ? `<div class="maps">${mapLinks.join('')}</div>` : ''}${sections.map(block).join('')}`;
}

/**
 * The "at a glance" block from what the tools say: { phase: [lines], missing: [lines], stage: [lines], board: [lines] | null,
 * boardNote, decisions: [{ path, title, date }], recent: [{ path, title, date }] }.
 */
export function glanceHtml(g) {
  const lines = (xs) => (xs?.length ? `<ul>${xs.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>` : '');
  const docs = (xs) => (xs?.length ? `<ul class="docs">${xs.map((d) => `<li><a href="/doc/${esc(d.path)}">${esc(d.title)}</a> <small>${esc(d.date)}</small></li>`).join('')}</ul>` : '<p class="quiet">None yet.</p>');
  const card = (title, body) => `<section class="card"><h2>${title}</h2>${body}</section>`;
  return `<div class="glance">${[
    card('Where the project is', `${lines(g.phase)}${g.missing?.length ? `<p class="quiet">The next phase still needs:</p>${lines(g.missing)}` : ''}${lines(g.stage)}`),
    card('On the board', g.board ? `${lines(g.board)}${g.boardNote ? `<p class="quiet">${esc(g.boardNote)}</p>` : ''}` : `<p class="quiet">${esc(g.boardNote ?? 'The board is not set up.')}</p>`),
    card('Latest decisions', docs(g.decisions)),
    card('Changed lately', docs(g.recent)),
  ].join('')}</div>`;
}

const STYLE = `:root{--bg:#fbfaf7;--fg:#1f2328;--muted:#6a6f76;--line:#e4e1da;--side:#f3f1ec;--accent:#2f6f5e;--code:#efece5;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#16181b;--fg:#e6e3dd;--muted:#9aa0a6;--line:#2c3036;--side:#1d2024;--accent:#7cc4ad;--code:#23272c;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
.layout{display:grid;grid-template-columns:270px 1fr;min-height:100vh}nav{background:var(--side);border-right:1px solid var(--line);padding:16px 12px;position:sticky;top:0;height:100vh;overflow:auto}
nav .project{font-weight:700;font-size:17px;margin:0 6px 10px}nav input{width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);margin-bottom:10px}
nav a{display:block;padding:3px 8px;border-radius:5px;color:var(--fg);text-decoration:none;font-size:14px}nav a:hover{background:var(--line)}nav a.here{background:var(--accent);color:var(--bg)}
nav summary{cursor:pointer;font-weight:600;font-size:13px;color:var(--muted);margin:10px 4px 4px;text-transform:uppercase;letter-spacing:.03em}nav small{color:var(--muted);font-weight:400}nav a.here small{color:inherit}
nav .maps{display:flex;gap:6px;margin:6px 0}nav .maps a{border:1px solid var(--line)}nav .home{font-weight:600}
main{padding:28px 40px 80px;max-width:980px;width:100%}h1{font-size:28px;margin:0 0 12px}h2{font-size:21px;margin:28px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}h3{font-size:17px;margin:22px 0 6px}
a{color:var(--accent)}code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:13px}pre{background:var(--code);padding:12px 14px;border-radius:8px;overflow:auto}pre code{padding:0;background:none}
.table{overflow-x:auto}table{border-collapse:collapse;margin:10px 0;font-size:14px}th,td{border:1px solid var(--line);padding:6px 9px;text-align:left;vertical-align:top}th{background:var(--side)}
blockquote{margin:12px 0;padding:2px 14px;border-left:3px solid var(--accent);color:var(--muted)}img{max-width:100%}
.glance{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:22px}.card{border:1px solid var(--line);border-radius:10px;padding:4px 16px 12px;background:var(--side)}
.card h2{border:0;font-size:16px;margin:12px 0 6px}.card ul{padding-left:18px;margin:6px 0}.quiet{color:var(--muted);font-size:14px}.docs small{color:var(--muted)}
.crumb{color:var(--muted);font-size:13px;margin-bottom:6px}.results a{display:block;padding:6px 0;border-bottom:1px solid var(--line);text-decoration:none}.results small{display:block;color:var(--muted)}
@media (max-width:760px){.layout{grid-template-columns:1fr}nav{position:static;height:auto}main{padding:20px 16px}}`;

// search over every doc (/search.json, fetched once), and a reload when a doc changes (/events, the server watches the folders)
const SCRIPT = `const q=document.getElementById('q'),main=document.querySelector('main'),page=main.innerHTML;let all=null;
q.addEventListener('input',async()=>{const w=q.value.trim().toLowerCase().split(/\\s+/).filter(Boolean);if(!w.length){main.innerHTML=page;return}
all??=await (await fetch('/search.json')).json();const hit=all.filter(d=>w.every(x=>d.text.includes(x))).slice(0,40);
main.innerHTML='<h1>Search</h1>'+(hit.length?'<div class="results">'+hit.map(d=>{const i=d.text.indexOf(w[0]);const s=d.text.slice(Math.max(0,i-60),i+120).replace(/[<>&]/g,'');
return '<a href="/doc/'+d.path+'">'+d.title.replace(/[<>&]/g,'')+'<small>'+d.path+' — …'+s+'…</small></a>'}).join('')+'</div>':'<p class="quiet">Nothing found.</p>')});
new EventSource('/events').onmessage=()=>location.reload();`;

/** The whole page. */
export const pageHtml = ({ project, title, nav, body, crumb = '' }) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ${esc(project)}</title><style>${STYLE}</style></head>
<body><div class="layout"><nav><div class="project">${esc(project)}</div><input id="q" type="search" placeholder="Search every doc" autocomplete="off">${nav}</nav>
<main>${crumb ? `<div class="crumb">${esc(crumb)}</div>` : ''}${body}</main></div><script>${SCRIPT}</script></body></html>`;
