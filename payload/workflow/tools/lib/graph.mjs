// The import graph of the project, read from the source text (no compiler), and the question
// "which tests can a change reach?". Pure: files come in as a Map of path -> text.
import { builtinModules } from 'node:module';
import { posix } from 'node:path';
import { matchesAny } from './glob.mjs';

const FROM = /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g;
const SIDE = /\bimport\s*['"]([^'"]+)['"]/g;
const DYNAMIC = /\bimport\s*\(\s*(?:['"]([^'"]+)['"]|`([^`$]+)`)\s*\)/g; // import('./x') and import(`./x`) without ${}
const REQUIRE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const CODE = /\.(?:[mc]?ts|tsx|[mc]?js|jsx|vue|svelte)$/;
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
  for (const re of [FROM, SIDE, DYNAMIC, REQUIRE]) {
    re.lastIndex = 0;
    for (let m; (m = re.exec(text)); ) found.add(m[1] ?? m[2]);
  }
  return [...found];
}

export function isNodeModule(spec) {
  return spec.startsWith('node:') || BUILTIN.has(spec.split('/')[0]);
}

/** A tsconfig's text without its comments and trailing commas (tsconfig is JSON with comments), parsed; null when it is not. */
function parseJsonc(text) {
  let out = '', i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') { const end = /"(?:[^"\\]|\\.)*"/y; end.lastIndex = i; const m = end.exec(text); out += m ? m[0] : c; i += m ? m[0].length : 1; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? text.length : e + 2; continue; }
    out += c; i++;
  }
  try { return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1')); } catch { return null; }
}

/**
 * The path aliases a tsconfig sets (`"paths": { "@/*": ["./src/*"] }`, `"baseUrl": "src"`), with their targets from the project's
 * root: [{ dir, pattern, targets }]. `dir` is the tsconfig's folder ('' at the root, 'apps/web/' for an app): its aliases apply to
 * the files under it. Next.js, shadcn/ui and Vite starters import with `@/`, so without these the layer rules and test picking
 * would not see those imports at all.
 */
export function aliasesFrom(tsconfigText, dir = '') {
  const opts = parseJsonc(String(tsconfigText ?? ''))?.compilerOptions ?? {};
  const at = dir ? `${dir.replace(/\/$/, '')}/` : '';
  const base = posix.normalize(at + (opts.baseUrl ?? '.')).replace(/^\.$/, '');
  const from = (p) => posix.normalize(posix.join(base, p)).replace(/^\.\//, '');
  const out = Object.entries(opts.paths ?? {}).map(([pattern, targets]) => ({ dir: at, pattern, targets: [].concat(targets).map(from) }));
  if (opts.baseUrl) out.push({ dir: at, pattern: '*', targets: [from('*')] });
  return out;
}

/**
 * The compiler options a tsconfig file ends up with, `extends` followed (a relative base, or several; a package's base such as
 * @tsconfig/node holds no aliases and is left out). As TypeScript does it: the file's own options win, and `paths` and `baseUrl`
 * stay relative to the file that sets them, so each comes back with that file's folder ({ paths, pathsDir, baseUrl }).
 */
function effectiveOptions(file, read, seen = new Set()) {
  if (seen.has(file)) return {};
  seen.add(file);
  const cfg = parseJsonc(String(read(file) ?? ''));
  if (!cfg) return {};
  const dir = posix.dirname(file) === '.' ? '' : posix.dirname(file);
  let out = {};
  for (const ext of [].concat(cfg.extends ?? [])) {
    if (typeof ext !== 'string' || !/^\.\.?\//.test(ext)) continue;
    const base = posix.normalize(posix.join(dir, ext));
    out = { ...out, ...effectiveOptions(/\.json$/.test(base) ? base : `${base}.json`, read, seen) };
  }
  const own = cfg.compilerOptions ?? {};
  if (own.paths) out = { ...out, paths: own.paths, pathsDir: dir };
  if (own.baseUrl) out = { ...out, baseUrl: posix.normalize(posix.join(dir, own.baseUrl)).replace(/^\.$/, '') };
  return out;
}

/** The aliases one tsconfig file gives, `extends` followed; applied to the files under `scope`. */
export function aliasesOfFile(file, read, scope = '') {
  const o = effectiveOptions(file, read);
  const at = scope ? `${scope.replace(/\/$/, '')}/` : '';
  // `paths` without a `baseUrl` are relative to the file that sets them; with one, to it
  const root = o.baseUrl ?? o.pathsDir ?? '';
  const from = (p) => posix.normalize(posix.join(root, p)).replace(/^\.\//, '');
  const out = Object.entries(o.paths ?? {}).map(([pattern, targets]) => ({ dir: at, pattern, targets: [].concat(targets).map(from) }));
  if (o.baseUrl != null) out.push({ dir: at, pattern: '*', targets: [from('*')] });
  return out;
}

/**
 * Every alias of the project: for the root and each app (`apps` in the config), its tsconfig.json, the files that one names in
 * `references` (Vite's tsconfig.app.json), and a tsconfig.app.json or tsconfig.base.json beside it. `read(path)` is the text or null.
 */
export function projectAliases(apps, read) {
  const dirs = ['', ...(Array.isArray(apps) ? apps.map((a) => a.root).filter(Boolean) : [])];
  return dirs.flatMap((d) => {
    const at = d ? `${d.replace(/\/$/, '')}/` : '';
    const main = parseJsonc(String(read(`${at}tsconfig.json`) ?? '')) ?? {};
    const refs = (main.references ?? []).map((r) => (typeof r?.path === 'string' ? posix.normalize(`${at}${r.path}`) : null)).filter(Boolean)
      .map((p) => (/\.json$/.test(p) ? p : `${p}/tsconfig.json`));
    const files = [...new Set([`${at}tsconfig.json`, ...refs, `${at}tsconfig.app.json`, `${at}tsconfig.base.json`])].filter((f) => read(f) != null);
    return files.flatMap((f) => aliasesOfFile(f, read, d));
  });
}

/** The files an aliased import may be (`@/server/db` -> ['src/server/db']), for the aliases that apply to `from`. */
function aliasTargets(from, spec, aliases) {
  const out = [];
  for (const a of aliases) {
    if (a.dir && !from.startsWith(a.dir)) continue;
    const star = a.pattern.indexOf('*');
    const [pre, post] = star < 0 ? [a.pattern, ''] : [a.pattern.slice(0, star), a.pattern.slice(star + 1)];
    if (star < 0 ? spec !== a.pattern : !(spec.startsWith(pre) && spec.endsWith(post) && spec.length >= pre.length + post.length)) continue;
    const rest = star < 0 ? '' : spec.slice(pre.length, spec.length - post.length);
    for (const t of a.targets) out.push(t.replace('*', rest));
  }
  return out;
}

const candidates = (base) => {
  const stem = base.replace(/\.(?:js|mjs)$/, '');
  // a folder stands for its index file (`import('../variants')` is src/variants/index.tsx)
  return [base, base + '.ts', base + '.tsx', base + '.mjs', base + '.js', base + '/index.ts', base + '/index.tsx', base + '/index.mjs', base + '/index.js', stem + '.ts', stem + '.tsx'];
};

export function resolveImport(from, spec, known, aliases = []) {
  if (!spec.startsWith('.')) {
    // the nearest tsconfig first (an app's own before the root's), then the longest alias (`@/*` before baseUrl's `*`); the
    // first that names a project file wins, and a package name stays outside
    const order = [...aliases].sort((a, b) => b.dir.length - a.dir.length || b.pattern.length - a.pattern.length);
    for (const t of aliasTargets(from, spec, order)) {
      const hit = candidates(t).find((c) => known.has(c));
      if (hit) return hit;
    }
    return null;
  }
  return candidates(posix.join(posix.dirname(from), spec)).find((t) => known.has(t)) ?? null;
}

// files: Map<path, text> of code files; others: paths of non-code files that exist (css, json, html);
// aliases: what aliasesFrom read from the project's tsconfig files (`@/server/db` is then followed like `../server/db`).
export function buildGraph(files, others = [], { aliases = [] } = {}) {
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
    const outside = [];
    for (const spec of importsOf(text)) {
      if (isNodeModule(spec)) { nodes.push(spec.startsWith('node:') ? spec : 'node:' + spec); outside.push(spec); continue; }
      const to = resolveImport(file, spec, known, aliases);
      if (!to) { if (!spec.startsWith('.')) outside.push(spec); continue; }
      resolved.push(to);
      link(file, to);
    }
    uses.set(file, outside);
    imports.set(file, resolved);
    nodeImports.set(file, nodes);
  }
  return { files, known, imports, nodeImports, importedBy, uses };
}

// Tests reached from the changed files through any chain of imports.
// `all` is true when a change is not understood (so the safe answer is the whole suite).
// depth: how far up the imports to look (Infinity: every file that leans on the change, the default; 1: the tests that import a
// changed file themselves, workflow/levels.json's "reach": "direct", faster and blind to a test that reaches it through a helper)
export function affectedTests(graph, changed, { isTest, ignore = [], isCode = (f) => CODE.test(f), naming = {}, depth = Infinity }) {
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
  const seen = new Map(queue.map((f) => [f, 0]));
  while (queue.length) {
    const f = queue.shift(); // breadth first, so each file gets its shortest distance
    if (isTest(f)) tests.add(f);
    if (seen.get(f) >= depth) continue;
    for (const up of graph.importedBy.get(f) ?? []) if (!seen.has(up)) { seen.set(up, seen.get(f) + 1); queue.push(up); }
  }
  return { tests: [...tests].sort(), all };
}
