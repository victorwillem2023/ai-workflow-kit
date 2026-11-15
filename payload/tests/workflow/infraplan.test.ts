// Reviewing an infrastructure plan before it is applied (lib/infraplan.mjs) and the startup-script rules (lib/infracheck.mjs).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { destroyLines, fromPulumiPreview, fromTofuPlan, parseExpect, renderReview, reviewPlan } from '../../tools/workflow/lib/infraplan.mjs';
import { startupFiles, startupProblems } from '../../tools/workflow/lib/infracheck.mjs';

const plan = {
  resource_changes: [
    { address: 'hcloud_server.web', type: 'hcloud_server', change: { actions: ['update'], before: { user_data: 'a' }, after: { user_data: 'b' } } },
    { address: 'hcloud_firewall.web', type: 'hcloud_firewall', change: { actions: ['create'], before: null, after: {} } },
    { address: 'hcloud_volume.data', type: 'hcloud_volume', change: { actions: ['delete', 'create'], before: {}, after: {} } },
    { address: 'hcloud_network.private', type: 'hcloud_network', change: { actions: ['no-op'], before: {}, after: {} } },
  ],
};

describe('reading a plan', () => {
  it('reads OpenTofu and Terraform plans: the action, a replacement as one, no-ops left out, a startup script change marked', () => {
    assert.deepEqual(fromTofuPlan(JSON.stringify(plan)), [
      { address: 'hcloud_server.web', type: 'hcloud_server', action: 'update', startup: true },
      { address: 'hcloud_firewall.web', type: 'hcloud_firewall', action: 'create', startup: false },
      { address: 'hcloud_volume.data', type: 'hcloud_volume', action: 'replace', startup: false },
    ]);
  });
  it('reads a Pulumi preview, counting a replacement\'s steps once', () => {
    const urn = 'urn:pulumi:prod::app::aws:rds/instance:Instance::db';
    const preview = { steps: [{ op: 'create-replacement', urn, newState: { type: 'aws:rds/instance:Instance' } }, { op: 'delete-replaced', urn }, { op: 'same', urn: 'urn:pulumi:prod::app::aws:s3/bucket:Bucket::logs' }] };
    assert.deepEqual(fromPulumiPreview(preview), [{ address: 'db', type: 'aws:rds/instance:Instance', action: 'replace', startup: false }]);
  });
});

describe('reviewing a plan against what was expected', () => {
  const changes = fromTofuPlan(plan);
  it('passes when every change was expected and nothing holding data is destroyed', () => {
    const r = reviewPlan(changes.slice(0, 2), { expect: parseExpect('update hcloud_server.web  # the new startup script\ncreate hcloud_firewall.*\n') });
    assert.deepEqual(r.problems, []);
    assert.match(r.warnings[0], /startup script changes.*does NOT get it until it is rebuilt/);
    assert.match(renderReview('infra/prod', r), /1 to create, 1 to change.*\n  ~ hcloud_server\.web\n  \+ hcloud_firewall\.web/);
  });
  it('fails a change nobody expected, an expected change the plan lacks, and a volume destroyed', () => {
    const r = reviewPlan(changes, { expect: parseExpect('create hcloud_firewall.web\nreplace hcloud_volume.data\ncreate hcloud_load_balancer.web') });
    assert.equal(r.problems.length, 3);
    assert.match(r.problems[0], /Not expected: update hcloud_server\.web/);
    assert.match(r.problems[1], /Expected but not in the plan: create hcloud_load_balancer\.web/);
    assert.match(r.problems[2], /destroy and recreate hcloud_volume\.data.*--allow-destroy hcloud_volume\.data/);
    assert.equal(reviewPlan(changes.slice(2), { expect: parseExpect('any hcloud_volume.data'), allowDestroy: ['hcloud_volume.data'] }).problems.length, 0);
  });
  it('asks for the expectation before the plan, refuses a line it cannot read, and says when nothing changes', () => {
    assert.match(reviewPlan(changes).problems[0], /No plan\.expect/);
    assert.throws(() => parseExpect('build hcloud_server.web'), /line 1/);
    assert.match(renderReview('infra/prod', reviewPlan([])), /no changes/);
  });
});

