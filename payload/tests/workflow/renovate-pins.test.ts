// Every tool image the kit runs with Docker is pinned with a "renovate: docker" comment; this proves the project's Renovate
// pattern (renovate.json, customManagers) really finds each one, so no pin is silently left behind.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const tools = 'tools/workflow';
const renovate = existsSync('renovate.json') ? JSON.parse(readFileSync('renovate.json', 'utf8')) : null;

describe('the pinned tool images', () => {
  it('are each found by the Renovate pattern for the file they are in', { skip: !renovate && 'no renovate.json here (the policy lives in a config repository)' }, () => {
    const managers = (renovate.customManagers ?? []).filter((m: { datasourceTemplate?: string }) => m.datasourceTemplate === 'docker');
    const missed: string[] = [];
    let pins = 0;
    for (const f of readdirSync(tools).filter((n) => n.endsWith('.mjs'))) {
      const path = `${tools}/${f}`;
      const lines = readFileSync(join(tools, f), 'utf8').split('\n').filter((l) => /\/\/ renovate: docker/.test(l));
      for (const line of lines) {
        pins++;
        const found = managers.some((m: { managerFilePatterns?: string[]; matchStrings: string[] }) =>
          (m.managerFilePatterns ?? []).some((p) => new RegExp(p.slice(1, -1)).test(path)) &&
          m.matchStrings.some((s) => new RegExp(s.replace(/\(\?<(\w+)>/g, '(?<$1>')).test(line)));
        if (!found) missed.push(`${path}: ${line.trim()}`);
      }
    }
    assert.ok(pins > 0, 'no pinned images found: the test looks in the wrong place');
    assert.deepEqual(missed, [], 'Renovate would never update these pins');
  });
});
