// The assembled server: the production parts wired in one place, so a route is only its own work. Every request gets, in order:
// a request id and a log line (trace.ts), the security headers, the rate limit per caller, the same-origin check on anything
// that changes data, who is signed in (when the app has sign-in), the body cap and JSON parsing, the idempotency key, then the
// route; any error becomes the problem answer (errors.ts). /health and /ready are answered here (shutdown.ts), the built pages
// are served from `pages` (pages.ts), and src/server/server.ts starts it and stops it gracefully.
//   const app = createApp({ log, routes: [{ method: 'POST', path: '/api/goals', handler: saveGoal }], origins: ['https://app.example.org'] });
//   createServer(app.handle).listen(8787);
// Framework-free (node:http). With Hono, Fastify or Next.js, keep their router and put the same guards in its middleware.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppError, answerError, PROBLEM_JSON } from './errors';
import {
  changesData,
  type IdempotencyStore,
  idempotencyKey,
  memoryIdempotency,
  parseJson,
  rateLimit,
  readBody,
  requestPrint,
  SECURITY_HEADERS,
  type Stored,
  sameOrigin,
} from './httpguards';
import type { Logger } from './log';
import { servePage } from './pages';
import { type Check, healthAnswer, readiness, readyAnswer } from './shutdown';
import { type Request, startRequest } from './trace';

/** Who is calling, as the app's sign-in says (its own type: an id at least). */
export type User = { id: string; [k: string]: unknown };

/** What a route gets: the request's parts, its parsed JSON body, its id and logger, who is calling (the address) and as whom. */
export type Ctx = {
  method: string;
  path: string;
  query: URLSearchParams;
  params: Record<string, string>;
  header: (name: string) => string | undefined;
  body: unknown;
  req: Request;
  caller: string;
  /** the signed-in user, or null (only a `public` route ever sees null when the app has sign-in) */
  user: User | null;
};
export type Reply = Stored;
/** `public`: anyone may call it, signed in or not; every other route needs a signed-in user when `signIn` is given. */
export type Route = { method: string; path: string; public?: boolean; handler: (ctx: Ctx) => Promise<Reply> | Reply };

export type AppOptions = {
  routes: Route[];
  log: Logger;
  /** the addresses our own pages are served from; the server's own address is always one */
  origins?: string[];
  /** what /ready checks (the database answers...) */
  checks?: Record<string, Check>;
  maxBodyBytes?: number;
  requestsPerMinute?: number;
  idempotency?: IdempotencyStore;
  /** how many proxies in front of the server add to x-forwarded-for (a load balancer: 1); 0 (default): the connection's address */
  trustProxy?: number;
  /** who is calling, from the request's headers (the session cookie, a bearer token): the user, or null when no one is signed in */
  signIn?: (header: (name: string) => string | undefined) => Promise<User | null> | User | null;
  /** the folder of the built pages (Vite's dist/); a GET that is no route gets a file from it */
  pages?: string;
  now?: () => number;
};

/** A route's path with `:name` parts: '/api/goals/:id' matches '/api/goals/42' with { id: '42' }. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/'),
    b = path.split('/');
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

/**
 * Who is calling. Behind `hops` proxies, each appends the address it saw to x-forwarded-for, so the caller is the entry the
 * nearest trusted one added: counted from the right. The left end is whatever the client sent, and never trusted.
 */
