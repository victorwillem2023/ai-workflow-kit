// Docs that cannot go out of date: the infra map made from the infrastructure files (lib/infra.mjs), docs that say what they
// cover (lib/doccovers.mjs), and parts of docs made from the config (lib/docblocks.mjs).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesAny } from '../../workflow/tools/lib/glob.mjs';
import { parseK8s, parseTf, renderInfraMap } from '../../workflow/tools/lib/infra.mjs';
import { parseCovers, parseNameStatus, staleDocs } from '../../workflow/tools/lib/doccovers.mjs';
import { blockMakers, fillBlocks, hasBlocks } from '../../workflow/tools/lib/docblocks.mjs';

const tf = `resource "hcloud_server" "web" {
  name        = "coach-prod-hel1-web-01"
  server_type = "cpx22"
  location    = "hel1"
  labels = {
    name = "not this one"
  }
}

# a comment with { a brace
module "dns" {
  source = "./modules/dns"
}
`;

describe('the infra map', () => {
  it('reads resources and modules with their name, place and size, not the nested blocks', () => {
    assert.deepEqual(parseTf('infra/prod/main.tf', tf), [
      { file: 'infra/prod/main.tf', kind: 'hcloud_server', id: 'web', attrs: { name: 'coach-prod-hel1-web-01', server_type: 'cpx22', location: 'hel1' } },
      { file: 'infra/prod/main.tf', kind: 'module', id: 'dns', attrs: { source: './modules/dns' } },
    ]);
  });
  it('reads Kubernetes objects from a file of several documents', () => {
    const y = 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\n  namespace: prod\nspec:\n  template:\n    spec:\n      containers:\n        - image: ghcr.io/x/api:abc\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: api\n';
    assert.deepEqual(parseK8s('k8s/api.yaml', y).map((r) => [r.kind, r.id, r.attrs.namespace, r.attrs.image]), [['Deployment', 'api', 'prod', 'ghcr.io/x/api:abc'], ['Service', 'api', undefined, undefined]]);
  });
  it('writes one table per folder, and says so when there is nothing yet', () => {
    const page = renderInfraMap(parseTf('infra/prod/main.tf', tf));
    assert.match(page, /## infra\/prod\n\n\| Kind/);
    assert.match(page, /\| hcloud_server \| `web` \| coach-prod-hel1-web-01 \| hel1 \| cpx22 \|/);
    assert.match(renderInfraMap([]), /No infrastructure files yet/);
  });
});

describe('docs that say what they cover', () => {
  const docs = new Map([
    ['docs/run/ENVIRONMENTS.md', '# Envs\n<!-- covers: infra/**, .github/workflows/release.yml -->\n'],
    ['docs/code/server.md', '<!-- covers new files: src/server/** -->\n'],
  ]);
  it('reads both kinds of covers line', () => {
    assert.deepEqual(parseCovers('<!-- covers: a/**, `b` -->\n<!-- covers new files: src/** -->'), [{ globs: ['a/**', 'b'], newOnly: false }, { globs: ['src/**'], newOnly: true }]);
  });
  it('fails a doc whose files changed while it did not; a new-files doc only for files that came or went', () => {
    const changes = parseNameStatus('M\tinfra/prod/main.tf\nM\tsrc/server/routes.ts\nA\tsrc/server/export.ts', []);
    assert.deepEqual(staleDocs({ docs, changes, matches: matchesAny }), [
      { doc: 'docs/run/ENVIRONMENTS.md', files: ['infra/prod/main.tf'] },
      { doc: 'docs/code/server.md', files: ['src/server/export.ts'] },
    ]);
  });
  it('passes when the doc changed too, or a line says on purpose that it needs nothing', () => {
    const changes = parseNameStatus('M\tinfra/prod/main.tf\nM\tdocs/run/ENVIRONMENTS.md', ['src/server/new.ts']);
    assert.deepEqual(staleDocs({ docs, changes, matches: matchesAny, waivers: 'Docs: no change to docs/code/server.md (a helper inside the export part)' }), []);
  });
  it('counts a rename under both names, and leaves the generated files out', () => {
    const changes = parseNameStatus('R100\tsrc/server/a.ts\tsrc/server/b.ts', []);
    assert.deepEqual(changes.map((c) => c.file), ['src/server/a.ts', 'src/server/b.ts']);
    assert.deepEqual(staleDocs({ docs, changes: [{ file: 'infra/x.tf', status: 'M' }], matches: matchesAny, ignore: ['infra/**'] }), []);
  });
});

describe('parts of docs made from the config', () => {
  const makers = blockMakers({
    config: { boundaries: [{ name: 'core is pure', from: 'src/core/**', forbid: ['src/server/**'], forbidNode: true }], sensitive: { paths: [] }, naming: { files: [{ glob: 'src/**/*.ts', style: 'kebab' }] } },
    toolVersions: 'nodejs 26.13.1\nopentofu 1.11.0 # pinned\n',
    envExample: '# where the database file lives\nDATABASE_PATH=./data/app.db\nPORT=8787\n',
  });
  it('fills each block from what the project has, and leaves an unknown block alone', () => {
    const doc = 'x\n<!-- generated: layers -->\nold\n<!-- /generated -->\n<!-- generated: other -->\nkeep\n<!-- /generated -->\n';
    const out = fillBlocks(doc, makers);
    assert.match(out, /- \*\*core is pure\*\*: `src\/core\/\*\*` may not import `src\/server\/\*\*` or Node's own modules/);
    assert.match(out, /<!-- generated: other -->\nkeep\n/);
    assert.equal(fillBlocks(out, makers), out, 'filling twice changes nothing');
    assert.ok(hasBlocks(doc) && !hasBlocks('# none'));
  });
  it('makes the versions, settings, sensitive and naming tables', () => {
    assert.match(makers.versions(), /\| opentofu \| 1\.11\.0 \|/);
    assert.match(makers.settings(), /\| `DATABASE_PATH` \| where the database file lives \|\n\| `PORT` \|  \|/);
    const env = blockMakers({ envExample: '# Copy this file to .env and fill it in.\nPORT=8787\n# the commit the app runs\n# APP_VERSION=abc\n' }).settings();
    assert.match(env, /\| `PORT` \|  \|\n\| `APP_VERSION` \| \(optional\) the commit the app runs \|/);
    assert.match(makers.sensitive(), /None yet/);
    assert.match(makers.naming(), /\| `src\/\*\*\/\*\.ts` \| kebab \|/);
  });
});

describe('the infra stacks and the network policy', async () => {
  const { stacks, toolOf } = await import('../../workflow/tools/lib/infracheck.mjs');
  const { networkPolicy } = await import('../../workflow/tools/lib/netpolicy.mjs');
  it('knows each tool by its files, and OpenTofu over Terraform unless the project chose Terraform', () => {
    assert.equal(toolOf(['infra/prod/main.tf']), 'tofu');
    assert.equal(toolOf(['infra/prod/main.tf'], 'terraform'), 'terraform');
    assert.equal(toolOf(['infra/Pulumi.yaml', 'infra/index.ts']), 'pulumi');
    assert.equal(toolOf(['infra/ansible/site.yml', 'infra/ansible/ansible.cfg']), 'ansible');
    assert.equal(toolOf(['infra/README.md']), null);
  });
  it('finds one stack per folder and leaves shared modules to the stacks that use them', () => {
    const paths = ['infra/prod/main.tf', 'infra/staging/main.tf', 'infra/modules/server/main.tf', 'infra/network.json', 'infra/ansible/site.yml'];
    assert.deepEqual(stacks(paths), [{ dir: 'infra/ansible', tool: 'ansible' }, { dir: 'infra/prod', tool: 'tofu' }, { dir: 'infra/staging', tool: 'tofu' }]);
  });
  it('makes one network file from the config: the safe ingress by default, the lists sorted', () => {
    const p = JSON.parse(networkPolicy({ security: { egress: ['b.example', 'a.example'], ipRules: [{ cidr: '203.0.113.0/24', action: 'allow', for: 'admin', why: 'office', until: '2027-01-31' }, { cidr: '198.51.100.7', action: 'block', why: 'abuse', until: '2026-12-31' }] } }));
    assert.deepEqual(p.ingress.map((r: { port: number }) => r.port), [443, 80]);
    assert.deepEqual(p.egress, ['a.example', 'b.example']);
    assert.deepEqual(p.allow, [{ cidr: '203.0.113.0/24', for: 'admin', until: '2027-01-31', why: 'office' }]);
    assert.equal(p.block[0].cidr, '198.51.100.7');
  });
});
