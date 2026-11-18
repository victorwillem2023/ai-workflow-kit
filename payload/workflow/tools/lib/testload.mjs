// How many test files run side by side. Each gate would use every core; five sessions on one computer, each running its gate,
// then slow each other down and turn a short wait in a test into a failure. So a gate notes itself in git's common folder (shared
// by every session of the project) while its tests run, and takes its share of the cores: all of them when it runs alone.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** This gate's share of `cores` when `others` gates run their tests too (at least one). */
export const shareOfCores = (cores, others) => Math.max(1, Math.floor(cores / (others + 1)));

/**
 * The option that caps the runner's files side by side, with `{n}` for the number: the config's `commands.testConcurrency`
 * ("" turns it off), else node's own when `testFiles` is `node --test`, else none (another runner: it decides for itself).
 */
export function concurrencyOption(commands = {}) {
  if (commands.testConcurrency !== undefined) return commands.testConcurrency || null;
  const cmd = commands.testFiles ?? '';
  return /\bnode\b.*\s--test(\s|$)/.test(cmd) && !cmd.includes('--test-concurrency') ? '--test-concurrency={n}' : null;
}

/** Whether process `pid` still runs (a gate that crashed leaves its note behind). */
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/**
 * Notes this gate in `dir` while its tests run: { others (gates running tests now), done() }. Notes of gates that are gone are
 * removed. Never throws: a folder it cannot write only means it runs as if alone.
 */
export function noteRun(dir) {
  const mine = join(dir, `${process.pid}`);
  let others = 0;
  try {
    mkdirSync(dir, { recursive: true });
    for (const name of readdirSync(dir)) {
      const pid = Number(name);
      if (!pid || pid === process.pid) continue;
      if (alive(pid)) others++;
      else rmSync(join(dir, name), { force: true });
    }
    writeFileSync(mine, '');
  } catch { /* runs as if alone */ }
  return { others, done: () => { try { rmSync(mine, { force: true }); } catch { /* gone already */ } } };
}
