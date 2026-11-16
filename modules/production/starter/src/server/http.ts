// The assembled server: the production parts wired in one place, so a route is only its own work. Every request gets, in order:
// a request id and a log line (trace.ts), the security headers, the rate limit per caller, the same-origin check on anything
// that changes data, the body cap and JSON parsing, the idempotency key, then the route; any error becomes the problem answer
// (errors.ts). /health and /ready are answered here (shutdown.ts), and src/server/server.ts starts it and stops it gracefully.
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
  SECURITY_HEADERS,
  type Stored,
  sameOrigin,
} from './httpguards';
import type { Logger } from './log';
import { type Check, healthAnswer, readiness, readyAnswer } from './shutdown';
import { type Request, startRequest } from './trace';

/** What a route gets: the request's parts, its parsed JSON body, its id and logger, and who is calling (the address). */
export type Ctx = {
  method: string;
  path: string;
  query: URLSearchParams;
  params: Record<string, string>;
  header: (name: string) => string | undefined;
  body: unknown;
  req: Request;
  caller: string;
};
export type Reply = Stored;
export type Route = { method: string; path: string; handler: (ctx: Ctx) => Promise<Reply> | Reply };

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
  /** behind a load balancer: take the caller from x-forwarded-for (only when the balancer sets it) */
  trustProxy?: boolean;
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

const send = (res: ServerResponse, r: Reply, extra: Record<string, string>) => {
  const json = r.body !== undefined && typeof r.body !== 'string';
  const type = r.status >= 400 && json ? PROBLEM_JSON : json ? 'application/json' : 'text/plain; charset=utf-8';
  res.writeHead(r.status, {
    ...SECURITY_HEADERS,
    'cache-control': 'no-store',
    ...(r.body !== undefined ? { 'content-type': type } : {}),
    ...extra,
    ...r.headers,
  });
  res.end(r.body === undefined ? undefined : json ? JSON.stringify(r.body) : String(r.body));
};

export function createApp(o: AppOptions) {
  const state = readiness();
  const within = rateLimit(o.requestsPerMinute ?? 120, o.now);
  const store = o.idempotency ?? memoryIdempotency(o.now);
  const max = o.maxBodyBytes ?? 100_000;
  const callerOf = (m: IncomingMessage) =>
    (o.trustProxy
      ? String(m.headers['x-forwarded-for'] ?? '')
          .split(',')[0]
          .trim()
      : '') ||
    m.socket.remoteAddress ||
    'unknown';

  /** The answer for one request, every guard in order; throws AppError for a refusal. */
  async function answer(m: IncomingMessage, req: Request): Promise<Reply> {
    const url = new URL(m.url ?? '/', 'http://local');
    const method = (m.method ?? 'GET').toUpperCase();
    if (url.pathname === '/health') return healthAnswer();
    if (url.pathname === '/ready') return readyAnswer(o.checks ?? {}, state);
    const caller = callerOf(m);
    if (!within(caller))
      throw new AppError('too-many', 'That was a lot of requests at once. Wait a minute and try again.', { status: 429 });
    sameOrigin(method, m.headers, [...(o.origins ?? []), `http://${m.headers.host}`, `https://${m.headers.host}`]);
    const route = o.routes.map((r) => ({ r, params: r.method === method ? matchPath(r.path, url.pathname) : null })).find((x) => x.params);
    if (!route?.params) throw new AppError('not-found', 'There is nothing at this address.', { status: 404 });
    const body = changesData(method)
      ? parseJson(await readBody(m, max, m.headers['content-length']), m.headers['content-type'])
      : undefined;
    const key = idempotencyKey(method, url.pathname, caller, m.headers);
    const kept = key ? await store.get(key) : undefined;
    if (kept) return { ...kept, headers: { ...kept.headers, 'idempotent-replayed': 'true' } };
    const header = (n: string) => {
      const v = m.headers[n.toLowerCase()];
      return Array.isArray(v) ? v.join(', ') : v;
    };
    const reply = await route.r.handler({
      method,
      path: url.pathname,
      query: url.searchParams,
      params: route.params,
      header,
      body,
      req,
      caller,
    });
    if (key && reply.status < 500) await store.set(key, reply); // a failure may be tried again; a success or a refusal is kept
    return reply;
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
