// The pattern for a route test: the app started in the test, called in memory, one good call and each refusal
// (workflow/guides/TESTING.md, *Route tests*; workflow/guides/PERMISSIONS.md, *Tests*). Copy it next to your routes' tests as
// <route>.test.ts, start your own app where `start` is, and keep the shape: who asks is set by the sign-in, never by the request;
// another person's or another customer's thing answers "not found", the same as one that does not exist.
// Not run as it is (the .example name keeps it out of the suite): the tiny server below only stands in for your app.
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';
import { can, type Who } from '../../src/core/permissions';

// --- stands in for your app: replace with your server, started on port 0 (any free port) ---
const things = new Map([['t1', { ownerId: 'u1', customerId: 'c1', name: 'Morning ride' }]]);
const people: Record<string, Who> = {
  'token-u1': { id: 'u1', customerId: 'c1', role: 'member' },
  'token-u2': { id: 'u2', customerId: 'c1', role: 'member' },
  'token-x': { id: 'x', customerId: 'c2', role: 'owner' },
};
function start(): Promise<Server> {
  const server = createServer((req, res) => {
    const who = people[(req.headers.authorization ?? '').replace(/^Bearer /, '')] ?? null;
    const id = /^\/things\/([\w-]+)$/.exec(req.url ?? '')?.[1];
    const thing = id ? things.get(id) : undefined;
    const answer = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (!who) return answer(401, { title: 'Sign in first' });
    // not theirs answers exactly like not there: nobody learns what exists
    if (!thing || !can(who, 'read', thing)) return answer(404, { title: 'Not found' });
    return answer(200, { name: thing.name });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}
// --- end of the stand-in ---

describe('GET /things/:id', () => {
  let server: Server | undefined;
  const call = async (path: string, token?: string) => {
    server ??= await start();
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    return { status: res.status, body: await res.json() };
  };
  after(() => server?.close());

  it('gives the owner their thing', async () => {
    assert.deepEqual(await call('/things/t1', 'token-u1'), { status: 200, body: { name: 'Morning ride' } });
  });
  it('asks someone not signed in to sign in', async () => {
    assert.equal((await call('/things/t1')).status, 401);
  });
  it('answers "not found" to another member of the same customer, as for a thing that does not exist', async () => {
    const theirs = await call('/things/t1', 'token-u2');
    const none = await call('/things/nope', 'token-u2');
    assert.deepEqual(theirs, none);
    assert.equal(theirs.status, 404);
  });
  it('answers "not found" to another customer, even its owner', async () => {
    assert.equal((await call('/things/t1', 'token-x')).status, 404);
  });
});
