// The rule rows of docs/ARCHITECTURE.md stay short (workflow/tools/lib/rulerows.mjs): a list of files in a cell gets advice.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { longRuleCells } from '../../workflow/tools/lib/rulerows.mjs';

const many = Array.from({ length: 14 }, (_, i) => `\`src/web/ui/Screen${i}.tsx\``).join(', ');
const doc = `# Architecture

## Rules and where each lives
| Rule | Its home | Its check | Who keeps to it | Copies today |
|---|---|---|---|---|
| A screen reads a store only through \`useStore\` | \`src/web/react/use-store.ts\` | \`tests/store.test.ts\` | ${many} | none |
| A date is stored as a day | \`src/core/day.ts\` | the gate's \`dates\` check | \`src/**\` | none |

## Where state lives
| Thing | Where | Who writes |
|---|---|---|
| plans | ${many} | the server |
`;

describe('the rule rows stay short', () => {
  it('advises on a cell that lists files, with its line and how many', () => {
    const out = longRuleCells('docs/ARCHITECTURE.md', doc);
    assert.equal(out.length, 1);
    assert.match(out[0], /^advice: docs\/ARCHITECTURE\.md:6: the rule "A screen reads a store only through useStore" has a cell of \d+ characters naming 14 files: name the folder or a pattern/);
  });
  it('leaves short rows, other sections and a doc without the section alone', () => {
    assert.deepEqual(longRuleCells('docs/ARCHITECTURE.md', doc.replace(many, '`src/web/**/*.tsx`')), []);
    assert.deepEqual(longRuleCells('docs/ARCHITECTURE.md', '# Architecture\n\nNo table.\n'), []);
  });
});
