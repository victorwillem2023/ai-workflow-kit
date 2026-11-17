export const SURFACES: Record<string, { what: string; web?: boolean; app?: string; widths: number[] }>;
export const DEFAULT_SURFACES: string[];
export function surfacesOf(config: unknown): { names: string[]; problems: string[] };
export function hasWeb(names: string[]): boolean;
export function widthsOf(names: string[]): number[];
export function appsOf(names: string[]): string[];
export function surfacesLine(names: string[]): string;
