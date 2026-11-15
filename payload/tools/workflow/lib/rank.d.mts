type Card = { number: number; title: string; state: string; labels: string[]; column: string | null };
type Ranked = Card & { score: number; v1: boolean; why: string };
export const STARTABLE: string[];
export function scoreCard(card: Card, firstVersion?: string): Ranked;
export function rankCards(cards: Card[], o?: { firstVersion?: string; columns?: string[] }): Ranked[];
export function inbox(cards: Card[], ignoreLabels?: string[]): Card[];
