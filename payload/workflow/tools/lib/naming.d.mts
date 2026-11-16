type Rule = { glob: string; style: string; except?: string[] };
type Problem = { key: string; line: string };
type Sorted = { file: string; keys: string[] };
type Resource = { glob: string; pattern: string; say?: string };
export function hasStyle(name: string, style: string): boolean;
export function baseName(path: string): string;
export function badFileNames(paths: string[], rules: Rule[] | undefined, matches: (p: string, globs: string[]) => boolean): Problem[];
export function badExports(path: string, text: string): Problem[];
export function unsortedKeys(path: string, text: string, keys?: string[]): Problem[];
export function badResourceNames(path: string, text: string, rule: Resource): Problem[];
export function namingProblems(
  naming: { files?: Rule[]; exports?: string[]; sorted?: Sorted[]; resources?: Resource[] } | undefined,
  paths: string[],
  files: Map<string, string>,
  matches: (p: string, globs: string[]) => boolean,
  read?: (p: string) => string | null,
): Problem[];
