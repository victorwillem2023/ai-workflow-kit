export const HOLDS_MS: number;
export function saidInPrompt(prompt: string): { commit: boolean; push: boolean };
export function needsWord(command: string): 'commit' | 'push' | null;
export function verdict(command: string, noted: { commit?: number; push?: number } | undefined, now?: number): { ok: boolean; why?: string };
