// The gate's test step: which picked files still run (lib/testcache.mjs), how many side by side (lib/testload.mjs), and what
// is kept afterwards, file by file, also when the run failed. A file that failed and then passed with the same code under it goes
// on the flaky list in git's common folder, with what it said when it failed, and every gate run of every session prints it
// until it has passed ten times in a row, in any session, with no failure between (lib/testcache.mjs, CLEAR_AFTER).
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterRun, cacheSalt, failedFiles, flakyCard, flakyLines, readRecord, splitByCache, testKey, updateFlaky } from './testcache.mjs';
import { concurrencyOption, noteRun, shareOfCores } from './testload.mjs';

const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const slug = (f) => f.replace(/[^\w.-]+/g, '-');

/**
 * Where the records live: this checkout's git folder (what passed here) and the common one (the flaky list and each flaky
 * test's card text, the running gates).
 */
export function recordPaths(gitOk) {
  const own = gitOk('rev-parse', '--git-dir') ?? '.git';
  const common = gitOk('rev-parse', '--git-common-dir') ?? own;
  return { passed: join(own, 'workflow-tests-passed.json'), flaky: join(common, 'workflow-flaky.json'), cards: join(common, 'workflow-flaky'), gates: join(common, 'workflow-gates') };
}

/** The flaky list's lines (a deleted test is left out), each naming the card text with what failed. */
export function flakyNow(paths) {
  const list = readJson(paths.flaky) ?? {};
  const kept = updateFlaky(list, [], [], {}, existsSync, '');
  return flakyLines(kept, (f) => (existsSync(join(paths.cards, `${slug(f)}.md`)) ? resolve(paths.cards, `${slug(f)}.md`).replace(/\\/g, '/') : null));
}

/**
 * The list after a run (passes counted, failures reset the count), and each listed test's card text written next to it with
 * its newest failure. Never throws: the lines say it all the same.
 */
function keepFlaky(paths, flaky, passedNow, failedNow) {
  withLock(`${paths.flaky}.lock`, () => {
    const list = readJson(paths.flaky) ?? {};
    if (!flaky.length && !Object.keys(list).length) return; // nothing listed, nothing new: no file to write
    const next = updateFlaky(list, flaky, passedNow, failedNow, existsSync, new Date().toISOString().slice(0, 10));
    try {
      writeFileSync(paths.flaky, JSON.stringify(next, null, 2));
      mkdirSync(paths.cards, { recursive: true });
      for (const f of Object.keys(list)) if (!next[f]) rmSync(join(paths.cards, `${slug(f)}.md`), { force: true });
      for (const [file, e] of Object.entries(next)) writeFileSync(join(paths.cards, `${slug(file)}.md`), flakyCard(file, e));
    } catch { /* not kept */ }
  });
}

/**
 * Runs `fn` while holding `lock` (a folder: making one is atomic), so two gates finishing at once do not read the same list
 * and the second write lose what the first added (a test just seen flaky). Waits up to 3 s; a lock older than 30 s is left
 * from a gate that died and is taken over. Never blocks the gate: without the lock it goes on, as before.
 */
export function withLock(lock, fn) {
  const nap = new Int32Array(new SharedArrayBuffer(4));
  let held = false;
  for (let i = 0; i < 60 && !held; i++) {
    try { mkdirSync(lock); held = true; } catch {
      try { if (Date.now() - statSync(lock).mtimeMs > 30_000) rmSync(lock, { recursive: true, force: true }); } catch { /* gone meanwhile */ }
      if (!held) Atomics.wait(nap, 0, 0, 50);
    }
  }
  try { return fn(); } finally { if (held) rmSync(lock, { recursive: true, force: true }); }
}

/**
 * Runs the picked tests. `ctx`: { config, plan, graph, changed, levels, isTest, run, readIf, paths, fresh }.
 * Returns { r: { ok, out, note }, seconds (the whole suite's time, or 0) }.
 */
