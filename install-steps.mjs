// Three steps of install.mjs as functions of their own (so each is short enough to read, and the function-length rule the kit
// holds projects to holds here too): the modules' sections of CLAUDE.md, package.json's scripts, and the report at the end.
// What each needs comes in as arguments; nothing here decides a choice.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { rewriteJson } from './install-config.mjs';
import { MINIMAL_SCRIPTS } from './install-choices.mjs';
import { whatChanged } from './install-report.mjs';
import { STAGE_FOLDERS } from './install-docs.mjs';

/**
 * A module's own section of CLAUDE.md (modules/<name>/claude-section.md): added once, at the end. "Once" is remembered in
 * workflow/record (sections=), so a section the owner renamed, rewrote or took out is never added again; a project from before that
 * record is recognised by the heading or by the first file or command the section names. A module may have more than one
 * (claude-section-<name>.md, remembered as <module>:<name>), so a section added later still reaches a project that has the first.
 * Returns the sections done, for the record.
 */
export function addModuleSections({ kit, target, modules, markFile, fill, markAbsent }) {
  const sectionsDone = new Set((/^sections=(.*)$/m.exec(existsSync(markFile) ? readFileSync(markFile, 'utf8') : '')?.[1] ?? '').split(',').filter(Boolean));
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
    // between the kit's markers, like the starter's own kit parts, so --uninstall can take it out and leave the rest
    const tag = `module-${m.replace(/:/g, '-')}`;
    if (title && !sectionsDone.has(m) && !has.includes(title) && !there) writeFileSync(claude, `${has.replace(/\n*$/, '\n')}<!-- kit:${tag} -->\n${text.replace(/\s*$/, '')}\n<!-- /kit:${tag} -->\n`);
    sectionsDone.add(m);
  }
  return sectionsDone;
}

/**
 * package.json's scripts: the kit's, the language's and each module's (modules/<name>/package-scripts.json) that the project lacks,
 * after its own and in its own layout (its own win, except npm's placeholder test). Then a tsconfig.json that was there before and
 * checks nothing by itself (a framework starter's: "files": [] and references) gets the gate its own, tsconfig.gate.json.
 */
export function writeScripts({ kit, target, prefix, lang, langs, modules, absentScripts, gateOnly, done }) {
  const pkgPath = join(target, 'package.json');
  const scripts = JSON.parse(readFileSync(join(kit, 'starter', 'package-scripts.json'), 'utf8'));
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : { name: prefix, private: true, type: 'module' };
  Object.assign(scripts, langs[lang].scripts ?? {});
  for (const m of modules) if (existsSync(join(kit, 'modules', m, 'package-scripts.json'))) Object.assign(scripts, JSON.parse(readFileSync(join(kit, 'modules', m, 'package-scripts.json'), 'utf8')));
  for (const name of absentScripts) delete scripts[name];
  // the minimal profile: only the checks' own scripts
  if (gateOnly) for (const name of Object.keys(scripts)) if (!MINIMAL_SCRIPTS.includes(name)) delete scripts[name];
  const own = { ...(pkg.scripts ?? {}) };
  if (/no test specified/.test(own.test ?? '')) delete own.test;
  pkg.scripts = { ...own, ...Object.fromEntries(Object.entries(scripts).filter(([k]) => !(k in own))) };
  const writePkg = () => {
    const was = existsSync(pkgPath) ? readFileSync(pkgPath, 'utf8') : null;
    const now = was ? rewriteJson(was.replace(/\r\n/g, '\n'), pkg) : `${JSON.stringify(pkg, null, 2)}\n`;
    if (now !== was?.replace(/\r\n/g, '\n')) writeFileSync(pkgPath, now);
  };
  writePkg();
  if (lang !== 'ts' || !done.kept.includes('tsconfig.json') || existsSync(join(target, 'tsconfig.gate.json'))) return;
  const theirs = readFileSync(join(target, 'tsconfig.json'), 'utf8');
  if (!/"references"\s*:/.test(theirs) && !/"files"\s*:\s*\[\s*\]/.test(theirs)) return;
  const gateCfg = JSON.parse(readFileSync(join(kit, 'starter', 'tsconfig.json'), 'utf8'));
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  gateCfg.compilerOptions.allowImportingTsExtensions = true; // framework starters import './App.tsx'
  if (deps.react) gateCfg.compilerOptions.jsx = 'react-jsx';
  if (deps.vite) gateCfg.compilerOptions.types.push('vite/client');
  writeFileSync(join(target, 'tsconfig.gate.json'), JSON.stringify(gateCfg, null, 2) + '\n');
  if (!own.typecheck) { pkg.scripts.typecheck = 'tsc --noEmit --incremental --tsBuildInfoFile .tsbuildinfo -p tsconfig.gate.json'; writePkg(); }
  done.added.push('tsconfig.gate.json');
}

