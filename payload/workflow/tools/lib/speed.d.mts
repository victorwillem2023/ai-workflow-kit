type Timings = { firstMs: number | null; usableMs: number | null; tapMs: number | null };
export const ROOM: number;
export const SLACK_MS: { firstMs: number; usableMs: number; tapMs: number };
export const GOOD: { firstMs: number; tapMs: number };
export function median(xs: (number | null)[]): number | null;
export function limitOf(base: number, kind: 'firstMs' | 'usableMs' | 'tapMs'): number;
export function speedVerdict(page: string, today: Timings, base: Timings | null | undefined): { ok: boolean; slower: string[]; lines: string[] };