export function runTests(ctx) {
  const { config, plan, graph, changed, levels, isTest, run, readIf, paths } = ctx;
  const t0 = Date.now();
  const whole = plan.whole || plan.mode === 'suite';
  // the cache skips only on picked files on this computer (the whole suite only with "cache": "all"); --fresh and GitHub run them all
  const keep = !process.env.CI && config.testPicking !== false;
  const skipping = keep && !ctx.fresh && (!whole || levels.cache === 'all');
  const candidates = plan.mode === 'suite' ? [...graph.files.keys()].filter(isTest).sort() : plan.files;
  const record = readRecord(readIf(paths.passed));
  let keys = {};
  if (keep) {
    // what the graph does not show: the packages, the settings, and every changed file it cannot follow (a fixture, a stylesheet)
    const leaning = ['package-lock.json', 'tsconfig.json', 'tsconfig.gate.json', 'workflow/config.json', ...changed.filter((f) => !graph.files.has(f))];
    const salt = cacheSalt(leaning.map((f) => [f, readIf(f)]));
    keys = Object.fromEntries(candidates.map((f) => [f, testKey(f, graph, salt)]));
  }
  const { run: files, skipped } = skipping ? splitByCache(candidates, keys, record.passed) : { run: candidates, skipped: [] };
  if (skipping && !files.length) return { r: { ok: true, note: `${plan.note}; all ${skipped.length} passed before with the same code (--fresh runs them)` }, seconds: 0 };

  const results = join(tmpdir(), `workflow-tests-${process.pid}.json`);
  rmSync(results, { force: true });
  const option = concurrencyOption(config.commands);
  const load = option ? noteRun(paths.gates) : { others: 0, done: () => {} };
  const cap = option && load.others ? ` ${option.replace('{n}', shareOfCores(availableParallelism(), load.others))}` : '';
  const env = { WORKFLOW_TEST_RESULTS: results };
  let r = { ok: true, out: '' };
  const ran = []; // only the files whose batch really ran: one after a failing batch never does, so it is neither passed nor failed
  try {
    // a runner that takes no file list (Go: `go test ./...`, testPicking false) runs its whole suite; else the files go in batches
    // of 300 (a command line holds no more), each batch's files side by side, stopping at the first that fails
    if (!skipping && (plan.mode === 'suite' || config.testPicking === false)) { r = run(config.commands.testAll, undefined, env); ran.push(...files); }
    else {
      for (let i = 0; i < files.length && r.ok; i += 300) {
        const batch = files.slice(i, i + 300);
        r = run(`${config.commands.testFiles}${cap} ${batch.join(' ')}`, undefined, env);
        ran.push(...batch);
      }
    }
  } finally { load.done(); }
  const seconds = whole && !skipped.length ? (Date.now() - t0) / 1000 : 0;

  const notes = [plan.note];
  if (skipped.length) notes.push(`${skipped.length} passed before with the same code`);
  if (cap) notes.push(`${load.others} other gate${load.others === 1 ? '' : 's'} running tests, so${cap}`);
  if (keep) {
    const said = readJson(results);
    rmSync(results, { force: true });
    const failed = said ? failedFiles(said.failed ?? [], process.cwd(), ran) : null;
    const { record: next, flaky, passedNow, failedNow } = afterRun(record, ran, keys, failed, r.ok, r.out);
    try { writeFileSync(paths.passed, JSON.stringify(next)); } catch { /* not kept: they run again */ }
    if (flaky.length || passedNow.length || Object.keys(failedNow).length) keepFlaky(paths, flaky, passedNow, failedNow);
    if (flaky.length) notes.push(`FLAKY ${flaky.map((x) => x.file).join(', ')}: failed before with this same code, passed now (listed below)`);
    if (!r.ok && failed?.length) r = { ...r, out: `${r.out}\nfailed: ${failed.join(', ')}. A test that fails with no change under it is flaky: report it with its output, never run it again hoping for green (a second run that passes puts it on the flaky list)` };
  }
  return { r: { ...r, note: notes.join('; ') }, seconds };
}
