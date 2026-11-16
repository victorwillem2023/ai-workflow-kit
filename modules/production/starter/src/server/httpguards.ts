// The guards every request passes before a route sees it (docs/PRODUCTION.md and workflow/guides/SECURITY.md ask for each):
// security headers on every answer, a cap on the body, a rate limit per caller, a same-origin check on anything that changes
// data (the CSRF guard), and idempotency keys so a retried POST does its work once. Framework-free and pure apart from the
// clock, so each is tested on its own; src/server/http.ts puts them in order.

import type { IncomingHttpHeaders } from 'node:http';
import { AppError } from './errors';

/** Sent with every answer: no sniffing, no framing, no referrer leak, HTTPS only, and a strict default content policy. */
export const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const changesData = (method: string) => UNSAFE.has(method.toUpperCase());

/** Reads the body up to `max` bytes; past it the request is refused with 413 before the rest is read. */
export async function readBody(chunks: AsyncIterable<Buffer | string>, max: number, declared?: string): Promise<Buffer> {
  if (declared && Number(declared) > max) throw tooLarge(max);
  const parts: Buffer[] = [];
  let size = 0;
  for await (const c of chunks) {
    const b = typeof c === 'string' ? Buffer.from(c) : c;
    size += b.length;
    if (size > max) throw tooLarge(max);
    parts.push(b);
  }
  return Buffer.concat(parts);
}
const tooLarge = (max: number) =>
  new AppError('too-large', `That is more than ${Math.round(max / 1024)} KB, which is the most this accepts.`, { status: 413 });

/** The body as JSON, or a 400 that says so; an empty body is undefined. */
export function parseJson(body: Buffer, type: string | undefined): unknown {
  if (!body.length) return undefined;
  if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(type ?? ''))
    throw new AppError('not-json', 'Send the data as JSON (content-type: application/json).', { status: 415 });
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new AppError('bad-json', 'The data is not valid JSON.', { status: 400 });
  }
}

/**
 * The CSRF guard: a request that changes data from a browser must come from one of our own origins. A browser always says
 * where a cross-site request comes from (`origin`, or `sec-fetch-site`); a request with neither is not from a browser page
 * (a script, another server) and carries no one's cookies by accident, so it passes here and is checked by sign-in instead.
 */
export function sameOrigin(method: string, headers: IncomingHttpHeaders, origins: string[]): void {
  if (!changesData(method)) return;
  const origin = headers.origin;
  const site = headers['sec-fetch-site'];
  const ours = (o: string) => origins.some((a) => a.replace(/\/$/, '').toLowerCase() === o.replace(/\/$/, '').toLowerCase());
  if (typeof origin === 'string' && origin !== 'null' ? ours(origin) : site !== 'cross-site') return;
  throw new AppError('cross-site', 'This request did not come from the app itself, so it was not carried out.', { status: 403 });
}

/** A rate limit per caller: at most `perMinute` requests in any minute. True when this one is within it (and counts it). */
export function rateLimit(perMinute: number, now: () => number = Date.now) {
  const seen = new Map<string, number[]>();
  return (who: string): boolean => {
    const t = now();
    const recent = (seen.get(who) ?? []).filter((x) => t - x < 60_000);
    if (seen.size > 50_000) seen.clear(); // a flood of new callers cannot grow the memory without end
    if (recent.length >= perMinute) {
      seen.set(who, recent);
      return false;
    }
    recent.push(t);
    seen.set(who, recent);
    return true;
  };
}

export type Stored = { status: number; body?: unknown; headers?: Record<string, string> };
/** Where answers to idempotent requests are kept: memory for one server; a table (the same two functions) for several. */
export interface IdempotencyStore {
  get(key: string): Promise<Stored | undefined>;
  set(key: string, answer: Stored): Promise<void>;
}

/** Answers kept in memory for a day (one server; they are lost on a restart, which only means a retry does the work again). */
export function memoryIdempotency(now: () => number = Date.now, keepMs = 24 * 60 * 60 * 1000): IdempotencyStore {
  const m = new Map<string, { at: number; answer: Stored }>();
  return {
    get: async (k) => {
      const hit = m.get(k);
      if (hit && now() - hit.at < keepMs) return hit.answer;
      m.delete(k);
      return undefined;
    },
    set: async (k, answer) => {
      if (m.size > 100_000) m.clear();
      m.set(k, { at: now(), answer });
    },
  };
}

/** The key an idempotent request is kept under (the caller, the route and their key), or null when it sent none. */
export function idempotencyKey(method: string, path: string, who: string, headers: IncomingHttpHeaders): string | null {
  const key = headers['idempotency-key'];
  if (!changesData(method) || typeof key !== 'string' || !key) return null;
  if (key.length > 200)
    throw new AppError('bad-idempotency-key', 'The idempotency key is too long (200 characters at most).', { status: 400 });
  return `${who} ${method.toUpperCase()} ${path} ${key}`;
}
