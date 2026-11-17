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
    // an item that is only a link: its underline shows on hover and focus (a column of underlines is busy)
    const onlyLink = /^\[[^\]]+\]\([^)]+\)[.;,]?$/.test(body.trim());
    items.push(`<li${onlyLink ? ' class="link"' : ''}>${inline(body, ctx.from, ctx.known)}${sub}</li>`);
  }
  return [`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`, i];
}

/**
 * A table starting at line i (a header row and its |---| line): [html, next i]. A column whose cells are all short (a status, a
 * number) keeps from wrapping, so the widest text column gets the spare width.
 */
function table(lines, i, ctx) {
  const head = cells(lines[i]);
  const body = [];
  for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) body.push(cells(lines[i]));
  const short = head.map((h, c) => [h, ...body.map((r) => r[c] ?? '')].every((x) => x.replace(/`|\*\*/g, '').length <= 14));
  const cell = (tag, c, x) => `<${tag}${short[c] ? ' class="short"' : ''}>${inline(x, ctx.from, ctx.known)}</${tag}>`;
  const rows = body.map((r) => `<tr>${r.map((x, c) => cell('td', c, x)).join('')}</tr>`);
  return [`<div class="table"><table><thead><tr>${head.map((x, c) => cell('th', c, x)).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`, i];
}

/** A code block's lines; in a shell block (or one with no language) a `# comment` is marked, so the command reads first. */
function codeBlock(lines, lang) {
  if (lang && !/^(?:sh|bash|shell|console|zsh|powershell|ps1|cmd|text)$/i.test(lang)) return esc(lines.join('\n'));
  return lines.map((l) => {
    const at = /(^|\s)#\s/.exec(l);
    return at ? `${esc(l.slice(0, at.index + at[1].length))}<span class="cm">${esc(l.slice(at.index + at[1].length))}</span>` : esc(l);
  }).join('\n');
}

/** Raw HTML a doc carries (a centred logo): kept to the text column (its align left out), relative src and href into the portal. */
const rawHtml = (line, ctx) => line.replace(/\s+align="(?:center|middle)"/gi, '')
  .replace(/\b(src|href)="([^"]+)"/g, (m, attr, v) => `${attr}="${esc(linkTo(v, ctx.from, ctx.known) ?? v)}"`);

/** Markdown in the kit's doc style as HTML. `from`: the doc's repo path (for its links); `known`: the listed docs. */
export function markdown(md, { from = '', known = new Set() } = {}) {
  const ctx = { from, known };
  const lines = String(md).replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    const fence = /^\s*(```+|~~~+)\s*([\w-]*)/.exec(line);
    if (fence) {
      // a fence a doc never closes ends at the first blank line or heading, not at the end of the file (the doc is read as it is)
      const closes = lines.slice(i + 1).some((l) => l.trim().startsWith(fence[1]));
      const body = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]) && (closes || (lines[i].trim() && !/^#{1,6}\s/.test(lines[i]))); i++) body.push(lines[i]);
      out.push(`<pre><code${fence[2] ? ` class="lang-${esc(fence[2])}"` : ''}>${codeBlock(body, fence[2])}</code></pre>`);
      if (closes) i++;
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
/** A doc's title as the portal lists it: the project's name taken off its front ("Trailsmith: the product" is "The product"). */
export function docTitle(path, text, project = '') {
  const lead = project ? new RegExp(`^${project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:–-]\\s*`, 'i') : null;
  const t = lead ? titleOf(path, text).replace(lead, '') : titleOf(path, text);
  return t ? t[0].toUpperCase() + t.slice(1) : posix.basename(path, '.md');
}

export function menu(docs, kit = new Set(), project = '') {
  // each doc by its title (docTitle); the file is the tooltip
  const item = (d) => ({ path: d.path, label: docTitle(d.path, d.text, project), what: d.path, kit: kit.has(d.path) });
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


/** A doc page: the doc, and beside it on a wide window "On this page", its h2 headings (only when it has three or more). */
export function docBody(html) {
  const heads = [...html.matchAll(/<h2 id="([^"]*)">([\s\S]*?)<\/h2>/g)].map(([, id, text]) => [id, text.replace(/<[^>]+>/g, '')]);
  const toc = heads.length >= 3 ? `<aside class="toc" aria-label="On this page"><div class="cap">On this page</div>${heads.map(([id, text]) => `<a href="#${id}">${text}</a>`).join('')}</aside>` : '';
  return `<div class="doc-grid"><article>${html}</article>${toc}</div>`;
}

const chevron = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>';

/** The sidebar: the main links, the docs opened lately (filled in the browser), then each group folded, the open doc marked. */
export function menuHtml(sections, current = '', maps = {}) {
  const link = (it) => `<a href="/doc/${esc(it.path)}" title="${esc(it.what)}"${it.path === current ? ' aria-current="page"' : ''}>${esc(it.label)}${it.kit ? '<small>kit</small>' : ''}</a>`;
  const block = (s) => {
    const open = s.title === 'Start here' || s.items.some((it) => it.path === current) ? ' open' : '';
    return `<details${open}><summary><span>${esc(s.title)}</span><small>${s.items.length}</small>${chevron}</summary>${s.items.map(link).join('')}</details>`;
  };
  const main = [`<a href="/"${current ? '' : ' aria-current="page"'}>At a glance</a>`, maps.file && `<a href="/doc/docs/MAP.md"${current === 'docs/MAP.md' ? ' aria-current="page"' : ''}>File map</a>`,
    maps.app && '<a href="/file/docs/flow/index.html" target="_blank">App map</a>'].filter(Boolean).join('');
  return `<div class="links">${main}</div><div id="recent" class="group" hidden><div class="cap">Opened lately</div></div><div class="group">${sections.map(block).join('')}</div>`;
}

const STYLE = `*{box-sizing:border-box}[hidden]{display:none!important}html{background:var(--p-bg)}body{margin:0;background:var(--p-bg);color:var(--p-text);font-family:var(--p-font);font-size:var(--p-s-body);line-height:1.5}
a{color:var(--p-link)}a:hover{color:var(--p-text)}:focus-visible{outline:2px solid var(--p-link);outline-offset:2px}
.layout{display:flex;flex-wrap:wrap;min-height:100vh}
nav{flex:1 1 248px;max-width:300px;background:var(--p-bg);border-right:1px solid var(--p-line);padding:16px;display:flex;flex-direction:column;gap:16px;position:sticky;top:0;height:100vh;overflow:auto}
nav .project{font-size:var(--p-s-title);font-weight:700;font-stretch:var(--p-stretch);padding:4px 8px}
nav label{font-size:var(--p-s-caption);font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--p-caption);padding:0 8px}
nav input{width:100%;height:44px;padding:0 12px;border:1px solid var(--p-control);border-radius:var(--p-r1);background:var(--p-raised);color:var(--p-text);font:inherit;font-size:var(--p-s-ui);margin-top:4px}
nav input::placeholder{color:var(--p-caption)}
nav a{display:flex;align-items:center;gap:8px;min-height:32px;padding:0 12px;border-radius:var(--p-r1);color:var(--p-text);font-size:var(--p-s-ui);font-weight:500;text-decoration:none}
nav a:hover{background:var(--p-raised);color:var(--p-text)}nav a[aria-current=page]{background:var(--p-raised);font-weight:600}nav a small{margin-left:auto;font-size:var(--p-s-caption);color:var(--p-caption)}
nav .links a{color:var(--p-muted)}nav .links a[aria-current=page]{color:var(--p-text)}
nav .group{border-top:1px solid var(--p-line);padding-top:8px;display:flex;flex-direction:column}
nav summary{display:flex;align-items:center;gap:8px;min-height:32px;padding:0 12px;border-radius:var(--p-r1);cursor:pointer;font-size:var(--p-s-ui);font-weight:500;list-style:none}
nav summary::-webkit-details-marker{display:none}nav summary:hover{background:var(--p-raised)}nav summary span{flex:1 1 auto}nav summary small{font-size:var(--p-s-caption);color:var(--p-caption)}
nav summary svg{color:var(--p-caption);transition:transform .15s}nav details[open] summary svg{transform:rotate(90deg)}nav details a{padding-left:24px}
#recent .cap{padding:0 12px 4px}nav .foot{margin-top:auto;border-top:1px solid var(--p-line);padding-top:12px}
.theme{height:36px;padding:0 12px;border:1px solid var(--p-control);border-radius:999px;background:none;color:var(--p-muted);font:inherit;font-size:var(--p-s-caption);cursor:pointer}
main{flex:999 1 560px;min-width:0;padding:32px}main>.inner{max-width:1040px;display:flex;flex-direction:column;gap:24px}
.cap{font-size:var(--p-s-caption);font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--p-caption)}
h1{margin:0;font-size:var(--p-s-display);line-height:1.1;font-weight:800;font-stretch:var(--p-stretch)}
h2{margin:8px 0 0;font-size:var(--p-s-title);line-height:1.2;font-weight:700;font-stretch:var(--p-stretch)}
.top{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px}.top>div{display:flex;flex-direction:column;gap:4px}
.primary{height:44px;padding:0 16px;border:0;border-radius:var(--p-r1);background:var(--p-primary);color:var(--p-onPrimary);font:inherit;font-size:var(--p-s-ui);font-weight:600;cursor:pointer}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.tile,.panel{background:var(--p-surface);border:1px solid var(--p-line);border-radius:var(--p-r2);padding:16px;display:flex;flex-direction:column;gap:4px}
.stat{font-size:var(--p-s-stat);line-height:1.15;font-weight:800;font-stretch:var(--p-stretch)}.note{font-size:var(--p-s-caption);font-weight:500;color:var(--p-muted)}
.split{display:flex;flex-wrap:wrap;align-items:flex-start;gap:24px}.main-col{flex:3 1 520px;min-width:0;display:flex;flex-direction:column;gap:16px}.side-col{flex:1 1 280px;max-width:380px;min-width:0;display:flex;flex-direction:column;gap:16px}
.question{border:1px solid var(--p-muted);border-radius:var(--p-r2);padding:16px;display:flex;flex-direction:column;gap:8px}.question .cap{color:var(--p-muted)}.ask{font-weight:700}
.panel{gap:12px}.quiet{margin:0;color:var(--p-muted);font-size:var(--p-s-ui)}
.ranked{display:flex;flex-direction:column;gap:8px}
.row{display:grid;grid-template-columns:52px minmax(0,1fr) 64px 56px 64px 44px;align-items:center;gap:8px;min-height:56px;padding:8px 12px;border:1px solid var(--p-control);border-radius:var(--p-r1);background:var(--p-raised)}
.row.head{min-height:0;padding:0 12px;border:0;background:none;font-size:var(--p-s-caption);font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--p-caption)}.row.head .col,.row.head .score{font-size:var(--p-s-caption);font-weight:500;font-stretch:normal}
.num{font-size:var(--p-s-title);font-weight:700;font-stretch:var(--p-stretch);color:var(--p-muted);text-decoration:none}a.num:hover{color:var(--p-link)}
.what{display:flex;flex-direction:column;gap:2px;min-width:0}.title{font-size:var(--p-s-ui);font-weight:600}.facts{font-size:var(--p-s-caption);font-weight:500;color:var(--p-caption)}
.col{font-size:var(--p-s-ui);font-weight:500}.unset{color:var(--p-warn);font-size:var(--p-s-caption)}.score{font-size:var(--p-s-title);font-weight:700;font-stretch:var(--p-stretch);text-align:right}
.sub{border-top:1px solid var(--p-line);padding-top:12px;display:flex;flex-direction:column;gap:8px}.line{font-size:var(--p-s-ui);font-weight:500}.line .num{font-size:inherit}
.warn,.notice{display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border:1px solid var(--p-line);border-radius:var(--p-r1);background:var(--p-surface);font-size:var(--p-s-ui);font-weight:500}
.notice{display:block;line-height:2}.warn svg{color:var(--p-warn);flex:none;margin-top:2px}.warn strong,.warn-text{color:var(--p-warn);font-weight:600}.warn .num{font-size:inherit}
.progress{display:flex;align-items:center;gap:12px;font-size:var(--p-s-caption);font-weight:500;color:var(--p-muted)}.bar{flex:1 1 auto;height:6px;border-radius:999px;background:var(--p-raised);overflow:hidden}.bar i{display:block;height:100%;background:var(--p-ok)}
.needs li .item{display:block}.needs li .how{display:block;margin-top:2px;font-size:var(--p-s-caption);color:var(--p-muted);font-weight:500}.needs li .how small{color:var(--p-caption)}
.warn .hint{color:var(--p-muted);font-weight:500}.warn strong{font-weight:600}
.needs{margin:0;padding-left:22px;display:flex;flex-direction:column;gap:10px;font-size:var(--p-s-ui);font-weight:500}.needs li.done{color:var(--p-caption)}.tick{color:var(--p-ok);font-weight:700}
.docs{padding:4px 16px;gap:0}.docs a{display:flex;align-items:center;gap:12px;min-height:44px;padding:8px 0;font-size:var(--p-s-ui);font-weight:500;text-decoration:none;border-bottom:1px solid var(--p-line)}.docs a:last-child{border-bottom:0}
.docs a span{flex:1 1 auto;min-width:0}.docs small{font-size:var(--p-s-caption);color:var(--p-caption);white-space:nowrap}.docs b{font-size:var(--p-s-caption);color:var(--p-onPrimary);background:var(--p-primary);border-radius:999px;padding:0 8px;font-weight:600}
.chip{display:inline-flex;align-items:center;height:28px;padding:0 10px;margin:2px 0;border:1px solid var(--p-control);border-radius:999px;background:var(--p-raised);color:var(--p-text);font:inherit;font-size:var(--p-s-caption);font-weight:600;cursor:pointer;vertical-align:baseline}
.chip:hover{border-color:var(--p-link)}.chip.copied{border-color:var(--p-ok);color:var(--p-ok)}
body[data-doc] main{background:var(--p-surface)}
.inner.doc{display:block;max-width:none;line-height:1.6;--measure:40rem}.doc-grid{display:grid;grid-template-columns:minmax(0,1040px);gap:48px}
.toc{display:none}@media (min-width:1360px){.doc-grid{grid-template-columns:minmax(0,1040px) 220px}.toc{display:block;position:sticky;top:32px;align-self:start;max-height:calc(100vh - 64px);overflow:auto}}
.toc .cap{margin-bottom:8px}.toc a{display:block;padding:4px 0 4px 12px;border-left:2px solid var(--p-line);color:var(--p-muted);font-size:var(--p-s-ui);line-height:1.35;text-decoration:none}.toc a:hover{color:var(--p-text);border-left-color:var(--p-primary)}
.doc h1{margin:4px 0 12px;line-height:1.1;max-width:var(--measure)}.doc h2{font-size:var(--p-s-stat);line-height:1.15;margin:32px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--p-line);max-width:var(--measure)}
.doc h3{font-size:var(--p-s-title);line-height:1.2;margin:28px 0 8px}.doc h4,.doc h5,.doc h6{font-size:var(--p-s-body);margin:20px 0 6px}
.doc p{margin:0 0 14px}.doc p,.doc li,.doc blockquote,.doc h3{max-width:var(--measure)}
.doc td a,.doc li.link a{text-decoration:none}.doc td a:hover,.doc td a:focus-visible,.doc li.link a:hover,.doc li.link a:focus-visible{text-decoration:underline}.doc ul,.doc ol{margin:0 0 16px;padding-left:24px}.doc li+li{margin-top:8px}.doc li>ul,.doc li>ol{margin:8px 0 0}
.doc code{font-family:ui-monospace,"Cascadia Code","SF Mono",Consolas,monospace;font-size:var(--p-s-ui);color:var(--p-muted);overflow-wrap:anywhere}
.doc pre{background:var(--p-raised);border:1px solid var(--p-line);padding:12px 16px;border-radius:var(--p-r1);overflow-x:auto;line-height:1.5;margin:0 0 16px}
.doc pre code{color:var(--p-text);overflow-wrap:normal;white-space:pre}.doc pre .cm{color:var(--p-caption)}
.doc .table{overflow-x:auto;margin:0 0 16px}.doc table{border-collapse:collapse;width:100%;font-size:var(--p-s-ui);line-height:1.45}
.doc th,.doc td{border:1px solid var(--p-line);padding:8px 10px;text-align:left;vertical-align:top}.doc .short{white-space:nowrap;width:1%}
.doc th{background:var(--p-raised);font-size:var(--p-s-caption);letter-spacing:.04em;text-transform:uppercase;color:var(--p-muted);font-weight:600}
.doc blockquote{margin:0 0 16px;padding:4px 16px;border-left:3px solid var(--p-primary);color:var(--p-muted)}
.doc img{max-width:100%}.doc hr{border:0;border-top:1px solid var(--p-line);margin:24px 0}.crumb{font-size:var(--p-s-caption);color:var(--p-caption)}
.results a{display:flex;flex-direction:column;padding:10px 0;border-bottom:1px solid var(--p-line);text-decoration:none;font-weight:600}.results small{color:var(--p-caption);font-weight:400}
@media (pointer:coarse){nav a,nav summary{min-height:44px}}@media (max-width:1100px){.side-col{max-width:none}}@media (max-width:760px){nav{position:static;height:auto;max-width:none}main{padding:20px 16px}.row{grid-template-columns:48px minmax(0,1fr) 48px}.row .col,.row.head .col{display:none}}`;

// search over every doc (/search.json, fetched once), a reload when a doc changes (/events), the light/dark switch, copying a
// command chip, and what only this browser keeps: the docs opened lately and what is new since the last visit
const SCRIPT = `const root=document.documentElement,q=document.getElementById('q'),main=document.querySelector('main .inner'),page=main.innerHTML;let all=null;
const store=(k,v)=>{try{if(v===undefined)return JSON.parse(localStorage.getItem('portal:'+k)??'null');localStorage.setItem('portal:'+k,JSON.stringify(v))}catch{return null}};
if(store('theme')==='dark')root.dataset.theme='dark';
const tb=document.getElementById('theme'),label=()=>{tb.textContent=root.dataset.theme==='dark'?'Light':'Dark'};label();
tb.onclick=()=>{if(root.dataset.theme==='dark'){delete root.dataset.theme;store('theme','light')}else{root.dataset.theme='dark';store('theme','dark')}label()};
document.addEventListener('click',e=>{const b=e.target.closest('[data-copy]');if(!b)return;navigator.clipboard?.writeText(b.dataset.copy).then(()=>{b.classList.add('copied');setTimeout(()=>b.classList.remove('copied'),1200)})});
q.addEventListener('input',async()=>{const w=q.value.trim().toLowerCase().split(/\\s+/).filter(Boolean);if(!w.length){main.innerHTML=page;return}
all??=await (await fetch('/search.json')).json();const hit=all.filter(d=>w.every(x=>d.text.includes(x))).slice(0,40);const t=s=>s.replace(/[<>&]/g,'');
main.innerHTML='<h1>Search</h1>'+(hit.length?'<div class="results">'+hit.map(d=>{const i=d.text.indexOf(w[0]);return '<a href="/doc/'+d.path+'">'+t(d.title)+'<small>'+d.path+' · …'+t(d.text.slice(Math.max(0,i-60),i+120))+'…</small></a>'}).join('')+'</div>':'<p class="quiet">Nothing found.</p>')});
const here=document.body.dataset.doc;let recent=store('recent')??[];
if(here){recent=[{path:here,title:document.title.split(' · ')[0]},...recent.filter(r=>r.path!==here)].slice(0,5);store('recent',recent)}
const box=document.getElementById('recent');if(recent.length){box.hidden=false;for(const r of recent){const a=document.createElement('a');a.href='/doc/'+r.path;a.textContent=r.title;if(r.path===here)a.setAttribute('aria-current','page');box.append(a)}}
if(!here){const seen=Number(store('seen')??0);if(seen)for(const a of document.querySelectorAll('[data-ts]'))if(Number(a.dataset.ts)>seen){const b=document.createElement('b');b.textContent='New';a.querySelector('span').after(b)}
setTimeout(()=>store('seen',Math.floor(Date.now()/1000)),3000)}
new EventSource('/events').onmessage=()=>location.reload();`;

/** The whole page: the theme from the project's style sheet (lib/portaltheme.mjs), the sidebar, the page itself. */
export const pageHtml = ({ project, title, nav, body, crumb = '', theme = '', doc = '' }) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ${esc(project)}</title><style>${theme}${STYLE}</style></head>
<body${doc ? ` data-doc="${esc(doc)}"` : ''}><div class="layout"><nav aria-label="Docs"><div class="project">${esc(project)}</div>
<div><label for="q">Search</label><input id="q" type="search" placeholder="Search every doc" autocomplete="off"></div>${nav}
<div class="foot"><button id="theme" class="theme" type="button">Theme</button></div></nav>
<main><div class="inner${doc ? ' doc' : ''}">${crumb ? `<div class="crumb">${esc(crumb)}</div>` : ''}${body}</div></main></div><script>${SCRIPT}</script></body></html>`;
