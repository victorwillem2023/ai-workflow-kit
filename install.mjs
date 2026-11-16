#!/usr/bin/env node
// Installs the workflow kit into a project.
//   node install.mjs <target-folder> --project "My App" --repo owner/name [--prefix myapp] [--modules ui,security,testing,dev] [--with ai] [--lang rust] [--force]
//   node install.mjs <target-folder> --project ... --repo ... --check     list the machinery files that differ from the kit; changes nothing
//   node install.mjs <target-folder> --project ... --repo ... --update    bring an existing project up to this kit without losing its own changes:
//       a machinery file the project never changed is replaced, one it changed is kept and listed (--take <path,path> takes the kit's
//       for those), missing files are added, and settings the kit has and the project lacks are added to workflow.config.json.
//   --lean: only the build loop (the gate, the board, the map, sessions and the skills setup, next, idea, work, spec, build,
//       ship, review, check, find, docs, lesson), no modules unless --modules names them, and none of the parts (shape, spike,
//       tidy, estimate, advise, launch, market, retro, secops, setup-check) unless --with names them. Remembered: an update stays
//       lean (--with <part> adds one, --full takes every part; modules stay as chosen), and a part or module left out is removed when unchanged.
//   --modules none: no modules at all.
//   --lang ts (default) | rust | python | go: the check and test commands of starter/lang.json; a language other than ts
//   leaves the TypeScript starter files out (tsconfig.json, the .ts examples of the modules).
// 1. payload/  (skills, tools/workflow, scripts, tests/workflow, docs/workflow/WORKFLOW.md, docs/workflow/TOKENS.md): the generic machinery. Copied as is, with
//    {{PROJECT}} {{REPO}} {{OWNER}} {{PREFIX}} filled in. Existing files are kept unless --force.
// 2. starter/  (CLAUDE.md, workflow.config.json, tsconfig.json, the guide, docs/code, folder CLAUDE.md files, STYLE.md ...): YOUR files to edit.
//    Copied only when missing, never overwritten (not even with --force).
// 3. modules/<name>/{payload,starter}  (ui, security, testing, dev; all by default, or pick with --modules): the same two kinds.
//    ui = /ui skill, screenshots, style sheet, DOM helper, board template, STYLE.md; security = network guard, safe fetch, input guards,
//    debug-handle gate and their tests, SECURITY.md; testing = fake clock, fakes pattern; dev = dev.cmd, start.cmd, dev-check;
//    map = the app map (docs/flow: a page of yes/no trees of what the app decides) and the request pages (docs/REQUESTS.md);
//    deploy = a Dockerfile, npm run deploy / smoke / rollback (scripts/deploy.mjs), docs/run/DEPLOY.md.
// 4. package.json gets the test/test:full/typecheck/gate/gate:all/map/board/harness scripts (the project's own win, except npm's
//    placeholder test); .gitignore gets the kit's lines; .github/dependabot.yml (weekly updates) is written when missing. The OpenCode commands are written last (`npm run harness` again after a skill changes).
//    Nothing is committed.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { movePathsBack, undoCorrections } from './doc-layout.mjs';
import { runtimeNode } from './payload/tools/workflow/lib/updates.mjs';
import { addClaudeRules, machineryDiffs, rewriteJson, settleConfig, writeProjectFiles } from './install-config.mjs';
import { ALL, inList, list, OPTIONAL, PARTS, readChoices, recordLines } from './install-choices.mjs';
import { STAGE_FOLDERS, mergeKitBlocks, rewriteChangedRules, keepNamedStageDocs, moveOldDocs, nameHelpersInCodeDocs, pruneStageCopies, stageSetup, unmarkEnteredStages } from './install-docs.mjs';

