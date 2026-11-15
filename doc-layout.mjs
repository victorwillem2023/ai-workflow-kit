// Where each doc lives (kit 2.9): the build stage's docs stay at the top of docs/, the rest go into a folder per subject, so a
// project shows only what it is using. install.mjs reads this to move an older project's docs on --update (git mv, then the
// references in the project's own text); the kit's own sources were rewritten from it once, and the self-test fails on any old
// path left (scripts/selftest.mjs).
//   docs/            the product and how it is built: PRODUCT, GUIDE, ARCHITECTURE, STACK, CONVENTIONS, STYLE, SECURITY, SETUP,
//                    PRODUCTION (settings, logs and health: code a project has from day one),
//                    REQUESTS, MAP, README (the index) and the folders code/, decisions/, design/, flow/, guide/, requests/, sources/
//   docs/workflow/   how the kit works with the AI: the workflow, tokens, tools, agents, the AI's security, the lifecycle
//   docs/run/        running it: deploy, environments, network, recovery, the infra map, and the launch guides
//   docs/market/     bringing it to market
//   docs/company/    money, access, personal data, sign-offs, the roadmap and the advisors
export const FOLDERS = {
  workflow: ['WORKFLOW', 'TOKENS', 'TOOLS', 'AI-AGENTS', 'AI-SECURITY', 'LIFECYCLE', 'API', 'FRONTEND', 'SENSITIVE'],
  run: ['DEPLOY', 'ENVIRONMENTS', 'NETWORK', 'RECOVERY', 'INFRA-MAP', 'CLUSTER', 'LAUNCH', 'CICD', 'IAC', 'INFRA',
    'MESH', 'MONITORING', 'RELEASES', 'PERFORMANCE', 'SCALING', 'BUY-OR-HOST'],
  market: ['MARKET', 'GROWTH'],
  company: ['COSTS', 'ACCESS', 'PRIVACY', 'SIGNOFFS', 'ROADMAP', 'STAGES', 'ADVISORS'],
};

/** Every move as [old path, new path]: docs/LAUNCH.md -> docs/run/LAUNCH.md. */
export const MOVES = Object.entries(FOLDERS).flatMap(([folder, names]) => names.map((n) => [`docs/${n}.md`, `docs/${folder}/${n}.md`]));

/**
 * Corrections to an earlier 2.9 layout, applied by an update like the moves: PRODUCTION.md was in docs/run/ in 2.9.0 to 2.9.2,
 * but it describes code a project has from the first day (settings, logs, health), so it is a build-stage doc again.
 */
export const CORRECTIONS = [['docs/run/PRODUCTION.md', 'docs/PRODUCTION.md']];
const ALL_MOVES = [...MOVES, ...CORRECTIONS];

/** The old paths still named in a text (the self-test fails on any). */
export function oldPaths(text) {
  return ALL_MOVES.map(([from]) => from).filter((from) => new RegExp(`(^|[^A-Za-z0-9_.-])${from.replace(/[.-]/g, '\\$&')}(?![A-Za-z0-9_-])`).test(text));
}

/** The other way round, for the self-test only: a project as an older kit left it, to prove --update moves it. */
export function movePathsBack(text) {
  let out = text;
  for (const [from, to] of MOVES) out = out.replace(new RegExp(`(^|[^A-Za-z0-9_.-])${to.replace(/[.-]/g, '\\$&')}(?![A-Za-z0-9_-])`, 'g'), `$1${from}`);
  return out;
}

/** The corrections undone (docs/PRODUCTION.md back to docs/run/PRODUCTION.md): how a 2.9.0 to 2.9.2 kit wrote a file. */
export function undoCorrections(text) {
  let out = text;
  // (not after a "/": docs/run/PRODUCTION.md must not become docs/run/run/...; "../docs/" is preceded by "/", and is left as it is)
  for (const [from, to] of CORRECTIONS) out = out.replace(new RegExp(`(^|[^A-Za-z0-9_./-])${to.replace(/[.-]/g, '\\$&')}(?![A-Za-z0-9_-])`, 'g'), `$1${from}`);
  return out;
}

/**
 * The text with every old doc path replaced by its new one. Only whole paths: "docs/RUN.md" is not touched by "docs/R", and a
 * path that is already new is left alone (the old one is "docs/" right before the name).
 */
export function movePaths(text) {
  let out = text;
  for (const [from, to] of ALL_MOVES) {
    const name = from.slice('docs/'.length);
    // "docs" as a whole word: ../docs/LAUNCH.md and payload/docs/LAUNCH.md move too, mydocs/LAUNCH.md does not
    out = out.replace(new RegExp(`(^|[^A-Za-z0-9_.-])docs/${name.replace(/[.-]/g, '\\$&')}(?![A-Za-z0-9_-])`, 'g'), `$1${to}`);
  }
  return out;
}
