export interface Claim { topic: string; cards: number[]; dir?: string; on?: string; spec?: string; files: string[] }
export function setTouches(body: string | null | undefined, paths: string[]): string;
export function looksLikeFile(p: string): boolean;
export function touchedPaths(body: string | null | undefined): string[];
export function claimOf(parts?: { spec?: string; touches?: string[]; changed?: string[] }, never?: string[]): string[];
export function specFiles(spec: string | null | undefined): string[];
export const DOCS: string[];
export function settledFiles(config?: Record<string, any>): string[];
export function sharedFiles(claudeMd: string | null | undefined): string[];
export function meet(a: string[], b: string[]): string[];
export function clashes<T extends Claim>(mine: string[], others: T[], options?: { skip?: string[] }): T[];
export function stackOf(topic: string, all: { topic: string; on?: string }[], on?: string): string[];
export function clashMessage(topic: string, card: string | undefined, found: Claim[], options?: { stack?: boolean }): string;
export function clashAdvice(found: Claim[]): string[];
export function specSection(spec: string | null | undefined, heading: string, max?: number): string;
export function besideNote(topic: string, found: Claim[]): string;
