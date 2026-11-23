// A stand-in for the judge in tests/slow/qualitytest.test.mjs: reads the checklist from stdin like the real CLI's -p, and marks
// every point met (FAKE_JUDGE=yes), none (no), the ones named (FAKE_JUDGE=only:a,b) or answers with no JSON at all (garbage).
import { existsSync } from 'node:fs';
let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  const mode = process.env.FAKE_JUDGE ?? 'yes';
  if (mode === 'garbage') { process.stdout.write('not json'); return; }
  const ids = [...input.matchAll(/^- ([\w-]+): /gm)].map((m) => m[1]);
  const only = mode.startsWith('only:') ? mode.slice(5).split(',') : null;
  // why: the folder it ran in and whether it saw a project there, so the test can tell the judge sees the answer only
  const points = ids.map((id) => ({ id, met: only ? only.includes(id) : mode === 'yes', why: `${process.cwd()}|${existsSync('package.json') || existsSync('src') ? 'project' : 'empty'}` }));
  process.stdout.write(JSON.stringify({ result: JSON.stringify({ points }), total_cost_usd: 0.002 }));
});
