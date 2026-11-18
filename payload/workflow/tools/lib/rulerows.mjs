// The rows of docs/ARCHITECTURE.md's *Rules and where each lives* stay short: a rule names its home and its check, and who keeps
// to it as a folder or a pattern, never a list of files (one row once listed dozens of screens, grew with every feature, and
// every agent read it). A cell past the limit gets an advice line from the gate; it never fails. Pure.

const HEADING = /^##\s+Rules and where each lives\s*$/;

/** Advice lines for the table cells of that section longer than `max` characters. */
export function longRuleCells(file, text, max = 200) {
  const lines = String(text ?? '').split(/\r?\n/);
  const start = lines.findIndex((l) => HEADING.test(l));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    const l = lines[i];
    if (!/^\s*\|/.test(l) || /^\s*\|[\s|:-]+\|\s*$/.test(l)) continue; // not a row, or the header's rule
    const cells = l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const long = cells.map((c, n) => [c, n]).filter(([c]) => c.length > max);
    if (!long.length) continue;
    const rule = cells[0].replace(/`/g, '').slice(0, 50);
    const files = Math.max(...long.map(([c]) => (c.match(/`[^`]+\.[a-z]+`/gi) ?? []).length));
    out.push(`advice: ${file}:${i + 1}: the rule "${rule}${cells[0].length > 50 ? '...' : ''}" has a cell of ${Math.max(...long.map(([c]) => c.length))} characters${files > 1 ? ` naming ${files} files` : ''}: name the folder or a pattern (\`src/web/**/*.tsx\`) and the check that holds it, not each file`);
  }
  return out;
}
