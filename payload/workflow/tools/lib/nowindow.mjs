// No console windows flickering on Windows. A kit command started from a process that has no console of its own (the editor,
// Claude Code's hooks) gave every git, npm or node it ran a new console window for a moment, unless that one call said
// `windowsHide: true`. Imported first by each kit command, this makes hiding the default for every child_process call in the
// process (a call that says `windowsHide: false` keeps its window). Elsewhere it does nothing.
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

/** The calls that start a process, and whether their second argument may be the list of arguments. */
const CALLS = { spawn: true, spawnSync: true, execFile: true, execFileSync: true, fork: true, exec: false, execSync: false };

/** The arguments of a `name` call with windowsHide true in its options (added when it has none; a value it gives wins). */
export function withHidden(name, args) {
  const a = [...args];
  const at = a.findIndex((x, i) => i > 0 && x && typeof x === 'object' && !Array.isArray(x));
  if (at > 0) { a[at] = { windowsHide: true, ...a[at] }; return a; }
  // no options: they go after the command and its list of arguments, before a callback
  let i = CALLS[name] && Array.isArray(a[1]) ? 2 : 1;
  if (i > a.length) i = a.length;
  if (typeof a[i] === 'function' || i === a.length || a[i] === undefined) a.splice(i, a[i] === undefined && i < a.length ? 1 : 0, { windowsHide: true });
  return a;
}

if (process.platform === 'win32' && !cp.__workflowNoWindow) {
  cp.__workflowNoWindow = true;
  for (const name of Object.keys(CALLS)) {
    const original = cp[name];
    cp[name] = function (...args) { return original.apply(this, withHidden(name, args)); };
  }
  // the named imports (`import { spawnSync } from 'node:child_process'`) follow the change
  syncBuiltinESMExports();
}
