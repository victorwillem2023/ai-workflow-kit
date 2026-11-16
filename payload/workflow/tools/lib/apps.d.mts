export type App = { name: string; root: string; commands?: { typecheck?: string; testAll?: string } };
type Ran = { ok: boolean; out: string };
export function appsReached(apps: App[], changed: string[], o: { all?: boolean; shared?: string[]; matches: (f: string, globs: string[]) => boolean }): App[];
export function appSteps(o: { config: { apps?: App[]; shared?: string[] }; changed: string[]; all: boolean; run: (cmd: string, cwd?: string) => Ran; matches: (f: string, globs: string[]) => boolean }): [string, () => Ran & { note?: string }][];
