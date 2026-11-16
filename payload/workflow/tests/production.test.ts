// Which addresses are production (workflow/tools/lib/production.mjs): the load test refuses them, the security run checks them.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isProduction, productionHosts, productionUrls } from '../../workflow/tools/lib/production.mjs';

describe('production addresses', () => {
  const launched = { deploy: { environments: { staging: { url: 'https://staging.example.org' }, production: { url: 'https://app.example.org' } } } };
  it('reads what /launch writes (deploy.environments.production.url), and deploy.url before it', () => {
    assert.deepEqual(productionUrls(launched), ['https://app.example.org']);
    assert.deepEqual(productionUrls({ deploy: { url: 'https://app.example.org' } }), ['https://app.example.org']);
    assert.deepEqual(productionHosts(launched), ['app.example.org']);
  });
  it('refuses any path on the production host, and lets staging and this computer be', () => {
    assert.equal(isProduction('https://app.example.org/api/health', launched), true);
    assert.equal(isProduction('http://APP.example.org', launched), true);
    assert.equal(isProduction('https://staging.example.org', launched), false);
    assert.equal(isProduction('http://127.0.0.1:8787', launched), false);
  });
  it('a deploy.url that is the staging address is not production', () => {
    assert.deepEqual(productionUrls({ deploy: { url: 'https://staging.example.org', environments: { staging: { url: 'https://staging.example.org' } } } }), []);
  });
});
