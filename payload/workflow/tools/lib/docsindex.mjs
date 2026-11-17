// The docs index (no I/O here): docs/README.md, made by `npm run map` from what is in docs/, so a project has one page that says
// where everything is. The folders are the sections (kit 2.9, doc-layout.mjs in the kit): the product and how it is built at
// the top of docs/, then workflow/, run/, market/ and company/, each doc with one line from its own title and whether it is the
// project's own or the kit's (replaced on update); the other folders (decisions/, design/, guide/ ...) one line each.

/** The subject folders, in the order a project meets them, with what each holds. A folder that is not there is not listed. */
export const SUBJECTS = [
  ['workflow', 'How we work with the AI', 'the workflow, what keeps it cheap, the tools and agents, the AI\'s own security'],
  ['run', 'Running it', 'deploying, the environments, the network, production and recovery, and the launch guides'],
  ['market', 'Bringing it to market', 'who it is for, how they find it, pricing and growth'],
  ['company', 'The company', 'money, access, personal data, sign-offs, the roadmap and the advisors'],
];

/** One line about a doc: what its title says after the project name, else its first sentence. */
export function describe(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const title = lines.find((l) => l.startsWith('# '))?.slice(2).trim() ?? '';
  const after = /:\s*(.+)$/.exec(title)?.[1];
  if (after) return after;
  // a title that already says what the doc is ("How to work with the AI workflow"); a bare name falls through to the text
  if (title.split(/\s+/).length >= 3) return title;
  const para = lines.find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('<!--') && !l.startsWith('|'))?.trim() ?? '';
  const first = (para.split(/(?<=[.:])\s/)[0] ?? '').replace(/[.:]$/, '');
  return first.length > 120 ? `${first.slice(0, 117)}...` : first || title;
}

/** docs/README.md from the docs: docs = [{ path: 'docs/X.md' | 'docs/folder/...', text }], kit = the paths the kit wrote. */
export function renderDocsIndex(docs, kit = new Set()) {
  const line = (d) => `- [${d.path.slice(5).replace(/\.md$/, '')}](${d.path.slice(5)}): ${describe(d.text)}${kit.has(d.path) ? ' *(the kit\'s)*' : ''}`;
  const top = docs.filter((d) => /^docs\/[^/]+\.md$/.test(d.path) && d.path !== 'docs/README.md').sort((a, b) => a.path.localeCompare(b.path));
  const inFolder = (f) => docs.filter((d) => d.path.startsWith(`docs/${f}/`));
  const out = ['# The docs: where everything is', '', 'Made by `npm run map` from the files in this folder: do not edit (the gate checks it is current). Each doc says',
    'what it is in its first line; *(the kit\'s)* marks a guide the kit wrote and replaces on an update, the rest are this project\'s own.', ''];
  if (top.length) out.push('## The product and how it is built', '', ...top.map(line), '');
  for (const [folder, name, what] of SUBJECTS) {
    // only the docs right in the folder: a deeper folder of its own is not a subject page
    const here = inFolder(folder).filter((d) => /^docs\/[^/]+\/[^/]+\.md$/.test(d.path)).sort((a, b) => a.path.localeCompare(b.path));
    if (here.length) out.push(`## ${name} (\`${folder}/\`)`, `${what.charAt(0).toUpperCase()}${what.slice(1)}.`, '', ...here.map(line), '');
  }
  const subjects = new Set(SUBJECTS.map(([f]) => f));
  const others = [...new Set(docs.map((d) => /^docs\/([^/]+)\//.exec(d.path)?.[1]).filter((f) => f && !subjects.has(f)))].sort();
  if (others.length) {
    out.push('## The other folders', '');
    for (const f of others) {
      const files = inFolder(f);
      const readme = files.find((x) => x.path === `docs/${f}/README.md`);
      out.push(`- [${f}/](${f}/): ${readme ? describe(readme.text) : `${files.length} file${files.length === 1 ? '' : 's'}`}`);
    }
    out.push('');
  }
  return out.join('\n');
}
