// What passed before (no file I/O here; gate.mjs keeps the record in git's folder for this checkout, never committed). A test file
// that passed with exactly the same code under it, and the same packages and settings, need not run again while you build: its
// key is a hash of the test, everything it imports (the import graph, all the way down) and a salt (the lockfile, the tsconfigs,
// the config, and every changed file the graph cannot follow, a fixture say: one of those changed and every key changes). Only for
// the gate's picked files on this computer: --all, --ship in pilot and production, --fresh and GitHub run them all, every time.
import { createHash } from 'node:crypto';

/** The key of one test file: its own text and that of every project file under it, plus the salt. */
export function testKey(test, graph, salt = '') {
  const seen = new Set([test]);
  const queue = [test];
  while (queue.length) {
    for (const to of graph.imports.get(queue.pop()) ?? []) if (!seen.has(to)) { seen.add(to); queue.push(to); }
  }
  const h = createHash('sha1').update(salt);
  for (const f of [...seen].sort()) h.update(`${f}\0${graph.files.get(f) ?? ''}\0`);
  return h.digest('hex').slice(0, 16);
}

/** The salt: what every test leans on that the import graph does not show. `texts` = [[path, text or null]]. */
export function cacheSalt(texts) {
  const h = createHash('sha1');
  for (const [f, t] of [...texts].sort(([a], [b]) => a.localeCompare(b))) h.update(`${f}\0${t ?? ''}\0`);
  return h.digest('hex').slice(0, 16);
}

/** Which of `tests` still run: { run, skipped } (skipped: passed before under the same key). */
export function splitByCache(tests, keys, passed = {}) {
  const skipped = tests.filter((t) => passed[t] && passed[t] === keys[t]);
  return { run: tests.filter((t) => !skipped.includes(t)), skipped };
}

/** The record after a passing run: these tests under these keys (a failed run records nothing). */
export function recordPasses(passed = {}, ran, keys) {
  return { ...passed, ...Object.fromEntries(ran.map((t) => [t, keys[t]])) };
}
