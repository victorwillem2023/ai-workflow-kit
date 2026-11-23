// The screen walk (workflow/scripts/walk.mjs): what a walk file may say, how a failed step is put in the owner's words, and that
// walks are off in a prototype. The browser itself is not started here.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readWalk, sayStep, walksOn } from '../../workflow/scripts/walk.mjs';

describe('walking a screen before it is handed over', () => {
  it('reads the steps, with the start page and width a walk leaves out', () => {
    const w = readWalk('{ "steps": [ { "type": "Goal distance", "text": "10" }, { "click": "Make plan" }, { "see": "14 weeks" } ] }', 'plan');
    assert.deepEqual([w.path, w.width, w.steps.length], ['/', 1280, 3]);
    assert.equal(readWalk('{ "path": "/plans", "width": 400, "steps": [ { "see": "Plans" } ] }').width, 400);
  });
  it('says in one sentence what is wrong with a walk file', () => {
    assert.throws(() => readWalk('{', 'plan'), /tests\/smoke\/plan\.json is not JSON/);
    assert.throws(() => readWalk('{ "steps": [] }', 'plan'), /has no "steps"/);
    assert.throws(() => readWalk('{ "steps": [ { "tap": "x" } ] }', 'plan'), /step 1: one of go, type, click, press, see, gone/);
    assert.throws(() => readWalk('{ "steps": [ { "see": "a", "click": "b" } ] }', 'plan'), /step 1: one of/);
    assert.throws(() => readWalk('{ "steps": [ { "see": "a" }, { "type": "Goal" } ] }', 'plan'), /step 2: "type" names the field, "text" is what to type/);
  });
  it('puts a step in the owner\'s words', () => {
    assert.equal(sayStep({ type: 'Goal distance', text: '10' }), 'type "10" into "Goal distance"');
    assert.equal(sayStep({ click: 'Make plan' }), 'click "Make plan"');
    assert.equal(sayStep({ see: '14 weeks', within: 2000 }), 'see "14 weeks"');
  });
  it('is off in a prototype and on from pilot; a project without phases walks', () => {
    assert.equal(walksOn('{ "phase": "prototype" }'), false);
    assert.equal(walksOn('{}'), false);
    assert.equal(walksOn('{ "phase": "pilot" }'), true);
    assert.equal(walksOn('{ "phase": "production" }'), true);
    assert.equal(walksOn(null), true);
  });
});
