// Kit 3.4.3: CLAUDE.md's Commands block said "npm test ... Run before every commit" and "npm run gate:all ... run before
// --finish", so an agent ran the whole suite before every commit whatever the phase (3.4.0: a prototype's /ship runs only the
// tests the change reaches). Those two lines sit outside the kit's marked sections, so the project may have reworded them: a line
// is matched by what it says (the command, and "before every commit" / "before --finish"), not by its exact text; every other
// line stays as the project wrote it. CLAUDE.md never grows by it (a project over its budget would fail the gate for the kit's
// words): the npm test line loses its last sentence, the gate:all line becomes a shorter gate:ship line (/check all still runs it).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TEST = /^(npm test\s+#.*?)[.;,]?\s*Run (?:it )?before every commit\.?[ \t]*$/m;
const ALL = /^npm run gate:all\s+#.*\bbefore --finish\b.*$/m;
const SHIP = 'npm run gate:ship    # what /ship runs before --finish: the phase says how much (workflow/levels.json)';

/** CLAUDE.md's text with the two lines brought up to date ({ text, changed }). */
export function commandsByPhase(text) {
  const was = String(text);
  let t = was.replace(TEST, '$1');
  if (!/^npm run gate:ship\b/m.test(t)) t = t.replace(ALL, SHIP);
  return { text: t, changed: t !== was };
}

export default {
  version: '3.4.3',
  what: 'CLAUDE.md\'s commands follow the phase',
  phase: 'claude',
  run({ target }) {
    const at = join(target, 'CLAUDE.md');
    if (!existsSync(at)) return { said: [] };
    const raw = readFileSync(at, 'utf8');
    const crlf = raw.includes('\r\n');
    const { text, changed } = commandsByPhase(raw.replace(/\r\n/g, '\n'));
    if (!changed) return { said: [] };
    writeFileSync(at, crlf ? text.replace(/\n/g, '\r\n') : text);
    return { said: ['CLAUDE.md, Commands: the whole suite is no longer run before every commit and every --finish; npm run gate:ship runs what the phase asks (workflow/levels.json)'] };
  },
};