const kit = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt =(name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
// every choice, from the flags, then the project's record, then what the project says (install-choices.mjs): run again, the same
// command converges on the same result (a project with the record is updated; a flag changes the record, never resets the rest)
const choices = readChoices(args, kit);
if (choices.error && !['usage', 'repo'].includes(choices.error)) { console.error(choices.error); process.exit(1); }
const { target, mark, force, update, take, skip, lang, LANGS, lean, withs, modules, parts } = choices;
const skippedPart = (key) => Object.entries(PARTS).some(([p, paths]) => !parts.includes(p) && paths.some((x) => key === x || key.startsWith(x)));
// In a lean project the installed text never points at what is not there: a command of a part left out gets "(not installed)"
// after it, and a guide left out loses its backticks (so the docs check does not take it for a file that should exist) and says
// which part brings it. Done when the file is written, so an update with --with <part> writes it back unmarked.
const absent = Object.entries(PARTS).filter(([p]) => !parts.includes(p));
const absentSkills = absent.flatMap(([, paths]) => paths.map((x) => /^\.claude\/skills\/([\w-]+)\/$/.exec(x)?.[1]).filter(Boolean));
// (a guide in a subject folder too: docs/run/LAUNCH.md since kit 2.9)
const absentDocs = absent.flatMap(([p, paths]) => paths.filter((x) => /^docs\/([\w-]+\/)?[\w-]+\.md$/.test(x)).map((x) => [x, p]));
// npm scripts that run a tool of a part left out (launch-check without market): not added to package.json, and not pointed at
const scriptTool = (cmd) => /node (tools\/workflow\/[\w./-]+\.mjs)/.exec(cmd)?.[1];
const absentScripts = Object.entries(JSON.parse(readFileSync(join(kit, 'starter', 'package-scripts.json'), 'utf8'))).filter(([, cmd]) => scriptTool(cmd) && skippedPart(scriptTool(cmd))).map(([name]) => name);
function markAbsent(text) {
  if (!absent.length && !stageDocs.length && !moduleDocs.length) return text;
  let t = text;
  // a doc of a stage not reached yet: no backticks (the docs check would take it for a missing file), and the command that brings it
  for (const [doc, stage, by] of stageDocs) t = t.replaceAll(`\`${doc}\``, `${doc} (comes with the ${stage} stage: ${by})`);
  // a doc of a module left out (a lean project has no security, ui or production module): the same, with the module that brings it
  for (const [doc, m] of moduleDocs) t = t.replaceAll(`\`${doc}\``, `${doc} (with the ${m} module, not installed)`);
  if (absentSkills.length) {
    const names = absentSkills.join('|');
    t = t.replace(new RegExp(`\`/(${names})\\b([^\`\\n]*)\``, 'g'), (m) => `${m} (not installed)`);
    t = t.replace(new RegExp(`(^|[\\s("'])/(${names})\\b(?![\\w-]| \\(not)`, 'gm'), '$1/$2 (not installed)');
  }
  for (const [doc, part] of absentDocs) t = t.replaceAll(`\`${doc}\``, `${doc} (with the ${part} part, not installed)`);
  if (absentScripts.length) t = t.replace(new RegExp(`\`(npm run (?:${absentScripts.join('|')})\\b[^\`\\n]*)\``, 'g'), '$1 (not installed)');
  return t;
}
const { repo, project, prefix } = choices;
if (choices.error) {
  console.error('Usage: node install.mjs <target-folder> [--project "My App"] [--repo owner/name] [--prefix myapp] [--modules ui,security,testing,dev,map,deploy] [--lang ts|rust|python|go] [--force]\n'
    + 'The name, the repo, the prefix and the language are found when not given (package.json or the manifest, the git remote, the folder); without a GitHub remote, give --repo.');
  process.exit(1);
}
if (!existsSync(target)) { console.error(`${target} does not exist. Make the project folder (and git init) first.`); process.exit(1); }
// --dry-run: the same run on a copy of the project, and what it changed there (install-plan.mjs); nothing here is written
if (args.includes('--dry-run')) process.exit((await import('./install-plan.mjs')).dryRun({ kit, target, args: args.filter((a) => a !== '--dry-run') }));
const vars = {
  PROJECT: project, REPO: repo, OWNER: repo.split('/')[0], PREFIX: prefix,
  TESTS: LANGS[lang].config?.tests ?? LANGS[lang].tests ?? 'tests/*.test.ts',
  TEST_TIPS: lang === 'ts' && modules.includes('testing') ? ' A test that waits on a\n  timeout wraps its body in `clocked()` (`tests/clock.ts`), so a 4 s wait costs milliseconds.' : '',
};
// gate.yml's "another language" line is where the language's own CI steps go (starter/lang.json, ci): filled in the same pass as
// the rest, so the file the project has is exactly the one the kit wrote, and an update and --check compare it like any other
const ciSteps = (LANGS[lang].ci ?? []).map((l) => `      ${l}\n`).join('');
const fill = (text) => text.replace(/\{\{(PROJECT|REPO|OWNER|PREFIX|TESTS|TEST_TIPS)\}\}/g, (_, k) => vars[k])
  .replace(/^[ \t]*# another language: add its toolchain here.*\r?\n/m, ciSteps);

// Stage folders (kit 2.9.1): a stage's docs are not written until the project reaches it (docs/run/ with /launch, docs/market/
// with /market); what a stage or a module left out would bring is marked where it is named (install-docs.mjs)
for (const s of list(opt('--stage'))) if (!(s in STAGE_FOLDERS)) { console.error(`Unknown stage "${s}". Stages: ${Object.keys(STAGE_FOLDERS).join(', ')}`); process.exit(1); }
const { stages, skippedStage, stageDocs, moduleDocs } = stageSetup({ kit, target, mark, update, asked: list(opt('--stage')), fill, modules, allModules: [...ALL, ...OPTIONAL], list });
// files whose {{PROJECT}}-style placeholders are filled in (Helm's and GitHub's own {{ ... }} are left alone: only the names in `fill`)
const TEXT = /(\.(md|mjs|js|ts|json|mts|txt|html|css|toml|cmd|ya?ml|tpl)|Dockerfile)$/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p); else yield p;
  }
}

