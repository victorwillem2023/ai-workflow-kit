// What the product is used on (workflow/tools/lib/surfaces.mjs): decided at /setup, read by the UI rules, the page weight and the
// apps a phone or desktop app becomes.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appsOf, hasWeb, surfacesOf, widthsOf } from '../../workflow/tools/lib/surfaces.mjs';

describe('the surfaces', () => {
  it('a project that never chose is a web app also used on phones (the kit as it was)', () => {
    assert.deepEqual(surfacesOf({}).names, ['web-phone']);
    assert.deepEqual(widthsOf(['web-phone']), [400, 1280]);
  });
  it('a web app on a computer only has no phone width; a phone app only has no web pages', () => {
    assert.deepEqual(widthsOf(['web']), [1280]);
    assert.deepEqual([hasWeb(['phone']), widthsOf(['phone'])], [false, [400]]);
    assert.deepEqual(appsOf(['phone']), ['apps/mobile']);
  });
  it('a phone companion goes beside a web app and is an app of its own; an API has no screens at all', () => {
    const c = surfacesOf({ project: { surfaces: ['web', 'phone-companion'] } });
    assert.deepEqual([c.problems, appsOf(c.names), widthsOf(c.names), hasWeb(c.names)], [[], ['apps/mobile'], [400, 1280], true]);
    assert.deepEqual([widthsOf(['api']), hasWeb(['api'])], [[], false]);
  });
  it('names a list that cannot be', () => {
    assert.equal(surfacesOf({ project: { surfaces: ['phone-companion'] } }).problems.length, 1, 'a companion with no web app');
    assert.equal(surfacesOf({ project: { surfaces: ['web', 'web-phone'] } }).problems.length, 1);
    assert.equal(surfacesOf({ project: { surfaces: ['tv'] } }).problems.length, 1);
  });
});
