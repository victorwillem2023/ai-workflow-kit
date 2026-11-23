// What install.mjs is asked to do, from three places in this order: the flags, the project's record (workflow/record: what it chose
// before), and what the project itself says (its manifest, its git remote, its folder name). The installer converges: run again
// on a project that has the record, the same command gives the same result (it updates); a flag is a change to the record, never
// a reset of the rest. --force replaces the machinery but keeps the choices. Nothing here writes; recordText says what is kept.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, resolve } from 'node:path';
import { LIBRARY, libraryTaken } from './payload/workflow/tools/lib/library.mjs';

/**
 * Each module says what the installer needs to know about it in modules/<name>/module.json (in a full install by default or only
 * with --with, the helpers the kit's rules name, the packages its install line adds, extra Dependabot ecosystems, a CLAUDE.md
 * tip), so the installer itself names no module. { name: manifest }, in the modules' own order.
 */
export function moduleManifests(kit = KIT) {
  const dir = join(kit, 'modules');
  const found = readdirSync(dir).filter((m) => existsSync(join(dir, m, 'module.json')))
    .map((m) => ({ name: m, ...JSON.parse(readFileSync(join(dir, m, 'module.json'), 'utf8')) }))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
  return Object.fromEntries(found.map((m) => [m.name, m]));
}
const KIT = dirname(fileURLToPath(import.meta.url));
const MANIFESTS = moduleManifests(KIT);
// the modules of a full install, and those only some apps need (added with --with <name>: an app that calls a model, --with ai)
export const ALL = Object.values(MANIFESTS).filter((m) => m.default).map((m) => m.name);
export const OPTIONAL = Object.values(MANIFESTS).filter((m) => !m.default).map((m) => m.name);

/** What the chosen modules add: the helpers (TypeScript), the packages of the install line, Dependabot's ecosystems, CLAUDE.md tips. */
export function moduleNeeds(modules, { framework = false } = {}) {
  const of = modules.map((m) => MANIFESTS[m]).filter(Boolean);
  return {
    helpers: of.flatMap((m) => m.helpers ?? []),
    npm: of.flatMap((m) => m.npm ?? []),
    npmDev: of.flatMap((m) => [...(m.npmDev?.always ?? []), ...(framework ? [] : m.npmDev?.withoutFramework ?? [])]),
    dependabot: of.flatMap((m) => m.dependabot ?? []),
    claudeTips: of.map((m) => m.claudeTip).filter(Boolean).join(''),
  };
}
// the parts of the core past the build loop (skills an agent sees in every chat, and workflows that run by themselves): all in a
// full install; with --lean none, unless named with --with (--lean --with shape,tidy). The build loop itself (setup, next, idea,
// work, spec, build, ship, review, check, find, docs, debug, lesson, the gate, the board, the map, sessions) is always there.
// A part's guides and tools travel with it (a lean project without /market has no GROWTH.md either).
const CORE_PARTS = {
  shape: ['.claude/skills/shape/'], spike: ['.claude/skills/spike/'], tidy: ['.claude/skills/tidy/', '.claude/skills/sweep/'],
  estimate: ['.claude/skills/estimate/'], anatomy: ['.claude/skills/anatomy/'],
  advise: ['.claude/skills/advise/', '.claude/skills/arch/', 'docs/run/BUY-OR-HOST.md', 'docs/run/SCALING.md', 'docs/company/STAGES.md', 'docs/company/ROADMAP.md'],
  launch: ['.claude/skills/launch/', 'docs/run/CICD.md', 'docs/run/LAUNCH.md', 'docs/run/MONITORING.md', 'docs/run/RELEASES.md'],
  market: ['.claude/skills/market/', 'docs/market/GROWTH.md', 'docs/market/MARKET.md', 'workflow/tools/launchcheck.mjs', 'workflow/tools/lib/launchcheck.mjs', 'workflow/tools/lib/launchcheck.d.mts', 'workflow/tests/launchcheck.test.ts'],
  retro: ['.claude/skills/retro/'],
  secops: ['.claude/skills/secops/', '.github/workflows/secops.yml'], 'setup-check': ['.github/workflows/setup.yml'],
};
// the library's guides are parts too (so leaving one out, marking the text that names it and bringing it in work as for any
// part), but no profile takes them: a project takes one when it needs it (npm run library -- --add <name>; lib/library.mjs)
export const PARTS = { ...CORE_PARTS, ...Object.fromEntries(Object.entries(LIBRARY).map(([n, g]) => [n, g.files])) };
export { LIBRARY };

/**
 * The profiles: a named starting point for how much of the kit a project takes (--profile <name>; --with and --without adjust
 * it; the record keeps it, and running with another profile moves the project there). --lean is solo, --full is product.
 */
