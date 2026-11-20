// A session folder holds the kit's tools as they were when it was made. When the main folder got a newer kit since (a fix
// installed while the session was open), a command run in the session would still be the old one, and the fix would reach it only
// after main was brought in. So the commands that import this first (the gate, the sign-off, the session script) hand over to the
// main folder's copy when its kit is newer: the same arguments, the same working folder, so it still checks this folder's files.
// Only then: the same version, a session that holds a newer kit (the kit update itself), a project with no record, or a folder
// that is not a session all run their own copy. One line says so when it happens.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/** The kit version a folder's workflow/record names, or null. */
export const kitVersionIn = (dir) => { try { return /^version=(\S+)/m.exec(readFileSync(join(dir, 'workflow', 'record'), 'utf8'))?.[1] ?? null; } catch { return null; } };

/** True when version `a` is newer than `b` ("4.10.0" is newer than "4.9.3"). */
export function newer(a, b) {
  const [x, y] = [a, b].map((v) => String(v).split('.').map((n) => parseInt(n, 10) || 0));
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

function handOver() {
  const script = process.argv[1] ? resolve(process.argv[1]) : null;
  if (!script || process.env.WORKFLOW_FROM_MAIN) return;
  const git = (...a) => execFileSync('git', a, { cwd: dirname(script), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  let top, main;
  try { top = resolve(git('rev-parse', '--show-toplevel')); main = resolve(git('worktree', 'list', '--porcelain').split('\n')[0].replace(/^worktree /, '')); } catch { return; }
  const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
  const rel = relative(top, script);
  if (same(top, main) || rel.startsWith('..')) return;
  const theirs = kitVersionIn(main), mine = kitVersionIn(top);
  if (!theirs || !mine || !newer(theirs, mine) || !existsSync(join(main, rel))) return;
  console.error(`(the kit's tools run from the main folder, which has kit ${theirs}; this session folder still has ${mine})`);
  const r = spawnSync(process.execPath, [...process.execArgv, join(main, rel), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, WORKFLOW_FROM_MAIN: '1' } });
  process.exit(r.status ?? 1);
}
handOver();
