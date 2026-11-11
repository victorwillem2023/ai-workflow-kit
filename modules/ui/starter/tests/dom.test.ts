// The DOM helper h(): text is text, links are http(s) only, there are no inline styles. Needs the dev dependency @happy-dom/global-registrator.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

describe('h(): building elements safely', () => {
  let h: typeof import('../src/web/dom').h;
  before(async () => { GlobalRegistrator.register(); ({ h } = await import('../src/web/dom')); });

  it('puts data in as text, so markup in a name is shown and never runs', () => {
    const el = h('p', null, '<img src=x onerror=alert(1)>');
    assert.equal(el.querySelector('img'), null);
    assert.equal(el.textContent, '<img src=x onerror=alert(1)>');
  });
  it('refuses a javascript: or data: link and keeps a web link', () => {
    assert.equal(h('a', { href: 'javascript:alert(1)' }, 'x').hasAttribute('href'), false);
    assert.equal(h('a', { href: 'data:text/html,<b>' }, 'x').hasAttribute('href'), false);
    assert.equal(h('a', { href: 'https://example.org/' }, 'x').getAttribute('href'), 'https://example.org/');
  });
  it('refuses an inline style: there is no style prop', () => {
    assert.equal(h('div', { style: 'color:red' }).hasAttribute('style'), false);
  });
});
