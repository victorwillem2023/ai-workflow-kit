// The versions check: every tool is pinned, in one place, and the places that name a version agree, so nothing drifts and
// nothing falls far behind unnoticed (Renovate keeps the pins current; this check keeps them pinned and in step).
//   .tool-versions          every tool at an exact version (node 26.13.1, opentofu 1.11.2): read by mise, asdf, GitHub's
//                           setup-node and Renovate. "latest", "lts", "system" or a bare "26" are not pins.
//   Node in step            the major version of .tool-versions, the Dockerfile's FROM node:<n>, package.json engines.node
//                           and @types/node is the same (types may be older, never newer).
//   OpenTofu / Terraform    each folder with a `terraform {` block names required_version, gives every provider a version,
//                           and has its .terraform.lock.hcl tracked in git.

const EXACT = /^v?\d+\.\d+\.\d+([.+-][\w.]+)?$/;

/** The tools of a .tool-versions file: [{ tool, version, line }]. */
export function readToolVersions(text) {
  return String(text ?? '').split(/\r?\n/).map((l, i) => [l.replace(/#.*$/, '').trim(), i + 1]).filter(([l]) => l)
    .map(([l, line]) => { const [tool, version = ''] = l.split(/\s+/); return { tool, version, line }; });
}

/** Tools in .tool-versions that are not pinned to an exact version. */
export function unpinnedTools(text) {
  return readToolVersions(text).filter((t) => !EXACT.test(t.version)).map((t) => `.tool-versions:${t.line} ${t.tool} ${t.version || '(no version)'}: pin an exact version (for example 1.2.3)`);
}

const major = (v) => { const m = /(\d+)/.exec(String(v ?? '')); return m ? Number(m[1]) : null; };

/** Where the project names a Node version: [{ where, major }]. Each text may be missing. */
export function nodeVersions({ toolVersions, dockerfile, pkg }) {
  const out = [];
  const tv = readToolVersions(toolVersions).find((t) => t.tool === 'nodejs' || t.tool === 'node');
  if (tv && major(tv.version) != null) out.push({ where: '.tool-versions', major: major(tv.version) });
  for (const m of String(dockerfile ?? '').matchAll(/^\s*FROM\s+(?:docker\.io\/)?(?:library\/)?node:(\d+)/gim)) out.push({ where: 'the Dockerfile', major: Number(m[1]) });
  const engines = pkg?.engines?.node;
  if (engines && major(engines) != null) out.push({ where: 'package.json engines.node', major: major(engines) });
  return out;
}

/** The disagreements about Node: lines saying which places name which major version, and @types/node newer than Node. */
export function nodeOutOfStep({ toolVersions, dockerfile, pkg }) {
  const found = nodeVersions({ toolVersions, dockerfile, pkg });
  const out = [];
  const majors = [...new Set(found.map((f) => f.major))];
  const said = [...new Set(found.map((f) => `${f.where} says ${f.major}`))];
  if (majors.length > 1) out.push(`Node is not one version: ${said.join(', ')}. Pick one and write it in all of them`);
  const types = pkg?.devDependencies?.['@types/node'] ?? pkg?.dependencies?.['@types/node'];
  const runtime = found[0]?.major;
  if (types && runtime != null && major(types) > runtime) out.push(`@types/node is ${major(types)}, Node is ${runtime}: the types describe functions this Node does not have. Use @types/node ${runtime}`);
  return out;
}

/** The OpenTofu/Terraform folders and what each lacks. `files`: Map of path -> text (*.tf only); `tracked`: Set of git paths. */
export function tofuUnpinned(files, tracked) {
  const dirs = new Map();
  for (const [path, text] of files) {
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
    const d = dirs.get(dir) ?? { text: '', root: false };
    d.text += `\n${text}`;
    if (/^\s*terraform\s*\{/m.test(text)) d.root = true;
    dirs.set(dir, d);
  }
  const out = [];
  for (const [dir, d] of dirs) {
    if (!d.root) continue;
    if (!/required_version\s*=/.test(d.text)) out.push(`${dir}: no required_version in its terraform block: name the OpenTofu version it is written for`);
    const block = /required_providers\s*\{([\s\S]*?)\n\s*\}\s*\n/.exec(d.text)?.[1] ?? '';
    for (const p of block.matchAll(/(\w[\w-]*)\s*=\s*\{([^}]*)\}/g)) if (!/version\s*=/.test(p[2])) out.push(`${dir}: provider ${p[1]} has no version: give it one (~> 1.2 takes fixes, not breaking changes)`);
    const lock = dir === '.' ? '.terraform.lock.hcl' : `${dir}/.terraform.lock.hcl`;
    if (!tracked.has(lock)) out.push(`${dir}: ${lock} is not in git: commit it (it pins the exact provider builds and their checksums)`);
  }
  return out;
}
