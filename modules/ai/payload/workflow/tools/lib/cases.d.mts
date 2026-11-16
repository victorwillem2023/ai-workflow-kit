type Case = { name: string; feature?: string; input?: Record<string, unknown>; hostile?: boolean; expect?: { includes?: string[]; excludes?: string[]; refused?: boolean; match?: string } };
export function judgeCase(c: Case, out: { value?: unknown; refused?: boolean; reason?: string }): { ok: boolean; why?: string };
export function casesReport(results: { file: string; name: string; hostile?: boolean; ok: boolean; why?: string }[]): string;
