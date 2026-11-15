#!/usr/bin/env node
// The gate: one command that checks a change with scripts, no AI. Quiet when it passes (one line per
// check), and on a failure it prints only the short tail that explains it, so reading it costs few tokens.
//   node tools/workflow/gate.mjs            layer rules, file size, typecheck, tests the change can reach
//   node tools/workflow/gate.mjs --all      the same, with the whole test suite (before --finish)
//   node tools/workflow/gate.mjs --list     only print which tests the change reaches
//   node tools/workflow/gate.mjs --update-baseline   accept today's exceptions (rules and sizes) as the baseline
//   --allow-growth "<reason>"   with --update-baseline: accept a bigger number (a pure refactor); the reason is printed
//   (the gate also fails when docs/MAP.md is out of date: run npm run map; when an OpenCode command is missing or stale: npm run harness;
//   or when a doc names a missing file or npm script)
//   --advice      only print the advice lines (security-review, hostile-input test) (a full run prints them at the end; they never fail the gate)
//   --base <ref>  compare with this commit instead of the merge-base with origin/main
// Project settings live in workflow.config.json; nothing here knows about the project.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { buildGraph, affectedTests } from './lib/graph.mjs';
import { findViolations, newViolations } from './lib/boundaries.mjs';
import { oversize, sizeVerdict, updateSizes, sizeNote } from './lib/size.mjs';
import { globToRegExp, matchesAny } from './lib/glob.mjs';
import { securityAdvice } from './lib/securityscan.mjs';
import { hostileAdvice } from './lib/hostilecheck.mjs';
import { findStaleRefs, newStaleRefs, staleKey } from './lib/docrefs.mjs';
import { codeTest } from './lib/lang.mjs';
import { longFunctions } from './lib/funclen.mjs';
import { specPaths, outsideSpec } from './lib/scope.mjs';
import { parseScore, qualityVerdict } from './lib/quality.mjs';
import { countPatterns, risen } from './lib/ratchet.mjs';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
const config = JSON.parse(readFileSync('workflow.config.json', 'utf8'));
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const baseArg = args.includes('--base') ? args[args.indexOf('--base') + 1] : null;

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 }).trim();
// a git call that may fail (no origin yet, say): no output on stderr, null instead
const gitOk = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };

function listFiles() {
  const all = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(Boolean);
  return all.filter((f) => config.roots.some((r) => f.startsWith(r + '/')) && !matchesAny(f, config.skipFiles) && existsSync(f));
}

function changedFiles() {
  const base = baseArg ?? gitOk('merge-base', 'HEAD', 'origin/main') ?? gitOk('merge-base', 'HEAD', 'main') ?? 'HEAD';
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
const violations = findViolations(graph, config.boundaries);

const docFiles = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n')
  .filter((f) => f && matchesAny(f, config.docs.include) && !matchesAny(f, config.docs.exclude) && existsSync(f));
const docTexts = new Map(docFiles.map((f) => [f, readFileSync(f, 'utf8')]));
const npmScripts = existsSync('package.json') ? Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).scripts ?? {}) : [];
const staleRefs = findStaleRefs(docTexts, (p) => existsSync(p), npmScripts);

