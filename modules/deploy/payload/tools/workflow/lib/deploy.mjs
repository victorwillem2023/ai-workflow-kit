// Deploying: the small pure parts of scripts/deploy.mjs. The app's side of the deal is one address, GET /health, that answers
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
