// Where the project is and which stage comes next (lib/stage.mjs): a nudge only from facts, one line each, none when there is
// nothing to say.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BEFORE_DEPLOY, readRoadmap, stageNudges, type StageFacts } from '../../tools/workflow/lib/stage.mjs';

const quiet: StageFacts = { firstVersion: { total: 4, open: 2 }, beforeDeploy: [], launched: false, marketPage: false,
  installed: { launch: true, market: true, retro: true }, shippedThisWeek: 0, daysSinceRetro: 3 };

describe('the stage nudge', () => {
  it('says nothing while the first version is being built and the week is quiet', () => {
    assert.deepEqual(stageNudges(quiet), []);
    assert.deepEqual(stageNudges({ ...quiet, firstVersion: null }), [], 'no board: no guess');
  });

  it('the first version built and nowhere to run it: /launch, after a card that must come before the first deploy', () => {
    const built = { ...quiet, firstVersion: { total: 4, open: 0 } };
    assert.match(stageNudges(built)[0], /The first version is built .* next is \/launch/);
    const [line] = stageNudges({ ...built, beforeDeploy: [{ number: 5, title: 'Sign in with Google' }] });
    assert.match(line, /Before it goes online: #5 Sign in with Google .* then \/launch\.$/);
  });

  it('a working first version asks once whether AI could make it better, until a decision record answers it', () => {
    const built = { ...quiet, firstVersion: { total: 4, open: 0 }, launched: true, marketPage: true };
    const [line] = stageNudges({ ...built, aiConsidered: false });
    assert.match(line, /Could AI make it better for the people using it .* \/advise ai looks at it, starting from what your rules let go to a model/);
    assert.deepEqual(stageNudges({ ...built, aiConsidered: true }), [], 'answered (yes or no): it stops');
    assert.deepEqual(stageNudges({ ...quiet, aiConsidered: false }), [], 'not before the first version works');
    assert.match(stageNudges({ ...built, aiConsidered: false, installed: { advise: false } })[0], /--with advise adds it/);
  });

  it('a stage whose skill is not installed says the command that adds it', () => {
    const [line] = stageNudges({ ...quiet, firstVersion: { total: 4, open: 0 }, installed: { launch: false, market: false, retro: false } });
    assert.match(line, /\/launch is not installed: node <kit>\/install\.mjs \. --update --with launch adds it/);
  });

  it('a launch plan with nobody to tell: /market; a week shipped without a retro: /retro', () => {
    const lines = stageNudges({ ...quiet, launched: true, shippedThisWeek: 2, daysSinceRetro: null });
    assert.match(lines[0], /\/market when you want users/);
    assert.match(lines[1], /2 changes shipped this week and no retro for ever: \/retro/);
    assert.deepEqual(stageNudges({ ...quiet, launched: true, marketPage: true, shippedThisWeek: 2, daysSinceRetro: 2 }), [], 'a recent retro is enough');
  });

  it('reads the roadmap\'s stage and sign, and a template value is not a value', () => {
    assert.deepEqual(readRoadmap('## Now\nStage: 1 first users, since 2026-11-01.\nThe sign we are watching: most of the ten use it every week.\n'),
      { stage: '1 first users', sign: 'most of the ten use it every week' });
    assert.deepEqual(readRoadmap('Stage: <0 idea / 1 first users>, since <date>.\nThe sign we are watching: <what would show it>.\n'), { stage: null, sign: null });
  });

  it('the roadmap steers: unfilled asks for it once; a month unchanged asks whether its sign has come', () => {
    assert.match(stageNudges({ ...quiet, roadmap: { stage: null, sign: null, daysSinceChange: 0 } })[0], /does not say yet which stage .* \/advise roadmap/);
    const [line] = stageNudges({ ...quiet, roadmap: { stage: '1 first users', sign: 'most of the ten use it every week', daysSinceChange: 31 } });
    assert.match(line, /stage 1 first users, watching for: most of the ten use it every week\. Is that there yet\?/);
    assert.deepEqual(stageNudges({ ...quiet, roadmap: { stage: '1', sign: 'x', daysSinceChange: 3 } }), [], 'a fresh roadmap is left alone');
  });

  it('knows a card that comes before the first deploy, in the ways people write it', () => {
    for (const t of ['Must be done before the first deploy.', 'before going live', 'Do this before launch']) assert.ok(BEFORE_DEPLOY.test(t), t);
    assert.ok(!BEFORE_DEPLOY.test('Deploy the app to staging'));
  });
});
