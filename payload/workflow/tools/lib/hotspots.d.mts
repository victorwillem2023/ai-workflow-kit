export interface Hotspot { kind: string; principle: string; what: string; files: string[]; score: number; area?: string }
export interface Fix { area: string | null; at: string | null; card?: number; topic?: string }
export interface Streak { area: string; fixes: string[]; days: number }
export function churn(log: string): Map<string, number>;
export function hotspots(input?: { changes?: Map<string, number>; baseline?: any; bugs?: { number: number; area?: string | null }[]; flaky?: string[]; hard?: { file: string; cards: string[]; whys: string[] }[]; fixes?: Streak[]; days?: number; n?: number }): Hotspot[];
export function fixStreaks(fixes: Fix[], setting?: { count?: number; days?: number } | false, now?: Date): Streak[];
export function streakLine(s: Streak): string;
export function hotspotLines(list: Hotspot[]): string;
