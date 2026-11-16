export const CHECKLIST: string[];
export const KEY_FILE: string;
type Row = { date: string; who: string; fingerprint: string; files: string[]; seal: string | null };
export function sensitiveFiles(changed: string[], paths: string[], matches: (f: string, globs: string[]) => boolean): string[];
export function fingerprint(files: string[], read: (f: string) => string | null | undefined): string;
export function seal(key: string, r: { date: string; who: string; print: string }): string;
export function parseSignoffs(md: string | null | undefined): Row[];
export function signoffRow(r: { date: string; who: string; print: string; files: string[]; key: string }): string;
export function signoffVerdict(a: {
  changed: string[];
  paths: string[];
  matches: (f: string, globs: string[]) => boolean;
  read: (f: string) => string | null | undefined;
  signoffs: string | null | undefined;
  /** this computer's key; null where there is none (only allowed on CI: the gate passes null there) */
  key?: string | null;
}): { ok: boolean; files: string[]; print?: string; line?: string; unchecked?: boolean };
