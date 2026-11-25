// What the page sends about itself into the log, one line each: in development how a try felt (src/web/feel.ts: each motion with
// its dropped frames, each busy moment, each key action's time), and everywhere the speed real people get (src/web/vitals.ts:
// Google's Core Web Vitals, a poor one as a warning). `node workflow/scripts/logs.mjs <topic> --page` shows them, `--level warn`
// only the busy moments, the poor vitals and the errors. They come from outside, so only the known fields are kept, each capped,
// and at most 50 a call: a page cannot write what it likes into the log (the route's rate limit, http.ts, holds the rest).
// One route for both, in production too (a route wired for development only, as this file once said, loses the vitals):
//   routes.push({ method: 'POST', path: '/api/page-events', public: true, handler: (c) => { logPageEvents(c.body, c.req); return { status: 200, body: {} }; } });
import type { Request } from './trace';

const MAX_EVENTS = 50;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const num = (v: unknown, max = 600_000) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-max, Math.min(max, Math.round(v))) : undefined);

/** Logs the events the page sent; returns how many were logged (anything not an event is left out, never a crash). */
export function logPageEvents(body: unknown, req: Pick<Request, 'log'>): number {
  const list: unknown[] = Array.isArray(body) ? body.slice(0, MAX_EVENTS) : [];
  let logged = 0;
  for (const raw of list) {
    if (raw === null || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    const page = text(e.page, 200);
    if (e.kind === 'motion') {
      req.log.info('page motion', { by: text(e.by, 20), ms: num(e.ms), dx: num(e.dx, 100_000), dy: num(e.dy, 100_000), frames: num(e.frames),
        dropped: num(e.dropped), longest: num(e.longest), page });
    } else if (e.kind === 'busy') {
      req.log.warn('page busy', { ms: num(e.ms), page });
    } else if (e.kind === 'vital') {
      const value = typeof e.value === 'number' && Number.isFinite(e.value) ? Math.round(Math.min(Math.max(e.value, 0), 600_000) * 1000) / 1000 : undefined;
      const rating = text(e.rating, 20);
      const fields = { name: text(e.name, 10), value, rating, page, phone: e.phone === true };
      if (rating === 'poor') req.log.warn('page vital', fields);
      else req.log.info('page vital', fields);
    } else if (e.kind === 'timing') {
      req.log.info('page timing', { name: text(e.name, 100), ms: num(e.ms), page });
    } else continue;
    logged += 1;
  }
  return logged;
}
