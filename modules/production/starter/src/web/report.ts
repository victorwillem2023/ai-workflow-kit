// The page side of finding a problem fast. A failed API call becomes an ApiError with the server's words (a problem details
// body's detail, RFC 9457) and its reference (the request id), and one console line says it all:
// "POST /api/goal 400: The race date is in the past. (reference 4f2a...)". So
// the screen can show the message and the reference, and the reference finds the server's log line. Errors nothing caught on the
// page (a bug in a click handler, a promise nobody waited for) are sent to the server log too, instead of living only in the
// console of whoever saw them.
//   const res = await fetch('/api/goal', { method: 'POST', body });   if (!res.ok) throw await apiError(res, 'POST', '/api/goal');
//   reportPageErrors(window, (r) => navigator.sendBeacon('/api/page-error', JSON.stringify(r)));   (once, at start-up)

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly reference: string | null;

  constructor(message: string, status: number, code: string, reference: string | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.reference = reference;
  }
}

/** The ApiError for a failed answer (the server's { error, code, reference }, or the status when the body is not that), logged in one line. */
export async function apiError(
  res: { status: number; json(): Promise<unknown> },
  method: string,
  path: string,
  log: (line: string) => void = (line) => console.error(line),
): Promise<ApiError> {
  // a problem details body (RFC 9457: detail, title) as src/server/errors.ts sends it; an older { error } body is read too
  let body: { detail?: unknown; title?: unknown; error?: unknown; code?: unknown; reference?: unknown } = {};
  try {
    body = ((await res.json()) ?? {}) as typeof body;
  } catch {
    /* not JSON: the status says enough */
  }
  const words = [body.detail, body.title, body.error].find((v): v is string => typeof v === 'string' && v.length > 0);
  const message = words ?? `The server answered ${res.status}.`;
  const reference = typeof body.reference === 'string' ? body.reference : null;
  log(`${method} ${path} ${res.status}: ${message}${reference ? ` (reference ${reference})` : ''}`);
  return new ApiError(message, res.status, typeof body.code === 'string' ? body.code : 'unknown', reference);
}

export type PageError = { message: string; where: string | null; stack: string[]; page: string };
type ErrorTarget = {
  addEventListener(
    type: 'error' | 'unhandledrejection',
    listener: (e: { error?: unknown; reason?: unknown; message?: string; filename?: string; lineno?: number }) => void,
  ): void;
  location?: { pathname: string };
};

/** Sends every uncaught page error to `send`, each message once per page load and at most `max`, so a loop cannot flood the log. */
export function reportPageErrors(target: ErrorTarget, send: (r: PageError) => void, max = 10): void {
  const seen = new Set<string>();
  const report = (err: unknown, fallback: string, where: string | null) => {
    const message = (err instanceof Error ? err.message : String(err ?? fallback)).slice(0, 500);
    if (seen.has(message) || seen.size >= max) return;
    seen.add(message);
    const stack =
      err instanceof Error
        ? (err.stack ?? '')
            .split('\n')
            .slice(1, 6)
            .map((l) => l.trim())
        : [];
    // the page's path only, never its query: a query can hold what someone typed
    send({ message, where, stack, page: target.location?.pathname ?? '' });
  };
  target.addEventListener('error', (e) => report(e.error, e.message ?? 'an error', e.filename ? `${e.filename}:${e.lineno ?? 0}` : null));
  target.addEventListener('unhandledrejection', (e) => report(e.reason, 'a promise failed', null));
}
