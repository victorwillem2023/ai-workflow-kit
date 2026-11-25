// Every call to an outside service (a route planner, a mail provider, a weather API) with its failure plan: a time limit, retries
// for what is safe to repeat, a fallback when there is one, and the words a person reads when there is none. A service that is
// slow or down then costs a bounded wait and a clear message, never a hung request or a raw error. Each service's plan is written
// once, beside the file that talks to it, and listed in docs/ARCHITECTURE.md, *Outside services* (workflow/guides/COMMON.md,
// *When an outside service fails*); its drill test cuts it off and checks what the person sees.
//   const ROUTER: OutsidePlan = { service: 'router', doing: 'planning the route', timeoutMs: 8000, retries: 1,
//     message: 'The route planner is not answering. Try again in a minute.' };
//   const route = await callOutside(ROUTER, (signal) => fetch(url, { signal }).then(okJson), { log: req.log });
import { AppError } from './errors';

export type OutsidePlan = {
  /** the service's name, in the log and the error code */
  service: string;
  /** what the app was doing, for the log */
  doing: string;
  /** how long one try may take */
  timeoutMs: number;
  /** tries after the first; only for a call that is safe to repeat (a read, or a write with an idempotency key) */
  retries?: number;
  /** the wait before the first retry, doubled each time */
  backoffMs?: number;
  /** what the person gets when every try failed and there is no fallback */
  message: string;
};

/** Thrown when one try ran out of time. */
export class OutsideTimeout extends Error {
  constructor(service: string, ms: number) {
    super(`${service} gave no answer in ${ms} ms`);
    this.name = 'OutsideTimeout';
  }
}

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Calls `fn` under `plan`: each try is aborted at the time limit, a failed try is repeated up to `plan.retries` times, and when
 * all fail the `fallback` answers (logged as a warning), or an AppError with the plan's message (503, the last error as its cause).
 * `fallback` gets the last error; `wait` is for tests.
 */
export async function callOutside<T>(
  plan: OutsidePlan,
  fn: (signal: AbortSignal) => Promise<T>,
  o: { log?: { warn(msg: string, fields?: Record<string, unknown>): void }; fallback?: (err: unknown) => T | Promise<T>; wait?: (ms: number) => Promise<unknown> } = {},
): Promise<T> {
  const wait = o.wait ?? sleep;
  const tries = 1 + Math.max(0, plan.retries ?? 0);
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    if (i > 0) await wait((plan.backoffMs ?? 300) * 2 ** (i - 1));
    const stop = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, fail) => {
      timer = setTimeout(() => {
        // the time limit first, then the abort: the try ends as a timeout, not as whatever the aborted call throws
        fail(new OutsideTimeout(plan.service, plan.timeoutMs));
        stop.abort();
      }, plan.timeoutMs);
    });
    try {
      return await Promise.race([fn(stop.signal), late]);
    } catch (err) {
      last = err;
    } finally {
      clearTimeout(timer);
    }
  }
  if (o.fallback) {
    o.log?.warn('outside fallback', { service: plan.service, doing: plan.doing, tries, why: last instanceof Error ? last.message : String(last) });
    return o.fallback(last);
  }
  throw new AppError(`${plan.service}-down`, plan.message, { status: 503, doing: plan.doing, cause: last });
}

/** For a drill test: a service that is cut off, as it fails in real life ('down': refuses at once; 'hangs': never answers). */
export function cutOff(how: 'down' | 'hangs' = 'down'): (signal: AbortSignal) => Promise<never> {
  return (signal) =>
    how === 'down'
      ? Promise.reject(new Error('connect ECONNREFUSED'))
      : new Promise<never>((_, fail) => signal.addEventListener('abort', () => fail(new Error('aborted'))));
}
