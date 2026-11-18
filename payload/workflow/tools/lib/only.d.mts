export function onlyFiles(args: string[]): string[] | null;
export function ownErrors(out: string, files: string[]): { mine: string[]; others: number };
export function onlyCheck(o: { files: string[]; typecheck: string; testFiles: string; tests: string[]; run: (cmd: string) => { ok: boolean; out: string } }): { ok: boolean; lines: string[] };
