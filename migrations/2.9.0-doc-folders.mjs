// Kit 2.9.0: the docs moved into a folder per subject (workflow/guides/, run/, market/, company/; doc-layout.mjs), and 2.9.3 put
// PRODUCTION.md back at the top. An older project's docs move with git (their history follows), and the old paths in its own
// text are rewritten (not its history: specs, the changelog, decision records). The bytes the longer paths add to CLAUDE.md
// are returned, so its budget grows by exactly that (install-config.mjs, settleConfig).
import { moveOldDocs } from '../install-docs.mjs';

export default {
  version: '2.9.0',
  what: 'the docs into a folder per subject',
  phase: 'before',
  run({ target, written, stamp }) {
    const m = moveOldDocs({ target, written, stamp });
    const said = [];
    if (m.moved.length) said.push(`the docs moved into their folders (workflow/guides/, run/, market/, company/; docs/README.md lists them): ${m.moved.length} files, with git`);
    if (m.rewritten.length) said.push(`old doc paths rewritten (look at the diff before committing) in:\n${m.rewritten.map((f) => `    ${f}`).join('\n')}`);
    if (m.specsNaming.length) said.push(`waiting specs that name a doc at its old place, left as you approved them (the doc is at its new place now; change the spec if it lists it):\n${m.specsNaming.map((f) => `    ${f}`).join('\n')}`);
    return { said, claudeGrowth: m.claudeGrowth };
  },
};
