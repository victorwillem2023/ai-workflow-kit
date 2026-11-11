// A fake clock for tests that wait on timeouts, deadlines and retry pauses.
// `clocked(fn)` runs a test body with setTimeout and Date on a mock clock that moves ahead
// whenever the code is only waiting, so a "3.6 s late answer" costs milliseconds, not seconds.
import { mock } from 'node:test';

const STEP_MS = 50;
const MAX_STEPS = 20000; // 1000 s of fake time: a test that never settles fails instead of spinning

export function clocked<A extends unknown[], T>(fn: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
  return async (...args: A) => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
    try {
      let done = false;
      const p = fn(...args).finally(() => { done = true; });
      p.catch(() => {});
      for (let i = 0; !done; i++) {
        if (i >= MAX_STEPS) throw new Error('the test was still waiting after 1000 s of fake time');
        await new Promise<void>((r) => setImmediate(r)); // let everything that can run, run
        if (!done) mock.timers.tick(STEP_MS);
      }
      return await p;
    } finally {
      mock.timers.reset();
    }
  };
}
