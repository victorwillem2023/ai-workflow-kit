// The production basis: settings checked at start-up (src/server/config.ts), logs that hide secrets and personal data
// (src/server/log.ts), and health, readiness and a stop that cuts no one off (src/server/shutdown.ts).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defineSettings, describeSettings, loadSettings, readSettings } from '../../src/server/config';
import { createLogger, redact } from '../../src/server/log';
import { gracefulStop, healthAnswer, readiness, readyAnswer } from '../../src/server/shutdown';

const spec = defineSettings({
  PORT: { kind: 'number', default: '8787', min: 1, max: 65535 },
  DATABASE_URL: { kind: 'url' },
  SESSION_SECRET: { kind: 'text', secret: true },
  DEBUG: { kind: 'flag', optional: true },
});

describe('settings', () => {
  it('reads and types every setting, with its default', () => {
    const s = loadSettings(spec, { DATABASE_URL: 'postgres://db:5432/app', SESSION_SECRET: 'x', DEBUG: 'yes' });
    assert.deepEqual(s, { PORT: 8787, DATABASE_URL: 'postgres://db:5432/app', SESSION_SECRET: 'x', DEBUG: true });
  });
  it('refuses to start with every wrong setting named at once, and never shows a secret', () => {
    const { problems } = readSettings(spec, { PORT: '99999', DATABASE_URL: 'not an address' });
    assert.deepEqual(problems, [
      'PORT must be at most 65535',
      'DATABASE_URL must be an address (a URL)',
      'SESSION_SECRET is not set (see .env.example)',
    ]);
    assert.throws(() => loadSettings(spec, {}), /cannot start, its settings are wrong/);
  });
  it('rejects a setting longer than a value can be (a file pasted in)', () => {
    assert.match(readSettings(spec, { DATABASE_URL: 'https://a', SESSION_SECRET: 'x'.repeat(10_001) }).problems[0], /longer than 10000/);
  });
  it('describes the settings for the start-up log with a secret as "set", never its value', () => {
    const s = loadSettings(spec, { DATABASE_URL: 'https://a.example', SESSION_SECRET: 'hunter2' }); // not a secret
    assert.equal(describeSettings(spec, s).SESSION_SECRET, 'set');
    assert.doesNotMatch(JSON.stringify(describeSettings(spec, s)), /hunter2/);
  });
});

describe('logs', () => {
  it('writes one JSON line per event, with secrets hidden and personal fields hidden', () => {
    const lines: string[] = [];
    const log = createLogger({
      write: (l) => lines.push(l),
      now: () => new Date('2026-11-15T10:00:00Z'),
      personal: ['weight'],
      base: { app: 'demo' },
    });
    log.child({ userId: 7 }).info('saved', { weight: 71.5, token: 'abc', nested: { password: 'p' } });
    assert.deepEqual(JSON.parse(lines[0]), {
      time: '2026-11-15T10:00:00.000Z',
      level: 'info',
      msg: 'saved',
      app: 'demo',
      userId: 7,
      weight: '[personal]',
      token: '[hidden]',
      nested: { password: '[hidden]' },
    });
  });
  it('caps hostile input: long text, long lists and deep objects are cut', () => {
    const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };
    assert.match(String(redact('x'.repeat(5000))), /\.\.\. \(5000 characters\)$/);
    assert.equal((redact(Array.from({ length: 80 }, (_, i) => i)) as unknown[]).length, 51);
    assert.match(JSON.stringify(redact(deep)), /too deep/);
  });
  it('writes an error with its kind and message, and drops what is below the level', () => {
    const lines: string[] = [];
    const log = createLogger({ write: (l) => lines.push(l), level: 'warn' });
    log.info('not written');
    log.error('import failed', new TypeError('bad file'));
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).error.kind, 'TypeError');
  });
});

describe('health, readiness and stopping', () => {
  it('health says alive and the version; ready says 503 with the names of the checks that fail or are too slow', async () => {
    assert.deepEqual(healthAnswer('3f2a9c1d04be'), { status: 200, body: { ok: true, version: '3f2a9c1d04be' } });
    const state = readiness();
    const slow = () => new Promise<boolean>((done) => setTimeout(() => done(true), 50));
    assert.deepEqual(
      await readyAnswer(
        {
          db: () => true,
          cache: () => {
            throw new Error('down');
          },
          mail: slow,
        },
        state,
        10,
      ),
      { status: 503, body: { ok: false, failing: ['cache', 'mail'] } },
    );
    assert.equal((await readyAnswer({ db: () => true }, state)).status, 200);
  });
  it('on SIGTERM it stops being ready first, lets open requests finish, closes the database and exits 0', async () => {
    const order: string[] = [];
    const state = readiness();
    const handlers: Record<string, () => void> = {};
    let exited: number | undefined;
    gracefulStop({
      server: {
        close: (done) => {
          order.push('server closed');
          setTimeout(done, 5);
        },
      },
      state,
      close: [
        () => {
          order.push('database closed');
        },
      ],
      settleMs: 5,
      drainMs: 1_000,
      exit: (code) => {
        exited = code;
      },
      signals: {
        once: (e, fn) => {
          handlers[e] = fn;
        },
      },
    });
    handlers.SIGTERM();
    assert.equal((await readyAnswer({}, state)).status, 503, 'not ready from the first moment');
    // until it has exited (the steps run on timers, which a busy machine runs late), at most two seconds
    for (let i = 0; i < 200 && exited === undefined; i++) await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(order, ['server closed', 'database closed']);
    assert.equal(exited, 0);
  });
  it('cuts requests that are still open after the drain limit, and exits 1 when closing fails', async () => {
    const said: string[] = [];
    let cut = false;
    let exited: number | undefined;
    const stop = gracefulStop({
      server: {
        close: () => {},
        closeAllConnections: () => {
          cut = true;
        },
      },
      state: readiness(),
      close: [
        () => {
          throw new Error('db gone');
        },
      ],
      settleMs: 1,
      drainMs: 10,
      log: (m) => said.push(m),
      exit: (code) => {
        exited = code;
      },
      signals: { once: () => {} },
    });
    await stop();
    assert.equal(cut, true);
    assert.equal(exited, 1);
    assert.ok(said.some((m) => /cutting them/.test(m)));
  });
});
