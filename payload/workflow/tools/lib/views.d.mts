type Files = Map<string, string>;
export function stateFields(source: string, name: string): string[] | null;
export function readsField(text: string, field: string, names?: string[]): boolean;
export function onlyOf(line: string): { views: string[]; why: string } | null;
export function viewGaps(fields: string[], views: Record<string, Files>, only?: Record<string, string>, at?: string, names?: string[]): string[];
export type ViewsEntry = { state?: string; fields?: string[]; views?: Record<string, string | string[]>; shared?: string[]; only?: Record<string, string>; names?: string | string[] };
export function viewsCheck(entries: ViewsEntry[], options: { files: string[]; read: (file: string) => string | null; matches: (file: string, globs: string[]) => boolean }): string[];
