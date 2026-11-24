#!/usr/bin/env node
// The gate: one command that checks a change with scripts, no AI. Quiet when it passes (one line per
// check), and on a failure it prints only the short tail that explains it, so reading it costs few tokens.
//   node workflow/tools/gate.mjs            layer rules, file size, typecheck, tests the change can reach
//   node workflow/tools/gate.mjs --all      the same, with the whole test suite
//   node workflow/tools/gate.mjs --ship     what /ship runs: the whole suite in the pilot and production phases, the tests the
//                                           change reaches in a prototype (workflow/levels.json; npm run phase)
//   --kit                     also the kit's own tests (workflow/tests/**), which otherwise run only when the machinery changed
//   node workflow/tools/gate.mjs --list     only print which tests the change reaches
//   --fresh       run the picked tests even when they passed before with the same code (lib/testcache.mjs: skipped otherwise)
//   node workflow/tools/gate.mjs --update-baseline   accept today's exceptions (rules and sizes) as the baseline
//   --allow-growth "<reason>"   with --update-baseline: accept a bigger number (a pure refactor); the reason is printed
//   (project steps from the config: `checks`, `together`, `copies`; a secret in the change fails too. See README.md, *What it checks*)
//   (the gate also fails when docs/MAP.md is out of date: run npm run map; when an OpenCode command is missing or stale: npm run harness;
//   or when a doc names a missing file or npm script)
//   --advice      only print the advice lines (security-review, hostile-input test, SQL built from a value, a route with no refusal test, a missing push guard) (a full run prints them at the end; they never fail the gate)
//   --base <ref>  compare with this commit instead of the merge-base with origin/main
//   --only <files> one builder of several: the type errors in these files only, and the tests that reach them (lib/only.mjs)
//   --ship        what /ship runs (the phase says how much); a pass is recorded, and a second --ship on the same files stops at once
// Project settings live in workflow/config.json; nothing here knows about the project.
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import './lib/frommain.mjs'; // a session folder with an older kit than the main folder's: the main folder's copy runs instead (lib/frommain.mjs)
import { checkPackages, describeMissing, packagesFix } from '../../workflow/scripts/packages.mjs';
import { testPlan } from './lib/testplan.mjs';
import { errorRuleFindings, notRead } from './lib/errorrules.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { buildGraph, affectedTests, projectAliases } from './lib/graph.mjs';
import { bare } from './lib/docblocks.mjs'; import { flakyNow, recordPaths, runTests } from './lib/testrun.mjs'; import { addedLineNumbers, fixedWaits } from './lib/waits.mjs';
import { findViolations, newViolations } from './lib/boundaries.mjs';
import { isPlumbing, limitOf, lineCount, oversize, sizeSetup, switchToWork, sizeVerdict, takeAllowance, updateSizes, sizeNote, workLineCount } from './lib/size.mjs';
import { globToRegExp, matchesAny } from './lib/glob.mjs';
import { securityAdvice, addedLines } from './lib/securityscan.mjs';
import { hostileAdvice } from './lib/hostilecheck.mjs';
import { findStaleRefs, newStaleRefs, staleKey } from './lib/docrefs.mjs';
import { codeTest } from './lib/lang.mjs';
import { longFunctions, copiedFunctions, deepFunctions, copiedTests } from './lib/funclen.mjs';
import { importCycles, untestedFiles } from './lib/structure.mjs'; import { appSteps } from './lib/apps.mjs';
import { kitFilesIn, namesKitFiles, specPaths, outsideSpec, ownTestFiles } from './lib/scope.mjs'; import { clashAdvice, clashes, claimOf, settledFiles, stackOf } from './lib/claims.mjs'; import { changedIn, mainOf, neverIn, sessionClaims } from './lib/sessionclaims.mjs'; import { endStateProblems, isApproved } from './lib/endstate.mjs'; import { gatePassAdvice, gatePassOf, isTreeish, recordGatePass, recordShipPass, shipPassOf, treeOf, untrackedInputs } from './lib/shippass.mjs'; import { onlyCheck, onlyFiles } from './lib/only.mjs'; import { longRuleCells } from './lib/rulerows.mjs';
import { parseScore, qualityVerdict } from './lib/quality.mjs';
import { countPatterns, risen } from './lib/ratchet.mjs';
import { addedDependencies, unnamedDependencies } from './lib/deps.mjs';
import { unlisted } from './lib/envcheck.mjs';
import { nodeOutOfStep, tofuUnpinned, unpinnedTools } from './lib/versions.mjs';
import { namingProblems } from './lib/naming.mjs';
import { policySteps, dataAdvice } from './lib/policy.mjs';
import { dueChecks, missingPartners } from './lib/checks.mjs';
import { secretsIn, envFiles } from './lib/secrets.mjs'; import { MAIN, ORIGIN_MAIN } from './lib/branch.mjs';
import { FILE as LEVELS_FILE, levelOf, loosenedLine, readLevels } from './lib/levels.mjs';
import { appsOf, surfacesOf } from './lib/surfaces.mjs'; import { lines } from './lib/text.mjs'; import { useFolderEnv } from './lib/folderenv.mjs';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
// the folder's .env decides, never a PORT or data folder left set in the shell: the tests and checks started below go by it (lib/folderenv.mjs)
if (!process.env.CI) useFolderEnv(root);
const config = JSON.parse(readFileSync('workflow/config.json', 'utf8'));
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
// (a --base git does not have, such as the commit before a forced push on GitHub, is left out and said: the usual base is used)
const baseAsked = args.includes('--base') ? args[args.indexOf('--base') + 1] : null;
// a commit, or a tree: --finish passes the tree gate:ship passed on (lib/shippass.mjs), so only what differs from it is checked
const baseKnown = !baseAsked || isTreeish('.', baseAsked);
if (!baseKnown) console.log(`note: --base ${baseAsked} is not a commit or tree here, so the change is compared with where the branch left main`);
const baseArg = baseKnown ? baseAsked : null;
// the levels in force (workflow/levels.json); --ship is /ship's run: the whole suite in pilot and production, the tests the change
// reaches in a prototype (lib/levels.mjs, the phase's `ship`)
const levels = readLevels(existsSync(LEVELS_FILE) ? readFileSync(LEVELS_FILE, 'utf8') : null, (config.checks ?? []).map((c) => c.name));
const wholeSuite = flag('--all') || (flag('--ship') && levels.ship === 'all');

