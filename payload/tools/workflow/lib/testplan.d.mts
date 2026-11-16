export const KIT_TESTS: string[];
export const KIT_MACHINERY: string[];
export function testPlan(o: {
  whole: boolean; unknown: boolean; reached: string[]; allTests: string[]; changed: string[]; forced: boolean; skipKit?: boolean;
  matches: (f: string, globs: string[]) => boolean; kitTests?: string[]; kitMachinery?: string[]; maxFiles?: number;
}): { mode: 'suite' | 'files' | 'none'; files: string[]; whole: boolean; note: string };
