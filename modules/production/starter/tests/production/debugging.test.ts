// Finding a problem fast: one id per request on every log line, in the answer and in outbound calls (src/server/trace.ts); errors
// that say what went wrong, what the app was doing and why, with a reference the log can be searched by (src/server/errors.ts);
// and the page's failed calls and uncaught errors told plainly (src/web/report.ts).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError, answerError, logPageError, PROBLEM_JSON } from '../../src/server/errors';
import { createLogger } from '../../src/server/log';
import { parseTraceparent, startRequest } from '../../src/server/trace';
import { ApiError, apiError, reportPageErrors } from '../../src/web/report';

const capture = () => {
  const lines: Record<string, unknown>[] = [];
  return {
    lines,
    log: createLogger({ level: 'debug', write: (l) => lines.push(JSON.parse(l)), now: () => new Date('2026-11-15T10:00:00Z') }),
  };
};
const header = (h: Record<string, string>) => (name: string) => h[name] ?? null;
const TRACE = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

describe('one id per request', () => {
  it('keeps the trace id a request brings, and makes one when it brings none or a broken one', () => {
    assert.deepEqual(parseTraceparent(TRACE), { traceId: '4bf92f3577b34da6a3ce929d0e0e4736', parentId: '00f067aa0ba902b7' });
    for (const bad of [
      null,
      '',
      'nonsense',
      '00-00000000000000000000000000000000-00f067aa0ba902b7-01',
      '00-4bf92f35-00f067aa0ba902b7-01',
    ]) {
      assert.equal(parseTraceparent(bad), null, String(bad));
    }
    const { log } = capture();
    assert.equal(
      startRequest({ header: header({ traceparent: TRACE }), method: 'GET', path: '/', log }).id,
      '4bf92f3577b34da6a3ce929d0e0e4736',
    );
    assert.match(startRequest({ header: header({}), method: 'GET', path: '/', log }).id, /^[0-9a-f]{32}$/);
  });

  it('puts the id, method and path on every line, writes one line per answer, and passes the trace on', () => {
    const { lines, log } = capture();
    let t = 0;
    const req = startRequest({ header: header({ traceparent: TRACE }), method: 'POST', path: '/api/goal?email=a@b.c', log, now: () => t });
    req.log.info('goal saved', { goalId: 7 });
    t = 12;
    req.done(201);
    assert.deepEqual(
      lines.map((l) => [l.level, l.msg, l.requestId, l.path]),
      [
        ['info', 'goal saved', '4bf92f3577b34da6a3ce929d0e0e4736', '/api/goal'],
        ['info', 'POST /api/goal 201 12 ms', '4bf92f3577b34da6a3ce929d0e0e4736', '/api/goal'],
      ],
      'the query (what someone typed) is never in the log',
    );
    assert.match(
      req.outbound().traceparent,
      /^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/,
      'the next service joins the same trace',
    );
    const failed = capture();
    startRequest({ header: header({}), method: 'GET', path: '/x', log: failed.log, now: () => 0 }).done(503);
    assert.equal(failed.lines[0].level, 'error', 'a 5xx is an error line, a 4xx a warning');
  });
});

