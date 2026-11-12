export const DEFAULTS: { model: string; cheapModel: string; smallModel: string; exploreModel: string };
export function frontMatter(text: string): { name: string; description: string; model: string };
export function commandFile(name: string, skillText: string, cfg?: Partial<typeof DEFAULTS>): string;
export function shellPatterns(claudeSettings: unknown): string[];
export function opencodeConfig(o: { project: string; cfg?: Partial<typeof DEFAULTS>; claudeSettings?: unknown; private?: string[] }): string;
export function agentsMd(project: string): string;
