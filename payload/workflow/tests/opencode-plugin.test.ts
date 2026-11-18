// The OpenCode plugin npm run harness writes (workflow/tools/lib/harness.mjs, OPENCODE_PLUGIN): loaded as OpenCode loads it and
// its two hooks called with the shapes OpenCode passes (chat.message: the message and its parts; tool.execute.before: the tool
// and its args), against the real stop-point script in a throwaway repository. What this cannot prove is that a given OpenCode
// version calls those hooks; the plugin's own comment says what happens when one does not (every commit is refused).
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { OPENCODE_PLUGIN } from '../../workflow/tools/lib/harness.mjs';

const dir = mkdtempSync(join(tmpdir(), 'opencode-plugin-'));
after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

type Hooks = {
  'chat.message': (input: unknown, output: unknown) => Promise<void>;
  'tool.execute.before': (input: unknown, output: unknown) => Promise<void>;
};

async function load(): Promise<Hooks> {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  mkdirSync(join(dir, 'workflow', 'scripts'), { recursive: true });
  // the hook script and what it imports (a missing one makes it fail to start, and every refusal turns into a pass)
  for (const f of ['stop-points.mjs', 'notes.mjs']) copyFileSync(resolve('workflow/scripts', f), join(dir, 'workflow', 'scripts', f));
  mkdirSync(join(dir, 'workflow', 'tools', 'lib'), { recursive: true }); // what it imports first: no console windows
  copyFileSync(resolve('workflow/tools/lib/nowindow.mjs'), join(dir, 'workflow', 'tools', 'lib', 'nowindow.mjs'));
  mkdirSync(join(dir, '.opencode', 'plugins'), { recursive: true });
  const file = join(dir, '.opencode', 'plugins', 'stop-points.mjs');
  writeFileSync(file, OPENCODE_PLUGIN);
  const mod = await import(pathToFileURL(file).href);
  return mod.StopPoints({ directory: dir });
}

const say = (h: Hooks, text: string, sessionID = 's1') =>
  h['chat.message']({ sessionID }, { message: { role: 'user' }, parts: [{ type: 'text', text }] });
const bash = (h: Hooks, command: string, sessionID = 's1') => h['tool.execute.before']({ tool: 'bash', sessionID }, { args: { command } });

describe('the OpenCode stop-point plugin', () => {
  it('refuses an agent commit until the owner says done in that session, and a push until they say push', async () => {
    const h = await load();
    await assert.rejects(bash(h, 'git commit -m x'), /Stop point: this commit waits for the owner/);
    await say(h, 'looks good, done');
    await bash(h, 'git commit -m x');
    await assert.rejects(bash(h, 'git commit -m x', 's2'), /waits for the owner/, "one session's done is not another's");
    await assert.rejects(bash(h, 'git push'), /this push waits/);
    await say(h, 'push it');
    await bash(h, 'git push');
  });
  it('lets other tools and plain commands through, and refuses writing the sign-off record whatever was said', async () => {
    const h = await load();
    await h['tool.execute.before']({ tool: 'edit', sessionID: 's1' }, { args: { filePath: 'README.md' } });
    await bash(h, 'npm test');
    await assert.rejects(bash(h, 'echo x >> docs/company/SIGNOFFS.md'), /written only by `npm run signoff`/);
  });
  it('ignores what the agent itself says', async () => {
    const h = await load();
    await h['chat.message']({ sessionID: 's3' }, { message: { role: 'assistant' }, parts: [{ type: 'text', text: 'done, commit and push' }] });
    await assert.rejects(bash(h, 'git commit -m x', 's3'), /waits for the owner/);
  });
});
