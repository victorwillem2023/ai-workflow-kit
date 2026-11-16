// The image check (no I/O here): a Dockerfile builds an image that holds only what runs, as a user who is not root, from a
// pinned base; and .dockerignore keeps the repository's own files (git history, settings, tests, docs) out of the build.
// Trivy checks the same file in the weekly report and the release; this is the fast version in the gate.

/** The stages of a Dockerfile: [{ from, name, lines: [{ n, text }] }] (continued lines joined). */
export function stages(text) {
  const out = [];
  const lines = String(text ?? '').replace(/\\\r?\n/g, ' ').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const t = raw.trim();
    if (!t || t.startsWith('#')) return;
    const from = /^FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i.exec(t);
    if (from) { out.push({ from: from[1], name: from[2] ?? null, lines: [] }); return; }
    out.at(-1)?.lines.push({ n: i + 1, text: t });
  });
  return out;
}

const SECRETISH = /(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|CREDENTIALS?)\b/i;

/** What breaks the image rules: [line, ...] in plain words. */
export function imageProblems(dockerfile, dockerignore) {
  const st = stages(dockerfile);
  if (!st.length) return [];
  const out = [];
  const names = new Set(st.map((s) => s.name).filter(Boolean));
  for (const s of st) {
    if (names.has(s.from)) continue;
    if (!/[:@]/.test(s.from.split('/').pop()) || /:latest$/.test(s.from)) out.push(`Dockerfile: FROM ${s.from} has no fixed version: name one (node:26-trixie-slim), so every build starts from the same base`);
    for (const l of s.lines) {
      const arg = /^(ARG|ENV)\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(l.text);
      if (arg && SECRETISH.test(arg[2])) out.push(`Dockerfile:${l.n}: ${arg[1]} ${arg[2]} puts a secret into the image's history: pass it at run time, or use RUN --mount=type=secret while building`);
      if (/^ADD\s+https?:/i.test(l.text)) out.push(`Dockerfile:${l.n}: ADD from a URL downloads without a checksum: COPY a file, or download in a RUN step that checks the sum`);
    }
  }
  const last = st.at(-1);
  const nonrootBase = /:nonroot\b|distroless.*nonroot|chainguard|dhi\.io/i.test(last.from);
  const user = [...last.lines].reverse().find((l) => /^USER\s/i.test(l.text));
  if (user ? /^USER\s+(root|0)(:|\s|$)/i.test(user.text) : !nonrootBase) out.push('Dockerfile: the image that runs has no USER, so the app runs as root: add USER node (or a :nonroot base)');
  for (const l of last.lines) {
    const copy = /^COPY\s+(?:--\S+\s+)*(.+)$/i.exec(l.text);
    if (!copy) continue;
    const parts = copy[1].trim().split(/\s+/);
    const from = /--from=/i.test(l.text);
    const srcs = parts.slice(0, -1);
    // the whole build context, or the whole folder of an earlier step: everything in the repository ends up in the image
    if (srcs.some((p) => p === '.' || p === './' || (from && /^\/?[a-z]+\/?$/i.test(p) && !/node_modules|dist|build|public|static/i.test(p)))) {
      out.push(`Dockerfile:${l.n}: "${l.text}" copies everything into the image that runs: copy only what runs (the built app, its production libraries, package.json)`);
    }
  }
  if (dockerignore == null) out.push('.dockerignore is missing: without it .git, .env and every other file go into the build');
  else {
    const ig = String(dockerignore).split(/\r?\n/).map((x) => x.trim());
    for (const must of ['.git', '.env']) if (!ig.some((x) => x === must || x === `${must}*` || x === `/${must}` || x === `**/${must}`)) out.push(`.dockerignore does not leave out ${must}`);
  }
  return out;
}
