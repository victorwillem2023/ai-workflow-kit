export interface Ratchet { name: string; include: string[]; patterns: string[] }
export function countPatterns(files: Map<string, string>, ratchets?: Ratchet[]): Record<string, number>;
export function risen(counts: Record<string, number>, baseline?: Record<string, number>): { name: string; was: number; now: number }[];
