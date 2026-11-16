// The stop points held by hooks (workflow/scripts/stop-points.mjs): the owner's own words allow a commit or a push for a few hours; an
// agent's command that commits or pushes without them is refused with a reason.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HOLDS_MS, needsWord, nextNote, notedFromTranscript, saidInPrompt, verdict } from '../../workflow/scripts/stop-points.mjs';

const allows = (text: string) => { const s = saidInPrompt(text); return { commit: s.commit, push: s.push }; };

describe('the stop points', () => {
  it('reads "done", "commit" and "push" in what the owner types, and not when they say not', () => {
    assert.deepEqual(allows('done, looks good'), { commit: true, push: false });
    assert.deepEqual(allows('Commit and push'), { commit: true, push: true });
    assert.deepEqual(allows('finish it'), { commit: true, push: false });
    assert.deepEqual(allows('not done yet, the button is wrong'), { commit: false, push: false });
    assert.deepEqual(allows("don't commit, I want to look first"), { commit: false, push: false });
    assert.deepEqual(allows('push it'), { commit: false, push: true });
    assert.deepEqual(allows('go ahead and push'), { commit: false, push: true });
    assert.deepEqual(allows('do not push yet'), { commit: false, push: false });
    assert.deepEqual(allows('change the colour of the header'), { commit: false, push: false });
  });

  it('takes a short yes as the commit the skill asked for (/setup: "on yes, one commit"), and never as a push', () => {
    for (const yes of ['yes', 'Yes.', 'ok', 'yes please', 'go ahead', 'ok, commit']) assert.deepEqual(allows(yes), { commit: true, push: false }, yes);
    assert.deepEqual(allows('yes, but make the header blue first'), { commit: false, push: false });
  });

  it('does not count a question, a condition or another meaning of the word', () => {
    for (const text of ['is it done?', 'when you are done, tell me', 'what does the commit hook do?', 'push the button down a bit',
      'if it is done, show me the screen', 'the commit message is wrong', 'should we push this?',
      "I'm done reading the plan, now make the header blue", 'done with lunch, lets look at the map', 'add a commit button',
      'make it say "done" when saved']) {
      assert.deepEqual(allows(text), { commit: false, push: false }, text);
    }
  });

  it('keeps one note per chat, takes it back on "wait", and drops notes past the hold', () => {
    const now = 1_000_000_000_000;
    const one = nextNote({}, 'session:a', saidInPrompt('done'), now);
    assert.equal(verdict('git commit -m x', one['session:b'], now).ok, false, "chat a's done is not chat b's");
    assert.equal(verdict('git commit -m x', one['session:a'], now).ok, true);
    assert.equal(nextNote(one, 'session:a', saidInPrompt('wait'), now)['session:a'], undefined);
    assert.deepEqual(nextNote({ 'session:old': { commit: now - HOLDS_MS - 1 } }, 'session:a', saidInPrompt('push it'), now), { 'session:a': { push: now } });
  });

  it('knows a commit and a push, after git\'s own options, and not the word in a path or a log', () => {
    assert.equal(needsWord('git commit -m "x"'), 'commit');
    assert.equal(needsWord('cd ../app-a && git -C ../app-a -c user.name=t commit -qm x'), 'commit');
    assert.equal(needsWord('node workflow/scripts/session.mjs --finish goal'), 'commit');
    assert.equal(needsWord('node workflow/scripts/session.mjs --commit-notes "Docs: x"'), 'commit');
    assert.equal(needsWord('git push origin main'), 'push');
    assert.equal(needsWord('node workflow/scripts/session.mjs --push'), 'push');
    assert.equal(needsWord('git log -- scripts/commit-notes.mjs'), null);
    assert.equal(needsWord('git status && npm test'), null);
    assert.equal(needsWord('node workflow/scripts/session.mjs goal --card 4'), null);
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

describe("the owner's own sign-off record", () => {
  it('refuses a shell command that writes the sign-off record, its signers or the note, also through a glob, whatever the owner said', () => {
    const now = 1_000_000_000_000;
    for (const c of ['echo "| 2026-11-15 | Owner | 0123456789abcdef | x |" >> docs/company/SIGNOFFS.md',
      "node -e \"require('fs').appendFileSync('docs/company/SIGNOFFS.md', row)\"", "sed -i 's/a/b/' docs/company/SIGNOFFS.md",
      'printf x >> docs/company/SIGN*.md', 'echo {} > .git/workflow-said.json', 'cp mine.md docs/company/SIGNERS.md']) {
      assert.equal(verdict(c, { commit: now, push: now }, now).ok, false, c);
    }
  });
  it('lets reading the record be', () => {
    assert.equal(verdict('cat docs/company/SIGNOFFS.md', {}, 0).ok, true);
    assert.equal(verdict('git diff -- docs/company/SIGNOFFS.md', {}, 0).ok, true);
  });
});

describe('commands that get around the plain spelling', () => {
  it('holds git by its full path, the session script through npm, and a merge on GitHub', () => {
    assert.equal(needsWord('/usr/bin/git commit -m x'), 'commit');
    assert.equal(needsWord('"C:/Program Files/Git/bin/git.exe" commit -m x'), 'commit');
    assert.equal(needsWord('npm run session -- goal --finish'), 'commit');
    assert.equal(needsWord('git merge main'), 'commit');
    assert.equal(needsWord('git merge --abort'), null);
    assert.equal(needsWord('gh pr merge 12 --squash'), 'push');
  });
});

describe("the owner's words from Claude Code's transcript", () => {
  const line = (type: string, content: unknown, at: string, extra = {}) => JSON.stringify({ type, timestamp: at, message: { role: type === 'user' ? 'user' : 'assistant', content }, ...extra });
  it('reads only what the person typed: not the agent, not a tool result, not the harness', () => {
    const t = [
      line('assistant', [{ type: 'text', text: 'done, commit and push' }], '2026-11-16T10:00:00Z'),
      line('user', [{ type: 'tool_result', content: 'done, push it' }], '2026-11-16T10:01:00Z'),
      line('user', 'done, push it', '2026-11-16T10:02:00Z', { isMeta: true }),
    ].join('\n');
    assert.deepEqual(notedFromTranscript(t), {});
    const owner = `${t}\n${line('user', 'it works, done', '2026-11-16T10:03:00Z')}`;
    assert.deepEqual(notedFromTranscript(owner), { commit: Date.parse('2026-11-16T10:03:00Z') });
  });
  it('a later "wait" takes it back, and a slash command counts by its arguments', () => {
    const t = [line('user', 'done', '2026-11-16T10:00:00Z'), line('user', 'wait', '2026-11-16T10:01:00Z')].join('\n');
    assert.deepEqual(notedFromTranscript(t), {});
    const cmd = line('user', '<command-name>/ship</command-name><command-args>push it</command-args>', '2026-11-16T10:05:00Z');
    assert.deepEqual(notedFromTranscript(cmd), { push: Date.parse('2026-11-16T10:05:00Z') });
  });
});
