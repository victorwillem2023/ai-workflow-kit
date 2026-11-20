// A long-running command started in the background with no console window on Windows (the session's dev server).
// A process started `detached` on Windows has no console at all, so every console program it starts in turn (cmd, npm, node, a
// watcher's restarts) gets a new, visible window of its own: the dev server opened a terminal on the owner's screen each time.
// So on Windows a small node launcher runs detached (node itself opens no window) and starts the command with windowsHide and
// piped output: that gives it a console with no window, which everything below it shares. The launcher writes the output to the
// log and ends when the command ends. Elsewhere the command is started detached directly.
import { spawn } from 'node:child_process';
import { createWriteStream, openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);

/**
 * Starts `command args` in `cwd` in the background, its output going to `log` (created anew). It outlives this process.
 * `shell`: through a shell (npm is a .cmd file on Windows). The launcher's own folder is the temp folder, so it never holds the
 * session folder open.
 */
export function startHidden(command, args, { cwd, log, shell = false, env = process.env }) {
  openSync(log, 'w');
  if (process.platform !== 'win32') {
    const out = openSync(log, 'a');
    spawn(command, args, { cwd, env, shell, detached: true, stdio: ['ignore', out, out] }).unref();
    return;
  }
  const spec = JSON.stringify({ command, args, cwd, log, shell });
  spawn(process.execPath, [self, spec], { cwd: tmpdir(), env, detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

if (process.argv[1] && resolve(process.argv[1]) === self) {
  const { command, args, cwd, log, shell } = JSON.parse(process.argv[2]);
  const out = createWriteStream(log, { flags: 'a' });
  // the arguments come from startHidden above, never from outside input
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  const child = spawn(command, args, { cwd, shell, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  child.on('error', (e) => { out.write(`could not start ${command}: ${e.message}\n`); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
}
