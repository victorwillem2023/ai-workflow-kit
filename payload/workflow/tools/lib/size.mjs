// File size limit with a ratchet: a new file over the limit fails; an old big file is allowed
// (it is in the baseline) as long as it does not grow: growth fails too, so the giants only shrink.
// What is counted (baseline.sizeMeasure "work"): the lines that hold work. Plumbing is left out: blank lines, comments, imports,
// lines of braces only, field declarations, `x = new X(ctx)` and one-line pass-through methods, so a switchboard that gains one
// `another() { return this.refining.another(); }` per action does not count it, and 30 lines of new logic still do. A small,
// tracked allowance (size.allowance a card, size.allowanceTotal in all) lets a big file grow a little with each card; past the
// total the file needs its split card.
export function lineCount(text) {
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

const PLUMBING = [
  /^\s*$/, // blank
  /^\s*(\/\/|\/\*|\*|\*\/|#(?![\w$]+\s*[=:;(]))/, // a comment (a #private field is not one)
  /^\s*(import\b|export\s+(\*|type\s+\{|\{)[^;]*\bfrom\b|from\s+\S+\s+import\b|use\s+[\w:{}, *]+;)/, // imports
  /^\s*[}\])]+[;,)]*\s*$/, // braces only
  /^\s*((private|public|protected|readonly|static|declare|override)\s+)*#?[\w$]+[?!]?\s*:\s*[^=;(){}]+;?\s*$/, // a typed field, no value
  /^\s*((private|public|protected|readonly|static)\s+)*(this\.)?#?[\w$.]+\s*(:\s*[\w$.<>, ]+)?=\s*new\s+[\w$.]+\([^()]*\);?\s*$/, // x = new X(ctx)
  /^\s*(async\s+)?#?[\w$]+\s*\([^()]*\)\s*(:\s*[^{}]+)?\{\s*(return\s+)?(await\s+)?this\.[\w$#.]+\([^()]*\);?\s*\}\s*$/, // m(a) { return this.x.m(a); }
  /^\s*#?[\w$]+\s*=\s*(async\s*)?\([^()]*\)\s*=>\s*this\.[\w$#.]+\([^()]*\);?\s*$/, // m = (a) => this.x.m(a);
];
/** A line that only connects things (see the top of this file): not counted as work. */
export const isPlumbing = (line) => PLUMBING.some((p) => p.test(line));
/** The lines of `text` that hold work. */
export const workLineCount = (text) => text.split('\n').slice(0, lineCount(text)).filter((l) => !isPlumbing(l.replace(/\r$/, ''))).length;
/**
 * The limit for the way it counts: `maxLines` for every line; for work lines `maxWorkLines`, by default 60% of `maxLines` (a
 * file of 400 lines holds about 240 that do work), so the switch to work lines does not let the big files off.
 */
export const limitOf = (settings, count = workLineCount) => (count === workLineCount ? settings.maxWorkLines ?? Math.round(settings.maxLines * 0.6) : settings.maxLines);

/** How a project's baseline counts: work lines once it says so (or has no sizes yet), else every line, as it was written. */
export const measureOf = (baseline) => (baseline?.sizeMeasure === 'work' || !baseline?.sizes || !Object.keys(baseline.sizes).length ? workLineCount : lineCount);

export function oversize(files, max, count = lineCount) {
  const out = {};
  for (const [file, text] of files) {
    const n = count(text);
    if (n > max) out[file] = n;
  }
  return out;
}