describe('what the apply shows before the code', () => {
  it('names every destroy, and says which hold data', () => {
    const lines = destroyLines('infra/prod', [
      { action: 'delete', address: 'hcloud_volume.data', type: 'hcloud_volume', data: true },
      { action: 'replace', address: 'hcloud_server.web', type: 'hcloud_server', data: false },
    ]);
    assert.equal(lines[0], 'This plan DESTROYS 2 things in infra/prod:');
    assert.match(lines[1], /DESTROY {2}hcloud_volume\.data {2}\(hcloud_volume, holds data/);
    assert.match(lines[2], /destroy and recreate {2}hcloud_server\.web {2}\(hcloud_server\)$/);
    assert.deepEqual(destroyLines('infra/prod', []), ['This plan destroys nothing in infra/prod.']);
  });
});

describe('names and labels in the plan', () => {
  const rc = (address: string, after: object) => ({ address, type: address.split('.')[0], change: { actions: ['create'], before: null, after } });
  const changes = fromTofuPlan({ resource_changes: [
    rc('hcloud_server.web[0]', { name: 'coach-prod-hel1-web-01', labels: { app: 'coach', env: 'prod', 'managed-by': 'tofu' } }),
    rc('hcloud_server.web[1]', { name: 'webserver2', labels: { app: 'coach' } }),
    rc('hcloud_ssh_key.owner', { name: 'victor laptop' }),
  ] });
  const naming = { rules: [{ pattern: '^coach-(dev|prod)-[a-z]+[0-9]*-[a-z0-9-]+$', say: '<app>-<env>-<place>-<part>', except: ['hcloud_ssh_key.*'] }], labels: ['app', 'env', 'managed-by'] };
  it('checks the final names of what is created, whatever built them, and the labels each must carry', () => {
    const r = reviewPlan(changes, { expect: parseExpect('create hcloud_*'), naming });
    assert.equal(r.problems.length, 2);
    assert.match(r.problems[0], /hcloud_server\.web\[1\] would be named "webserver2", not <app>-<env>-<place>-<part>/);
    assert.match(r.problems[1], /hcloud_server\.web\[1\] has no env, managed-by labels/);
  });
});

describe('the restore drill', async () => {
  const { drillRow, drillDue } = await import('../../tools/workflow/lib/drill.mjs');
  const md = '| How long it may be down (RTO) | not decided | x |\n| Last restore drill | not yet | the date a backup was restored |\n';
  it('writes the date and timings into the row, and the report flags an old drill', () => {
    const out = drillRow(md, { date: '2026-11-15', restoreSeconds: 12.4, upSeconds: 3.6 });
    assert.match(out, /\| Last restore drill \| 2026-11-15: restored in 12 s, the app answered 4 s later \|/);
    assert.deepEqual(drillDue(out, new Date('2026-12-01')), []);
    assert.match(drillDue(out, new Date('2027-06-01'))[0].what, /198 days ago/);
    assert.equal(drillDue(md, new Date(), true)[0].id, 'restore-drill');
    assert.deepEqual(drillDue(md, new Date(), false), []);
  });
});

describe('startup scripts', () => {
  it('finds them by name', () => {
    assert.deepEqual(startupFiles(['infra/prod/main.tf', 'infra/prod/cloud-init.yaml', 'infra/prod/startup.sh', 'infra/prod/user-data.tftpl']), ['infra/prod/cloud-init.yaml', 'infra/prod/startup.sh', 'infra/prod/user-data.tftpl']);
  });
  it('fails a secret in it, a missing #cloud-config line, and curl piped into a shell', () => {
    const bad = 'packages: [nginx]\nruncmd:\n  - export API_TOKEN=abcd1234efgh\n  - curl -fsSL https://get.example.sh | sudo sh\n';
    const p = startupProblems('infra/prod/cloud-init.yaml', bad);
    assert.equal(p.length, 3);
    assert.match(p[0], /#cloud-config/);
    assert.match(p[1], /:3: a secret/);
    assert.match(p[2], /:4: a download piped into a shell/);
    assert.deepEqual(startupProblems('infra/prod/cloud-init.yaml', '#cloud-config\nusers:\n  - name: app\n    lock_passwd: true\nruncmd:\n  - export TOKEN=${token}\n'), []);
  });
});
