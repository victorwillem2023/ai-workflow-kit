// The inputs of lib/hotspots.mjs, read from the project (git's history of the last days, the gate's baseline, the flaky list):
// shared by npm run health and the board's code health goal, so both name the same files. And the records of what shipped
// cards took (lib/shipped.mjs), which every tool reads from the same file in git's common folder.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { churn, fixStreaks, hotspots } from './hotspots.mjs';
import { FILE, hardFiles, parseRecords } from './shipped.mjs';

const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const git = (root, ...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, maxBuffer: 64 << 20 }); } catch { return ''; } };

/** Where the records of what shipped cards took are kept: git's common folder, so no commit and one file for every session folder. Null outside git. */
export function shippedFile(root) {
  const common = git(root, 'rev-parse', '--git-common-dir').trim();
  return common ? join(resolve(root, common), FILE) : null;
}

/** The records of what shipped cards took, oldest first ([] when there are none yet). */
export function shippedRecords(root) {
  const file = shippedFile(root);
  try { return file ? parseRecords(readFileSync(file, 'utf8')) : []; } catch { return []; }
}

/**
 * The fixes of the last days as lib/hotspots.mjs fixStreaks() reads them: the shipped records of bug cards (no board needed)
 * and `closed`, the closed bug cards with their area and date, when the board was read.
 */
export function recentFixes(root, closed = []) {
  const shipped = shippedRecords(root).filter((r) => r.type === 'bug')
    .flatMap((r) => (r.areas ?? []).flatMap((area) => (r.cards.length ? r.cards.map((card) => ({ area, at: r.at, card })) : [{ area, at: r.at, topic: r.topic }])));
  return [...shipped, ...closed];
}

/** The suggestions for `root` (lib/hotspots.mjs); `bugs`: open bug cards with their area, `closed`: closed bug cards with their area and date, when the board was read. */
export function codeHotspots(root, config, { bugs = [], closed = [], days = 90, n = 6 } = {}) {
  const changes = churn(git(root, 'log', `--since=${days}.days`, '--no-merges', '--name-only', '--format='));
  const baseline = readJson(join(root, config.baseline ?? 'workflow/tools/baseline.json')) ?? {};
  const common = git(root, 'rev-parse', '--git-common-dir').trim();
  const flaky = common ? Object.keys(readJson(join(resolve(root, common), 'workflow-flaky.json')) ?? {}) : [];
  const fixes = fixStreaks(recentFixes(root, closed), config.board?.fixStreak);
  return hotspots({ changes, baseline, bugs, flaky, hard: hardFiles(shippedRecords(root)), fixes, days, n });
}
