// Deploying (scripts/deploy.mjs): a real run against a small local server whose "host" is a file, so a good deploy, a broken
// one that is rolled back, and the smoke check are tried end to end without a network.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { healthUrl, versionOf, previous, watchDeploy } from '../../tools/workflow/lib/deploy.mjs';

const script = fileURLToPath(new URL('../../scripts/deploy.mjs', import.meta.url));

describe('deploy, pure parts', () => {
  it('joins the address and the health path with one slash, and reads the version from the answer', () => {
    assert.equal(healthUrl('https://a.example/', '/health'), 'https://a.example/health');
    assert.equal(versionOf('{"ok":true,"version":"abc123"}'), 'abc123');
    assert.equal(versionOf('<html>502</html>'), null);
  });
  it('the version to go back to is the newest deployed one that is not running now', () => {
    assert.equal(previous(['a', 'b', 'c'], 'c'), 'b');
    assert.equal(previous(['a'], 'a'), null);
  });
});

describe('deploy, end to end', () => {
  let dir = '', work = '', server: Server, port = 0;
  const git = (...a: string[]) => execFileSync('git', a, { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  // the "host": whatever version.txt says is what runs; "broken" answers 500
  const live = () => (existsSync(join(dir, 'version.txt')) ? readFileSync(join(dir, 'version.txt'), 'utf8') : '');
  const deploy = (...a: string[]) => new Promise<{ code: number; out: string }>((done) => {
    execFile(process.execPath, [script, ...a], { cwd: work, env: { ...process.env, WORKFLOW_DEPLOY_PAUSE_MS: '50' } }, (err, stdout, stderr) => done({ code: err ? 1 : 0, out: stdout + stderr }));
  });
  const config = (command: string) => {
    const put = (what: string) => `node -e "require('fs').writeFileSync(process.argv[1], process.argv[2])" "${join(dir, 'version.txt').replaceAll('\\', '/')}" ${what}`;
    writeFileSync(join(work, 'workflow.config.json'), JSON.stringify({ deploy: { url: `http://127.0.0.1:${port}`, waitSeconds: 0.3, command: put(command), rollback: put('{version}') } }));
    git('add', '.'); git('commit', '-m', 'config ' + command); git('push', 'origin', 'main');
  };

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'deploy-'));
    execFileSync('git', ['init', '--bare', '-b', 'main', join(dir, 'origin.git')]);
    execFileSync('git', ['clone', join(dir, 'origin.git'), join(dir, 'work')], { stdio: 'ignore' });
    work = join(dir, 'work');
    for (const [k, v] of [['user.name', 't'], ['user.email', 't@example.com'], ['commit.gpgsign', 'false']]) git('config', k, v);
    git('checkout', '-b', 'main');
    server = createServer((_, res) => {
      const v = live();
      res.writeHead(v && v !== 'broken' ? 200 : 500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version: v }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

  it('a good deploy ends with the app answering with the new commit', async () => {
    config('{version}');
    const r = await deploy();
    assert.equal(r.code, 0, r.out);
    assert.equal(live(), git('rev-parse', '--short=12', 'HEAD'));
    assert.match(r.out, /Live: .* runs [0-9a-f]{12}, and stayed healthy through the watch\./);
    assert.match((await deploy('--smoke')).out, /^up: .* runs [0-9a-f]{12}/);
  });
  it('a deploy that does not come up is rolled back to the version that ran before, and says so', async () => {
    const good = live();
    config('broken');
    const r = await deploy();
    assert.equal(r.code, 1);
    assert.match(r.out, /did not come up/);
    assert.match(r.out, new RegExp(`Rolled back: .* runs ${good} again`));
    assert.equal(live(), good);
  });
  it('refuses to deploy uncommitted files', async () => {
    writeFileSync(join(work, 'loose.txt'), 'x');
    const r = await deploy();
    assert.equal(r.code, 1);
    assert.match(r.out, /uncommitted files/);
  });
});

describe('the canary watch after a deploy', () => {
  const answers = (list: (string | null)[]) => { let i = 0; return async () => { const v = list[Math.min(i++, list.length - 1)]; return v ? { status: 200, body: JSON.stringify({ version: v }) } : { status: 503, body: '' }; }; };
  const pause = async () => {};
  it('calls a deploy good when the new version keeps answering through the window, one blip allowed', async () => {
    const w = await watchDeploy(answers(['abc', null, 'abc', 'abc']), 'http://x/health', 'abc', { checks: 4, pause });
    assert.deepEqual([w.ok, w.misses, w.checks], [true, 1, 4]);
  });
  it('fails when the new version stops answering, or the old one comes back', async () => {
    const w = await watchDeploy(answers(['abc', null, 'old', 'abc']), 'http://x/health', 'abc', { checks: 4, pause });
    assert.equal(w.ok, false);
    assert.match(w.why ?? '', /stopped answering 2 times/);
  });
  it('fails at once when the project\'s own error check says errors rose', async () => {
    let n = 0;
    const w = await watchDeploy(answers(['abc']), 'http://x/health', 'abc', { checks: 5, pause, errorsOk: async () => ++n < 2 });
    assert.deepEqual([w.ok, w.checks, w.why], [false, 2, 'the error check failed in the watch window']);
  });
});
