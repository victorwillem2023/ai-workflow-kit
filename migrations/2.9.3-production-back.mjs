// Kit 2.9.3: PRODUCTION.md is a build-stage doc again (2.9.0 to 2.9.2 put it in docs/run/): it moves back to docs/, and the paths
// that name it follow (doc-layout.mjs, CORRECTIONS). The same move as 2.9.0's, so on a project from before 2.9 it finds nothing left.
import { moveOldDocs } from '../install-docs.mjs';

export default {
  version: '2.9.3',
  what: 'PRODUCTION.md back at the top of docs/',
  phase: 'before',
  run({ target, written, stamp }) {
    const m = moveOldDocs({ target, written, stamp });
    const said = [];
    if (m.moved.length) said.push(`moved back to the top of docs/: ${m.moved.join(', ')}`);
    if (m.rewritten.length) said.push(`its old path rewritten in:\n${m.rewritten.map((f) => `    ${f}`).join('\n')}`);
    return { said, claudeGrowth: m.claudeGrowth };
  },
};
