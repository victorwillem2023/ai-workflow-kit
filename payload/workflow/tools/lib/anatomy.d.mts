export interface Check { file: string; line: number; field: string; value: string; shared?: boolean }
export interface Flow { name: string; from: string; files: Set<string>; values?: string[]; flags?: string[]; field?: string; checks?: Check[] }
export interface Row { name: string; from: string; files: number; fileList: string[]; spread: number; kindChecks: Check[]; ratchets: { file: string; name: string; n: number }[];
  rules: { what: string; value: string; places: { file: string; line: number; name?: string }[] }[]; alikes: { a: { file: string; name: string; line: number }; b: { file: string; name: string; line: number }; alike: number }[];
  fixes: string[]; score: number; page: { slug: string; lookedAt: string | null } | null }
export function slug(s: string): string;
export function namedFlows(codeFiles: string[], options?: { named?: Record<string, string[] | { files?: string[]; values?: string[]; flags?: string[] }> | null; match?: (f: string, globs: string[]) => boolean; kinds?: Record<string, string[]>; partFiles?: Record<string, string[]> }): Flow[];
export function comparisons(files: Map<string, string>): Check[];
export function codeKinds(all: Check[], options?: { spread?: number }): Flow[];
export function flagsOf(flow: Flow, files: Map<string, string>): Check[];
export function checksOf(flow: Flow, kinds: Flow[], flags?: Check[]): Check[];
export function fixesPerFlow(flows: Flow[], fixes: { id: string; at: string | null; files: string[] }[], options?: { days?: number; now?: Date }): Map<string, string[]>;
export function scoreFlows(flows: Flow[], kinds: Flow[], found: { flags?: Map<string, Check[]>; ratchets?: { file: string; name: string; n: number }[]; rules: Row['rules']; alikes: Row['alikes']; fixes: Map<string, string[]> }, pages?: { slug: string; lookedAt: string | null }[]): Row[];
export function pageStates(pages: { name: string; text: string }[]): { slug: string; lookedAt: string | null }[];
export function anatomyLine(pages: { slug: string; lookedAt: string | null }[], codeFiles: number, options?: { every?: number; now?: Date }): string | null;
export function anatomyTable(rows: Row[], n?: number): string;
export function flowDetail(r: Row): string;