/** The lines an update adds about what it did (only when something happened). */
function updateLines(r) {
  const { done, target, lang } = r;
  const config = () => JSON.parse(readFileSync(join(target, 'workflow/config.json'), 'utf8'));
  const list = (xs) => xs.map((f) => `    ${f}`).join('\n');
  const ran = r.migrated.flatMap((m) => m.ran);
  return [
    r.addedSettings.length && `  settings added to workflow/config.json: ${r.addedSettings.join(', ')}`,
    r.claudeAdded.length && `  rules added to .claude/settings.local.json: ${r.claudeAdded.join(', ')}`,
    r.lfHint,
    r.rulesRewritten.length && `  CLAUDE.md: the kit's own text brought up to date, yours left as it is (${r.rulesRewritten.join('; ')})`,
    done.yours.length && !r.written.size && '  this project has no record yet of what the kit wrote (it was installed before 1.5), so every file that differs is listed below; from now on only the ones you changed are.',
    done.removed.length && `  removed ${done.removed.length} the kit no longer ships (unchanged since it wrote them):\n${list(done.removed)}`,
    done.stageNamed.length && `  kept from a stage not reached yet, because the project's own pages point at them: ${done.stageNamed.join(', ')}`,
    done.helpers.length && `  helpers the kit's rules name, added (never replacing one): ${done.helpers.join(', ')}`,
    done.staged.length && `  stages not reached yet (${Object.keys(STAGE_FOLDERS).filter((x) => !r.stages.includes(x)).join(', ')}): ${done.staged.length} untouched docs taken away; they come back when the stage starts (node workflow/tools/stage.mjs --enter <stage>)`,
    done.stageKept.length && `  kept, because the project changed them (the stage is not reached yet, but the work is yours):\n${list(done.stageKept)}`,
    r.unmarked.length && `  "(not installed)" taken out where it is installed now, in: ${r.unmarked.join(', ')}`,
    ...whatChanged({ kit: r.kit, target, before: r.before, now: r.kitVersion, replaced: done.replaced, requestsBefore: r.requestsBefore }).map((l) => `  ${l}`),
    ...r.layout.said.map((l) => `  ${l}`),
    ran.length && `  the kit's changes since ${r.before} (migrations/): ${ran.join('; ')}\n${r.migrated.flatMap((m) => m.said).map((l) => `  ${l}`).join('\n')}`,
    done.orphans.length && `  the kit no longer ships these, but the project changed them, so they stay; delete them if you do not need them:\n${list(done.orphans)}`,
    done.yours.length && `  kept, because the project changed them (${done.yours.length}); the kit's version differs. Compare, then take the kit's with --take <path,path>:\n${list(done.yours)}`,
    done.pairedKept.length && `  tests beside a file of the project's own (the kit's new test checks the kit's version of that file; take both with --take <test,file>):\n${list(done.pairedKept)}`,
    lang === 'ts' && !config().checks?.some((c) => c.name === 'lint') && '  not switched on: lint (Biome). It reformats the code once, so it is your call: npx biome check --write src tests, then add { "name": "lint", "command": "npx --no-install biome check --no-errors-on-unmatched .", "when": ["src/**", "tests/**", "biome.json"] } to "checks".',
    r.framework && config().ui?.boards === 'html' && '  not changed: "ui": { "boards": "html" } although the project has a UI framework. Set it to "components" to have /ui draw its variants as real components.',
    '  then: step 1 below, npm run map, node workflow/tools/gate.mjs --update-baseline (what the new checks find today becomes the baseline; only new ones fail), npm run gate:all',
  ].filter(Boolean);
}

