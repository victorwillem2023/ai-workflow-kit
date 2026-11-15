type Card = { number: number; title: string; state: string; labels: string[]; column: string | null; body?: string | null };
type Ranked = Card & { score: number; v1: boolean; why: string; unlocks?: number };
export const STARTABLE: string[];
export function scoreCard(card: Card, firstVersion?: string): Ranked;
export function rankCards(cards: Card[], o?: { firstVersion?: string; columns?: string[] }): Ranked[];
export function waitingCards(cards: Card[], o?: { columns?: string[] }): { waiting: { number: number; title: string; waitsFor: number[] }[]; loops: number[][]; unknown: Map<number, number[]> };
export const TOOL_ISSUES: string[];
export function inbox(cards: Card[], ignoreLabels?: string[], ignoreTitles?: string[]): Card[];
