// Multi-agent support: the OpenCode command files, the first opencode.jsonc and AGENTS.md are written from the skills.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { frontMatter, commandFile, shellPatterns, opencodeConfig, agentsMd, DEFAULTS } from '../../tools/workflow/lib/harness.mjs';

const skill = (name: string, description: string, model = '') =>
  `---\nname: ${name}\ndescription: ${description}\n${model ? `model: ${model}\n` : ''}---\n\n# /${name}\n`;

describe('harness: OpenCode commands from the skills', () => {
  it('reads name, description and model from a skill front matter, and empty strings when there is none', () => {
    assert.deepEqual(frontMatter(skill('find', 'Answer a question. Read-only.', 'haiku')), { name: 'find', description: 'Answer a question. Read-only.', model: 'haiku' });
    assert.deepEqual(frontMatter('# no front matter'), { name: '', description: '', model: '' });
  });
  it('a flow skill runs on the paid model with the build agent', () => {
    const f = commandFile('work', skill('work', 'Work on one card.'));
    assert.match(f, /^agent: build$/m);
    assert.match(f, new RegExp(`^model: ${DEFAULTS.model}$`, 'm'));
    assert.match(f, /\.claude\/skills\/work\/SKILL\.md/);
    assert.match(f, /\$ARGUMENTS/);
  });
  it('a skill marked model: haiku runs on the free model and says so', () => {
    const f = commandFile('idea', skill('idea', 'Add a card.', 'haiku'));
    assert.match(f, new RegExp(`^model: ${DEFAULTS.cheapModel}$`, 'm'));
    assert.match(f, /^description: .*\(free model\)$/m);
  });
  it('a read-only skill gets the plan agent and is told to change no file', () => {
    const f = commandFile('check', skill('check', 'Run the checks. Read-only; never fixes.', 'haiku'));
    assert.match(f, /^agent: plan$/m);
    assert.match(f, /Change no file\./);
  });
  it('a skill the kit does not know takes the first clause of its description', () => {
    const f = commandFile('deploy', skill('deploy', 'Deploy the app to the test server (after a green gate): builds and copies.'));
    assert.match(f, /^description: Deploy the app to the test server$/m);
  });
  it('the models come from the config when it names them', () => {
    const f = commandFile('ship', skill('ship', 'Finish it.'), { model: 'anthropic/claude-sonnet' });
    assert.match(f, /^model: anthropic\/claude-sonnet$/m);
    assert.match(f, /security review/);
  });
});

describe('harness: opencode.jsonc and AGENTS.md', () => {
  const settings = { permissions: { allow: ['Bash(git status:*)', 'Bash(node scripts/session.mjs:*)', 'Read(foo)'] } };
  it('turns Claude Code allow rules into OpenCode shell patterns, skipping what is not a shell rule', () => {
    assert.deepEqual(shellPatterns(settings), ['git status*', 'node scripts/session.mjs*']);
    assert.deepEqual(shellPatterns(undefined), []);
  });
  it('writes OpenCode 2 rules: .env and the private folders refused, every other shell command asked', () => {
    const text = opencodeConfig({ project: 'Demo', claudeSettings: settings, private: ['.env', 'data/'] });
    const json = JSON.parse(text.replace(/^\/\/.*$/gm, ''));
    assert.equal(json.permission, undefined, 'no OpenCode 1 permission object');
    assert.equal(json.agent, undefined, 'no OpenCode 1 agent key');
    const last = (action: string, resource: string) =>
      json.permissions.filter((r: { action: string; resource: string }) => r.action === action && r.resource === resource).at(-1)?.effect;
    assert.equal(json.permissions[0].resource, '*');
    assert.equal(last('shell', '*'), 'ask');
    assert.equal(last('shell', 'git status*'), 'allow');
    assert.equal(last('shell', '*.env*'), 'deny');
    assert.equal(last('read', '*.env'), 'deny');
    assert.equal(last('read', '*.env.example'), 'allow');
    for (const action of ['read', 'glob', 'grep', 'edit']) assert.equal(last(action, 'data/*'), 'deny');
    assert.equal(json.agents.build.model, DEFAULTS.model);
    assert.match(text, /^\/\/ OpenCode for Demo/);
    assert.match(text, /\{ "action": "shell", "resource": "\*", "effect": "ask" \}/, 'one rule per line');
  });
  it('AGENTS.md only points at CLAUDE.md and repeats no rule', () => {
    const t = agentsMd('Demo');
    assert.match(t, /^# Demo/);
    assert.match(t, /Read `CLAUDE\.md`/);
    assert.equal(t.trim().split('\n').filter((l) => l.trim()).length, 2, 'a title and the pointer, nothing else');
  });
});
