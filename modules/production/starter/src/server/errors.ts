// Errors that point at the cause. The code says what went wrong where it knows it, with an AppError: a code, the words a person
// reads, what the app was doing and the ids involved, and the error it was handling (`cause`) kept, not swallowed. One place,
// answerError, turns any error into the answer and the log line: the person sees the message and a reference (the request id),
// the log has everything (what it was doing, the ids, the whole cause chain), so the reference leads straight to the line.
//   throw new AppError('date-in-past', 'The race date is in the past.', { doing: 'saving the goal', ids: { goalId } });
//   throw new AppError('store-down', 'Your goal could not be saved. Try again in a minute.', { status: 503, doing: 'saving the goal', cause: err });
//   catch (err) { const a = answerError(err, req); return c.json(a.body, a.status); }   (one handler for the whole server)
// An error that is not an AppError is a fault in the code: a 500 with a plain sentence for the person, the details in the log only.
import type { Fields } from './log';
import type { Request } from './trace';

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly doing?: string;
  readonly ids: Fields;
  // declared here, not taken from Error: a project whose TypeScript library is older than ES2022 (a Vite starter's) has no cause
  declare cause?: unknown;

  constructor(code: string, message: string, o: { status?: number; doing?: string; ids?: Fields; cause?: unknown } = {}) {
    super(message);
    if (o.cause !== undefined) this.cause = o.cause;
    this.name = 'AppError';
    this.code = code;
    this.status = o.status ?? 400;
    this.doing = o.doing;
    this.ids = o.ids ?? {};
  }
}

export type ErrorBody = { error: string; code: string; reference: string };

/** The answer for any error, and its line in the log: a 4xx as a warning, a 5xx (and any fault in the code) as an error. */
export function answerError(err: unknown, req: Pick<Request, 'id' | 'log'>): { status: number; body: ErrorBody } {
  if (err instanceof AppError) {
    const fields = { code: err.code, status: err.status, doing: err.doing, ...err.ids };
    if (err.status >= 500) req.log.error(err.message, err, fields);
    else req.log.warn(err.message, { ...fields, cause: err.cause instanceof Error ? err.cause.message : undefined });
    return { status: err.status, body: { error: err.message, code: err.code, reference: req.id } };
  }
  req.log.error('a fault in the code', err, { code: 'internal' });
  return {
    status: 500,
    body: { error: 'Something went wrong on our side. Tell us this reference and we can find it.', code: 'internal', reference: req.id },
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
