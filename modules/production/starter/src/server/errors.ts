// Errors that point at the cause. The code says what went wrong where it knows it, with an AppError: a code, the words a person
// reads, what the app was doing and the ids involved, and the error it was handling (`cause`) kept, not swallowed. One place,
// answerError, turns any error into the answer and the log line. The answer is a problem details body (RFC 9457,
// https://www.rfc-editor.org/rfc/rfc9457): { type, title, status, detail } plus `code` and `reference` (the request id), sent as
// application/problem+json. The log has everything: what it was doing, the ids, and the whole cause chain (`causes`), so the
// reference a person reads leads straight to the line.
//   throw new AppError('date-in-past', 'The race date is in the past.', { doing: 'saving the goal', ids: { goalId } });
//   throw new AppError('store-down', 'Your goal could not be saved. Try again in a minute.', { status: 503, doing: 'saving the goal', cause: err });
//   catch (err) { const p = answerError(err, req); return c.body(JSON.stringify(p.body), p.status, { 'content-type': PROBLEM_JSON }); }
// An error that is not an AppError is a fault in the code: a 500 with a plain sentence for the person, the details in the log only.
import type { Fields } from './log';
import type { Request } from './trace';

export const PROBLEM_JSON = 'application/problem+json';

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly title?: string;
  readonly doing?: string;
  readonly ids: Fields;
  // declared here, not taken from Error: a project whose TypeScript library is older than ES2022 (a Vite starter's) has no cause
  declare cause?: unknown;

  constructor(code: string, message: string, o: { status?: number; title?: string; doing?: string; ids?: Fields; cause?: unknown } = {}) {
    super(message);
    if (o.cause !== undefined) this.cause = o.cause;
    this.name = 'AppError';
    this.code = code;
    this.status = o.status ?? 400;
    this.title = o.title;
    this.doing = o.doing;
    this.ids = o.ids ?? {};
  }
}

/** The answer's body: RFC 9457 problem details, with the error's code and the request's id as `reference`. */
export type Problem = { type: string; title: string; status: number; detail: string; code: string; reference: string };

/** What caused an error, and what caused that, up to three deep: kind, code and message of each (where it happened is in the stack). */
function causeChain(err: unknown): Fields[] {
  const out: Fields[] = [];
  for (let e = err, i = 0; e !== undefined && e !== null && i < 3; i++) {
    const { name, message, code, cause } = e as { name?: unknown; message?: unknown; code?: unknown; cause?: unknown };
    out.push({
      kind: typeof name === 'string' ? name : typeof e,
      message: typeof message === 'string' ? message : String(e),
      ...(code !== undefined ? { code } : {}),
    });
    e = cause;
  }
  return out;
}

/** The answer for any error, and its line in the log: a 4xx as a warning, a 5xx (and any fault in the code) as an error. */
export function answerError(err: unknown, req: Pick<Request, 'id' | 'log'>): { status: number; body: Problem } {
  if (err instanceof AppError) {
    const fields = {
      code: err.code,
      status: err.status,
      doing: err.doing,
      ...err.ids,
      ...(err.cause !== undefined ? { causes: causeChain(err.cause) } : {}),
    };
    if (err.status >= 500) req.log.error(err.message, err, fields);
    else req.log.warn(err.message, fields);
    const title = err.title ?? (err.status >= 500 ? 'It could not be done right now' : 'It could not be done');
    return {
      status: err.status,
      body: { type: 'about:blank', title, status: err.status, detail: err.message, code: err.code, reference: req.id },
    };
  }
  req.log.error('a fault in the code', err, { code: 'internal', causes: causeChain((err as { cause?: unknown } | null)?.cause) });
  return {
    status: 500,
    body: {
      type: 'about:blank',
      title: 'Something went wrong on our side',
      status: 500,
      detail: 'Tell us this reference and we can find it.',
      code: 'internal',
      reference: req.id,
    },
  };
}

/**
 * A page error the page sent (src/web/report.ts) into the log as a warning. It comes from outside, so only its known fields are
 * kept, each capped: a page cannot write what it likes into the log.
 */
export function logPageError(body: unknown, req: Pick<Request, 'log'>): void {
  const b = (body !== null && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  req.log.warn('page error', {
    message: text(b.message, 500),
    where: text(b.where, 300),
    page: text(b.page, 200),
    stack: Array.isArray(b.stack) ? b.stack.slice(0, 5).map((l) => text(l, 300)) : undefined,
  });
}
