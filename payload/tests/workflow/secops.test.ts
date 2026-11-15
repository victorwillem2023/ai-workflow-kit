// The weekly security report (tools/workflow/lib/secops.mjs), from small copies of what OSV-Scanner, Trivy, Semgrep and
// gitleaks really write.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { accessDue, combine, fromCerts, fromGitleaks, fromOsv, fromSemgrep, fromTrivy, inKit, isoWeek, pickFixed, report } from '../../tools/workflow/lib/secops.mjs';

const osv = { results: [{ source: { path: '/src/package-lock.json' }, packages: [{
  package: { name: 'lodash', version: '4.17.15', ecosystem: 'npm' },
  vulnerabilities: [{ id: 'GHSA-35jh-r3h4-6jhm', aliases: ['CVE-2021-23337'], summary: 'Command Injection in lodash', affected: [{ ranges: [{ events: [{ introduced: '0' }, { fixed: '4.17.21' }] }] }] }],
  groups: [{ ids: ['GHSA-35jh-r3h4-6jhm'], aliases: ['CVE-2021-23337'], max_severity: '7.2' }],
}] }] };
const trivy = { Results: [
  { Target: 'package-lock.json', Vulnerabilities: [
    { VulnerabilityID: 'CVE-2021-23337', PkgName: 'lodash', InstalledVersion: '4.17.15', FixedVersion: '4.17.21', Severity: 'HIGH', Title: 'lodash: command injection' },
    { VulnerabilityID: 'CVE-2020-8203', PkgName: 'lodash', InstalledVersion: '4.17.15', FixedVersion: '>=4.17.19', Severity: 'HIGH', Title: 'prototype pollution' },
  ] },
  { Target: 'Dockerfile', Misconfigurations: [{ ID: 'DS002', Title: 'Image user should not be root', Severity: 'HIGH', Resolution: 'Add USER with a non-root user', Status: 'FAIL' }] },
] };
const semgrep = { results: [{ check_id: 'javascript.lang.security.audit.spawn-shell-true.spawn-shell-true', path: 'src/server/run.ts', start: { line: 12 }, extra: { message: 'Found spawn with shell: true. This is dangerous.', severity: 'ERROR', metadata: {} } }] };
const gitleaks = [{ RuleID: 'aws-access-token', Description: 'AWS access key', File: 'src/old.ts', StartLine: 3, Commit: 'abcdef1234567890', Secret: 'REDACTED' }];

describe('the security report', () => {
  it('reads each scanner, and counts the same library and advisory from two scanners once', () => {
    const all = combine(fromOsv(osv), fromTrivy(trivy), fromSemgrep(semgrep), fromGitleaks(gitleaks));
    assert.equal(all.filter((f) => f.id === 'CVE-2021-23337').length, 1);
    assert.deepEqual(all.map((f) => f.area).sort(), ['code', 'library', 'library', 'secret', 'setup']);
    assert.equal(all[0].area, 'secret', 'a secret is critical, so it comes first');
  });
  it('picks the version to update to on the release line already in use', () => {
    assert.equal(pickFixed('5.0.10, 3.0.7, 2.1.5, 1.1.19', '2.0.2'), '2.1.5');
    assert.equal(pickFixed('>=4.17.19', '4.17.15'), '4.17.19');
    assert.equal(pickFixed('', '1.0.0'), null);
  });
  it('makes one row per library with every advisory and the one version that fixes them all', () => {
    const r = report(combine(fromOsv(osv), fromTrivy(trivy)), { date: new Date('2026-11-16T05:00:00Z') });
    assert.match(r.body, /2 known vulnerabilities in lodash \(CVE-2021-23337, CVE-2020-8203\)/);
    assert.match(r.body, /update lodash to 4\.17\.21 or later/);
    assert.equal(r.title, 'Security report, 2026 week 47: 2 need you');
  });
  it('gives the rule\'s own advice as the fix, and one row per rule and file with its lines', () => {
    const sg = { results: [4, 11].map((line) => ({ check_id: 'x.dependabot-missing-cooldown', path: '.github/dependabot.yml', start: { line }, extra: { message: 'No cooldown period is set. Newly published packages can be malicious. Add a `cooldown` block with `default-days: 7`.', severity: 'WARNING' } })) };
    const r = report(fromSemgrep(sg));
    assert.match(r.body, /`\.github\/dependabot\.yml:4, 11` \| medium \| Add a `cooldown` block/);
    assert.equal(r.body.split('\n').filter((l) => l.includes('dependabot-missing-cooldown')).length, 1);
  });
  it('counts only the app\'s findings in the title: the kit\'s own are fixed in the kit', () => {
    const kitOnly = fromSemgrep({ results: [{ check_id: 'x.spawn-shell-true', path: 'tools/workflow/gate.mjs', start: { line: 1 }, extra: { message: 'Found spawn.', severity: 'ERROR' } }] });
    const r = report(kitOnly);
    assert.match(r.title, /nothing urgent/);
    assert.match(r.body, /And 1 in the kit's own files/);
  });
  it('tells the owner a leaked key must be changed at its provider, not only deleted', () => {
    assert.match(report(fromGitleaks(gitleaks)).body, /change the key at its provider now.*treat it as leaked/);
  });
  it('keeps findings in the kit\'s own files apart from the app\'s, and says when a scanner did not run', () => {
    assert.equal(inKit({ area: 'code', severity: 'high', what: '', where: 'tools/workflow/gate.mjs:12' }), true);
    assert.equal(inKit({ area: 'code', severity: 'high', what: '', where: 'src/server/run.ts:12' }), false);
    const r = report([], { ran: ['libraries'], failed: ['secrets in history (gitleaks)'] });
    assert.match(r.title, /nothing urgent/);
    assert.match(r.body, /\*\*did not run\*\*: secrets in history/);
  });
  it('raises a certificate that ends soon, as a renewal that broke, and one that cannot be read', () => {
    const now = new Date('2026-11-16T05:00:00Z');
    const f = fromCerts([{ host: 'a.example', validTo: 'Nov 20 00:00:00 2026 GMT' }, { host: 'b.example', validTo: 'Feb 1 00:00:00 2027 GMT' }, { host: 'c.example', error: 'ECONNREFUSED' }], now);
    assert.deepEqual(f.map((x) => [x.where, x.severity]), [['a.example', 'critical'], ['c.example', 'high']]);
    assert.match(report(f, { date: now }).body, /renewal is meant to be automatic/);
  });
  it('says when the access review is due, and nothing for a project without docs/ACCESS.md', () => {
    const now = new Date('2026-11-16T05:00:00Z');
    assert.deepEqual(accessDue(null, now), []);
    assert.deepEqual(accessDue('Last review: 2026-10-01', now), []);
    assert.equal(accessDue('Last review: 2026-06-01', now)[0].severity, 'high');
    assert.match(accessDue('# Access', now)[0].what, /no access review/);
  });
  it('numbers the weeks the ISO way, the week of a Thursday', () => {
    assert.deepEqual(isoWeek(new Date('2026-01-01T12:00:00Z')), { year: 2026, week: 1 });
    assert.deepEqual(isoWeek(new Date('2027-01-01T12:00:00Z')), { year: 2026, week: 53 });
  });
});
