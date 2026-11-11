// The file map: one line per source file (its opening comment's first sentence and the project files it
// imports), so a session can find a file without opening it. Pure: the graph comes in, markdown goes out.
import { posix } from 'node:path';

const SHEBANG = /^#!.*\n/;

export function summaryOf(text) {
  const t = text.replace(/^\uFEFF/, '').replace(SHEBANG, '').trimStart();
  let body = '';
  if (t.startsWith('//')) {
    body = t.split('\n').filter((_, i, a) => a.slice(0, i + 1).every((l) => l.trimStart().startsWith('//')))
      .map((l) => l.trimStart().replace(/^\/\/+\s?/, '').trim()).join(' ');
  } else if (t.startsWith('/*')) {
    const end = t.indexOf('*/');
    body = t.slice(2, end < 0 ? 300 : end).split('\n').map((l) => l.replace(/^\s*\*+\s?/, '').trim()).join(' ');
  }
  body = body.replace(/[=\-*_#~]{4,}/g, ' ').replace(/\s+/g, ' ').trim();
  if (!body) return '(no opening comment)';
  const m = body.match(/^(.*?[.!?])(?:\s|$)/);
  const first = m ? m[1] : body;
  return first.length > 150 ? first.slice(0, 147).trimEnd() + '...' : first;
}

// Short name of an imported file: same folder -> `b`, elsewhere -> `core/b` (path from src/ or the root).
function short(from, to) {
  const strip = (p) => p.replace(/\.(?:ts|tsx|mjs|js)$/, '').replace(/\/index$/, '');
  if (posix.dirname(from) === posix.dirname(to)) return strip(posix.basename(to));
  return strip(to.replace(/^src\//, ''));
}

// include: globs-as-prefixes are handled by the caller; here `folders` are `dir/**` style globs that pick files.
export function renderMap(graph, folders) {
  const prefixes = folders.map((g) => g.replace(/\/\*\*$/, ''));
  const byDir = new Map();
  for (const file of [...graph.files.keys()].sort()) {
    if (!prefixes.some((p) => file === p || file.startsWith(p + '/'))) continue;
    const dir = posix.dirname(file);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(file);
  }
  const out = [];
  for (const [dir, list] of byDir) {
    out.push(`## ${dir}`);
    for (const f of list) {
      const deps = [...new Set(graph.imports.get(f) ?? [])].map((t) => short(f, t)).sort();
      out.push(`- \`${posix.basename(f)}\`: ${summaryOf(graph.files.get(f))}${deps.length ? ' → ' + deps.join(', ') : ''}`);
    }
    out.push('');
  }
  return out.join('\n');
}

// Is the map on disk the one the code would write now? Line endings don't count (git may turn LF into CRLF).
export function sameMap(onDisk, fresh) {
  return (onDisk ?? '').replace(/\r\n/g, '\n') === fresh.replace(/\r\n/g, '\n');
}

// The description of a map line is the text before its last " → "; the imports are the names after it.
function splitLine(line) {
  const at = line.lastIndexOf(' → ');
  return at < 0 ? { desc: line, deps: [] } : { desc: line.slice(0, at), deps: line.slice(at + 3).split(', ').map((d) => d.trim()) };
}

// Collect the file lines that pass `keep`, each group under its `## folder` heading. `max` is the most lines
// printed in all, headings and the closing "(+N more)" note included: when matches are left out, the last
// line is kept free for that note. `more` counts the matches left out.
function collect(text, keep, max) {
  const groups = [];
  let heading = '';
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('## ')) { heading = line; continue; }
    if (!line.startsWith('- ') || !keep(splitLine(line))) continue;
    const last = groups[groups.length - 1];
    if (last && last.heading === heading) last.items.push(line); else groups.push({ heading, items: [line] });
  }
  const total = groups.reduce((n, g) => n + 1 + g.items.length, 0);
  const budget = total <= max ? max : max - 1;
  const lines = [];
  let more = 0;
  for (const g of groups) {
    for (const [k, item] of g.items.entries()) {
      const need = k === 0 ? 2 : 1;
      if (more === 0 && lines.length + need <= budget) { if (k === 0) lines.push(g.heading); lines.push(item); } else more++;
    }
  }
  return { lines, more };
}

// The map lines whose description (before the arrow) has every word, any case.
export function findInMap(text, words, max) {
  const want = words.map((w) => w.toLowerCase());
  return collect(text, ({ desc }) => want.every((w) => desc.toLowerCase().includes(w)), max);
}

// The map lines whose imports name `file` exactly (e.g. `config/vibes`, `core/types`, or `b` in the same folder).
export function usesInMap(text, file, max) {
  return collect(text, ({ deps }) => deps.includes(file), max);
}
