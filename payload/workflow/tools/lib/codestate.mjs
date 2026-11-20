// The inputs of lib/hotspots.mjs, read from the project (git's history of the last days, the gate's baseline, the flaky list):
// shared by npm run health and the board's code health goal, so both name the same files.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { churn, hotspots } from './hotspots.mjs';

const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const git = (root, ...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, maxBuffer: 64 << 20 }); } catch { return ''; } };

/** The suggestions for `root` (lib/hotspots.mjs); `bugs`: open bug cards with their area, when the board was read. */
export function codeHotspots(root, config, { bugs = [], days = 90, n = 6 } = {}) {
  const changes = churn(git(root, 'log', `--since=${days}.days`, '--no-merges', '--name-only', '--format='));
  const baseline = readJson(join(root, config.baseline ?? 'workflow/tools/baseline.json')) ?? {};
  const common = git(root, 'rev-parse', '--git-common-dir').trim();
  const flaky = common ? Object.keys(readJson(join(resolve(root, common), 'workflow-flaky.json')) ?? {}) : [];
  return hotspots({ changes, baseline, bugs, flaky, days, n });
}
