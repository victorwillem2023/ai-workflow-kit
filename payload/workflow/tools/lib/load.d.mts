type Load = { url?: string; headers?: Record<string, string>; paths?: string[]; requests?: { name?: string; method?: string; path: string; body?: unknown; headers?: Record<string, string> }[]; users?: number; duration?: string; soak?: string };
type Goals = { p95ms?: number; errorRate?: number };
export const KINDS: Record<'smoke' | 'load' | 'stress' | 'spike' | 'soak', string>;
export function stagesFor(kind: string, load?: Load): { duration: string; target: number }[];
export function k6Script(kind: string, load?: Load, goals?: Goals): string;
export function readSummary(summary: unknown, kind: string, goals?: Goals): { ok: boolean; lines: string[] };
