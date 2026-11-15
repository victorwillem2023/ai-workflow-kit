// The rules that keep a problem findable, checked on the changed files (no I/O here; the gate's `errors` check runs it):
// - no empty catch: an error swallowed without a word is the one nobody can find later. Log it with what the code was doing,
//   throw it on as an AppError with `cause` (src/server/errors.ts), or say in a comment why it is safe to drop;
// - no console.log in server code: a log line goes through the logger (src/server/log.ts), so it carries the request id, is one
//   JSON line and never writes a secret.
// TypeScript and JavaScript under src/; tests and the logger itself are left alone.

const CODE = /^src\/.*\.(ts|tsx|js|mjs|cjs)$/;
const TEST = /\.test\.|\/tests?\//;

/** The lines that break a rule in one file: [{ line, rule, say }]. */
export function errorRuleFindings(file, text) {
  if (!CODE.test(file) || TEST.test(file)) return [];
  const out = [];
  const lines = String(text).split('\n');
  // an empty catch, on one line or across a few: "catch {}", "catch (e) {\n}"; a comment inside counts as a reason
  const joined = lines.join('\n');
  for (const m of joined.matchAll(/catch\s*(\([^)]*\))?\s*\{\s*\}/g)) {
    const line = joined.slice(0, m.index).split('\n').length;
    out.push({ line, rule: 'empty catch', say: 'an empty catch swallows the cause: log it with what it was doing, throw it on as an AppError with cause, or say in a comment why it is safe to drop' });
  }
  if (/^src\/server\//.test(file) && !/\/log\.(ts|js|mjs)$/.test(file)) {
    lines.forEach((l, i) => {
      if (/\bconsole\.(log|info|debug|warn|error)\s*\(/.test(l) && !/^\s*(\/\/|\*)/.test(l)) {
        out.push({ line: i + 1, rule: 'console in the server', say: 'log through src/server/log.ts (req.log in a request), so the line has its request id and hides secrets' });
      }
    });
  }
  return out.sort((a, b) => a.line - b.line);
}
