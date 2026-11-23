export interface Run { name: string; trigger: string; time?: string; prompt: string }
export const RUNS: Run[];
export function planOf(o: { config: unknown; levels: string | null; hasSkill: (name: string) => boolean; project: string }): { off: string; runs: Run[] };
