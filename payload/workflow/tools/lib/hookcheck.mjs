// Whether the stop points start. The hooks run workflow/scripts/stop-points.mjs on every commit, push and edit; a script that
// cannot load (a file it imports is missing, as after a half-applied update) exits 1, which Claude Code takes as a warning, so
// every stop turns into a pass without a word. This starts it once with --status, the harmless mode, and says so loudly when it
// does not start. Read by the installer's report and by npm run health.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** null when the stop points start (or the project has none), else the loud line to print. */
export function hookProblem(dir) {
  if (!existsSync(join(dir, 'workflow', 'scripts', 'stop-points.mjs'))) return null;
  const r = spawnSync(process.execPath, ['workflow/scripts/stop-points.mjs', '--status'], { cwd: dir, encoding: 'utf8', timeout: 20000 });
  if (r.status === 0) return null;
  const why = String(r.stderr || r.stdout || r.error?.message || 'no output').split('\n').map((l) => l.trim()).find((l) => /Error|Cannot|not found/i.test(l))
    ?? String(r.stderr || '').trim().split('\n')[0] ?? '';
  return `!!! THE STOP POINTS DO NOT START: node workflow/scripts/stop-points.mjs --status fails (${why.slice(0, 200)}). Until it starts, an agent's commit, push and code edit in the main folder are NOT held. Fix it before any session: run the kit update again, or bring back the file the error names.`;
}
