// Docs that say what they cover (no I/O here). A hand-written doc names the files it describes in a comment:
//   <!-- covers: infra/**, Dockerfile -->              any change to those files
//   <!-- covers new files: src/server/** -->           only files added, removed or renamed there (a new part, a part gone)
// When a covered file changes and the doc does not, the gate fails, unless the spec or a commit message says so on purpose:
//   Docs: no change to docs/ARCHITECTURE.md (a new route inside the existing server part)
// So keeping a doc as it is stays a decision someone wrote down, never something forgotten.

/** The covers lines of a doc: [{ globs, newOnly }]. */
export function parseCovers(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/<!--\s*covers(\s+new files)?:\s*([^>]*?)\s*-->/g)) {
    const globs = m[2].split(',').map((g) => g.trim().replace(/`/g, '')).filter(Boolean);
    if (globs.length) out.push({ globs, newOnly: Boolean(m[1]) });
  }
  return out;
}

/** The git status letters that mean a file came, went or moved. */
const NEW = new Set(['A', 'D', 'R', 'C']);

/** Whether `waivers` (the spec, the commit messages) says on purpose that `doc` stays as it is. */
export const waived = (doc, waivers) => String(waivers ?? '').split('\n').some((l) => /docs:\s*no change/i.test(l) && l.includes(doc));

/** Docs whose covered files changed while they did not: [{ doc, files }].
 *  `docs`: Map of path -> text; `changes`: [{ file, status }] (status: A, M, D, R...); `ignore`: generated files. */
export function staleDocs({ docs, changes, matches, waivers = '', ignore = [] }) {
  const touched = new Set(changes.map((c) => c.file));
  const out = [];
  for (const [doc, text] of docs) {
    if (touched.has(doc) || waived(doc, waivers)) continue;
    const files = new Set();
    for (const rule of parseCovers(text)) {
      for (const c of changes) {
        if (c.file === doc || matches(c.file, ignore)) continue;
        if (rule.newOnly && !NEW.has(c.status[0])) continue;
        if (matches(c.file, rule.globs)) files.add(c.file);
      }
    }
    if (files.size) out.push({ doc, files: [...files].sort() });
  }
  return out;
}

/** `git diff --name-status` lines (and the untracked files, as added) to [{ file, status }]; a rename counts for both names. */
export function parseNameStatus(text, untracked = []) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const [status, ...paths] = line.split('\t');
    if (!status || !paths.length) continue;
    for (const p of paths) out.push({ file: p.trim(), status: status.trim() });
  }
  for (const f of untracked) if (f) out.push({ file: f, status: 'A' });
  return out;
}
