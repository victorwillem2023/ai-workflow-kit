// Structured logs: one JSON line per event (time, level, message, fields), so a log service can search and count them.
// Nothing secret or personal is ever written: a field whose name looks like a secret (password, token, key, cookie...) becomes
// "[hidden]", and the fields the app names as personal (`personal`, from docs/company/PRIVACY.md) become "[personal]". Long text and
// deep or long values are cut, so a hostile input cannot fill the disk through the log.
//   const log = createLogger({ base: { app: 'my-app', version: process.env.APP_VERSION }, personal: ['email', 'weight'] });
//   log.info('plan made', { userId, weeks: 12 });   log.error('import failed', err, { userId });

export type Level = 'debug' | 'info' | 'warn' | 'error';
export type Fields = Record<string, unknown>;
export type Logger = {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, err?: unknown, fields?: Fields): void;
  /** a logger that adds these fields to every line (a request id, a user id) */
  child(fields: Fields): Logger;
};

const SECRET_NAME = /pass(word)?|secret|token|api.?key|private.?key|auth(orization)?|cookie|session|credential|signature/i;
const MAX_TEXT = 2_000; // characters of one text value
const MAX_ITEMS = 50; // entries of one list or object
const MAX_DEPTH = 5;
const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** A copy of `value` with secrets and personal fields hidden and everything capped. */
export function redact(value: unknown, personal: ReadonlySet<string> = new Set(), depth = 0): unknown {
  if (typeof value === 'string') return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}... (${value.length} characters)` : value;
  if (value == null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[too deep]';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((v) => redact(v, personal, depth + 1));
    return value.length > MAX_ITEMS ? [...items, `... ${value.length - MAX_ITEMS} more`] : items;
  }
  const out: Record<string, unknown> = {};
  const entries = Object.entries(value);
  for (const [k, v] of entries.slice(0, MAX_ITEMS)) {
    out[k] = personal.has(k) ? '[personal]' : SECRET_NAME.test(k) ? '[hidden]' : redact(v, personal, depth + 1);
  }
  if (entries.length > MAX_ITEMS) out['...'] = `${entries.length - MAX_ITEMS} more fields`;
  return out;
}

/**
 * An error as a log field: its kind, message, code and the first lines of where it happened, and what caused it (`cause`, the
 * error it was wrapping, up to three deep), so one line shows the whole way down to the real problem.
 */
function errorField(err: unknown, depth = 0): Fields | undefined {
  if (err == null) return undefined;
  if (err instanceof Error) {
    // read as plain fields: `cause` is not on Error in a TypeScript library older than ES2022 (a Vite starter's)
    const { code, cause } = err as { code?: unknown; cause?: unknown };
    return {
      kind: err.name,
      message: err.message,
      ...(code !== undefined ? { code } : {}),
      at: err.stack
        ?.split('\n')
        .slice(1, 6)
        .map((l) => l.trim()),
      ...(cause !== undefined && depth < 3 ? { cause: errorField(cause, depth + 1) } : {}),
    };
  }
  return { message: String(err) };
}

export function createLogger(
  o: { base?: Fields; personal?: string[]; level?: Level; write?: (line: string) => void; now?: () => Date } = {},
): Logger {
  const personal = new Set(o.personal ?? []);
  const min = ORDER[o.level ?? 'info'];
  const write = o.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const now = o.now ?? (() => new Date());
  const make = (base: Fields): Logger => {
    const emit = (level: Level, msg: string, fields?: Fields, err?: unknown) => {
      if (ORDER[level] < min) return;
      const line = {
        time: now().toISOString(),
        level,
        msg: String(msg).slice(0, MAX_TEXT),
        ...(redact({ ...base, ...fields }, personal) as Fields),
        error: errorField(err),
      };
      write(JSON.stringify(line));
    };
    return {
      debug: (msg, fields) => emit('debug', msg, fields),
      info: (msg, fields) => emit('info', msg, fields),
      warn: (msg, fields) => emit('warn', msg, fields),
      error: (msg, err, fields) => emit('error', msg, fields, err),
      child: (fields) => make({ ...base, ...fields }),
    };
  };
  return make(o.base ?? {});
}
