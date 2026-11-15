export type OutOfDate = { name: string; want: string; have: string | null };
export function packagesOutOfDate(lockText: string, installedVersion: (name: string) => string | null): OutOfDate[];
export function checkPackages(dir: string): OutOfDate[];
export function describeMissing(list: OutOfDate[]): string;
