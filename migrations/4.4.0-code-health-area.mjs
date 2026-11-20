// Kit 4.4.0: the focus block (workflow/tools/lib/focus.mjs) offers the cards of one theme at a time, a theme being an area label,
// and says when a block of performance, refactoring and test work is due: the cards under "area: Code health". A board whose
// areas lack that label gets it in the config (the project's own areas stay as they are); `npm run board -- --init` then makes
// the label on GitHub. A config without area labels is left alone.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rewriteJson } from '../install-config.mjs';

export const AREA = 'area: Code health';

/** The config's text with the code health area added to the board's areas, or null when there is nothing to add. */
export function withHealthArea(text) {
  let cfg;
  try { cfg = JSON.parse(text); } catch { return null; }
  const areas = cfg?.board?.labels?.areas;
  if (!Array.isArray(areas) || !areas.length || cfg.board.health || areas.some((a) => /code health/i.test(a))) return null;
  return rewriteJson(String(text).replace(/\r\n/g, '\n'), { ...cfg, board: { ...cfg.board, labels: { ...cfg.board.labels, areas: [...areas, AREA] } } });
}

export default {
  version: '4.4.0',
  what: 'an area for performance, refactoring and test work',
  phase: 'config',
  run({ target }) {
    const at = join(target, 'workflow', 'config.json');
    if (!existsSync(at)) return {};
    const now = withHealthArea(readFileSync(at, 'utf8'));
    if (now == null) return {};
    writeFileSync(at, now);
    return { said: [`workflow/config.json: the board has the area "${AREA}" now (performance, refactoring, tests), so the kit can say when such a block is due; make the label on GitHub with npm run board -- --init`] };
  },
};
