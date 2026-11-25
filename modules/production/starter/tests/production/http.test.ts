// The assembled server (src/server/http.ts, server.ts) and its request guards (src/server/httpguards.ts): every guard the guides
// ask for is on every route, tested through a real node:http server on a free port.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { callerOf, createApp, matchPath, type Route } from '../../src/server/http';
import { rateLimit, readBody, sameOrigin } from '../../src/server/httpguards';
import { createLogger } from '../../src/server/log';
import { start } from '../../src/server/server';

const quiet = createLogger({ write: () => {} });
const servers: Server[] = [];
after(() => {
  for (const s of servers) s.close();
});
async function serve(routes: Route[], o: Partial<Parameters<typeof createApp>[0]> = {}) {
  const server = createServer(createApp({ routes, log: quiet, ...o }).handle);
  servers.push(server);
  await new Promise<void>((ok) => server.listen(0, ok));
  const a = server.address();
  return `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`;
}

describe('the assembled server', () => {
  it('answers a route with the security headers and a request id, and /health by itself', async () => {
    const url = await serve([{ method: 'GET', path: '/api/goals/:id', handler: (c) => ({ status: 200, body: { id: c.params.id } }) }]);
    const r = await fetch(`${url}/api/goals/42`);
    assert.deepEqual(await r.json(), { id: '42' });
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
    assert.match(r.headers.get('x-request-id') ?? '', /^[0-9a-f]{32}$/);
    assert.equal((await fetch(`${url}/health`)).status, 200);
    assert.equal((await fetch(`${url}/nothing`)).status, 404);
  });
  it('refuses a body over the cap, and data that is not JSON', async () => {
    const url = await serve([{ method: 'POST', path: '/api/x', handler: () => ({ status: 201 }) }], { maxBodyBytes: 100 });
    const big = await fetch(`${url}/api/x`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 'x'.repeat(200) }),
    });
    assert.equal(big.status, 413);
    assert.equal(big.headers.get('content-type'), 'application/problem+json');
    assert.equal((await fetch(`${url}/api/x`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hi' })).status, 415);
  });
  it('refuses a change sent from another site (CSRF), and lets its own pages and other servers through', async () => {
    const url = await serve([{ method: 'POST', path: '/api/x', handler: () => ({ status: 201 }) }], {
      origins: ['https://app.example.org'],
    });
    const post = (headers: Record<string, string>) =>
      fetch(`${url}/api/x`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });
    assert.equal((await post({ origin: 'https://evil.example' })).status, 403);
    assert.equal((await post({ origin: 'https://app.example.org' })).status, 201);
    assert.equal((await post({})).status, 201, 'no origin: not a browser page');
  });
  it('does a retried POST once when it carries an idempotency key', async () => {
    let made = 0;
    const url = await serve([{ method: 'POST', path: '/api/pay', handler: () => ({ status: 201, body: { n: ++made } }) }]);
    const pay = () =>
      fetch(`${url}/api/pay`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'k1' }, body: '{}' });
    assert.deepEqual(await (await pay()).json(), { n: 1 });
    const again = await pay();
    assert.deepEqual(await again.json(), { n: 1 });
    assert.equal(again.headers.get('idempotent-replayed'), 'true');
    assert.equal(made, 1);
  });
  it('a heavy request has its own limit per person, beside the limit for every route', async () => {
    const url = await serve([
      { method: 'POST', path: '/api/plan', perMinute: 2, handler: () => ({ status: 200, body: {} }) },
      { method: 'GET', path: '/api/goals', handler: () => ({ status: 200, body: {} }) },
    ]);
    const post = () => fetch(`${url}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const codes = [(await post()).status, (await post()).status, (await post()).status, (await fetch(`${url}/api/goals`)).status];
    assert.deepEqual(codes, [200, 200, 429, 200], 'the third plan waits; other routes go on');
    const url2 = await serve([{ method: 'POST', path: '/api/plan', perMinute: 1, handler: () => ({ status: 200, body: { route: 1 } }) }]);
    const keyed = (key: string) => fetch(`${url2}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: '{}' });
    assert.deepEqual([(await keyed('k1')).status, (await keyed('k1')).status], [200, 200], 'a retry with the same key gets its answer back');  });
  it('refuses a caller past the rate limit with 429', async () => {
    const url = await serve([{ method: 'GET', path: '/api/x', handler: () => ({ status: 200, body: {} }) }], { requestsPerMinute: 2 });
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await fetch(`${url}/api/x`)).status);
    assert.deepEqual(codes, [200, 200, 429]);
  });
  it('turns a fault in a route into a 500 with a reference, never the error itself', async () => {
    const url = await serve([
      {
        method: 'GET',
        path: '/api/x',
        handler: () => {
          throw new Error('db password wrong');
        },
      },
    ]);
    const r = await fetch(`${url}/api/x`);
    assert.equal(r.status, 500);
    assert.doesNotMatch(await r.text(), /password/);
  });
  it('starts from server.ts on the port in the settings and stops on request', async () => {
    const exits: number[] = [];
    const s = await start({ env: { PORT: '0' }, exit: (c) => exits.push(c), signals: { once: () => undefined } });
    assert.equal((await fetch(`http://127.0.0.1:${s.port}/health`)).status, 200);
    await s.stop();
    assert.deepEqual(exits, [0]);
  });
});

