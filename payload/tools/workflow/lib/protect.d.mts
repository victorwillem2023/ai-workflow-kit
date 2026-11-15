export const RULE_NAME: string;
export function ruleset(flow?: string): { name: string; target: string; enforcement: string; conditions: unknown; rules: { type: string }[] };
export function verdict(status: number | null, out: string): { ok: boolean; line: string };
export function hookText(flow?: string): string;
