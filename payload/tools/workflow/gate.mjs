#!/usr/bin/env node
// The gate: one command that checks a change with scripts, no AI. Quiet when it passes (one line per
// check), and on a failure it prints only the short tail that explains it, so reading it costs few tokens.
//   node tools/workflow/gate.mjs            layer rules, file size, typecheck, tests the change can reach
//   node tools/workflow/gate.mjs --all      the same, with the whole test suite (before --finish)
//   --kit                     also the kit's own tests (tests/workflow/**), which otherwise run only when the machinery changed or on GitHub
//   node tools/workflow/gate.mjs --list     only print which tests the change reaches
//   node tools/workflow/gate.mjs --update-baseline   accept today's exceptions (rules and sizes) as the baseline
//   --allow-growth "<reason>"   with --update-baseline: accept a bigger number (a pure refactor); the reason is printed
//   (project steps from the config: `checks`, `together`, `copies`; a secret in the change fails too. See README.md, *What it checks*)
//   (the gate also fails when docs/MAP.md is out of date: run npm run map; when an OpenCode command is missing or stale: npm run harness;
//   or when a doc names a missing file or npm script)
//   --advice      only print the advice lines (security-review, hostile-input test, a missing push guard) (a full run prints them at the end; they never fail the gate)
//   --base <ref>  compare with this commit instead of the merge-base with origin/main
// Project settings live in workflow.config.json; nothing here knows about the project.
import { checkPackages, describeMissing, packagesFix } from '../../scripts/packages.mjs';
import { testPlan } from './lib/testplan.mjs';
import { errorRuleFindings } from './lib/errorrules.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { buildGraph, affectedTests } from './lib/graph.mjs';
import { findViolations, newViolations } from './lib/boundaries.mjs';
import { oversize, sizeVerdict, updateSizes, sizeNote } from './lib/size.mjs';
import { globToRegExp, matchesAny } from './lib/glob.mjs';
import { securityAdvice, addedLines } from './lib/securityscan.mjs';
import { hostileAdvice } from './lib/hostilecheck.mjs';
import { findStaleRefs, newStaleRefs, staleKey } from './lib/docrefs.mjs';
import { codeTest } from './lib/lang.mjs';
import { longFunctions, copiedFunctions, deepFunctions, copiedTests } from './lib/funclen.mjs';
import { importCycles, untestedFiles } from './lib/structure.mjs';
import { specPaths, outsideSpec } from './lib/scope.mjs';
import { parseScore, qualityVerdict } from './lib/quality.mjs';
import { countPatterns, risen } from './lib/ratchet.mjs';
import { addedDependencies, unnamedDependencies } from './lib/deps.mjs';
import { unlisted } from './lib/envcheck.mjs';
import { nodeOutOfStep, tofuUnpinned, unpinnedTools } from './lib/versions.mjs';
import { namingProblems } from './lib/naming.mjs';
import { policySteps } from './lib/policy.mjs';
import { dueChecks, missingPartners } from './lib/checks.mjs';
import { secretsIn, envFiles } from './lib/secrets.mjs';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
const config = JSON.parse(readFileSync('workflow.config.json', 'utf8'));
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const baseArg = args.includes('--base') ? args[args.indexOf('--base') + 1] : null;

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 }).trim();
// a git call that may fail (no origin yet, say): no output on stderr, null instead
const gitOk = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };

// what the change is compared with: --base, or where this branch left main
// (a repository with no commit yet is compared with git's empty tree, so everything counts as new)
const base = baseArg ?? gitOk('merge-base', 'HEAD', 'origin/main') ?? gitOk('merge-base', 'HEAD', 'main') ?? (gitOk('rev-parse', '--verify', 'HEAD') ? 'HEAD' : '4b825dc642cb6eb9a060e54bf8d69288fbee4904');

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
const graph = buildGraph(files, others);
const isTest = (f) => globToRegExp(config.tests).test(f);

