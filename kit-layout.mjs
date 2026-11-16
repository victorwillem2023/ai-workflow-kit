// Where the kit's own files live (kit 3.0): under one folder, workflow/, so the project's root is the project's. The table below
// is the one place that says it: install.mjs's 3.0.0 migration moves an older project's files by it (git mv, then the paths in the
// project's own text), the kit's own sources were rewritten from it once, and the self-test fails on any old path left.
//   workflow/config.json   the settings (was workflow.config.json)      workflow/record    what the kit wrote (was .workflow-kit)
//   workflow/tools/        the gate and the tools (was tools/workflow/)  workflow/tests/    their tests (was tests/workflow/)
//   workflow/scripts/      sessions, packages, the stop points, deploy, screenshots (were in scripts/ among the project's own)
//   workflow/guides/       how the kit works with the AI (was docs/workflow/)
//   workflow/specs/        the waiting specs (was specs/)
// .claude/ stays at the root (Claude Code reads it there), and so do the project's own docs, CLAUDE.md and its own scripts.

/** The kit's scripts that moved out of scripts/ (the project's own scripts stay there). */
export const KIT_SCRIPTS = ['session.mjs', 'session-core.mjs', 'session-extras.mjs', 'session-stop.mjs', 'packages.mjs', 'packages.d.mts', 'logs.mjs', 'logs.d.mts',
  'stop-points.mjs', 'stop-points.d.mts', 'deploy.mjs', 'shots.mjs', 'shots.d.mts'];

/** Folders that moved whole: [old, new], with their trailing slash. */
export const FOLDER_MOVES = [['tools/workflow/', 'workflow/tools/'], ['tests/workflow/', 'workflow/tests/'], ['docs/workflow/', 'workflow/guides/'], ['specs/', 'workflow/specs/']];

/** Single files that moved: [old, new]. */
export const FILE_MOVES = [['workflow.config.json', 'workflow/config.json'], ['.workflow-kit', 'workflow/record'], ...KIT_SCRIPTS.map((s) => [`scripts/${s}`, `workflow/scripts/${s}`])];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
// a path starts after a space, a quote, a bracket, "../" or "./" (or a line's start), never in the middle of another name; it ends
// at anything that is not part of a name, or at a full stop that ends a sentence. A path already under workflow/ never moves again.
// (right after any "/" too: payload/tools/workflow, ../app-x/specs/. A slash, never "a word and a slash": scanning a word back
// to its start costs the square of its length, hours on a 400 KB file with no spaces)
const before = String.raw`(^|[\s` + '`' + String.raw`'"(\[{=,:/])`;
const STOP = String.raw`\.(?=[\s` + '`' + String.raw`'")\]]|$)`;
const FILE_END = String.raw`(?=[` + '`' + String.raw`'")\]\s,:;]|$|${STOP})`;
const FOLDER_END = String.raw`(?=[/` + '`' + String.raw`'")\]\s,:;*]|$|${STOP})`;
// (specs is also a plain word: only `specs/...` or a quoted 'specs' is the folder; the others are paths whatever follows)
const SPECS_END = String.raw`(?=/|['"` + '`' + '])';
const pattern = (old, folder) => new RegExp(`${before}(?<!workflow/)${esc(folder ? old.slice(0, -1) : old)}${!folder ? FILE_END : old === 'specs/' ? SPECS_END : FOLDER_END}`, 'gm');

/** Every old kit path in a text, the new one (idempotent: running it twice changes nothing more). */
export function moveKitPaths(text) {
  let out = String(text);
  for (const [old, now] of FILE_MOVES) out = out.replace(pattern(old, false), (m, b) => `${b}${now}`);
  for (const [old, now] of FOLDER_MOVES) out = out.replace(pattern(old, true), (m, b) => `${b}${now.slice(0, -1)}`);
  return out;
}

/** The other way round, for the self-test only: a project as a kit from before 3.0 left it. */
export function moveKitPathsBack(text) {
  let out = String(text);
  for (const [old, now] of FOLDER_MOVES) out = out.replace(new RegExp(`${before}${esc(now.slice(0, -1))}${FOLDER_END}`, 'gm'), (m, b) => `${b}${old.slice(0, -1)}`);
  for (const [old, now] of FILE_MOVES) out = out.replace(new RegExp(`${before}${esc(now)}${FILE_END}`, 'gm'), (m, b) => `${b}${old}`);
  return out;
}

/** The old kit paths still named in a text (the self-test fails on any). */
export function oldKitPaths(text) {
  return [...FILE_MOVES, ...FOLDER_MOVES].map(([old]) => old).filter((old) => pattern(old, old.endsWith('/')).test(String(text)));
}
