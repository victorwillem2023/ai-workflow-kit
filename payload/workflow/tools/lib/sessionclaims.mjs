// The claims of the session folders as they are now (lib/claims.mjs says what a claim is): read from git and the specs every
// time, never stored, so a claim cannot go stale. Used by workflow/scripts/session.mjs (a new session, --list, --beside), the
// gate (a change that meets another session's) and the board (today's plan). Reads only; no board, no network.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MAIN } from './branch.mjs';
import { DOCS, claimOf, settledFiles, sharedFiles } from './claims.mjs';

const run = (cwd, args) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim(); } catch { return null; } };
const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
const same = (x, y) => resolve(x).toLowerCase() === resolve(y).toLowerCase();

/** The main folder of the repo `dir` is in (the first worktree git lists). */
export const mainOf = (dir) => resolve((run(dir, ['worktree', 'list', '--porcelain']) ?? '').split('\n')[0].replace(/^worktree /, '').trim() || dir);

/** What is never claimed in this project: the settled files (the config's), the docs and CLAUDE.md's shared files. */
export function neverIn(main) {
  let config = {};
  try { config = JSON.parse(read(join(main, 'workflow/config.json')) || '{}'); } catch { /* the defaults */ }
  return [...settledFiles(config), ...DOCS, ...sharedFiles(read(join(main, 'CLAUDE.md')))];
}

/** A topic's spec: the session folder's copy first (the one being built), else the one waiting in the main folder. */
export const specOf = (main, topic, dir) => (dir && read(join(dir, 'workflow/specs', `${topic}.md`))) || read(join(main, 'workflow/specs', `${topic}.md`));

/**
 * The files a folder changed: committed since it left main (or the session it is stacked on, `on`: the base's files are the
 * base's), uncommitted and new (untracked) ones.
 */
export function changedIn(dir, on = '') {
  const base = (on && run(dir, ['merge-base', on, 'HEAD'])) || run(dir, ['merge-base', MAIN, 'HEAD']);
  // core.quotePath off: a name with an accent comes back as written (src/données/carte.ts), so it meets a spec's
  const committed = base ? run(dir, ['-c', 'core.quotePath=false', 'diff', '--name-only', base]) ?? '' : '';
  const fresh = run(dir, ['-c', 'core.quotePath=false', 'ls-files', '--others', '--exclude-standard']) ?? '';
  return [...new Set(`${committed}\n${fresh}`.split('\n').map((f) => f.trim()).filter((f) => f && f !== 'node_modules'))];
}

/**
 * Every session's claim: [{ topic, dir, cards, on, spec, files }]; the main folder is never a session. A finished one holds
 * nothing by itself: its changes are on main and --finish takes its spec away (never guessed from the branch: a session that only
 * brought main in looks merged too).
 */
export function sessionClaims(main = mainOf(process.cwd())) {
  const never = neverIn(main);
  return (run(main, ['worktree', 'list', '--porcelain']) ?? '').split(/\r?\n\r?\n/).filter((b) => b.trim()).flatMap((block) => {
    const dir = /^worktree (.+)$/m.exec(block)?.[1]?.trim();
    const topic = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]?.trim();
    if (!dir || !topic || topic === MAIN || same(dir, main) || !existsSync(dir)) return [];
    const cards = (run(main, ['config', '--get', `branch.${topic}.card`]) ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const spec = specOf(main, topic, dir);
    const on = run(main, ['config', '--get', `branch.${topic}.kitOn`]) ?? '';
    return [{ topic, dir, cards, on, spec, files: claimOf({ spec, changed: changedIn(dir, on) }, never) }];
  });
}
