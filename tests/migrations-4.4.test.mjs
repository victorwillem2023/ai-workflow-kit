// Kit 4.4.0's update step: the board's areas get one for code health (migrations/4.4.0-code-health-area.mjs).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withHealthArea } from '../migrations/4.4.0-code-health-area.mjs';

describe('kit 4.4.0: an area for code health', () => {
  it('adds the area after the project\'s own, once, and leaves a board without areas or with its own health label', () => {
    const now = withHealthArea('{\n  "board": {\n    "labels": {\n      "areas": ["area: UI", "area: Trips"]\n    }\n  }\n}\n');
    assert.deepEqual(JSON.parse(now).board.labels.areas, ['area: UI', 'area: Trips', 'area: Code health']);
    assert.equal(withHealthArea(now), null);
    assert.equal(withHealthArea('{ "board": { "labels": {} } }'), null);
    assert.equal(withHealthArea('{ "board": { "health": "area: Upkeep", "labels": { "areas": ["area: Upkeep"] } } }'), null);
    assert.equal(withHealthArea('{}'), null);
  });
});
