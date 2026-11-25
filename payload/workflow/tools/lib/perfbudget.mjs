// The page-weight budget (no I/O here): what a visitor downloads before the app works, compressed as the server sends it.
// `performance` in workflow/config.json: { "files": ["dist/assets/*.js", "dist/assets/*.css"], "maxKb": 250 }. A slow phone on
// a slow network pays for every kilobyte; a budget that only shrinks keeps a "small" library from adding a second of waiting.
// A page already over the budget when the check first weighs it (an older project) gets a baseline instead of a failure:
// today's weight, with ROOM for ordinary changes; heavier than that fails, and the way back is under the budget.

/** How much heavier than its baseline a page that is already over the budget may get (a share of the baseline). */
export const ROOM = 0.05;

/** The verdict: { ok, kb, maxKb, baselineKb, limitKb, biggest: [{ path, kb }] }. `files`: [{ path, gzipBytes }]. */
export function weighPages(files, maxKb, baselineKb = null) {
  const kb = (b) => Math.round((b / 1024) * 10) / 10;
  const total = files.reduce((s, f) => s + f.gzipBytes, 0);
  const biggest = [...files].sort((a, b) => b.gzipBytes - a.gzipBytes).slice(0, 5).map((f) => ({ path: f.path, kb: kb(f.gzipBytes) }));
  const over = baselineKb && maxKb && baselineKb > maxKb ? Math.round(baselineKb * (1 + ROOM) * 10) / 10 : null;
  const limitKb = over ?? maxKb;
  return { ok: !maxKb || kb(total) <= limitKb, kb: kb(total), maxKb, baselineKb: over ? baselineKb : null, limitKb, biggest };
}

/**
 * What a page loads before it works, as paths from the site's top: its scripts, styles and preloads, and every file those import
 * statically, followed to the end. A file an `import()` asks for later (another screen, a heavy part loaded last) is not counted:
 * that is the point of loading it later. `html` is the page's text at `htmlPath` (from the site's top, "phone.html");
 * `read(path)` gives a built file's text, or null when there is none. An address on another site is not ours to weigh.
 * Returns { files, missing }: a file the page names that is not in the build is missing, never weighed as nothing.
 */
export function startupFiles(html, htmlPath, read) {
  const seen = new Set();
  const queue = [];
  const add = (ref, from) => {
    const p = resolveRef(ref, from);
    if (p && !seen.has(p)) { seen.add(p); queue.push(p); }
  };
    // (?:^|\s) and not \b: a data-src or data-href is an address meant for later, never a start-up file
  for (const m of String(html).matchAll(/<script\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi)) add(m[1], htmlPath);
  for (const m of String(html).matchAll(/<link\b[^>]*>/gi)) {
    const rel = /\srel\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1].toLowerCase() ?? '';
    const href = /\shref\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1];
    if (href && /\b(stylesheet|modulepreload)\b/.test(rel)) add(href, htmlPath);
  }
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i];
    const text = read(path);
    if (text == null) continue;
    // a static import or re-export, minified or not ("import{a as b}from"./x.js"", "import"./y.js""); never import("./z.js")
    if (/\.m?js$/.test(path)) for (const m of text.matchAll(/(?:^|[^.\w$])(?:import|export)\s*(?:[\w$*{}\s,]*?from\s*)?["']([./][^"']*)["']/g)) add(m[1], path);
    if (/\.css$/.test(path)) for (const m of text.matchAll(/@import\s*(?:url\()?\s*["']?([^"')\s;]+)/g)) add(m[1], path);
  }
  const all = [...seen];
  return { files: all.filter((p) => read(p) != null), missing: all.filter((p) => read(p) == null) };
}

/**
 * The built pages to weigh and time: `performance.pages` ([{ name, html, maxKb }]) when the config names them, else every .html at
 * the top of each build folder (`roots`, read by `listHtml(dir)`), each against `performance.maxKb`.
 */
export function builtPages(perf, roots, listHtml) {
  // the site's top: what "/assets/x.js" in the page starts from (a page's own `root`, else the build folder it is in)
  const rootOf = (p) => p.root ?? roots.find((r) => String(p.html).startsWith(`${r}/`)) ?? String(p.html).split('/').slice(0, -1).join('/');
  if (perf?.pages?.length) return perf.pages.map((p) => ({ name: p.name ?? String(p.html).split('/').pop().replace(/\.html$/, ''), html: p.html, root: rootOf(p), base: String(p.base ?? '').replace(/^\/+|\/+$/g, ''), maxKb: p.maxKb ?? perf.maxKb }));
  return roots.flatMap((r) => listHtml(r).filter((f) => f.endsWith('.html')).sort().map((f) => ({ name: f.replace(/\.html$/, ''), html: `${r}/${f}`, root: r, base: '', maxKb: perf?.maxKb })));
}

/** A reference in a built file as a path from the site's top; null for another site or a data address. */
function resolveRef(ref, from) {
  const r = ref.split(/[?#]/)[0];
  if (!r || /^([a-z]+:)?\/\//i.test(r) || /^[a-z]+:/i.test(r)) return null;
  const parts = (r.startsWith('/') ? r.slice(1) : `${from.split('/').slice(0, -1).join('/')}/${r}`).split('/');
  const out = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
  return out.join('/');
}

/** The line the check prints; `page` names the page when each page is weighed on its own. */
export function weightLine(v, page) {
  return page ? weightText(v).replace(/^page weight: /, `page weight (${page}): `) : weightText(v);
}

function weightText(v) {
  const top = v.biggest.map((f) => `${f.path} ${f.kb} KB`).join(', ');
  const how = 'Load the heavy part only where it is used (import() on that screen), pick a smaller library, or raise "performance.maxKb" with the owner\'s yes and why.';
  if (v.baselineKb) {
    return v.ok
      ? `page weight: ${v.kb} KB (compressed), over the budget of ${v.maxKb} KB as it was before (the baseline: ${v.baselineKb} KB, with room up to ${v.limitKb} KB). Heavier than that fails. The biggest: ${top}.`
      : `page weight: ${v.kb} KB, heavier than the baseline allows (${v.baselineKb} KB, room up to ${v.limitKb} KB; the budget is ${v.maxKb} KB, compressed). The biggest: ${top}.\n${how}`;
  }
  return v.ok
    ? `page weight: ${v.kb} KB of ${v.maxKb} KB (compressed)`
    : `page weight: ${v.kb} KB, the budget is ${v.maxKb} KB (compressed). The biggest: ${top}.\n${how}`;
}
