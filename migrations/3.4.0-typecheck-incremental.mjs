// Kit 3.4.0: the typecheck keeps TypeScript's notes between runs (--incremental, in .tsbuildinfo, which git ignores), so a run
// after a small change checks what changed instead of everything (22 s to 8-15 s on a real project). Only a typecheck script
// still exactly as an older kit wrote it gets the flags; one the project changed is its own and stays.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rewriteJson } from '../install-config.mjs';

/** The typecheck scripts kits before 3.4 wrote, and what each becomes. */
export const OLD_TYPECHECK = {
  'tsc --noEmit': 'tsc --noEmit --incremental --tsBuildInfoFile .tsbuildinfo',
  'tsc --noEmit -p tsconfig.gate.json': 'tsc --noEmit --incremental --tsBuildInfoFile .tsbuildinfo -p tsconfig.gate.json',
};

export default {
  version: '3.4.0',
  what: 'the typecheck keeps its notes between runs',
  phase: 'config',
  run({ target }) {
    const at = join(target, 'package.json');
    if (!existsSync(at)) return { said: [] };
    const was = readFileSync(at, 'utf8');
    let pkg;
    try { pkg = JSON.parse(was); } catch { return { said: [] }; }
    const now = OLD_TYPECHECK[pkg.scripts?.typecheck];
    if (!now) return { said: [] };
    writeFileSync(at, rewriteJson(was.replace(/\r\n/g, '\n'), { ...pkg, scripts: { ...pkg.scripts, typecheck: now } }));
    return { said: ['package.json: the typecheck keeps its notes between runs (--incremental, .tsbuildinfo), so a small change checks faster'] };
  },
};
