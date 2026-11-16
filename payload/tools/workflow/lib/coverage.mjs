// How much of the code the tests really run (no I/O here; tools/workflow/coverage.mjs runs the suite with Node's coverage): read
// from an lcov report, the share of lines run per file and in total. The gate's *untested* check says a test imports a file; this
// says how much of it a test runs, which is the figure that shows a test that imports and asserts nothing.

/** Per file from an lcov text: [{ file, hit, found }] (lines). */
export function readLcov(text) {
  const out = [];
  let cur = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith('SF:')) cur = { file: line.slice(3).replace(/\\/g, '/'), hit: 0, found: 0 };
    else if (cur && line.startsWith('LH:')) cur.hit = Number(line.slice(3));
    else if (cur && line.startsWith('LF:')) cur.found = Number(line.slice(3));
    else if (line === 'end_of_record' && cur) { out.push(cur); cur = null; }
  }
  return out;
}

/** The figure and the files that need tests most: { percent, files, least: [{ file, percent, lines }] }. `root` makes paths relative. */
export function coverageSummary(files, { root = '', least = 8 } = {}) {
  const rel = (f) => (root && f.toLowerCase().startsWith(root.toLowerCase()) ? f.slice(root.length).replace(/^\//, '') : f);
  const hit = files.reduce((s, f) => s + f.hit, 0), found = files.reduce((s, f) => s + f.found, 0);
  const pct = (h, n) => (n ? Math.round((h / n) * 1000) / 10 : 100);
  return {
    percent: pct(hit, found), files: files.length, lines: found,
    // the least run first, weighted by size: a big file at 20% matters more than a small one at 0%
    least: files.filter((f) => f.found >= 10 && f.hit < f.found).map((f) => ({ file: rel(f.file), percent: pct(f.hit, f.found), lines: f.found, missed: f.found - f.hit }))
      .sort((a, b) => b.missed - a.missed).slice(0, least),
  };
}

/** The report's lines. */
export function coverageLines(s) {
  return [
    `coverage: the tests run ${s.percent}% of the ${s.lines} lines in ${s.files} source files`,
    ...(s.least.length ? ['the most lines no test runs (where a test pays most):', ...s.least.map((f) => `  ${f.file}: ${f.percent}% of ${f.lines} lines (${f.missed} not run)`)] : []),
  ];
}
