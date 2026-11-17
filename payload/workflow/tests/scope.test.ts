// The scope guard (workflow/tools/lib/scope.mjs): changed files a spec does not name.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { specPaths, outsideSpec } from '../../workflow/tools/lib/scope.mjs';

const spec = '## Files that change\n- `src/core/total.ts`: the rule\n- `docs/guide/` the part\n## Tests\n`adds up` in `tests/total.test.ts:12`\nRun `npm run gate`, see `workflow/specs/<topic>.md` and `src/web/*.ts`.';

describe('scope guard', () => {
  it('reads the files and folders a spec names, without placeholders, globs or commands', () => {
    assert.deepEqual(specPaths(spec), ['src/core/total.ts', 'docs/guide/', 'tests/total.test.ts']);
  });
  it('names a changed file the spec never mentions, and not one in a folder it names', () => {
    const changed = ['src/core/total.ts', 'docs/guide/start.md', 'src/web/menu.ts', 'docs/MAP.md'];
    assert.deepEqual(outsideSpec(changed, specPaths(spec), ['docs/MAP.md']), ['src/web/menu.ts']);
  });
});

describe("a kit update's spec", async () => {
  const { kitFilesIn, namesKitFiles } = await import('../../workflow/tools/lib/scope.mjs');
  it('says "the kit\'s files" once, and every file the record lists counts as named', () => {
    assert.equal(namesKitFiles('## Files that change\n- the kit\'s files (an update to 3.3)\n'), true);
    assert.equal(namesKitFiles('## Files that change\n- `src/a.ts`\n'), false);
    assert.deepEqual(kitFilesIn('version=3.3.0\nsha 0123 workflow/tools/gate.mjs\nsha 4567 .claude/skills/ship/SKILL.md\n'), ['workflow/tools/gate.mjs', '.claude/skills/ship/SKILL.md']);
  });
});
