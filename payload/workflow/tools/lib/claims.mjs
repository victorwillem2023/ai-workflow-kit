// Which files each session folder is changing, and where two of them meet (no I/O here; lib/sessionclaims.mjs reads git and the
// specs). session.mjs refuses a new session on files a running one holds, the gate says it while building, the board's plan for
// today counts with it, and --beside tells a builder what the sessions next to it decide. A session's claim: the files its spec
// names, its cards' "Touches" lines (before there is a spec or a change), and every file it really changed against main. What has
// a rule of its own for a clash is never claimed: the files every feature touches (CLAUDE.md's *Shared files*: each edits only
// its own lines), the pages a script writes again, the sign-off rows, the lock files and the waiting specs.
import { specPaths } from './scope.mjs';
import { matchesAny } from './glob.mjs';

/** Whether a written path looks like a file or a folder: a "/" in it, or a name with a file's ending (`package.json`), never a code name (`board.wip`). */
const FILE_END = /\.(?:[cm]?[jt]sx?|json[c5]?|md|ya?ml|toml|lock|txt|css|s[ac]ss|html?|svg|sql|py|rs|go|java|kt|rb|php|sh|ps1|cmd|env|ini|xml|csv)$/i;
// a path's characters: also the ones route files use (`+page.svelte`, `[slug]`, `(shop)`, `$id.tsx`, `@scope`)
// (and letters of any language: src/données/carte.ts)
const SEG = String.raw`[\p{L}\p{N}_.\-+$@()\[\]]`;
const PATH = new RegExp(`^${SEG}+(?:/${SEG}*)*$`, 'u');
export const looksLikeFile = (p) => PATH.test(p) && (p.includes('/') || FILE_END.test(p));
/** Whether the brackets in `s` close in order ("app/(shop)/x" yes, "a)/(b" no). */
function balanced(s, o, c) {
  let depth = 0;
  for (const ch of s) { if (ch === o) depth++; else if (ch === c && --depth < 0) return false; }
  return depth === 0;
}
/** A path written in a sentence, without the sentence's punctuation around it ("(src/a.ts)," is src/a.ts). */
function unwrap(t) {
  // a path in backticks or quotes, as cards write them (`src/a.ts`, "src/a.ts", `config.json`'s): only around it, never inside
  let p = t.replace(/`/g, '').replace(/[.,;:!?]+$/, '').replace(/['’]s$/, '').replace(/^['"“‘]+|['"”’]+$/g, '');
  for (const [o, c] of [['(', ')'], ['[', ']']]) {
    if (p.startsWith(o) && !p.includes(c)) p = p.slice(1);
    if (p.endsWith(c) && !p.includes(o)) p = p.slice(0, -1);
    if (p.startsWith(o) && p.endsWith(c) && balanced(p.slice(1, -1), o, c)) p = p.slice(1, -1);
  }
  return p.replace(/[.,;:!?]+$/, '');
}

/** The paths a card's "Touches" line names, as written (files or folders): "Touches: src/web/a.ts, src/core/, package.json". */
export function touchedPaths(body) {
  const line = /^[^\w\n]*touches[^\w\n]*[:.][ \t]*(.+)$/im.exec(String(body ?? ''))?.[1] ?? '';
  return [...new Set(line.split(/[\s,]+/).map(unwrap).filter(looksLikeFile))];
}

/** A card's text with its "Touches" line set to `paths` (the line replaced where there is one, else added at the end). */
export function setTouches(body, paths) {
  const text = String(body ?? '');
  const line = `Touches: ${paths.join(', ')}`;
  // [^\w\n] and not \W: \W would swallow the blank line above the existing line
  const existing = /^[^\w\n]*touches[^\w\n]*[:.].*$/im;
  return existing.test(text) ? text.replace(existing, () => line) : `${text.replace(/\s*$/, '')}\n\n${line}\n`;
}

/**
 * One session's claim, sorted: the spec's paths, the "Touches" paths and the changed files, without the ones never claimed.
 * `resolve`: turns a path as written into the project's paths (a spec's short `climb/route-up.ts` is
 * `src/pipeline/climb/route-up.ts`; resolverFor in lib/sessionclaims.mjs); the changed files are real paths already.
 */
export function claimOf({ spec = '', touches = [], changed = [] } = {}, never = [], resolve = (p) => [p]) {
  const written = [...specFiles(spec), ...touches].flatMap(resolve);
  return [...new Set([...written, ...changed])].filter((p) => p && !neverClaimed(p, never)).sort();
}

/**
 * The project's path for one written the short way (`climb/route-up.ts` for src/pipeline/climb/route-up.ts), from the files git
 * knows (`tracked`). Only a path with a "/" that does not start at the project's top (a folder there, or a usual one: src/,
 * tests/, apps/ ...) is short: every file whose path ends in it. Anything else is as written: a bare name (`run.ts` says not
 * which), a whole path, a folder, a new file.
 */
const TOPS = ['src', 'tests', 'test', 'app', 'apps', 'packages', 'lib', 'docs', 'workflow', 'scripts', 'config', 'public'];
export function resolvePath(p, tracked) {
  if (p.endsWith('/') || tracked.has(p) || !p.includes('/')) return [p];
  const first = p.split('/')[0];
  if (TOPS.includes(first) || [...tracked].some((f) => f.startsWith(`${first}/`))) return [p];
  const fits = [...tracked].filter((f) => f.endsWith(`/${p}`));
  return fits.length ? fits : [p];
}

/**
 * The paths a spec says it changes: its "Files that change" and "Tests" sections (the rest of a spec also names files it only
 * reads; its docs are edited line by line, like the shared files). A spec without those headings: every path it names. Only
 * files (looksLikeFile, with an ending): a folder a spec names in passing ("for `src/core` a change needs a test") is no claim;
 * a card's Touches line may claim a folder on purpose.
 */
export function specFiles(spec) {
  const text = String(spec ?? '');
  const parts = ['Files that change', 'Tests'].map((h) => specSection(text, h, Infinity)).filter(Boolean);
  return specPaths(parts.length ? parts.join('\n') : text).filter((p) => looksLikeFile(p) && /\.[^./]+$/.test(p.split('/').pop()));
}

/**
 * The files with a rule of their own for a clash (globs): the gate's scope guard leaves the same ones out. A claim also leaves
 * out what each change edits line by line (`DOCS`): the docs, and the app map's data, where each change writes its own entries.
 */
export const DOCS = ['**/*.md', 'docs/flow/map.js'];
export function settledFiles(config = {}) {
  return ['workflow/specs/**', config.map?.out ?? 'docs/MAP.md', 'docs/README.md', config.map?.infraOut ?? 'docs/run/INFRA-MAP.md', config.baseline,
    '.opencode/**', 'docs/company/SIGNOFFS.md',
    // the lock files, also a package's own in a monorepo (apps/web/package-lock.json)
    ...['package-lock.json', 'Cargo.lock', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'uv.lock', 'poetry.lock', 'Pipfile.lock', 'go.sum', 'Gemfile.lock', 'composer.lock'].map((f) => `**/${f}`)].filter(Boolean);
}

/** The shared files CLAUDE.md names on its "Shared files" line (backticked; a folder ends in "/"), as globs. */
export function sharedFiles(claudeMd) {
  const lines = String(claudeMd ?? '').split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s*-\s*\**shared files\**/i.test(l));
  if (at < 0) return [];
  // the whole bullet: its first line and the indented lines that carry it on
  let end = at + 1;
  while (end < lines.length && /^\s+\S/.test(lines[end]) && !/^\s*[-*]\s/.test(lines[end])) end++;
  return specPaths(lines.slice(at, end).join(' ')).map((p) => (p.endsWith('/') ? `${p}**` : p));
}

const isFolder = (p) => p.endsWith('/') || !/\.[^/]+$/.test(p.split('/').pop());
const inside = (file, folder) => file.startsWith(folder.replace(/\/$/, '') + '/');
function neverClaimed(p, never) {
  if (matchesAny(p, never)) return true;
  // a folder is never claimed whole when it is itself shared (`docs/guide/` against "docs/guide/**")
  return isFolder(p) && never.some((g) => g.endsWith('/**') && (p.replace(/\/$/, '') === g.slice(0, -3) || inside(p, g.slice(0, -3))));
}

/** Where two claims meet: the same file, or a file inside a folder the other claims (the more exact path is said). */
export function meet(a, b) {
  const out = new Set();
  for (const x of a) for (const y of b) {
    if (x === y || x.replace(/\/$/, '') === y.replace(/\/$/, '')) out.add(x);
    else if (isFolder(x) && inside(y, x)) out.add(y);
    else if (isFolder(y) && inside(x, y)) out.add(x);
  }
  return [...out].sort();
}

/**
 * The running sessions a claim meets: [{ topic, cards, dir, files }] (`files`: where they meet), in topic order. `others`: the
 * sessions' claims ([{ topic, cards, dir, files }]); `skip`: topics that may share files (the session it is stacked on).
 */
export function clashes(mine, others, { skip = [] } = {}) {
  return others.filter((o) => !skip.includes(o.topic)).map((o) => ({ ...o, files: meet(mine, o.files) })).filter((o) => o.files.length)
    .sort((x, y) => x.topic.localeCompare(y.topic));
}

/**
 * The sessions a topic is built with, which may share files with it: every one it sits on (its `on`, that one's `on`, ...) and
 * every one sitting on it, at any depth. `all`: [{ topic, on }]; `on`: its base when it has no claim of its own yet (a new one).
 */
export function stackOf(topic, all, on = all.find((s) => s.topic === topic)?.on) {
  const below = new Set();
  for (let b = on; b && !below.has(b); b = all.find((s) => s.topic === b)?.on) below.add(b);
  const above = new Set();
  for (let grew = true; grew;) { grew = false; for (const s of all) if (s.on && (s.on === topic || above.has(s.on)) && !above.has(s.topic) && s.topic !== topic) { above.add(s.topic); grew = true; } }
  return [...below, ...above];
}

const tags = (cards) => (cards?.length ? cards.map((n) => `#${n}`).join(', ') : 'no card');
const some = (files, n = 4) => `${files.slice(0, n).join(', ')}${files.length > n ? ` and ${files.length - n} more` : ''}`;

/**
 * Why a new session does not start, and the ways on: on top of the other one, one session for both, or wait. `stack`: false
 * with pull requests (`session.flow: "pr"`), where a session starts from main once the other one is merged.
 */
export function clashMessage(topic, card, found, { stack = true } = {}) {
  const one = found.length === 1 ? found[0] : null;
  const cardArg = card ? ` --card ${card}` : '';
  return [`"${topic}" would change files ${found.length === 1 ? 'another session is' : 'other sessions are'} changing:`,
    ...found.map((o) => `  ${tags(o.cards)} (session "${o.topic}"): ${some(o.files)}`),
    `Side by side, ${one ? 'the two' : 'they'} would change the same lines and one would undo another's work. One of:`,
    ...(stack ? [`  - on top of it, once it is built: node workflow/scripts/session.mjs ${topic}${cardArg} --on ${one ? one.topic : '<its topic>'}`] : []),
    `  - one session for both cards: combine them (.claude/skills/work/together.md)`,
    `  - wait until ${one ? `"${one.topic}" is` : 'they are'} ${stack ? 'finished' : 'merged'}, and start something else meanwhile (npm run board -- --today)`,
    'The owner may start it all the same: the same command with --anyway.'].join('\n');
}

/** For the gate: one advice line per running session whose files this change also changes. */
export function clashAdvice(found) {
  return found.map((o) => `advice: ${some(o.files, 3)} ${o.files.length === 1 ? 'is' : 'are'} also changed in session "${o.topic}" (${tags(o.cards)}): settle now who changes ${o.files.length === 1 ? 'it' : 'them'} (one of you, or one on top of the other), before both are built (node workflow/scripts/session.mjs --beside)`);
}

/** The section of a spec under one heading ("## The rule and who shares it"), trimmed to `max` characters. */
export function specSection(spec, heading, max = 900) {
  const text = String(spec ?? '');
  const at = text.search(new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'im'));
  if (at < 0) return '';
  const body = text.slice(at).split(/\r?\n/).slice(1);
  const end = body.findIndex((l) => /^##\s/.test(l));
  const s = (end < 0 ? body : body.slice(0, end)).join('\n').replace(/<!--[\s\S]*?-->/g, '').trim();
  return s.length > max ? `${s.slice(0, max).replace(/\s+\S*$/, '')} ...` : s;
}

/**
 * What the sessions beside one are doing, for its builder (--beside): each session it shares files with, the files, and its
 * spec's rule (what it decides there), so the two build on the same rules. `found`: clashes() with `spec` on each.
 */
export function besideNote(topic, found) {
  if (!found.length) return `beside "${topic}": no running session changes the files it changes (its spec, its cards' Touches lines, its changes so far).`;
  return [`beside "${topic}": ${found.length} running session${found.length === 1 ? ' changes' : 's change'} files it changes too. Build on the same rules as ${found.length === 1 ? 'it' : 'they'}; a rule you would decide otherwise is a question for the owner, never a silent second version.`,
    ...found.flatMap((o) => {
      const rule = specSection(o.spec, 'The rule and who shares it') || specSection(o.spec, 'What the user sees');
      return ['', `${tags(o.cards)}, session "${o.topic}": shares ${some(o.files, 6)}`, rule ? rule.split('\n').map((l) => `  ${l}`).join('\n') : '  (no spec: ask its chat, or the owner, what it decides there)'];
    })].join('\n');
}
