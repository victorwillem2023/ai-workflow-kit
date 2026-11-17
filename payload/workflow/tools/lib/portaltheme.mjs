// The portal's look comes from the project's own style sheet, docs/STYLE.md (no I/O here; workflow/tools/portal.mjs reads it):
// its colour table (token, light, dark, use), its type section (the family, the condensed voice, the sizes) and its radii. Token
// names differ per project, so each of the portal's roles is found by what the "Use" column says ("App background", "Panels,
// cards", "Text on yellow"), or by a role's own name. Without a style sheet: a plain neutral look, never a brand of the kit's own.

/** The roles the portal paints with, and the words in a token's "Use" (or its name) that say it plays the role, first match wins. */
export const ROLES = [
  ['onPrimary', /\btext on\b|\bon[- ]primary\b|\bon[- ](?:accent|brand)\b/],
  ['bg', /\b(?:app|page) background\b|^background\b|\bbackground of the page\b|^--(?:bg|background|paper|page)$/],
  ['raised', /\bhover\b|\bselected\b|\binputs?\b.*\btiles?\b|^--(?:surface-2|raised|hover)$/],
  ['surface', /\bpanels?\b|\bcards?\b(?!.*border)|^surface\b|^--(?:surface|panel|card)$/],
  ['caption', /\bcaptions?\b|\bplaceholders?\b|\bhints?\b|^--(?:ink-3|text-3|caption|muted-2)$/],
  ['muted', /\bsecondary text\b|\bmuted\b|^--(?:ink-2|text-2|muted)$/],
  ['text', /^(?:the )?(?:body )?text\b|^--(?:ink|text|fg|foreground)$/],
  ['control', /\bborders? of controls\b|\bcontrol borders?\b|\binput borders?\b|^--(?:line-2|border-2|control)$/],
  ['line', /\bdividers?\b|\bcard borders?\b|\blines?\b|^--(?:line|border|divider)$/],
  ['primary', /\bprimary\b|\bthe one thing to do\b|\bmain action\b|\bcall to action\b|\bbrand\b|^--(?:primary|accent|brand|sign)$/],
  ['link', /\blinks?\b|\bfocus\b|^--(?:link|focus)$/],
  ['warn', /\bwarn(?:ing)?\b|\buncertain\b|^--(?:warn|warning)$/],
  ['ok', /\bgood news\b|\bsuccess\b|^--(?:ok|success)$/],
];

/** A plain neutral look: what the portal wears in a project without a style sheet yet. */
export const NEUTRAL = {
  light: { bg: '#f6f7f8', surface: '#ffffff', raised: '#eef0f2', text: '#1d2125', muted: '#4b535c', caption: '#5f6870', line: '#e1e4e8', control: '#c9ced4', primary: '#2d5bd8', onPrimary: '#ffffff', link: '#2d5bd8', warn: '#8a5300', ok: '#2a7a4a' },
  dark: { bg: '#141619', surface: '#1b1e22', raised: '#24282d', text: '#e6e8eb', muted: '#aab1b9', caption: '#8e959d', line: '#2c3137', control: '#3a4047', primary: '#7fa2ff', onPrimary: '#0d1117', link: '#8fb0ff', warn: '#f0a83a', ok: '#5cc28a' },
};

