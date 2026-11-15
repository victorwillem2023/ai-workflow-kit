// One id per request, on every log line it causes, in its answer and in every call it makes, so a problem is found by one id
// instead of retraced step by step. The id is the W3C trace id (`traceparent`, https://www.w3.org/TR/trace-context/): a request
// that brings one (the page, another service) keeps it, so its whole path shares the id; one without gets a new one. Works with
// any server: call startRequest when a request comes in and done() when it is answered.
//   const req = startRequest({ header: (n) => c.req.header(n), method: c.req.method, path: c.req.path, log });
//   req.log.info('goal saved', { userId });  ...  req.done(200);   (and the header `x-request-id: req.id` on the answer)
//   fetch(url, { headers: { ...req.outbound() } })   the next service sees the same trace id
// The line done() writes: "GET /api/goal 200 12 ms", with the id, as info (a 4xx as warn, a 5xx as error).
import { randomBytes } from 'node:crypto';
import type { Logger } from './log';

export type Request = {
  /** the trace id: what the answer's x-request-id header and an error's "reference" show */
  id: string;
  /** a logger that adds the id, the method and the path to every line */
  log: Logger;
  /** the headers a call to another service sends, so it joins the same trace */
  outbound(): { traceparent: string };
  /** one line for the answer: method, path, status and how long it took */
  done(status: number): void;
};

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const hex = (bytes: number) => randomBytes(bytes).toString('hex');

/** The trace id and the caller's span from a traceparent header, or null when there is none or it is not one (never trusted further). */
export function parseTraceparent(value: string | null | undefined): { traceId: string; parentId: string } | null {
  const m = TRACEPARENT.exec(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  );
  // all zeros is invalid by the spec
  if (!m || /^0+$/.test(m[1]) || /^0+$/.test(m[2])) return null;
  return { traceId: m[1], parentId: m[2] };
}

export function startRequest(o: {
  header: (name: string) => string | null | undefined;
  method: string;
  path: string;
  log: Logger;
  now?: () => number;
}): Request {
  const now = o.now ?? (() => performance.now());
  const t0 = now();
  const id = parseTraceparent(o.header('traceparent'))?.traceId ?? hex(16);
  // the path only, never the query: a query can hold what someone typed
  const path = o.path.split('?')[0].slice(0, 200);
  const log = o.log.child({ requestId: id, method: o.method, path });
  return {
    id,
    log,
    outbound: () => ({ traceparent: `00-${id}-${hex(8)}-01` }),
    done: (status) => {
      const ms = Math.round(now() - t0);
      const line = `${o.method} ${path} ${status} ${ms} ms`;
      if (status >= 500) log.error(line, undefined, { status, ms });
      else if (status >= 400) log.warn(line, { status, ms });
      else log.info(line, { status, ms });
    },
  };
}
