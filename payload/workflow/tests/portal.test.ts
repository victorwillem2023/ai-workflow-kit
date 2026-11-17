// The docs portal (workflow/tools/portal.mjs, lib/portal.mjs): the kit's doc style as HTML, links between docs that work, the
// menu as the docs index groups it; and the server: a page per doc, only files git knows, and a stop.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { about, glanceHtml, inline, linkTo, markdown, menu, titleOf } from '../../workflow/tools/lib/portal.mjs';
import { PORTS } from './session-repo';

const known = new Set(['docs/PRODUCT.md', 'docs/run/LAUNCH.md', 'README.md']);

describe('the portal\'s pages', () => {
  it('turns the kit\'s doc style into HTML: headings, lists in lists, tables, code, quotes; comments left out', () => {
    const html = markdown(['# Title', '<!-- kit:x -->', 'One *line* and **bold**.', '', '- a', '  - inner', '- b', '', '| A | B |', '|---|---|', '| 1 | `x` |',
      '', '```sh', 'npm run gate  # <not html>', '```', '', '> a quote'].join('\n'));
    assert.match(html, /<h1 id="title">Title<\/h1>/);
    assert.doesNotMatch(html, /kit:x/);
    assert.match(html, /<p>One <em>line<\/em> and <strong>bold<\/strong>\.<\/p>/);
    assert.match(html, /<ul><li>a<ul><li>inner<\/li><\/ul><\/li><li>b<\/li><\/ul>/);
    assert.match(html, /<th>A<\/th><th>B<\/th>[\s\S]*<td><code>x<\/code><\/td>/);
    assert.match(html, /<pre><code class="lang-sh">npm run gate {2}# &lt;not html&gt;<\/code><\/pre>/);
    assert.match(html, /<blockquote><p>a quote<\/p><\/blockquote>/);
  });
  it('a link to another doc opens it in the portal, a project file is served, the web opens in a new tab, outside the project is text', () => {
    assert.equal(linkTo('run/LAUNCH.md#steps', 'docs/PRODUCT.md', known), '/doc/docs/run/LAUNCH.md#steps');
    assert.equal(linkTo('../src/web/icon.svg', 'docs/GUIDE.md', known), '/file/src/web/icon.svg');
    assert.equal(linkTo('../../elsewhere.md', 'docs/GUIDE.md', known), null);
    assert.match(inline('[site](https://example.com) and [out](../../x.md)', 'docs/GUIDE.md', known), /<a href="https:\/\/example\.com" target="_blank" rel="noopener">site<\/a> and out/);
    assert.match(inline('see `docs/run/LAUNCH.md` and `run/LAUNCH.md`', '', known), /<a href="\/doc\/docs\/run\/LAUNCH\.md"><code>docs\/run\/LAUNCH\.md<\/code><\/a> and <a href="\/doc\/docs\/run\/LAUNCH\.md">/);
    assert.equal(inline('<script>x</script>'), '&lt;script&gt;x&lt;/script&gt;', 'text is escaped');
  });
  it('a doc\'s title is its heading outside a code block, and its one line leaves raw HTML out', () => {
    assert.equal(titleOf('README.md', '```sh\n# a shell comment\n```\n# Trailsmith\n'), 'Trailsmith');
    assert.equal(titleOf('docs/x.md', 'no heading'), 'x');
    assert.equal(about('<p align="center"><img src="i.svg"></p>\n\n# Guide\n\nEverything in detail. More.'), 'Everything in detail');
  });
  it('the menu: start here, the product, the subjects, the other folders, then the kit\'s guides, each doc marked when it is the kit\'s', () => {
    const docs = ['README.md', 'docs/PRODUCT.md', 'docs/MAP.md', 'docs/run/LAUNCH.md', 'docs/decisions/a.md', 'workflow/guides/WORKFLOW.md'].map((path) => ({ path, text: `# ${path}\n\nIt is ${path}.` }));
    const m = menu(docs, new Set(['docs/run/LAUNCH.md']));
    assert.deepEqual(m.map((s) => s.title), ['Start here', 'The product and how it is built', 'Running it', 'Decisions', 'How we work with the AI (the kit\'s guides)']);
    assert.deepEqual(m[1].items.map((i) => i.label), ['PRODUCT'], 'the file map is under its own link, not in the list');
    assert.equal(m[2].items[0].kit, true);
  });
  it('at a glance: what the tools said, and a quiet line when the board cannot be reached', () => {
    const html = glanceHtml({ phase: ['phase: prototype (nothing outside depends on it yet)'], board: null, boardNote: 'The board could not be reached.', decisions: [], recent: [] });
    assert.match(html, /phase: prototype/);
    assert.match(html, /The board could not be reached\./);
    assert.match(html, /None yet\./);
  });
});

const free = (port: number) => new Promise<boolean>((ok) => { const s = createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true))); s.listen(port, '127.0.0.1'); });

describe('the portal\'s server', () => {
  it('serves the glance and the docs, never a file git does not know, and stops when asked', async () => {
    let port = 8780 + PORTS;
    while (!(await free(port))) port++;
    const server = spawn(process.execPath, ['workflow/tools/portal.mjs', '--serve', '--port', String(port)], { stdio: 'ignore' });
    const url = `http://127.0.0.1:${port}`;
    try {
      for (let i = 0; i < 100; i++) { try { await fetch(`${url}/__portal`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
      const home = await fetch(url);
      assert.equal(home.status, 200);
      assert.match(await home.text(), /At a glance/);
      const doc = await fetch(`${url}/doc/workflow/guides/WORKFLOW.md`);
      assert.equal(doc.status, 200, 'a kit guide is a page');
      assert.equal((await fetch(`${url}/file/.env`)).status, 404, '.env is ignored by git, so never served');
      assert.equal((await fetch(`${url}/file/..%2F..%2Fx`)).status, 404);
      assert.equal((await fetch(`${url}/doc/nothing.md`)).status, 404);
      assert.ok(Array.isArray(await (await fetch(`${url}/search.json`)).json()));
      await fetch(`${url}/__portal/stop`);
      await new Promise((r) => server.once('exit', r));
    } finally { server.kill(); }
  });
});
