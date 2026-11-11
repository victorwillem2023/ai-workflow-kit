export function lineCount(text: string): number;
export function oversize(files: Map<string, string>, max: number): Record<string, number>;
export function sizeVerdict(
  sizes: Record<string, number>,
  baseline: Record<string, number>,
): {
  failing: { file: string; lines: number }[];
  grown: { file: string; was: number; now: number }[];
  shrunk: string[];
};
