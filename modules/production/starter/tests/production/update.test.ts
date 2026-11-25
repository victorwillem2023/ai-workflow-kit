// A page kept on the phone is replaced when a new version ships (src/web/update.ts): offered when the server runs a later build,
// reloaded at once when it was built before the oldest build allowed, never after a rollback or in a loop, and left alone offline.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkForUpdate, updateState } from '../../src/web/update';

const MINE = { builtAt: '2026-11-20T10:00:00Z' };

describe('a page kept on the phone', () => {
  it('is offered a later build, reloaded when too old, and left alone after a rollback', () => {
    assert.equal(updateState(MINE, { built: '2026-11-20T10:00:00Z' }), 'current');
    assert.equal(updateState(MINE, { built: '2026-11-22T09:00:00Z' }), 'newer');
    assert.equal(updateState(MINE, { built: '2026-11-18T09:00:00Z' }), 'current', 'a server rolled back offers nothing');
    assert.equal(updateState(MINE, { built: '2026-11-22T09:00:00Z', minBuilt: '2026-11-21T00:00:00Z' }), 'too-old');
    assert.equal(updateState(MINE, { built: '2026-11-22T09:00:00Z', minBuilt: '2026-11-19T00:00:00Z' }), 'newer', 'built after the minimum: only offered');
    assert.equal(updateState(MINE, { built: '2026-11-20T10:00:00Z', minBuilt: '2026-11-25T00:00:00Z' }), 'current', 'a minimum no running build meets never reloads in a loop');
    assert.equal(updateState(MINE, {}), 'current', 'a server that says no build time: nothing to compare');
  });
  it('offers, reloads, and does nothing offline', async () => {
    const did: string[] = [];
    const act = { offer: () => void did.push('offer'), reload: () => void did.push('reload') };
    await checkForUpdate(MINE, async () => ({ built: '2026-11-22T09:00:00Z' }), act);
    await checkForUpdate(MINE, async () => ({ built: '2026-12-02T00:00:00Z', minBuilt: '2026-12-01T00:00:00Z' }), act);
    assert.equal(await checkForUpdate(MINE, () => Promise.reject(new Error('offline')), act), null);
    assert.deepEqual(did, ['offer', 'reload']);
  });
});