// `reasons` (optional, from baseline.json): why a big file may stay. A reason for a file that is not big any more is stale.
// With `allowance` (lines a card) and `total` (lines in all), `used` ({ file: lines already taken }): a baselined file that grows
// by at most the allowance, with the total not passed, is in `allowed` instead of failing; past the total it fails, `capped`.
export function sizeVerdict(sizes, baseline, reasons = {}, { allowance = 0, total = 0, used = {} } = {}) {
  const failing = [];
  const grown = [];
  const allowed = [];
  for (const [file, lines] of Object.entries(sizes)) {
    if (!(file in baseline)) failing.push({ file, lines });
    else if (lines > baseline[file]) {
      const by = lines - baseline[file];
      grown.push({ file, was: baseline[file], now: lines });
      const left = Math.max(0, (total || Infinity) - (used[file] ?? 0));
      if (allowance && by <= allowance && by <= left) allowed.push({ file, was: baseline[file], now: lines, by, used: used[file] ?? 0 });
      else failing.push({ file, lines, was: baseline[file], ...(allowance && by <= allowance ? { capped: true } : {}) });
    }
  }
  const shrunk = Object.keys(baseline).filter((f) => !(f in sizes));
  const stale = Object.keys(reasons).filter((f) => !(f in sizes));
  return { failing, grown, allowed, shrunk, stale };
}

/**
 * The gate's size inputs: the files the size rule covers, their sizes over the limit (work lines once the baseline counts them
 * so; --update-baseline switches an older one), and the allowance a card (`settings`: config.size) with what each file used.
 */
export function sizeSetup(files, settings, baseline, matches) {
  const sizeFiles = new Map([...files].filter(([f]) => matches(f, settings.include)));
  const allowance = settings.allowance ?? 0;
  const limit = limitOf(settings, measureOf(baseline));
  return { sizeFiles, limit, sizes: oversize(sizeFiles, limit, measureOf(baseline)), allow: { allowance, total: settings.allowanceTotal ?? allowance * 5, used: allowanceUsed(baseline.allowed) } };
}

/** The lines each big file took of its allowance, from baseline.allowed ({ file: [{ card, lines }] }). */
export const allowanceUsed = (allowedRows = {}) => Object.fromEntries(Object.entries(allowedRows).map(([f, rows]) => [f, rows.reduce((n, r) => n + r.lines, 0)]));

/** The baseline after a card used its allowance: the new sizes, and a row per file with the card number. */
export function takeAllowance(baseline, allowed, card) {
  const sizes = { ...(baseline.sizes ?? {}) };
  const rows = { ...(baseline.allowed ?? {}) };
  for (const a of allowed) { sizes[a.file] = a.now; rows[a.file] = [...(rows[a.file] ?? []), { card: card ?? null, lines: a.by }]; }
  return { ...baseline, sizes, allowed: rows };
}

// The next baseline sizes for --update-baseline: numbers may only drop or go away. A raised or new number is
// refused (ok false, `raised` names the files) unless a reason is given; the reason is printed in `message`.
export function updateSizes(sizes, old, reason, oldReasons = {}) {
  const raised = [];
  for (const [file, lines] of Object.entries(sizes)) {
    if (!(file in old) || lines > old[file]) raised.push({ file, was: old[file] ?? null, now: lines });
  }
  if (raised.length && !reason) return { ok: false, raised };
  const next = Object.fromEntries(Object.entries(sizes).sort());
  const message = raised.length
    ? `growth allowed (${reason}): ` + raised.map((x) => `${x.file} ${x.was ?? 'new'} -> ${x.now}`).join('; ')
    : '';
  const nextReasons = Object.fromEntries(Object.entries(oldReasons).filter(([f]) => f in sizes).sort());
  return { ok: true, next, nextReasons, raised, message };
}

// The note of the size step when it passes.
export function sizeNote(sizes, verdict, reasons = {}) {
  if (verdict.allowed?.length) return 'within the allowance: ' + verdict.allowed.map((x) => `${x.file} +${x.by} (${x.used + x.by} used in all)`).join('; ') + ' (gate:ship records it with the card)';
  const grown = verdict.grown.map((x) => `${x.file} grew ${x.was} -> ${x.now}`);
  if (grown.length) return 'growing: ' + grown.join('; ');
  const withReason = Object.keys(sizes).filter((f) => f in reasons).length;
  return `${Object.keys(sizes).length} big files, ${withReason} with a reason, none grown`;
}
