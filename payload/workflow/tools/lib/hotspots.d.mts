export interface Hotspot { kind: string; principle: string; what: string; files: string[]; score: number }
export function churn(log: string): Map<string, number>;
export function hotspots(input?: { changes?: Map<string, number>; baseline?: any; bugs?: { number: number; area?: string | null }[]; flaky?: string[]; hard?: { file: string; cards: string[]; whys: string[] }[]; days?: number; n?: number }): Hotspot[];
export function hotspotLines(list: Hotspot[]): string;
