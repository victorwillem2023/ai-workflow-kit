type Paths = { passed: string; flaky: string; cards: string; gates: string };
export function recordPaths(gitOk: (...args: string[]) => string | null): Paths;
export function flakyNow(paths: Paths): string[];
export function runTests(ctx: {
  config: Record<string, any>; plan: { mode: string; files: string[]; note: string; whole?: boolean };
  graph: { files: Map<string, string>; imports: Map<string, Iterable<string>> }; changed: string[]; levels: { cache: string };
  isTest: (file: string) => boolean; run: (cmd: string, cwd?: string, env?: Record<string, string>) => { ok: boolean; out: string };
  readIf: (file: string) => string | null; paths: Paths; fresh: boolean;
}): { r: { ok: boolean; out?: string; note?: string }; seconds: number };
export function withLock<T>(lock: string, fn: () => T): T;
