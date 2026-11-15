// The docs index (no I/O here): docs/README.md, made by `npm run map` from what is in docs/, so a project with many docs has one
// page that says where everything is: the product, the company, how it is built, how it runs, the decisions, and the kit's
// guides, each doc with one line from its own title, and whether it is the project's own or the kit's (replaced on update).

const GROUPS = [
  ['The product', 'what it is, for whom, and where it is going', ['PRODUCT', 'GUIDE', 'MARKET', 'ROADMAP', 'guide/']],
  ['The company', 'money, people, access and the rules that bind it', ['COSTS', 'ACCESS', 'SENSITIVE', 'SIGNOFFS', 'PRIVACY', 'sources/']],
  ['How it is built', 'the stack, the layers, the code and its rules', ['STACK', 'ARCHITECTURE', 'CONVENTIONS', 'MAP', 'REQUESTS', 'STYLE', 'SECURITY', 'API', 'FRONTEND', 'PERFORMANCE', 'AI-SECURITY', 'AI-AGENTS', 'code/', 'design/', 'flow/', 'requests/']],
  ['How it runs', 'setting it up, the environments, the network, recovery', ['SETUP', 'ENVIRONMENTS', 'NETWORK', 'RECOVERY', 'DEPLOY', 'PRODUCTION', 'INFRA-MAP', 'CLUSTER', 'IAC', 'INFRA']],
  ['Decisions', 'what was decided and why', ['decisions/']],
  ['How we work with the AI', 'the workflow, what keeps it cheap, the stages, the advisors', ['WORKFLOW', 'TOKENS', 'LIFECYCLE', 'ADVISORS', 'TOOLS']],
  ['Guides for later', 'read when a card needs them', ['LAUNCH', 'CICD', 'MONITORING', 'MESH', 'RELEASES', 'SCALING', 'GROWTH', 'BUY-OR-HOST', 'STAGES']],
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
  const top = docs.filter((d) => /^docs\/[^/]+\.md$/.test(d.path) && d.path !== 'docs/README.md');
  const folders = new Map();
  for (const d of docs) {
    const m = /^docs\/([^/]+)\//.exec(d.path);
    if (m) folders.set(`${m[1]}/`, [...(folders.get(`${m[1]}/`) ?? []), d]);
  }
  const keyOf = (path) => path.replace(/^docs\//, '').replace(/\.md$/, '');
  const entries = [
    ...top.map((d) => ({ key: keyOf(d.path), line: `- [${keyOf(d.path)}](${d.path.slice(5)}): ${describe(d.text)}${kit.has(d.path) ? ' *(the kit\'s)*' : ''}` })),
    ...[...folders].map(([f, files]) => {
      const readme = files.find((x) => x.path === `docs/${f}README.md`);
      return { key: f, line: `- [${f}](${f}): ${readme ? describe(readme.text) : `${files.length} file${files.length === 1 ? '' : 's'}`}` };
    }),
  ];
  const out = ['# The docs: where everything is', '', 'Made by `npm run map` from the files in this folder: do not edit (the gate checks it is current). Each doc says',
    'what it is in its first line; *(the kit\'s)* marks a guide the kit wrote and replaces on an update, the rest are this project\'s own.', ''];
  const used = new Set();
  for (const [name, what, keys] of GROUPS) {
    const here = keys.flatMap((k) => entries.filter((e) => e.key === k));
    if (!here.length) continue;
    out.push(`## ${name}`, what.charAt(0).toUpperCase() + what.slice(1) + '.', '', ...here.map((e) => e.line), '');
    for (const e of here) used.add(e.key);
  }
  const rest = entries.filter((e) => !used.has(e.key)).sort((a, b) => a.key.localeCompare(b.key));
  if (rest.length) out.push('## Other', '', ...rest.map((e) => e.line), '');
  return out.join('\n');
}
