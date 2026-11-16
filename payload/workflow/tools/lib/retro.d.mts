export function shipping(commits: { date: string; subject: string }[], now?: Date, weeks?: number): { weeks: { week: string; features: number }[]; streak: number };
export function healthMoves(then: Record<string, unknown> | null, now: Record<string, unknown> | null, testsThen: number | null, testsNow: number | null): string[];
