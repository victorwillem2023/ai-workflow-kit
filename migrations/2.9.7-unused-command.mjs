// Kit 2.9.7: the unused check runs knip through workflow/tools/unused.mjs (with a baseline) instead of knip itself. A project
// whose check still has the kit's old command gets the new one; a command the project changed is its own and stays.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OLD_COMMANDS, rewriteJson } from '../install-config.mjs';

export default {
  version: '2.9.7',
  what: 'the unused check with a baseline',
  phase: 'config',
  run({ target, kit, fill }) {
    const at = join(target, 'workflow/config.json');
    if (!existsSync(at)) return {};
    const was = readFileSync(at, 'utf8');
    const cfg = JSON.parse(was);
    const kits = JSON.parse(fill(readFileSync(join(kit, 'starter', 'workflow/config.json'), 'utf8'))).checks ?? [];
    const said = [];
    for (const c of cfg.checks ?? []) {
      const now = kits.find((k) => k.name === c.name)?.command;
      if (now && OLD_COMMANDS[c.name]?.includes(c.command) && c.command !== now) { c.command = now; said.push(`checks: ${c.name} now runs ${now}`); }
    }
    if (said.length) writeFileSync(at, rewriteJson(was.replace(/\r\n/g, '\n'), cfg));
    return { said };
  },
};
