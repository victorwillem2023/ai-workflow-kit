// How fast the app is for the people using it, on their own phones: Google's Core Web Vitals (how long the main content takes to
// show, how long a tap takes to answer, how much the page jumps), measured by Google's small web-vitals library and sent to our own
// server log (src/server/pageevents.ts), so the numbers of a real iPhone are read beside the slowed phone of the speed check. Only
// the page's path, with what looks like an id in it as ":id", and whether it is a phone go with them: nothing typed, no query. On
// in production too. Once, at start-up:
//   import { onCLS, onINP, onLCP } from 'web-vitals';      (the library: a line in docs/STACK.md, the owner's yes)
//   reportVitals({ onCLS, onINP, onLCP }, window, (events) => void fetch('/api/page-events', { method: 'POST', keepalive: true,
//     headers: { 'content-type': 'application/json' }, body: JSON.stringify(events) }));

export type VitalEvent = { kind: 'vital'; name: string; value: number; rating: string; page: string; phone: boolean };
type Metric = { name: string; value: number; rating: string };
type OnMetric = (cb: (m: Metric) => void) => void;

type VitalWindow = {
  addEventListener(type: string, fn: () => void): void;
  document: { visibilityState: string };
  location: { pathname: string };
  matchMedia?(query: string): { matches: boolean };
};

/** The path with every part that looks like an id or a token (digits in a long part, or a very long one) as ":id". */
export function pageOf(path: string): string {
  return path
    .split('/')
    .map((s) => (/^\d+$/.test(s) || (s.length >= 6 && /\d/.test(s)) || s.length > 24 ? ':id' : s))
    .join('/')
    .slice(0, 200);
}

/**
 * Sends each vital once it is final (the library reports most when the page is left), in one batch when the page is hidden or
 * left, at most `max` a page load.
 */
export function reportVitals(on: { onLCP: OnMetric; onINP: OnMetric; onCLS: OnMetric }, win: VitalWindow, send: (events: VitalEvent[]) => void, max = 20): { flush(): void } {
  const queue: VitalEvent[] = [];
  let seen = 0;
  const phone = win.matchMedia?.('(pointer: coarse)').matches ?? false;
  const add = (m: Metric) => {
    if (seen >= max) return;
    seen += 1;
    // the path only, never the query: a query can hold what someone typed
    queue.push({ kind: 'vital', name: m.name, value: m.value, rating: m.rating, page: pageOf(win.location.pathname), phone });
  };
  const flush = () => {
    if (queue.length) send(queue.splice(0, queue.length));
  };
  on.onLCP(add);
  on.onINP(add);
  on.onCLS(add);
  win.addEventListener('visibilitychange', () => {
    if (win.document.visibilityState === 'hidden') flush();
  });
  win.addEventListener('pagehide', flush);
  return { flush };
}
