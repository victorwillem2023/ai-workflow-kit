// The naming check: names follow the project's conventions, so a reader (or an agent) finds things where the name says.
// `naming` in workflow.config.json:
//   "files":   [{ "glob": "src/**/*.ts", "style": "kebab", "except": ["main.ts"] }, ...]   a file's name, before its first dot
//   "exports": ["src/**/*.ts", "src/**/*.tsx"]   what TypeScript and JavaScript files export: functions and values in camelCase
//              (a constant may be UPPER_CASE), classes, types, interfaces and enums in PascalCase, and in a .tsx file a
//              component (a function or value starting with a capital) in PascalCase
//   "sorted":  [{ "file": "package.json", "keys": ["dependencies", "devDependencies"] }]   lists kept in alphabetical order
//   "resources": [{ "glob": "infra/**/*.tf", "pattern": "^app-(dev|test|uat|prod)-[a-z]+[0-9]*-[a-z0-9-]+$", "say": "<app>-<env>-<place>-<part>" }]
//              the names given to infrastructure (servers, buckets, networks), so a name says what, where and which environment
// Styles: kebab (quiet-reporter, guards), camel (safeFetch), pascal (App), snake (net_guard), upper (MAX_SIZE).
// What breaks a rule today is in the baseline and may only shrink; a new one fails.

const STYLES = {
  kebab: /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
  camel: /^[a-z][a-zA-Z0-9]*$/,
  pascal: /^[A-Z][a-zA-Z0-9]*$/,
  snake: /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/,
  upper: /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/,
};
const SAY = { kebab: 'kebab-case (lower-case words joined by -)', camel: 'camelCase', pascal: 'PascalCase', snake: 'snake_case', upper: 'UPPER_CASE' };

/** Whether a name has a style (an unknown style lets everything through, so a typo in the config never blocks work). */
export function hasStyle(name, style) {
  return STYLES[style] ? STYLES[style].test(name) : true;
}

/** A file's own name: the part before its first dot (quiet-reporter.d.mts and clock.test.ts are quiet-reporter and clock). */
export const baseName = (path) => String(path).split('/').pop().split('.')[0];

/** File names that break a `files` rule: [{ key, line }]. `matches(path, globs)` is the glob matcher. */
export function badFileNames(paths, rules = [], matches) {
  const out = [];
  for (const p of paths) {
    const rule = rules.find((r) => matches(p, [r.glob]));
    if (!rule) continue;
    const file = p.split('/').pop();
    if ((rule.except ?? []).includes(file)) continue;
    const name = baseName(p);
    if (!hasStyle(name, rule.style)) out.push({ key: `file|${p}`, line: `${p}: the file name "${name}" is not ${SAY[rule.style] ?? rule.style} (rule for ${rule.glob})` });
  }
  return out;
}

const EXPORT = /^export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(async\s+function\*?|function\*?|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;

/** Exported names that break the conventions: [{ key, line }]. */
export function badExports(path, text) {
  const out = [];
  const tsx = /\.[jt]sx$/.test(path);
  for (const m of String(text).matchAll(EXPORT)) {
    const kind = m[1].replace(/^async\s+/, '').replace(/\*$/, '');
    const name = m[2];
    let ok;
    let want;
    if (['class', 'type', 'interface', 'enum'].includes(kind)) { ok = hasStyle(name, 'pascal'); want = 'pascal'; }
    else if (tsx && /^[A-Z]/.test(name)) { ok = hasStyle(name, 'pascal'); want = 'pascal'; }
    else if (kind === 'function') { ok = hasStyle(name, 'camel'); want = 'camel'; }
    else { ok = hasStyle(name, 'camel') || hasStyle(name, 'upper'); want = 'camel'; }
    if (!ok) {
      const line = String(text).slice(0, m.index).split('\n').length;
      out.push({ key: `export|${path}|${name}`, line: `${path}:${line}: the ${kind} "${name}" is not ${SAY[want]}${want === 'camel' && kind !== 'function' ? ' (or UPPER_CASE for a constant)' : ''}` });
    }
  }
  return out;
}

/** The value at a dotted path in a parsed JSON file ("" is the file's top level). */
const at = (obj, dotted) => (dotted ? String(dotted).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj) : obj);
const order = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });

/** Lists in a JSON file that are not in alphabetical order: [{ key, line }]. `keys`: dotted paths to objects (their keys are
 *  checked) or to lists of strings. */
export function unsortedKeys(path, text, keys = []) {
  let json;
  try { json = JSON.parse(text); } catch { return []; }
  const out = [];
  for (const k of keys) {
    const v = at(json, k);
    const list = Array.isArray(v) ? (v.every((x) => typeof x === 'string') ? v : null) : v && typeof v === 'object' ? Object.keys(v) : null;
    if (!list) continue;
    const i = list.findIndex((x, n) => n > 0 && order(list[n - 1], x) > 0);
    if (i > 0) out.push({ key: `sorted|${path}|${k}`, line: `${path}: "${k || '(top level)'}" is not in alphabetical order ("${list[i]}" comes before "${list[i - 1]}")` });
  }
  return out;
}

const NAME = /^\s*name\s*[=:]\s*["']?([^"'\s#,}]+)["']?/gm;

/** Names in infrastructure files (`name = "..."` in OpenTofu, `name: ...` in YAML) that do not fit the project's pattern:
 *  [{ key, line }]. A name built from variables (`${...}`, `{{ }}`) is left to the pattern of what it is built from. */
export function badResourceNames(path, text, rule) {
  let re;
  try { re = new RegExp(rule.pattern); } catch { return []; }
  const out = [];
  for (const m of String(text).matchAll(NAME)) {
    const name = m[1];
    if (/[${}]/.test(name) || re.test(name)) continue;
    const line = String(text).slice(0, m.index).split('\n').length;
    out.push({ key: `name|${path}|${name}`, line: `${path}:${line}: the name "${name}" does not fit ${rule.say ?? rule.pattern}` });
  }
  return out;
}

/** Everything that breaks a naming rule now. `files`: Map of path -> text for the code files the gate reads; `read(path)`
 *  reads any other file (for `sorted` and `resources`). */
export function namingProblems(naming, paths, files, matches, read = () => null) {
  if (!naming) return [];
  const out = badFileNames(paths, naming.files ?? [], matches);
  for (const [p, t] of files) if (matches(p, naming.exports ?? []) && /\.[cm]?[jt]sx?$/.test(p)) out.push(...badExports(p, t));
  for (const s of naming.sorted ?? []) if (paths.includes(s.file)) out.push(...unsortedKeys(s.file, read(s.file) ?? '', s.keys));
  for (const r of naming.resources ?? []) for (const p of paths.filter((x) => matches(x, [r.glob]))) out.push(...badResourceNames(p, read(p) ?? '', r));
  return out;
}