export const PROFILES = {
  minimal: { what: 'the gate and its checks only: no commands, no board, no sessions', lean: true, gateOnly: true },
  solo: { what: 'the build loop: /next /idea /work /spec /build /ship and the helpers, the board, sessions, the stop points', lean: true },
  product: { what: 'solo and the stages: shape, spike, tidy, anatomy, estimate, advise, launch, market, retro, secops, and every module', lean: false },
  team: { what: 'product, with pull requests and a required review, and the team roles', lean: false, team: true },
};

/**
 * What a minimal install keeps (the gate, the checks' own tools and settings, CI); every other kit file is left out, so a
 * project that wants only the safety net has no commands, no CLAUDE.md and no guides of the kit's.
 */
export const MINIMAL = ['workflow/tools/', 'workflow/scripts/packages.mjs', 'workflow/scripts/packages.d.mts', '.github/workflows/gate.yml', 'workflow/config.json',
  'workflow/levels.json', '.gitignore', 'gitignore.txt', 'package-scripts.json', '.tool-versions', 'tsconfig.json', 'biome.json', 'knip.json', '.gitattributes', 'pyproject.toml', 'Cargo.toml', 'go.mod'];
export const inMinimal = (key) => MINIMAL.some((m) => (m.endsWith('/') ? key.startsWith(m) : key === m));
/** The npm scripts a minimal install adds: the checks and what they run. */
export const MINIMAL_SCRIPTS = ['test', 'test:full', 'typecheck', 'gate', 'gate:all', 'map', 'levels'];

export const list = (s) => String(s ?? '').split(',').map((m) => m.trim()).filter(Boolean);
// --take and --skip name files, folders (workflow/tools/** or workflow/tools/) or, for --take, all
export const pathList = (s) => String(s ?? '').split(',').map((x) => x.trim().replace(/\\/g, '/')).filter(Boolean);
export const inList = (paths, key) => paths.includes('all') || paths.some((p) => p === key || (/(\/\*\*|\/)$/.test(p) && key.startsWith(p.replace(/\*\*$/, ''))));

/** The language a project is written in, from its manifest (none of them: TypeScript, the kit's own). */
export function detectLang(target) {
  const has = (f) => existsSync(join(target, f));
  if (has('Cargo.toml')) return 'rust';
  if (has('go.mod')) return 'go';
  if (has('pyproject.toml')) return 'python';
  return 'ts';
}

