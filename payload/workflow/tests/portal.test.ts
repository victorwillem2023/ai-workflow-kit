// The docs portal (workflow/tools/portal.mjs, lib/portal.mjs): the kit's doc style as HTML, links between docs that work, the
// menu as the docs index groups it; and the server: a page per doc, only files git knows, and a stop.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { about, docBody, inline, linkTo, markdown, menu, titleOf } from '../../workflow/tools/lib/portal.mjs';
import { glanceHtml, rich } from '../../workflow/tools/lib/portalglance.mjs';
import { themeCss, themeFrom } from '../../workflow/tools/lib/portaltheme.mjs';
import { boardView } from '../../workflow/tools/lib/boardview.mjs';
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
    assert.match(html, /<th class="short">A<\/th><th class="short">B<\/th>[\s\S]*<td class="short"><code>x<\/code><\/td>/);
    assert.match(html, /<pre><code class="lang-sh">npm run gate {2}<span class="cm"># &lt;not html&gt;<\/span><\/code><\/pre>/);
    assert.match(html, /<blockquote><p>a quote<\/p><\/blockquote>/);
  });
  it('reads a doc as it is: CRLF line endings, and a code fence it never closes ends at the next blank line, not the end of the file', () => {
    const crlf = ['## Commands', '```sh', 'npm test   # all tests', 'npm run gate', 'Prose right after the block.', '', '## Next part', 'Text.'].join('\r\n');
    const html = markdown(crlf);
    assert.equal((html.match(/<h2/g) ?? []).length, 2, 'the heading after the block is a heading');
    assert.match(html, /<pre><code class="lang-sh">npm test {3}<span class="cm"># all tests<\/span>\nnpm run gate\nProse right after the block\.<\/code><\/pre>/);
    assert.doesNotMatch(html, /\r/);
    assert.match(markdown('```\r\na\r\n```\r\n\r\nafter'), /<pre><code>a<\/code><\/pre>\n<p>after<\/p>/, 'a closed fence in a CRLF file closes');
  });
  it('a centred picture keeps to the text column, a list of only links is marked, and a long doc gets "On this page"', () => {
    assert.equal(markdown('<p align="center"><img src="logo.svg"></p>', { from: 'docs/GUIDE.md' }), '<p><img src="/file/docs/logo.svg"></p>');
    assert.match(markdown('- [Setting up](setup.md)\n- [Bike](bike.md)\n- a [link](x.md) in a sentence'), /<li class="link">[\s\S]*<li class="link">[\s\S]*<li>a /);
    assert.match(docBody(markdown('## One\n\n## Two\n\n## Three')), /<aside class="toc" aria-label="On this page">[\s\S]*<a href="#one">One<\/a><a href="#two">Two<\/a><a href="#three">Three<\/a>/);
    assert.doesNotMatch(docBody(markdown('## One\n\n## Two')), /toc/, 'a short doc has none');
  });
  it('a table keeps its short columns from wrapping, so the text columns get the width', () => {
    const html = markdown(['| Ask | Status | Proof |', '|---|---|---|', '| a long question someone asks | built | a test name that runs long |'].join('\n'));
    assert.match(html, /<th>Ask<\/th><th class="short">Status<\/th><th>Proof<\/th>/);
    assert.match(html, /<td class="short">built<\/td>/);
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
    assert.deepEqual(m[1].items.map((i) => i.path), ['docs/PRODUCT.md'], 'the file map is under its own link, not in the list');
    // each doc by its title, the project's name taken off its front; the file is the tooltip
    const named = menu([{ path: 'docs/PRODUCT.md', text: '# Trailsmith: the product\n' }, { path: 'docs/STACK.md', text: '# How Trailsmith is built\n' }], new Set(), 'trailsmith');
    assert.deepEqual(named[0].items.map((i) => [i.label, i.what]), [['How Trailsmith is built', 'docs/STACK.md'], ['The product', 'docs/PRODUCT.md']]);
    assert.equal(m[2].items[0].kit, true);
  });
});

const card = (number: number, labels: string[], score: number) => ({ number, title: `Card ${number}`, column: 'Backlog', labels, score });