// (git's warnings stay out of the output: on Windows "LF will be replaced by CRLF" came once per file and hid the failure; an error still carries what git said)
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
// a git call that may fail (no origin yet, say): no output on stderr, null instead
const gitOk = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };

// what the change is compared with: --base, or where this branch left main (no commit yet: git's empty tree, all new)
// gate:ship on exactly the files it passed on before (lib/shippass.mjs) tells nothing new: said, and not run again
const shipTree = flag('--ship') && !process.env.CI ? (() => { try { return treeOf('.'); } catch { return null; } })() : null;
if (shipTree && !flag('--fresh') && shipPassOf('.') === shipTree) {
  console.log('gate:ship passed on exactly these files already: not run again (a change, or --fresh, runs it)');
  process.exit(0);
}
const base = baseArg ?? gitOk('merge-base', 'HEAD', ORIGIN_MAIN) ?? gitOk('merge-base', 'HEAD', MAIN) ?? (gitOk('rev-parse', '--verify', 'HEAD') ? 'HEAD' : '4b825dc642cb6eb9a060e54bf8d69288fbee4904');
// the plain gate on exactly the files, base, flags and .env it passed on before tells nothing new either; nor after gate:ship passed
// on those files (it runs more). Said, and not run again: a session ran it six times, the same files four of them
const quickKey = !flag('--ship') && !process.env.CI ? (() => {
  try { return [treeOf('.'), base, args.filter((a) => a !== '--fresh').join(' '), untrackedInputs('.')].join(' '); } catch { return null; }
})() : null;
if (quickKey && !flag('--fresh')) {
  if (gatePassOf('.') === quickKey) { for (const l of gatePassAdvice('.')) console.log(l); console.log('gate passed on exactly these files already: not run again (a change, or --fresh, runs it)'); process.exit(0); }
  if (!args.length && shipPassOf('.') === quickKey.split(' ')[0]) { console.log('gate:ship passed on exactly these files: not run again (a change, or --fresh, runs it)'); process.exit(0); }
}
const said = []; // the advice this run says, kept with its pass so a skipped run says it again
function listFiles() {
  const all = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(Boolean);
  return all.filter((f) => config.roots.some((r) => f.startsWith(r + '/')) && !matchesAny(f, config.skipFiles) && existsSync(f));
}

function changedFiles() {
  const diff = git('diff', '--name-only', '--diff-filter=d', base).split('\n');
  const fresh = git('ls-files', '--others', '--exclude-standard').split('\n');
  return [...new Set([...diff, ...fresh])].filter(Boolean);
}

const isCode = codeTest(config);
const files = new Map();
const others = [];
for (const f of listFiles()) {
  if (isCode(f)) files.set(f, readFileSync(f, 'utf8'));
  else others.push(f);
}
const readIf = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);
const graph = buildGraph(files, others, { aliases: projectAliases(config.apps, readIf) }); // @/ imports followed too
const isTest = (f) => globToRegExp(config.tests).test(f);

const baselineFile = config.baseline;
const baseline = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : { boundaries: [], sizes: {}, docs: [] };
const { sizeFiles, sizes, limit: SIZE_LIMIT, allow: ALLOW } = sizeSetup(files, config.size, baseline, matchesAny); // work lines and the allowance (lib/size.mjs)
// long functions (only when `functions` is set in the config): name -> lines, kept by the same ratchet as the file sizes
const funcs = config.functions ? longFunctions(new Map([...files].filter(([f]) => matchesAny(f, config.functions.include))), config.functions.maxLines) : null;
const counts = countPatterns(files, config.ratchets);
const only = (globs) => new Map([...files].filter(([f]) => matchesAny(f, globs)));
// `if`s and loops nested too deep (only when `functions.maxDepth` is set): name -> depth, the same ratchet as the long functions
const depths = config.functions?.maxDepth ? deepFunctions(only(config.functions.include), config.functions.maxDepth) : null;
// files that import each other in a circle: one line per circle
const cycles = importCycles(graph.imports).map((g) => g.join(' <-> '));
// source files no test reaches (only when `untested` is set, and only where the gate can follow imports into the tests)
const untested = config.untested && config.testPicking !== false ? untestedFiles(graph, (f) => matchesAny(f, config.untested.include) && !matchesAny(f, config.untested.ignore ?? []), isTest) : null;
// functions with the same body in two places (only when `copies` is set): one line per group, a new line fails
const copies = config.copies ? copiedFunctions(new Map([...files].filter(([f]) => matchesAny(f, config.copies.include ?? config.functions?.include ?? config.size.include))), config.copies.minLines ?? 6).map((g) => [...g].sort().join(' = '))
  .concat(config.copies.tests ? copiedTests(only(config.copies.tests), config.copies.minLines ?? 6).map((g) => g.join(' ~ ')) : []).sort() : null;
const violations = findViolations(graph, config.boundaries);
// names that break the project's conventions (only when `naming` is set): one key per name, a new one fails
const readText = (f) => (existsSync(f) && statSync(f).size < 2_000_000 ? readFileSync(f, 'utf8') : null);
const naming = config.naming ? namingProblems(config.naming, git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter((f) => f && existsSync(f)), files, matchesAny, readText) : null;

const docFiles = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n')
  .filter((f) => f && matchesAny(f, config.docs.include) && !matchesAny(f, config.docs.exclude) && existsSync(f));