// --check: which machinery files differ from this kit (line endings aside)? Nothing is written (install-config.mjs)
if (args.includes('--check')) {
  const lines = machineryDiffs({ kit, target, modules, fill: (t, src) => (/\.md$/.test(src) ? markAbsent(fill(t)) : fill(t)), text: TEXT, walk, chosenOut: (rel) => inList(skip, rel) || skippedPart(rel) || skippedStage(rel) });
  console.log(lines.length ? `${lines.join('\n')}\n${lines.length} machinery files differ from the kit (--force takes the kit's; a change worth keeping goes into the kit first)` : "the machinery is the kit's");
  process.exit(lines.length ? 1 : 0);
}

const kitVersion = readFileSync(join(kit, 'VERSION'), 'utf8').trim();
// where the kit is for later (stage.mjs --enter runs it again): --kit-path when this run is from a temporary copy; and the tag and
// the repository, so the right version can be fetched where the path does not exist
// where the kit is on this computer, for stage.mjs --enter: this clone's git config (workflow.kit), never the committed record
const kitPath = resolve(opt('--kit-path') ?? kit).replace(/\\/g, '/');
const kitRepo = spawnSync('git', ['-C', kit, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout?.trim() || '';
const markFile = join(target, '.workflow-kit');
const before = existsSync(markFile) ? (/version=(\S+)/.exec(readFileSync(markFile, 'utf8'))?.[1] ?? 'unknown') : null;
const done = { added: [], kept: [], replaced: [], yours: [], removed: [], orphans: [], staged: [], stageKept: [], stageNamed: [], helpers: [], skipped: [] };
// what a stage not reached yet would have written: an update takes away the untouched copies an older kit wrote there
const stageSkipped = new Map();
const shipped = new Set(); // every machinery file this run of the kit ships, to find the ones an older kit wrote and this one dropped
// a project that already has a UI framework builds its screens with components: the ui module's own DOM helper and its test stay out
const pkgBefore = existsSync(join(target, 'package.json')) ? JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')) : {};
const framework = ['react', 'preact', 'vue', 'svelte', 'solid-js', 'next', '@angular/core'].some((d) => d in { ...(pkgBefore.dependencies ?? {}), ...(pkgBefore.devDependencies ?? {}) });
const happyDom = modules.includes('ui') && !framework ? ' @happy-dom/global-registrator' : '';
// the ai module's wrapper uses the official Anthropic SDK and checks answers with zod (step 1 adds them; they run in production)
const aiLibs = modules.includes('ai') ? ' && npm i @anthropic-ai/sdk zod' : '';
// the Node types of the Node the project runs (.tool-versions), never newer: the gate's *versions* check holds that
const readIn = (f) => (existsSync(join(target, f)) ? readFileSync(join(target, f), 'utf8') : undefined);
// (the project's own say first: .tool-versions, package.json engines, the Dockerfile, .nvmrc; only then the kit's own pin)
const projectNode = runtimeNode({ pkg: pkgBefore, toolVersions: readIn('.tool-versions'), dockerfile: readIn('Dockerfile'), nvmrc: readIn('.nvmrc') ?? readIn('.node-version') });
const nodeMajor = (projectNode ?? runtimeNode({ toolVersions: readFileSync(join(kit, 'starter', '.tool-versions'), 'utf8') }))?.major;
const nodeTypes = nodeMajor ? `@types/node@^${nodeMajor}` : '@types/node';
// what each machinery file looked like when the kit last wrote it ("sha <hash> <file>" lines in .workflow-kit), so an update can
// tell a file the project changed from one only the kit changed
const hash = (text) => createHash('sha1').update(String(text).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
const written = new Map((existsSync(markFile) ? readFileSync(markFile, 'utf8') : '').split(/\r?\n/).map((l) => /^sha (\S+) (.+)$/.exec(l)).filter(Boolean).map((m) => [m[2], m[1]]));
const stamp = new Map(written);
// A kit file nobody changed: the same as the kit wrote it (its stamp), or so once the doc paths kit 2.9 moved are put back (an update
// from before 2.9 rewrites them in every file, the kit's too, and that is not the project changing the file).
const untouched = (key, text) => written.has(key) && [text, movePathsBack(text), undoCorrections(text), movePathsBack(undoCorrections(text))]
  .some((t) => written.get(key) === hash(t));
// --update: an older project's docs move into their folders, and old doc paths are rewritten, before anything is copied
// (install-docs.mjs)
let claudeGrowth = 0; // bytes the longer doc paths added to CLAUDE.md (its budget grows by exactly that, below)
if (update) {
  const m = moveOldDocs({ target, written, stamp });
  claudeGrowth = m.claudeGrowth;
  if (m.moved.length || m.rewritten.length || m.specsNaming.length) done.movedDocs = { count: m.moved.length, rewritten: m.rewritten, specs: m.specsNaming };
}
// starter files that are helpers the kit's rules (CLAUDE.md sections) name, not example code: an update adds them when a project
// does not have them (TypeScript only; a project in another language writes its own, CLAUDE.md says what they do)
const HELPERS = lang === 'ts' ? ['src/server/trace.ts', 'src/server/errors.ts', 'src/web/report.ts', 'tests/production/debugging.test.ts'] : [];
const overwriteOnly = (from) => from.endsWith('payload');
function copyTree(from, overwrite) {
  for (const src of walk(from)) {
    const rel = relative(from, src);
    // another language: the TypeScript starter files stay out (the machinery's own tests are payload and stay in)
    if (lang !== 'ts' && !overwriteOnly(from) && (/\.tsx?$/.test(rel) || rel === 'tsconfig.json')) continue;
    if (rel === 'lang.json') continue;
    // the server's folder note goes with the TypeScript server files (another language lays out its own folders)
    if (lang !== 'ts' && rel.replace(/\\/g, '/') === 'src/server/CLAUDE.md') continue;
    if (framework && /^(src[\\/]web[\\/]dom\.ts|tests[\\/]dom\.test\.ts)$/.test(rel)) continue;
    // --update: the example code of the starter (src, tests) is for a new project; an existing one gets only docs and settings it lacks
    // (a helper the kit's rules name, like the request id and the error answer, is not an example: it is added when missing, never replaced)
    if (update && !overwriteOnly(from) && /^(src|tests|cmd|internal|pkg)[\\/]/.test(rel) && !existsSync(join(target, rel)) && !HELPERS.includes(rel.replace(/\\/g, '/'))) continue;
    const dest = join(target, rel);
    const exists = existsSync(dest);
    const raw = readFileSync(src);
    // a Windows script is written with CRLF, as .gitattributes checks it out, so git has nothing to convert or warn about
    const filled = TEXT.test(src) ? fill(raw.toString('utf8')) : raw;
    const marked = /\.md$/.test(src) ? markAbsent(filled) : filled;
    const next = /\.cmd$/.test(src) ? marked.replace(/\r?\n/g, '\r\n') : marked;
    const key = rel.replace(/\\/g, '/');
    const machinery = overwriteOnly(from);
    // a part left out: its machinery is not shipped, and its starter pages (docs/market/MARKET.md, docs/company/ROADMAP.md) are not made
    if (skippedPart(key)) continue;
    // a file the project skips: not written, and kept out of the clean-up of files the kit no longer ships
    if (inList(skip, key)) { if (machinery) shipped.add(key); done.skipped.push(key); continue; }
    // a stage the project has not reached: not written (and not an orphan either: it comes back when the stage is entered)
    if (skippedStage(key)) { stageSkipped.set(key, { next, machinery }); if (machinery) shipped.add(key); continue; }
    if (machinery) shipped.add(key);
    if (exists && machinery && update && !overwrite) {
      // --update: the same already, or untouched since the kit wrote it (then the kit's new one is taken), or the project's own
      const now = hash(readFileSync(dest, TEXT.test(src) ? 'utf8' : 'latin1'));
      const fresh = hash(TEXT.test(src) ? next : raw.toString('latin1'));
      if (now === fresh) { stamp.set(key, fresh); done.kept.push(rel); continue; }
      if (!untouched(key, readFileSync(dest, TEXT.test(src) ? 'utf8' : 'latin1')) && !inList(take, key)) { done.yours.push(key); continue; }
    } else if (exists && !overwrite) { done.kept.push(rel); continue; }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, next);
    if (machinery) stamp.set(key, hash(TEXT.test(src) ? next : raw.toString('latin1')));
    (exists ? done.replaced : done.added).push(rel);
    if (update && !exists && HELPERS.includes(key)) done.helpers.push(key);
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
// --update: a machinery file an older kit wrote and this one no longer ships (renamed, removed, or its module dropped) is taken
// out when the project never changed it, with its folder when that is left empty; a changed one is kept and named
if (update) {
  for (const [key, was] of written) {
    const path = join(target, key);
    if (shipped.has(key) || !existsSync(path)) continue;
    if (!untouched(key, readFileSync(path, TEXT.test(key) ? 'utf8' : 'latin1'))) { done.orphans.push(key); continue; }
    rmSync(path);
    stamp.delete(key);
    done.removed.push(key);
    for (let dir = dirname(path); dir.startsWith(target) && dir !== target && readdirSync(dir).length === 0; dir = dirname(dir)) rmSync(dir, { recursive: true });
  }
}

// A stage not reached: its untouched copies go and what the project's own pages point at stays; a helper an update added is named
// in the code doc that covers it; a stage now entered gets CLAUDE.md's links back (install-docs.mjs)
if (update) pruneStageCopies({ target, stageSkipped, untouched, hash, stamp, done });
if (stageSkipped.size) keepNamedStageDocs({ target, stageSkipped, hash, stamp, done });
nameHelpersInCodeDocs({ target, done });
unmarkEnteredStages({ target, stages });
const rulesRewritten = update ? rewriteChangedRules({ target, kit, fill }) : [];

// a module's own section of CLAUDE.md (modules/<name>/claude-section.md): added once, at the end. "Once" is remembered in
// .workflow-kit (sections=), so a section the owner renamed, rewrote or took out is never added again; a project from before that
// record is recognised by the heading or by the first file or command the section names.
const sectionsDone = new Set((/^sections=(.*)$/m.exec(existsSync(markFile) ? readFileSync(markFile, 'utf8') : '')?.[1] ?? '').split(',').filter(Boolean));
// A module may have more than one (claude-section-<name>.md, remembered as <module>:<name>), so a section added later still reaches
// a project that has the first one.
const sectionFiles = (m) => (existsSync(join(kit, 'modules', m)) ? readdirSync(join(kit, 'modules', m)).filter((f) => /^claude-section(-[\w-]+)?\.md$/.test(f)).sort() : [])
  .map((f) => ({ key: f === 'claude-section.md' ? m : `${m}:${f.slice('claude-section-'.length, -3)}`, part: join(kit, 'modules', m, f) }));
for (const { key: m, part } of modules.flatMap(sectionFiles)) {
  if (!existsSync(part)) continue;
  // a first line `<!-- into: <folder note> ... -->` puts the section in that folder's CLAUDE.md when the project has it (read when
  // working there, so the root one, read in every chat, stays inside its budget); else in the root one
  const raw = readFileSync(part, 'utf8');
  const into = /^<!-- into: (\S+)/.exec(raw)?.[1];
  const claude = into && existsSync(join(target, into)) ? join(target, into) : join(target, 'CLAUDE.md');
  if (!existsSync(claude)) continue;
  const text = markAbsent(fill(raw.replace(/^<!-- into: .*-->\r?\n/, '')));
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

// Claude Code's settings: the kit's allow and deny rules a project lacks are added (install-config.mjs)
const claudeAdded = addClaudeRules({ target, kit });

// package.json scripts
const pkgPath = join(target, 'package.json');
const scripts = JSON.parse(readFileSync(join(kit, 'starter', 'package-scripts.json'), 'utf8'));
const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : { name: prefix, private: true, type: 'module' };
// the project's own scripts win, except npm's placeholder test script ("echo \"Error: no test specified\" && exit 1")
Object.assign(scripts, LANGS[lang].scripts ?? {});
// a module's own scripts (modules/<name>/package-scripts.json)
for (const m of modules) if (existsSync(join(kit, 'modules', m, 'package-scripts.json'))) Object.assign(scripts, JSON.parse(readFileSync(join(kit, 'modules', m, 'package-scripts.json'), 'utf8')));
for (const name of absentScripts) delete scripts[name];
const own = { ...(pkg.scripts ?? {}) };
if (/no test specified/.test(own.test ?? '')) delete own.test;
// the project's scripts first and in their order, the kit's it lacks after them; written back in its own layout, and only when changed
pkg.scripts = { ...own, ...Object.fromEntries(Object.entries(scripts).filter(([k]) => !(k in own))) };
const writePkg = () => {
  const was = existsSync(pkgPath) ? readFileSync(pkgPath, 'utf8') : null;
  const now = was ? rewriteJson(was.replace(/\r\n/g, '\n'), pkg) : `${JSON.stringify(pkg, null, 2)}\n`;
  if (now !== was?.replace(/\r\n/g, '\n')) writeFileSync(pkgPath, now);
};
writePkg();

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
    if (!own.typecheck) { pkg.scripts.typecheck = 'tsc --noEmit -p tsconfig.gate.json'; writePkg(); }
    done.added.push('tsconfig.gate.json');
  }
}

// workflow.config.json: a fresh one fitted to the framework and language; on --update the settings the kit has and the project
// lacks; each module's own settings (install-config.mjs)
const addedSettings = settleConfig({ target, kit, fill, langConfig: LANGS[lang].config, framework, modules, update, justWritten: done.added.includes('workflow.config.json'), claudeGrowth });

// a first install into a project with its own CLAUDE.md: the kit's parts it lacks go at its end, between their markers
const kitPartsAdded = !update && done.kept.includes('CLAUDE.md') ? mergeKitBlocks({ target, kit, fill }) : [];

// the project files written once, then the project's: Dependabot (without Renovate), .gitignore lines, .gitattributes
// (install-config.mjs)
const lfHint = writeProjectFiles({ target, kit, lang, langs: LANGS, modules, update, done, projectNode });

// the map module: the request pages' file, so the map opens and the gate's check passes from the start
if (existsSync(join(target, 'docs', 'flow', 'build-requests.mjs'))) spawnSync(process.execPath, ['docs/flow/build-requests.mjs'], { cwd: target, encoding: 'utf8' });

// the OpenCode commands (and, when missing, opencode.jsonc), so every agent can run /setup at once
const harness = spawnSync(process.execPath, ['tools/workflow/harness.mjs'], { cwd: target, encoding: 'utf8' });
const harnessLine = harness.status === 0 ? harness.stdout.trim() : `harness: not written (${(harness.stderr || harness.stdout).trim().split('\n')[0]}); run npm run harness in the project`;

spawnSync('git', ['-C', target, 'config', 'workflow.kit', kitPath], { stdio: 'ignore' });
writeFileSync(markFile, `# which ai-workflow-kit this project came from and what it chose (install.mjs writes it; running it again goes by it). The sha lines: each machinery file as the kit wrote it.\n${recordLines({ version: kitVersion, kitRepo, lang, project, repo, prefix, modules, stages, skip, lean, parts, sections: [...sectionsDone] }).join('\n')}\n${[...stamp].filter(([f]) => existsSync(join(target, f))).sort().map(([f, h]) => `sha ${h} ${f}`).join('\n')}\n`);
const shape = `modules: ${modules.join(', ') || 'none'}${lean ? `; lean, parts: ${parts.join(', ') || 'none'} (add one later: --update --with <part>; every part: --update --full)` : ''}`;
console.log(before ? `Updated ${target} from kit ${before} to ${kitVersion} (${shape})` : `Installed kit ${kitVersion} into ${target} (${shape})`);
if (before && !force && !update) console.log('  without --force the machinery files that exist were kept: run again with --force to take the new version of them');
console.log(`  added ${done.added.length} files, replaced ${done.replaced.length}, kept ${done.kept.length} that already existed${done.kept.length && !force ? ' (--force replaces the machinery, never your starter files)' : ''}`);
// a first install into a project that has files at the kit's places: each is named, since the kit's rules may assume its own there
const collided = update ? [] : done.kept.filter((f) => !['package.json', 'CLAUDE.md', 'README.md', '.gitignore'].includes(f.replace(/\\/g, '/')));
if (kitPartsAdded.length) console.log(`  CLAUDE.md is yours and stays so; the kit's rules its commands rely on were added at its end, between <!-- kit: --> markers (an update keeps those current): ${kitPartsAdded.join('; ')}`);
if (collided.length) console.log(`  yours, at a place the kit also writes (kept as they are; where the kit's rules name one, compare it with the kit's in ${kit}):\n${collided.map((f) => `    ${f.replace(/\\/g, '/')}`).join('\n')}`);
if (done.skipped.length) console.log(`  skipped, as the project asked (skip= in .workflow-kit, --skip adds more): ${done.skipped.length} file${done.skipped.length === 1 ? '' : 's'}`);
// a kit file the project's ignore rules hide is never committed (a rule like *UCT.md hid docs/PRODUCT.md): written now or there before
const hidden = (spawnSync('git', ['check-ignore', '--stdin'], { cwd: target, input: [...done.added, ...done.replaced, ...done.kept].map((f) => f.replace(/\\/g, '/')).join('\n'), encoding: 'utf8' }).stdout ?? '').split('\n').filter(Boolean);
if (hidden.length) console.log(`  hidden by .gitignore, so git will not commit them (add a !<path> line, or narrow the rule):\n${hidden.map((f) => `    ${f}`).join('\n')}`);
console.log(`  ${harnessLine}`);
if (update) {
  if (addedSettings.length) console.log(`  settings added to workflow.config.json: ${addedSettings.join(', ')}`);
  if (claudeAdded.length) console.log(`  rules added to .claude/settings.local.json: ${claudeAdded.join(', ')}`);
  if (lfHint) console.log(lfHint);
  if (rulesRewritten.length) console.log(`  CLAUDE.md: the kit's own text brought up to date, yours left as it is (${rulesRewritten.join('; ')})`);
  if (done.yours.length && !written.size) console.log('  this project has no record yet of what the kit wrote (it was installed before 1.5), so every file that differs is listed below; from now on only the ones you changed are.');
  if (done.removed.length) console.log(`  removed ${done.removed.length} the kit no longer ships (unchanged since it wrote them):\n${done.removed.map((f) => `    ${f}`).join('\n')}`);
  if (done.stageNamed.length) console.log(`  kept from a stage not reached yet, because the project's own pages point at them: ${done.stageNamed.join(', ')}`);
  if (done.helpers.length) console.log(`  helpers the kit's rules name, added (never replacing one): ${done.helpers.join(', ')}`);
  if (done.staged.length) console.log(`  stages not reached yet (${Object.keys(STAGE_FOLDERS).filter((x) => !stages.includes(x)).join(', ')}): ${done.staged.length} untouched docs taken away; they come back when the stage starts (node tools/workflow/stage.mjs --enter <stage>)`);
  if (done.stageKept.length) console.log(`  kept, because the project changed them (the stage is not reached yet, but the work is yours):\n${done.stageKept.map((f) => `    ${f}`).join('\n')}`);
  if (done.movedDocs?.count) console.log(`  the docs moved into their folders (docs/workflow/, run/, market/, company/; docs/README.md lists them): ${done.movedDocs.count} files, with git`);
  if (done.movedDocs?.rewritten.length) console.log(`  old doc paths rewritten (look at the diff before committing) in:\n${done.movedDocs.rewritten.map((f) => `    ${f}`).join('\n')}`);
  if (done.movedDocs?.specs.length) console.log(`  waiting specs that name a doc at its old place, left as you approved them (the doc is at its new place now; change the spec if it lists it):\n${done.movedDocs.specs.map((f) => `    ${f}`).join('\n')}`);
  if (done.orphans.length) console.log(`  the kit no longer ships these, but the project changed them, so they stay; delete them if you do not need them:\n${done.orphans.map((f) => `    ${f}`).join('\n')}`);
  if (done.yours.length) console.log(`  kept, because the project changed them (${done.yours.length}); the kit's version differs. Compare, then take the kit's with --take <path,path>:\n${done.yours.map((f) => `    ${f}`).join('\n')}`);
  if (lang === 'ts' && !JSON.parse(readFileSync(join(target, 'workflow.config.json'), 'utf8')).checks?.some((c) => c.name === 'lint')) console.log('  not switched on: lint (Biome). It reformats the code once, so it is your call: npx biome check --write src tests, then add { "name": "lint", "command": "npx --no-install biome check --no-errors-on-unmatched src tests", "when": ["src/**", "tests/**", "biome.json"] } to "checks".');
  if (framework && JSON.parse(readFileSync(join(target, 'workflow.config.json'), 'utf8')).ui?.boards === 'html') console.log('  not changed: "ui": { "boards": "html" } although the project has a UI framework. Set it to "components" to have /ui draw its variants as real components.');
  console.log('  then: step 1 below, npm run map, node tools/workflow/gate.mjs --update-baseline (what the new checks find today becomes the baseline; only new ones fail), npm run gate:all');
}
if (update) { console.log(`  step 1: ${lang === 'ts' ? `npm i -D tsx typescript ${nodeTypes} knip${happyDom}${aiLibs}` : LANGS[lang].needs}`); process.exit(0); }
console.log(`
Next, in ${target}:
  1. ${lang === 'ts' ? `npm i -D tsx typescript ${nodeTypes} knip @biomejs/biome${happyDom}${aiLibs}` : `Install ${LANGS[lang].name}: ${LANGS[lang].needs}`}
  2. gh auth login && gh auth refresh -s project   (once per computer, for the board)
  3. Open Claude Code (or OpenCode) in the folder and type /setup: it asks about the app, then fills CLAUDE.md, the config,
     the guide and docs/ARCHITECTURE.md, writes the OpenCode commands (npm run harness), makes the board (npm run board -- --init)
     and runs the gate.
  4. Then type /next whenever you are not sure what to do: it tells you which command (the first time: /idea, then /work <n>).`);
