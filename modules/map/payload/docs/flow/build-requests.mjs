// Makes docs/flow/requests.js from the request pages (docs/REQUESTS.md and docs/requests/*.md, or where `map.requests` in
// workflow/config.json says: { index, folder }), so the app map shows them as its first group. The words come from the index
// page: the group is its title up to the first comma, the kinds' section its "## The kinds ..." heading, the questions' intro
// its "The one rule:" line, and a section's map intro an "On the map: ..." line under its heading. The pages stay the one place
// to edit; run this after changing one:
//   node docs/flow/build-requests.mjs            (--check: fail when requests.js is not what the pages say now)
// No dependencies. It reads the two tables' shapes: the questions and the list of kinds in REQUESTS.md, and the
// "Someone asks | The app does | Status | Proof" table of each page.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');
let places = {};
try { places = JSON.parse(read('workflow/config.json')).map?.requests ?? {}; } catch { /* no config: the kit's places */ }
const indexAt = places.index ?? 'docs/REQUESTS.md';
const folderAt = (places.folder ?? 'docs/requests/').replace(/\/?$/, '/');
const STATUS = { built: undefined, decided: 'decided', 'being built': 'building', open: 'open' };
const unTick = (s) => s.replace(/`/g, '');

/** The cells of the rows of the first table after `heading` (or the first table when no heading is given). */
function tableRows(text, heading) {
  const from = heading ? text.indexOf(heading) : 0;
  if (from < 0) return [];
  const rows = [];
  let seen = false;
  for (const line of text.slice(from).split('\n')) {
    if (!line.startsWith('|')) { if (seen) break; continue; }
    seen = true;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^-+$/.test(c))) continue;
    rows.push(cells);
  }
  return rows.slice(1); // without the header row
}

/** A page's row as a question with one end. */
function rowNode([asks, does, status, proof = '']) {
  const end = { t: unTick(does) };
  const s = STATUS[status.toLowerCase()];
  if (s) end.s = s;
  else if (!(status.toLowerCase() in STATUS)) end.n = `Status on the page: ${status}.`;
  const cards = [...proof.matchAll(/#(\d+)/g)].map((m) => +m[1]);
  if (cards.length) end.card = cards;
  const test = /`([^`]+)`\s+in\s+`([^`]+)`(.*)$/.exec(proof);
  if (test) { end.f = test[2]; end.n = `Proof: "${test[1]}"${test[3] ? ' ' + unTick(test[3].trim()) : ''}`; }
  else if (/no test found/i.test(proof)) end.n = 'No test found.';
  else if (/no card/i.test(proof)) end.n = 'No card yet.';
  return { q: unTick(asks), opts: [['the app', [end]]] };
}

/** One page of docs/requests as a stage. */
function pageStage(file) {
  const text = read(`${folderAt}${file}`);
  const slug = file.replace(/\.md$/, '');
  const name = (/^# (.+)$/m.exec(text) ?? [, slug])[1];
  // the bullets under the title, wrapped lines joined
  const bullets = [];
  for (const line of text.split('\n').slice(1)) {
    if (line.startsWith('- ')) bullets.push(line.slice(2));
    else if (/^\s+\S/.test(line) && bullets.length) bullets[bullets.length - 1] += ' ' + line.trim();
    else if (line.startsWith('|') || line.startsWith('Status words')) break;
  }
  const lives = bullets.find((b) => b.startsWith('Lives today in'));
  const intro = bullets.filter((b) => b !== lives).map(unTick).join(' ');
  return {
    id: `k-${slug}`, kind: slug, name, basis: 'requests', intro: intro || 'What the app does when two answers or two kinds meet.',
    src: `${folderAt}${file}${lives ? ' · ' + unTick(lives.replace(/^Lives today in\s*/, '').replace(/\.$/, '')) : ''}`,
    tree: tableRows(text).map(rowNode),
  };
}

const index = read(indexAt);
const pages = existsSync(join(root, folderAt)) ? readdirSync(join(root, folderAt)).filter((f) => f.endsWith('.md') && f !== 'README.md').sort() : [];
const pageStages = pages.map(pageStage);
const hasPage = new Set(pageStages.map((s) => s.kind));

// the questions every request answers (the heading "## The … questions"): each with what happens when it is said, vague, or cannot be done
const heading = (/^## (The .*questions.*)$/m.exec(index) ?? [, 'The questions'])[1];
/** The "On the map: ..." line in the section under `title`, if the page has one. */
const mapIntro = (title) => {
  const at = index.indexOf(`## ${title}\n`);
  const section = at < 0 ? '' : index.slice(at).split(/\n## /)[0];
  return sentence(/^On the map: (.+)$/m.exec(section)?.[1]?.trim());
};
const sentence = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : null);
const oneRule = sentence(/^The one rule: (.+)$/m.exec(index)?.[1]?.trim());
const six = {
  id: 'six', name: heading, basis: 'requests', src: indexAt,
  intro: mapIntro(heading) ?? oneRule ?? 'What the person says beats what the kind assumes; a kind only fills in what was left out.',
  tree: tableRows(index, '## ' + heading).map(([q, said, vague, cannot]) => ({
    q: q.replace(/^\d+\.\s*/, ''),
    opts: [['said clearly', [{ t: unTick(said), s: 'none' }]], ['not said, or vague', [{ t: unTick(vague), s: 'none' }]], ['cannot be done', [{ t: unTick(cannot), s: 'none' }]]],
  })),
};

