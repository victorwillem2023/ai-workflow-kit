// The page's own events (src/web/feel.ts) into the session's log, in development only: one line each, so
// `node workflow/scripts/logs.mjs <topic> --page` shows how a try felt (each motion with its dropped frames, each busy moment,
// each key action's time), and `--level warn` only the busy moments and the errors. They come from outside, so only the known
// fields are kept, each capped, and at most 50 a call: a page cannot write what it likes into the log. Wired in development only:
//   if (process.env.NODE_ENV !== 'production') routes.push({ method: 'POST', path: '/api/page-events', public: true,
//     handler: (c) => { logPageEvents(c.body, c.req); return { status: 200, body: {} }; } });
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
    } else if (e.kind === 'timing') {
      req.log.info('page timing', { name: text(e.name, 100), ms: num(e.ms), page });
    } else continue;
    logged += 1;
  }
  return logged;
}
