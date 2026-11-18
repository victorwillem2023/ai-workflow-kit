// What /ship's gate passed on. `gate.mjs --ship` records the tree of the folder's files (committed or not) when it passes; the
// same files are then not checked again: a second `gate:ship` on them says so and stops, and `session.mjs --finish` runs only
// the quick gate on what differs (what the rebase brought in), or nothing when nothing does. Kept in the folder's own git
// directory (a session's worktree has its own), never committed. git only.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const git = (dir, args, env = {}) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const passFile = (dir) => resolve(dir, git(dir, ['rev-parse', '--git-path', 'workflow-ship-pass']));

/** The tree of every file in `dir` as it is now, committed or not (git's ignores apply; never the node_modules link). */
export function treeOf(dir) {
  const tmp = mkdtempSync(join(tmpdir(), 'ship-pass-'));
  const env = { GIT_INDEX_FILE: join(tmp, 'index') };
  try {
    try { git(dir, ['read-tree', 'HEAD'], env); } catch { /* no commit yet: an empty index */ }
    git(dir, ['add', '-A', '--', '.'], env);
    // an older project's .gitignore says "node_modules/", which a link does not match
    git(dir, ['rm', '-q', '--cached', '--ignore-unmatch', 'node_modules'], env);
    return git(dir, ['write-tree'], env);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/** Records that gate:ship passed on these files (the tree it checked; by default, the files as they are now). */
export const recordShipPass = (dir, tree = treeOf(dir)) => writeFileSync(passFile(dir), `${tree}\n`);

/** The tree gate:ship last passed on in `dir`, or null. */
export function shipPassOf(dir) {
  const f = passFile(dir);
  return existsSync(f) ? readFileSync(f, 'utf8').trim() || null : null;
}

/** The files that differ between that tree and the folder's last commit (after --finish's squash, rebase and map). */
export const changedSince = (dir, tree) => git(dir, ['diff', '--name-only', tree, 'HEAD']).split('\n').filter(Boolean);
