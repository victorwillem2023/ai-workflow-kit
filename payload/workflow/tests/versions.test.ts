// The versions check (workflow/tools/lib/versions.mjs): tools pinned in one place, Node one version everywhere, and
// OpenTofu stacks with their versions and lock file.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nodeOutOfStep, tofuUnpinned, unpinnedTools } from '../../workflow/tools/lib/versions.mjs';

describe('the versions check', () => {
  it('refuses a tool that is not pinned to an exact version', () => {
    assert.deepEqual(unpinnedTools('nodejs 26.13.1\nopentofu latest\n# a comment\nhelm 3\n'), [
      '.tool-versions:2 opentofu latest: pin an exact version (for example 1.2.3)',
      '.tool-versions:4 helm 3: pin an exact version (for example 1.2.3)',
    ]);
    assert.deepEqual(unpinnedTools(''), []);
  });
  it('fails when the Dockerfile, .tool-versions and package.json name different Node versions, and names each', () => {
    const lines = nodeOutOfStep({ toolVersions: 'nodejs 26.13.1', dockerfile: 'FROM node:22-slim AS build\nFROM node:22-slim', pkg: { engines: { node: '>=26' } } });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /\.tool-versions says 26, the Dockerfile says 22/);
    assert.deepEqual(nodeOutOfStep({ toolVersions: 'nodejs 26.13.1', dockerfile: 'FROM node:26-slim' }), []);
    assert.deepEqual(nodeOutOfStep({ toolVersions: 'nodejs 26.13.1', dockerfile: 'FROM node:26-slim AS build\nFROM gcr.io/distroless/nodejs26-debian13:nonroot' }), []);
    assert.match(nodeOutOfStep({ toolVersions: 'nodejs 26.13.1', dockerfile: 'FROM gcr.io/distroless/nodejs24-debian13' })[0], /the Dockerfile says 24/);
  });
  it('takes engines ">=24" as a floor: Node 26 keeps it, Node 22 does not, and "^24" names 24', () => {
    assert.deepEqual(nodeOutOfStep({ toolVersions: 'nodejs 26.13.1', dockerfile: 'FROM node:26-slim', pkg: { engines: { node: '>=24' } } }), []);
    assert.match(nodeOutOfStep({ toolVersions: 'nodejs 22.1.0', pkg: { engines: { node: '>=24' } } })[0], /Node is 22 .* asks for 24 or newer/);
    assert.match(nodeOutOfStep({ toolVersions: 'nodejs 26.13.1', pkg: { engines: { node: '^24' } } })[0], /engines\.node says 24/);
  });
  it('refuses type definitions for a newer Node than the one that runs, and allows older ones', () => {
    assert.match(nodeOutOfStep({ dockerfile: 'FROM node:22-slim', pkg: { devDependencies: { '@types/node': '^24.19.2' } } })[0], /@types\/node is 24, Node is 22/);
    assert.deepEqual(nodeOutOfStep({ dockerfile: 'FROM node:26-slim', pkg: { devDependencies: { '@types/node': '^24.19.2' } } }), []);
  });
  it('an OpenTofu stack names its version, a version per provider, and has its lock file in git', () => {
    const files = new Map([
      ['infra/main.tf', 'terraform {\n  required_providers {\n    hcloud = { source = "hetznercloud/hcloud" }\n    random = { source = "hashicorp/random", version = "~> 3.6" }\n  }\n}\n'],
      ['infra/modules/net/main.tf', 'resource "x" "y" {}'],
    ]);
    assert.deepEqual(tofuUnpinned(files, new Set()), [
      'infra: no required_version in its terraform block: name the OpenTofu version it is written for',
      'infra: provider hcloud has no version: give it one (~> 1.2 takes fixes, not breaking changes)',
      'infra: infra/.terraform.lock.hcl is not in git: commit it (it pins the exact provider builds and their checksums)',
    ]);
    const pinned = new Map([['infra/main.tf', 'terraform {\n  required_version = "~> 1.11"\n  required_providers {\n    hcloud = { source = "hetznercloud/hcloud", version = "~> 1.60" }\n  }\n}\n']]);
    assert.deepEqual(tofuUnpinned(pinned, new Set(['infra/.terraform.lock.hcl'])), []);
  });
});
