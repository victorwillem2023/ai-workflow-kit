export function importCycles(imports: Map<string, string[]>): string[][];
export function untestedFiles(graph: { imports: Map<string, string[]> }, isSource: (f: string) => boolean, isTest: (f: string) => boolean): string[];
