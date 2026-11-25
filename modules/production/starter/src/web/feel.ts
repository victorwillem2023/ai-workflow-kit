// How the app feels while it is built: in development the page tells the session's log what a person did and what it cost, so
// the agent reads the log after every try instead of asking how it felt. One event per motion (a finger on the screen or a
// scroll: how long, how far, the frames drawn, the ones dropped, the longest), one for each moment the page was busy (its
// heartbeat came late), and one for each key action timed with performance.measure, by its name. Errors: reportPageErrors
// (report.ts); the speed real people get: vitals.ts. Only in development: the events go to the dev server, never to a real
// person's log (workflow/guides/SCREENS.md, *Feel*). Once, at start-up:
//   if (import.meta.env.DEV) watchFeel(window, (events) => void fetch('/api/page-events', { method: 'POST', keepalive: true,
//     headers: { 'content-type': 'application/json' }, body: JSON.stringify(events) }));
//   performance.mark('plan'); ... performance.measure('plan made', 'plan');        a key action, in the log as "plan made"

export type FeelEvent =
  | { kind: 'motion'; by: string; ms: number; dx: number; dy: number; frames: number; dropped: number; longest: number; page: string }
  | { kind: 'busy'; ms: number; page: string }
  | { kind: 'timing'; name: string; ms: number; page: string };

// a pointer event, or a scroll as where the scrolled element now is (watchFeel reads it from the event's target)
type Pointer = { clientX?: number; clientY?: number; pointerType?: string; target?: unknown; scrollX?: number; scrollY?: number };

/** What the watcher needs from the page; watchFeel builds it from `window`, a test from a clock of its own. */
export type FeelEnv = {
  now(): number;
  frame(fn: (t: number) => void): void;
  every(fn: () => void, ms: number): void;
  listen(type: string, fn: (e: Pointer) => void): void;
  measures?(fn: (name: string, ms: number) => void): void;
  hidden(): boolean;
  page(): string;
};

const FRAME_MS = 1000 / 60;
const QUIET_MS = 300; // a motion ends this long after the last touch or scroll
const HELD_MS = 5000; // and this long after it, finger down or not: a press whose release never came (let go outside the window)
const BEAT_MS = 100; // the heartbeat
const SEND_MS = 2000; // how often what was seen is sent
const BATCH = 50; // events per send, as many as the server takes in one call