describe('errors that point at the cause', () => {
  it('an AppError answers with its words, code and the reference, and logs what it was doing, the ids and the cause', () => {
    const { lines, log } = capture();
    const store = new Error('SQLITE_BUSY: database is locked');
    const err = new AppError('store-down', 'Your goal could not be saved. Try again in a minute.', {
      status: 503,
      doing: 'saving the goal',
      ids: { goalId: 7 },
      cause: store,
    });
    assert.deepEqual(answerError(err, { id: 'abc', log }), {
      status: 503,
      body: {
        type: 'about:blank',
        title: 'It could not be done right now',
        status: 503,
        detail: 'Your goal could not be saved. Try again in a minute.',
        code: 'store-down',
        reference: 'abc',
      },
    });
    const line = lines[0] as { level: string; doing: string; goalId: number; code: string; causes: { message: string }[] };
    assert.equal(line.level, 'error');
    assert.equal(line.doing, 'saving the goal');
    assert.equal(line.goalId, 7);
    assert.equal(line.code, 'store-down');
    assert.equal(line.causes[0].message, 'SQLITE_BUSY: database is locked', 'the real problem is in the same line');
  });

  it('answers as problem details, the web standard (RFC 9457): the content type to send it with', () => {
    assert.equal(PROBLEM_JSON, 'application/problem+json');
  });

  it("a person's mistake (4xx) is a warning; a fault in the code is a 500 whose details stay in the log", () => {
    const { lines, log } = capture();
    assert.equal(answerError(new AppError('date-in-past', 'The race date is in the past.'), { id: 'r1', log }).status, 400);
    assert.equal(lines[0].level, 'warn');
    const fault = answerError(new TypeError("Cannot read properties of undefined (reading 'weeks')"), { id: 'r2', log });
    assert.equal(fault.status, 500);
    assert.doesNotMatch(`${fault.body.title} ${fault.body.detail}`, /undefined|weeks/, 'the person never sees the inside of the code');
    assert.match(String((lines[1] as { error: { message: string } }).error.message), /reading 'weeks'/, 'the log does');
  });

  it('a page error from outside is logged with only its known fields, each capped', () => {
    const { lines, log } = capture();
    logPageError(
      { message: 'x'.repeat(5000), page: '/plan', stack: Array.from({ length: 50 }, () => 'at f'), password: 'hunter2' },
      { log },
    );
    const line = lines[0] as { msg: string; message: string; stack: string[]; password?: string };
    assert.equal(line.msg, 'page error');
    assert.equal(line.message.length, 500);
    assert.equal(line.stack.length, 5);
    assert.equal(line.password, undefined, 'a field it does not know is dropped');
    logPageError('not an object', { log });
    assert.equal(lines.length, 2, 'nonsense is logged as an empty report, never a crash');
  });
});

describe('the page side', () => {
  it("a failed call becomes an ApiError with the server's words and reference, said in one console line", async () => {
    const said: string[] = [];
    const res = {
      status: 400,
      json: async () => ({
        type: 'about:blank',
        title: 'It could not be done',
        status: 400,
        detail: 'The race date is in the past.',
        code: 'date-in-past',
        reference: 'abc',
      }),
    };
    const err = await apiError(res, 'POST', '/api/goal', (l) => said.push(l));
    assert.ok(err instanceof ApiError);
    assert.deepEqual([err.message, err.code, err.reference], ['The race date is in the past.', 'date-in-past', 'abc']);
    assert.deepEqual(said, ['POST /api/goal 400: The race date is in the past. (reference abc)']);
    const older = await apiError({ status: 400, json: async () => ({ error: 'An older body.' }) }, 'GET', '/x', () => {});
    assert.equal(older.message, 'An older body.', 'an { error } body is read too');
    const plain = await apiError(
      {
        status: 502,
        json: async () => {
          throw new Error('not json');
        },
      },
      'GET',
      '/api/plan',
      () => {},
    );
    assert.equal(plain.message, 'The server answered 502.');
  });

  it('sends each uncaught page error once, with where it happened and the page, and stops at the limit', () => {
    const listeners: Record<string, (e: Record<string, unknown>) => void> = {};
    const sent: unknown[] = [];
    reportPageErrors(
      {
        addEventListener: (t, l) => {
          listeners[t] = l as never;
        },
        location: { pathname: '/plan' },
      },
      (r) => sent.push(r),
      2,
    );
    listeners.error({ error: new Error('weeks is undefined'), filename: 'app.js', lineno: 40 });
    listeners.error({ error: new Error('weeks is undefined'), filename: 'app.js', lineno: 40 });
    listeners.unhandledrejection({ reason: new Error('fetch failed') });
    listeners.unhandledrejection({ reason: new Error('a third one') });
    assert.equal(sent.length, 2, 'the same error once, and no more than the limit');
    assert.deepEqual(sent[0] as { message: string; where: string; page: string }, {
      ...(sent[0] as object),
      message: 'weeks is undefined',
      where: 'app.js:40',
      page: '/plan',
    });
  });
});
