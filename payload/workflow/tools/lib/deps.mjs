// New dependencies a change adds that docs/STACK.md does not name: every library is a decision with a reason (CLAUDE.md,
// "The stack is decided"). Reads package.json, Cargo.toml, pyproject.toml and go.mod as text. Pure.

/** The dependency names a manifest lists (type packages such as @types/node are left out: they follow the library). */
export function dependencyNames(file, text) {
  const t = String(text ?? '');
  if (!t.trim()) return [];
  if (file.endsWith('package.json')) {
    let pkg;
    try { pkg = JSON.parse(t); } catch { return []; }
    const keys = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap((k) => Object.keys(pkg[k] ?? {}));
    return [...new Set(keys.filter((n) => !n.startsWith('@types/')))];
  }
  if (file.endsWith('Cargo.toml')) {
    const out = [];
    let on = false;
    for (const line of t.split(/\r?\n/)) {
      const head = /^\s*\[([^\]]+)\]/.exec(line);
      if (head) { on = /(^|\.)(dev-|build-)?dependencies$/.test(head[1].trim()); continue; }
      const m = on && /^\s*([A-Za-z0-9_-]+)\s*(?:=|\.)/.exec(line);
      if (m) out.push(m[1]);
    }
    return [...new Set(out)];
  }
  if (file.endsWith('pyproject.toml')) {
    // the strings in a `dependencies = [...]` list and in the lists of [dependency-groups]; a name ends at a version or an extra
    const lists = [...t.matchAll(/(?:^|\n)\s*(?:dependencies|[\w-]+)\s*=\s*\[([^\]]*)\]/g)].map((m) => m[1]);
    const names = lists.flatMap((l) => [...l.matchAll(/["']([A-Za-z0-9_.-]+)/g)].map((m) => m[1]));
    return [...new Set(names)];
  }
  if (file.endsWith('go.mod')) {
    const names = [];
    for (const m of t.matchAll(/^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]+\/[^\s]+)\s+v[\d.]+/gm)) names.push(m[1]);
    return [...new Set(names)];
  }
  return [];
}

/** The names in `after` that are not in `before`. */
export function addedDependencies(file, before, after) {
  const was = new Set(dependencyNames(file, before));
  return dependencyNames(file, after).filter((n) => !was.has(n));
}

/** The names `stack` (the text of docs/STACK.md) never mentions; a Go module counts when its last part is named. */
export function unnamedDependencies(names, stack) {
  const text = String(stack ?? '').toLowerCase();
  return names.filter((n) => !text.includes(n.toLowerCase()) && !text.includes(n.toLowerCase().split('/').pop()));
}