const section = (md, word) => (new RegExp(`^##\\s+${word}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, 'mi').exec(md) ?? [])[1] ?? '';
const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim().replace(/`/g, ''));
const colour = (v) => (/^(?:#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i.test(v) ? v : null);

/** The colour table: [{ token, light, dark, use }] (a table whose header has Light and Dark columns). */
export function colourTokens(md) {
  const lines = section(md, 'Colou?r').split('\n').filter((l) => /^\s*\|/.test(l));
  if (lines.length < 3) return [];
  const head = cells(lines[0]).map((h) => h.toLowerCase());
  const at = (name) => head.findIndex((h) => h.startsWith(name));
  const [t, l, d, u] = [at('token'), at('light'), at('dark'), at('use')];
  if (l < 0 || d < 0) return [];
  return lines.slice(2).map(cells).map((c) => ({ token: c[t < 0 ? 0 : t], light: colour(c[l]), dark: colour(c[d]), use: (c[u] ?? '').toLowerCase() }))
    .filter((r) => r.token && r.light && r.dark);
}

/** Each role's token, found by its use or its name, each token playing one role. */
export function matchRoles(tokens) {
  const roles = {};
  const taken = new Set();
  for (const [role, words] of ROLES) {
    const hit = tokens.find((tk) => !taken.has(tk.token) && (words.test(tk.use) || words.test(tk.token.toLowerCase())));
    if (hit) { roles[role] = hit; taken.add(hit.token); }
  }
  return roles;
}

/** The type section: { family, stretch, sizes: [largest first] }. */
export function typeOf(md) {
  const text = section(md, 'Type');
  const prose = text.split('\n').find((l) => l.trim() && !/^\s*\|/.test(l)) ?? '';
  const family = /^\s*([A-Z][\w-]*(?: [A-Z][\w-]*){0,3})[.,:]/.exec(prose)?.[1] ?? null;
  const stretch = /font-stretch:\s*(\d+%)/.exec(text)?.[1] ?? (/\bcondensed\b/i.test(text) ? 'condensed' : null);
  const sizes = [...new Set(text.split('\n').filter((l) => /^\s*\|/.test(l)).map((l) => Number(cells(l)[1])).filter((n) => n >= 10 && n <= 96))].sort((a, b) => b - a);
  return { family, stretch, sizes };
}

/** The radii: [small, large] from the shape section, or null. */
export function radiiOf(md) {
  const line = section(md, 'Shape').split('\n').find((l) => /radi(?:us|i)/i.test(l)) ?? '';
  const n = [...line.matchAll(/\b(\d{1,2})\b/g)].map((m) => Number(m[1]));
  return n.length >= 2 ? [n[0], n[1]] : n.length === 1 ? [n[0], n[0] * 2] : null;
}

/**
 * The portal's theme from docs/STYLE.md (null or '': no style sheet): { found, light, dark, family, stretch, sizes, radii, missing }.
 * A role the sheet has no token for takes the neutral one, and is named in `missing`.
 */
export function themeFrom(md) {
  const sizes = [32, 24, 18, 15, 14, 12];
  if (!md) return { found: false, ...NEUTRAL, family: null, stretch: null, sizes, radii: [8, 12], missing: [] };
  const roles = matchRoles(colourTokens(md));
  const pick = (side) => Object.fromEntries(Object.keys(NEUTRAL.light).map((r) => [r, roles[r]?.[side] ?? NEUTRAL[side][r]]));
  const type = typeOf(md);
  return {
    found: Object.keys(roles).length > 0, light: pick('light'), dark: pick('dark'), family: type.family, stretch: type.stretch,
    sizes: type.sizes.length >= 4 ? type.sizes : sizes, radii: radiiOf(md) ?? [8, 12],
    missing: Object.keys(NEUTRAL.light).filter((r) => !roles[r]),
  };
}

/** The theme as CSS: the roles as --p-* variables, light by default, dark with the system or the tab's switch. */
export function themeCss(th, fontFace = '') {
  const vars = (side) => Object.entries(th[side]).map(([r, v]) => `--p-${r}:${v}`).join(';');
  const [s1, s2, s3, s4, s5, s6] = [...th.sizes, ...[14, 12, 12, 12, 12, 12]].slice(0, 6);
  const font = th.family ? `'${th.family}',system-ui,-apple-system,"Segoe UI",sans-serif` : 'system-ui,-apple-system,"Segoe UI",sans-serif';
  const stretch = th.stretch === 'condensed' ? 'condensed' : th.stretch ?? 'normal';
  return `${fontFace}:root{${vars('light')};--p-font:${font};--p-stretch:${stretch};--p-r1:${th.radii[0]}px;--p-r2:${th.radii[1]}px;`
    + `--p-s-display:${s1}px;--p-s-stat:${s2}px;--p-s-title:${s3}px;--p-s-body:${s4}px;--p-s-ui:${s5}px;--p-s-caption:${s6}px;color-scheme:light}`
    + `@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${vars('dark')};color-scheme:dark}}:root[data-theme=dark]{${vars('dark')};color-scheme:dark}`;
}
