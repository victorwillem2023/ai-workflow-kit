// Kit 3.3.0: two starter files an older kit left as they were never meant to stay.
//   knip.json: the kit's said `tools/**` and `scripts/**` (the kit's places before 3.0, so a project's own scripts/ was never
//   checked) and had no start files (it was written before the kit read them from the build, so knip called the app unused). A
//   knip.json still exactly as the kit wrote it gets the kit's new ignore list and the build's start files; a changed one is the
//   project's and stays.
//   docs/design/notes/README.md: a placeholder among the board notes ("One notes file per board"), which a project's test that
//   counts the notes files counted too; docs/design/README.md says what the folder is. Taken out when it is still the kit's line.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { knipEntries } from '../install-config.mjs';

/** The knip.json kit 3.0 to 3.2 wrote. */
export const OLD_KNIP = { ignore: ['tools/**', 'scripts/**', 'workflow/tests/**', 'tests/*.example.ts', 'docs/**', 'cases/**'], ignoreDependencies: ['@biomejs/biome'] };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default {
  version: '3.3.0',
  what: 'knip.json and the board notes placeholder',
  phase: 'config',
  run({ target, kit }) {
    const said = [];
    const knip = join(target, 'knip.json');
    let cfg = null;
    try { cfg = existsSync(knip) ? JSON.parse(readFileSync(knip, 'utf8')) : null; } catch { cfg = null; }
    if (cfg && same(cfg, OLD_KNIP)) {
      const now = JSON.parse(readFileSync(join(kit, 'starter-ts', 'knip.json'), 'utf8'));
      writeFileSync(knip, `${JSON.stringify(now, null, 2)}\n`);
      // and the build's start files, now that it is the kit's again
      const entries = knipEntries(target, readFileSync(knip, 'utf8'));
      const usual = ['{index,cli,main}.{js,mjs,cjs,jsx,ts,tsx,mts,cts}', 'src/{index,cli,main}.{js,mjs,cjs,jsx,ts,tsx,mts,cts}'];
      if (entries) writeFileSync(knip, `${JSON.stringify({ entry: [...entries, ...usual], ...now }, null, 2)}\n`);
      said.push(`knip.json: the kit's ignore list is workflow/** now (tools/** and scripts/** were the kit's places before 3.0)${entries ? `, and it starts from ${entries.join(', ')}` : ''}`);
    }
    const notes = join(target, 'docs', 'design', 'notes', 'README.md');
    if (existsSync(notes) && readFileSync(notes, 'utf8').trim() === 'One notes file per board (/ui writes it).') {
      rmSync(notes);
      // the folder stays (the docs name it), held by a .gitkeep, which no count of the notes takes for one
      if (!readdirSync(join(target, 'docs', 'design', 'notes')).length) writeFileSync(join(target, 'docs', 'design', 'notes', '.gitkeep'), '');
      said.push('docs/design/notes/README.md taken out: the folder holds only the board notes (docs/design/README.md says what it is)');
    }
    return { said };
  },
};