export function callerOf(m: Pick<IncomingMessage, 'headers' | 'socket'>, hops = 0): string {
  const forwarded = String(m.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = hops > 0 ? forwarded[forwarded.length - hops] : undefined;
  return seen || m.socket.remoteAddress || 'unknown';
}

const send = (res: ServerResponse, r: Reply, extra: Record<string, string>) => {
  const raw = Buffer.isBuffer(r.body);
  const json = r.body !== undefined && typeof r.body !== 'string' && !raw;
  const type = r.status >= 400 && json ? PROBLEM_JSON : json ? 'application/json' : 'text/plain; charset=utf-8';
  res.writeHead(r.status, {
    ...SECURITY_HEADERS,
    'cache-control': 'no-store',
    ...(r.body !== undefined ? { 'content-type': type } : {}),
    ...extra,
    ...r.headers,
  });
  res.end(r.body === undefined ? undefined : raw ? (r.body as Buffer) : json ? JSON.stringify(r.body) : String(r.body));
};

const headerOf = (m: IncomingMessage) => (n: string) => {
  const v = m.headers[n.toLowerCase()];
  return Array.isArray(v) ? v.join(', ') : v;
};

/**
 * Idempotency: a request with a key is done once. The same key again gets the kept answer; one still running is waited for
 * (two at the same moment do not both run); the same key with another body is refused, never answered with the old one.
 */
function idempotent(store: IdempotencyStore) {
  const running = new Map<string, Promise<Reply>>();
  return async (key: string | null, print: string, run: () => Promise<Reply>): Promise<Reply> => {
    if (!key) return run();
    const busy = running.get(key);
    if (busy) return { ...(await busy), headers: { ...(await busy).headers, 'idempotent-replayed': 'true' } };
    const kept = await store.get(key);
    if (kept && kept.print !== print)
      throw new AppError('idempotency-key-reused', 'This idempotency key was used for a different request. Use a new key.', {
        status: 422,
      });
    if (kept) return { ...kept.answer, headers: { ...kept.answer.headers, 'idempotent-replayed': 'true' } };
    const p = run();
    running.set(key, p);
    try {
      const reply = await p;
      if (reply.status < 500) await store.set(key, { print, answer: reply }); // a failure may be tried again; a success or a refusal is kept
      return reply;
    } finally {
      running.delete(key);
    }
  };
}

export function createApp(o: AppOptions) {
  const state = readiness();
  const within = rateLimit(o.requestsPerMinute ?? 120, o.now);
  const once = idempotent(o.idempotency ?? memoryIdempotency(o.now));
  const max = o.maxBodyBytes ?? 100_000;

  /** The answer for one request, every guard in order; throws AppError for a refusal. */
  async function answer(m: IncomingMessage, req: Request): Promise<Reply> {
    const url = new URL(m.url ?? '/', 'http://local');
    const method = (m.method ?? 'GET').toUpperCase();
    if (url.pathname === '/health') return healthAnswer();
    if (url.pathname === '/ready') return readyAnswer(o.checks ?? {}, state);
    const caller = callerOf(m, o.trustProxy ?? 0);
    if (!within(caller))
      throw new AppError('too-many', 'That was a lot of requests at once. Wait a minute and try again.', { status: 429 });
    sameOrigin(method, m.headers, [...(o.origins ?? []), `http://${m.headers.host}`, `https://${m.headers.host}`]);
    const route = o.routes.map((r) => ({ r, params: r.method === method ? matchPath(r.path, url.pathname) : null })).find((x) => x.params);
    if (!route?.params) {
      const page = o.pages && (method === 'GET' || method === 'HEAD') ? await servePage(o.pages, url.pathname) : null;
      if (page) return page;
      throw new AppError('not-found', 'There is nothing at this address.', { status: 404 });
    }
    const header = headerOf(m);
    const user = o.signIn ? await o.signIn(header) : null;
    if (o.signIn && !user && !route.r.public) throw new AppError('signed-out', 'Sign in to do this.', { status: 401 });
    const raw = changesData(method) ? await readBody(m, max, m.headers['content-length']) : Buffer.alloc(0);
    const body = changesData(method) ? parseJson(raw, m.headers['content-type']) : undefined;
    const key = idempotencyKey(method, url.pathname, user?.id ?? caller, m.headers);
    const params = route.params;
    return once(key, requestPrint(raw), async () =>
      route.r.handler({ method, path: url.pathname, query: url.searchParams, params, header, body, req, caller, user }),
    );
  }

  return {
    state,
    /** The node:http handler: createServer(app.handle). Never throws; every error is an answer and a log line. */
    handle: async (m: IncomingMessage, res: ServerResponse) => {
      const req = startRequest({ header: (n) => [m.headers[n]].flat()[0], method: m.method ?? 'GET', path: m.url ?? '/', log: o.log });
      let reply: Reply;
      try {
        reply = await answer(m, req);
      } catch (err) {
        reply = answerError(err, req);
      }
      send(res, reply, { 'x-request-id': req.id });
      req.done(reply.status);
    },
  };
}
