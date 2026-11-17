// What an update changes because the kit itself changed, one step per kit version (like a database's migrations), out of the
// installer's main path. A step runs when the project's recorded version is older than the step's (a project with no record:
// every step), and each still looks before it changes anything, so a project that skipped versions or was edited by hand is safe,
// and running one twice does nothing. The record's version= moves on after the update, so a step runs once.
// Phases: `before` (before the kit's files are copied: moving the project's own files), `claude` (the project's CLAUDE.md),
// `config` (its workflow/config.json, after the settings merge). A step returns the lines it says in the report.
// Adding one: a file here, `export default { version, what, phase, run(ctx) }`, and its name in STEPS, oldest first.
import docFolders from './2.9.0-doc-folders.mjs';
import productionBack from './2.9.3-production-back.mjs';
import unusedCommand from './2.9.7-unused-command.mjs';
import notesRule from './2.9.8-notes-rule.mjs';
import knipAndNotes from './3.3.0-knip-and-notes.mjs';
import typecheckIncremental from './3.4.0-typecheck-incremental.mjs';

export const STEPS = [docFolders, productionBack, unusedCommand, notesRule, knipAndNotes, typecheckIncremental];

const parts = (v) => String(v).split('.').map(Number);
/** a is older than b (2.9.7 < 2.9.10). */
export const older = (a, b) => { const x = parts(a), y = parts(b); for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0); return false; };

/** The steps a project at version `from` (null: no record) needs, in a phase, oldest first. */
export const due = (from, phase) => STEPS.filter((s) => s.phase === phase && (!from || from === 'unknown' || older(from, s.version)));

/** Runs a phase's due steps: { said: [lines], ran: ['2.9.0 the docs into folders', ...], ...what the steps return }. */
export function runMigrations(phase, ctx) {
  const out = { said: [], ran: [] };
  for (const step of due(ctx.from, phase)) {
    const r = step.run(ctx) ?? {};
    if (r.said?.length) { out.ran.push(`${step.version} ${step.what}`); out.said.push(...r.said); }
    // the bytes the steps add to CLAUDE.md add up (its budget grows by all of them); anything else a step returns is passed on
    const growth = (out.claudeGrowth ?? 0) + (r.claudeGrowth ?? 0);
    Object.assign(out, { ...r, said: out.said, ran: out.ran, claudeGrowth: growth });
  }
  return out;
}
