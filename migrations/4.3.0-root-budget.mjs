// Kit 4.3.0: the root CLAUDE.md's budget goes from 14,500 to 20,000 bytes, and the generated lines no longer count. Squeezing a
// rules file under 14.5 KB had begun to cost more than it saved: rules shortened until an agent had to cross-reference them,
// and one misread rule costs a whole feedback round. The real limit is attention, so the root file holds only what every chat
// needs (a rule for some work goes in a skill or a folder file). Only a budget still at the kit's old default changes; one the
// project set itself is its own. The folder files stay at 4,500.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rewriteJson } from '../install-config.mjs';

export const OLD = 14500;
export const NOW = 20000;

/** The config's text with the root budget raised, or null when it is not the old default. */
export function raisedBudget(text) {
  let cfg;
  try { cfg = JSON.parse(text); } catch { return null; }
  if (cfg?.budget?.['CLAUDE.md'] !== OLD) return null;
  return rewriteJson(String(text).replace(/\r\n/g, '\n'), { ...cfg, budget: { ...cfg.budget, 'CLAUDE.md': NOW } });
}

export default {
  version: '4.3.0',
  what: 'the root CLAUDE.md budget at 20 KB, generated lines not counted',
  phase: 'config',
  run({ target }) {
    const at = join(target, 'workflow', 'config.json');
    if (!existsSync(at)) return {};
    const now = raisedBudget(readFileSync(at, 'utf8'));
    if (now == null) return {};
    writeFileSync(at, now);
    return { said: [`workflow/config.json: the root CLAUDE.md budget is ${NOW} bytes now (was ${OLD}), and the lines the kit generates no longer count; keep it to what every chat needs`] };
  },
};
