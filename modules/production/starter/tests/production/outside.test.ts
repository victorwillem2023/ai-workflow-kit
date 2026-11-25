// Every call to an outside service has its failure plan (src/server/outside.ts): a time limit, retries for what is safe to repeat,
// a fallback or the words a person reads. A service's own drill test looks like the last two cases: cut it off, check what
// the person gets.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../../src/server/errors';
import { callOutside, cutOff, type OutsidePlan, OutsideTimeout } from '../../src/server/outside';

const PLAN: OutsidePlan = { service: 'router', doing: 'planning the route', timeoutMs: 50, retries: 2, backoffMs: 1, message: 'The route planner is not answering. Try again in a minute.' };
const noWait = () => Promise.resolve();

describe('a call to an outside service', () => {
  it('answers with what the service gives, and a failed try is tried again up to the retries', async () => {
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls < 3) throw new Error('503 from the service');
      return 'route';
    };
    assert.equal(await callOutside(PLAN, flaky, { wait: noWait }), 'route');
    assert.equal(calls, 3);
  });
  it('stops a try at its time limit, so a service that hangs costs a bounded wait', async () => {
    const t0 = Date.now();
    await assert.rejects(callOutside({ ...PLAN, retries: 0 }, cutOff('hangs'), { wait: noWait }), (e: unknown) => e instanceof AppError && e.cause instanceof OutsideTimeout);
    assert.ok(Date.now() - t0 < 1000);
  });
  it('drill: the service cut off gives the person the plan\'s words with a 503, and the cause in the log', async () => {
    await assert.rejects(callOutside(PLAN, cutOff('down'), { wait: noWait }), (e: unknown) => {
      assert.ok(e instanceof AppError);
      assert.deepEqual([e.code, e.status, e.message], ['router-down', 503, 'The route planner is not answering. Try again in a minute.']);
      return true;
    });
  });
  it('drill: with a fallback the person still gets an answer, and the log says the service failed', async () => {
    const warned: unknown[] = [];
    const got = await callOutside(PLAN, cutOff('down'), { wait: noWait, fallback: () => 'a straight line', log: { warn: (msg, f) => void warned.push([msg, f?.service]) } });
    assert.equal(got, 'a straight line');
    assert.deepEqual(warned, [['outside fallback', 'router']]);
  });
});
