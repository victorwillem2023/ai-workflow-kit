// The docs index (lib/docsindex.mjs): docs/README.md, one page that says where every doc is.
import { describe as group, it } from 'node:test';
import assert from 'node:assert/strict';
import { describe, renderDocsIndex } from '../../tools/workflow/lib/docsindex.mjs';

group('the docs index', () => {
  it('describes a doc by its title after the name, a title that says what it is, or its first sentence', () => {
    assert.equal(describe('# Coach: what it costs to run\n\nEvery cost.'), 'what it costs to run');
    assert.equal(describe('# How to work with the AI workflow\n\n**Not sure?**'), 'How to work with the AI workflow');
    assert.equal(describe('# Notes\n\nOne note per decision. More text.'), 'One note per decision');
  });
  it('groups the docs, lists a folder once, marks the kit\'s guides, and puts the unknown ones under Other', () => {
    const page = renderDocsIndex([
      { path: 'docs/PRODUCT.md', text: '# Coach: the product' },
      { path: 'docs/IAC.md', text: '# Infrastructure as code: test, plan, review, apply' },
      { path: 'docs/decisions/README.md', text: '# Decisions\n\nOne note per decision worth remembering.' },
      { path: 'docs/decisions/2026-11-01-launch.md', text: '# Launch' },
      { path: 'docs/HANDBOOK.md', text: '# Coach: the team handbook' },
    ], new Set(['docs/IAC.md']));
    assert.match(page, /## The product\n.*\n\n- \[PRODUCT\]\(PRODUCT\.md\): the product\n/);
    assert.match(page, /- \[IAC\]\(IAC\.md\): test, plan, review, apply \*\(the kit's\)\*/);
    assert.match(page, /- \[decisions\/\]\(decisions\/\): One note per decision worth remembering\n/);
    assert.match(page, /## Other\n\n- \[HANDBOOK\]\(HANDBOOK\.md\): the team handbook/);
    assert.equal((page.match(/decisions\//g) ?? []).length, 2, 'the folder is one line, not one per note');
  });
});
