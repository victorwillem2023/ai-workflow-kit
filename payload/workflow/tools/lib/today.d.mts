type Card = { number: number; title: string; labels: string[]; column?: string | null; state: string; body?: string };
export type Today = { limit: number; count: number; free: number; sessions: number[][]; after: { card: number; by: number | string; place?: string; running?: boolean; needs?: boolean }[]; unknown: number[] };
export function today(ranked: Card[], options?: { all?: Card[]; places?: Map<number, string[]>; areas?: string[]; limit?: number; sessions?: { topic: string; cards: number[]; finished?: boolean }[] | null; perSession?: number; claims?: Map<number, string[]>; written?: Map<number, string[]>; held?: { topic: string; cards?: number[]; files: string[] }[] }): Today;
export function todayLines(t: Today, options?: { show?: number }): string[];
export function touchedParts(body: string | null | undefined): string[];
export function besideLine(t: Today, number: number): string;
