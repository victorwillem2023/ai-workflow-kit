// Whether the console handle `window.{{PREFIX}}` (the whole app: store, api, controller) is exposed.
// It is only for the owner: on this computer, or in a browser where "1" was put in localStorage "{{PREFIX}}.debug".
// A link shared with testers doesn't have it, so a stray script has no ready handle on the app.

/** `host` is location.hostname; `stored` is localStorage "{{PREFIX}}.debug". */
export function debugHandleOn(host: string, stored: string | null): boolean {
  return stored === '1' || host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}
