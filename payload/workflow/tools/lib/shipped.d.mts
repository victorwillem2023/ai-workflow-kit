export interface ShipRecord { at: string; topic: string; cards: number[]; subject: string; started: string | null; days: number | null; files: string[]; lines: number; effort: string | null; areas: string[]; type: string | null; tokens: number | null; kit?: string | null; rounds: number | null; review: Record<string, number> | null; hard: { file: string; why: string }[] }
export interface Measured { n: number; by: Record<string, { n: number; lines: number; files: number; rounds: number | null; days: number | null; tokens: number | null }>; cost: { small: number; medium: number; large: number; measured: string[] } | null; areas: Record<string, number>; outliers: ShipRecord[] }
export const FILE: string;
export const FINDINGS: string[];
export function parseNumstat(text: string): { file: string; lines: number }[];
export function shipRecord(input: { topic: string; cards?: (number | string)[]; subject?: string; at?: Date | string; started?: Date | string | null; numstat?: string; labels?: string[]; areas?: string[]; types?: string[]; tokens?: number | null; kit?: string | null }): ShipRecord;
export function parseRecords(text: string | null | undefined): ShipRecord[];
export function recordsText(records: ShipRecord[]): string;
export function addRecord(records: ShipRecord[], record: ShipRecord): ShipRecord[];
export function parseReview(text: string | null | undefined): Record<string, number> | null;
export function parseHard(text: string | null | undefined): { file: string; why: string } | null;
export function withNote(records: ShipRecord[], topic: string, note?: { rounds?: number | null; review?: Record<string, number> | null; hard?: ({ file: string; why: string } | null)[] }): { records: ShipRecord[]; found: boolean };
export function calibrate(records: ShipRecord[], o?: { min?: number }): Measured;
export function hardFiles(records: ShipRecord[], o?: { min?: number }): { file: string; cards: string[]; whys: string[] }[];
export function areaFiles(records: ShipRecord[], area: string, o?: { last?: number }): { file: string; of: number; total: number }[];
export function reviewPatterns(records: ShipRecord[], o?: { last?: number }): { kind: string; say: string; cards: number; of: number }[];
export function kitLine(records: ShipRecord[], o?: { min?: number }): string | null;
export function tookLines(all: ShipRecord[], o?: { since?: Date | null; min?: number }): string[];
