// The page-weight budget (no I/O here): what a visitor downloads before the app works, compressed as the server sends it.
// `performance` in workflow.config.json: { "files": ["dist/assets/*.js", "dist/assets/*.css"], "maxKb": 250 }. A slow phone on
// a slow network pays for every kilobyte; a budget that only shrinks keeps a "small" library from adding a second of waiting.

/** The verdict: { ok, kb, maxKb, biggest: [{ path, kb }] }. `files`: [{ path, gzipBytes }]. */
export function weighPages(files, maxKb) {
  const kb = (b) => Math.round((b / 1024) * 10) / 10;
  const total = files.reduce((s, f) => s + f.gzipBytes, 0);
  const biggest = [...files].sort((a, b) => b.gzipBytes - a.gzipBytes).slice(0, 5).map((f) => ({ path: f.path, kb: kb(f.gzipBytes) }));
  return { ok: !maxKb || kb(total) <= maxKb, kb: kb(total), maxKb, biggest };
}

/** The line the check prints. */
export function weightLine(v) {
  const top = v.biggest.map((f) => `${f.path} ${f.kb} KB`).join(', ');
  return v.ok
    ? `page weight: ${v.kb} KB of ${v.maxKb} KB (compressed)`
    : `page weight: ${v.kb} KB, the budget is ${v.maxKb} KB (compressed). The biggest: ${top}.\nLoad the heavy part only where it is used (import() on that screen), pick a smaller library, or raise "performance.maxKb" with the owner's yes and why.`;
}
