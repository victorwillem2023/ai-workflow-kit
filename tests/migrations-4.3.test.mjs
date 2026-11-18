// Kit 4.3.0's update steps: CLAUDE.md's big docs become measured (migrations/4.3.0-measured-docs.mjs), and the project's own
// rules that still keep the guide and app map up in every card are named, never changed (migrations/4.3.0-upkeep-conflicts.mjs).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { measuredDocs } from '../migrations/4.3.0-measured-docs.mjs';
import { upkeepConflicts } from '../migrations/4.3.0-upkeep-conflicts.mjs';
import { raisedBudget } from '../migrations/4.3.0-root-budget.mjs';
import { hookProblem } from '../payload/workflow/tools/lib/hookcheck.mjs';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('kit 4.3.0: the root budget and the hook check', () => {
  it('raises a root budget still at the kit\'s old default, keeps the layout, and leaves one the project chose', () => {
    const was = '{\n  "budget": {\n    "CLAUDE.md": 14500,\n    "src/**/CLAUDE.md": 4500\n  },\n  "x": 1\n}\n';
    assert.equal(raisedBudget(was), '{\n  "budget": {\n    "CLAUDE.md": 20000,\n    "src/**/CLAUDE.md": 4500\n  },\n  "x": 1\n}\n');
    assert.equal(raisedBudget('{ "budget": { "CLAUDE.md": 16000 } }'), null);
    assert.equal(raisedBudget('{}'), null);
  });
  it('says loudly when the stop points do not start, and nothing when they do or are not installed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hookcheck-'));
    try {
      assert.equal(hookProblem(dir), null, 'no stop points installed');
      mkdirSync(join(dir, 'workflow', 'scripts'), { recursive: true });
      writeFileSync(join(dir, 'workflow', 'scripts', 'stop-points.mjs'), "import './notes.mjs';\n");
      assert.match(hookProblem(dir) ?? '', /^!!! THE STOP POINTS DO NOT START: .*notes\.mjs.*NOT held/);
      writeFileSync(join(dir, 'workflow', 'scripts', 'notes.mjs'), '');
      assert.equal(hookProblem(dir), null);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('kit 4.3.0 update steps', () => {
  it('turns the hand-written big docs bullet into the measured block, keeps line endings, and does it once', () => {
    const was = '## Reading\r\n- Read big docs by the section (`grep -n`): `docs/ARCHITECTURE.md` (16 KB),\r\n  `workflow/tools/README.md` (16 KB).\r\n- head -5\r\n';
    const now = measuredDocs(was);
    assert.equal(now, "## Reading\r\n- Read big docs by the section (`grep -n '^## '`):\r\n<!-- generated: bigdocs -->\r\n<!-- /generated -->\r\n- head -5\r\n");
    assert.equal(measuredDocs(now), null);
    assert.equal(measuredDocs('# no such bullet\n'), null);
  });
  it('names the project\'s own lines that keep the guide or the app map up in every card, outside the kit\'s blocks', () => {
    const claude = '<!-- kit:how-we-work -->\n- **Docs in the same commit**: the kit\'s\n<!-- /kit:how-we-work -->\n- Docs in the same commit, always.\n- Use short names.\n';
    const project = { 'ship.md': '- In step 9, always: the request row and the app map nodes that changed.\n- run the corpus\n' };
    const found = upkeepConflicts({ claude, project, levelsText: '{ "phase": "prototype" }' });
    assert.deepEqual(found, ['CLAUDE.md: "- Docs in the same commit, always."', '.claude/project/ship.md: "- In step 9, always: the request row and the app map nodes that changed."']);
    assert.deepEqual(upkeepConflicts({ claude, project, levelsText: null }), [], 'production keeps them up in every card: no conflict');
  });
});
