// What passed before (no file I/O here; gate.mjs keeps the record in git's folder for this checkout, never committed). A test file
// that passed with exactly the same code under it, and the same packages and settings, need not run again while you build: its
// key is a hash of the test, everything it imports (the import graph, all the way down) and a salt (the lockfile, the tsconfigs,
// the config, and every changed file the graph cannot follow, a fixture say: one of those changed and every key changes). Only for
// the gate's picked files on this computer: --all, --ship in pilot and production, --fresh and GitHub run them all, every time.
// The record is kept file by file, also after a failed run: a second attempt runs only what failed, and a file that failed and
// then passed with the same key is written on the flaky list (every gate run prints it, with what failed) instead of being
// forgotten, until it has passed CLEAR_AFTER times in a row in any session with no failure between.
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

/** The record after a passing run: these tests under these keys. */
export function recordPasses(passed = {}, ran, keys) {
  return { ...passed, ...Object.fromEntries(ran.map((t) => [t, keys[t]])) };
}

/**
 * The record kept for this checkout: { passed: {file: key}, failed: {file: { key, failure }} }, `failure` the lines that said
 * what failed. Before kit 4.3 it was the passed map alone.
 */
export function readRecord(text) {
  let r = {};
  try { r = JSON.parse(text ?? '{}') ?? {}; } catch { r = {}; }
  if (!r.passed && !r.failed) return { passed: r, failed: {} };
  const failed = Object.fromEntries(Object.entries(r.failed ?? {}).map(([f, e]) => [f, typeof e === 'string' ? { key: e, failure: '' } : e]));
  return { passed: r.passed ?? {}, failed };
}

const MAX_FAILURE_LINES = 15;
/**
 * What the runner said about one file's failure: the reporter's `FAIL <test> (<file>:<line>)` blocks that name it, else the
 * output's last lines (a file that could not start at all). Kept as the flaky entry's evidence: a failure that names a missing
 * command or package says at a glance that the computer changed, not the code.
 */
export function failureOf(out, file) {
  const text = String(out ?? '');
  const blocks = text.split(/\n(?=FAIL )/).filter((b) => b.startsWith('FAIL ') && b.split('\n')[0].includes(file));
  // (the reporter's totals line closes the last block: it says nothing about this file)
  const lines = (blocks.length ? blocks.join('\n') : text).split('\n').filter((l) => l.trim() && !/^tests: \d+ passed/.test(l));
  return (blocks.length ? lines.slice(0, MAX_FAILURE_LINES) : lines.slice(-MAX_FAILURE_LINES)).join('\n');
}

/**
 * After a run, file by file, also when it failed: what passed is kept (a second attempt runs only what failed), what failed is
 * noted under its key with what the runner said (`out`). `ran` = only the files that really ran (a batch after a failing one
 * never does); `failed` = the files that failed, or null when the runner did not say which (then a failed run keeps nothing
 * new). A file that failed and now passes under the SAME key is flaky by definition: nothing under it changed.
 * Returns { record, flaky: [{ file, key, failure }], passedNow: [file], failedNow: { file: failure } }.
 */
export function afterRun(record, ran, keys, failed, ok, out = '') {
  const passed = { ...record.passed };
  const fails = { ...record.failed };
  const flaky = [];
  const passedNow = [];
  const failedNow = {};
  if (!ok && !failed?.length) return { record: { passed, failed: fails }, flaky, passedNow, failedNow };
  const bad = new Set(failed ?? []);
  for (const f of ran) {
    if (bad.has(f)) { failedNow[f] = failureOf(out, f); fails[f] = { key: keys[f], failure: failedNow[f] }; delete passed[f]; continue; }
    if (fails[f]?.key === keys[f]) flaky.push({ file: f, key: keys[f], failure: fails[f].failure });
    delete fails[f];
    passed[f] = keys[f];
    passedNow.push(f);
  }
  return { record: { passed, failed: fails }, flaky, passedNow, failedNow };
}

/** How many passes in a row, with no failure between, clear a flaky entry: a flaky test passes most of the time anyway. */
export const CLEAR_AFTER = 10;

/**
 * The flaky list, shared by every session of the project (git's common folder): { file: { since, failure, passes } }. One pass
 * proves nothing (a flaky test passes most of the time, and a picked test always has changed code under it), so an entry goes
 * only after CLEAR_AFTER passes in a row, counted in every session, with no failure between: a failure sets the count back to
 * nought and keeps its output as the newest evidence. `found` from afterRun (seen flaky now: listed, the count at nought),
 * `passedNow` [file] and `failedNow` { file: failure } from the same run, `exists(file)` false for a test that was deleted.
 * A file seen flaky again keeps its first date.
 */
export function updateFlaky(list = {}, found, passedNow, failedNow, exists, today) {
  const passes = new Set(passedNow);
  const next = {};
  for (const [f, e] of Object.entries(list)) {
    if (!exists(f)) continue;
    if (failedNow[f] != null) next[f] = { ...e, passes: 0, failure: failedNow[f] || e.failure };
    else if (passes.has(f)) { if ((e.passes ?? 0) + 1 < CLEAR_AFTER) next[f] = { ...e, passes: (e.passes ?? 0) + 1 }; }
    else next[f] = e;
  }
  for (const { file, failure } of found) next[file] = { since: next[file]?.since ?? today, failure, passes: 0 };
  return next;
}

/** The lines every gate run prints for the flaky list: the test, since when, what failed, and the card to make. */
export function flakyLines(list = {}, evidence = (f) => null) {
  return Object.entries(list).sort(([a], [b]) => a.localeCompare(b)).map(([f, e]) => {
    const first = String(e.failure ?? '').split('\n').find((l) => l.trim() && !l.startsWith('FAIL ')) ?? '';
    const body = evidence(f);
    return `flaky: ${f} failed, then passed with the same code (since ${e.since}; ${e.passes ?? 0} of ${CLEAR_AFTER} passes in a row clear it)${first ? `: ${first.trim().slice(0, 160)}` : ''}. Fix the cause, never run it again until green (workflow/guides/TESTING.md, *Tests that fail sometimes*); a card: npm run board -- --add "Flaky test: ${f}" --label bug${body ? ` --body-file ${body}` : ''}`;
  });
}

/** The card's text for one flaky test: what failed, word for word, and the rule. */
export function flakyCard(file, e) {
  return [`\`${file}\` failed, then passed with the same code under it (first seen ${e.since}). What it said the last time it failed:`, '',
    '```', e.failure || '(no output kept)', '```', '',
    'Look first at the clock, shared state, the order things finish in and the network (workflow/guides/TESTING.md, *Tests that fail sometimes*).',
    'A failure that names a missing command or package says the computer changed, not the code: then close this card.'].join('\n');
}

/** The test files a runner names as failed (absolute or relative, either slash), as the project's own relative paths. */
export function failedFiles(names, root, tests) {
  const norm = (p) => p.replace(/\\/g, '/').toLowerCase();
  const base = norm(root).replace(/\/$/, '') + '/';
  const wanted = new Set(names.map(norm).map((n) => (n.startsWith(base) ? n.slice(base.length) : n.replace(/^\.\//, ''))));
  return tests.filter((t) => wanted.has(norm(t)));
}
