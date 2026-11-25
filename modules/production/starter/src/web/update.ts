// A page kept on the phone (an offline cache) is replaced when a new version ships, and at once when the one it has is too old to
// run (docs/run/RELEASES.md, *Apps that stay on the phone*). At start-up and when the app comes back to the screen, it asks the
// server's /health when the running version was built (`built`, from APP_BUILT_AT) and the oldest page build still allowed
// (`minBuilt`, from MIN_CLIENT_BUILT): a later build is offered ("a new version is ready: reload"), a page built before `minBuilt`
// reloads by itself, its cache dropped. Build times, not version names, decide: a server rolled back to an older build offers
// nothing, and a minimum no running build meets never reloads a page in a loop.
//   checkForUpdate({ builtAt: __BUILT_AT__ }, () => fetch('/health').then((r) => r.json()), {
//     offer: () => showUpdateBar(), reload: () => dropCachesAndReload() });
// __BUILT_AT__ is set by the bundler, the same time the server gets (the Dockerfile passes APP_BUILT_AT to the build step):
//   vite.config: define: { __BUILT_AT__: JSON.stringify(process.env.APP_BUILT_AT ?? '') }
// Pages built apart from the image (a static host) get the same APP_BUILT_AT as the server; a page with none is never offered
// or reloaded, since a time of its own would never match the server's.
//   a .d.ts beside it: declare const __BUILT_AT__: string;
// An older /health that sends no `built` (a server copied from the kit before it had one): nothing is offered or reloaded.

export type Running = { built?: unknown; minBuilt?: unknown };
export type UpdateState = 'current' | 'newer' | 'too-old';

const timeOf = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : Number.NaN);

/** What the page should do: `mine.builtAt` is when it was built (an ISO time), `running` what the server says. */
export function updateState(mine: { builtAt: string }, running: Running): UpdateState {
  const built = timeOf(mine.builtAt);
  const theirs = timeOf(running.built);
  const min = timeOf(running.minBuilt);
  if (Number.isNaN(built) || Number.isNaN(theirs)) return 'current'; // nothing to compare: the page goes on
  // too old only when the server has a build that meets the minimum, so the reload lands on one that runs
  if (!Number.isNaN(min) && built < min && theirs >= min) return 'too-old';
  return theirs > built ? 'newer' : 'current';
}

/** Asks once and acts: `offer` for a later build (the person picks the moment), `reload` for one too old to run. No answer: nothing. */
export async function checkForUpdate(
  mine: { builtAt: string },
  ask: () => Promise<Running>,
  act: { offer: () => void; reload: () => void },
): Promise<UpdateState | null> {
  let running: Running;
  try {
    running = await ask();
  } catch {
    return null; // offline: the cached page goes on, and the next check asks again
  }
  const state = updateState(mine, running);
  if (state === 'too-old') act.reload();
  else if (state === 'newer') act.offer();
  return state;
}
