// Secrets in a change: reads the added lines and names the file and the kind of key, never the key itself.
// A line that only looks like one (a test's made-up value) passes with the words "not a secret" in a comment on that line.
// Pure: the added lines come in as file -> lines (addedLines() of securityscan.mjs gives them from a diff).
const KINDS = [
  ['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['an AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/],
  ['an API key (sk-...)', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}/],
  ['a Stripe live key', /\b[sr]k_live_[0-9a-zA-Z]{20,}/],
  ['a Slack token', /\bxox[baprs]-[0-9A-Za-z-]{20,}/],
  ['a Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  // a signed token (JWT): three base64url parts, the first two JSON ({" is eyJ), so a session or service token pasted in
  ['a signed token (JWT)', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  // a password in a connection string (postgres://app:<password>@db, redis, amqp, mongodb+srv, smtp...); a value filled
  // in from the environment (${PASSWORD}, $PASSWORD, %s, {password}), a placeholder, or a database on this computer only
  // (localhost, 127.0.0.1: the dev compose file's) is not one
  ['a password in a connection string', /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:/@'"`]*:(?![^@\s'"`]*(?:\$|\{|%s|<|\*\*\*|example|changeme|placeholder|xxxx|your[-_ ]))[^@\s'"`/]{3,}@(?!(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])\b)[\w.-]+/i],
  // password = "long literal": a value read from the environment, a placeholder or a short word is not one
  ['a password or key written into the code', /\b(?:password|passwd|secret|token|api[_-]?key)\w*["']?\s*[:=]\s*["'`](?![^"'`]*(?:\$\{|\{\{|<|example|changeme|placeholder|xxxx|your[-_ ]))[^"'`\s]{16,}["'`]/i],
];
const SKIP = /\.(?:lock|png|jpe?g|gif|webp|ico|pdf|woff2?|svg|map)$|(?:^|\/)(?:package-lock\.json|go\.sum)$/;

/** [{ file, kind }] for every added line that holds a secret; `added` is file -> its added lines. */
export function secretsIn(added) {
  const out = [];
  for (const [file, lines] of added) {
    if (SKIP.test(file)) continue;
    for (const line of lines) {
      if (line.length > 2000 || /not a secret/i.test(line)) continue;
      const hit = KINDS.find(([, re]) => re.test(line));
      if (hit && !out.some((o) => o.file === file && o.kind === hit[0])) out.push({ file, kind: hit[0] });
    }
  }
  return out;
}

/** The tracked files that are an env file with real values (.env, .env.local; never .env.example). */
export function envFiles(tracked) {
  return tracked.filter((f) => /(?:^|\/)\.env(?:\.(?!example$|sample$|template$)[\w.-]+)?$/.test(f));
}
