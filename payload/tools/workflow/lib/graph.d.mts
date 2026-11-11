export interface Graph {
  files: Map<string, string>;
  known: Set<string>;
  imports: Map<string, string[]>;
  nodeImports: Map<string, string[]>;
  importedBy: Map<string, Set<string>>;
}
export function importsOf(text: string): string[];
export function isNodeModule(spec: string): boolean;
export function resolveImport(from: string, spec: string, known: Set<string>): string | null;
export function buildGraph(files: Map<string, string>, others?: string[]): Graph;
export function affectedTests(
  graph: Graph,
  changed: string[],
  opts: { isTest: (file: string) => boolean; ignore?: string[] },
): { tests: string[]; all: boolean };
