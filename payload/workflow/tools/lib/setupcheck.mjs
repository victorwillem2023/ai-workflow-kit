// The setup check: docs/SETUP.md's commands, run as written on a fresh copy, so "how to set it up" is proven, not hoped.
// In SETUP.md:
//   ```sh setup        a step that must finish with no error (install, copy settings, migrate)
//   ```sh start        the one command that starts the app; it must answer the address in the line
//                      <!-- ready: http://127.0.0.1:8787/ -->  below the block, then it is stopped
// Blocks without `setup` or `start` are examples and are not run.

const MAX_BLOCKS = 30; // a guide with more steps than this is not a guide

/** The blocks to run: { setup: [{ line, script }], start: { line, script, ready } | null, problems: [] }. */
export function readSetup(text) {
  const out = { setup: [], start: null, problems: [] };
  const lines = String(text ?? '').split(/\r?\n/);
  for (let i = 0; i < lines.length && out.setup.length < MAX_BLOCKS; i++) {
    const open = /^```(?:sh|bash|shell)\s+(setup|start)\s*$/.exec(lines[i]);
    if (!open) continue;
    const at = i + 1;
    const body = [];
    for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) body.push(lines[i]);
    const script = body.join('\n').trim();
    if (!script) { out.problems.push(`docs/SETUP.md:${at}: an empty ${open[1]} block`); continue; }
    if (open[1] === 'setup') { out.setup.push({ line: at, script }); continue; }
    if (out.start) { out.problems.push(`docs/SETUP.md:${at}: a second start block (one command starts the app)`); continue; }
    const ready = lines.slice(i + 1, i + 4).map((l) => /<!--\s*ready:\s*(https?:\/\/[^\s>]+)\s*-->/.exec(l)?.[1]).find(Boolean);
    if (!ready) out.problems.push(`docs/SETUP.md:${at}: the start block needs <!-- ready: http://... --> on a line right below it`);
    else if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(ready)) out.problems.push(`docs/SETUP.md:${at}: the ready address must be on this computer (127.0.0.1 or localhost)`);
    else out.start = { line: at, script, ready };
  }
  if (!out.setup.length && !out.start) out.problems.push('docs/SETUP.md has no ```sh setup or ```sh start block: mark the steps that set it up');
  return out;
}
