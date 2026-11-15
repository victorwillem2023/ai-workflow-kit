export type Update = { name: string; from: string; to: string };
export type Verdict = 'take' | 'look' | 'hold';
export type Node = { major: number; from: string } | null;
export function parseUpdates(pr: { title?: string; body?: string }): Update[];
export function bump(from: string, to: string): 'major' | 'minor' | 'patch';
export function checksState(rollup: unknown): 'green' | 'red' | 'running' | 'none';
export function runtimeNode(texts?: { pkg?: { engines?: { node?: string } }; toolVersions?: string; dockerfile?: string; nvmrc?: string }): Node;
export function judge(u: Update, ctx?: { checks?: string; node?: Node; hold?: Record<string, string> }): { verdict: Verdict; why: string };
export function judgePr(
  pr: { number?: number; url?: string; title?: string; body?: string; statusCheckRollup?: unknown },
  ctx?: { node?: Node; hold?: Record<string, string> },
): { number?: number; url?: string; title?: string; checks: string; verdict: Verdict; updates: (Update & { verdict: Verdict; why: string })[] };
export function holdSnippet(names: string[]): string;
export function updateTools(t: { renovateJson?: string; dependabotYml?: string; dashboard?: boolean }): { renovate: boolean; dependabot: boolean; both: boolean; renovateIdle: boolean };
export function readAlerts(list: unknown): { name: string; severity: string; summary: string; fixed: string | null; url?: string }[];
export function shortLine(prs: { verdict: Verdict }[], alerts: { severity: string }[]): string;