describe('at a glance', () => {
  const board = boardView({
    ranked: [card(1, ['bug', 'value: medium', 'effort: small'], 2.5), card(2, ['bug', 'value: medium', 'effort: small'], 2.5), card(3, ['feature'], 2)],
    tie: [card(1, ['bug', 'value: medium', 'effort: small'], 2.5), card(2, ['bug', 'value: medium', 'effort: small'], 2.5)],
    waiting: [{ number: 4, title: 'Card 4', waitsFor: [3] }], inboxCount: 0,
    triage: { findings: [{ kind: 'too-much-started', what: '3 cards in progress (the limit is 2)', suggest: 'finish one first', cards: [{ number: 9 }] }], counts: { open: 4, doing: 3, inbox: 0, backlog: 3 } },
    repo: 'o/app',
  });
  it('the board as fields: the tie apart from the next cards, each with its labels, a link and the counts', () => {
    assert.deepEqual(board.tie.map((c) => [c.number, c.value, c.effort, c.type]), [[1, 'medium', 'small', 'bug'], [2, 'medium', 'small', 'bug']]);
    assert.deepEqual(board.next.map((c) => c.number), [3]);
    assert.equal(board.next[0].url, 'https://github.com/o/app/issues/3');
    assert.deepEqual([board.unranked, board.decisions[0].kind, board.waiting[0].waitsFor], [1, 'too-much-started', [3]]);
  });
  const g = { project: 'App', repo: 'o/app', styled: true, shipped: 2, stage: ['3 changes shipped this week and no retro yet: /retro (about 10 minutes).'],
    phase: { phase: 'prototype', status: 'phase: prototype (nothing outside depends on it yet)', next: 'pilot', needs: [{ what: 'errors you get to see', done: false }, { what: 'the security page', done: true }] },
    board, boardAge: 'fresh', asked: '19:01', decisions: [], recent: [] };
  it('a tie is a question, the next cards have their columns, the next phase is a numbered list with how far along', () => {
    const html = glanceHtml(g);
    assert.match(html, /#1 and #2 score the same\. Which comes first\?/);
    assert.match(html, /<div class="col">Medium<\/div><div class="col">Small<\/div>/);
    assert.match(html, /Before the pilot phase<\/h2>[\s\S]*1 of 2 done/);
    assert.match(html, /Tidy the board · \/tidy/, 'the one primary button, when the board needs decisions');
    assert.match(html, /No retro yet/);
  });
  it('quiet parts are left out: no tie, no decisions, no warnings, no lists without entries', () => {
    const calm = boardView({ ranked: [card(3, ['feature', 'value: high'], 3)], tie: [], waiting: [], triage: { findings: [], counts: {} } });
    const html = glanceHtml({ ...g, board: calm, stage: [], decisions: [], recent: [] });
    assert.doesNotMatch(html, /Question|Tidy the board|class="warn"|Latest decisions|Worth doing now/);
  });
  it('commands are chips that copy, card numbers link to the card; an old or failed board says so; no style sheet says how to make one', () => {
    assert.match(rich('then /advise roadmap and npm run board -- --graph', 'o/app'), /data-copy="\/advise roadmap"[\s\S]*data-copy="npm run board -- --graph"/);
    assert.match(rich('#12 waits', 'o/app'), /<a class="num" href="https:\/\/github\.com\/o\/app\/issues\/12"/);
    assert.match(glanceHtml({ ...g, boardAge: 'old' }), /older than a quarter of an hour/);
    assert.match(glanceHtml({ ...g, styled: false }), /no style sheet yet[\s\S]*\/ui/);
  });
});

describe('the look: the project\'s own style sheet', () => {
  const sheet = ['# App UI style', '', '## Colour (6 tokens, light and dark)', '', '| Token | Light | Dark | Use |', '|---|---|---|---|',
    '| `--paper` | #eef2ee | #0e1613 | App background |', '| `--card` | #ffffff | #141e1a | Panels, cards |', '| `--ink` | #10261f | #e4ebe7 | Text |',
    '| `--sign` | #f2c230 | #f2c230 | The one thing to do next |', '| `--sign-ink` | #10261f | #10261f | Text on yellow |', '| `--route-2` | #2457c5 | #6e9cff | Route 2, links, focus ring |',
    '', '## Type (3 sizes, 2 voices)', '', 'Archivo. Condensed voice = `font-stretch: 74%`.', '', '| Name | Size | Voice | Use |', '|---|---|---|---|',
    '| display | 44 | condensed 800 | Headline |', '| title | 20 | condensed 700 | Titles |', '| body | 16 | normal 400 | Text |', '| caption | 12 | normal 500 | Hints |',
    '', '## Shape, space, depth', '', '- Radius: **8** (buttons), **14** (cards), **pill** (chips).'].join('\n');
  it('finds each role by what its "Use" says, whatever the token is called; the font, the sizes and the radii too', () => {
    const th = themeFrom(sheet);
    assert.equal(th.found, true);
    assert.deepEqual([th.light.bg, th.light.surface, th.light.text, th.light.primary, th.light.onPrimary, th.dark.link], ['#eef2ee', '#ffffff', '#10261f', '#f2c230', '#10261f', '#6e9cff']);
    assert.deepEqual([th.family, th.stretch, th.sizes, th.radii], ['Archivo', '74%', [44, 20, 16, 12], [8, 14]]);
    assert.ok(th.missing.includes('warn'), 'a role the sheet has no token for takes the plain one, and is named');
    // light by default whatever the computer's setting; dark only on the switch
    assert.match(themeCss(th), /^:root\{--p-bg:#eef2ee[\s\S]*:root\[data-theme=dark\]\{--p-bg:#0e1613/);
    assert.doesNotMatch(themeCss(th), /prefers-color-scheme/);
  });
  it('no style sheet, or the kit\'s empty skeleton: the plain look, never a brand', () => {
    assert.equal(themeFrom('').found, false);
    assert.equal(themeFrom('# X\n\n## Colour (N tokens, light and dark)\nA table: token name, light value, dark value.\n').found, false);
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
