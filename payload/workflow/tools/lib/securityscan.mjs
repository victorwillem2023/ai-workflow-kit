// Security-trigger scan: reads the added lines of a diff and names the files whose new code opens a server
// route, reads an uploaded or fetched file, or makes an outbound fetch. Advice only; the gate never fails on it.
// Which files: a route anywhere in the code, in any language the route pattern knows (lib/routes.mjs: a Next.js app without
// src/, a FastAPI or Go server); a fetch or a file read in the code folders (`security.code`: src/ and Next.js's app/, pages/).
import { addsRoute, CLIENT_FOLDERS } from './routes.mjs';

const DEFAULTS = { code: ['src/', 'app/', 'pages/', 'server/', 'lib/'], server: 'src/server/' };
const JS = /\.(?:[mc]?[jt]s|[jt]sx|vue|svelte)$/;
const ANY_CODE = /\.(?:[mc]?[jt]s|[jt]sx|vue|svelte|py|go|rs)$/;
const TESTS = /(?:^|\/)(?:tests?|__tests__|e2e)\/|\.(?:test|spec)\.|_test\.(?:go|py)$|(?:^|\/)test_[^/]+\.py$/;
const triggers = (cfg) => [
  { name: 'an outbound fetch', js: true, re: /\bfetch\(|\bhttps?\.(?:request|get)\(|\bhttpClient\.\w+\(|\bnew\s+WebSocket\(/ },
  // a route anywhere (app.post('/x', h), a Next.js POST handler, @app.get in Python) or a plain-Node one in the server folder
  { name: 'a server route', all: (file, lines) => addsRoute(file, lines, cfg.server, cfg.clientFolders ?? CLIENT_FOLDERS) },
  { name: 'a file read', js: true, re: /\breadFile(?:Sync)?\(|\bcreateReadStream\(|\.formData\(|\.arrayBuffer\(|\bmultipart\b|\bFileReader\b/ },
];

/** Added lines per file from a unified diff (`git diff -U0`): Map<file, string[]>. */
export function addedLines(diff) {
  const out = new Map();
  let file = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) { file = line.startsWith('+++ b/') ? line.slice(6) : null; continue; }
    if (line.startsWith('--- ') || !file) continue;
    if (line.startsWith('+')) {
      if (!out.has(file)) out.set(file, []);
      out.get(file).push(line.slice(1));
    }
  }
  return out;
}

/** The advice lines for a diff: one per code file (tests and docs are never looked at), naming every trigger found. */
export function securityAdvice(diff, extra = new Map(), security = {}) {
  const cfg = { ...DEFAULTS, ...security };
  const folders = [].concat(cfg.code);
  const TRIGGERS = triggers(cfg);
  const added = addedLines(diff);
  for (const [f, lines] of extra) added.set(f, [...(added.get(f) ?? []), ...lines]);
  const advice = [];
  for (const [file, lines] of [...added].sort(([a], [b]) => a.localeCompare(b))) {
    if (!ANY_CODE.test(file) || TESTS.test(file)) continue;
    const inCode = JS.test(file) && folders.some((d) => file.startsWith(d));
    const found = TRIGGERS.filter((t) => (t.all ? t.all(file, lines) : inCode && lines.some((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l) && t.re.test(l)))).map((t) => t.name);
    if (found.length) advice.push(`advice: ${file} adds ${found.join(' and ')}: run the security-review skill before --finish`);
  }
  return advice;
}
