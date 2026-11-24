interface Card { number: number; title: string; state: string; labels: string[]; column: string | null; body?: string | null }
export interface Group { how: 'one session' | 'one after another' | 'side by side'; cards: number[]; why: string }
export function together(cards: Card[], options?: { all?: Card[]; places?: Map<number, Set<string> | string[]>; areas?: string[]; room?: number; claims?: Map<number, string[]>; written?: Map<number, string[]> }): Group[];
export function togetherLines(groups: Group[]): string[];
