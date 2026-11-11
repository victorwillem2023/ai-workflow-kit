#!/usr/bin/env node
// The gate: one command that checks a change with scripts, no AI. Quiet when it passes (one line per
// check), and on a failure it prints only the short tail that explains it, so reading it costs few tokens.
//   node tools/workflow/gate.mjs            layer rules, file size, typecheck, tests the change can reach
//   node tools/workflow/gate.mjs --all      the same, with the whole test suite (before --finish)
//   node tools/workflow/gate.mjs --list     only print which tests the change reaches
//   node tools/workflow/gate.mjs --update-baseline   accept today's exceptions (rules and sizes) as the baseline
//   (the gate also fails when docs/MAP.md is out of date: run npm run map, or a doc names a missing file or npm script)
//   --advice      only print the advice lines (security-review, hostile-input test) (a full run prints them at the end; they never fail the gate)
//   --base <ref>  compare with this commit instead of the merge-base with origin/main
// Project settings live in workflow.config.json; nothing here knows about the project.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildGraph, affectedTests } from './lib/graph.mjs';
import { findViolations, newViolations } from './lib/boundaries.mjs';
import { oversize, sizeVerdict } from './lib/size.mjs';
import { globToRegExp, matchesAny } from './lib/glob.mjs';
import { securityAdvice } from './lib/securityscan.mjs';
import { hostileAdvice } from './lib/hostilecheck.mjs';
import { findStaleRefs, newStaleRefs, staleKey } from './lib/docrefs.mjs';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
const config = JSON.parse(readFileSync('workflow.config.json', 'utf8'));
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const baseArg = args.includes('--base') ? args[args.indexOf('--base') + 1] : null;

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 }).trim();
const gitOk = (...a) => { try { return git(...a); } catch { return null; } };

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

const codeFile = /\.(?:ts|tsx|mjs|js)$/;
const files = new Map();
const others = [];
for (const f of listFiles()) {
  if (codeFile.test(f)) files.set(f, readFileSync(f, 'utf8'));
  else others.push(f);
}
const graph = buildGraph(files, others);
const isTest = (f) => globToRegExp(config.tests).test(f);

const baselineFile = config.baseline;
const baseline = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : { boundaries: [], sizes: {}, docs: [] };
const sizes = oversize(new Map([...files].filter(([f]) => matchesAny(f, config.size.include))), config.size.maxLines);
const violations = findViolations(graph, config.boundaries);

const docFiles = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n')
  .filter((f) => f && matchesAny(f, config.docs.include) && !matchesAny(f, config.docs.exclude) && existsSync(f));
const docTexts = new Map(docFiles.map((f) => [f, readFileSync(f, 'utf8')]));
const npmScripts = Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).scripts ?? {});
const staleRefs = findStaleRefs(docTexts, (p) => existsSync(p), npmScripts);

if (flag('--update-baseline')) {
  const next = { boundaries: violations.map((v) => v.key).sort(), sizes: Object.fromEntries(Object.entries(sizes).sort()), docs: staleRefs.map(staleKey).sort() };
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
const reach = affectedTests(graph, changed, { isTest, ignore: config.ignoreChanged });
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
    const v = sizeVerdict(sizes, baseline.sizes);
    if (v.failing.length) return { ok: false, out: v.failing.map((x) => `${x.file} is ${x.lines} lines (limit ${config.size.maxLines}): split it`).join('\n') };
    const notes = v.grown.map((x) => `${x.file} grew ${x.was} -> ${x.now}`);
    return { ok: true, note: notes.length ? 'growing: ' + notes.join('; ') : `${Object.keys(sizes).length} big files, none grown` };
  }],
  ['map', () => run('node tools/workflow/map.mjs --check')],
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
];

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
for (const line of adviceLines()) console.log(line);
console.log(`gate passed in ${((Date.now() - started) / 1000).toFixed(1)}s, ${changed.length} changed files`);