/** Watches `env` and hands what it saw to `send` in batches; `busyMs`: a heartbeat this late is a busy moment; `max`: events per page load. */
export function startFeel(env: FeelEnv, send: (events: FeelEvent[]) => void, o: { busyMs?: number; max?: number } = {}): { flush(): void } {
  const busyMs = o.busyMs ?? 100;
  const max = o.max ?? 500;
  const queue: FeelEvent[] = [];
  let seen = 0;
  const emit = (e: FeelEvent) => {
    if (seen >= max) return;
    seen += 1;
    queue.push(e);
  };
  const flush = () => {
    while (queue.length) send(queue.splice(0, BATCH));
  };

  // `down`: a finger is on the screen, so the motion goes on however still it holds
  // the finger's start and end (x, y) and the scroll's (sx, sy): a swipe the browser takes over as its own scroll goes on there
  type Motion = { by: string; start: number; last: number; down: boolean; x0: number; y0: number; x: number; y: number; sx0?: number; sy0?: number; sx?: number; sy?: number; frames: number[] };
  let m: Motion | null = null;
  const end = () => {
    if (!m) return;
    const f = m.frames;
    const gaps = f.slice(1).map((t, i) => t - (f[i] ?? t));
    const dropped = gaps.reduce((n, g) => n + Math.max(0, Math.round(g / FRAME_MS) - 1), 0);
    // content that scrolls right moved the way a finger going left does
    const dx = m.x - m.x0 - ((m.sx ?? 0) - (m.sx0 ?? 0));
    const dy = m.y - m.y0 - ((m.sy ?? 0) - (m.sy0 ?? 0));
    emit({ kind: 'motion', by: m.by, ms: Math.round(m.last - m.start), dx: Math.round(dx), dy: Math.round(dy),
      frames: gaps.length, dropped, longest: Math.round(Math.max(0, ...gaps)), page: env.page() });
    m = null;
  };
  // each motion has its own chain of frames: a frame an ended motion still waits for never counts in the next one
  const tick = (mine: Motion) => (t: number) => {
    if (m !== mine) return;
    mine.frames.push(t);
    const idle = env.now() - mine.last;
    if ((!mine.down && idle > QUIET_MS) || idle > HELD_MS) end();
    else env.frame(tick(mine));
  };
  const touch = (by: string, e: Pointer, begin: boolean, down?: boolean) => {
    const now = env.now();
    if (!m) {
      if (!begin) return;
      const x = e.clientX ?? 0;
      const y = e.clientY ?? 0;
      m = { by, start: now, last: now, down: down ?? false, x0: x, y0: y, x, y, frames: [] };
      env.frame(tick(m));
    }
    m.last = now;
    if (down !== undefined) m.down = down;
    if (e.clientX !== undefined) m.x = e.clientX;
    if (e.clientY !== undefined) m.y = e.clientY;
    if (e.scrollX !== undefined && e.scrollY !== undefined) {
      m.sx0 ??= e.scrollX;
      m.sy0 ??= e.scrollY;
      m.sx = e.scrollX;
      m.sy = e.scrollY;
    }
  };
  env.listen('pointerdown', (e) => touch(e.pointerType || 'pointer', e, true, true));
  env.listen('pointermove', (e) => touch('', e, false));
  env.listen('pointerup', (e) => touch('', e, false, false));
  env.listen('pointercancel', (e) => touch('', e, false, false));
  env.listen('scroll', (e) => touch('scroll', e, true));

  let beat = env.now();
  env.every(() => {
    const now = env.now();
    const late = now - beat - BEAT_MS;
    beat = now;
    if (!env.hidden() && late > busyMs) emit({ kind: 'busy', ms: Math.round(late), page: env.page() });
  }, BEAT_MS);
  env.every(flush, SEND_MS);
  env.measures?.((name, ms) => emit({ kind: 'timing', name: name.slice(0, 100), ms: Math.round(ms), page: env.page() }));
  const away = () => {
    end();
    flush();
  };
  env.listen('pagehide', away);
  env.listen('visibilitychange', () => {
    if (env.hidden()) away();
    // a hidden tab's timers run late on purpose: the heartbeat counts again from the moment it shows
    else beat = env.now();
  });
  return { flush };
}

type PerfList = { getEntries(): { name: string; duration: number }[] };
type FeelWindow = {
  performance: { now(): number };
  requestAnimationFrame(fn: (t: number) => void): unknown;
  setInterval(fn: () => void, ms: number): unknown;
  addEventListener(type: string, fn: (e: Pointer) => void, opts?: { capture?: boolean; passive?: boolean }): void;
  document: { visibilityState: string };
  location: { pathname: string };
  scrollX?: number;
  scrollY?: number;
  PerformanceObserver?: new (cb: (list: PerfList) => void) => { observe(o: { type: string }): void };
};

/** Where a scroll left its element: a list's own scroll, or the page's when the page itself scrolled. */
function scrollOf(win: FeelWindow, e: Pointer): Pointer {
  const t = e.target as { scrollLeft?: unknown; scrollTop?: unknown } | null | undefined;
  if (t && typeof t.scrollLeft === 'number' && typeof t.scrollTop === 'number') return { scrollX: t.scrollLeft, scrollY: t.scrollTop };
  return { scrollX: win.scrollX ?? 0, scrollY: win.scrollY ?? 0 };
}

/** startFeel on the real page. The page's path only, never its query: a query can hold what someone typed. */
export function watchFeel(win: FeelWindow, send: (events: FeelEvent[]) => void, o: { busyMs?: number; max?: number } = {}): { flush(): void } {
  return startFeel(
    {
      now: () => win.performance.now(),
      frame: (fn) => void win.requestAnimationFrame(fn),
      every: (fn, ms) => void win.setInterval(fn, ms),
      // capture, so a scroll inside a list counts too; passive, so listening never holds up the scroll itself
      listen: (type, fn) => win.addEventListener(type, (e) => fn(type === 'scroll' ? scrollOf(win, e) : e), { capture: true, passive: true }),
      measures: (fn) => {
        const Observer = win.PerformanceObserver;
        if (!Observer) return;
        try {
          new Observer((list) => {
            for (const e of list.getEntries()) fn(e.name, e.duration);
          }).observe({ type: 'measure' });
        } catch {
          /* an old browser: no timings */
        }
      },
      hidden: () => win.document.visibilityState === 'hidden',
      page: () => win.location.pathname,
    },
    send,
    o,
  );
}
