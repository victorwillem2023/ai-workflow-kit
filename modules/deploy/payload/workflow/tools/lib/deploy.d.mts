export interface Health { up: boolean; version: string | null }
export type Get = (url: string) => Promise<{ status: number; body: string }>;
export function fill(command: string | undefined, version: string): string;
export function healthUrl(url: string, path?: string): string;
export function versionOf(body: string): string | null;
export function ask(get: Get, url: string): Promise<Health>;
export function waitFor(get: Get, url: string, want: string | null, o: { tries: number; pause: () => Promise<void> }): Promise<Health & { ok: boolean }>;
export function previous(log: string[], live: string | null): string | null;
export function watchDeploy(get: Get, url: string, want: string, o: { checks: number; pause: () => Promise<void>; maxMisses?: number; errorsOk?: () => Promise<boolean> }): Promise<{ ok: boolean; misses: number; checks: number; why?: string }>;
