// Kit 3.4.3: workflow/levels.json (how strict the gate is) and the gate's baseline are the owner's settings, not code: the gate
// found no test that names them and ran the whole suite whenever one changed. Both go on the config's ignoreChanged, when the
// project has that list and lacks them; the rest of the list stays as it is.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rewriteJson } from '../install-config.mjs';

export default {
  version: '3.4.3',
  what: 'the gate\'s settings are not code',
  phase: 'config',
  run({ target }) {
    const at = join(target, 'workflow', 'config.json');
    if (!existsSync(at)) return { said: [] };
    const was = readFileSync(at, 'utf8');
    let cfg;
    try { cfg = JSON.parse(was); } catch { return { said: [] }; }
    if (!Array.isArray(cfg.ignoreChanged)) return { said: [] };
    const want = ['workflow/levels.json', cfg.baseline ?? 'workflow/tools/baseline.json'].filter((f) => !cfg.ignoreChanged.includes(f));
    if (!want.length) return { said: [] };
    writeFileSync(at, rewriteJson(was.replace(/\r\n/g, '\n'), { ...cfg, ignoreChanged: [...cfg.ignoreChanged, ...want] }));
    return { said: [`workflow/config.json: ${want.join(' and ')} on ignoreChanged (a change there no longer runs the whole suite)`] };
  },
};
