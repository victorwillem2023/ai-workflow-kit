export function shipping(commits: { date: string; subject: string }[], now?: Date, weeks?: number): { weeks: { week: string; features: number }[]; streak: number };
export function healthMoves(then: Record<string, unknown> | null, now: Record<string, unknown> | null, testsThen: number | null, testsNow: number | null): string[];
export function signsDue(
  issues: { number: number; title: string; comments?: { body?: string }[] }[] | null | undefined,
  now?: Date,
): { number: number; title: string; sign: string; on: string }[];
export function signsDueInProduct(md: string | null | undefined, now?: Date): { sign: string; on: string; what: string }[];
