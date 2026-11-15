export const CHECKLIST: string[];
export function sensitiveFiles(changed: string[], paths: string[], matches: (f: string, globs: string[]) => boolean): string[];
export function fingerprint(files: string[], read: (f: string) => string | null | undefined): string;
export function parseSignoffs(md: string | null | undefined): { date: string; who: string; fingerprint: string; files: string[] }[];
export function signoffRow(r: { date: string; who: string; print: string; files: string[] }): string;
export function signoffVerdict(a: {
  changed: string[];
  paths: string[];
  matches: (f: string, globs: string[]) => boolean;
  read: (f: string) => string | null | undefined;
  signoffs: string | null | undefined;
}): { ok: boolean; files: string[]; print?: string; line?: string };
