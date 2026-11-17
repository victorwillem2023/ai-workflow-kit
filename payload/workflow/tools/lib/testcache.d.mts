type Graph = { imports: Map<string, Iterable<string>>; files: Map<string, string> };
export function testKey(test: string, graph: Graph, salt?: string): string;
export function cacheSalt(texts: Iterable<[string, string | null]>): string;
export function splitByCache(tests: string[], keys: Record<string, string>, passed?: Record<string, string>): { run: string[]; skipped: string[] };
export function recordPasses(passed: Record<string, string> | undefined, ran: string[], keys: Record<string, string>): Record<string, string>;
