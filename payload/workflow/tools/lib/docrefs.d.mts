export interface StaleRef { doc: string; line: number; ref: string }
export function findStaleRefs(docs: Map<string, string>, exists: (path: string) => boolean, npmScripts: Iterable<string>): StaleRef[];
export function staleKey(s: StaleRef): string;
export function newStaleRefs(all: StaleRef[], baselineKeys: string[]): StaleRef[];
