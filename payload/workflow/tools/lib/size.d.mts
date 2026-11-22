export function lineCount(text: string): number;
export function isPlumbing(line: string): boolean;
export function workLineCount(text: string): number;
export function limitOf(settings: { maxLines: number; maxWorkLines?: number }, count?: (text: string) => number): number;
export function measureOf(baseline: { sizeMeasure?: string; sizes?: Record<string, number> } | null | undefined): (text: string) => number;
export function oversize(files: Map<string, string>, max: number, count?: (text: string) => number): Record<string, number>;
export function sizeVerdict(
  sizes: Record<string, number>,
  baseline: Record<string, number>,
  reasons?: Record<string, string>,
  allowance?: { allowance?: number; total?: number; used?: Record<string, number> },
): {
  failing: { file: string; lines: number; was?: number; capped?: boolean }[];
  grown: { file: string; was: number; now: number }[];
  allowed: { file: string; was: number; now: number; by: number; used: number }[];
  shrunk: string[];
  stale: string[];
};
export function sizeSetup(
  files: Map<string, string>,
  settings: { maxLines: number; maxWorkLines?: number; include: string[]; allowance?: number; allowanceTotal?: number },
  baseline: { sizeMeasure?: string; sizes?: Record<string, number>; allowed?: Record<string, { card: number | string | null; lines: number }[]> },
  matches: (file: string, globs: string[]) => boolean,
): { sizeFiles: Map<string, string>; limit: number; sizes: Record<string, number>; allow: { allowance: number; total: number; used: Record<string, number>; verdict?: ReturnType<typeof sizeVerdict> } };
export function allowanceUsed(allowed?: Record<string, { card: number | string | null; lines: number }[]>): Record<string, number>;
export function takeAllowance<B extends { sizes?: Record<string, number>; allowed?: Record<string, { card: number | string | null; lines: number }[]> }>(
  baseline: B,
  allowed: { file: string; now: number; by: number }[],
  card: number | string | null,
): B;
export function switchToWork(
  work: Record<string, number>,
  old: { sizeMeasure?: string; sizes?: Record<string, number>; reasons?: Record<string, string> },
  lines: Map<string, number>,
  maxLines: number,
  reason: string | null,
): ReturnType<typeof updateSizes> & { joined: string[] };
export function updateSizes(
  sizes: Record<string, number>,
  old: Record<string, number>,
  reason: string | null,
  oldReasons?: Record<string, string>,
): {
  ok: boolean;
  raised: { file: string; was: number | null; now: number }[];
  next?: Record<string, number>;
  nextReasons?: Record<string, string>;
  message?: string;
};
export function sizeNote(
  sizes: Record<string, number>,
  verdict: { grown: { file: string; was: number; now: number }[]; allowed?: { file: string; by: number; used: number }[] },
  reasons?: Record<string, string>,
): string;
