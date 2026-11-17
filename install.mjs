#!/usr/bin/env node
// Installs the workflow kit into a project.
//   node install.mjs <target-folder> --project "My App" --repo owner/name [--prefix myapp] [--modules ui,security,testing,dev] [--with ai] [--lang rust] [--force]
//   node install.mjs <target-folder> --project ... --repo ... --check     list the machinery files that differ from the kit; changes nothing
//   node install.mjs <target-folder> --project ... --repo ... --update    bring an existing project up to this kit without losing its own changes:
//       a machinery file the project never changed is replaced, one it changed is kept and listed (--take <path,path> takes the kit's
//       for those), missing files are added, and settings the kit has and the project lacks are added to workflow/config.json.
//   --lean: only the build loop (the gate, the board, the map, sessions and the skills setup, next, idea, work, spec, build,
//       ship, review, check, find, docs, lesson), no modules unless --modules names them, and none of the parts (shape, spike,
//       tidy, estimate, advise, launch, market, retro, secops, setup-check) unless --with names them. Remembered: an update stays
//       lean (--with <part> adds one, --full takes every part; modules stay as chosen), and a part or module left out is removed when unchanged.
//   --modules none: no modules at all.
//   --lang ts (default) | rust | python | go: the check and test commands of starter/lang.json; a language other than ts
//   leaves the TypeScript starter files out (tsconfig.json, the .ts examples of the modules).
// 1. payload/  (skills, workflow/tools, scripts, workflow/tests, workflow/guides/WORKFLOW.md, workflow/guides/TOKENS.md): the generic machinery. Copied as is, with
//    {{PROJECT}} {{REPO}} {{OWNER}} {{PREFIX}} filled in. Existing files are kept unless --force.
// 2. starter/  (CLAUDE.md, workflow/config.json, tsconfig.json, the guide, docs/code, folder CLAUDE.md files, STYLE.md ...): YOUR files to edit.
//    Copied only when missing, never overwritten (not even with --force).
// 3. modules/<name>/{payload,starter}  (ui, security, testing, dev; all by default, or pick with --modules): the same two kinds.
//    ui = /ui skill, screenshots, style sheet, DOM helper, board template, STYLE.md; security = network guard, safe fetch, input guards,
//    debug-handle gate and their tests, SECURITY.md; testing = fake clock, fakes pattern; dev = dev.cmd, start.cmd, dev-check;
//    map = the app map (docs/flow: a page of yes/no trees of what the app decides) and the request pages (docs/REQUESTS.md);
//    deploy = a Dockerfile, npm run deploy / smoke / rollback (workflow/scripts/deploy.mjs), docs/run/DEPLOY.md.
// 4. package.json gets the test/test:full/typecheck/gate/gate:all/map/board/harness scripts (the project's own win, except npm's
//    placeholder test); .gitignore gets the kit's lines; .github/dependabot.yml (weekly updates) is written when missing. The OpenCode commands are written last (`npm run harness` again after a skill changes).
//    Nothing is committed.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { movePathsBack, undoCorrections } from './doc-layout.mjs';
import { runtimeNode } from './payload/workflow/tools/lib/updates.mjs';
import { addClaudeRules, machineryDiffs, rewriteJson, settleConfig, writeProjectFiles } from './install-config.mjs';
import { ALL, inList, inMinimal, LIBRARY, list, moduleNeeds, OPTIONAL, PARTS, readChoices, recordLines } from './install-choices.mjs';
import { runMigrations } from './migrations/index.mjs';
import { moveToWorkflowFolder } from './migrations/3.0.0-workflow-folder.mjs';
import { moveKitPathsBack } from './kit-layout.mjs';
import { addModuleSections, printReport, writeScripts } from './install-steps.mjs';
import { STAGE_FOLDERS, mergeKitBlocks, rewriteChangedRules, keepNamedStageDocs, nameHelpersInCodeDocs, pruneStageCopies, stageSetup, unmarkEnteredStages, unmarkInstalled } from './install-docs.mjs';

