// Kit 4.3.0: in a prototype the user guide and the app map wait for one /docs catch-up pass instead of being kept up in every
// card (`process.upkeep` in workflow/levels.json). A project's own rules win over the kit's (.claude/project/<command>.md, its own
// lines in CLAUDE.md), so a rule that still asks for them in every card cancels the change without a word. This step changes
// nothing: it names each such line in the update's report, so the owner decides which one stands.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readLevels } from '../payload/workflow/tools/lib/levels.mjs';

// a line about the guide, the app map or the request pages, that asks for them every time
const ABOUT = /\b(?:app map|map\.js|docs\/flow|docs\/guide|the guide|user guide|requests?\.js|request (?:row|page)s?)\b/i;
const EVERY = /\b(?:every|each|always|must|in the same commit|keep(?:s)? (?:it |them )?up)\b/i;
// CLAUDE.md's own rules that make every doc go with its feature
const SAME_COMMIT = /\b(?:docs in the same commit|no docs-only commits?)\b/i;
const KIT_BLOCK = /<!-- kit:([\w-]+) -->[\s\S]*?<!-- \/kit:\1 -->/g;

/**
 * The project's lines that keep the guide or the app map up in every card although its phase lets them wait: [line to report].
 * `claude` the root CLAUDE.md (the kit's own blocks are left out), `project` { 'ship.md': text, ... }, `levelsText` its levels.
 */
export function upkeepConflicts({ claude = '', project = {}, levelsText = null }) {
  const upkeep = readLevels(levelsText).process.upkeep;
  if (upkeep === 'always') return [];
  const out = [];
  const own = String(claude).replace(/\r\n/g, '\n').replace(KIT_BLOCK, '');
  for (const line of own.split('\n')) if (SAME_COMMIT.test(line) || (ABOUT.test(line) && EVERY.test(line))) out.push(`CLAUDE.md: "${line.trim().slice(0, 140)}"`);
  for (const [name, text] of Object.entries(project)) {
    for (const line of String(text).replace(/\r\n/g, '\n').split('\n')) if (ABOUT.test(line) && EVERY.test(line)) out.push(`.claude/project/${name}: "${line.trim().slice(0, 140)}"`);
  }
  return out;
}

export default {
  version: '4.3.0',
  what: 'the project\'s own rules that keep the guide and app map up in every card',
  phase: 'config',
  run({ target }) {
    const read = (f) => (existsSync(join(target, f)) ? readFileSync(join(target, f), 'utf8') : '');
    const dir = join(target, '.claude', 'project');
    const project = existsSync(dir) ? Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => [f, readFileSync(join(dir, f), 'utf8')])) : {};
    const found = upkeepConflicts({ claude: read('CLAUDE.md'), project, levelsText: existsSync(join(target, 'workflow/levels.json')) ? read('workflow/levels.json') : null });
    if (!found.length) return {};
    return { said: [
      `your phase lets the user guide and the app map wait for one /docs catch-up pass, but ${found.length === 1 ? 'this rule of your own still asks' : 'these rules of your own still ask'} for them in every card, and yours win (nothing was changed):`,
      ...found.map((l) => `  ${l}`),
      '  keep them (then nothing changes), or drop or soften them to let the guide and the app map wait (process.upkeep in workflow/levels.json says from which card size they are kept up)',
    ] };
  },
};
