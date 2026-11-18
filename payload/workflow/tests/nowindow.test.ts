// No console windows flickering on Windows (workflow/tools/lib/nowindow.mjs): every child process the kit starts hides its window.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withHidden } from '../../workflow/tools/lib/nowindow.mjs';

const cb = () => {};
describe('child processes hide their window', () => {
  it('adds windowsHide to the options a call gives, and keeps a value it gives itself', () => {
    assert.deepEqual(withHidden('execFileSync', ['git', ['status'], { cwd: 'x' }]), ['git', ['status'], { windowsHide: true, cwd: 'x' }]);
    assert.deepEqual(withHidden('spawnSync', ['npm', ['test'], { windowsHide: false }]), ['npm', ['test'], { windowsHide: false }]);
    assert.deepEqual(withHidden('execSync', ['git status', { encoding: 'utf8' }]), ['git status', { windowsHide: true, encoding: 'utf8' }]);
  });
  it('adds the options where a call has none: after the argument list, before a callback', () => {
    assert.deepEqual(withHidden('spawn', ['git', ['status']]), ['git', ['status'], { windowsHide: true }]);
    assert.deepEqual(withHidden('spawnSync', ['git']), ['git', { windowsHide: true }]);
    assert.deepEqual(withHidden('execFile', ['git', ['status'], cb]), ['git', ['status'], { windowsHide: true }, cb]);
    assert.deepEqual(withHidden('exec', ['git status', cb]), ['git status', { windowsHide: true }, cb]);
    assert.deepEqual(withHidden('spawn', ['git', ['status'], undefined]), ['git', ['status'], { windowsHide: true }]);
  });
});
