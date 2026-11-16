// Kit 2.9.8: where the notes left in the main folder go is the project's choice (commits.notes). The kit's old CLAUDE.md
// sentence "No docs-only, tests-only or ... commits" becomes the new one only for a project that chose "own"; one that never
// chose keeps its rule, and its config says so ("with-feature"). install-docs.mjs, RULES_THAT_CHANGED, holds the sentences.
import { rewriteChangedRules } from '../install-docs.mjs';

export default {
  version: '2.9.8',
  what: 'the notes rule as the project\'s choice',
  phase: 'claude',
  run({ target }) {
    return { said: rewriteChangedRules({ target }) };
  },
};
