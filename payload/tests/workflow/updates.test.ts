// What the waiting dependency updates mean (tools/workflow/lib/updates.mjs): the libraries a Dependabot pull request moves,
// the verdict on each (take, look at, hold), and the lines a session or the health screen prints.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bump, checksState, holdSnippet, judgePr, parseUpdates, readAlerts, runtimeNode, shortLine } from '../../tools/workflow/lib/updates.mjs';

const green = [{ status: 'COMPLETED', conclusion: 'SUCCESS' }];

describe('reading a Dependabot pull request', () => {
  it('reads every library of a grouped pull request from its body, and a single one from its title', () => {
    const grouped = { title: 'Bump the all group with 2 updates', body: 'Updates `vite` from 8.3.6 to 8.4.0\nUpdates `zod` from 4.6.7 to 4.6.9\nUpdates `vite` from 8.3.6 to 8.4.0' };
    assert.deepEqual(parseUpdates(grouped).map((u) => u.name), ['vite', 'zod']);
    assert.deepEqual(parseUpdates({ title: 'Bump @types/node from 24.19.2 to 26.6.6 in the all group' }), [{ name: '@types/node', from: '24.19.2', to: '26.6.6' }]);
    assert.deepEqual(parseUpdates({ title: 'Something else' }), []);
  });
  it('a 0.x minor step counts as a new major version, because it may break as much', () => {
    assert.equal(bump('0.45.4', '0.46.0'), 'major');
    assert.equal(bump('4.6.7', '4.7.0'), 'minor');
    assert.equal(bump('4.6.7', '4.6.9'), 'patch');
    assert.equal(bump('24.19.2', '26.6.6'), 'major');
  });
  it('says whether the checks passed, failed or still run', () => {
    assert.equal(checksState(green), 'green');
    assert.equal(checksState([{ status: 'COMPLETED', conclusion: 'FAILURE' }]), 'red');
    assert.equal(checksState([{ status: 'IN_PROGRESS', conclusion: '' }]), 'running');
    assert.equal(checksState([]), 'none');
  });
});

describe('the verdict', () => {
  const node = runtimeNode({ dockerfile: 'FROM node:24-slim AS build\n' });
  it('holds type definitions for a newer Node than the app runs on, and says why', () => {
    const p = judgePr({ number: 3, title: 'Bump @types/node from 24.19.2 to 26.6.6', statusCheckRollup: green }, { node });
    assert.equal(p.verdict, 'hold');
    assert.match(p.updates[0].why, /types are for Node 26, the app runs on Node 24 \(the Dockerfile\)/);
  });
  it('takes a small update whose checks are green, and looks first at a red one or a new major version', () => {
    assert.equal(judgePr({ title: 'Bump zod from 4.6.7 to 4.6.9', statusCheckRollup: green }, { node }).verdict, 'take');
    assert.equal(judgePr({ title: 'Bump zod from 4.6.7 to 4.6.9', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }] }, { node }).verdict, 'look');
    assert.equal(judgePr({ title: 'Bump react from 19.3.1 to 20.0.0', statusCheckRollup: green }, { node }).verdict, 'look');
  });
  it('a grouped pull request takes the verdict of its worst library, and a held library from the config is held', () => {
    const pr = { title: 'Bump the all group', body: 'Updates `zod` from 4.6.7 to 4.6.9\nUpdates `hono` from 4.13.18 to 4.14.0', statusCheckRollup: green };
    assert.equal(judgePr(pr, { node }).verdict, 'take');
    assert.equal(judgePr(pr, { node, hold: { hono: 'waiting for the new router' } }).verdict, 'hold');
  });
  it('finds the Node the app runs on in package.json first, then the Dockerfile, then .nvmrc', () => {
    assert.deepEqual(runtimeNode({ pkg: { engines: { node: '>=22.13' } }, dockerfile: 'FROM node:24' }), { major: 22, from: 'package.json engines' });
    assert.deepEqual(runtimeNode({ nvmrc: 'v24.11.0\n' }), { major: 24, from: '.nvmrc' });
    assert.equal(runtimeNode({}), null);
  });
});

describe('what is printed', () => {
  it('stops a held library at the source with an ignore entry for its new major versions', () => {
    assert.equal(holdSnippet(['@types/node']), '    ignore:\n      - dependency-name: "@types/node"\n        update-types: ["version-update:semver-major"]');
    assert.equal(holdSnippet([]), '');
  });
  it('puts the worst security alert first, and sums everything up in one line', () => {
    const alerts = readAlerts([
      { dependency: { package: { name: 'a' } }, security_advisory: { severity: 'low', summary: 'x' } },
      { dependency: { package: { name: 'b' } }, security_advisory: { severity: 'high', summary: 'y' }, security_vulnerability: { first_patched_version: { identifier: '1.2.3' } } },
    ]);
    assert.deepEqual(alerts.map((a) => a.name), ['b', 'a']);
    assert.equal(alerts[0].fixed, '1.2.3');
    assert.equal(shortLine([{ verdict: 'take' }, { verdict: 'take' }, { verdict: 'hold' }], alerts), 'updates: 2 security alerts (high); 2 to take, 1 to hold (npm run updates)');
    assert.equal(shortLine([], []), 'updates: nothing waiting');
  });
});
