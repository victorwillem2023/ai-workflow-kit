type Card = { number: number; title: string; state: string; labels: string[]; column?: string | null; body?: string | null };
export type Plan = { waves: { card: number; why: string }[][]; outside: { card: number; on: number[] }[]; stuck: number[]; loops: number[][]; unknown: number[] };
export type Growth = { grew: number[]; parked: number[] } | null;
export function wavesOf(goal: number[], options: { all: Card[]; files?: Map<number, string[]> }): Plan;
export function growthOf(focus: { picked?: number[]; parked?: number[] } | null, cardsNow: number[]): Growth;
export function planLines(plan: Plan, options?: { name?: string; finish?: string; growth?: Growth; since?: string; byNo?: Map<number, Card> }): string[];
export function waveLine(plan: Plan): string;
export function growthLine(growth: Growth): string;
