// Deploying: the small pure parts of workflow/scripts/deploy.mjs. The app's side of the deal is one address, GET /health, that answers
// 200 with { "ok": true, "version": "<commit>" }, so a deploy can prove that the new version is the one running.

/** A command from the config with {version} filled in. */
export const fill = (command, version) => String(command ?? '').replaceAll('{version}', version);

/** The health address of the app: the base address and the path, with exactly one slash between them. */
export const healthUrl = (url, path = '/health') => String(url).replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');

/** The version a health answer names, or null (not JSON, or no version in it). */
export function versionOf(body) {
  try { const v = JSON.parse(body)?.version; return typeof v === 'string' && v ? v : null; } catch { return null; }
}

/** Asks once: { up, version }. `get(url)` resolves to { status, body } and may throw (the app is down). */
export async function ask(get, url) {
  try { const r = await get(url); return { up: r.status === 200, version: r.status === 200 ? versionOf(r.body) : null }; } catch { return { up: false, version: null }; }
}

/** Asks until the app is up (and, with `want`, runs that version), at most `tries` times with `pause()` between: the last answer plus ok. */
export async function waitFor(get, url, want, { tries, pause }) {
  let last = { up: false, version: null };
  for (let i = 0; i < tries; i++) {
    last = await ask(get, url);
    if (last.up && (!want || last.version === want)) return { ...last, ok: true };
    if (i < tries - 1) await pause();
  }
  return { ...last, ok: false };
}

/** The version to go back to: the newest deployed one that is not what runs now (`log` is oldest first), or null. */
export const previous = (log, live) => [...log].reverse().find((v) => v && v !== live) ?? null;

/** The canary watch after a deploy: asks `checks` times, `pause()` between, whether the new version still answers and (with
 *  `errorsOk`, the project's own error check) whether errors stay low. Fails at the first error-check failure, or when the app
 *  missed more than `maxMisses` times: { ok, misses, checks, why }. */
export async function watchDeploy(get, url, want, { checks, pause, maxMisses = 1, errorsOk = async () => true }) {
  let misses = 0;
  for (let i = 0; i < checks; i++) {
    const h = await ask(get, url);
    if (!h.up || h.version !== want) misses++;
    if (misses > maxMisses) return { ok: false, misses, checks: i + 1, why: `the new version stopped answering ${misses} times in the watch window` };
    if (!(await errorsOk())) return { ok: false, misses, checks: i + 1, why: 'the error check failed in the watch window' };
    if (i < checks - 1) await pause();
  }
  return { ok: true, misses, checks };
}
