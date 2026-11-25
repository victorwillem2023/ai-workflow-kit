// The speed real people get (src/web/vitals.ts, src/server/pageevents.ts): each vital once it is final, in one batch when the page
// is left, with only the page's path and whether it is a phone; a poor one is a warning in the log.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLogger } from '../../src/server/log';
import { logPageEvents } from '../../src/server/pageevents';
import { pageOf, reportVitals, type VitalEvent } from '../../src/web/vitals';

type Metric = { name: string; value: number; rating: string };

describe('the speed real people get', () => {
  it('sends the vitals in one batch when the page is hidden, with the path only and whether it is a phone', () => {
    const report: Record<string, (m: Metric) => void> = {};
    const on = (name: string) => (cb: (m: Metric) => void) => {
      report[name] = cb;
    };
    const listeners: Record<string, () => void> = {};
    const win = {
      addEventListener: (type: string, fn: () => void) => {
        listeners[type] = fn;
      },
      document: { visibilityState: 'visible' },
      location: { pathname: '/plan' },
      matchMedia: () => ({ matches: true }),
    };
    const sent: VitalEvent[][] = [];
    reportVitals({ onLCP: on('LCP'), onINP: on('INP'), onCLS: on('CLS') }, win, (e) => void sent.push(e));
    report.LCP?.({ name: 'LCP', value: 3120.5, rating: 'needs-improvement' });
    report.INP?.({ name: 'INP', value: 88, rating: 'good' });
    assert.equal(sent.length, 0, 'nothing is sent while the page is in use');
    win.document.visibilityState = 'hidden';
    listeners.visibilitychange?.();
    assert.deepEqual(sent, [[
      { kind: 'vital', name: 'LCP', value: 3120.5, rating: 'needs-improvement', page: '/plan', phone: true },
      { kind: 'vital', name: 'INP', value: 88, rating: 'good', page: '/plan', phone: true },
    ]]);
  });
  it('an id or a token in the path never leaves the phone', () => {
    assert.deepEqual(['/athletes/8f3c2a91/plan', '/plans/42', '/share/aGVsbG8td29ybGQtdGhpcy1pcy1sb25n', '/trip/new', '/v2/plan'].map(pageOf), ['/athletes/:id/plan', '/plans/:id', '/share/:id', '/trip/new', '/v2/plan']);
  });
  it('the server logs each vital, a poor one as a warning, and keeps a layout shift\'s decimals', () => {
    const lines: Record<string, unknown>[] = [];
    const log = createLogger({ level: 'debug', write: (l) => lines.push(JSON.parse(l)) });
    logPageEvents([{ kind: 'vital', name: 'CLS', value: 0.0412, rating: 'good', page: '/plan', phone: false }, { kind: 'vital', name: 'INP', value: 640, rating: 'poor', page: '/plan', phone: true, userId: 'u1' }], { log });
    assert.deepEqual(lines.map((l) => [l.level, l.msg, l.name, l.value, l.userId]), [['info', 'page vital', 'CLS', 0.041, undefined], ['warn', 'page vital', 'INP', 640, undefined]]);
  });
});
