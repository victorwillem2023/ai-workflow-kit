// `gate.mjs --only <files>`: the check one builder of several can run while the others are mid-edit (/build, several.md). The
// whole typecheck runs (types cross files), but only the errors in the builder's own files count; the neighbours' are counted
// and left. Then the tests that reach those files, nothing else. It never replaces the gate: the lead runs that after the wave.
// Pure apart from the `run` it is given.

/** The files after --only, up to the next flag; commas split them too. Paths with forward slashes. */
export function onlyFiles(args) {
  const at = args.indexOf('--only');
  if (at < 0) return null;
  const out = [];
  for (const a of args.slice(at + 1)) { if (a.startsWith('--')) break; out.push(...a.split(',').filter(Boolean)); }
  return out.map((f) => f.replace(/\\/g, '/').replace(/^\.\//, ''));
}

/** The typecheck's error lines that name one of `files` (tsc: "src/a.ts(3,5): error", "src/a.ts:3:5 - error"; mypy "src/a.py:3:"). */
export function ownErrors(out, files) {
  const lines = String(out ?? '').split(/\r?\n/).map((l) => l.replace(/\\/g, '/'));
  const errors = lines.filter((l) => /\berror\b/i.test(l) && /^[^\s(:]+[(:]\d/.test(l));
  const mine = errors.filter((l) => files.some((f) => l.startsWith(`${f}(`) || l.startsWith(`${f}:`)));
  return { mine, others: errors.length - mine.length };
}

/**
 * Runs the typecheck (counting only `files`' errors) and then `tests` (the test files that reach them). { ok, lines }.
 * @param {{ files: string[], typecheck: string, testFiles: string, tests: string[], run: (cmd: string) => { ok: boolean, out: string } }} o
 */
export function onlyCheck({ files, typecheck, testFiles, tests, run }) {
  const lines = [];
  if (!files.length) return { ok: false, lines: ['--only needs the files you own: npm run gate -- --only src/a.ts src/b.ts'] };
  const t = run(typecheck);
  const { mine, others } = ownErrors(t.out, files);
  const elsewhere = others ? ` (${others} in other files, not yours: left to their owners)` : '';
  if (mine.length) return { ok: false, lines: [`FAIL typecheck: ${mine.length} in your files${elsewhere}`, ...mine] };
  lines.push(`ok   typecheck - none in your ${files.length} file${files.length === 1 ? '' : 's'}${elsewhere}`);
  if (!tests.length) return { ok: true, lines: [...lines, 'ok   tests - none reach your files'] };
  const r = run(`${testFiles} ${tests.join(' ')}`);
  if (!r.ok) return { ok: false, lines: [...lines, `FAIL tests (${tests.length} reach your files)`, r.out.trim().split('\n').slice(-40).join('\n')] };
  return { ok: true, lines: [...lines, `ok   tests - the ${tests.length} that reach your files`] };
}
