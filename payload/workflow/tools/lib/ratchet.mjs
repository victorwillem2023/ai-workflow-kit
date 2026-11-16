// Counts that may not rise: `ratchets` in workflow/config.json, each a name, the files it looks in and the patterns it counts.
// Made for checks on what kind a thing is ("shape === 'loop'", "isBike(") in code every kind shares: each one more is a
// rule that should live in the kind's own file. Pure: the files come in as path -> text.
import { matchesAny } from './glob.mjs';

/** How often each ratchet's patterns (regular expressions, as text) occur in its files: name -> count. */
export function countPatterns(files, ratchets = []) {
  const out = {};
  for (const r of ratchets) {
    // the patterns come from workflow/config.json, the project's own file
    // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
    const res = r.patterns.map((p) => new RegExp(p, 'g'));
    let n = 0;
    for (const [file, text] of files) if (matchesAny(file, r.include)) for (const re of res) n += (text.match(re) ?? []).length;
    out[r.name] = n;
  }
  return out;
}

/** The ratchets whose count is above the baseline's (one with no baseline yet passes). */
export function risen(counts, baseline = {}) {
  return Object.entries(counts).filter(([name, n]) => name in baseline && n > baseline[name]).map(([name, now]) => ({ name, was: baseline[name], now }));
}