if (flag('--update-baseline')) {
  let reason = null;
  if (flag('--allow-growth')) {
    reason = (args[args.indexOf('--allow-growth') + 1] ?? '').trim();
    if (!reason || reason.startsWith('--')) { console.log('--allow-growth needs a reason: --allow-growth "<reason>"'); process.exit(1); }
  }
  const upd = updateSizes(sizes, baseline.sizes ?? {}, reason, baseline.reasons ?? {});
  if (!upd.ok) {
    console.log('baseline not written: these would grow (put the new code in its own file, or --allow-growth "<reason>" for a pure refactor):');
    for (const x of upd.raised) console.log(`  ${x.file} ${x.was ?? 'new'} -> ${x.now}`);
    process.exit(1);
  }
  if (upd.message) console.log(upd.message);
  const next = { boundaries: violations.map((v) => v.key).sort(), sizes: upd.next, docs: staleRefs.map(staleKey).sort() };
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
  if (config.quality?.command) {
    // the score now becomes the number that may not drop; a lower one needs a reason, like a file that grew
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
  const base = baseArg ?? gitOk('merge-base', 'HEAD', 'origin/main') ?? gitOk('merge-base', 'HEAD', 'main') ?? 'HEAD';
  const diff = gitOk('diff', '-U0', '--diff-filter=d', base, '--', codeDir, 'tests') ?? '';
  const fresh = new Map();
  const fresh0 = git('ls-files', '--others', '--exclude-standard', '--', codeDir).split('\n').map((x) => x.trim());
  for (const f of fresh0.filter((x) => x && existsSync(x))) fresh.set(f, readFileSync(f, 'utf8').split('\n'));
  return [...securityAdvice(diff, fresh, config.security), ...hostileAdvice(diff, fresh, config.security)];
}
if (flag('--advice')) { const a = adviceLines(); if (a.length) console.log(a.join('\n')); process.exit(0); }

const changed = changedFiles();
const reach = affectedTests(graph, changed, { isTest, ignore: config.ignoreChanged, isCode, naming: config.testsNaming });
// a language whose tests the gate cannot pick by file (`testPicking: false`): the whole suite, unless only docs changed
if (config.testPicking === false) { reach.all = changed.some((f) => !matchesAny(f, config.ignoreChanged)); reach.tests = []; }

// the scope guard: with one spec in specs/, the changed files it does not name
function scopeLines() {
  if (config.scope === 'off' || !existsSync('specs')) return [];
  const specs = readdirSync('specs').filter((f) => f.endsWith('.md'));
  if (specs.length !== 1) return [];
  const ignore = ['specs/**', config.map?.out, config.baseline, '.opencode/**', 'package-lock.json', 'Cargo.lock', ...(config.scopeIgnore ?? [])].filter(Boolean);
  return outsideSpec(changed, specPaths(readFileSync(`specs/${specs[0]}`, 'utf8')), ignore)
    .map((f) => `scope: ${f} changed, but specs/${specs[0]} does not name it (add it to the spec or take the change out)`);
}
if (flag('--list')) {
  console.log(reach.all ? 'everything (a changed file is not understood)' : reach.tests.join('\n') || 'no tests reached');
  process.exit(0);
}

const tail = (text) => text.trim().split('\n').slice(-config.failTailLines).join('\n');
function run(cmd) {
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
    if (up.length) return { ok: false, out: up.map((x) => `${x.name}: ${x.now}, the baseline is ${x.was}. One more check on what kind a thing is: put what differs in the kind's own file`).join('\n') };
    return { ok: true, note: Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ') };
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
  ['typecheck', () => run(config.commands.typecheck)],
  ['tests', () => {
    if (flag('--all') || reach.all) { const r = run(config.commands.testAll); return { ...r, note: 'whole suite' + (reach.all ? ' (an unknown file changed)' : '') }; }
    if (!reach.tests.length) return { ok: true, note: 'no tests reached by this change' };
    const r = run(`${config.commands.testFiles} ${reach.tests.join(' ')}`);
    return { ...r, note: `${reach.tests.length} test files` };
  }],
  config.quality?.command && ['quality', () => {
    const q = config.quality;
    if (!flag('--all') && !changed.some((f) => matchesAny(f, q.when ?? ['src/**']))) return { ok: true, note: 'not reached by this change' };
    return qualityVerdict(parseScore(run(q.command).out, q.pattern), baseline.quality);
  }],
].filter(Boolean);

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
for (const line of [...(config.scope === 'fail' ? [] : scopeLines()), ...adviceLines()]) console.log(line);
console.log(`gate passed in ${((Date.now() - started) / 1000).toFixed(1)}s, ${changed.length} changed files`);
