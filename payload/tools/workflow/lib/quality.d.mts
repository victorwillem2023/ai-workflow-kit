export interface Score { pass: number; total: number | null }
export function parseScore(out: string, pattern?: string): Score | null;
export function qualityVerdict(score: Score | null, was?: { pass?: number } | null): { ok: boolean; out?: string; note?: string };
