// Two checks on the shape of the code, read from the import graph (graph.mjs): files that import each other in a circle, and
// source files no test reaches. Pure: the graph comes in. Both are kept by a baseline in the gate: what is there may stay, a new one fails.

/** The import circles: each a sorted list of the files in it (a.ts imports b.ts and b.ts, directly or through others, imports a.ts). */
export function importCycles(imports) {
  // Tarjan's algorithm without recursion limits in mind: the files of one circle form one strongly connected group
  const index = new Map(), low = new Map(), stack = [], on = new Set(), out = [];
  let n = 0;
  const visit = (start) => {
    const work = [[start, 0]];
    while (work.length) {
      const frame = work[work.length - 1];
      const [v] = frame;
      if (frame[1] === 0) { index.set(v, n); low.set(v, n); n++; stack.push(v); on.add(v); }
      const next = (imports.get(v) ?? [])[frame[1]++];
      if (next !== undefined) {
        if (!index.has(next)) work.push([next, 0]);
        else if (on.has(next)) low.set(v, Math.min(low.get(v), index.get(next)));
        continue;
      }
      if (low.get(v) === index.get(v)) {
        const group = [];
        let w;
        do { w = stack.pop(); on.delete(w); group.push(w); } while (w !== v);
        if (group.length > 1) out.push(group.sort());
      }
      work.pop();
      if (work.length) { const [p] = work[work.length - 1]; low.set(p, Math.min(low.get(p), low.get(v))); }
    }
  };
  for (const v of imports.keys()) if (!index.has(v)) visit(v);
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

/** The source files (`isSource`) that no test file reaches through imports, sorted. */
export function untestedFiles(graph, isSource, isTest) {
  const reached = new Set();
  const todo = [...graph.imports.keys()].filter(isTest);
  while (todo.length) {
    const f = todo.pop();
    for (const to of graph.imports.get(f) ?? []) if (!reached.has(to)) { reached.add(to); todo.push(to); }
  }
  return [...graph.imports.keys()].filter((f) => isSource(f) && !isTest(f) && !reached.has(f)).sort();
}
