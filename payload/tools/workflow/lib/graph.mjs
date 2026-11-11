// The import graph of the project, read from the source text (no compiler), and the question
// "which tests can a change reach?". Pure: files come in as a Map of path -> text.
import { builtinModules } from 'node:module';
import { posix } from 'node:path';
import { matchesAny } from './glob.mjs';

const FROM = /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g;
const SIDE = /\bimport\s*['"]([^'"]+)['"]/g;
const DYNAMIC = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const CODE = /\.(?:ts|tsx|mjs|js)$/;
const BUILTIN = new Set(builtinModules);

export function importsOf(text) {
  const found = new Set();
  for (const re of [FROM, SIDE, DYNAMIC]) {
    re.lastIndex = 0;
    for (let m; (m = re.exec(text)); ) found.add(m[1]);
  }
  return [...found];
}

export function isNodeModule(spec) {
  return spec.startsWith('node:') || BUILTIN.has(spec.split('/')[0]);
}

export function resolveImport(from, spec, known) {
  if (!spec.startsWith('.')) return null;
  const base = posix.join(posix.dirname(from), spec);
  const stem = base.replace(/\.(?:js|mjs)$/, '');
  const tries = [base, base + '.ts', base + '.tsx', base + '.mjs', base + '.js', base + '/index.ts', stem + '.ts', stem + '.tsx'];
  return tries.find((t) => known.has(t)) ?? null;
}

// files: Map<path, text> of code files; others: paths of non-code files that exist (css, json, html).
export function buildGraph(files, others = []) {
  const known = new Set([...files.keys(), ...others]);
  const imports = new Map(); // file -> resolved project files it imports
  const nodeImports = new Map(); // file -> node: modules it imports
  const importedBy = new Map();
  for (const [file, text] of files) {
    const resolved = [];
    const nodes = [];
    for (const spec of importsOf(text)) {
      if (isNodeModule(spec)) { nodes.push(spec.startsWith('node:') ? spec : 'node:' + spec); continue; }
      const to = resolveImport(file, spec, known);
      if (!to) continue;
      resolved.push(to);
      if (!importedBy.has(to)) importedBy.set(to, new Set());
      importedBy.get(to).add(file);
    }
    imports.set(file, resolved);
    nodeImports.set(file, nodes);
  }
  return { files, known, imports, nodeImports, importedBy };
}

// Tests reached from the changed files through any chain of imports.
// `all` is true when a change is not understood (so the safe answer is the whole suite).
export function affectedTests(graph, changed, { isTest, ignore = [] }) {
  const tests = new Set();
  let all = false;
  const queue = [];
  for (const file of changed) {
    if (matchesAny(file, ignore)) continue;
    if (graph.files.has(file)) { queue.push(file); continue; }
    if (CODE.test(file)) { all = true; continue; }
    // a non-code file: the tests that name it (readFileSync of styles.css), else unknown
    const name = posix.basename(file);
    const named = [...graph.files].filter(([f, text]) => isTest(f) && text.includes(name)).map(([f]) => f);
    if (named.length) named.forEach((f) => tests.add(f));
    else all = true;
  }
  const seen = new Set(queue);
  while (queue.length) {
    const f = queue.pop();
    if (isTest(f)) tests.add(f);
    for (const up of graph.importedBy.get(f) ?? []) if (!seen.has(up)) { seen.add(up); queue.push(up); }
  }
  return { tests: [...tests].sort(), all };
}
