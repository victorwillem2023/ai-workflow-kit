type Verdict = { ok: boolean; kb: number; maxKb: number; baselineKb: number | null; limitKb: number; biggest: { path: string; kb: number }[] };
export const ROOM: number;
export function weighPages(files: { path: string; gzipBytes: number }[], maxKb: number, baselineKb?: number | null): Verdict;
export function weightLine(v: Verdict): string;
