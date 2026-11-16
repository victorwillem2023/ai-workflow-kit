type Change = { file: string; status: string };
export function parseCovers(text: string): { globs: string[]; newOnly: boolean }[];
export function waived(doc: string, waivers: string): boolean;
export function staleDocs(a: { docs: Map<string, string>; changes: Change[]; matches: (f: string, globs: string[]) => boolean; waivers?: string; ignore?: string[] }): { doc: string; files: string[] }[];
export function parseNameStatus(text: string, untracked?: string[]): Change[];
