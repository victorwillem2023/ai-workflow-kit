export type FileLines = { file: string; hit: number; found: number };
export type Summary = { percent: number; files: number; lines: number; least: { file: string; percent: number; lines: number; missed: number }[] };
export function readLcov(text: string): FileLines[];
export function coverageSummary(files: FileLines[], o?: { root?: string; least?: number }): Summary;
export function coverageLines(s: Summary): string[];
