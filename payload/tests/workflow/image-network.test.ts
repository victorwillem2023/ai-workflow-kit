// The image check (lib/dockercheck.mjs) and traffic rules as code (lib/network.mjs): an image holds only what runs, as a
// user who is not root; the code calls only the outside hosts the owner listed; IP rules have a reason and an end.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { imageProblems, stages } from '../../tools/workflow/lib/dockercheck.mjs';
import { allowed, ipRuleProblems, outboundHosts, unlistedEgress } from '../../tools/workflow/lib/network.mjs';

const good = `FROM node:26-trixie-slim AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM gcr.io/distroless/nodejs26-debian13:nonroot
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
CMD ["dist/server.js"]
`;
const ignore = '.git\n.env\n.env.*\nnode_modules\n';

describe('the image check', () => {
  it('reads the stages, joining continued lines', () => {
    const s = stages('FROM a:1 AS x\nRUN one \\\n  two\nFROM x');
    assert.deepEqual(s.map((x) => [x.from, x.name, x.lines.length]), [['a:1', 'x', 1], ['x', null, 0]]);
  });
  it('passes a distroless nonroot image that copies only what runs', () => {
    assert.deepEqual(imageProblems(good, ignore), []);
  });
  it('fails an image that copies the whole repository, runs as root or starts from an unpinned base', () => {
    const bad = 'FROM node:latest AS build\nCOPY . .\nFROM node\nCOPY --from=build /app ./\nCMD ["node", "x.js"]';
    const p = imageProblems(bad, ignore);
    assert.ok(p.some((l) => /FROM node:latest has no fixed version/.test(l)));
    assert.ok(p.some((l) => /FROM node has no fixed version/.test(l)));
    assert.ok(p.some((l) => /copies everything into the image that runs/.test(l)));
    assert.ok(p.some((l) => /runs as root/.test(l)));
  });
  it('fails a secret baked into the image, a download without a checksum, and a missing or thin .dockerignore', () => {
    const p = imageProblems('FROM node:26-slim\nARG NPM_TOKEN\nADD https://x.example/tool /bin/tool\nUSER node', null);
    assert.ok(p.some((l) => /ARG NPM_TOKEN puts a secret/.test(l)));
    assert.ok(p.some((l) => /ADD from a URL/.test(l)));
    assert.ok(p.some((l) => /\.dockerignore is missing/.test(l)));
    assert.deepEqual(imageProblems('FROM node:26-slim\nUSER node', 'node_modules\n'), ['.dockerignore does not leave out .git', '.dockerignore does not leave out .env']);
  });
});

describe('outbound traffic and IP rules', () => {
  const code = new Map([
    ['src/server/weather.ts', "const r = await fetch('https://api.open-meteo.com/v1/forecast?x=1');\n// see https://docs.example.org\nconst t = `https://oauth2.googleapis.com/token`;"],
    ['src/server/local.ts', "fetch('http://localhost:8787/health'); const ns = 'http://www.w3.org/2000/svg';"],
  ]);
  it('finds the outside hosts the code calls, not local ones, comments or schemas', () => {
    assert.deepEqual([...outboundHosts(code).keys()], ['api.open-meteo.com', 'oauth2.googleapis.com']);
  });
  it('leaves out links the user clicks, but not images the page loads', () => {
    const page = new Map([['src/web/App.tsx', '<a href="https://vite.dev" target="_blank"><img src="https://cdn.example-images.net/logo.svg" /></a>\n<a href={\'https://react.dev\'}>React</a>']]);
    assert.deepEqual([...outboundHosts(page).keys()], ['cdn.example-images.net']);
  });
  it('fails a host the allowlist does not name; *.domain covers its subdomains', () => {
    assert.ok(allowed('oauth2.googleapis.com', ['*.googleapis.com']) && !allowed('evil.com', ['*.googleapis.com']));
    const p = unlistedEgress(code, ['*.googleapis.com']);
    assert.equal(p.length, 1);
    assert.match(p[0], /src\/server\/weather\.ts:1 calls api\.open-meteo\.com, which security\.egress does not list/);
  });
  it('wants every IP rule to be a real range with a reason and an end, and never an allowlist of everyone', () => {
    const now = new Date('2026-11-15T12:00:00Z');
    const p = ipRuleProblems([
      { cidr: '203.0.113.0/24', action: 'allow', for: 'admin', why: 'the office', until: '2027-03-31' },
      { cidr: '0.0.0.0/0', action: 'allow', for: 'admin', why: 'temporary', until: '2027-01-01' },
      { cidr: '198.51.100.7', action: 'block', why: 'scraping', until: '2026-10-01' },
      { cidr: '300.1.1.1', action: 'block' },
      { cidr: '2001:db8::/32', action: 'block', why: 'test range' },
    ], now);
    assert.deepEqual(p.map((x) => [x.where, x.severity]), [
      ['security.ipRules 0.0.0.0/0', 'high'],
      ['security.ipRules 198.51.100.7', 'medium'],
      ['security.ipRules 300.1.1.1', 'high'],
      ['security.ipRules 2001:db8::/32', 'medium'],
    ]);
  });
});

describe('model calls go through one wrapper', async () => {
  const { aiProblems, modelUses } = await import('../../tools/workflow/lib/aicheck.mjs');
  it('finds model SDKs and model APIs in JavaScript, TypeScript and Python, and nothing else', () => {
    assert.deepEqual(modelUses('src/server/ai.ts', "import Anthropic from '@anthropic-ai/sdk';\nimport { z } from 'zod';"), ['@anthropic-ai/sdk']);
    assert.deepEqual(modelUses('src/x.ts', "const r = await fetch('https://api.openai.com/v1/responses');"), ['api.openai.com']);
    assert.deepEqual(modelUses('app/coach.py', 'from openai import OpenAI\n'), ['openai']);
    assert.deepEqual(modelUses('src/x.ts', "import { streamText } from 'ai';\nimport { openai } from '@ai-sdk/openai';"), ['ai', '@ai-sdk/openai']);
    assert.deepEqual(modelUses('src/x.ts', "import { aim } from 'aim';\nimport x from './openai-notes';"), []);
  });
  it('lets the wrapper call a model, fails every other file, and fails any use with no wrapper declared', () => {
    const code = new Map([['src/server/ai.ts', "import Anthropic from '@anthropic-ai/sdk';"], ['src/server/plan.ts', "import Anthropic from '@anthropic-ai/sdk';"]]);
    const p = aiProblems(code, 'src/server/ai.ts');
    assert.equal(p.length, 1);
    assert.match(p[0], /src\/server\/plan\.ts uses @anthropic-ai\/sdk directly: call the model only through src\/server\/ai\.ts/);
    assert.match(aiProblems(code, undefined)[0], /no "ai.wrapper" is set/);
    assert.deepEqual(aiProblems(new Map([['src/core/plan.ts', 'export const x = 1;']]), undefined), []);
  });
});
