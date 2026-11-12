// File size limit with a ratchet: a new file over the limit fails; an old big file is allowed
// (it is in the baseline) as long as it does not grow: growth fails too, so the giants only shrink.
export function lineCount(text) {
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

export function oversize(files, max) {
  const out = {};
  for (const [file, text] of files) {
    const n = lineCount(text);
    if (n > max) out[file] = n;
  }
  return out;
}

// `reasons` (optional, from baseline.json): why a big file may stay. A reason for a file that is not big any more is stale.
export function sizeVerdict(sizes, baseline, reasons = {}) {
  const failing = [];
  const grown = [];
  for (const [file, lines] of Object.entries(sizes)) {
    if (!(file in baseline)) failing.push({ file, lines });
    else if (lines > baseline[file]) {
      grown.push({ file, was: baseline[file], now: lines });
      failing.push({ file, lines, was: baseline[file] });
    }
  }
  const shrunk = Object.keys(baseline).filter((f) => !(f in sizes));
  const stale = Object.keys(reasons).filter((f) => !(f in sizes));
  return { failing, grown, shrunk, stale };
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
  const grown = verdict.grown.map((x) => `${x.file} grew ${x.was} -> ${x.now}`);
  if (grown.length) return 'growing: ' + grown.join('; ');
  const withReason = Object.keys(sizes).filter((f) => f in reasons).length;
  return `${Object.keys(sizes).length} big files, ${withReason} with a reason, none grown`;
}
