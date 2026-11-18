export type OutOfDate = { name: string; want: string; have: string | null };
export function packagesOutOfDate(lockText: string, installedVersion: (name: string) => string | null): OutOfDate[];
export function checkPackages(dir: string): OutOfDate[];
export function describeMissing(list: OutOfDate[]): string;
export function packagesFix(dir: string, list: OutOfDate[]): string;
export type Shortcut = { pkg: string; bin: string };
export function missingShortcuts(pkg: Record<string, unknown>, manifest: (name: string) => Record<string, unknown> | null, hasShortcut: (bin: string) => boolean): Shortcut[];
export function checkShortcuts(dir: string): Shortcut[];
