// The repeats the gate's copy check cannot see (no I/O here; lib/anatomy.mjs reads them per flow):
//   repeated rules  a named number or list of numbers written in more than one file (`STEP_BACK = [0, 0.04, 0.1]` and the same
//                   list inline elsewhere), or one name given different values in two files: a rule with two homes
//   look-alikes     two functions that share most of their code but are not the same: one job written twice, drifting apart
import { functionsIn } from './funclen.mjs';

const isTestFile = (f) => /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/.test(f);
// a constant: `const NAME = 42`, `export const LIMITS = [3, 5, 8]`, `NAME = 0.5` (Python), `const NAME: f64 = 2.5;` (Rust, Go)
const NAMED = /^\s*(?:export\s+)?(?:pub\s+)?(?:const|let|static|final)?\s*([A-Z][A-Z0-9_]{2,}|[a-z][a-zA-Z0-9]*(?:Max|Min|Limit|Steps?|Km|M|Factor|Ratio))\s*(?::\s*[\w\[\]<>&]+)?\s*=\s*(-?\d[\d_.]*|\[\s*-?\d[\d_.\s,-]*\])\s*;?\s*(?:\/\/.*|#.*)?$/;
const LIST = /\[\s*(-?\d[\d_.]*\s*,\s*){2,}-?\d[\d_.]*\s*\]/g;
const TRIVIAL = new Set(['0', '1', '2', '-1', '[0, 1]', '[0, 0]']);
const norm = (v) => v.replace(/_/g, '').replace(/\s+/g, '').replace(/,/g, ', ');

/** The rules written twice: [{ what, value, places: [{ file, line, name? }] }]: one name in two files, or one list of numbers. */
export function repeatedRules(files) {
  const byValue = new Map(), byName = new Map();
  const add = (m, k, p) => m.set(k, [...(m.get(k) ?? []), p]);
  for (const [file, text] of files) {
    if (isTestFile(file)) continue;
    text.split('\n').forEach((l, i) => {
      const n = NAMED.exec(l);
      if (n && !TRIVIAL.has(norm(n[2]))) { add(byValue, norm(n[2]), { file, line: i + 1, name: n[1] }); add(byName, n[1], { file, line: i + 1, value: norm(n[2]) }); return; }
      for (const m of l.matchAll(LIST)) add(byValue, norm(m[0]), { file, line: i + 1 });
    });
  }
  const inFiles = (ps) => new Set(ps.map((p) => p.file)).size;
  // a list of numbers written twice is one rule with two homes; a single number shared by two names is a coincidence (150 m, 150 ms)
  const lists = [...byValue].filter(([v, ps]) => v.startsWith('[') && inFiles(ps) >= 2)
    .map(([value, places]) => ({ what: 'the same list of numbers in two files', value, places }));
  const names = [...byName].filter(([, ps]) => inFiles(ps) >= 2).map(([name, places]) => ({
    what: new Set(places.map((p) => p.value)).size >= 2 ? `${name} has different values` : `${name} is written in two files`, value: name, places }));
  return [...names, ...lists];
}

const tokens = (text) => text.replace(/\/\/.*$|#.*$/gm, '').split(/[^\w$]+/).filter(Boolean);
const shingles = (t, k = 4) => new Set(t.slice(0, Math.max(0, t.length - k + 1)).map((_, i) => t.slice(i, i + k).join(' ')));

/**
 * Functions of `minLines` or more that share `min` (0.6) of their four-word runs but are not the same:
 * [{ a: { file, name, line }, b: { ... }, alike }], most alike first, at most `max`. Words common to many functions are skipped.
 */
export function lookAlikes(files, { minLines = 8, min = 0.6, max = 40 } = {}) {
  const fns = [];
  for (const [file, text] of files) {
    if (isTestFile(file)) continue;
    const lines = text.split('\n');
    for (const f of functionsIn(file, text)) {
      if (f.to - f.from + 1 < minLines) continue;
      const body = lines.slice(f.from, f.to + 1).join('\n');
      fns.push({ file, name: f.name, line: f.from + 1, to: f.to + 1, body: body.replace(/\s+/g, ' '), set: shingles(tokens(body)) });
    }
  }
  const index = new Map();
  fns.forEach((fn, i) => { for (const s of fn.set) index.set(s, [...(index.get(s) ?? []), i]); });
  const shared = new Map();
  for (const ids of index.values()) {
    if (ids.length < 2 || ids.length > 20) continue;
    for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) { const k = `${ids[x]}|${ids[y]}`; shared.set(k, (shared.get(k) ?? 0) + 1); }
  }
  const out = [];
  for (const [k, n] of shared) {
    const [a, b] = k.split('|').map(Number).map((i) => fns[i]);
    const alike = n / Math.min(a.set.size, b.set.size);
    const inside = a.file === b.file && a.line <= b.to && b.line <= a.to; // one function inside the other
    if (alike >= min && a.body !== b.body && !inside) out.push({ a: { file: a.file, name: a.name, line: a.line }, b: { file: b.file, name: b.name, line: b.line }, alike: Math.round(alike * 100) / 100 });
  }
  return out.sort((x, y) => y.alike - x.alike).slice(0, max);
}
