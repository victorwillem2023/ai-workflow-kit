// Tests never reach the network (workflow/tools/lib/testnet.mjs, loaded before every test run): another computer, or this
// computer's dev servers, fail the test file and are named; a server the test starts itself is fine.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { refusal } from '../../workflow/tools/lib/testnet.mjs';

// this project's own ports (workflow/config.json), as the preload reads them
const own = existsSync('workflow/config.json') ? JSON.parse(readFileSync('workflow/config.json', 'utf8')).session ?? {} : {};
const MAIN = Number(own.mainPort ?? 8787); const FIRST = Number(own.firstPort ?? 8788);
const preload = pathToFileURL(resolve('workflow/tools/lib/testnet.mjs')).href;
const dirs: string[] = [];
const servers: Server[] = [];
after(() => { for (const s of servers) s.close(); for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** Runs `code` in a child with the preload, in a project whose main folder's dev server is on `mainPort`. */
function child(code: string, mainPort: number) {
  const dir = mkdtempSync(join(tmpdir(), 'testnet-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'workflow'));
  writeFileSync(join(dir, 'workflow', 'config.json'), JSON.stringify({ session: { mainPort, firstPort: mainPort + 1 } }));
  writeFileSync(join(dir, 'probe.mjs'), code);
  const r = spawnSync(process.execPath, ['--import', preload, 'probe.mjs'], { cwd: dir, encoding: 'utf8' });
  return { status: r.status, err: r.stderr };
}
const listening = () => new Promise<number>((ok) => { const s = createServer((q, a) => a.end('ok')); servers.push(s); s.listen(0, '127.0.0.1', () => ok((s.address() as { port: number }).port)); });

describe('tests never reach the network', () => {
  it('refuses another computer and the dev servers, and lets a test\'s own server through', () => {
    assert.match(refusal('api.open-meteo.com', 443) ?? '', /another computer/);
    assert.match(refusal('127.0.0.1', MAIN) ?? '', /the main folder's dev server/);
    assert.match(refusal('localhost', FIRST + 2) ?? '', /a session's dev server/);
    assert.equal(refusal('127.0.0.1', MAIN, new Set([MAIN])), null, 'the test listens there itself');
    assert.equal(refusal('127.0.0.1', 41234), null, 'a server a test started in a child process');
  });
  it('fails the test file that fetched from the main folder\'s running server, naming the address', async () => {
    const port = await listening();
    const r = child(`await fetch('http://127.0.0.1:${port}/help-media/run.mp4').catch(() => {});`, port);
    assert.equal(r.status, 1, r.err);
    assert.match(r.err, new RegExp(`A test reached the network[\\s\\S]*127\\.0\\.0\\.1:${port} \\(the main folder's dev server`));
  });
  it('fails one that reached another computer, before any name is looked up', () => {
    const r = child("await fetch('http://example.invalid/x').catch(() => {});", 1);
    assert.equal(r.status, 1, r.err);
    assert.match(r.err, /example\.invalid:80 \(another computer/);
  });
  it('passes one that talks to the server it started itself', async () => {
    const r = child(`import { createServer } from 'node:http';
const s = createServer((q, a) => a.end('ok')).listen(0, '127.0.0.1');
await new Promise((ok) => s.once('listening', ok));
const text = await (await fetch('http://127.0.0.1:' + s.address().port + '/')).text();
s.close(); if (text !== 'ok') process.exit(2);`, 1);
    assert.equal(r.status, 0, r.err);
  });
});
