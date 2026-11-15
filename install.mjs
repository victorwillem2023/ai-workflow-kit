#!/usr/bin/env node
// Installs the workflow kit into a project.
//   node install.mjs <target-folder> --project "My App" --repo owner/name [--prefix myapp] [--modules ui,security,testing,dev] [--lang rust] [--force]
//   node install.mjs <target-folder> --project ... --repo ... --check     list the machinery files that differ from the kit; changes nothing
//   node install.mjs <target-folder> --project ... --repo ... --update    bring an existing project up to this kit without losing its own changes:
//       a machinery file the project never changed is replaced, one it changed is kept and listed (--take <path,path> takes the kit's
//       for those), missing files are added, and settings the kit has and the project lacks are added to workflow.config.json.
//   --lang ts (default) | rust | python | go: the check and test commands of starter/lang.json; a language other than ts
//   leaves the TypeScript starter files out (tsconfig.json, the .ts examples of the modules).
// 1. payload/  (skills, tools/workflow, scripts, tests/workflow, docs/WORKFLOW.md, docs/TOKENS.md): the generic machinery. Copied as is, with
//    {{PROJECT}} {{REPO}} {{OWNER}} {{PREFIX}} filled in. Existing files are kept unless --force.
// 2. starter/  (CLAUDE.md, workflow.config.json, tsconfig.json, the guide, docs/code, folder CLAUDE.md files, STYLE.md ...): YOUR files to edit.
//    Copied only when missing, never overwritten (not even with --force).
// 3. modules/<name>/{payload,starter}  (ui, security, testing, dev; all by default, or pick with --modules): the same two kinds.
//    ui = /ui skill, screenshots, style sheet, DOM helper, board template, STYLE.md; security = network guard, safe fetch, input guards,
//    debug-handle gate and their tests, SECURITY.md; testing = fake clock, fakes pattern; dev = dev.cmd, start.cmd, dev-check;
//    map = the app map (docs/flow: a page of yes/no trees of what the app decides) and the request pages (docs/REQUESTS.md);
//    deploy = a Dockerfile, npm run deploy / smoke / rollback (scripts/deploy.mjs), docs/DEPLOY.md.
// 4. package.json gets the test/test:full/typecheck/gate/gate:all/map/board/harness scripts (the project's own win, except npm's
//    placeholder test); .gitignore gets the kit's lines; .github/dependabot.yml (weekly updates) is written when missing. The OpenCode commands are written last (`npm run harness` again after a skill changes).
//    Nothing is committed.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const kit = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const target = args[0] && !args[0].startsWith('--') ? resolve(args[0]) : undefined;
const force = args.includes('--force');
const update = args.includes('--update');
const take = (opt('--take') ?? '').split(',').map((x) => x.trim().replace(/\\/g, '/')).filter(Boolean);
const ALL = ['ui', 'security', 'testing', 'dev', 'map', 'deploy', 'production'];
const lang = opt('--lang') ?? 'ts';
const LANGS = JSON.parse(readFileSync(join(kit, 'starter', 'lang.json'), 'utf8'));
if (!LANGS[lang]) { console.error(`Unknown language "${lang}". Languages: ${Object.keys(LANGS).join(', ')} (another one: install with ts and set the commands in workflow.config.json)`); process.exit(1); }
const modules = opt('--modules') ? opt('--modules').split(',').map((m) => m.trim()).filter(Boolean) : ALL;
for (const m of modules) if (!ALL.includes(m)) { console.error(`Unknown module "${m}". Modules: ${ALL.join(', ')}`); process.exit(1); }
const repo = opt('--repo');
const project = opt('--project');
if (!target || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !project) {
  console.error('Usage: node install.mjs <target-folder> --project "My App" --repo owner/name [--prefix myapp] [--modules ui,security,testing,dev,map,deploy] [--lang ts|rust|python|go] [--force]');
  process.exit(1);
}
if (!existsSync(target)) { console.error(`${target} does not exist. Make the project folder (and git init) first.`); process.exit(1); }
const prefix = opt('--prefix') ?? repo.split('/')[1].toLowerCase().replace(/[^a-z0-9-]/g, '-');
const vars = {
  PROJECT: project, REPO: repo, OWNER: repo.split('/')[0], PREFIX: prefix,
  TESTS: LANGS[lang].config?.tests ?? LANGS[lang].tests ?? 'tests/*.test.ts',
  TEST_TIPS: lang === 'ts' && modules.includes('testing') ? ' A test that waits on a\n  timeout wraps its body in `clocked()` (`tests/clock.ts`), so a 4 s wait costs milliseconds.' : '',
};
const fill = (text) => text.replace(/\{\{(PROJECT|REPO|OWNER|PREFIX|TESTS|TEST_TIPS)\}\}/g, (_, k) => vars[k]);
const TEXT = /(\.(md|mjs|js|ts|json|mts|txt|html|css|toml|cmd)|Dockerfile)$/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p); else yield p;
  }
}

