// Security-trigger scan: reads the added lines of a diff and names the files whose new code opens a server
// route, reads an uploaded or fetched file, or makes an outbound fetch. Advice only; the gate never fails on it.
const DEFAULTS = { code: 'src/', server: 'src/server/' };
const triggers = (cfg) => [
  { name: 'an outbound fetch', re: /\bfetch\(|\bhttps?\.(?:request|get)\(|\bhttpClient\.\w+\(|\bnew\s+WebSocket\(/ },
  { name: 'a server route', only: (f) => f.startsWith(cfg.server), re: /\bpathname\s*(?:===|!==|\.startsWith\(|\.endsWith\()|\breq(?:uest)?\.url\b|\bcreateServer\(|\broutes?\s*\[|\bcase\s+['"`]\/[\w/-]*['"`]/ },
  { name: 'a file read', re: /\breadFile(?:Sync)?\(|\bcreateReadStream\(|\.formData\(|\.arrayBuffer\(|\bmultipart\b|\bFileReader\b/ },
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

/** The advice lines for a diff: one per file in src/ (tests and docs are never looked at), naming every trigger found. */
export function securityAdvice(diff, extra = new Map(), security = {}) {
  const cfg = { ...DEFAULTS, ...security };
  const TRIGGERS = triggers(cfg);
  const added = addedLines(diff);
  for (const [f, lines] of extra) added.set(f, [...(added.get(f) ?? []), ...lines]);
  const advice = [];
  for (const [file, lines] of [...added].sort(([a], [b]) => a.localeCompare(b))) {
    if (!file.startsWith(cfg.code) || !/\.(?:ts|tsx|mjs|js)$/.test(file)) continue;
    const found = TRIGGERS.filter((t) => (!t.only || t.only(file)) && lines.some((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l) && t.re.test(l))).map((t) => t.name);
    if (found.length) advice.push(`advice: ${file} adds ${found.join(' and ')}: run the security-review skill before --finish`);
  }
  return advice;
}
