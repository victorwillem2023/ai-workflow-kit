// The docs index (lib/docsindex.mjs): docs/README.md, one page that says where every doc is.
import { describe as group, it } from 'node:test';
import assert from 'node:assert/strict';
import { describe, renderDocsIndex } from '../../workflow/tools/lib/docsindex.mjs';

group('the docs index', () => {
  it('describes a doc by its title after the name, a title that says what it is, or its first sentence', () => {
    assert.equal(describe('# Coach: what it costs to run\n\nEvery cost.'), 'what it costs to run');
    assert.equal(describe('# How to work with the AI workflow\n\n**Not sure?**'), 'How to work with the AI workflow');
    assert.equal(describe('# Notes\n\nOne note per decision. More text.'), 'One note per decision');
  });
  it('makes the folders the sections: the top of docs/, then each subject folder doc by doc, then the other folders once', () => {
    const page = renderDocsIndex([
      { path: 'docs/PRODUCT.md', text: '# Coach: the product' },
      { path: 'docs/run/IAC.md', text: '# Infrastructure as code: test, plan, review, apply' },
      { path: 'docs/company/COSTS.md', text: '# Coach: what it costs to run' },
      { path: 'docs/decisions/README.md', text: '# Decisions\n\nOne note per decision worth remembering.' },
      { path: 'docs/decisions/2026-11-01-launch.md', text: '# Launch' },
    ], new Set(['docs/run/IAC.md']));
    assert.match(page, /## The product and how it is built\n\n- \[PRODUCT\]\(PRODUCT\.md\): the product\n/);
    assert.match(page, /## Running it \(`run\/`\)\n.*\n\n- \[run\/IAC\]\(run\/IAC\.md\): test, plan, review, apply \*\(the kit's\)\*/);
    assert.match(page, /## The company \(`company\/`\)[\s\S]*- \[company\/COSTS\]\(company\/COSTS\.md\): what it costs to run/);
    assert.doesNotMatch(page, /market\//, 'a folder the project does not have is not listed');
    assert.match(page, /## The other folders\n\n- \[decisions\/\]\(decisions\/\): One note per decision worth remembering\n/);
    assert.equal((page.match(/decisions\//g) ?? []).length, 2, 'the folder is one line, not one per note');
    assert.ok(page.indexOf('run/') < page.indexOf('company/'), 'the subjects in the order a project meets them');
  });
});