// --check: which machinery files differ from this kit (line endings aside)? Nothing is written.
if (args.includes('--check')) {
  const same = (a, b) => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');
  const roots = [join(kit, 'payload'), ...modules.map((m) => join(kit, 'modules', m, 'payload')).filter(existsSync)];
  const lines = [];
  for (const from of roots) for (const src of walk(from)) {
    const rel = relative(from, src).replace(/\\/g, '/');
    const dest = join(target, rel);
    if (!existsSync(dest)) lines.push(`missing  ${rel}`);
    else if (TEXT.test(src) && !same(fill(readFileSync(src, 'utf8')), readFileSync(dest, 'utf8'))) lines.push(`differs  ${rel}`);
  }
  console.log(lines.length ? lines.join('\n') + `\n${lines.length} machinery files differ from the kit (--force takes the kit's; a change worth keeping goes into the kit first)` : 'the machinery is the kit\'s');
  process.exit(lines.length ? 1 : 0);
}

const kitVersion = readFileSync(join(kit, 'VERSION'), 'utf8').trim();
const markFile = join(target, '.workflow-kit');
const before = existsSync(markFile) ? (/version=(\S+)/.exec(readFileSync(markFile, 'utf8'))?.[1] ?? 'unknown') : null;
const done = { added: [], kept: [], replaced: [], yours: [] };
// a project that already has a UI framework builds its screens with components: the ui module's own DOM helper and its test stay out
const pkgBefore = existsSync(join(target, 'package.json')) ? JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')) : {};
const framework = ['react', 'preact', 'vue', 'svelte', 'solid-js', 'next', '@angular/core'].some((d) => d in { ...(pkgBefore.dependencies ?? {}), ...(pkgBefore.devDependencies ?? {}) });
const happyDom = modules.includes('ui') && !framework ? ' @happy-dom/global-registrator' : '';
// what each machinery file looked like when the kit last wrote it ("sha <hash> <file>" lines in .workflow-kit), so an update can
// tell a file the project changed from one only the kit changed
const hash = (text) => createHash('sha1').update(String(text).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
const written = new Map((existsSync(markFile) ? readFileSync(markFile, 'utf8') : '').split(/\r?\n/).map((l) => /^sha (\S+) (.+)$/.exec(l)).filter(Boolean).map((m) => [m[2], m[1]]));
const stamp = new Map(written);
const overwriteOnly = (from) => from.endsWith('payload');
function copyTree(from, overwrite) {
  for (const src of walk(from)) {
    const rel = relative(from, src);
    // another language: the TypeScript starter files stay out (the machinery's own tests are payload and stay in)
    if (lang !== 'ts' && !overwriteOnly(from) && (/\.tsx?$/.test(rel) || rel === 'tsconfig.json')) continue;
    if (rel === 'lang.json') continue;
    if (framework && /^(src[\\/]web[\\/]dom\.ts|tests[\\/]dom\.test\.ts)$/.test(rel)) continue;
    // --update: the example code of the starter (src, tests) is for a new project; an existing one gets only docs and settings it lacks
    if (update && !overwriteOnly(from) && /^(src|tests|cmd|internal|pkg)[\\/]/.test(rel) && !existsSync(join(target, rel))) continue;
    const dest = join(target, rel);
    const exists = existsSync(dest);
    const raw = readFileSync(src);
    // a Windows script is written with CRLF, as .gitattributes checks it out, so git has nothing to convert or warn about
    const filled = TEXT.test(src) ? fill(raw.toString('utf8')) : raw;
    const next = /\.cmd$/.test(src) ? filled.replace(/\r?\n/g, '\r\n') : filled;
    const key = rel.replace(/\\/g, '/');
    const machinery = overwriteOnly(from);
    if (exists && machinery && update && !overwrite) {
      // --update: the same already, or untouched since the kit wrote it (then the kit's new one is taken), or the project's own
      const now = hash(readFileSync(dest, TEXT.test(src) ? 'utf8' : 'latin1'));
      const fresh = hash(TEXT.test(src) ? next : raw.toString('latin1'));
      if (now === fresh) { stamp.set(key, fresh); done.kept.push(rel); continue; }
      if (written.get(key) !== now && !take.includes(key)) { done.yours.push(key); continue; }
    } else if (exists && !overwrite) { done.kept.push(rel); continue; }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, next);
    if (machinery) stamp.set(key, hash(TEXT.test(src) ? next : raw.toString('latin1')));
    (exists ? done.replaced : done.added).push(rel);
  }
}