const docTexts = new Map(docFiles.map((f) => [f, readFileSync(f, 'utf8')]));
const npmScripts = existsSync('package.json') ? Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).scripts ?? {}) : [];
const staleRefs = findStaleRefs(docTexts, (p) => existsSync(p), npmScripts);

// rules files over their size budget (`budget`: path or glob -> bytes): [file, budget, size]
// (the size as committed: \r\n counts as \n, so a Windows checkout with core.autocrlf=true measures the same as Linux and CI;
// the generated lines are left out: facts the kit writes, which a project cannot shorten)
const overBudget = config.budget ? docFiles.map((f) => [f, Object.entries(config.budget).find(([g]) => matchesAny(f, [g]))?.[1], Buffer.byteLength(bare(readFileSync(f, 'utf8').replace(/\r\n/g, '\n')))]).filter(([, max, size]) => max && size > max) : [];

if (flag('--update-baseline')) {
  let reason = null;
  if (flag('--allow-growth')) {
    reason = (args[args.indexOf('--allow-growth') + 1] ?? '').trim();
    if (!reason || reason.startsWith('--')) { console.log('--allow-growth needs a reason: --allow-growth "<reason>"'); process.exit(1); }
  }
  // the very first baseline of a project takes what is there (a framework starter's long demo function, say); after that only shrinking is free
  // (not CLAUDE.md's budget: a rules file every agent reads in every chat starts within it, or with a reason the owner gives)
  const owned = reason;
  if (!reason && !('cycles' in baseline)) reason = 'the first baseline';
  // counted as work lines from now on: the switch needs no reason, also for a file under the old line limit that joins the list
  const upd = switchToWork(oversize(sizeFiles, limitOf(config.size), workLineCount), baseline, new Map([...sizeFiles].map(([f, t]) => [f, lineCount(t)])), config.size.maxLines, reason);  if (!upd.ok) {
    console.log('baseline not written: these would grow (put the new code in its own file, or --allow-growth "<reason>" for a pure refactor):');
    for (const x of upd.raised) console.log(`  ${x.file} ${x.was ?? 'new'} -> ${x.now}`);
    process.exit(1);
  }
  if (upd.message) console.log(upd.message);
  // a new broken import rule or a doc naming a file that does not exist is fixed, not accepted (after the first baseline)
  const newRules = newViolations(violations, baseline.boundaries ?? []);
  const newRefs = newStaleRefs(staleRefs, baseline.docs ?? []);
  const newNames = naming && 'naming' in baseline ? naming.filter((n) => !baseline.naming.includes(n.key)) : [];
  if ((newRules.length || newRefs.length || newNames.length) && !reason) {
    console.log('baseline not written: fix these instead of accepting them (or --allow-growth "<reason>"):');
    for (const v of newRules) console.log(`  ${v.rule}: ${v.file} imports ${v.target}`);
    for (const s of newRefs) console.log(`  ${s.doc}:${s.line} names ${s.ref}, which does not exist: write it, or take the name out`);
    for (const n of newNames) console.log(`  ${n.line}`);
    process.exit(1);
  }
  const next = { boundaries: violations.map((v) => v.key).sort(), sizeMeasure: 'work', sizes: upd.next, ...(baseline.allowed ? { allowed: Object.fromEntries(Object.entries(baseline.allowed).filter(([f]) => f in upd.next)) } : {}), docs: staleRefs.map(staleKey).sort() };
  if (naming) next.naming = naming.map((n) => n.key).sort();
  if (funcs) {
    const fu = updateSizes(funcs, baseline.functions ?? {}, reason);
    if (!fu.ok) {
      console.log('baseline not written: these functions are new or grew (split them into named steps, or --allow-growth "<reason>"):');
      for (const x of fu.raised) console.log(`  ${x.file} ${x.was ?? 'new'} -> ${x.now} lines`);
      process.exit(1);
    }
    next.functions = fu.next;
  }
  if (config.ratchets?.length) {
    const up = risen(counts, baseline.ratchets);
    if (up.length && !reason) { console.log('baseline not written: these counts rose (put the rule in the kind\'s own file, or --allow-growth "<reason>"): ' + up.map((x) => `${x.name} ${x.was} -> ${x.now}`).join('; ')); process.exit(1); }
    next.ratchets = counts;
  }
  if (copies) next.copies = copies;
  next.cycles = cycles;
  // a rules file over its budget is only taken as it is the first time; one that grew past what was recorded is refused
  const fatter = overBudget.filter(([f, , size]) => size > (baseline.budget?.[f] ?? 0));
  if (fatter.length && !owned) {
    console.log('baseline not written: these rules files are over their budget and grew (every agent reads them in every chat: turn a rule into a check, move what only some work needs into a doc they point to, or --allow-growth "<reason>"):');
    for (const [f, max, size] of fatter) console.log(`  ${f} is ${size} bytes, the budget is ${max}${baseline.budget?.[f] ? `, it was ${baseline.budget[f]}` : ''}`);
    process.exit(1);
  }
  if (overBudget.length) next.budget = Object.fromEntries(overBudget.map(([f, , size]) => [f, size]));
  if (untested) next.untested = untested;
  if (depths) {
    const d = updateSizes(depths, baseline.depths ?? {}, reason);
    if (!d.ok) { console.log('baseline not written: these functions are nested deeper than before (return early, or move the inner part into a function of its own; or --allow-growth "<reason>"): ' + d.raised.map((x) => `${x.file} ${x.was ?? 'new'} -> ${x.now}`).join('; ')); process.exit(1); }
    next.depths = d.next;
  }
  if (config.quality?.command) {
    // the score now becomes the number that may not drop; a lower one needs a reason, like a file that grew
    // the command comes from workflow/config.json, the project's own file, never from outside input
    // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
    const score = parseScore(spawnSync(config.quality.command, { shell: true, encoding: 'utf8', maxBuffer: 256 << 20 }).stdout ?? '', config.quality.pattern);
    if (score && baseline.quality?.pass != null && score.pass < baseline.quality.pass && !reason) { console.log(`baseline not written: the quality score dropped ${baseline.quality.pass} -> ${score.pass} (fix the cases, or --allow-growth "<reason>")`); process.exit(1); }
    next.quality = score ?? baseline.quality;
  }
  if (Object.keys(upd.nextReasons).length) next.reasons = upd.nextReasons;
  writeFileSync(baselineFile, JSON.stringify(next, null, 2) + '\n');
  console.log(`baseline written: ${next.boundaries.length} layer exceptions, ${Object.keys(next.sizes).length} big files, ${next.docs.length} stale doc references`);
  process.exit(0);
}

