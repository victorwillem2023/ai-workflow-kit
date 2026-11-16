// The quality score: a command of the project's own (its cases, its stress test) prints how many pass, and that number may
// not drop. Settings: `quality` in workflow/config.json ({ command, pattern?, when? }). Pure: the output comes in.
const DEFAULT = '(\\d+)\\s*(?:of|/|out of)\\s*(\\d+)';

/** The last "79 of 106" in the output (or the config's own pattern: first group passed, second the total). */
export function parseScore(out, pattern = DEFAULT) {
  // the pattern comes from workflow/config.json, the project's own file
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  const all = [...String(out).matchAll(new RegExp(pattern, 'g'))];
  const m = all[all.length - 1];
  return m ? { pass: +m[1], total: m[2] != null ? +m[2] : null } : null;
}

/** Fails when no score was printed or fewer pass than the baseline says. */
export function qualityVerdict(score, was) {
  const text = score ? `${score.pass}${score.total != null ? ' of ' + score.total : ''} pass` : '';
  if (!score) return { ok: false, out: 'the quality command printed no score (expected something like "79 of 106")' };
  if (was?.pass != null && score.pass < was.pass) return { ok: false, out: `${text}, the baseline is ${was.pass}: a case that passed now fails` };
  return { ok: true, note: `${text}${was?.pass != null ? ` (baseline ${was.pass})` : ' (no baseline yet: --update-baseline stores it)'}` };
}
