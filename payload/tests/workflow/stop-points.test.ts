// The stop points held by hooks (scripts/stop-points.mjs): the owner's own words allow a commit or a push for a few hours; an
// agent's command that commits or pushes without them is refused with a reason.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HOLDS_MS, needsWord, saidInPrompt, verdict } from '../../scripts/stop-points.mjs';

describe('the stop points', () => {
  it('reads "done", "commit" and "push" in what the owner types, and not when they say not', () => {
    assert.deepEqual(saidInPrompt('done, looks good'), { commit: true, push: false });
    assert.deepEqual(saidInPrompt('Commit and push'), { commit: true, push: true });
    assert.deepEqual(saidInPrompt('finish it'), { commit: true, push: false });
    assert.deepEqual(saidInPrompt('not done yet, the button is wrong'), { commit: false, push: false });
    assert.deepEqual(saidInPrompt("don't commit, I want to look first"), { commit: false, push: false });
    assert.deepEqual(saidInPrompt('push it'), { commit: false, push: true });
    assert.deepEqual(saidInPrompt('do not push yet'), { commit: false, push: false });
    assert.deepEqual(saidInPrompt('change the colour of the header'), { commit: false, push: false });
  });

  it('knows a commit and a push, after git\'s own options, and not the word in a path or a log', () => {
    assert.equal(needsWord('git commit -m "x"'), 'commit');
    assert.equal(needsWord('cd ../app-a && git -C ../app-a -c user.name=t commit -qm x'), 'commit');
    assert.equal(needsWord('node scripts/session.mjs --finish goal'), 'commit');
    assert.equal(needsWord('node scripts/session.mjs --commit-notes "Docs: x"'), 'commit');
    assert.equal(needsWord('git push origin main'), 'push');
    assert.equal(needsWord('node scripts/session.mjs --push'), 'push');
    assert.equal(needsWord('git log -- scripts/commit-notes.mjs'), null);
    assert.equal(needsWord('git status && npm test'), null);
    assert.equal(needsWord('node scripts/session.mjs goal --card 4'), null);
  });

  it('lets it through for a few hours after the owner said it, and refuses with the reason otherwise', () => {
    const now = 1_000_000_000_000;
    assert.equal(verdict('git commit -m x', { commit: now - 60_000 }, now).ok, true);
    const stale = verdict('git commit -m x', { commit: now - HOLDS_MS - 1 }, now);
    assert.equal(stale.ok, false);
    assert.match(stale.why ?? '', /waits for the owner.*"done"/);
    assert.equal(verdict('git push', { commit: now }, now).ok, false, 'a "done" is not a "push"');
    assert.equal(verdict('npm test', {}, now).ok, true);
  });
});