/** A size failure in words: the file, what its new lines are (work or plumbing), and the next step. */
function sizeProblem(x) {
  if (x.was == null) return `${x.file} is ${x.lines} lines (limit ${SIZE_LIMIT}${SIZE_LIMIT === config.size.maxLines ? '' : ' that hold work'}): split it along what changes together (one responsibility per file), not only to get under the number`;
  const added = (gitOk('diff', '-U0', base, '--', x.file) ?? '').split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));
  const plumbing = added.filter(isPlumbing).length;
  const why = x.capped ? `it has used its allowance (${ALLOW.used[x.file] ?? 0} of ${ALLOW.total} lines over its cards): it needs its split card now`
    : ALLOW.allowance ? `more than its allowance of ${ALLOW.allowance} a card` : 'a big file may not grow';
  const name = x.file.split('/').pop();
  return [`${x.file} grew ${x.was} -> ${x.lines} lines that hold work: ${why}. Of the lines this change adds, ${added.length - plumbing} hold work and ${plumbing} are plumbing (imports, fields, one-line pass-throughs; not counted).`,
    `  next: its split card, if there is one (npm run board -- --search "${name}"); none: make it (/idea split ${x.file} along what changes together) and do it first, or move the new work into a file of its own. A pure refactor: --update-baseline --allow-growth "<reason>".`].join('\n');
}

function adviceLines() {
  const codeDir = (config.security?.code ?? 'src/').replace(/\/$/, '');
  const diff = gitOk('diff', '-U0', '--diff-filter=d', base, '--', codeDir, 'tests') ?? '';
  const fresh = new Map();
  // new files that git does not know yet count as added: the code, and the tests that say what it refuses
  const fresh0 = git('ls-files', '--others', '--exclude-standard', '--', codeDir, 'tests').split('\n').map((x) => x.trim());
  for (const f of fresh0.filter((x) => x && existsSync(x))) fresh.set(f, lines(readFileSync(f, 'utf8')));
  return [...securityAdvice(diff, fresh, config.security), ...hostileAdvice(diff, fresh, config.security), ...dataAdvice(diff, fresh, config), ...notRead(changedFiles().filter((f) => existsSync(f))).advice];
}
// a library a change adds that docs/STACK.md does not name (only when the project has a STACK.md)
function depsLines() {
  if (!existsSync('docs/STACK.md')) return [];
  const stack = readFileSync('docs/STACK.md', 'utf8');
  return ['package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod'].filter((f) => existsSync(f)).flatMap((f) =>
    unnamedDependencies(addedDependencies(f, gitOk('show', `${base}:${f}`) ?? '', readFileSync(f, 'utf8')), stack)
      .map((n) => `advice: ${f} adds ${n}, which docs/STACK.md does not name: add it there with why (the owner's decision), or take it out`));
}
// the push guard (npm run protect) lives in this clone's git hooks: a clone on another computer, or a cloud session, has none.
// On GitHub's runners (CI) there is nothing to guard. The session folders share the main folder's hooks.
function guardLines() {
  if (process.env.CI || !existsSync('workflow/tools/protect.mjs')) return [];
  const common = gitOk('rev-parse', '--git-common-dir');
  const hook = common ? `${common}/hooks/pre-push` : null;
  if (hook && existsSync(hook) && readFileSync(hook, 'utf8').includes('workflow/tools/protect.mjs')) return [];
  return ['advice: the push guard is not on this computer, so a push here may rewrite or delete main: npm run protect -- --local'];
}
/** --advice: only the advice lines, and what is loosened (workflow/levels.json), so the short run never looks cleaner. */
function adviceOnly() {
  console.log([...adviceLines(), ...depsLines(), ...guardLines(), ...besideLines(), ...(levels.loosened.length ? [loosenedLine(levels)] : [])].join('\n'));
  process.exit(0);
}
if (flag('--advice')) adviceOnly();

const changed = changedFiles();
// "reach": "direct" in workflow/levels.json: only the tests that import a changed file themselves (never for the whole suite)
const reach = affectedTests(graph, changed, { isTest, ignore: config.ignoreChanged, isCode, naming: config.testsNaming, depth: levels.reach === 'direct' && !wholeSuite ? 1 : Infinity });
// a language whose tests the gate cannot pick by file (`testPicking: false`): the whole suite, unless only docs changed
if (config.testPicking === false) { reach.all = changed.some((f) => !matchesAny(f, config.ignoreChanged)); reach.tests = []; }
// which tests run (lib/testplan.mjs): the kit's own only when the machinery changed (on GitHub too), with --kit or WORKFLOW_KIT_TESTS
const plan = testPlan({ whole: wholeSuite, unknown: reach.all, reached: reach.tests, allTests: [...graph.files.keys()].filter(isTest), changed,
  forced: Boolean(process.env.WORKFLOW_KIT_TESTS && process.env.WORKFLOW_KIT_TESTS !== '0') || flag('--kit') || config.testPicking === false, matches: matchesAny,
  kitTests: config.kitTests, kitMachinery: config.kitMachinery, skipKit: process.env.WORKFLOW_KIT_TESTS === '0' });

