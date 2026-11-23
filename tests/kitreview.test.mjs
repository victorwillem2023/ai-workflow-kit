// The kit's own review step (scripts/kitreview.mjs): the change it hands a fresh reviewer, the brief, and the findings read back.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { brief, changeOf, findingLines, findingsOf, jsonAt } from '../scripts/kitreview.mjs';

describe('the review of a kit change', () => {
  it('reviews what is not committed, new files in full, and leaves out the owner\'s own outputs', () => {
    // package.json stands in for a new file: one that exists, so its text must be in the diff
    const run = (...a) => ({ 'diff --no-color HEAD': 'diff --git a/x b/x\n+changed\n', 'ls-files -z --others --exclude-standard': 'package.json\0Claude outputs/notes.md\0', 'diff --name-only -z HEAD': 'x\0' })[a.join(' ')] ?? '';
    const c = changeOf({ run });
    assert.deepEqual(c.files, ['x', 'package.json']);
    assert.match(c.diff, /\+changed/);
    assert.match(c.diff, /--- a new file: package\.json ---\n\{[\s\S]*"name": "ai-workflow-kit"/, 'the new file in full');
  });
  it('reviews everything since a tag when asked', () => {
    const seen = [];
    changeOf({ since: 'v4.14.1', run: (...a) => { seen.push(a.join(' ')); return ''; } });
    assert.ok(seen.includes('diff --no-color v4.14.1..HEAD'));
  });
  it('asks for bugs with a concrete failing case, never style, and says the reviewer had no part in it', () => {
    const b = brief({ label: 'what is not committed yet', diff: '+x', files: ['a.mjs'] });
    assert.match(b, /You had no part in it/);
    assert.match(b, /No style remarks/);
    assert.match(b, /"fails_when"/);
  });
  it('reads the findings out of the answer, and says when there are none or the answer has another shape', () => {
    const list = findingsOf('Here: {"findings":[{"file":"a.mjs","line":3,"bug":"x is undefined","fails_when":"an empty list","sure":"high"}]}');
    assert.equal(list?.length, 1);
    assert.match(findingLines(list ?? []), /^1\. a\.mjs:3 \(high\): x is undefined\n {3}fails when: an empty list/);
    assert.deepEqual(findingsOf('{"findings":[]}'), []);
    assert.equal(findingLines([]), 'review: no bugs found');
    assert.equal(findingsOf('I looked and it is fine.'), null);
    assert.equal(findingsOf('In `changeOf({ since })` I found: {"findings":[{"file":"b.mjs","bug":"a } in a string"}]} (see { above }).')?.[0].bug, 'a } in a string', 'braces in prose and in strings');
    assert.deepEqual(jsonAt('```json\n{"points":[{"id":"a","met":true}]}\n```', 'points'), { points: [{ id: 'a', met: true }] });
  });
});
