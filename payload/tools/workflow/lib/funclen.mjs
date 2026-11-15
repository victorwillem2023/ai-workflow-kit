// Function length with a ratchet: a new function of `max` lines or more fails; a long one already in the baseline may stay
// but must not grow (the verdict and the baseline update are size.mjs's, the shape is the same: name -> lines).
// Functions are found from the source text by counting braces (no compiler), so this reads TypeScript, JavaScript, Rust, Go,
// Java, C# and the like; a Python `def` is measured by its indentation. Another language without braces finds nothing and passes.
const STARTS = [
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)/, // function name(
  /^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=]+?)?=>|[\w$]+\s*=>)/, // const name = (...) =>
  /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(\w+)/, // Rust: fn name(
  /^\s*func\s+(?:\([^)]*\)\s*)?(\w+)/, // Go: func name(
  /^\s+(?:(?:public|private|protected|static|async|override|readonly|abstract|final)\s+)*([\w$]+)\s*(?:<[^>]*>)?\([^;{}]*\)\s*(?::\s*[^{;]+|->\s*[^{;]+)?\{\s*$/, // a method
];
const NOT = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'else', 'do', 'try', 'match', 'loop', 'constructor']);
// what is inside quotes or after // does not count as a brace
const bare = (line) => line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '').replace(/\/\/.*$/, '');

/** The line a function that starts on line `i` ends on, or -1 when it has no body in braces (a declaration, a one-line arrow). */
function endOf(lines, i) {
  let depth = 0, parens = 0, opened = false;
  for (let j = i; j < lines.length && j < i + 2000; j++) {
    for (const ch of bare(lines[j])) {
      if (ch === '{') { depth++; opened = true; }
      else if (ch === '}') depth--;
      else if (ch === '(') parens++;
      else if (ch === ')') parens--;
      // a statement ends before any body opened: a declaration or a one-line arrow
      else if (ch === ';' && !opened && parens <= 0) return -1;
    }
    if (opened && depth <= 0) return j;
    if (!opened && j >= i + 8) return -1;
  }
  return -1;
}

/** Every function in a file that has a body: its name and its first and last line (0-based). */
export function functionsIn(file, text) {
  const lines = text.split('\n');
  const out = [];
  if (file.endsWith('.py')) {
    for (let i = 0; i < lines.length; i++) {
      const m = /^(\s*)(?:async\s+)?def\s+(\w+)/.exec(lines[i]);
      if (!m) continue;
      // the body runs until the next line that is not blank and not indented further than the def
      let end = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (!lines[j].trim()) continue;
        if (/^\s*/.exec(lines[j])[0].length <= m[1].length && !/^\s*[)\]]/.test(lines[j])) break;
        end = j;
      }
      out.push({ name: m[2], from: i, to: end });
    }
    return out;
  }
  for (let i = 0; i < lines.length; i++) {
    const name = STARTS.map((re) => re.exec(lines[i])?.[1]).find(Boolean);
    if (!name || NOT.has(name)) continue;
    const end = endOf(lines, i);
    if (end >= 0) out.push({ name, from: i, to: end });
  }
  return out;
}

/** Every function of `max` lines or more: `file:name` -> lines (a second one of the same name in a file is `file:name#2`). */
export function longFunctions(files, max) {
  const out = {};
  for (const [file, text] of files) {
    const seen = new Map();
    for (const f of functionsIn(file, text)) {
      if (f.to - f.from + 1 < max) continue;
      const n = (seen.get(f.name) ?? 0) + 1;
      seen.set(f.name, n);
      out[`${file}:${f.name}${n > 1 ? '#' + n : ''}`] = f.to - f.from + 1;
    }
  }
  return out;
}

/** Functions whose body is written out word for word in more than one place (bodies of `minLines` lines or more): each group as `file:name` keys. */
export function copiedFunctions(files, minLines = 4) {
  const byBody = new Map();
  for (const [file, text] of files) {
    const lines = text.split('\n');
    for (const f of functionsIn(file, text)) {
      if (f.to - f.from + 1 < minLines) continue;
      const body = lines.slice(f.from + 1, f.to + 1).join('\n').replace(/\s+/g, ' ').trim();
      if (!byBody.has(body)) byBody.set(body, []);
      byBody.get(body).push(`${file}:${f.name}`);
    }
  }
  return [...byBody.values()].filter((g) => g.length > 1);
}

const CONTROL = /^\s*(?:\}\s*)?(?:else\s+)?(?:if|for|while|switch|match|loop|try|with)\b/;
/** The width of one step of indentation in a file: the smallest indent a code line has (1 for tabs). */
function indentStep(lines) {
  let step = 0;
  for (const l of lines) {
    const lead = /^[ \t]*/.exec(l)[0];
    if (!lead || !l.trim() || /^\s*(?:\*|\/\*|\/\/|#)/.test(l)) continue;
    const w = lead.includes('\t') ? lead.replace(/ /g, '').length : lead.length;
    if (!step || w < step) step = w;
  }
  return step || 2;
}

/**
 * Every function with an `if`, loop or `try` nested deeper than `max`: `file:name` -> how deep. Read from the indentation (so it
 * works for any language a formatter keeps tidy): an `if` straight in the function is 1, one inside it 2.
 */
export function deepFunctions(files, max) {
  const out = {};
  for (const [file, text] of files) {
    const lines = text.split('\n');
    const step = indentStep(lines);
    const width = (l) => { const lead = /^[ \t]*/.exec(l)[0]; return lead.includes('\t') ? lead.replace(/ /g, '').length : lead.length; };
    const seen = new Map();
    for (const f of functionsIn(file, text)) {
      const base = width(lines[f.from]);
      let deepest = 0;
      for (let i = f.from + 1; i <= f.to; i++) if (CONTROL.test(lines[i])) deepest = Math.max(deepest, Math.round((width(lines[i]) - base) / step));
      const n = (seen.get(f.name) ?? 0) + 1;
      seen.set(f.name, n);
      if (deepest > max) out[`${file}:${f.name}${n > 1 ? '#' + n : ''}`] = deepest;
    }
  }
  return out;
}

/**
 * Tests that are the same test with other values: `it(...)`/`test(...)` bodies that are equal once every text and number in
 * them is blanked. Groups of `file:"test name"`; bodies under `minLines` lines are not counted.
 */
export function copiedTests(files, minLines = 6) {
  const byBody = new Map();
  for (const [file, text] of files) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = /^\s*(?:it|test)(?:\.\w+)?\(\s*(["'`])(.*?)\1/.exec(lines[i]);
      if (!m) continue;
      const end = endOf(lines, i);
      if (end < 0 || end - i + 1 < minLines) continue;
      const body = lines.slice(i + 1, end).join('\n').replace(/(["'`])(?:\\.|(?!\1).)*\1/g, 'S').replace(/\b\d[\d_.]*\b/g, 'N').replace(/\s+/g, ' ').trim();
      if (!byBody.has(body)) byBody.set(body, []);
      byBody.get(body).push(`${file}:"${m[2]}"`);
      i = end;
    }
  }
  return [...byBody.values()].filter((g) => g.length > 1);
}
