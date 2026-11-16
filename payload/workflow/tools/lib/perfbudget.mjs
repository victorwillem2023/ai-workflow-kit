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

/** The line the check prints. */
export function weightLine(v) {
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
