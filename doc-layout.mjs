// Where each doc lives (kit 2.9): the build stage's docs stay at the top of docs/, the rest go into a folder per subject, so a
// project shows only what it is using. install.mjs reads this to move an older project's docs on --update (git mv, then the
// references in the project's own text); the kit's own sources were rewritten from it once, and the self-test fails on any old
// path left (scripts/selftest.mjs).
//   docs/            the product and how it is built: PRODUCT, GUIDE, ARCHITECTURE, STACK, CONVENTIONS, STYLE, SECURITY, SETUP,
//                    REQUESTS, MAP, README (the index) and the folders code/, decisions/, design/, flow/, guide/, requests/, sources/
//   docs/workflow/   how the kit works with the AI: the workflow, tokens, tools, agents, the AI's security, the lifecycle
//   docs/run/        running it: deploy, environments, network, production, recovery, the infra map, and the launch guides
//   docs/market/     bringing it to market
//   docs/company/    money, access, personal data, sign-offs, the roadmap and the advisors
export const FOLDERS = {
  workflow: ['WORKFLOW', 'TOKENS', 'TOOLS', 'AI-AGENTS', 'AI-SECURITY', 'LIFECYCLE', 'API', 'FRONTEND', 'SENSITIVE'],
  run: ['DEPLOY', 'ENVIRONMENTS', 'NETWORK', 'PRODUCTION', 'RECOVERY', 'INFRA-MAP', 'CLUSTER', 'LAUNCH', 'CICD', 'IAC', 'INFRA',
    'MESH', 'MONITORING', 'RELEASES', 'PERFORMANCE', 'SCALING', 'BUY-OR-HOST'],
  market: ['MARKET', 'GROWTH'],
  company: ['COSTS', 'ACCESS', 'PRIVACY', 'SIGNOFFS', 'ROADMAP', 'STAGES', 'ADVISORS'],
};

/** Every move as [old path, new path]: docs/LAUNCH.md -> docs/run/LAUNCH.md. */
export const MOVES = Object.entries(FOLDERS).flatMap(([folder, names]) => names.map((n) => [`docs/${n}.md`, `docs/${folder}/${n}.md`]));

/** The old paths still named in a text (the self-test fails on any). */
export function oldPaths(text) {
  return MOVES.map(([from]) => from).filter((from) => new RegExp(`(^|[^A-Za-z0-9_.-])${from.replace(/[.-]/g, '\\$&')}(?![A-Za-z0-9_-])`).test(text));
}

/** The other way round, for the self-test only: a project as an older kit left it, to prove --update moves it. */
export function movePathsBack(text) {
  let out = text;
  for (const [from, to] of MOVES) out = out.replace(new RegExp(`(^|[^A-Za-z0-9_.-])${to.replace(/[.-]/g, '\\$&')}(?![A-Za-z0-9_-])`, 'g'), `$1${from}`);
  return out;
}

/**
 * The text with every old doc path replaced by its new one. Only whole paths: "docs/RUN.md" is not touched by "docs/R", and a
 * path that is already new is left alone (the old one is "docs/" right before the name).
 */
export function movePaths(text) {
  let out = text;
  for (const [from, to] of MOVES) {
    const name = from.slice('docs/'.length);
    // "docs" as a whole word: ../docs/LAUNCH.md and payload/docs/LAUNCH.md move too, mydocs/LAUNCH.md does not
    out = out.replace(new RegExp(`(^|[^A-Za-z0-9_.-])docs/${name.replace(/[.-]/g, '\\$&')}(?![A-Za-z0-9_-])`, 'g'), `$1${to}`);
  }
  return out;
}
