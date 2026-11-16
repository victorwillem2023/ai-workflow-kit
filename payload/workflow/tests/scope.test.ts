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
