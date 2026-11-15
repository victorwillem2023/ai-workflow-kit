// scripts/packages.mjs: the packages package-lock.json lists against what node_modules holds, so a card that added a package and
// landed on main does not leave the main folder (and every session through its link) without it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeMissing, packagesOutOfDate } from '../../scripts/packages.mjs';

const lock = JSON.stringify({ lockfileVersion: 3, packages: {
  '': { name: 'app' },
  'node_modules/hono': { version: '4.6.0' },
  'node_modules/@hono/node-server': { version: '1.13.0' },
  'node_modules/zod': { version: '3.23.8', dev: true },
  'node_modules/@esbuild/darwin-arm64': { version: '0.24.0', optional: true },
  'node_modules/hono/node_modules/inner': { version: '1.0.0' },
  'node_modules/local-lib': { resolved: 'packages/lib', link: true },
} });

describe('the packages the lock lists', () => {
  it('names a package that is missing or at another version, a scoped one too; dev packages count', () => {
    const installed: Record<string, string> = { hono: '4.5.0', zod: '3.23.8' };
    assert.deepEqual(packagesOutOfDate(lock, (n) => installed[n] ?? null), [
      { name: 'hono', want: '4.6.0', have: '4.5.0' },
      { name: '@hono/node-server', want: '1.13.0', have: null },
    ]);
  });
  it('leaves out optional packages for another system, nested ones, links, and a lock it cannot read', () => {
    const all: Record<string, string> = { hono: '4.6.0', '@hono/node-server': '1.13.0', zod: '3.23.8' };
    assert.deepEqual(packagesOutOfDate(lock, (n) => all[n] ?? null), []);
    assert.deepEqual(packagesOutOfDate('not json', () => null), []);
  });
  it('says it in one line, with the first few by name', () => {
    assert.equal(describeMissing([{ name: 'hono', want: '4.6.0', have: null }]), '1 package not installed as package-lock.json lists it (hono missing)');
    assert.match(describeMissing(Array.from({ length: 7 }, (_, i) => ({ name: `p${i}`, want: '1', have: null }))), /^7 packages .*p4 missing; \.\.\.\)$/);
  });
});