/** The report at the end of a run: what was done, what is the project's, and what to do next. Exits after an update. */
export function printReport(r) {
  const { done, target, lang, langs, update } = r;
  const shape = `profile: ${r.profile}; modules: ${r.modules.join(', ') || 'none'}${r.lean && !r.gateOnly ? `; parts: ${r.parts.join(', ') || 'none'}` : ''}${r.without.length ? `; left out: ${r.without.join(', ')}` : ''}. Another: --profile minimal|solo|product|team, or --with / --without <part>`;
  console.log(r.before ? `Updated ${target} from kit ${r.before} to ${r.kitVersion} (${shape})` : `Installed kit ${r.kitVersion} into ${target} (${shape})`);
  if (r.before && !r.force && !update) console.log('  without --force the machinery files that exist were kept: run again with --force to take the new version of them');
  console.log(`  added ${done.added.length} files, replaced ${done.replaced.length}, kept ${done.kept.length} that already existed${done.kept.length && !r.force ? ' (--force replaces the machinery, never your starter files)' : ''}`);
  // a first install into a project that has files at the kit's places: each is named, since the kit's rules may assume its own there
  const collided = update ? [] : done.kept.filter((f) => !['package.json', 'CLAUDE.md', 'README.md', '.gitignore'].includes(f.replace(/\\/g, '/')));
  if (r.kitPartsAdded.length) console.log(`  CLAUDE.md is yours and stays so; the kit's rules its commands rely on were added at its end, between <!-- kit: --> markers (an update keeps those current): ${r.kitPartsAdded.join('; ')}`);
  if (collided.length) console.log(`  yours, at a place the kit also writes (kept as they are; where the kit's rules name one, compare it with the kit's in ${r.kit}):\n${collided.map((f) => `    ${f.replace(/\\/g, '/')}`).join('\n')}`);
  if (done.skipped.length) console.log(`  skipped, as the project asked (skip= in workflow/record, --skip adds more): ${done.skipped.length} file${done.skipped.length === 1 ? '' : 's'}`);
  // a kit file the project's ignore rules hide is never committed (a rule like *UCT.md hid docs/PRODUCT.md): written now or there before
  const hidden = (spawnSync('git', ['check-ignore', '--stdin'], { cwd: target, input: [...done.added, ...done.replaced, ...done.kept].map((f) => f.replace(/\\/g, '/')).join('\n'), encoding: 'utf8' }).stdout ?? '').split('\n').filter(Boolean);
  if (hidden.length) console.log(`  hidden by .gitignore, so git will not commit them (add a !<path> line, or narrow the rule):\n${hidden.map((f) => `    ${f}`).join('\n')}`);
  console.log(`  ${r.harnessLine}`);
  const tsInstall = (biome) => `npm i -D tsx typescript ${r.nodeTypes} knip${biome ? ' @biomejs/biome' : ''}${r.happyDom}${r.aiLibs}`;
  if (update) {
    for (const l of updateLines(r)) console.log(l);
    console.log(`  step 1: ${lang === 'ts' ? tsInstall(false) : langs[lang].needs}`);
    process.exit(0);
  }
  console.log(`
Next, in ${target}:
  1. ${lang === 'ts' ? tsInstall(true) : `Install ${langs[lang].name}: ${langs[lang].needs}`}
  2. gh auth login && gh auth refresh -s project   (once per computer, for the board)
  3. Open Claude Code (or OpenCode) in the folder and type /setup: it asks about the app, then fills CLAUDE.md, the config,
     the guide and docs/ARCHITECTURE.md, writes the OpenCode commands (npm run harness), makes the board (npm run board -- --init)
     and runs the gate.
  4. Then type /next whenever you are not sure what to do: it tells you which command (the first time: /idea, then /work <n>).`);
}
