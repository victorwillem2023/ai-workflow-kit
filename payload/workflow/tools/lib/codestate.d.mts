import type { Fix, Hotspot } from './hotspots.mjs';
export function codeHotspots(root: string, config: any, options?: { bugs?: { number: number; area?: string | null }[]; closed?: Fix[]; days?: number; n?: number }): Hotspot[];
export function recentFixes(root: string, closed?: Fix[]): Fix[];
export function shippedFile(root: string): string | null;
export function shippedRecords(root: string): import('./shipped.mjs').ShipRecord[];
