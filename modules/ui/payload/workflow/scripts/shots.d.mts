export interface ShotOptions { page: string; width: number; height: number; theme: 'light' | 'dark'; click: string[]; press: string[]; wait: number; full: boolean; out: string }
export function parseShotArgs(argv: string[]): ShotOptions;
export function findChrome(env?: Record<string, string | undefined>, platform?: string, exists?: (p: string) => boolean): string;
