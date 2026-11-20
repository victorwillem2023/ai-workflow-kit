// The .env decides, not the shell. An app reads its .env only for what the environment does not name already, so a PORT, HOST or
// data folder left set in the owner's terminal wins over the folder's own .env: a session's server came up on the main folder's
// port, and its tests could have opened the real data. So the gate and the session scripts take those names out of the
// environment before they start anything: every name this folder's .env sets, and in a session folder every name the main
// folder's .env sets too (a session's copy of the .env leaves some of them out, and they must not come back from the shell).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** The names a .env text sets. */
export const envNames = (text) => String(text ?? '').split(/\r?\n/).map((l) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l)?.[1]).filter(Boolean);

/** `env` without `names` (whatever their case: Windows does not tell PORT from Port). */
export function withoutNames(env, names) {
  const drop = new Set(names.map((n) => n.toUpperCase()));
  return Object.fromEntries(Object.entries(env).filter(([k]) => !drop.has(k.toUpperCase())));
}

/** The names the .env of `dir` sets, and those of the main folder's when `dir` is a session folder of it. */
export function projectEnvNames(dir) {
  const read = (d) => (existsSync(join(d, '.env')) ? envNames(readFileSync(join(d, '.env'), 'utf8')) : []);
  let main = dir;
  try { main = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n')[0].replace(/^worktree /, '').trim() || dir; } catch { /* not a git folder: its own .env only */ }
  return [...new Set([...read(dir), ...(resolve(main) === resolve(dir) ? [] : read(main))])];
}

/** The environment the commands of `dir` start with: `env` without the names its .env files set, and `extra` on top. */
export const folderEnv = (dir, extra = {}, env = process.env) => ({ ...withoutNames(env, projectEnvNames(dir)), ...extra });

/** Takes those names out of this process's own environment, so everything it starts goes by the .env; returns the names taken out. */
export function useFolderEnv(dir = process.cwd()) {
  const names = new Set(projectEnvNames(dir).map((n) => n.toUpperCase()));
  const gone = Object.keys(process.env).filter((k) => names.has(k.toUpperCase()));
  for (const k of gone) delete process.env[k];
  return gone;
}
