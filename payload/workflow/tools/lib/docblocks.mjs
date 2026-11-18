// Parts of the hand-written docs that are made from the config, so they cannot disagree with it (no I/O here). A doc marks
// the part:
//   <!-- generated: layers -->
//   (filled by npm run map; the gate fails when it is out of date)
//   <!-- /generated -->
// Blocks: layers (the import rules, from `boundaries`), versions (`.tool-versions`), settings (`.env.example`, each name with
// its comment), sensitive (`sensitive.paths`), naming (the file-name rules and the infrastructure name pattern), egress
// (`security.egress`, the hosts the app may call), iprules (`security.ipRules`) and phase (what the phase in workflow/levels.json
// loosens, written into CLAUDE.md's code rules: agents follow the words they read, so the words follow the phase).
import { fromWords, levelOf, readLevels } from './levels.mjs';

const list = (xs) => xs.map((x) => `\`${x}\``).join(', ');

/** What the phase makes of the code rules: one short paragraph, from workflow/levels.json (`levelsText`, null: production). */
export function phaseBlock(levelsText, config = {}) {
  const lv = readLevels(levelsText ?? null, (config.checks ?? []).map((c) => c.name));
  const soft = ['size', 'functions', 'nesting', 'ratchets'].filter((n) => levelOf(lv, n) !== 'fail');
  const p = lv.process;
  // in full words: it is the one line that tells an agent what is loosened right now (it does not count toward the budget)
  const rules = soft.length
    ? `The size rules below (1, 2, 3 and 5) are advice in this phase, not a stop: a file in the baseline may grow when that is the simpler change, and the gate says so (${soft.join(', ')} advise).`
    : 'Every rule below holds: the gate fails on each.';
  const ceremony = p.spec === p.review ? `A spec and a fresh review for ${fromWords(p.spec)}.` : `A spec for ${fromWords(p.spec)}, a fresh review for ${fromWords(p.review)}.`;
  const docs = p.upkeep === 'never' ? 'The user guide and the app map wait for one `/docs catch-up` pass instead of being kept up in each card.'
    : p.upkeep === 'always' ? 'Every card keeps the user guide and the app map up.'
      : `The user guide and the app map are kept up in ${fromWords(p.upkeep)}; the rest wait for one \`/docs catch-up\` pass.`;
  const step = lv.phase === 'prototype' ? ' A step toward the end state is fine (rule 6): the spec names the end state and its card.' : '';
  return `**Phase: ${lv.phase}** (\`workflow/levels.json\`, \`npm run levels\`). ${rules} ${ceremony} ${docs}${step}`;
}

/**
 * The docs too big to read whole, biggest first, with their size: measured, so CLAUDE.md never names a stale size. `docSizes`
 * = [[path, bytes]], measured with the generated blocks left empty (so filling this one cannot change what it says).
 */
export function bigDocs(docSizes, over) {
  const big = docSizes.filter(([f, n]) => n > over && !/(^|\/)CLAUDE\.md$/.test(f)).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 6);
  return `  ${big.length ? big.map(([f, n]) => `\`${f}\` ${Math.round(n / 1024)} KB`).join(', ') : 'none yet'}.`;
}

/** A doc's text with its generated blocks left empty: what its size is measured on. */
export const bare = (text) => String(text).replace(/(<!--\s*generated:\s*[a-z-]+\s*-->)[\s\S]*?(<!--\s*\/generated\s*-->)/g, '$1$2');

/** The text of each block from what the project has: { config, toolVersions, envExample, levelsText } (missing parts are fine). */
export function blockMakers({ config = {}, toolVersions = '', envExample = '', levelsText = null, docSizes = [] }) {
  return {
    phase: () => phaseBlock(levelsText, config),
    bigdocs: () => bigDocs(docSizes, config.map?.bigDoc ?? 12000),
    layers: () => {
      const rules = config.boundaries ?? [];
      if (!rules.length) return '_No import rules yet (`boundaries` in workflow/config.json)._';
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
      return p.length ? p.map((x) => `- \`${x}\``).join('\n') : '_None yet: no file needs a sign-off (`sensitive.paths` in workflow/config.json)._';
    },
    egress: () => {
      const e = config.security?.egress;
      if (!Array.isArray(e)) return '_No outbound allowlist yet (`security.egress` in workflow/config.json)._';
      return e.length ? e.map((h) => `- \`${h}\``).join('\n') : '_None: the app calls no outside host._';
    },
    iprules: () => {
      const r = config.security?.ipRules ?? [];
      if (!r.length) return '_No IP rules yet (`security.ipRules` in workflow/config.json)._';
      return ['| Range | Rule | For | Why | Until |', '|---|---|---|---|---|', ...r.map((x) => `| \`${x.cidr}\` | ${x.action ?? ''} | ${x.for ?? 'everything'} | ${String(x.why ?? '').replace(/\|/g, '\\|')} | ${x.until ?? ''} |`)].join('\n');
    },
    naming: () => {
      const n = config.naming ?? {};
      const rows = (n.files ?? []).map((r) => `| \`${r.glob}\` | ${r.style}${r.except?.length ? ` (except ${list(r.except)})` : ''} |`);
      const res = (n.resources ?? []).map((r) => `| names in \`${r.glob}\` | ${r.say ?? `\`${r.pattern}\``} |`);
      const all = [...rows, ...res];
      return all.length ? ['| Files | Rule |', '|---|---|', ...all].join('\n') : '_No naming rules yet (`naming` in workflow/config.json)._';
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
