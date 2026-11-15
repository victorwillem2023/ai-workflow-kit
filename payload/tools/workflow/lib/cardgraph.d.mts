interface Card { number: number; state: string; column: string | null; body?: string | null }
export function dependsOnLines(body: string | null | undefined): string;
export function addDepends(body: string | null | undefined, numbers: number[]): string;
export function renderTree(cards: Card[] & { title?: string }[]): string;
export function dependsOn(body: string | null | undefined): number[];
export function cardGraph(cards: Card[]): { waitsFor: Map<number, number[]>; unlocks: Map<number, number>; unknown: Map<number, number[]>; loops: number[][] };
