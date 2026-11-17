// How strict the kit is, written down where the owner can read it and see it change in a diff: workflow/levels.json. Three kinds
// of rule, each treated its own way:
//   safety stops     commit and push wait for the owner's word, the sign-off, secrets, migrations, the AI wrapper, the image, the
//                    network, the packages, typecheck and the tests: no level. They are on, or their part is not installed.
//   quality checks   layers, untested code, sizes, docs...: each `fail` (the gate fails), `advise` (it says so and passes) or `off`
//   process weight   from which size of card a spec, a pitch (/shape) and a UI board are needed: a typo fix needs none of them
// The phase fills them in (`phase`, called `preset` before kit 3.4): `prototype` while nothing outside depends on the product (the
// structure checks advise, specs only for large cards, /ship runs the tests the change reaches), `pilot` once a few real people use
// it or it keeps their data (structure still advises; untested code, docs and errors fail; /ship runs the whole suite), `production`
// once it takes money or has an address people rely on (every check fails, specs from medium cards). lib/phase.mjs says which one
// the facts fit; the file's own `checks` and `process` lines win over the phase. Only the owner edits the file: the
// agent's settings deny it, the stop-point hook refuses a shell write to it, and the gate says on every run what is loosened, so
// a quiet project never looks cleaner than it is. No I/O here.

export const FILE = 'workflow/levels.json';
export const LEVELS = ['fail', 'advise', 'off'];
export const SIZES = ['always', 'small', 'medium', 'large', 'never'];
/** How far the gate looks for the tests a change reaches: every file that leans on it (chain), or only the tests importing it (direct). */
export const REACH = ['chain', 'direct'];
/** Which runs skip a test that passed on this computer with the same code: the picked tests only, or the whole suite too. */
export const CACHE = ['picked', 'all'];

/** The safety stops: no level, ever (the gate refuses a file that gives one). */
export const SAFETY = ['secrets', 'leaks', 'signoff', 'migrations', 'ai', 'image', 'network', 'packages', 'typecheck', 'tests'];

/** The quality checks a level applies to (a project's own `checks` entries are quality checks too, by their names). */
export const QUALITY = ['layers', 'size', 'functions', 'ratchets', 'nesting', 'circles', 'untested', 'variants', 'budget', 'naming',
  'copies', 'settings', 'versions', 'spikes', 'covers', 'together', 'scope', 'map', 'requests', 'harness', 'surfaces', 'docs', 'errors', 'quality'];

const PROTOTYPE_ADVISE = ['size', 'functions', 'ratchets', 'nesting', 'circles', 'untested', 'budget', 'naming', 'copies', 'covers',
  'docs', 'errors', 'spikes', 'quality', 'map', 'harness'];

// what a pilot holds to again: real people meet its errors, its docs and its untested code
const PILOT_FAIL = ['untested', 'covers', 'docs', 'errors'];
const advise = (names) => Object.fromEntries(names.map((c) => [c, 'advise']));

/** The phases, lightest first; `ship` is what /ship's gate runs (`gate.mjs --ship`): the tests the change reaches, or all of them. */
export const PHASES = ['prototype', 'pilot', 'production'];
export const PRESETS = {
  prototype: { checks: advise(PROTOTYPE_ADVISE), process: { spec: 'large', pitch: 'never', uiBoard: 'large' }, ship: 'reached' },
  pilot: { checks: advise(PROTOTYPE_ADVISE.filter((c) => !PILOT_FAIL.includes(c))), process: { spec: 'large', pitch: 'never', uiBoard: 'medium' }, ship: 'all' },
  production: { checks: {}, process: { spec: 'medium', pitch: 'large', uiBoard: 'small' }, ship: 'all' },
};

/**
 * The levels in force: { phase, preset (the same, its old name), checks: { name: level }, process: { spec, pitch, uiBoard },
 * ship: 'reached' | 'all', reach: 'chain' | 'direct', cache: 'picked' | 'all', loosened: [line], problems: [line] }.
 * `text` is workflow/levels.json (null when there is none: production); `projectChecks` the names of the config's own checks.
 */
export function readLevels(text, projectChecks = []) {
  const problems = [];
  let file = {};
  if (text != null) {
    try { file = JSON.parse(text) ?? {}; } catch { problems.push(`${FILE} is not valid JSON`); }
  }
  const key = 'phase' in file ? 'phase' : 'preset';
  const preset = file.phase ?? file.preset ?? 'production';
  if (!PRESETS[preset]) problems.push(`${FILE}: "${key}" is "${preset}"; it is one of ${PHASES.join(', ')}`);
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
  // "reach": "direct" only the tests that import a changed file themselves (faster; GitHub still runs them all), the owner's choice
  const reach = file.reach ?? 'chain';
  if (!REACH.includes(reach)) problems.push(`${FILE}: "reach" is "${reach}"; it is one of ${REACH.join(', ')}`);
  // "cache": "all": --all and a pilot or production /ship skip what passed with the same code here too (GitHub runs them all)
  const cache = file.cache ?? 'picked';
  if (!CACHE.includes(cache)) problems.push(`${FILE}: "cache" is "${cache}"; it is one of ${CACHE.join(', ')}`);
  const loosened = Object.entries(checks).filter(([, l]) => l !== 'fail').sort(([a], [b]) => a.localeCompare(b))
    .map(([n, l]) => `${n} ${l}${n in own ? '' : ` (phase ${preset})`}`)
    .concat(reach === 'direct' ? ['tests reach direct (only the tests importing a changed file)'] : [])
    .concat(cache === 'all' ? ['tests cache all (the whole suite skips what passed with the same code on this computer)'] : []);
  return { phase: preset, preset, checks, process, ship: base.ship, reach: REACH.includes(reach) ? reach : 'chain', cache: CACHE.includes(cache) ? cache : 'picked', loosened, problems };
}

/** The level of one gate step: a safety stop is always `fail`; a quality check its level, `fail` when none is given. */
export const levelOf = (levels, name) => (SAFETY.includes(name) ? 'fail' : levels.checks[name] ?? 'fail');

/** The one line the gate prints on every run: what is loosened, or that nothing is. */
export function loosenedLine(levels) {
  return levels.loosened.length
    ? `levels (${FILE}, phase ${levels.phase}): loosened ${levels.loosened.join(', ')}`
    : `levels (${FILE}, phase ${levels.phase}): nothing loosened`;
}

/** Whether a card of `effort` (small, medium, large) needs the step whose process level is `from` (always ... never). */
export function needs(from, effort) {
  if (from === 'always') return true;
  if (from === 'never') return false;
  const order = ['small', 'medium', 'large'];
  return order.indexOf(effort ?? 'medium') >= order.indexOf(from);
}
