// The assembled server (src/server/http.ts, server.ts) and its request guards (src/server/httpguards.ts): every guard the guides
// ask for is on every route, tested through a real node:http server on a free port.
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, describe, it } from 'node:test';
import { createApp, matchPath, type Route } from '../../src/server/http';
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
