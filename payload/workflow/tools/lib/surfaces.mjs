// What people use the product on (`project.surfaces` in workflow/config.json), decided at /setup and read by every part that
// depends on it: which widths the UI is drawn and checked at, whether there are web pages to weigh and test in a browser, and
// whether a phone app is its own app in the repository. One or more of:
//   web              a web app on a computer (no phone layout to keep)
//   web-phone        a web app that is also used on phones: the same pages at phone width (the kit's default)
//   phone-companion  a phone app beside the web app, doing less (logging a ride on the go): its own app, its own screens
//   phone            a phone app only, no web pages (the store app is the product)
//   desktop          a desktop app (Tauri or Electron)
//   cli              a command line tool
//   api              only an API, for other programs: no screens at all
// No I/O here.

export const SURFACES = {
  web: { what: 'a web app on a computer', web: true, widths: [1280] },
  'web-phone': { what: 'a web app also used on phones (the same pages at phone width)', web: true, widths: [400, 1280] },
  'phone-companion': { what: 'a phone app beside the web app, doing less', app: 'apps/mobile', widths: [400] },
  phone: { what: 'a phone app only, no web pages', app: 'apps/mobile', widths: [400] },
  desktop: { what: 'a desktop app', app: 'apps/desktop', widths: [1280] },
  cli: { what: 'a command line tool', widths: [] },
  api: { what: 'only an API, for other programs', widths: [] },
};

export const DEFAULT_SURFACES = ['web-phone'];

/** The surfaces in a config: its own list, else the kit's default; [names] and the problems with it. */
export function surfacesOf(config) {
  const list = config?.project?.surfaces ?? DEFAULT_SURFACES;
  const names = (Array.isArray(list) ? list : [list]).map(String);
  const problems = names.filter((n) => !SURFACES[n]).map((n) => `project.surfaces: "${n}" is not one of ${Object.keys(SURFACES).join(', ')}`);
  if (names.includes('web') && names.includes('web-phone')) problems.push('project.surfaces: "web" and "web-phone" together; web-phone is the web app on a computer and on phones');
  if (names.includes('phone') && names.includes('phone-companion')) problems.push('project.surfaces: "phone" (a phone app only) and "phone-companion" (beside a web app) cannot both be');
  if (names.includes('phone-companion') && !names.some((n) => SURFACES[n]?.web)) problems.push('project.surfaces: a "phone-companion" goes beside a web app (web or web-phone); a phone app alone is "phone"');
  return { names: names.filter((n) => SURFACES[n]), problems };
}

/** True when the product has web pages (to weigh, to test in a browser, to keep fast on a slow phone). */
export const hasWeb = (names) => names.some((n) => SURFACES[n]?.web);

/** The widths a screen is drawn and checked at, smallest first: phone width only when a surface is used on phones. */
export const widthsOf = (names) => [...new Set(names.flatMap((n) => SURFACES[n]?.widths ?? []))].sort((a, b) => a - b);

/** The apps the surfaces bring (a phone or desktop app is an app of its own: `apps` in the config, lib/apps.mjs). */
export const appsOf = (names) => [...new Set(names.map((n) => SURFACES[n]?.app).filter(Boolean))];

/** One line for people: what the product is used on. */
export const surfacesLine = (names) => names.map((n) => SURFACES[n].what).join('; ');