const kit = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt =(name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
// every choice, from the flags, then the project's record, then what the project says (install-choices.mjs): run again, the same
// command converges on the same result (a project with the record is updated; a flag changes the record, never resets the rest)
// kit 3.0: an older project's kit files move under workflow/ first, the record and settings among them (--check moves nothing)
const layout = args[0] && !args[0].startsWith('--') && !args.includes('--check') && existsSync(resolve(args[0])) ? moveToWorkflowFolder(resolve(args[0])) : { said: [], claudeGrowth: 0 };
const choices = readChoices(args, kit);
if (choices.error && !['usage', 'repo'].includes(choices.error)) { console.error(choices.error); process.exit(1); }
if (choices.error) {
  console.error('Usage: node install.mjs <target-folder> [--project "My App"] [--repo owner/name] [--prefix myapp] [--modules ui,security,testing,dev,map,deploy] [--lang ts|rust|python|go] [--force]\n'
    + 'The name, the repo, the prefix and the language are found when not given (package.json or the manifest, the git remote, the folder); without a GitHub remote, give --repo.');
  process.exit(1);
}
const { target, mark, force, update, take, skip, lang, LANGS, lean, withs, modules, parts, library, profile, gateOnly, team, without } = choices;
const skippedPart = (key) => Object.entries(PARTS).some(([p, paths]) => !parts.includes(p) && paths.some((x) => key === x || key.startsWith(x)));
// In a lean project the installed text never points at what is not there: a command of a part left out gets "(not installed)"
// after it, and a guide left out loses its backticks (so the docs check does not take it for a file that should exist) and says
// which part brings it. Done when the file is written, so an update with --with <part> writes it back unmarked.
const absent = Object.entries(PARTS).filter(([p]) => !parts.includes(p));
const absentSkills = absent.flatMap(([, paths]) => paths.map((x) => /^\.claude\/skills\/([\w-]+)\/$/.exec(x)?.[1]).filter(Boolean));
// (a guide in a subject folder too: docs/run/LAUNCH.md since kit 2.9)
const absentDocs = absent.flatMap(([p, paths]) => paths.filter((x) => /^(?:docs|workflow\/guides)\/([\w-]+\/)?[\w-]+\.md$/.test(x)).map((x) => [x, p]));
// npm scripts that run a tool of a part left out (launch-check without market): not added to package.json, and not pointed at
const scriptTool = (cmd) => /node (workflow\/tools\/[\w./-]+\.mjs)/.exec(cmd)?.[1];
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
  // a guide of the kit's library says where to read it and how to bring it in (lib/library.mjs)
  for (const [doc, part] of absentDocs) t = t.replaceAll(`\`${doc}\``, part in LIBRARY ? `${doc} (in the kit's library: npm run library -- --show ${part}; --add ${part} brings it in)` : `${doc} (with the ${part} part, not installed)`);
  if (absentScripts.length) t = t.replace(new RegExp(`\`(npm run (?:${absentScripts.join('|')})\\b[^\`\\n]*)\``, 'g'), '$1 (not installed)');
  return t;
}
const { repo, project, prefix } = choices;
if (!existsSync(target)) { console.error(`${target} does not exist. Make the project folder (and git init) first.`); process.exit(1); }
// --dry-run: the same run on a copy of the project, and what it changed there (install-plan.mjs); nothing here is written
if (args.includes('--dry-run')) process.exit((await import('./install-plan.mjs')).dryRun({ kit, target, args: args.filter((a) => a !== '--dry-run') }));
// --uninstall: the kit out again, the project's own work kept (install-uninstall.mjs; --dry-run first shows it)
if (args.includes('--uninstall')) { console.log((await import('./install-uninstall.mjs')).uninstall({ target, kit }).join('\n')); process.exit(0); }
const vars = {
  PROJECT: project, REPO: repo, OWNER: repo.split('/')[0], PREFIX: prefix,
  TESTS: LANGS[lang].config?.tests ?? LANGS[lang].tests ?? 'tests/*.test.ts',
  TEST_TIPS: lang === 'ts' ? moduleNeeds(modules).claudeTips : '',
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
// (a copy of the kit, --kit-path, has no git of its own: the clone it names has the remote, and the record keeps the last one)
const remoteOf = (dir) => spawnSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout?.trim() || '';
const kitRepo = remoteOf(kit) || remoteOf(kitPath) || /^kitRepo=(.+)$/m.exec(mark)?.[1]?.trim() || '';
// where the kit's history is (its tags, for what an older version wrote): this kit, else the clone --kit-path names
process.env.WORKFLOW_KIT_HISTORY = kitPath;
const markFile = join(target, 'workflow/record');
const before = existsSync(markFile) ? (/version=(\S+)/.exec(readFileSync(markFile, 'utf8'))?.[1] ?? 'unknown') : null;
// the app map's request group as it was, to say after the update when it came out different (install-report.mjs)
const requestsBefore = existsSync(join(target, 'docs', 'flow', 'requests.js')) ? readFileSync(join(target, 'docs', 'flow', 'requests.js'), 'utf8') : null;
const done = { added: [], kept: [], replaced: [], yours: [], removed: [], orphans: [], staged: [], stageKept: [], stageNamed: [], helpers: [], skipped: [] };
// what a stage not reached yet would have written: an update takes away the untouched copies an older kit wrote there
const stageSkipped = new Map();
const shipped = new Set(); // every machinery file this run of the kit ships, to find the ones an older kit wrote and this one dropped
// a project that already has a UI framework builds its screens with components: the ui module's own DOM helper and its test stay out
const pkgBefore = existsSync(join(target, 'package.json')) ? JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')) : {};
const framework = ['react', 'preact', 'vue', 'svelte', 'solid-js', 'next', '@angular/core'].some((d) => d in { ...(pkgBefore.dependencies ?? {}), ...(pkgBefore.devDependencies ?? {}) });
// what the chosen modules add (each module's module.json): the install line's packages, the helpers its rules name
const needs = moduleNeeds(modules, { framework });
const happyDom = needs.npmDev.map((p) => ` ${p}`).join('');
const aiLibs = needs.npm.length ? ` && npm i ${needs.npm.join(' ')}` : '';
// the Node types of the Node the project runs (.tool-versions), never newer: the gate's *versions* check holds that
const readIn = (f) => (existsSync(join(target, f)) ? readFileSync(join(target, f), 'utf8') : undefined);
// (the project's own say first: .tool-versions, package.json engines, the Dockerfile, .nvmrc; only then the kit's own pin)
const projectNode = runtimeNode({ pkg: pkgBefore, toolVersions: readIn('.tool-versions'), dockerfile: readIn('Dockerfile'), nvmrc: readIn('.nvmrc') ?? readIn('.node-version') });
const nodeMajor = (projectNode ?? runtimeNode({ toolVersions: readFileSync(join(kit, 'starter', '.tool-versions'), 'utf8') }))?.major;
const nodeTypes = nodeMajor ? `@types/node@^${nodeMajor}` : '@types/node';
// what each machinery file looked like when the kit last wrote it ("sha <hash> <file>" lines in workflow/record), so an update can
// tell a file the project changed from one only the kit changed
const hash = (text) => createHash('sha1').update(String(text).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
const written = new Map((existsSync(markFile) ? readFileSync(markFile, 'utf8') : '').split(/\r?\n/).map((l) => /^sha (\S+) (.+)$/.exec(l)).filter(Boolean).map((m) => [m[2], m[1]]));
const stamp = new Map(written);
// A kit file nobody changed: the same as the kit wrote it (its stamp), or so once the paths kit 2.9 and 3.0 moved are put back (an update
// from before 2.9 rewrites them in every file, the kit's too, and that is not the project changing the file).
const untouched = (key, text) => written.has(key) && [text, moveKitPathsBack(text)].flatMap((t) => [t, movePathsBack(t), undoCorrections(t), movePathsBack(undoCorrections(t))])
  .some((t) => written.get(key) === hash(t));
// --update: an older project's docs move into their folders, and old doc paths are rewritten, before anything is copied
// (install-docs.mjs)
let claudeGrowth = 0; // bytes the longer doc paths added to CLAUDE.md (its budget grows by exactly that, below)
// what changed in the kit since the project's version, one step per version (migrations/): run once, each looking before it acts
const migrated = [];
const migrate = (phase) => { if (update) migrated.push(runMigrations(phase, { from: before, target, kit, fill, written, stamp })); return migrated.at(-1) ?? {}; };
claudeGrowth = (migrate('before').claudeGrowth ?? 0) + layout.claudeGrowth;
// starter files that are helpers the kit's rules (CLAUDE.md sections) name, not example code: an update adds them when a project
// does not have them (TypeScript only; a project in another language writes its own, CLAUDE.md says what they do)
const HELPERS = lang === 'ts' ? needs.helpers : [];
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
    if (skippedPart(key) || (gateOnly && !inMinimal(key))) continue;
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
const rulesRewritten = update ? rewriteChangedRules({ target, kit, fill, rules: false }) : [];
migrate('claude');

// each module's own section of CLAUDE.md, added once (install-steps.mjs)
const sectionsDone = addModuleSections({ kit, target, modules, markFile, fill, markAbsent });
// the gate's baseline, empty, so the docs can name it from the first day
const basePath = join(target, 'workflow', 'tools', 'baseline.json');
if (!existsSync(basePath)) writeFileSync(basePath, JSON.stringify({ boundaries: [], sizes: {}, docs: [] }, null, 2) + '\n');

// starter files that are not meant to live at their own name
// the kit's Claude Code rules and hooks go in the tracked .claude/settings.json (addClaudeRules), so a commit carries them
const rename = [['gitignore.txt', null], ['package-scripts.json', null], ['settings.local.json', '.claude/settings.json']];
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

// package.json's scripts, and tsconfig.gate.json after a framework starter whose tsconfig checks nothing (install-steps.mjs)
writeScripts({ kit, target, prefix, lang, langs: LANGS, modules, absentScripts, gateOnly, done });

// the config: a fresh one fitted to framework and language; on --update what the project lacks (install-config.mjs). (Paths as git writes them)
const wrote = (path) => done.added.some((f) => f.replace(/\\/g, '/') === path);
const addedSettings = settleConfig({ target, kit, fill, langConfig: LANGS[lang].config, framework, modules, update, justWritten: wrote('workflow/config.json'), claudeGrowth });
migrate('config');
// the team profile: pull requests and a team audience in a config this run wrote (workflow/guides/TEAM.md); an existing one is the project's
if (team && wrote('workflow/config.json')) {
  const at = join(target, 'workflow/config.json'), was = readFileSync(at, 'utf8'), c = JSON.parse(was);
  writeFileSync(at, rewriteJson(was, { ...c, project: { ...c.project, audience: 'team' }, session: { ...c.session, flow: 'pr' } }));
}
// a part or module added later: the "(not installed)" marks in the project's own text come out where it is there now
const unmarked = update ? unmarkInstalled({ target }) : [];

// a first install into a project with its own CLAUDE.md: the kit's parts it lacks go at its end, between their markers
const kitPartsAdded = !update && done.kept.includes('CLAUDE.md') ? mergeKitBlocks({ target, kit, fill }) : [];

// the project files written once, then the project's: Dependabot (without Renovate), .gitignore lines, .gitattributes
// (install-config.mjs)
const lfHint = writeProjectFiles({ target, kit, lang, langs: LANGS, modules, update, done, projectNode });

// the map module: the request pages' file, so the map opens and the gate's check passes from the start
if (existsSync(join(target, 'docs', 'flow', 'build-requests.mjs'))) spawnSync(process.execPath, ['docs/flow/build-requests.mjs'], { cwd: target, encoding: 'utf8' });

// the OpenCode commands (and, when missing, opencode.jsonc), so every agent can run /setup at once
const harness = gateOnly ? { status: 0, stdout: 'harness: none (the minimal profile has no commands)' } : spawnSync(process.execPath, ['workflow/tools/harness.mjs'], { cwd: target, encoding: 'utf8' });
const harnessLine = harness.status === 0 ? harness.stdout.trim() : `harness: not written (${(harness.stderr || harness.stdout).trim().split('\n')[0]}); run npm run harness in the project`;

spawnSync('git', ['-C', target, 'config', 'workflow.kit', kitPath], { stdio: 'ignore' });
writeFileSync(markFile, `# which ai-workflow-kit this project came from and what it chose (install.mjs writes it; running it again goes by it). The sha lines: each machinery file as the kit wrote it.\n${recordLines({ version: kitVersion, kitRepo, lang, project, repo, prefix, modules, stages, skip, lean, parts, sections: [...sectionsDone], profile, without, library }).join('\n')}\n${[...stamp].filter(([f]) => existsSync(join(target, f))).sort().map(([f, h]) => `sha ${h} ${f}`).join('\n')}\n`);
// the report: what was done, what is the project's, and what to do next (install-steps.mjs)
printReport({ kit, target, before, kitVersion, force, update, done, lang, langs: LANGS, profile, modules, lean, gateOnly, parts, without,
  kitPartsAdded, harnessLine, addedSettings, claudeAdded, lfHint, rulesRewritten, written, stages, unmarked, requestsBefore, layout,
  migrated, framework, nodeTypes, happyDom, aiLibs });
