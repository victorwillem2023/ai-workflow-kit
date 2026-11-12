export function lineCount(text: string): number;
export function oversize(files: Map<string, string>, max: number): Record<string, number>;
export function sizeVerdict(
  sizes: Record<string, number>,
  baseline: Record<string, number>,
  reasons?: Record<string, string>,
): {
  failing: { file: string; lines: number; was?: number }[];
  grown: { file: string; was: number; now: number }[];
  shrunk: string[];
  stale: string[];
};
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
  verdict: { grown: { file: string; was: number; now: number }[] },
  reasons?: Record<string, string>,
): string;
