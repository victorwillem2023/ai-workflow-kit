#!/usr/bin/env node
// Installs the workflow kit into a project.
//   node install.mjs <target-folder> --project "My App" --repo owner/name [--prefix myapp] [--modules ui,security,testing,dev] [--force]
// 1. payload/  (skills, tools/workflow, scripts, tests/workflow, docs/WORKFLOW.md): the generic machinery. Copied as is, with
//    {{PROJECT}} {{REPO}} {{OWNER}} {{PREFIX}} filled in. Existing files are kept unless --force.
// 2. starter/  (CLAUDE.md, workflow.config.json, docs/STYLE.md, docs/SECURITY.md, src/web/CLAUDE.md ...): YOUR files to edit.
//    Copied only when missing, never overwritten (not even with --force).
// 3. modules/<name>/{payload,starter}  (ui, security, testing, dev; all by default, or pick with --modules): the same two kinds.
//    ui = /ui skill, screenshots, style sheet, DOM helper, board template, STYLE.md; security = network guard, safe fetch, input guards,
//    debug-handle gate and their tests, SECURITY.md; testing = fake clock, fakes pattern; dev = dev.cmd, start.cmd, dev-check.
// 4. package.json gets the gate/gate:all/map/board scripts; .gitignore gets the kit's lines. Nothing is committed.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const kit = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const target = args[0] && !args[0].startsWith('--') ? resolve(args[0]) : undefined;
const force = args.includes('--force');
const ALL = ['ui', 'security', 'testing', 'dev'];
const modules = opt('--modules') ? opt('--modules').split(',').map((m) => m.trim()).filter(Boolean) : ALL;
for (const m of modules) if (!ALL.includes(m)) { console.error(`Unknown module "${m}". Modules: ${ALL.join(', ')}`); process.exit(1); }
const repo = opt('--repo');
const project = opt('--project');
if (!target || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !project) {
  console.error('Usage: node install.mjs <target-folder> --project "My App" --repo owner/name [--prefix myapp] [--modules ui,security,testing,dev] [--force]');
  process.exit(1);
}
if (!existsSync(target)) { console.error(`${target} does not exist. Make the project folder (and git init) first.`); process.exit(1); }
const prefix = opt('--prefix') ?? repo.split('/')[1].toLowerCase().replace(/[^a-z0-9-]/g, '-');
const vars = { PROJECT: project, REPO: repo, OWNER: repo.split('/')[0], PREFIX: prefix };
const fill = (text) => text.replace(/\{\{(PROJECT|REPO|OWNER|PREFIX)\}\}/g, (_, k) => vars[k]);
const TEXT = /\.(md|mjs|ts|json|mts|txt|html|css)$/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p); else yield p;
  }
}

const done = { added: [], kept: [], replaced: [] };
function copyTree(from, overwrite) {
  for (const src of walk(from)) {
    const rel = relative(from, src);
    const dest = join(target, rel);
    const exists = existsSync(dest);
    if (exists && !overwrite) { done.kept.push(rel); continue; }
    mkdirSync(dirname(dest), { recursive: true });
    const raw = readFileSync(src);
    writeFileSync(dest, TEXT.test(src) ? fill(raw.toString('utf8')) : raw);
    (exists ? done.replaced : done.added).push(rel);
  }
}

copyTree(join(kit, 'payload'), force);
copyTree(join(kit, 'starter'), false);
for (const m of modules) {
  if (existsSync(join(kit, 'modules', m, 'payload'))) copyTree(join(kit, 'modules', m, 'payload'), force);
  if (existsSync(join(kit, 'modules', m, 'starter'))) copyTree(join(kit, 'modules', m, 'starter'), false);
}

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

// package.json scripts
const pkgPath = join(target, 'package.json');
const scripts = JSON.parse(readFileSync(join(kit, 'starter', 'package-scripts.json'), 'utf8'));
const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : { name: prefix, private: true, type: 'module' };
pkg.scripts = { ...scripts, ...(pkg.scripts ?? {}) };
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// .gitignore lines
const giPath = join(target, '.gitignore');
const have = new Set((existsSync(giPath) ? readFileSync(giPath, 'utf8') : '').split(/\r?\n/).map((l) => l.trim()));
const add = readFileSync(join(kit, 'starter', 'gitignore.txt'), 'utf8').split(/\r?\n/).filter((l) => l.trim() && !have.has(l.trim()));
if (add.length) writeFileSync(giPath, (existsSync(giPath) ? readFileSync(giPath, 'utf8').replace(/\n?$/, '\n') : '') + add.join('\n') + '\n');

console.log(`Installed into ${target} (modules: ${modules.join(', ') || 'none'})`);
console.log(`  added ${done.added.length} files, replaced ${done.replaced.length}, kept ${done.kept.length} that already existed${done.kept.length && !force ? ' (--force replaces the machinery, never your starter files)' : ''}`);
console.log(`
Next, in ${target}:
  1. Edit workflow.config.json (roots, test glob, commands, boundaries, security folders, board.project, session ports).
  2. Fill CLAUDE.md, then the folder CLAUDE.md files you need. Replace every <...> in them.
  3. Create the GitHub board (see tools/workflow/README.md, "Board"): a Project with a Status field with the columns from the config,
     the type labels (ui, feature, bug, workflow) and your area labels; list the area labels in .claude/skills/idea/SKILL.md.
     gh auth login && gh auth refresh -s project
  4. npm run map && node tools/workflow/gate.mjs --update-baseline && npm run gate && npm run board -- --check
  5. Dev dependencies the modules use: npm i -D tsx typescript @types/node @happy-dom/global-registrator
     (the ui module's tests need happy-dom; the security module's tests and the gate's tests are plain node:test + tsx)
  6. Commit once: "Workflow: ..."`);