const baselineFile = config.baseline;
const baseline = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : { boundaries: [], sizes: {}, docs: [] };
const sizes = oversize(new Map([...files].filter(([f]) => matchesAny(f, config.size.include))), config.size.maxLines);
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
const overBudget = config.budget ? docFiles.map((f) => [f, Object.entries(config.budget).find(([g]) => matchesAny(f, [g]))?.[1], statSync(f).size]).filter(([, max, size]) => max && size > max) : [];

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
  const upd = updateSizes(sizes, baseline.sizes ?? {}, reason, baseline.reasons ?? {});
  if (!upd.ok) {
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
  const next = { boundaries: violations.map((v) => v.key).sort(), sizes: upd.next, docs: staleRefs.map(staleKey).sort() };
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
    // the command comes from workflow.config.json, the project's own file, never from outside input
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

function adviceLines() {
  const codeDir = (config.security?.code ?? 'src/').replace(/\/$/, '');
  const diff = gitOk('diff', '-U0', '--diff-filter=d', base, '--', codeDir, 'tests') ?? '';
  const fresh = new Map();
  // new files that git does not know yet count as added: the code, and the tests that say what it refuses
  const fresh0 = git('ls-files', '--others', '--exclude-standard', '--', codeDir, 'tests').split('\n').map((x) => x.trim());
  for (const f of fresh0.filter((x) => x && existsSync(x))) fresh.set(f, readFileSync(f, 'utf8').split('\n'));
  return [...securityAdvice(diff, fresh, config.security), ...hostileAdvice(diff, fresh, config.security)];
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
  if (process.env.CI || !existsSync('tools/workflow/protect.mjs')) return [];
  const common = gitOk('rev-parse', '--git-common-dir');
  const hook = common ? `${common}/hooks/pre-push` : null;
  if (hook && existsSync(hook) && readFileSync(hook, 'utf8').includes('tools/workflow/protect.mjs')) return [];
  return ['advice: the push guard is not on this computer, so a push here may rewrite or delete main: npm run protect -- --local'];
}
if (flag('--advice')) { const a = [...adviceLines(), ...depsLines(), ...guardLines()]; if (a.length) console.log(a.join('\n')); process.exit(0); }

const changed = changedFiles();
const reach = affectedTests(graph, changed, { isTest, ignore: config.ignoreChanged, isCode, naming: config.testsNaming });
// a language whose tests the gate cannot pick by file (`testPicking: false`): the whole suite, unless only docs changed
if (config.testPicking === false) { reach.all = changed.some((f) => !matchesAny(f, config.ignoreChanged)); reach.tests = []; }
// which tests run (lib/testplan.mjs): the kit's own only when the machinery changed, on GitHub, with --kit or WORKFLOW_KIT_TESTS
const plan = testPlan({ whole: flag('--all'), unknown: reach.all, reached: reach.tests, allTests: [...graph.files.keys()].filter(isTest), changed,
  forced: Boolean(process.env.CI || process.env.WORKFLOW_KIT_TESTS) || flag('--kit') || config.testPicking === false, matches: matchesAny,
  kitTests: config.kitTests, kitMachinery: config.kitMachinery });

// the scope guard: with one spec in specs/, the changed files it does not name
function scopeLines() {
  if (config.scope === 'off' || !existsSync('specs')) return [];
  const specs = readdirSync('specs').filter((f) => f.endsWith('.md'));
  if (specs.length !== 1) return [];
  const ignore = ['specs/**', config.map?.out, config.map?.infraOut ?? 'docs/run/INFRA-MAP.md', config.baseline, '.opencode/**', 'package-lock.json', 'Cargo.lock', ...(config.scopeIgnore ?? [])].filter(Boolean);
  return outsideSpec(changed, specPaths(readFileSync(`specs/${specs[0]}`, 'utf8')), ignore)
    .map((f) => `scope: ${f} changed, but specs/${specs[0]} does not name it (add it to the spec or take the change out)`);
}
if (flag('--list')) {
  console.log(reach.all ? 'everything (a changed file is not understood)' : reach.tests.join('\n') || 'no tests reached');
  process.exit(0);
}

let suiteSeconds = 0;
const tail = (text) => text.trim().split('\n').slice(-config.failTailLines).join('\n');
function run(cmd) {
  // the commands come from workflow.config.json, the project's own file, never from outside input
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', maxBuffer: 256 << 20 });
  return { ok: r.status === 0, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

const steps = [
  ['layers', () => {
    const fresh = newViolations(violations, baseline.boundaries);
    if (fresh.length) return { ok: false, out: fresh.map((v) => `${v.rule}: ${v.file} imports ${v.target}`).join('\n') };
    return { ok: true, note: `${violations.length} known exceptions` };
  }],
  ['size', () => {
    const v = sizeVerdict(sizes, baseline.sizes, baseline.reasons ?? {});
    if (v.failing.length) return { ok: false, out: v.failing.map((x) => `${x.file} is ${x.lines} lines (limit ${config.size.maxLines}): split it`).join('\n') };
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
    if (!flag('--all')) return { ok: true, note: 'only with --all' };
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
    if (fresh.length) return { ok: false, out: `${fresh.map((n) => n.line).join('\n')}\nRename it to follow docs/CONVENTIONS.md (the rules are "naming" in workflow.config.json).` };
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
  ...policySteps({ config, git, gitOk, base, files, isTest, matchesAny, readText, docTexts }),
  config.together?.length && ['together', () => {
    const m = missingPartners(config.together, changed);
    if (m.length) return { ok: false, out: m.map((r) => `${r.name}: ${r.changed.join(', ')} changed and nothing under ${r.needs.join(', ')} did. These change together`).join('\n') };
    return { ok: true };
  }],
  config.scope === 'fail' && ['scope', () => { const s = scopeLines(); return s.length ? { ok: false, out: s.join('\n') } : { ok: true }; }],
  ['map', () => run('node tools/workflow/map.mjs --check')],
  // (only a builder that knows --check: an older one would rewrite the file instead of checking it)
  existsSync('docs/flow/build-requests.mjs') && readFileSync('docs/flow/build-requests.mjs', 'utf8').includes("'--check'") && ['requests', () => run('node docs/flow/build-requests.mjs --check')],
  ['harness', () => run('node tools/workflow/harness.mjs --check')],
  ['docs', () => {
    const fresh = newStaleRefs(staleRefs, baseline.docs ?? []);
    if (fresh.length) return { ok: false, out: fresh.map((s) => `${s.doc}:${s.line} names ${s.ref}, which does not exist`).join('\n') };
    return { ok: true, note: `${docTexts.size} docs, ${staleRefs.length} known stale` };
  }],
  // the changed code keeps problems findable: no empty catch, no console in the server (lib/errorrules.mjs)
  ['errors', () => {
    const found = changed.filter((f) => existsSync(f)).flatMap((f) => errorRuleFindings(f, readFileSync(f, 'utf8')).map((x) => `${f}:${x.line}: ${x.rule}: ${x.say}`));
    return found.length ? { ok: false, out: found.join('\n') } : { ok: true };
  }],
  // a package the lock lists and node_modules lacks: said plainly here, instead of as a typecheck or test error further down
  existsSync('package-lock.json') && ['packages', () => {
    const missing = checkPackages('.');
    return missing.length ? { ok: false, out: `${describeMissing(missing)}: ${packagesFix('.', missing)}` } : { ok: true };
  }],
  ['typecheck', () => run(config.commands.typecheck)],
  ['tests', () => {
    if (plan.mode === 'none') return { ok: true, note: plan.note };
    const t0 = Date.now();
    const r = run(plan.mode === 'suite' ? config.commands.testAll : `${config.commands.testFiles} ${plan.files.join(' ')}`);
    if (plan.whole) suiteSeconds = (Date.now() - t0) / 1000;
    return { ...r, note: plan.note };
  }],
  ...dueChecks(config.checks, changed, flag('--all')).map(({ check, due, why }) => [check.name, () => {
    if (!due) return { ok: true, note: why };
    // `setup` (installing a browser, say) runs on GitHub only; on your own computer it is installed once by hand
    if (check.setup && process.env.CI) { const s = run(check.setup); if (!s.ok) return s; }
    return run(check.command);
  }]),
  config.quality?.command && ['quality', () => {
    const q = config.quality;
    if (!flag('--all') && !changed.some((f) => matchesAny(f, q.when ?? ['src/**']))) return { ok: true, note: 'not reached by this change' };
    const r = run(q.command);
    // a command that cannot run here says why ("quality skipped: no ANTHROPIC_API_KEY"): shown as skipped, never as a pass
    const skipped = /^quality skipped: (.+)$/m.exec(r.out)?.[1];
    if (skipped) return { ok: true, note: `skipped: ${skipped}` };
    return qualityVerdict(parseScore(r.out, q.pattern), baseline.quality);
  }],
].filter(Boolean);

// the whole suite over its time budget (`testSeconds`): advice only, because a slow machine is not a broken change
const slowLines = () => (config.testSeconds && suiteSeconds > config.testSeconds ? [`advice: the tests took ${Math.round(suiteSeconds)} s, the budget is ${config.testSeconds} s: make the slow ones faster or merge tests that check the same thing (npm run health)`] : []);
const started = Date.now();
for (const [name, fn] of steps) {
  const t = Date.now();
  const r = fn();
  const secs = ((Date.now() - t) / 1000).toFixed(1);
  if (!r.ok) {
    console.log(`FAIL ${name} (${secs}s)`);
    console.log(tail(r.out ?? ''));
    process.exit(1);
  }
  console.log(`ok   ${name} (${secs}s)${r.note ? ' - ' + r.note : ''}`);
}
// the app map (map module): code the map names changed while the map did not (lib/worksheet.mjs)
const mapLines = existsSync('docs/flow/map.js') && existsSync('tools/workflow/lib/worksheet.mjs') ? await import('./lib/worksheet.mjs').then((w) => w.staleMapAdvice(w.loadFlow('.'), changed)).catch(() => []) : [];
for (const line of [...(config.scope === 'fail' ? [] : scopeLines()), ...adviceLines(), ...depsLines(), ...guardLines(), ...slowLines(), ...mapLines]) console.log(line);
console.log(`gate passed in ${((Date.now() - started) / 1000).toFixed(1)}s, ${changed.length} changed files`);
