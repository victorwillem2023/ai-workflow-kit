export interface Run { name?: string; at?: string; tolerance?: Record<string, number>; cases: { id: string | number; values?: Record<string, unknown>; items?: { id: string | number; values?: Record<string, unknown> }[] }[] }
export interface Moved { name: string; before: unknown; after: unknown; how: 'lost' | 'gained' | 'changed' }
export interface Diff { same: boolean; cases: { id: string; added?: boolean; removed?: boolean; values: Moved[]; items: { gained: string[]; lost: string[]; moved: { id: string; values: Moved[] }[] } }[] }
export function shapeProblems(r: unknown): string[];
export function compareRuns(before: Run, after: Run): Diff;
export function compareLines(diff: Diff, options?: { before?: string; after?: string; total?: number }): string;
