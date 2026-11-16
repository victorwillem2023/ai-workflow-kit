// Docs that name something that is gone: a repo path in backticks (src/, config/, tests/, scripts/, tools/, docs/)
// or an `npm run <name>` with no such script. Pure: the caller says what exists. Bare names (service.ts) are not checked.
const PATH = /^(?:src|config|tests|scripts|tools|docs)\/\S*$/;
const NPM = /\bnpm run ([A-Za-z0-9:_.-]+)/g;

export function findStaleRefs(docs, exists, npmScripts) {
  const scripts = new Set(npmScripts);
  const out = [];
  for (const [doc, text] of docs) {
    let fenced = false;
    text.split('\n').forEach((raw, i) => {
      const line = i + 1;
      const seen = new Set();
      const add = (ref) => { if (!seen.has(ref)) { seen.add(ref); out.push({ doc, line, ref }); } };
      const npm = (s) => { for (const m of s.matchAll(NPM)) if (!scripts.has(m[1])) add(`npm run ${m[1]}`); };
      if (raw.trimStart().startsWith('```')) { fenced = !fenced; return; }
      if (fenced) { npm(raw); return; }
      for (const m of raw.matchAll(/`([^`]+)`/g)) {
        const span = m[1].trim();
        npm(span);
        if (!PATH.test(span) || /[*<>{}]/.test(span)) continue;
        const path = span.replace(/(?::\d+(?:-\d+)?|#L\d+.*)$/, '');
        if (!exists(path)) add(path);
      }
    });
  }
  return out;
}

export const staleKey = (s) => `${s.doc}|${s.ref}`;
export function newStaleRefs(all, baselineKeys) {
  const known = new Set(baselineKeys);
  return all.filter((s) => !known.has(staleKey(s)));
}
