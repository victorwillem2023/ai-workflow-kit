// Fetching a link that came from a user or a third-party page, safely. Use it for EVERY such fetch (fixed providers you chose
// yourself don't need it). What it does that a plain fetch() doesn't:
//   - only http(s); the host's addresses (as DNS gives them now) must all be public (core/netguard.ts), at the first request AND at every redirect
//   - redirects are followed by hand, at most `maxRedirects`, each target checked again
//   - the answer is capped by size while it arrives (content-length is not trusted), and the request has a timeout
//   - only the headers you pass are sent: no cookies, no contact details
// The check and the fetch each look the name up, so a name that changes its answer in between is not caught
// (the same limit as any DNS check); for a stricter guarantee connect to the checked address yourself.
import { lookup as dnsLookup } from 'node:dns/promises';
import { isPrivateAddress } from '../core/netguard';

/** Thrown when a link is refused (not a web address, private address, too many redirects, too big). `status` is 0, or 413 for too big. */
export class RefusedError extends Error {
  constructor(why: string, readonly status = 0) { super(`Refused: ${why}`); this.name = 'RefusedError'; }
}

export type Lookup = (host: string) => Promise<{ address: string; family: number }[]>;
export type Guard = (url: URL) => Promise<void>;

/** A guard that throws unless the URL is a web address on the public internet. */
export function dnsGuard(lookup: Lookup = (h) => dnsLookup(h, { all: true, verbatim: true })): Guard {
  return async (url) => {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new RefusedError('that is not a web address');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (/^[\d.]+$/.test(host) || host.includes(':')) {
      if (isPrivateAddress(host)) throw new RefusedError('that address is not on the public internet');
      return;
    }
    let found: { address: string }[];
    try { found = await lookup(host); } catch { found = []; }
    if (!found.length) throw new RefusedError('that site was not found on the public internet');
    if (found.some((f) => isPrivateAddress(f.address))) throw new RefusedError('that address is not on the public internet');
  };
}

export interface SafeFetchOptions {
  guard?: Guard;
  fetchImpl?: typeof fetch;
  /** biggest answer, bytes (default 13 MB) */
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  /** the only headers sent (a generic User-Agent is added) */
  headers?: Record<string, string>;
}

export interface SafeResponse { status: number; headers: Headers; body: Uint8Array }

const REDIRECTS = [301, 302, 303, 307, 308];

export async function safeFetch(url: string, o: SafeFetchOptions = {}): Promise<SafeResponse> {
  const guard = o.guard ?? dnsGuard();
  const doFetch = o.fetchImpl ?? fetch;
  const max = o.maxBytes ?? 13 * 1024 * 1024;
  const maxRedirects = o.maxRedirects ?? 5;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 20000);
  try {
    let cur: string;
    try { cur = new URL(url).href; } catch { throw new RefusedError('that is not a web address'); }
    for (let hop = 0; hop <= maxRedirects; hop++) {
      await guard(new URL(cur));
      const res = await doFetch(cur, { method: 'GET', redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': 'safe-fetch', ...(o.headers ?? {}) } });
      const loc = res.headers.get('location');
      if (!REDIRECTS.includes(res.status) || !loc) return { status: res.status, headers: res.headers, body: await readCapped(res, max) };
      await res.body?.cancel().catch(() => {});
      try { cur = new URL(loc, cur).href; } catch { throw new RefusedError('a redirect to something that is not a web address'); }
    }
    throw new RefusedError('too many redirects');
  } finally {
    clearTimeout(timer);
  }
}

/** The body, refused as soon as it passes the cap (checked as it arrives, not after it is all in memory). */
async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const tooBig = () => new RefusedError('that file is too big', 413);
  if (Number(res.headers.get('content-length')) > max) { await res.body?.cancel().catch(() => {}); throw tooBig(); }
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { await reader.cancel().catch(() => {}); throw tooBig(); }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  return all;
}