copyTree(join(kit, 'payload'), force);
copyTree(join(kit, 'starter'), false);
// the language's own starter files (starter-python: a pyproject.toml for uv)
if (existsSync(join(kit, `starter-${lang}`))) copyTree(join(kit, `starter-${lang}`), false);
for (const m of modules) {
  if (existsSync(join(kit, 'modules', m, 'payload'))) copyTree(join(kit, 'modules', m, 'payload'), force);
  if (existsSync(join(kit, 'modules', m, 'starter'))) copyTree(join(kit, 'modules', m, 'starter'), false);
  // the same examples in the project's language, where the module has them (modules/<name>/starter-<lang>)
  if (existsSync(join(kit, 'modules', m, `starter-${lang}`))) copyTree(join(kit, 'modules', m, `starter-${lang}`), false);
}

// a module's own section of CLAUDE.md (modules/<name>/claude-section.md): added once, at the end. "Once" is remembered in
// .workflow-kit (sections=), so a section the owner renamed, rewrote or took out is never added again; a project from before that
// record is recognised by the heading or by the first file or command the section names.
const sectionsDone = new Set((/^sections=(.*)$/m.exec(existsSync(markFile) ? readFileSync(markFile, 'utf8') : '')?.[1] ?? '').split(',').filter(Boolean));
for (const m of modules) {
  const part = join(kit, 'modules', m, 'claude-section.md');
  const claude = join(target, 'CLAUDE.md');
  if (!existsSync(part) || !existsSync(claude)) continue;
  const text = fill(readFileSync(part, 'utf8'));
  const title = /^## .+$/m.exec(text)?.[0];
  // (the files and commands the section names: when most of them are in CLAUDE.md already, the section is there under another heading)
  const names = [...text.matchAll(/`([^`]+)`/g)].map((x) => x[0]);
  const has = readFileSync(claude, 'utf8');
  const there = names.length > 0 && names.filter((n) => has.includes(n)).length * 2 >= names.length;
  if (title && !sectionsDone.has(m) && !has.includes(title) && !there) writeFileSync(claude, has.replace(/\n*$/, '\n') + text);
  sectionsDone.add(m);
}
// the gate's baseline, empty, so the docs can name it from the first day
const basePath = join(target, 'tools', 'workflow', 'baseline.json');
if (!existsSync(basePath)) writeFileSync(basePath, JSON.stringify({ boundaries: [], sizes: {}, docs: [] }, null, 2) + '\n');

// starter files that are not meant to live at their own name
const rename = [['gitignore.txt', null], ['package-scripts.json', null], ['settings.local.json', '.claude/settings.local.json']];
for (const [name, to] of rename) {
  const stray = join(target, name);
  if (!existsSync(stray)) continue;
  const text = readFileSync(stray, 'utf8');
  if (to && !existsSync(join(target, to))) { mkdirSync(dirname(join(target, to)), { recursive: true }); writeFileSync(join(target, to), text); done.added.push(to); }
  rmSync(stray);
  done.added = done.added.filter((x) => x !== name);
  done.kept = done.kept.filter((x) => x !== name);
}

const claudeAdded = [];
// Claude Code's settings are the project's own after the first install, but the kit's allow and deny rules it lacks are added,
// so a project made earlier also gets a new rule (agents never skip the push guard: --no-verify, --force, another hooks path)
{
  const own = join(target, '.claude', 'settings.local.json');
  const kitRules = JSON.parse(readFileSync(join(kit, 'starter', 'settings.local.json'), 'utf8')).permissions ?? {};
  if (existsSync(own)) {
    const mine = JSON.parse(readFileSync(own, 'utf8'));
    mine.permissions ??= {};
    const added = [];
    for (const kind of ['allow', 'deny']) {
      const list = (mine.permissions[kind] ??= []);
      for (const r of kitRules[kind] ?? []) if (!list.includes(r)) { list.push(r); added.push(`${kind} ${r}`); }
    }
    if (added.length) { writeFileSync(own, JSON.stringify(mine, null, 2) + '\n'); claudeAdded.push(...added); }
  }
}

// package.json scripts
const pkgPath = join(target, 'package.json');
const scripts = JSON.parse(readFileSync(join(kit, 'starter', 'package-scripts.json'), 'utf8'));
const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : { name: prefix, private: true, type: 'module' };
// the project's own scripts win, except npm's placeholder test script ("echo \"Error: no test specified\" && exit 1")
Object.assign(scripts, LANGS[lang].scripts ?? {});
// a module's own scripts (modules/<name>/package-scripts.json)
for (const m of modules) if (existsSync(join(kit, 'modules', m, 'package-scripts.json'))) Object.assign(scripts, JSON.parse(readFileSync(join(kit, 'modules', m, 'package-scripts.json'), 'utf8')));
const own = { ...(pkg.scripts ?? {}) };
if (/no test specified/.test(own.test ?? '')) delete own.test;
pkg.scripts = { ...scripts, ...own };
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// a tsconfig.json that was there before and checks nothing by itself (a framework starter's: "files": [] and references): the gate
// gets its own, tsconfig.gate.json, over src, tests and scripts, so `npm run typecheck` really checks them
if (lang === 'ts' && done.kept.includes('tsconfig.json') && !existsSync(join(target, 'tsconfig.gate.json'))) {
  const theirs = readFileSync(join(target, 'tsconfig.json'), 'utf8');
  if (/"references"\s*:/.test(theirs) || /"files"\s*:\s*\[\s*\]/.test(theirs)) {
    const gateCfg = JSON.parse(readFileSync(join(kit, 'starter', 'tsconfig.json'), 'utf8'));
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    gateCfg.compilerOptions.allowImportingTsExtensions = true; // framework starters import './App.tsx'
    if (deps.react) gateCfg.compilerOptions.jsx = 'react-jsx';
    if (deps.vite) gateCfg.compilerOptions.types.push('vite/client');
    writeFileSync(join(target, 'tsconfig.gate.json'), JSON.stringify(gateCfg, null, 2) + '\n');
    if (!own.typecheck) { pkg.scripts.typecheck = 'tsc --noEmit -p tsconfig.gate.json'; writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n'); }
    done.added.push('tsconfig.gate.json');
  }
}

// a project with a UI framework: /ui draws its variants as real components, not as an HTML board
if (framework && done.added.includes('workflow.config.json')) {
  const cfgPath = join(target, 'workflow.config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  if (cfg.ui) { cfg.ui.boards = 'components'; writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n'); }
}

// another language: its commands and file endings into the config, when the config is the one just written
if (LANGS[lang].config && done.added.includes('workflow.config.json')) {
  const cfgPath = join(target, 'workflow.config.json');
  writeFileSync(cfgPath, JSON.stringify({ ...JSON.parse(readFileSync(cfgPath, 'utf8')), ...LANGS[lang].config }, null, 2) + '\n');
}

// --update: settings the kit has and the project's config lacks are added (a whole key, or a check by its name); nothing is changed
const addedSettings = [];
if (update && !done.added.includes('workflow.config.json')) {
  const cfgPath = join(target, 'workflow.config.json');
  const mine = JSON.parse(readFileSync(cfgPath, 'utf8'));
  const kits = { ...JSON.parse(fill(readFileSync(join(kit, 'starter', 'workflow.config.json'), 'utf8'))), ...(LANGS[lang].config ?? {}) };
  for (const [k, v] of Object.entries(kits)) {
    if (!(k in mine)) {
      mine[k] = k === 'checks' ? v.filter((c) => c.name !== 'lint') : v;
      // a project that has a UI framework draws its /ui variants as components, as a new install would set it
      if (k === 'ui' && framework) mine.ui = { ...v, boards: 'components' };
      addedSettings.push(k === 'ui' && framework ? 'ui (boards: components, because the project has a UI framework)' : k);
      continue;
    }
    // an import rule the kit has and the project lacks, by its name (a folder the project does not have matches nothing)
    if (k === 'boundaries') for (const r of v) {
      const same = mine.boundaries.find((x) => x.name === r.name);
      if (!same) { mine.boundaries.push(r); addedSettings.push(`import rule: ${r.name}`); }
      // the kit's own rule, by its name, that the kit has since given a stated exception: the exception is added, nothing else
      else if (r.except && !same.except) { same.except = r.except; addedSettings.push(`import rule "${r.name}": except ${r.except.join(', ')}`); }
    }
    if (k === 'checks') for (const c of v) if (c.name !== 'lint' && !mine.checks.some((x) => x.name === c.name)) { mine.checks.push(c); addedSettings.push(`checks: ${c.name}`); }
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof mine[k] === 'object') for (const [kk, vv] of Object.entries(v)) if (!(kk in mine[k]) && ['functions', 'copies', 'session'].includes(k)) { mine[k][kk] = vv; addedSettings.push(`${k}.${kk}`); }
  }
  if (addedSettings.length) writeFileSync(cfgPath, JSON.stringify(mine, null, 2) + '\n');
}

// the GitHub workflow, when this run wrote it (new, or replaced by --force): the language's own setup steps (`ci` in starter/lang.json) go where the
// file says "another language: add its toolchain here"
const ciPath = join(target, '.github', 'workflows', 'gate.yml');
if (existsSync(ciPath) && [...done.added, ...done.replaced].some((f) => f.replace(/\\/g, '/') === '.github/workflows/gate.yml')) {
  const steps = (LANGS[lang].ci ?? []).map((l) => `      ${l}\n`).join('');
  writeFileSync(ciPath, readFileSync(ciPath, 'utf8').replace(/^[ \t]*# another language: add its toolchain here.*\r?\n/m, steps));
  stamp.set('.github/workflows/gate.yml', hash(readFileSync(ciPath, 'latin1')));
}

// Dependabot: one grouped pull request a week per kind of dependency, so versions never fall far behind (written once, then yours)
const botPath = join(target, '.github', 'dependabot.yml');
// with Renovate (renovate.json, from the starter) Dependabot's version updates would double every pull request: alerts need no file
if (!existsSync(botPath) && !existsSync(join(target, 'renovate.json'))) {
  const kinds = [LANGS[lang].dependabot ?? 'npm', 'github-actions', ...(modules.includes('deploy') ? ['docker'] : [])];
  mkdirSync(dirname(botPath), { recursive: true });
  writeFileSync(botPath, '# Dependency updates: one small pull request a week per kind; the gate runs on each. Merge it on GitHub when it is green.\nversion: 2\nupdates:\n'
    + kinds.map((k) => `  - package-ecosystem: ${k}\n    directory: /\n    schedule:\n      interval: weekly\n    cooldown:\n      default-days: 7\n    groups:\n      all:\n        patterns: ["*"]\n`).join(''));
  done.added.push('.github/dependabot.yml');
}

let lfHint = '';
// .gitignore lines
const giPath = join(target, '.gitignore');
const have = new Set((existsSync(giPath) ? readFileSync(giPath, 'utf8') : '').split(/\r?\n/).map((l) => l.trim()));
const add = [...readFileSync(join(kit, 'starter', 'gitignore.txt'), 'utf8').split(/\r?\n/), ...(LANGS[lang].gitignore ?? [])].filter((l) => l.trim() && !have.has(l.trim()));
if (add.length) writeFileSync(giPath, (existsSync(giPath) ? readFileSync(giPath, 'utf8').replace(/\n?$/, '\n') : '') + add.join('\n') + '\n');

// line endings: LF everywhere, in the repository and on disk, whatever git's own setting says (Git for Windows sets
// core.autocrlf=true, which made every `git add` warn "LF will be replaced by CRLF"); Windows scripts are the one exception.
// Written once, then yours; a project's own .gitattributes is never changed.
const gaPath = join(target, '.gitattributes');
if (!existsSync(gaPath)) {
  writeFileSync(gaPath, '# Line endings: LF in the repository and on disk on every computer, whatever git\'s own core.autocrlf says.\n'
    + '# Windows scripts are the exception: cmd.exe wants CRLF.\n* text=auto eol=lf\n*.cmd text eol=crlf\n*.bat text eol=crlf\n'
    + '*.png binary\n*.jpg binary\n*.gif binary\n*.ico binary\n*.webp binary\n*.woff2 binary\n*.pdf binary\n');
  done.added.push('.gitattributes');
} else if (update && !/eol=lf/.test(readFileSync(gaPath, 'utf8'))) {
  lfHint = '  .gitattributes has no `* text=auto eol=lf`: without it git on Windows warns "LF will be replaced by CRLF" on every add';
}

// the map module: the request pages' file, so the map opens and the gate's check passes from the start
if (existsSync(join(target, 'docs', 'flow', 'build-requests.mjs'))) spawnSync(process.execPath, ['docs/flow/build-requests.mjs'], { cwd: target, encoding: 'utf8' });

// the OpenCode commands (and, when missing, opencode.jsonc), so every agent can run /setup at once
const harness = spawnSync(process.execPath, ['tools/workflow/harness.mjs'], { cwd: target, encoding: 'utf8' });
const harnessLine = harness.status === 0 ? harness.stdout.trim() : `harness: not written (${(harness.stderr || harness.stdout).trim().split('\n')[0]}); run npm run harness in the project`;

writeFileSync(markFile, `# which ai-workflow-kit this project came from (install.mjs writes it; --force and --update renew it). The sha lines: each machinery file as the kit wrote it.\nversion=${kitVersion}\nmodules=${modules.join(',')}\nsections=${[...sectionsDone].join(',')}\n${[...stamp].sort().map(([f, h]) => `sha ${h} ${f}`).join('\n')}\n`);
console.log(before ? `Updated ${target} from kit ${before} to ${kitVersion} (modules: ${modules.join(', ') || 'none'})` : `Installed kit ${kitVersion} into ${target} (modules: ${modules.join(', ') || 'none'})`);
if (before && !force && !update) console.log('  without --force the machinery files that exist were kept: run again with --force to take the new version of them');
console.log(`  added ${done.added.length} files, replaced ${done.replaced.length}, kept ${done.kept.length} that already existed${done.kept.length && !force ? ' (--force replaces the machinery, never your starter files)' : ''}`);
console.log(`  ${harnessLine}`);
if (update) {
  if (addedSettings.length) console.log(`  settings added to workflow.config.json: ${addedSettings.join(', ')}`);
  if (claudeAdded.length) console.log(`  rules added to .claude/settings.local.json: ${claudeAdded.join(', ')}`);
  if (lfHint) console.log(lfHint);
  if (done.yours.length && !written.size) console.log('  this project has no record yet of what the kit wrote (it was installed before 1.5), so every file that differs is listed below; from now on only the ones you changed are.');
  if (done.yours.length) console.log(`  kept, because the project changed them (${done.yours.length}); the kit's version differs. Compare, then take the kit's with --take <path,path>:\n${done.yours.map((f) => `    ${f}`).join('\n')}`);
  if (lang === 'ts' && !JSON.parse(readFileSync(join(target, 'workflow.config.json'), 'utf8')).checks?.some((c) => c.name === 'lint')) console.log('  not switched on: lint (Biome). It reformats the code once, so it is your call: npx biome check --write src tests, then add { "name": "lint", "command": "npx --no-install biome check src tests", "when": ["src/**", "tests/**", "biome.json"] } to "checks".');
  if (framework && JSON.parse(readFileSync(join(target, 'workflow.config.json'), 'utf8')).ui?.boards === 'html') console.log('  not changed: "ui": { "boards": "html" } although the project has a UI framework. Set it to "components" to have /ui draw its variants as real components.');
  console.log('  then: step 1 below, npm run map, node tools/workflow/gate.mjs --update-baseline (what the new checks find today becomes the baseline; only new ones fail), npm run gate:all');
}
if (update) { console.log(`  step 1: ${lang === 'ts' ? `npm i -D tsx typescript @types/node knip${happyDom}` : LANGS[lang].needs}`); process.exit(0); }
console.log(`
Next, in ${target}:
  1. ${lang === 'ts' ? `npm i -D tsx typescript @types/node knip @biomejs/biome${happyDom}` : `Install ${LANGS[lang].name}: ${LANGS[lang].needs}`}
  2. gh auth login && gh auth refresh -s project   (once per computer, for the board)
  3. Open Claude Code (or OpenCode) in the folder and type /setup: it asks about the app, then fills CLAUDE.md, the config,
     the guide and docs/ARCHITECTURE.md, writes the OpenCode commands (npm run harness), makes the board (npm run board -- --init)
     and runs the gate.
  4. Then /idea <the first thing to build> and /work <n>; after the yes, /build <topic> in a new chat.`);
