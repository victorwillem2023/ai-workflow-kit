export function functionsIn(file: string, text: string): { name: string; from: number; to: number }[];
export function longFunctions(files: Map<string, string>, max: number): Record<string, number>;
export function copiedFunctions(files: Map<string, string>, minLines?: number): string[][];
export function deepFunctions(files: Map<string, string>, max: number): Record<string, number>;
export function copiedTests(files: Map<string, string>, minLines?: number): string[][];
