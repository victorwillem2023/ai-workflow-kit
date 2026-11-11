// The fake clock: a test that waits on a timeout costs milliseconds, not seconds.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clocked } from './clock';

describe('the fake clock', () => {
  it('lets a 4 second wait pass in a blink and moves Date by the same amount', clocked(async () => {
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 4000));
    assert.ok(Date.now() - t0 >= 4000);
  }));
  it('fails a test that never settles instead of spinning forever', async () => {
    await assert.rejects(clocked(() => new Promise<void>(() => {}))(), /still waiting/);
  });
});
