// File size limit with a ratchet: a new file over the limit fails; an old big file is allowed
// (it is in the baseline) but reported when it grows, so the giants stay visible.
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

export function sizeVerdict(sizes, baseline) {
  const failing = [];
  const grown = [];
  for (const [file, lines] of Object.entries(sizes)) {
    if (!(file in baseline)) failing.push({ file, lines });
    else if (lines > baseline[file]) grown.push({ file, was: baseline[file], now: lines });
  }
  const shrunk = Object.keys(baseline).filter((f) => !(f in sizes));
  return { failing, grown, shrunk };
}