/** owner/name from a GitHub remote URL (https or ssh), else null. */
export function repoFromRemote(url) {
  const m = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(String(url ?? '').trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

/** The project's name as it says it: package.json, pyproject.toml or Cargo.toml, else the folder's name. */
export function detectProject(target) {
  const read = (f) => { try { return readFileSync(join(target, f), 'utf8'); } catch { return ''; } };
  let name = null;
  try { name = JSON.parse(read('package.json')).name ?? null; } catch { /* none */ }
  name ??= /^\s*name\s*=\s*"([^"]+)"/m.exec(read('pyproject.toml'))?.[1] ?? /^\s*name\s*=\s*"([^"]+)"/m.exec(read('Cargo.toml'))?.[1] ?? null;
  const raw = (name ?? basename(target)).replace(/^@[\w.-]+\//, '');
  return raw.split(/[-_\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** A value in the record (workflow/record): `key=value`, or null. */
export const recorded = (mark, key) => new RegExp(`^${key}=(.*)$`, 'm').exec(mark)?.[1]?.trim() || null;

/**
 * Every choice the installer goes by. `args`: the command line after `node install.mjs`; `kit`: the kit's folder.
 * Returns { target, mark, installed, force, update, check, take, skip, lang, project, repo, prefix, lean, withs, modules, parts,
 * from } (`from`: where each of lang, project, repo and prefix came from, for the report) or { error }.
 */
export function readChoices(args, kit) {
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const target = args[0] && !args[0].startsWith('--') ? resolve(args[0]) : undefined;
  if (!target) return { error: 'usage' };
  const mark = existsSync(join(target, 'workflow/record')) ? readFileSync(join(target, 'workflow/record'), 'utf8') : '';
  // a project with the record has the kit already: running the installer again updates it (the same as --update)
  const installed = /^version=/m.test(mark);
  const force = args.includes('--force');
  const check = args.includes('--check');
  const update = args.includes('--update') || (installed && !force);
  const remembers = installed || check;
  const from = {};
  const pick = (key, flag, found) => {
    const v = opt(flag) ?? (remembers ? recorded(mark, key) : null);
    from[key] = opt(flag) ? 'the command' : v ? 'the record' : 'the project';
    return v ?? found();
  };
  const lang = pick('lang', '--lang', () => detectLang(target));
  const LANGS = JSON.parse(readFileSync(join(kit, 'starter', 'lang.json'), 'utf8'));
  if (!LANGS[lang]) return { error: `Unknown language "${lang}". Languages: ${Object.keys(LANGS).join(', ')} (another one: install with ts and set the commands in workflow/config.json)` };
  const remote = spawnSync('git', ['-C', target, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout;
  // a project from before the record held these has them in its own settings (the board's repo, its name, the session prefix)
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(join(target, 'workflow/config.json'), 'utf8')); } catch { /* a new project */ }
  const repo = pick('repo', '--repo', () => cfg.board?.repo ?? repoFromRemote(remote));
  const project = pick('project', '--project', () => cfg.name ?? detectProject(target));
  const prefix = pick('prefix', '--prefix', () => cfg.session?.prefix ?? (repo ? repo.split('/')[1] : basename(target)).toLowerCase().replace(/[^a-z0-9-]/g, '-'));
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return { error: 'repo' };
  const skip = [...new Set([...pathList(recorded(mark, 'skip')), ...pathList(opt('--skip'))])];
  // the profile: a named starting point (--profile, or the old --lean / --full), then --with and --without; a project keeps its
  // own, and one from before profiles is solo when it was lean, else product
  const was = remembers ? recorded(mark, 'profile') ?? (/^lean=1$/m.test(mark) ? 'solo' : installed ? 'product' : null) : null;
  const profile = opt('--profile') ?? (args.includes('--lean') ? 'solo' : args.includes('--full') ? 'product' : was ?? 'product');
  const P = PROFILES[profile];
  if (!P) return { error: `Unknown profile "${profile}". Profiles: ${Object.entries(PROFILES).map(([n, p]) => `${n} (${p.what})`).join('; ')}` };
  const lean = P.lean;
  // what the project added or left out before counts while it stays on the same profile; a new profile starts from its own
  const same = was === profile;
  const without = [...new Set([...list(opt('--without')), ...(same ? list(recorded(mark, 'without')) : [])])].filter((w) => !list(opt('--with')).includes(w));
  const withs = [...new Set([...list(opt('--with')), ...(same && lean ? list(recorded(mark, 'parts')) : [])])].filter((w) => !list(opt('--without')).includes(w));
  const picked = opt('--modules') === 'none' ? [] : opt('--modules') ? list(opt('--modules')) : same && /^modules=/m.test(mark) ? list(recorded(mark, 'modules')) : lean ? [] : ALL;
  const modules = [...new Set([...picked, ...withs.filter((w) => !(w in PARTS))])].filter((m) => !without.includes(m));
  const unknown = [...modules, ...without].find((m) => ![...ALL, ...OPTIONAL].includes(m) && !(m in PARTS));
  if (unknown) return { error: `Unknown module or part "${unknown}". Modules: ${ALL.join(', ')}; with --with: ${OPTIONAL.join(', ')}; parts: ${Object.keys(PARTS).join(', ')}` };
  // the library's guides this project has taken (the record, --with, or a guide it has already), on any profile
  const library = libraryTaken([recorded(mark, 'library'), ...withs.filter((w) => w in LIBRARY)].filter(Boolean).join(','), (f) => existsSync(join(target, f)))
    .filter((n) => !without.includes(n));
  const parts = [...new Set([...(lean ? withs.filter((w) => w in CORE_PARTS) : Object.keys(CORE_PARTS)), ...library])].filter((p) => !without.includes(p));
  return { target, mark, installed, force, update, check, take: pathList(opt('--take')), skip, lang, LANGS, project, repo, prefix, lean, withs, modules, parts, library, from, kitPathFlag: opt('--kit-path'),
    profile, gateOnly: Boolean(P.gateOnly), team: Boolean(P.team), without, profileChanged: Boolean(was && was !== profile) };
}

/**
 * The record's lines, the same on every computer and every kit commit (the kit's place on this computer is in git config,
 * workflow.kit, never in the committed file): the version and its tag, where the kit lives, and every choice.
 */
export function recordLines({ version, kitRepo, lang, project, repo, prefix, modules, stages, skip, lean, parts, sections, profile = null, without = [], library = [] }) {
  return [
    `version=${version}`, `ref=v${version}`, ...(kitRepo ? [`kitRepo=${kitRepo}`] : []),
    `lang=${lang}`, `project=${project}`, `repo=${repo}`, `prefix=${prefix}`, ...(profile ? [`profile=${profile}`] : []),
    ...(without.length ? [`without=${without.join(',')}`] : []),
    `modules=${modules.join(',')}`, `stages=${stages.join(',')}`, ...(skip.length ? [`skip=${skip.join(',')}`] : []),
    ...(lean ? ['lean=1', `parts=${parts.filter((x) => !(x in LIBRARY)).join(',')}`] : []), ...(library.length ? [`library=${library.join(',')}`] : []), `sections=${sections.join(',')}`,
  ];
}