describe('the request guards one by one', () => {
  it('matches a route with its parts', () => {
    assert.deepEqual(matchPath('/api/goals/:id', '/api/goals/7'), { id: '7' });
    assert.equal(matchPath('/api/goals/:id', '/api/goals'), null);
  });
  it('refuses a body larger than its declared length allows before reading it', async () => {
    await assert.rejects(readBody((async function* () {})(), 10, '11'), /most this accepts/);
  });
  it('lets a request that changes nothing through the same-origin check', () => {
    assert.doesNotThrow(() => sameOrigin('GET', { origin: 'https://evil.example' }, []));
    assert.throws(() => sameOrigin('DELETE', { 'sec-fetch-site': 'cross-site' }, []), /did not come from the app/);
  });
  it('counts each caller on their own', () => {
    let t = 0;
    const ok = rateLimit(1, () => t);
    assert.deepEqual([ok('a'), ok('a'), ok('b')], [true, false, true]);
    t = 61_000;
    assert.equal(ok('a'), true, 'a minute later it is open again');
  });
});

describe('what a client cannot fake, and what the server serves', () => {
  const socket = { remoteAddress: '10.0.0.9' } as never;
  it('takes the caller from the proxy it trusts, counted from the right, never the left end the client sent', () => {
    const m = { headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }, socket };
    assert.equal(callerOf(m, 1), '203.0.113.7');
    assert.equal(callerOf(m, 0), '10.0.0.9', 'no proxy trusted: the connection');
    assert.equal(callerOf({ headers: {}, socket }, 1), '10.0.0.9');
  });
  it('runs two requests with the same idempotency key at the same moment once, and refuses the key with another body', async () => {
    let made = 0;
    const url = await serve([
      {
        method: 'POST',
        path: '/api/pay',
        handler: async () => {
          await new Promise((r) => setTimeout(r, 30));
          return { status: 201, body: { n: ++made } };
        },
      },
    ]);
    const pay = (body: string) =>
      fetch(`${url}/api/pay`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'k2' }, body });
    const [a, b] = await Promise.all([pay('{"amount":5}'), pay('{"amount":5}')]);
    assert.deepEqual([await a.json(), await b.json()], [{ n: 1 }, { n: 1 }]);
    assert.equal(made, 1);
    assert.equal((await pay('{"amount":500}')).status, 422);
  });
  it('serves the built pages, index.html for an app path, and never the server bundle or a file outside', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pages-'));
    try {
      mkdirSync(join(dir, 'assets'));
      writeFileSync(join(dir, 'index.html'), '<h1>app</h1>');
      writeFileSync(join(dir, 'assets', 'a.js'), 'console.log(1)');
      writeFileSync(join(dir, 'server.js'), 'secret server code');
      const url = await serve([], { pages: dir });
      assert.match(await (await fetch(`${url}/goals/42`)).text(), /<h1>app/);
      const js = await fetch(`${url}/assets/a.js`);
      assert.match(js.headers.get('cache-control') ?? '', /immutable/);
      assert.equal((await fetch(`${url}/server.js`)).status, 404);
      // a way out of the folder ends inside it: the app's page, never the file beside the folder
      writeFileSync(join(dir, '..', 'pages-secret.txt'), 'secret');
      assert.match(await (await fetch(`${url}/..%2f..%2fetc%2fpasswd`)).text(), /<h1>app/);
      assert.equal((await fetch(`${url}/..%2fpages-secret.txt`)).status, 404);
      rmSync(join(dir, '..', 'pages-secret.txt'), { force: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('with sign-in, refuses a route to no one signed in unless it is public, and gives the route the user', async () => {
    const url = await serve(
      [
        { method: 'GET', path: '/api/me', handler: (c) => ({ status: 200, body: { id: c.user?.id } }) },
        { method: 'GET', path: '/api/open', public: true, handler: () => ({ status: 200, body: {} }) },
      ],
      { signIn: (h) => (h('authorization') === 'Bearer good' ? { id: 'u1' } : null) },
    );
    assert.equal((await fetch(`${url}/api/me`)).status, 401);
    assert.deepEqual(await (await fetch(`${url}/api/me`, { headers: { authorization: 'Bearer good' } })).json(), { id: 'u1' });
    assert.equal((await fetch(`${url}/api/open`)).status, 200);
  });
});

describe('a broken address and a busy office', () => {
  it('answers a broken %-escape in a route path with 400, not a fault', async () => {
    const url = await serve([{ method: 'GET', path: '/api/goals/:id', handler: (c) => ({ status: 200, body: { id: c.params.id } }) }]);
    assert.equal((await fetch(`${url}/api/goals/%E0%A4%A`)).status, 400);
  });
  it('counts page files apart from routes, so a page and its assets do not use up the routes allowance', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pages-'));
    try {
      writeFileSync(join(dir, 'index.html'), '<h1>app</h1>');
      const url = await serve([{ method: 'GET', path: '/api/x', handler: () => ({ status: 200, body: {} }) }], {
        requestsPerMinute: 2,
        pages: dir,
      });
      for (let i = 0; i < 5; i++) assert.equal((await fetch(`${url}/goals`)).status, 200, `page ${i}`);
      assert.deepEqual(
        [(await fetch(`${url}/api/x`)).status, (await fetch(`${url}/api/x`)).status, (await fetch(`${url}/api/x`)).status],
        [200, 200, 429],
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
