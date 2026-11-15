type Card = { number: number; title: string; state: string; labels: string[]; column: string | null; body?: string | null };
type Ranked = Card & { score: number; v1: boolean; why: string; unlocks?: number; on?: number[] };
export const STARTABLE: string[];
export const BUILT: string[];
export function scoreCard(card: Card, firstVersion?: string): Ranked;
export function rankCards(cards: Card[], o?: { firstVersion?: string; columns?: string[]; built?: string[] }): Ranked[];
export function waitingCards(cards: Card[], o?: { columns?: string[]; built?: string[] }): { waiting: { number: number; title: string; waitsFor: number[] }[]; loops: number[][]; unknown: Map<number, number[]> };
export const TOOL_ISSUES: string[];
export function inbox(cards: Card[], ignoreLabels?: string[], ignoreTitles?: string[]): Card[];
