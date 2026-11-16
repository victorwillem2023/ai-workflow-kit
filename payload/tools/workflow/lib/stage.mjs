// Where the project is, from facts (no I/O here; tools/workflow/stage.mjs gathers them): the board's first-version cards, the
// launch decision record, the market page, the last retro. Each rule gives one line naming the next stage's command, so /next
// can nudge the owner at the right moment instead of waiting to be asked. Nothing here stops anything.

/**
 * @param {{ firstVersion: { total: number, open: number } | null, beforeDeploy: { number: number, title: string }[],
 *   launched: boolean, marketPage: boolean, installed: Record<string, boolean>, shippedThisWeek: number,
 *   daysSinceRetro: number | null, aiConsidered?: boolean }} f
 * @returns {string[]} the nudges, most urgent first
 */
export function stageNudges(f) {
  const out = [];
  const add = (part) => (f.installed[part] === false ? ` (/${part} is not installed: node <kit>/install.mjs . --update --with ${part} adds it)` : '');
  const built = f.firstVersion && f.firstVersion.total > 0 && f.firstVersion.open === 0;
  if (built && !f.launched) {
    const first = f.beforeDeploy.map((c) => `#${c.number} ${c.title}`).join('; ');
    out.push(first
      ? `The first version is built. Before it goes online: ${first} (it says it comes before the first deploy), then /launch.${add('launch')}`
      : `The first version is built and nothing says yet where it runs: next is /launch (where it runs, the database, the deploy; it starts the run stage, which brings docs/run/).${add('launch')}`);
  }
  if (f.launched && f.beforeDeploy.length) {
    out.push(`It has a launch plan, but ${f.beforeDeploy.map((c) => `#${c.number}`).join(', ')} says it comes before the first deploy: do that before the deploy goes out.`);
  }
  // once the first version works: could a model make it better for its users? Asked until a decision record says yes or no
  if (built && f.aiConsidered === false) {
    out.push(`The first version works. Could AI make it better for the people using it (a summary, a first draft, sorting, search by meaning, their own assistant using the app)? /advise ai looks at it, starting from what your rules let go to a model (a few minutes; its answer is a decision record, yes or no, and then this stops).${add('advise')}`);
  }
  if (f.launched && !f.marketPage) out.push(`It has a launch plan and nothing yet on who it is for and how they find it: /market when you want users (it starts the market stage, which brings docs/market/).${add('market')}`);
  // the project's own roadmap (docs/company/ROADMAP.md): its stage and the sign it watches, so the owner's plan steers too
  if (f.roadmap && (!f.roadmap.stage || !f.roadmap.sign)) {
    out.push('The roadmap does not say yet which stage the project is at and which sign you are watching: /advise roadmap (a few minutes).');
  } else if (f.roadmap && f.roadmap.daysSinceChange >= 30) {
    out.push(`The roadmap says stage ${f.roadmap.stage}, watching for: ${f.roadmap.sign}. Is that there yet? Then /advise roadmap for the next stage (unchanged for ${f.roadmap.daysSinceChange} days).`);
  }
  if (f.installed.retro !== false && f.shippedThisWeek > 0 && (f.daysSinceRetro === null || f.daysSinceRetro >= 7)) {
    out.push(`${f.shippedThisWeek} change${f.shippedThisWeek === 1 ? '' : 's'} shipped this week and no retro for ${f.daysSinceRetro === null ? 'ever' : `${f.daysSinceRetro} days`}: /retro (about 10 minutes).`);
  }
  return out;
}

/** The stage and the sign from the roadmap's *Now* lines; a value still in <angle brackets> is the template's, so not set. */
export function readRoadmap(text) {
  const value = (re) => { const v = re.exec(text)?.[1]?.trim(); return v && !/^</.test(v) ? v.replace(/[.,]$/, '') : null; };
  return { stage: value(/^Stage:\s*([^,\n]+)/m), sign: value(/^The sign we are watching:\s*(.+)$/m) };
}

/** The cards that say they come before the first deploy (or going live), in their title or text. */
export const BEFORE_DEPLOY = /before (the |our |any )?(first )?(deploy|going live|go-live|launch)|must be done before .*deploy/i;
