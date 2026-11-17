// Which phase the facts fit (workflow/tools/lib/phase.mjs): read from the project, said once per new fact, never on a timer;
// what a phase still needs; and a production deploy only in the production phase.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PAYMENT, deployRefusal, fitPhase, missingFor, phaseLines } from '../../workflow/tools/lib/phase.mjs';
import { isProductionEnv } from '../../workflow/tools/lib/production.mjs';

describe('the phase the facts fit', () => {
  it('prototype with nothing outside; pilot for an address or personal data; production for money or a production address', () => {
    assert.equal(fitPhase({}).fit, 'prototype');
    assert.equal(fitPhase({ reachable: true }).fit, 'pilot');
    assert.equal(fitPhase({ personal: true }).fit, 'pilot');
    assert.equal(fitPhase({ reachable: true, money: true }).fit, 'production');
    assert.equal(fitPhase({ relied: true }).fit, 'production');
  });
  it('a payment package is money, a word that only looks like one is not', () => {
    assert.ok(['stripe', '@stripe/stripe-js', '@paddle/paddle-js', '@mollie/api-client'].every((n) => PAYMENT.test(` ${n} `)));
    assert.deepEqual(['stripes-ui', 'paypalish', 'adyenne'].filter((n) => PAYMENT.test(` ${n} `)), []);
    assert.ok(PAYMENT.test('stripe = "^11.0"'), 'a pyproject or Cargo line');
  });
  it('an environment named for production is production; staging is not', () => {
    assert.deepEqual(['production', 'prod-eu', 'live', 'main', 'staging', 'preview'].map(isProductionEnv), [true, true, true, true, false, false]);
  });
});

describe('what /next says', () => {
  it('one quiet line; a fact that calls for more is said once, then never again', () => {
    const { facts } = fitPhase({ reachable: true });
    const first = phaseLines({ phase: 'prototype', facts });
    assert.match(first.status, /^phase: prototype \(other people can open it\)$/);
    assert.match(first.notice, /^New: other people can open it\. That fits the pilot phase/);
    assert.match(first.notice, /said once/);
    const again = phaseLines({ phase: 'prototype', facts, said: first.said });
    assert.equal(again.notice, '', 'not said twice');
    assert.match(again.status, /phase: prototype/, 'the quiet line stays');
  });
  it('nothing outside: no notice; a phase stricter than the facts: said once that a lighter one fits, then quiet', () => {
    assert.deepEqual(phaseLines({ phase: 'prototype', facts: [] }), { status: 'phase: prototype (nothing outside depends on it yet)', notice: '', said: [] });
    const strict = phaseLines({ phase: 'production', facts: [] });
    assert.match(strict.notice, /^The facts fit the prototype phase, lighter than production: .*\/ship would run the tests the change reaches.*said once/);
    assert.equal(phaseLines({ phase: 'production', facts: [], said: strict.said }).notice, '');
    assert.match(phaseLines({ phase: 'production', facts: fitPhase({ reachable: true }).facts }).notice, /fit the pilot phase, lighter/);
  });
  it('a new fact later is said, even when an earlier one was', () => {
    const said = phaseLines({ phase: 'pilot', facts: fitPhase({ reachable: true }).facts }).said;
    const later = phaseLines({ phase: 'pilot', facts: fitPhase({ reachable: true, money: true }).facts, said });
    assert.match(later.notice, /^New: it takes money\. That fits the production phase/);
  });
});

describe('what a phase still needs, and the production deploy', () => {
  it('a pilot needs errors seen and the security page; personal data needs the privacy page', () => {
    assert.deepEqual(missingFor('pilot', { personal: true }).map((m) => m.id), ['privacy', 'errors', 'security']);
    assert.deepEqual(missingFor('pilot', { errorsSeen: true, securityDoc: true }), []);
  });
  it('production adds backups restored once, a way back, monitoring, the scan and the run pages', () => {
    const all = { errorsSeen: true, securityDoc: true, secops: true, drill: true, rollback: true, monitoring: true, runDocs: true };
    assert.deepEqual(missingFor('production', all), []);
    assert.deepEqual(missingFor('production', { ...all, drill: false, rollback: false }).map((m) => m.id), ['backups', 'rollback']);
    assert.deepEqual(missingFor('prototype', {}), [], 'a prototype needs nothing');
  });
  it('a production deploy goes only in the production phase', () => {
    assert.equal(deployRefusal('production'), null);
    assert.match(deployRefusal('pilot') ?? '', /^Refused: this is a production deploy and the phase is pilot/);
  });
});
