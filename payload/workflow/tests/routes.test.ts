// What counts as a new server route (workflow/tools/lib/routes.mjs), and that the security advice and the "who is refused" advice
// both see the same routes.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addsRoute } from '../../workflow/tools/lib/routes.mjs';
import { securityAdvice } from '../../workflow/tools/lib/securityscan.mjs';
import { permissionAdvice } from '../../workflow/tools/lib/datacheck.mjs';

const diffOf = (file: string, ...lines: string[]) => `+++ b/${file}\n${lines.map((l) => `+${l}`).join('\n')}\n`;

describe('a new server route', () => {
  it('knows a framework route on any name (Hono, Express, Fastify), anywhere in the code', () => {
    assert.equal(addsRoute('src/api/goals.ts', ["app.post('/api/goals', async (c) => c.json(await save(c)));"]), true);
    assert.equal(addsRoute('src/routes.ts', ["goals.get('/:id', handler)"]), true);
    assert.equal(addsRoute('src/routes.ts', ['fastify.route({ method: "GET", url: "/x" })']), false, 'an options object names no path first');
  });
  it('knows a Next.js route handler, an API page and a server action', () => {
    assert.equal(addsRoute('src/app/api/goals/route.ts', ['export async function POST(request: Request) {']), true);
    assert.equal(addsRoute('src/app/api/goals/route.ts', ['export const GET = handler;']), true);
    assert.equal(addsRoute('src/pages/api/goals.ts', ['export default async function handler(req, res) {']), true);
    assert.equal(addsRoute('src/app/goals/actions.ts', ["'use server';"]), true);
  });
  it('knows the plain-Node shapes only in the server folder, and never in a comment', () => {
    assert.equal(addsRoute('src/server/app.ts', ["if (url.pathname === '/api/goals') {"]), true);
    assert.equal(addsRoute('src/web/link.ts', ["if (url.pathname === '/goals') {"]), false);
    assert.equal(addsRoute('src/api/goals.ts', ["// app.post('/api/goals', h)"]), false);
  });
});

describe('both advice lines see the same routes', () => {
  it('a Hono route outside the server folder gets the security advice and the "who is refused" advice', () => {
    const line = "app.post('/api/goals', save);";
    assert.equal(securityAdvice(diffOf('src/api/goals.ts', line)).length, 1);
    assert.equal(permissionAdvice(new Map([['src/api/goals.ts', [line]]]), { signIn: true }).length, 1);
  });
  it('a Next.js POST handler gets both', () => {
    const line = 'export async function POST(request: Request) {';
    assert.match(securityAdvice(diffOf('src/app/api/goals/route.ts', line))[0] ?? '', /a server route/);
    assert.equal(permissionAdvice(new Map([['src/app/api/goals/route.ts', [line]]]), { signIn: true }).length, 1);
  });
});

describe('a test quiets the advice only for the file it is about', () => {
  it('one refusal test for goals does not quiet the hostile-input advice for plans', async () => {
    const { hostileAdvice } = await import('../../workflow/tools/lib/hostilecheck.mjs');
    const diff = diffOf('src/server/goals.ts', 'const g = JSON.parse(text);') + diffOf('src/server/plans.ts', 'const p = JSON.parse(text);')
      + diffOf('tests/server/goals.test.ts', "it('refuses a goal over 1 KB', () => {");
    assert.deepEqual(hostileAdvice(diff), ['advice: src/server/plans.ts reads input but no new test says what it refuses']);
  });
  it('a test that imports the file speaks for it, whatever its own name', async () => {
    const { hostileAdvice } = await import('../../workflow/tools/lib/hostilecheck.mjs');
    const diff = diffOf('src/server/plans.ts', 'const p = JSON.parse(text);')
      + diffOf('tests/server/limits.test.ts', "import { readPlan } from '../../src/server/plans';", "it('refuses a plan over 1 KB', () => {");
    assert.deepEqual(hostileAdvice(diff), []);
  });
  it('the same for the "who is refused" advice', () => {
    const added = new Map([
      ['src/server/goals.ts', ["app.get('/api/goals', list);"]],
      ['src/server/plans.ts', ["app.get('/api/plans', list);"]],
      ['tests/server/goals.test.ts', ["it('answers 401 when signed out', async () => {"]],
    ]);
    assert.deepEqual(permissionAdvice(added, { signIn: true }).map((l) => l.split(' ')[1]), ['src/server/plans.ts']);
  });
});
