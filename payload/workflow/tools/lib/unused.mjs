// What knip finds unused (files, dependencies, exports, types...), as one line each, so the gate's `unused` check can keep a
// baseline like its other checks: an existing project starts with what it has, and only what a change adds fails. No I/O here;
// workflow/tools/unused.mjs runs knip and keeps the baseline.

/**
 * knip's JSON report (`--reporter json`) as findings: "file: src/old.ts", "dependencies: package.json: left-pad",
 * "exports: src/a.ts: helper". Sorted, without repeats.
 */
export function unusedFindings(report) {
  const out = new Set();
  for (const f of report?.files ?? []) out.add(`file: ${f}`);
  for (const issue of report?.issues ?? []) {
    for (const [kind, items] of Object.entries(issue)) {
      if (kind === 'file' || !Array.isArray(items)) continue;
      for (const item of items) {
        // knip lists some kinds per name and some (duplicates) as lists of names
        const name = Array.isArray(item) ? item.map((x) => x?.name ?? x).join(' = ') : item?.name ?? String(item);
        out.add(`${kind}: ${issue.file}: ${name}`);
      }
    }
  }
  return [...out].sort();
}

/** The findings that are not in the baseline, and the ones the baseline has that are gone (fixed). */
export function compareUnused(now, known) {
  const seen = new Set(known);
  const nowSet = new Set(now);
  return { added: now.filter((f) => !seen.has(f)), fixed: known.filter((f) => !nowSet.has(f)) };
}
