// The app's settings, read from the environment once at start-up and checked there: a missing or wrong one stops the start
// with a plain sentence naming it, never later in the middle of a request. Every name is in .env.example (the gate checks it).
//   export const settings = loadSettings(defineSettings({ PORT: { kind: 'number', default: '8787' }, SESSION_SECRET: { kind: 'text', secret: true } }));
// A secret is never printed: describeSettings() shows it as "set" or "missing".

export type Spec = {
  kind: 'text' | 'number' | 'url' | 'flag';
  /** used when the variable is not set; a setting with no default and not `optional` must be set */
  default?: string;
  optional?: boolean;
  secret?: boolean;
  /** for numbers: the smallest and largest allowed */
  min?: number;
  max?: number;
};
type Value<S extends Spec> = S['kind'] extends 'number' ? number : S['kind'] extends 'flag' ? boolean : string;
export type Settings<T extends Record<string, Spec>> = {
  [K in keyof T]: T[K]['optional'] extends true ? (T[K]['default'] extends string ? Value<T[K]> : Value<T[K]> | undefined) : Value<T[K]>;
};

/** Names the settings (the gate reads the keys of this call), unchanged. */
export function defineSettings<T extends Record<string, Spec>>(spec: T): T {
  return spec;
}

const MAX_LENGTH = 10_000; // a setting longer than this is a mistake (a file pasted in), not a value

function parseOne(name: string, spec: Spec, raw: string): { value?: string | number | boolean; problem?: string } {
  if (raw.length > MAX_LENGTH) return { problem: `${name} is longer than ${MAX_LENGTH} characters` };
  if (spec.kind === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return { problem: `${name} must be a number, it is "${spec.secret ? '(hidden)' : raw}"` };
    if (spec.min != null && n < spec.min) return { problem: `${name} must be at least ${spec.min}` };
    if (spec.max != null && n > spec.max) return { problem: `${name} must be at most ${spec.max}` };
    return { value: n };
  }
  if (spec.kind === 'flag') {
    if (!/^(true|false|1|0|yes|no)$/i.test(raw)) return { problem: `${name} must be true or false` };
    return { value: /^(true|1|yes)$/i.test(raw) };
  }
  if (spec.kind === 'url') {
    try {
      const u = new URL(raw);
      if (!/^(https?|postgres(ql)?|redis|mysql|amqps?|s3):$/.test(u.protocol))
        return { problem: `${name} must be an http(s) or service address` };
    } catch {
      return { problem: `${name} must be an address (a URL)` };
    }
  }
  return { value: raw };
}

/** Reads and checks every setting; { values, problems }. `env` is the environment (process.env in the app, a plain object in tests). */
export function readSettings<T extends Record<string, Spec>>(
  spec: T,
  env: Record<string, string | undefined>,
): { values: Settings<T>; problems: string[] } {
  const values: Record<string, string | number | boolean | undefined> = {};
  const problems: string[] = [];
  for (const [name, s] of Object.entries(spec)) {
    const raw = env[name] ?? s.default;
    if (raw == null || raw === '') {
      if (!s.optional) problems.push(`${name} is not set (see .env.example)`);
      continue;
    }
    const r = parseOne(name, s, raw.trim());
    if (r.problem) problems.push(r.problem);
    else values[name] = r.value;
  }
  return { values: values as Settings<T>, problems };
}

/** At start-up: the checked settings, or an error that names every problem at once (so one restart fixes them all). */
export function loadSettings<T extends Record<string, Spec>>(spec: T, env: Record<string, string | undefined> = process.env): Settings<T> {
  const { values, problems } = readSettings(spec, env);
  if (problems.length) throw new Error(`The app cannot start, its settings are wrong:\n- ${problems.join('\n- ')}`);
  return values;
}

/** The settings as they may be logged at start-up: a secret only as "set" or "missing". */
export function describeSettings<T extends Record<string, Spec>>(spec: T, values: Settings<T>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, s] of Object.entries(spec)) {
    const v = (values as Record<string, unknown>)[name];
    out[name] = s.secret ? (v == null ? 'missing' : 'set') : String(v ?? '(not set)');
  }
  return out;
}
