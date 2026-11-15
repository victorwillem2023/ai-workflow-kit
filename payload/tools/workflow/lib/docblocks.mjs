// Parts of the hand-written docs that are made from the config, so they cannot disagree with it (no I/O here). A doc marks
// the part:
//   <!-- generated: layers -->
//   (filled by npm run map; the gate fails when it is out of date)
//   <!-- /generated -->
// Blocks: layers (the import rules, from `boundaries`), versions (`.tool-versions`), settings (`.env.example`, each name with
// its comment), sensitive (`sensitive.paths`), naming (the file-name rules and the infrastructure name pattern).

const list = (xs) => xs.map((x) => `\`${x}\``).join(', ');

/** The text of each block from what the project has: { config, toolVersions, envExample } (missing parts are fine). */
export function blockMakers({ config = {}, toolVersions = '', envExample = '' }) {
  return {
    layers: () => {
      const rules = config.boundaries ?? [];
      if (!rules.length) return '_No import rules yet (`boundaries` in workflow.config.json)._';
      return rules.map((r) => `- **${r.name}**: ${list([].concat(r.from))} may not import ${[r.forbid?.length ? list(r.forbid) : '', r.forbidNode ? "Node's own modules (no files, network or processes)" : ''].filter(Boolean).join(' or ')}${r.except?.length ? ` (except ${list(r.except)})` : ''}.`).join('\n');
    },
    versions: () => {
      const rows = String(toolVersions).split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean).map((l) => l.split(/\s+/));
      if (!rows.length) return '_No `.tool-versions` yet._';
      return ['| Tool | Version |', '|---|---|', ...rows.map(([t, v]) => `| ${t} | ${v ?? ''} |`)].join('\n');
    },
    settings: () => {
      const out = [];
      let note = [];
      let first = true; // the file's opening comment is about the file, not about the first setting
      for (const raw of String(envExample).split('\n')) {
        const line = raw.trim();
        // a setting left out by default is written as a comment: `# APP_VERSION=...`
        const m = /^(#\s*)?(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(line);
        if (!m && line.startsWith('#')) { note.push(line.replace(/^#+\s*/, '')); continue; }
        if (m) {
          const say = first && /\.env\b/.test(note.join(' ')) ? [] : note;
          out.push(`| \`${m[2]}\` | ${[m[1] ? '(optional)' : '', ...say].filter(Boolean).join(' ').replace(/\|/g, '\\|')} |`);
          first = false;
        }
        note = [];
      }
      return out.length ? ['| Setting | What it is |', '|---|---|', ...out].join('\n') : '_No settings yet (`.env.example`)._';
    },
    sensitive: () => {
      const p = config.sensitive?.paths ?? [];
      return p.length ? p.map((x) => `- \`${x}\``).join('\n') : '_None yet: no file needs a sign-off (`sensitive.paths` in workflow.config.json)._';
    },
    naming: () => {
      const n = config.naming ?? {};
      const rows = (n.files ?? []).map((r) => `| \`${r.glob}\` | ${r.style}${r.except?.length ? ` (except ${list(r.except)})` : ''} |`);
      const res = (n.resources ?? []).map((r) => `| names in \`${r.glob}\` | ${r.say ?? `\`${r.pattern}\``} |`);
      const all = [...rows, ...res];
      return all.length ? ['| Files | Rule |', '|---|---|', ...all].join('\n') : '_No naming rules yet (`naming` in workflow.config.json)._';
    },
  };
}

const BLOCK = /(<!--\s*generated:\s*([a-z-]+)\s*-->)[\s\S]*?(<!--\s*\/generated\s*-->)/g;

/** The doc with every known block refilled (an unknown block name is left as it is). */
export function fillBlocks(text, makers) {
  return String(text).replace(BLOCK, (all, open, name, close) => (makers[name] ? `${open}\n${makers[name]()}\n${close}` : all));
}

/** Whether a doc has any generated block. */
export const hasBlocks = (text) => /<!--\s*generated:\s*[a-z-]+\s*-->/.test(String(text ?? ''));
