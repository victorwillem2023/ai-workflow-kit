// scripts/logs.mjs: a session's server log as a person reads it, one line per event, one request's lines by its reference.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatLine } from '../../scripts/logs.mjs';

const line = (o: Record<string, unknown>) => JSON.stringify({ time: '2026-11-15T10:00:01.123Z', ...o });

describe('reading a server log', () => {
  it('shows the time, level, message, the request it belongs to and the other fields; the dev server\'s own words as they are', () => {
    assert.equal(formatLine(line({ level: 'warn', msg: 'POST /api/goal 400 12 ms', requestId: '4f2a9c1e00', method: 'POST', path: '/api/goal', status: 400, ms: 12 })),
      '10:00:01 WARN  POST /api/goal 400 12 ms  ref 4f2a9c1e  status=400 ms=12');
    assert.equal(formatLine('  VITE v8.3.8  ready in 461 ms'), '  VITE v8.3.8  ready in 461 ms');
  });
  it('shows an error with its code and the whole chain of causes', () => {
    const out = formatLine(line({ level: 'error', msg: 'Your goal could not be saved.', requestId: 'abc', doing: 'saving the goal',
      error: { kind: 'AppError', code: 'store-down', message: 'Your goal could not be saved.', at: ['at save (src/server/goal.ts:40)'], cause: { kind: 'Error', message: 'SQLITE_BUSY' } } }));
    assert.match(String(out), /ERROR Your goal could not be saved\.  ref abc  doing=saving the goal\n    AppError \(store-down\): Your goal could not be saved\. at save \(src\/server\/goal\.ts:40\)\n    caused by Error: SQLITE_BUSY/);
  });
  it('shows the causes list the error helper logs, one "caused by" line each', () => {
    const out = formatLine(line({ level: 'error', msg: 'Your goal could not be saved.', requestId: 'abc', code: 'store-down',
      causes: [{ kind: 'Error', code: 'SQLITE_BUSY', message: 'database is locked' }] }));
    assert.match(String(out), /ref abc  code=store-down\n    caused by Error \(SQLITE_BUSY\): database is locked$/);
  });
  it('--ref keeps one request\'s lines, --level the ones at least that serious', () => {
    assert.equal(formatLine(line({ level: 'info', msg: 'x', requestId: 'abc123' }), { ref: 'def' }), null);
    assert.notEqual(formatLine(line({ level: 'info', msg: 'x', requestId: 'abc123' }), { ref: 'abc' }), null);
    assert.equal(formatLine(line({ level: 'info', msg: 'x' }), { level: 'warn' }), null);
    assert.equal(formatLine('plain words', { ref: 'abc' }), null, 'a filter shows only the app\'s own lines');
  });
});
