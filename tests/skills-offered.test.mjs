// Every command of the kit is offered at a moment, not only listed: some other skill, a tool's own output or the project's rules
// (CLAUDE.md) names it where the owner would need it. A command that only the tables in workflow/guides name is one nobody is
// ever steered to. npm run test:quick
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const kit = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; }) : []);
const roots = [join(kit, 'payload'), join(kit, 'starter'), ...readdirSync(join(kit, 'modules')).map((m) => join(kit, 'modules', m))];
const files = roots.flatMap(walk).map((f) => f.replace(/\\/g, '/'));
const skills = [...new Set(files.map((f) => /\.claude\/skills\/([^/]+)\/SKILL\.md$/.exec(f)?.[1]).filter(Boolean))].sort();
// where a command is offered at a moment: another skill's text, a tool or script (what it prints), CLAUDE.md and its sections
// (a tool's comments are not an offer: only what it can print counts)
const textOf = (f) => (f.endsWith('.mjs') ? readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n') : readFileSync(f, 'utf8'));
const offers = files.filter((f) => !/\/tests\//.test(f) && (/\.claude\/skills\//.test(f) || /\/workflow\/(tools|scripts)\/.*\.mjs$/.test(f) || /(CLAUDE|claude-section[^/]*)\.md$/.test(f)));

describe('every command is offered somewhere', () => {
  it('finds the skills', () => assert.ok(skills.length > 20, skills.join(', ')));
  for (const s of skills) {
    it(`/${s} is named by another skill, a tool or the project's rules`, () => {
      const named = new RegExp(`(^|[^a-zA-Z/.-])/${s}\\b`, 'm');
      const where = offers.filter((f) => !f.includes(`/skills/${s}/`) && named.test(textOf(f)));
      assert.ok(where.length > 0, `/${s} is only in the guides' tables: offer it where the owner would need it (another skill's next step, a tool's own line)`);
    });
  }
});
