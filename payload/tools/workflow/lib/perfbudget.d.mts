type Verdict = { ok: boolean; kb: number; maxKb: number; biggest: { path: string; kb: number }[] };
export function weighPages(files: { path: string; gzipBytes: number }[], maxKb: number): Verdict;
export function weightLine(v: Verdict): string;
