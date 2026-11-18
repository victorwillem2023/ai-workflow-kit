// A test that waits a fixed number of milliseconds (`await new Promise((r) => setTimeout(r, 20))`) holds on an idle computer and
// fails when it is busy: several sessions running their gates at once. Wait for the thing itself (the element, the promise, the
// event), or use a fake clock (workflow/guides/TESTING.md, *Tests that fail sometimes*). A line that must wait for real says
// why with `wait-ok: <reason>` on it. The gate keeps only the lines a change adds, by their numbers (a new test file: all of
// it), so touching an old test never fails on the waits it already had. No I/O here.

const JS = /\.[cm]?[jt]sx?$/;
const RULES = [
  { lang: JS, re: /\bsetTimeout\s*\((?:[^,()]|\([^()]*\))*,\s*([1-9]\d*)\s*\)/ },
  { lang: JS, re: /\b(?:sleep|delay|wait|pause)\s*\(\s*([1-9]\d*)\s*\)/ },
  { lang: /\.py$/, re: /\b(?:time|asyncio)\.sleep\s*\(\s*(\d*\.?\d*[1-9]\d*)\s*\)/ },
  { lang: /\.go$/, re: /\btime\.Sleep\s*\(/ },
];

/**
 * The line numbers each file has added, from a `git diff -U0` against the working tree: Map<file, Set<line>>. By number, not by
 * text: one new `setTimeout(r, 20)` in a file that has six of the same is one finding, not seven.
 */
export function addedLineNumbers(diff) {
  const out = new Map();
  let file = null;
  for (const line of String(diff).split('\n')) {
    if (line.startsWith('+++ ')) { file = line.startsWith('+++ b/') ? line.slice(6).replace(/\r$/, '') : null; continue; }
    const hunk = file && /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk) continue;
    const from = Number(hunk[1]);
    const count = hunk[2] == null ? 1 : Number(hunk[2]);
    if (!out.has(file)) out.set(file, new Set());
    for (let n = from; n < from + count; n++) out.get(file).add(n);
  }
  return out;
}

/** The fixed waits in one test file: [{ line, text, say }]. */
export function fixedWaits(file, text) {
  const rules = RULES.filter((r) => r.lang.test(file));
  if (!rules.length) return [];
  const found = [];
  text.split('\n').forEach((line, i) => {
    if (line.includes('wait-ok')) return;
    const hit = rules.map((r) => r.re.exec(line)).find(Boolean);
    if (hit) found.push({ line: i + 1, text: line.replace(/\r$/, ''), say: `waits a fixed time (${hit[0].trim()}): wait for the thing itself or use a fake clock; a wait that must stay says why with "wait-ok: <reason>"` });
  });
  return found;
}
