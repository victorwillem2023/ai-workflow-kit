// scripts/text-sizes.mjs: what agents read (the skills, the starting rules, the tools README, the guides) grows only with a
// reason on record. npm run test:quick
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compare, measure, readRecord, report, slack, textsOf } from '../scripts/text-sizes.mjs';

describe('the size of what agents read', () => {
  it('finds the texts: every skill, the starting rules, the tools README, the guides', () => {
    const t = textsOf();
    for (const f of ['payload/.claude/skills/next/SKILL.md', 'starter/CLAUDE.md', 'payload/workflow/tools/README.md', 'payload/workflow/guides/WORKFLOW.md', 'modules/ui/payload/.claude/skills/ui/SKILL.md']) assert.ok(t.includes(f), f);
    assert.ok(!t.some((f) => f.endsWith('.mjs') || f.includes('/tests/')));
  });
  it('a few words more pass; a paragraph more, or a new text, needs a reason; a smaller text is free', () => {
    const c = compare({ 'a.md': 10000, 'b.md': 10000, 'c.md': 10000, 'gone.md': 5 }, { 'a.md': 10000 + slack(10000), 'b.md': 10000 + slack(10000) + 1, 'c.md': 9000, 'new.md': 300 });
    assert.deepEqual(c.grown.map((g) => g.file), ['b.md']);
    assert.deepEqual(c.fresh.map((f) => f.file), ['new.md']);
    assert.deepEqual(c.shrunk.map((s) => s.file), ['c.md']);
    assert.deepEqual(c.gone, ['gone.md']);
    assert.match(report(c).join('\n'), /grew: b\.md 10000 -> 10201 bytes[\s\S]*--accept b\.md/);
  });
  it('no text of the kit grew past its recorded size without a reason (node scripts/text-sizes.mjs says which, and how to record one)', () => {
    const c = compare(readRecord().sizes, measure());
    assert.deepEqual([...c.grown.map((g) => `${g.file} +${g.now - g.was} bytes`), ...c.fresh.map((f) => `${f.file} is new`)], []);
  });
});
