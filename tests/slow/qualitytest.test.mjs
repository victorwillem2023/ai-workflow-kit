// The quality scenarios (scripts/qualitytest.mjs) pass a good answer and fail a weak one, with stand-ins for the agent and the
// judge (tests/slow/fake-quality-agent.mjs, fake-judge.mjs): free and in seconds, so a real run's score can be trusted.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge, leaks, QUALITY, runQuality } from '../../scripts/qualitytest.mjs';

const node = (f) => [process.execPath, fileURLToPath(new URL(f, import.meta.url))];
const agent = node('./fake-quality-agent.mjs'), judgeCmd = node('./fake-judge.mjs');
const run = (name, env, runs = 1) => {
  Object.assign(process.env, env);
  try { return runQuality(name, QUALITY[name], { runs, agent, judgeCmd, deps: false }); } finally { for (const k of Object.keys(env)) delete process.env[k]; }
};
const GOOD_ANATOMY = 'TRIES in summit-day.ts and BACK_OFF in summit-trip.ts are one rule. candidates.ts, score.ts, select.ts and notes.ts ask whether it is a summit.';

describe('the quality scenarios', () => {
  it('pass an answer that makes the scripted points and enough of the judged ones, over three runs', () => {
    const r = run('anatomy-spread-kind', { FAKE_ANSWER: GOOD_ANATOMY, FAKE_JUDGE: 'yes' }, 3);
    assert.equal(r.ok, true, r.problems.join('\n'));
    assert.equal(r.passed, 3);
    assert.equal(r.share['list-twice'], 1);
    assert.ok(r.cost > 0, 'the cost of the agent and the judge is added up');
  });
  it('fail an answer that misses a scripted point, whatever the judge says', () => {
    const r = run('anatomy-spread-kind', { FAKE_ANSWER: 'candidates.ts, score.ts and select.ts ask about it; TRIES is a list.', FAKE_JUDGE: 'yes' });
    assert.equal(r.ok, false);
    assert.match(r.problems.join(), /missed: the list of points to step back through is one rule in two files/);
  });
  it('fail when the judge finds too few points, or gives no JSON', () => {
    assert.match(run('anatomy-spread-kind', { FAKE_ANSWER: GOOD_ANATOMY, FAKE_JUDGE: 'only:own-home,one-reach,order' }).problems.join(), /the judge found 3 of 5 points, 4 needed/);
    assert.match(run('anatomy-spread-kind', { FAKE_ANSWER: GOOD_ANATOMY, FAKE_JUDGE: 'garbage' }).problems.join(), /the judge gave no JSON/);
    const noHome = run('anatomy-spread-kind', { FAKE_ANSWER: GOOD_ANATOMY, FAKE_JUDGE: 'only:one-route-up,one-reach,check-first,order' });
    assert.match(noHome.problems.join(), /did not find a point it must: The end state gives "to a top"/, 'four of five, but not the one that matters');
  });
  it('grade the files the skill wrote too: the spec on disk, its End state line', () => {
    const spec = '# Spec: gravel-pace\n\nEnd state: paceFor in src/core/pace.ts takes the surface, so estimate, plan-day and the summary all slow down on gravel.\n';
    const ok = run('spec-rule-home', { FAKE_ANSWER: 'Written.', FAKE_WRITE: `workflow/specs/gravel-pace.md=${spec}`, FAKE_JUDGE: 'yes' });
    assert.equal(ok.ok, true, ok.problems.join('\n'));
    const patch = run('spec-rule-home', { FAKE_ANSWER: 'Written.', FAKE_WRITE: 'workflow/specs/gravel-pace.md=# Spec\n\nEnd state: an if in estimate.ts.\n', FAKE_JUDGE: 'yes' });
    assert.match(patch.problems.join(), /missed: its End state line names the rule's home/);
  });
  it('review: the two mistakes are scripted points, the rest the judge\'s', () => {
    assert.equal(run('review-catches-bugs', { FAKE_ANSWER: 'A ride with no distance makes the total NaN; it is rounded to whole km, not one decimal.', FAKE_JUDGE: 'yes' }).ok, true);
    assert.match(run('review-catches-bugs', { FAKE_ANSWER: 'Looks good to me.', FAKE_JUDGE: 'yes' }).problems.join(), /missed: a ride with no distance/);
    const quoted = run('review-catches-bugs', { FAKE_ANSWER: 'weekTotalKm uses Math.round and the spec mentions indoor rides; looks fine.', FAKE_JUDGE: 'yes' });
    assert.match(quoted.problems.join(), /missed: a ride with no distance makes the total NaN[\s\S]*missed: the total is rounded/, 'quoting the code and the spec finds nothing');
  });
  it('a skill that is not installed is said as such, never graded as a bad answer', () => {
    const r = runQuality('x', { ...QUALITY['anatomy-spread-kind'], prompt: '/no-such-skill go' }, { runs: 1, agent, judgeCmd, deps: false });
    assert.match(r.problems.join(), /\/no-such-skill is not installed/);
    assert.ok(!r.problems.some((p) => /missed|judge/.test(p)));
  });
  it('a scenario is not blind when the installed kit text names its answer; the planted code may', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kit-quality-leak-'));
    try {
      mkdirSync(join(dir, '.claude/skills/x'), { recursive: true }); mkdirSync(join(dir, 'src/plan'), { recursive: true });
      writeFileSync(join(dir, '.claude/skills/x/SKILL.md'), 'look for BACK_OFF');
      writeFileSync(join(dir, 'src/plan/summit-trip.ts'), 'const BACK_OFF = [];');
      assert.deepEqual(leaks(dir, QUALITY['anatomy-spread-kind']).map((l) => l.replace(/\\/g, '/')), ['.claude/skills/x/SKILL.md: BACK_OFF']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('the judge sees only the checklist and the answer, and says which point each verdict is for', () => {
    const j = judge([{ id: 'a', judge: 'says a' }, { id: 'b', judge: 'says b' }], 'answer', { judgeCmd });
    assert.deepEqual(j.met, { a: true, b: true });
    assert.match(j.why.a, /kit-quality-judge-[^|]*\|empty$/, 'in an empty folder of its own, never the project');
  });
});