/** The specs in workflow/specs/ as [name, text] pairs (none when the folder is not there). */
const specFiles = () => (existsSync('workflow/specs') ? readdirSync('workflow/specs').filter((f) => f.endsWith('.md')).map((f) => [f, readFileSync(`workflow/specs/${f}`, 'utf8')]) : []);
const specAdvice = [];
// --only <files>: one builder of several, its own files' type errors and the tests reaching them (lib/only.mjs)
const ownFiles = onlyFiles(args);
if (ownFiles) {
  const reached = affectedTests(graph, ownFiles, { isTest, ignore: config.ignoreChanged, isCode, naming: config.testsNaming, depth: Infinity });
  const r = onlyCheck({ files: ownFiles, typecheck: config.commands.typecheck, testFiles: config.commands.testFiles, tests: reached.tests, run });
  console.log(r.lines.join('\n'));
  process.exit(r.ok ? 0 : 1);
}

// the scope guard: with one spec in workflow/specs/, the changed files it does not name
function scopeLines() {
  if (config.scope === 'off' || !existsSync('workflow/specs')) return [];
  const specs = readdirSync('workflow/specs').filter((f) => f.endsWith('.md'));
  if (specs.length !== 1) return [];
  // a spec waits in the main folder for its build in a session folder: what changes on main meanwhile (a kit update, the owner's
  // notes) is not that spec's change, so it is not held to it
  if ((gitOk('branch', '--show-current') ?? '') === MAIN && specs[0] !== `${MAIN}.md`) return [];
  // never the change's own choice: what a script writes (the map's pages, the docs index, the baseline, the lock files) and the owner's sign-off row
  const ignore = [...settledFiles(config), ...(config.scopeIgnore ?? [])];
  const spec = readFileSync(`workflow/specs/${specs[0]}`, 'utf8');
  // a kit update's spec says "the kit's files" once: every file the kit wrote (workflow/record) is named by it
  const kitFiles = namesKitFiles(spec) && existsSync('workflow/record') ? kitFilesIn(readFileSync('workflow/record', 'utf8')) : [];
  const named = [...specPaths(spec), ...kitFiles, ...(kitFiles.length ? ['workflow/record'] : [])];
  const outside = outsideSpec(changed, named, ignore);
  // a test of a file the spec names, and what only such tests import, belong to that file's change (lib/scope.mjs)
  const own = new Set(ownTestFiles(outside, named, graph, isTest));
  return outside.filter((f) => !own.has(f))
    .map((f) => `scope: ${f} changed, but workflow/specs/${specs[0]} does not name it (add it to the spec or take the change out)`);
}
if (flag('--list')) {
  console.log(reach.all ? 'everything (a changed file is not understood)' : reach.tests.join('\n') || 'no tests reached');
  process.exit(0);
}

