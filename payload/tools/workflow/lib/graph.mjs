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

// Rust: `use crate::a::b::C;` and `mod name;`
const RUST_USE = /\buse\s+([\w:]+)/g;
const RUST_MOD = /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/gm;

/** Every path a Rust file names after `use` (`std::fs`, `crate::core::total`), as written. */
export function rustUses(text) {
  RUST_USE.lastIndex = 0;
  return [...new Set([...text.matchAll(RUST_USE)].map((m) => m[1].replace(/:+$/, '')))];
}

/** The project files a Rust file reaches: `use crate::…` from the crate's src folder, `mod name;` next to the file. */
export function resolveRust(from, text, known) {
  const at = from.lastIndexOf('/src/');
  const root = at >= 0 ? from.slice(0, at + 5) : from.startsWith('src/') ? 'src/' : posix.dirname(from) + '/';
  const out = new Set();
  const first = (tries) => { const hit = tries.find((t) => known.has(t)); if (hit && hit !== from) out.add(hit); return hit; };
  for (const use of rustUses(text)) {
    if (!use.startsWith('crate::')) continue;
    const segs = use.split('::').slice(1);
    // the longest part of the path that is a file: crate::core::total::add -> src/core/total.rs
    for (let n = segs.length; n > 0; n--) { const base = root + segs.slice(0, n).join('/'); if (first([base + '.rs', base + '/mod.rs'])) break; }
  }
  const stem = posix.basename(from, '.rs');
  const dir = ['lib', 'main', 'mod'].includes(stem) ? posix.dirname(from) : posix.join(posix.dirname(from), stem);
  RUST_MOD.lastIndex = 0;
  for (const m of text.matchAll(RUST_MOD)) first([`${dir}/${m[1]}.rs`, `${dir}/${m[1]}/mod.rs`]);
  return [...out];
}

// Python: `from app.core import total`, `import app.core.total`, `from . import x`
const PY_FROM = /^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import[ \t]+\(?([^#\n]*)/gm;
const PY_IMPORT = /^[ \t]*import[ \t]+([\w.]+(?:[ \t]*,[ \t]*[\w.]+)*)/gm;

/** The project files a Python file reaches, and the outside modules it names (`requests`, `os.path`). */
export function resolvePython(from, text, known) {
  const files = new Set(), uses = new Set();
  const find = (mod, dir) => {
    const rel = mod.replace(/\./g, '/');
    const roots = dir != null ? [dir] : ['', 'src/'];
    for (const r of roots) for (const t of [`${r}${rel}.py`, `${r}${rel}/__init__.py`]) { const p = posix.normalize(t); if (known.has(p) && p !== from) { files.add(p); return true; } }
    return false;
  };
  PY_FROM.lastIndex = 0;
  for (const m of text.matchAll(PY_FROM)) {
    const dots = /^\.*/.exec(m[1])[0].length, mod = m[1].slice(dots);
    // a relative import starts in this file's folder, one folder up for each dot after the first
    const dir = dots ? posix.join(posix.dirname(from), '../'.repeat(dots - 1)) + '/' : null;
    const names = m[2].split(',').map((n) => n.trim().split(/\s+/)[0]).filter((n) => /^\w+$/.test(n));
    // `from app.core import total`: total may be a file of its own, else the file that is app.core
    let hit = false;
    for (const n of names) hit = find(mod ? `${mod}.${n}` : n, dir) || hit;
    if (mod) hit = find(mod, dir) || hit;
    if (!hit && !dots) uses.add(mod);
  }
  PY_IMPORT.lastIndex = 0;
  for (const m of text.matchAll(PY_IMPORT)) for (const mod of m[1].split(',').map((x) => x.trim())) { if (!find(mod, null)) uses.add(mod); }
  return { files: [...files], uses: [...uses] };
}

// Go: `import "example.com/app/internal/core"` reaches every file of the folder the path ends in
const GO_IMPORT = /^[ \t]*(?:import[ \t]+)?(?:[\w.]+[ \t]+)?"([^"\n]+)"[ \t]*$/gm;

export function resolveGo(from, text, known) {
  const dirs = new Map(); // folder -> its .go files that are not tests
  for (const f of known) if (f.endsWith('.go') && !f.endsWith('_test.go')) { const d = posix.dirname(f); if (!dirs.has(d)) dirs.set(d, []); dirs.get(d).push(f); }
  const files = new Set(), uses = new Set();
  GO_IMPORT.lastIndex = 0;
  for (const m of text.matchAll(GO_IMPORT)) {
    const dir = [...dirs.keys()].filter((d) => d !== '.' && (m[1] === d || m[1].endsWith('/' + d))).sort((a, b) => b.length - a.length)[0];
    if (dir && dir !== posix.dirname(from)) dirs.get(dir).forEach((f) => files.add(f));
    else if (!dir) uses.add(m[1]);
  }
  return { files: [...files], uses: [...uses] };
}

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
  const uses = new Map(); // file -> what it names from outside the project, as written (`express`, `std::fs`)
  const link = (file, to) => { if (!importedBy.has(to)) importedBy.set(to, new Set()); importedBy.get(to).add(file); };
  for (const [file, text] of files) {
    const resolved = [];
    const nodes = [];
    if (file.endsWith('.rs')) {
      for (const to of resolveRust(file, text, known)) { resolved.push(to); link(file, to); }
      imports.set(file, resolved);
      nodeImports.set(file, nodes);
      uses.set(file, rustUses(text).filter((u) => !/^(?:crate|super|self)\b/.test(u)));
      continue;
    }
    if (file.endsWith('.py') || file.endsWith('.go')) {
      const r = file.endsWith('.py') ? resolvePython(file, text, known) : resolveGo(file, text, known);
      for (const to of r.files) { resolved.push(to); link(file, to); }
      imports.set(file, resolved);
      nodeImports.set(file, nodes);
      uses.set(file, r.uses);
      continue;
    }
    uses.set(file, importsOf(text).filter((s) => !s.startsWith('.')));
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
  return { files, known, imports, nodeImports, importedBy, uses };
}

// Tests reached from the changed files through any chain of imports.
// `all` is true when a change is not understood (so the safe answer is the whole suite).
export function affectedTests(graph, changed, { isTest, ignore = [], isCode = (f) => CODE.test(f), naming = {} }) {
  const tests = new Set();
  let all = false;
  const queue = [];
  for (const file of changed) {
    if (matchesAny(file, ignore)) continue;
    if (graph.files.has(file)) { queue.push(file); continue; }
    if (isCode(file)) { all = true; continue; }
    // a non-code file: the tests that name it (readFileSync of styles.css), else unknown. `naming` (testsNaming in the
    // config) says which word stands for a group of files: { "src/web/css/**": "css-parts.mjs" } for a stylesheet in parts
    const name = Object.entries(naming).find(([glob]) => matchesAny(file, [glob]))?.[1] ?? posix.basename(file);
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
