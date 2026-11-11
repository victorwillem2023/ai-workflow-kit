// Layer rules: which folders may not import which. Existing exceptions live in a baseline
// (a list of violation keys); only a violation not in the baseline fails the gate.
import { matchesAny } from './glob.mjs';

export function findViolations(graph, rules) {
  const out = [];
  for (const rule of rules) {
    for (const file of graph.files.keys()) {
      if (!matchesAny(file, [rule.from])) continue;
      for (const to of graph.imports.get(file) ?? []) {
        if (matchesAny(to, rule.forbid ?? [])) out.push({ rule: rule.name, file, target: to, key: `${rule.name}|${file}|${to}` });
      }
      if (rule.forbidNode) {
        for (const mod of graph.nodeImports.get(file) ?? []) {
          out.push({ rule: rule.name, file, target: mod, key: `${rule.name}|${file}|${mod}` });
        }
      }
    }
  }
  return out;
}

export function newViolations(all, baselineKeys) {
  const ok = new Set(baselineKeys);
  return all.filter((v) => !ok.has(v.key));
}
