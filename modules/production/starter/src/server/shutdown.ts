// Health, readiness and stopping without cutting anyone off: the app's half of a deploy with no downtime.
// - GET /health: "the process is alive", with the version it runs (a deploy waits for the new version here). Always fast.
// - GET /ready: "it can serve now": every check (the database answers...) passes in time, and it is not stopping. A load
//   balancer or the host only sends traffic to a ready app.
// - On SIGTERM (a deploy, a restart) the app is no longer ready, waits a moment so no new requests are sent to it, stops
//   taking connections, lets open requests finish (up to a limit), closes what it holds (the database) and exits.
// Framework-free: wire healthAnswer() and readyAnswer() into the router, and gracefulStop() around the server.

export type Answer = { status: number; body: { ok: boolean; version?: string; failing?: string[]; stopping?: boolean } };
export type Check = () => Promise<boolean> | boolean;

const CHECK_MS = 2_000; // a check slower than this counts as failing: /ready must answer quickly

export function healthAnswer(version: string = process.env.APP_VERSION ?? 'dev'): Answer {
  return { status: 200, body: { ok: true, version } };
}

/** Whether the app takes traffic: false from the moment it starts stopping. */
export function readiness() {
  let stopping = false;
  return {
    stopping: () => stopping,
    stop: () => {
      stopping = true;
    },
  };
}

async function passes(check: Check, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<boolean>((done) => {
    timer = setTimeout(() => done(false), ms);
  });
  try {
    return await Promise.race([
      Promise.resolve()
        .then(check)
        .catch(() => false),
      late,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** 200 when every check passes in time and the app is not stopping, else 503 with the names that failed. */
export async function readyAnswer(checks: Record<string, Check>, state: { stopping: () => boolean }, ms = CHECK_MS): Promise<Answer> {
  if (state.stopping()) return { status: 503, body: { ok: false, stopping: true } };
  const names = Object.keys(checks);
  const results = await Promise.all(names.map((n) => passes(checks[n], ms)));
  const failing = names.filter((_, i) => !results[i]);
  return failing.length ? { status: 503, body: { ok: false, failing } } : { status: 200, body: { ok: true } };
}

type Closable = { close(done: (err?: Error) => void): unknown; closeIdleConnections?: () => void; closeAllConnections?: () => void };

/**
 * Stops the app on SIGTERM or SIGINT without cutting off open requests. Returns stop(), which does the same (for tests, or a
 * fatal error). `settleMs`: how long it stays up after saying it is not ready, so the host stops sending requests;
 * `drainMs`: how long open requests may take before they are cut.
 */
export function gracefulStop(o: {
  server: Closable;
  state: { stop: () => void };
  close?: (() => Promise<void> | void)[];
  settleMs?: number;
  drainMs?: number;
  log?: (msg: string) => void;
  exit?: (code: number) => void;
  signals?: { once(event: string, fn: () => void): unknown };
}): () => Promise<void> {
  const settle = o.settleMs ?? 2_000;
  const drain = o.drainMs ?? 10_000;
  const log = o.log ?? (() => {});
  const exit = o.exit ?? ((code: number) => process.exit(code));
  let running: Promise<void> | undefined;
  const stop = () => {
    running ??= (async () => {
      o.state.stop();
      log(`stopping: not ready any more, waiting ${settle} ms for traffic to move`);
      await new Promise((r) => setTimeout(r, settle));
      const closed = new Promise<void>((done) => {
        o.server.close(() => done());
        o.server.closeIdleConnections?.();
      });
      const cut = new Promise<'cut'>((done) => setTimeout(() => done('cut'), drain));
      if ((await Promise.race([closed, cut])) === 'cut') {
        log(`stopping: requests still open after ${drain} ms, cutting them`);
        o.server.closeAllConnections?.();
      }
      let code = 0;
      for (const fn of o.close ?? []) {
        try {
          await fn();
        } catch (err) {
          code = 1;
          log(`stopping: closing failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      log('stopped');
      exit(code);
    })();
    return running;
  };
  const signals = o.signals ?? process;
  for (const s of ['SIGTERM', 'SIGINT'])
    signals.once(s, () => {
      void stop();
    });
  return stop;
}
