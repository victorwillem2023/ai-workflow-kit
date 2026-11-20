import type { Hotspot } from './hotspots.mjs';
export function codeHotspots(root: string, config: any, options?: { bugs?: { number: number; area?: string | null }[]; days?: number; n?: number }): Hotspot[];
