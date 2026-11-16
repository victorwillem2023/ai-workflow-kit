// Which addresses are production, read from the config in one place: `deploy.url` (the one address before /launch sets
// environments), `deploy.environments.production.url` (what /launch writes) and any other environment named prod..., live or main.
// The load test refuses them without --yes-production, and the security run checks their certificates. No I/O.

const PROD = /^(?:prod(?:uction)?\b|live$|main$)/i;

/** The production addresses in the config: [url], as written. */
export function productionUrls(config) {
  const d = config?.deploy ?? {};
  const envs = d.environments ?? {};
  const named = Object.entries(envs).filter(([name]) => PROD.test(name)).map(([, e]) => e?.url);
  // deploy.url is production when no environment says otherwise (an environment named staging with that same address is not)
  const shared = d.url && !Object.entries(envs).some(([name, e]) => !PROD.test(name) && e?.url === d.url) ? [d.url] : [];
  return [...new Set([...shared, ...named].filter((u) => typeof u === 'string' && u))];
}

/** The host names of the production addresses (for a certificate check). */
export function productionHosts(config) {
  return [...new Set(productionUrls(config).map((u) => { try { return new URL(u).hostname; } catch { return null; } }).filter(Boolean))];
}

/** True when `url` is a production address: the same host as one of them (any path, any scheme, a trailing slash or not). */
export function isProduction(url, config) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  return productionHosts(config).some((h) => h.toLowerCase() === host);
}
