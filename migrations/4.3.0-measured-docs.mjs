// Kit 4.3.0: CLAUDE.md's list of the docs too big to read whole is measured (`npm run map` fills a generated block), so it
// can no longer say 16 KB for a doc that grew to 54. A project's own "Read big docs by the section" bullet, written by /setup
// with sizes by hand, becomes the bullet with the block; anything else in that section stays as the project wrote it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BLOCK = '<!-- generated: bigdocs -->\n<!-- /generated -->';
const NEW = "- Read big docs by the section (`grep -n '^## '`):\n" + BLOCK;

/** CLAUDE.md with its big-docs bullet (and the lines that continue it) made the generated one; null when there is nothing to do. */
export function measuredDocs(text) {
  const crlf = text.includes('\r\n');
  const t = text.replace(/\r\n/g, '\n');
  if (t.includes('generated: bigdocs')) return null;
  const m = /^- Read big docs by the section[^\n]*(\n {2}[^\n]*)*/m.exec(t);
  if (!m) return null;
  const out = t.replace(m[0], NEW);
  return crlf ? out.replace(/\n/g, '\r\n') : out;
}

export default {
  version: '4.3.0',
  what: 'the big docs in CLAUDE.md measured, not written by hand',
  phase: 'claude',
  run({ target }) {
    const at = join(target, 'CLAUDE.md');
    if (!existsSync(at)) return {};
    const was = readFileSync(at, 'utf8');
    const now = measuredDocs(was);
    if (now == null) return {};
    writeFileSync(at, now);
    return {
      said: ['CLAUDE.md: the docs too big to read whole are now measured (npm run map fills the list); sizes written by hand elsewhere in it are yours to drop'],
      claudeGrowth: Math.max(0, Buffer.byteLength(now) - Buffer.byteLength(was)),
    };
  },
};
