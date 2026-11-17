// How strict the kit is, written down where the owner can read it and see it change in a diff: workflow/levels.json. Three kinds
// of rule, each treated its own way:
//   safety stops     commit and push wait for the owner's word, the sign-off, secrets, migrations, the AI wrapper, the image, the
//                    network, the packages, typecheck and the tests: no level. They are on, or their part is not installed.
//   quality checks   layers, untested code, sizes, docs...: each `fail` (the gate fails), `advise` (it says so and passes) or `off`
//   process weight   from which size of card a spec, a pitch (/shape) and a UI board are needed: a typo fix needs none of them
// A preset fills them in (`production`: every check fails, specs from medium cards; `prototype`: the structure checks advise,
// specs only for large cards); the file's own `checks` and `process` lines win over it. Only the owner edits the file: the
// agent's settings deny it, the stop-point hook refuses a shell write to it, and the gate says on every run what is loosened, so
// a quiet project never looks cleaner than it is. No I/O here.

export const FILE = 'workflow/levels.json';
export const LEVELS = ['fail', 'advise', 'off'];
export const SIZES = ['always', 'small', 'medium', 'large', 'never'];

/** The safety stops: no level, ever (the gate refuses a file that gives one). */
export const SAFETY = ['secrets', 'leaks', 'signoff', 'migrations', 'ai', 'image', 'network', 'packages', 'typecheck', 'tests'];

/** The quality checks a level applies to (a project's own `checks` entries are quality checks too, by their names). */
export const QUALITY = ['layers', 'size', 'functions', 'ratchets', 'nesting', 'circles', 'untested', 'variants', 'budget', 'naming',
  'copies', 'settings', 'versions', 'spikes', 'covers', 'together', 'scope', 'map', 'requests', 'harness', 'surfaces', 'docs', 'errors', 'quality'];

const PROTOTYPE_ADVISE = ['size', 'functions', 'ratchets', 'nesting', 'circles', 'untested', 'budget', 'naming', 'copies', 'covers',
  'docs', 'errors', 'spikes', 'quality', 'map', 'harness'];

export const PRESETS = {
  production: { checks: {}, process: { spec: 'medium', pitch: 'large', uiBoard: 'small' } },
  prototype: { checks: Object.fromEntries(PROTOTYPE_ADVISE.map((c) => [c, 'advise'])), process: { spec: 'large', pitch: 'never', uiBoard: 'large' } },
};

/**
 * The levels in force: { preset, checks: { name: level }, process: { spec, pitch, uiBoard }, loosened: [line], problems: [line] }.
 * `text` is workflow/levels.json (null when there is none: production); `projectChecks` the names of the config's own checks.
 */
export function readLevels(text, projectChecks = []) {
  const problems = [];
  let file = {};
  if (text != null) {
    try { file = JSON.parse(text) ?? {}; } catch { problems.push(`${FILE} is not valid JSON`); }
  }
  const preset = file.preset ?? 'production';
  if (!PRESETS[preset]) problems.push(`${FILE}: "preset" is "${preset}"; it is one of ${Object.keys(PRESETS).join(', ')}`);
  const base = PRESETS[preset] ?? PRESETS.production;
  const known = new Set([...QUALITY, ...projectChecks]);
  const own = file.checks ?? {};
  for (const [name, level] of Object.entries(own)) {
    if (SAFETY.includes(name)) problems.push(`${FILE}: "${name}" is a safety stop and has no level (it is on, or its part is not installed)`);
    else if (!known.has(name)) problems.push(`${FILE}: "${name}" is no check the gate knows (${[...known].join(', ')})`);
    else if (!LEVELS.includes(level)) problems.push(`${FILE}: "${name}" is "${level}"; a level is ${LEVELS.join(', ')}`);
  }
  const checks = { ...base.checks, ...Object.fromEntries(Object.entries(own).filter(([n, l]) => known.has(n) && !SAFETY.includes(n) && LEVELS.includes(l))) };
  const process = { ...base.process };
  for (const [k, v] of Object.entries(file.process ?? {})) {
    if (!(k in process)) problems.push(`${FILE}: process "${k}" is unknown (${Object.keys(process).join(', ')})`);
    else if (!SIZES.includes(v)) problems.push(`${FILE}: process "${k}" is "${v}"; it is one of ${SIZES.join(', ')}`);
    else process[k] = v;
  }
  const loosened = Object.entries(checks).filter(([, l]) => l !== 'fail').sort(([a], [b]) => a.localeCompare(b))
    .map(([n, l]) => `${n} ${l}${n in own ? '' : ` (preset ${preset})`}`);
  return { preset, checks, process, loosened, problems };
}

/** The level of one gate step: a safety stop is always `fail`; a quality check its level, `fail` when none is given. */
export const levelOf = (levels, name) => (SAFETY.includes(name) ? 'fail' : levels.checks[name] ?? 'fail');

/** The one line the gate prints on every run: what is loosened, or that nothing is. */
export function loosenedLine(levels) {
  return levels.loosened.length
    ? `levels (${FILE}, preset ${levels.preset}): loosened ${levels.loosened.join(', ')}`
    : `levels (${FILE}, preset ${levels.preset}): nothing loosened`;
}

/** Whether a card of `effort` (small, medium, large) needs the step whose process level is `from` (always ... never). */
export function needs(from, effort) {
  if (from === 'always') return true;
  if (from === 'never') return false;
  const order = ['small', 'medium', 'large'];
  return order.indexOf(effort ?? 'medium') >= order.indexOf(from);
}
