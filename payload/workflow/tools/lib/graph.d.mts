export interface Graph {
  files: Map<string, string>;
  known: Set<string>;
  imports: Map<string, string[]>;
  nodeImports: Map<string, string[]>;
  importedBy: Map<string, Set<string>>;
  /** what each file names from outside the project, as written (`express`, `std::fs`) */
  uses: Map<string, string[]>;
}
export function importsOf(text: string): string[];
export function isNodeModule(spec: string): boolean;
export interface Alias { dir: string; pattern: string; targets: string[] }
export function aliasesFrom(tsconfigText: string, dir?: string): Alias[];
export function projectAliases(apps: { root?: string }[] | undefined, read: (path: string) => string | null): Alias[];
export function aliasesOfFile(file: string, read: (path: string) => string | null, scope?: string): Alias[];
export function resolveImport(from: string, spec: string, known: Set<string>, aliases?: Alias[]): string | null;
export function rustUses(text: string): string[];
export function resolveRust(from: string, text: string, known: Set<string>): string[];
export function resolvePython(from: string, text: string, known: Set<string>): { files: string[]; uses: string[] };
export function resolveGo(from: string, text: string, known: Set<string>): { files: string[]; uses: string[] };
export function buildGraph(files: Map<string, string>, others?: string[], opts?: { aliases?: Alias[] }): Graph;
export function affectedTests(
  graph: Graph,
  changed: string[],
  opts: { isTest: (file: string) => boolean; ignore?: string[]; isCode?: (file: string) => boolean; naming?: Record<string, string>; depth?: number },
): { tests: string[]; all: boolean };
