// What install.mjs is asked to do, from three places in this order: the flags, the project's record (.workflow-kit: what it chose
// before), and what the project itself says (its manifest, its git remote, its folder name). The installer converges: run again
// on a project that has the record, the same command gives the same result (it updates); a flag is a change to the record, never
// a reset of the rest. --force replaces the machinery but keeps the choices. Nothing here writes; recordText says what is kept.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export const ALL = ['ui', 'security', 'testing', 'dev', 'map', 'deploy', 'production'];
// modules only some apps need: added with --with <name> (an app that calls a language model: --with ai)
export const OPTIONAL = ['ai', 'cluster'];
// the parts of the core past the build loop (skills an agent sees in every chat, and workflows that run by themselves): all in a
// full install; with --lean none, unless named with --with (--lean --with shape,tidy). The build loop itself (setup, next, idea,
// work, spec, build, ship, review, check, find, docs, debug, lesson, the gate, the board, the map, sessions) is always there.
// A part's guides and tools travel with it (a lean project without /market has no GROWTH.md either).
export const PARTS = {
  shape: ['.claude/skills/shape/'], spike: ['.claude/skills/spike/'], tidy: ['.claude/skills/tidy/'],
  estimate: ['.claude/skills/estimate/'],
  advise: ['.claude/skills/advise/', '.claude/skills/arch/', 'docs/run/BUY-OR-HOST.md', 'docs/run/SCALING.md', 'docs/company/STAGES.md', 'docs/company/ROADMAP.md'],
  launch: ['.claude/skills/launch/', 'docs/run/CICD.md', 'docs/run/LAUNCH.md', 'docs/run/MESH.md', 'docs/run/MONITORING.md', 'docs/run/RELEASES.md'],
  market: ['.claude/skills/market/', 'docs/market/GROWTH.md', 'docs/market/MARKET.md', 'tools/workflow/launchcheck.mjs', 'tools/workflow/lib/launchcheck.mjs', 'tools/workflow/lib/launchcheck.d.mts', 'tests/workflow/launchcheck.test.ts'],
  retro: ['.claude/skills/retro/'],
  secops: ['.claude/skills/secops/', '.github/workflows/secops.yml'], 'setup-check': ['.github/workflows/setup.yml'],
};

export const list = (s) => String(s ?? '').split(',').map((m) => m.trim()).filter(Boolean);
// --take and --skip name files, folders (tools/workflow/** or tools/workflow/) or, for --take, all
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

/** A value in the record (.workflow-kit): `key=value`, or null. */
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
  const mark = existsSync(join(target, '.workflow-kit')) ? readFileSync(join(target, '.workflow-kit'), 'utf8') : '';
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
  if (!LANGS[lang]) return { error: `Unknown language "${lang}". Languages: ${Object.keys(LANGS).join(', ')} (another one: install with ts and set the commands in workflow.config.json)` };
  const remote = spawnSync('git', ['-C', target, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout;
  // a project from before the record held these has them in its own settings (the board's repo, its name, the session prefix)
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(join(target, 'workflow.config.json'), 'utf8')); } catch { /* a new project */ }
  const repo = pick('repo', '--repo', () => cfg.board?.repo ?? repoFromRemote(remote));
  const project = pick('project', '--project', () => cfg.name ?? detectProject(target));
  const prefix = pick('prefix', '--prefix', () => cfg.session?.prefix ?? (repo ? repo.split('/')[1] : basename(target)).toLowerCase().replace(/[^a-z0-9-]/g, '-'));
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return { error: 'repo' };
  const skip = [...new Set([...pathList(recorded(mark, 'skip')), ...pathList(opt('--skip'))])];
  const lean = args.includes('--lean') || (remembers && !args.includes('--full') && /^lean=1$/m.test(mark));
  const withs = [...new Set([...list(opt('--with')), ...(remembers && !args.includes('--lean') ? list(recorded(mark, 'parts')) : [])])];
  const picked = opt('--modules') === 'none' ? [] : opt('--modules') ? list(opt('--modules')) : remembers && /^modules=/m.test(mark) ? list(recorded(mark, 'modules')) : lean ? [] : ALL;
  const modules = [...new Set([...picked, ...withs.filter((w) => !(w in PARTS))])];
  const unknown = modules.find((m) => ![...ALL, ...OPTIONAL].includes(m));
  if (unknown) return { error: `Unknown module or part "${unknown}". Modules: ${ALL.join(', ')}; with --with: ${OPTIONAL.join(', ')}; parts (with --lean): ${Object.keys(PARTS).join(', ')}` };
  const parts = lean ? withs.filter((w) => w in PARTS) : Object.keys(PARTS);
  return { target, mark, installed, force, update, check, take: pathList(opt('--take')), skip, lang, LANGS, project, repo, prefix, lean, withs, modules, parts, from, kitPathFlag: opt('--kit-path') };
}

/**
 * The record's lines, the same on every computer and every kit commit (the kit's place on this computer is in git config,
 * workflow.kit, never in the committed file): the version and its tag, where the kit lives, and every choice.
 */
export function recordLines({ version, kitRepo, lang, project, repo, prefix, modules, stages, skip, lean, parts, sections }) {
  return [
    `version=${version}`, `ref=v${version}`, ...(kitRepo ? [`kitRepo=${kitRepo}`] : []),
    `lang=${lang}`, `project=${project}`, `repo=${repo}`, `prefix=${prefix}`,
    `modules=${modules.join(',')}`, `stages=${stages.join(',')}`, ...(skip.length ? [`skip=${skip.join(',')}`] : []),
    ...(lean ? ['lean=1', `parts=${parts.join(',')}`] : []), `sections=${sections.join(',')}`,
  ];
}