// the kinds of request, each with its page or "no page yet"; the section's name is the page's heading ("## The kinds" alone: the kit's words)
const kindsHeading = /^## (The kinds\b.*)$/m.exec(index)?.[1]?.trim() ?? 'The kinds';
const kindLines = [...index.matchAll(/^\d+\. (.+?) \(`([^`]+)`\): (.+?)\. (?:Page: `[^`]+`|No page yet)\.\s*$/gm)];
const kinds = {
  id: 'kinds', name: kindsHeading === 'The kinds' ? 'The kinds of request' : kindsHeading, basis: 'requests', src: `${indexAt} · ${folderAt}`,
  intro: mapIntro(kindsHeading) ?? 'One page per kind: what someone asks, what the app does, whether that is decided, and what proves it.',
  tree: kindLines.map(([, name, slug, trigger]) => ({
    t: `${name}: ${unTick(trigger)}.`, kind: slug,
    ...(hasPage.has(slug) ? { s: 'none' } : { s: 'unmapped', n: 'No page yet.' }),
  })),
};
const notKinds = /^Not kinds today: (.+)$/m.exec(index);
if (notKinds) kinds.tree.push({ t: `Not kinds today: ${notKinds[1].replace(/\s*\(#[^)]*\)/g, '').replace(/\.$/, '')}.`, s: 'gap', card: [...notKinds[1].matchAll(/#(\d+)/g)].map((m) => +m[1]) });

// a kind's own page first, the clashes last
const ordered = [...pageStages.filter((s) => s.kind !== 'clashes'), ...pageStages.filter((s) => s.kind === 'clashes')];
// the group's name: the index page's title up to its first comma ("What someone asks, and what the app does")
const title = /^# ([^,\n]+)/m.exec(index)?.[1]?.trim();
const group = { name: title && !/^requests$/i.test(title) ? title : 'What someone asks', basis: 'requests', stages: [six, kinds, ...ordered] };
const out = `// Made by docs/flow/build-requests.mjs from ${indexAt} and ${folderAt}. Do not edit: change the pages and run it again.\nwindow.FLOW_REQUESTS = ${JSON.stringify(group, null, 1)};\n`;
const file = join(here, 'requests.js');
if (process.argv.includes('--check')) {
  const now = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';
  if (now !== out) { console.error('docs/flow/requests.js is out of date: run node docs/flow/build-requests.mjs'); process.exit(1); }
  console.log('requests.js: up to date');
} else {
  writeFileSync(file, out);
  console.log(`requests.js: ${kindLines.length} kinds, ${pageStages.length} pages, ${ordered.reduce((n, s) => n + s.tree.length, 0)} rows`);
}