let suiteSeconds = 0;
const testPaths = recordPaths(gitOk); // what passed here, the flaky list, the gates running tests now (lib/testrun.mjs)
const tail = (text) => text.trim().split('\n').slice(-config.failTailLines).join('\n');
function run(cmd, cwd, env) {
  // the commands come from workflow/config.json, the project's own file, never from outside input
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', maxBuffer: 256 << 20, ...(cwd ? { cwd } : {}), ...(env ? { env: { ...process.env, ...env } } : {}) });
  return { ok: r.status === 0, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

const steps = [
  ['layers', () => {
    const fresh = newViolations(violations, baseline.boundaries);
    if (fresh.length) return { ok: false, out: fresh.map((v) => `${v.rule}: ${v.file} imports ${v.target}`).join('\n') };
    return { ok: true, note: `${violations.length} known exceptions` };
  }],
  ['size', () => {
    const v = ALLOW.verdict = sizeVerdict(sizes, baseline.sizes, baseline.reasons ?? {}, ALLOW);
    if (v.failing.length) return { ok: false, out: v.failing.map(sizeProblem).join('\n') };
    if (v.stale.length) return { ok: false, out: v.stale.map((f) => `${f} has a reason in baseline.json but is not in the size list (stale reason): remove it`).join('\n') };
    return { ok: true, note: sizeNote(sizes, v, baseline.reasons ?? {}) };
  }],
  funcs && ['functions', () => {
    const v = sizeVerdict(funcs, baseline.functions ?? {});
    if (v.failing.length) return { ok: false, out: v.failing.map((x) => `${x.file} is ${x.lines} lines${x.was ? ` (was ${x.was})` : ''}, the limit is ${config.functions.maxLines}: split it into named steps`).join('\n') };
    return { ok: true, note: `${Object.keys(funcs).length} long functions, none new or grown` };
  }],
  config.ratchets?.length && ['ratchets', () => {
    const up = risen(counts, baseline.ratchets);
    const say = (name) => config.ratchets.find((r) => r.name === name)?.say ?? "One more check on what kind a thing is: put what differs in the kind's own file";
    if (up.length) return { ok: false, out: up.map((x) => `${x.name}: ${x.now}, the baseline is ${x.was}. ${say(x.name)}`).join('\n') };
    return { ok: true, note: Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ') };
  }],
  depths && ['nesting', () => {
    const v = sizeVerdict(depths, baseline.depths ?? {});
    if (v.failing.length) return { ok: false, out: v.failing.map((x) => `${x.file} is nested ${x.lines} deep${x.was ? ` (was ${x.was})` : ''}, the limit is ${config.functions.maxDepth}: return early, or move the inner part into a function of its own`).join('\n') };
    return { ok: true, note: `${Object.keys(depths).length} known` };
  }],
  ['circles', () => {
    const fresh = cycles.filter((k) => !(baseline.cycles ?? []).includes(k));
    if (fresh.length) return { ok: false, out: fresh.map((k) => `${k} import each other in a circle: move what they share into a file both import`).join('\n') };
    return { ok: true, note: `${cycles.length} known` };
  }],
  untested && ['untested', () => {
    const fresh = untested.filter((f) => !(baseline.untested ?? []).includes(f));
    if (fresh.length) return { ok: false, out: fresh.map((f) => `${f}: no test reaches it. Add a test that uses it (a file that only starts the app goes in "untested.ignore" in the config)`).join('\n') };
    return { ok: true, note: `${untested.length} known` };
  }],
  config.ui?.boards === 'components' && config.ui.variants && ['variants', () => {
    // /ui's variants A, B, C are real components while the owner picks; once the pick is built they go (their pictures are the record)
    if (!wholeSuite) return { ok: true, note: 'only with --all' };
    const left = git('ls-files', '--cached', '--others', '--exclude-standard', '--', config.ui.variants).split('\n').filter(Boolean);
    if (left.length) return { ok: false, out: `${config.ui.variants} still holds ${left.length} file${left.length === 1 ? '' : 's'} (${left.slice(0, 5).join(', ')}): the pick is built, so delete the variants. Their pictures in docs/design/png are the record` };
    return { ok: true };
  }],
  config.budget && ['budget', () => {
    const grown = overBudget.filter(([f, , size]) => size > (baseline.budget?.[f] ?? 0));
    if (grown.length) return { ok: false, out: grown.map(([f, max, size]) => `${f} is ${size} bytes, its budget is ${max}${baseline.budget?.[f] ? ` (it was ${baseline.budget[f]})` : ''}: every agent reads it in every chat. Turn a rule into a check, or move what only some work needs into a doc it points to`).join('\n') };
    return { ok: true, note: overBudget.length ? `${overBudget.length} over budget, none grown` : '' };
  }],
  naming && ['naming', () => {
    const fresh = naming.filter((n) => !(baseline.naming ?? []).includes(n.key));
    if (fresh.length) return { ok: false, out: `${fresh.map((n) => n.line).join('\n')}\nRename it to follow docs/CONVENTIONS.md (the rules are "naming" in workflow/config.json).` };
    return { ok: true, note: `${naming.length} known` };
  }],
  copies && ['copies', () => {
    const fresh = copies.filter((k) => !(baseline.copies ?? []).includes(k));
    const say = (k) => (k.includes(' ~ ') ? `${k.replaceAll(' ~ ', ' and ')} are the same test with other values: make it one test over a list of cases` : `${k.replaceAll(' = ', ' and ')} have the same body: keep one and call it from both places`);
    if (fresh.length) return { ok: false, out: fresh.map(say).join('\n') };
    return { ok: true, note: `${copies.length} known` };
  }],
  ['secrets', () => {
    const added = addedLines(gitOk('diff', '-U0', '--diff-filter=d', base) ?? '');
    for (const f of git('ls-files', '--others', '--exclude-standard').split('\n').filter((x) => x && existsSync(x) && statSync(x).size < 300_000)) added.set(f, readFileSync(f, 'utf8').split('\n'));
    const found = [...secretsIn(added).map((x) => `${x.file} holds ${x.kind}`), ...envFiles(git('ls-files').split('\n')).map((f) => `${f} is in git: env files with real values stay out of it`)];
    if (found.length) return { ok: false, out: found.join('\n') + '\nTake it out, read it from the environment (.env, never committed), and change the key if it was ever pushed. A made-up value: put "not a secret" in a comment on that line.' };
    return { ok: true };
  }],
  existsSync('.env.example') && ['settings', () => {
    // every setting the code reads is in .env.example, so a new server or a new person knows every name it needs
    const include = config.settings?.include ?? ['src/**'];
    const files = new Map(git('ls-files', '--cached', '--others', '--exclude-standard').split('\n')
      .filter((f) => f && isCode(f) && matchesAny(f, include) && existsSync(f) && statSync(f).size < 1_000_000).map((f) => [f, readFileSync(f, 'utf8')]));
    const missing = unlisted(files, readFileSync('.env.example', 'utf8'), config.settings?.ignore ?? []);
    if (missing.length) return { ok: false, out: missing.map((m) => `${m.file} reads ${m.name}, which .env.example does not list: add it there with a comment (what it is, an example value, never a real secret)`).join('\n') };
    return { ok: true };
  }],
  ['versions', () => {
    // every tool pinned in .tool-versions, Node one version everywhere, OpenTofu stacks pinned with their lock file in git
    const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : undefined);
    let pkg = null;
    try { pkg = JSON.parse(read('package.json') ?? 'null'); } catch { pkg = null; }
    const tracked = new Set(git('ls-files').split('\n').filter(Boolean));
    const tf = new Map([...tracked, ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter((f) => f && /\.tf$/.test(f) && existsSync(f)).map((f) => [f, readFileSync(f, 'utf8')]));
    const problems = [...unpinnedTools(read('.tool-versions')), ...nodeOutOfStep({ toolVersions: read('.tool-versions'), dockerfile: read('Dockerfile'), pkg }), ...tofuUnpinned(tf, tracked)];
    if (problems.length) return { ok: false, out: problems.join('\n') };
    return { ok: true, note: existsSync('.tool-versions') ? '' : 'no .tool-versions yet' };
  }],
  // the policy checks (spikes, image, network, signoff, covers): lib/policy.mjs
  ...policySteps({ config, git, gitOk, base, files, isTest, matchesAny, readText, docTexts, phase: levels.phase }),
  config.together?.length && ['together', () => {
    const m = missingPartners(config.together, changed);
    if (m.length) return { ok: false, out: m.map((r) => `${r.name}: ${r.changed.join(', ')} changed and nothing under ${r.needs.join(', ')} did. These change together`).join('\n') };
    return { ok: true };
  }],
  config.scope === 'fail' && ['scope', () => { const s = scopeLines(); return s.length ? { ok: false, out: s.join('\n') } : { ok: true }; }],
  ['map', () => run('node workflow/tools/map.mjs --check')],
  // (only a builder that knows --check: an older one would rewrite the file instead of checking it)
  existsSync('docs/flow/build-requests.mjs') && readFileSync('docs/flow/build-requests.mjs', 'utf8').includes("'--check'") && ['requests', () => run('node docs/flow/build-requests.mjs --check')],
  ['harness', () => run('node workflow/tools/harness.mjs --check')],
  ['surfaces', () => {
    // what the product is used on (project.surfaces): a list that makes sense, and a phone or desktop app as an app of its own
    const { names, problems } = surfacesOf(config);
    const roots = (config.apps ?? []).map((a) => String(a.root ?? '').replace(/\/$/, ''));
    const missing = appsOf(names).filter((a) => !roots.includes(a) && !existsSync(a));
    const out = [...problems, ...missing.map((a) => `project.surfaces names an app that is not there yet: ${a} (an entry in "apps" in the config, made when its first card is built)`)];
    return problems.length ? { ok: false, out: out.join('\n') } : { ok: true, note: `${names.join(', ')}${missing.length ? `; ${missing.join(', ')} not made yet` : ''}` };
  }],
  ['docs', () => {
    const fresh = newStaleRefs(staleRefs, baseline.docs ?? []);
    if (fresh.length) return { ok: false, out: fresh.map((s) => `${s.doc}:${s.line} names ${s.ref}, which does not exist`).join('\n') };
    return { ok: true, note: `${docTexts.size} docs, ${staleRefs.length} known stale` };
  }],
  // an approved spec names its end state, the best version, before it picks one (lib/endstate.mjs); its advice prints at the end
  ['spec', () => {
    const specs = specFiles();
    const { fails, advice } = endStateProblems(specs);
    specAdvice.push(...advice);
    return fails.length ? { ok: false, out: fails.join('\n') } : { ok: true, note: specs.some(([, t]) => isApproved(t)) ? 'the end state is named' : 'no approved spec here' };
  }],
  // the changed code keeps problems findable: no empty catch, no console in the server; another language's: "not checked" (lib/errorrules.mjs)
  ['errors', () => {
    const found = changed.filter((f) => existsSync(f)).flatMap((f) => errorRuleFindings(f, readFileSync(f, 'utf8')).map((x) => `${f}:${x.line}: ${x.rule}: ${x.say}`));
    return found.length ? { ok: false, out: found.join('\n') } : { ok: true, note: notRead(changed.filter((f) => existsSync(f))).note };
  }],
  // a package the lock lists and node_modules lacks: said plainly here, instead of as a typecheck or test error further down
  existsSync('package-lock.json') && ['packages', () => {
    const missing = checkPackages('.');
    return missing.length ? { ok: false, out: `${describeMissing(missing)}: ${packagesFix('.', missing)}` } : { ok: true };
  }],
  ['typecheck', () => {
    // a change of only docs and settings (`ignoreChanged`, the files no test is picked for either) cannot break a type: not run
    // again for it (the notes commit, a doc edit). With --all, at /ship in a pilot or in production, and on GitHub it always runs.
    if (!wholeSuite && !process.env.CI && changed.every((f) => matchesAny(f, config.ignoreChanged))) return { ok: true, note: changed.length ? 'only docs and settings changed: nothing it reads' : 'nothing changed' };
    return run(config.commands.typecheck);
  }],
  ['tests', () => {
    if (plan.mode === 'none') return { ok: true, note: plan.note };
    const { r, seconds } = runTests({ config, plan, graph, changed, levels, isTest, run, readIf, paths: testPaths, fresh: flag('--fresh') });
    if (seconds) suiteSeconds = seconds;
    return r;
  }],
  // a test line this change adds that waits a fixed time holds on an idle computer and fails on a busy one (lib/waits.mjs); the
  // old waits of a touched test are not this change's (they are a card of their own), a new test file is all new
  ['waits', () => {
    const tests = changed.filter((f) => isTest(f) && existsSync(f));
    if (!tests.length) return { ok: true };
    const added = addedLineNumbers(gitOk('diff', '-U0', '--diff-filter=d', base, '--', ...tests) ?? '');
    const fresh = new Set(git('ls-files', '--others', '--exclude-standard', '--', ...tests).split('\n').filter(Boolean));
    const found = tests.flatMap((f) => fixedWaits(f, readFileSync(f, 'utf8'))
      .filter((x) => fresh.has(f) || added.get(f)?.has(x.line)).map((x) => `${f}:${x.line}: ${x.say}`));
    return found.length ? { ok: false, out: found.join('\n') } : { ok: true };
  }],
  ...appSteps({ config, changed, all: wholeSuite, run, matches: matchesAny }), // several apps: each one's own (lib/apps.mjs)
  ...dueChecks(config.checks, changed, wholeSuite).map(({ check, due, why }) => [check.name, () => {
    if (!due) return { ok: true, note: why };
    // `setup` (installing a browser, say) runs on GitHub only; on your own computer it is installed once by hand
    if (check.setup && process.env.CI) { const s = run(check.setup); if (!s.ok) return s; }
    return run(check.command);
  }]),
  config.quality?.command && ['quality', () => {
    const q = config.quality;
    if (!wholeSuite && !changed.some((f) => matchesAny(f, q.when ?? ['src/**']))) return { ok: true, note: 'not reached by this change' };
    const r = run(q.command);
    // a command that cannot run here says why ("quality skipped: no ANTHROPIC_API_KEY"): shown as skipped, never as a pass
    const skipped = /^quality skipped: (.+)$/m.exec(r.out)?.[1];
    if (skipped) return { ok: true, note: `skipped: ${skipped}` };
    return qualityVerdict(parseScore(r.out, q.pattern), baseline.quality);
  }],
].filter(Boolean);

// the whole suite over its time budget (`testSeconds`): advice only, because a slow machine is not a broken change
const slowLines = () => (config.testSeconds && suiteSeconds > config.testSeconds ? [`advice: the tests took ${Math.round(suiteSeconds)} s, the budget is ${config.testSeconds} s: make the slow ones faster or merge tests that check the same thing (npm run health)`] : []);
/**
 * Runs the steps at the levels the owner set (workflow/levels.json: lib/levels.mjs): `off` is skipped and said, `advise` says what
 * it found and goes on, `fail` stops the gate. A levels file with a problem fails before anything runs. Ends with what is loosened.
 */
function runSteps(steps) {
  if (levels.problems.length) { console.log(`FAIL levels\n${levels.problems.join('\n')}`); process.exit(1); }
  const advised = [];
  let notMine = 0; // advice about files this change did not touch, left out while prototyping
  for (const [name, fn] of steps) {
    const level = levelOf(levels, name);
    if (level === 'off') { console.log(`off  ${name} (${LEVELS_FILE})`); continue; }
    const t = Date.now();
    const r = fn();
    const secs = ((Date.now() - t) / 1000).toFixed(1);
    if (!r.ok && level === 'advise') {
      // whose it is: the changed files its output names, or none (then it was there before this change)
      const touched = changed.filter((f) => (r.out ?? '').includes(f));
      const whose = touched.length ? `in this change: ${touched.slice(0, 3).join(', ')}${touched.length > 3 ? ', ...' : ''}` : 'not your change (none of its files)';
      console.log(`adv  ${name} (${secs}s) - would fail, ${whose}; advise in ${LEVELS_FILE}`);
      if (!touched.length && levels.phase === 'prototype') { notMine++; continue; }
      advised.push(`advice: ${name} (set to advise): ${tail(r.out ?? '').split('\n').filter(Boolean).slice(0, 3).join(' | ')}`);
      continue;
    }
    if (!r.ok) { console.log(`FAIL ${name} (${secs}s)`); console.log(tail(r.out ?? '')); process.exit(1); }
    console.log(`ok   ${name} (${secs}s)${r.note ? ' - ' + r.note : ''}`);
  }
  if (notMine) advised.push(`(${notMine} advice line${notMine === 1 ? '' : 's'} about files this change did not touch left out while prototyping: npm run gate:all says ${notMine === 1 ? 'it' : 'them'})`);
  for (const line of advised) { console.log(line); said.push(line); }
  console.log(loosenedLine(levels));
  if (flag('--ship')) console.log(`ship: phase ${levels.phase}, so ${wholeSuite ? 'the whole suite ran' : 'the tests this change reaches ran (the whole suite runs on GitHub after the push)'}`);
}
const started = Date.now();
runSteps(steps);
// green: --finish and the next gate:ship know these files passed (a write that fails only costs a run)
if (flag('--ship') && !process.env.CI && ALLOW.verdict?.allowed.length) recordAllowance();
// (after the allowance is written: the pass is on the files as they are now, so --finish does not check them again)
if (shipTree) { try { recordShipPass('.', ALLOW.wrote ? treeOf('.') : shipTree); } catch { /* not recorded */ } }
if (quickKey) { try { recordGatePass('.', quickKey, said); } catch { /* not recorded */ } }
/** gate:ship passed with a big file inside its allowance: the baseline takes the new size, with the card that used it (lib/size.mjs). */
function recordAllowance() {
  const card = gitOk('config', '--get', `branch.${gitOk('branch', '--show-current')}.card`) || null;
  writeFileSync(baselineFile, JSON.stringify(takeAllowance(baseline, ALLOW.verdict.allowed, card), null, 2) + '\n');
  ALLOW.wrote = true;
  for (const a of ALLOW.verdict.allowed) console.log(`size: ${a.file} took ${a.by} line${a.by === 1 ? '' : 's'} of its allowance${card ? ` for #${card}` : ''} (${a.used + a.by} of ${ALLOW.total} used); ${baselineFile} records it, in this commit`);
}
// the app map (map module): code the map names changed while the map did not (lib/worksheet.mjs)
const mapLines = existsSync('docs/flow/map.js') && existsSync('workflow/tools/lib/worksheet.mjs') ? await import('./lib/worksheet.mjs').then((w) => w.staleMapAdvice(w.loadFlow('.'), changed)).catch(() => []) : [];
// in a session folder: the files this change shares with another running session (lib/claims.mjs), said while both can still settle it
function besideLines() {
  const topic = gitOk('branch', '--show-current') ?? '';
  // (only where the session script is: a project without it has no sessions to settle with)
  if (process.env.CI || !topic || topic === MAIN || !existsSync('workflow/scripts/session.mjs')) return [];
  try {
    const all = sessionClaims(mainOf('.'));
    const self = all.find((s) => s.topic === topic);
    if (!self) return [];
    // against the local main, as the other sessions' claims are (the gate's own base may be origin's: unpushed features are not this change)
    const mine = claimOf({ changed: changedIn('.', self.on) }, neverIn(mainOf('.')));
    return clashAdvice(clashes(mine, all.filter((s) => s.topic !== topic), { skip: stackOf(topic, all) }));
  } catch { return []; }
}
// a rule row that grew into a list of files (lib/rulerows.mjs): said when the change touches the doc
const ruleLines = changed.includes('docs/ARCHITECTURE.md') && existsSync('docs/ARCHITECTURE.md') ? longRuleCells('docs/ARCHITECTURE.md', readFileSync('docs/ARCHITECTURE.md', 'utf8'), config.docs?.ruleCellMax ?? 200) : [];
for (const line of [...flakyNow(testPaths), ...(config.scope === 'fail' ? [] : scopeLines()), ...specAdvice, ...ruleLines, ...adviceLines(), ...depsLines(), ...guardLines(), ...slowLines(), ...mapLines, ...besideLines()]) { console.log(line); said.push(line); }
console.log(`gate passed in ${((Date.now() - started) / 1000).toFixed(1)}s, ${changed.length} changed files`);
