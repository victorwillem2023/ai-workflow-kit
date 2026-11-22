// What /ship's gate passed on. `gate.mjs --ship` records the tree of the folder's files (committed or not) when it passes; the
// same files are then not checked again: a second `gate:ship` on them says so and stops, and `session.mjs --finish` runs only
// the quick gate on what differs (what the rebase brought in), or nothing when nothing does. Kept in the folder's own git
// directory (a session's worktree has its own), never committed. git only.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

// the plain gate's pass: the same files, the same base, the same flags and .env passed before (gate.mjs); kept beside the ship pass
const gatePassFile = (dir) => resolve(dir, git(dir, ['rev-parse', '--git-path', 'workflow-gate-pass']));
/** Records that the gate passed for `key` (the tree, the base, the flags, the .env and the specs), with the advice it said. */
export const recordGatePass = (dir, key, advice = []) => writeFileSync(gatePassFile(dir), `${[key, ...advice].join('\n')}\n`);
const gatePass = (dir) => { const f = gatePassFile(dir); return existsSync(f) ? readFileSync(f, 'utf8').split('\n').map((l) => l.trimEnd()) : []; };
/** The key the gate last passed for in `dir`, or null. */
export const gatePassOf = (dir) => gatePass(dir)[0] || null;
/** The advice that pass said, said again when the gate is not run again. */
export const gatePassAdvice = (dir) => gatePass(dir).slice(1).filter(Boolean);

/** Whether `ref` names a commit or a tree in `dir`'s git (the gate's --base: --finish passes the tree gate:ship passed on). */
export function isTreeish(dir, ref) {
  try { git(dir, ['cat-file', '-e', `${ref}^{tree}`]); return true; } catch { return false; }
}

/**
 * What the gate reads that git does not track, as one hash: the .env and the specs in workflow/specs/ (ignored, read by the
 * scope and end-state checks), so a changed or newly arrived spec runs the gate again.
 */
export function untrackedInputs(dir) {
  const h = createHash('sha1').update(existsSync(join(dir, '.env')) ? readFileSync(join(dir, '.env')) : '');
  const specs = join(dir, 'workflow/specs');
  if (existsSync(specs)) for (const f of readdirSync(specs).sort()) { const p = join(specs, f); if (statSync(p).isFile()) h.update(`\0${f}\0`).update(readFileSync(p)); }
  return h.digest('hex');
}

/** The files that differ between that tree and the folder's last commit (after --finish's squash, rebase and map). */
export const changedSince = (dir, tree) => git(dir, ['diff', '--name-only', tree, 'HEAD']).split('\n').filter(Boolean);
