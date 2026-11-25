type Verdict = { ok: boolean; kb: number; maxKb: number; baselineKb: number | null; limitKb: number; biggest: { path: string; kb: number }[] };
export const ROOM: number;
export function weighPages(files: { path: string; gzipBytes: number }[], maxKb: number, baselineKb?: number | null): Verdict;
export function weightLine(v: Verdict, page?: string): string;
export function pageRoots(globs: string[] | undefined, listHtml: (dir: string) => string[]): string[];
export function builtPages(perf: { maxKb?: number; pages?: { name?: string; html: string; root?: string; base?: string; maxKb?: number }[] } | undefined, roots: string[], listHtml: (dir: string) => string[]): { name: string; html: string; root: string; base: string; maxKb: number }[];
export function startupFiles(html: string, htmlPath: string, read: (path: string) => string | null): { files: string[]; missing: string[] };
