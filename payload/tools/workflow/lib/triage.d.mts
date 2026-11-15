interface Card { number: number; title: string; state: string; labels: string[]; column: string | null; createdAt?: string | null; updatedAt?: string | null }
interface Finding { kind: string; what: string; cards: Card[]; suggest: string }
interface Triage { focus: { finish: Card[]; start: (Card & { why: string; score: number })[] }; findings: Finding[]; counts: { open: number; doing: number; inbox: number; backlog: number } }
export function likelyDuplicates(cards: Card[], threshold?: number): [Card, Card][];
export function triage(cards: Card[], options?: { now?: Date; wip?: number; staleDays?: number; waitDays?: number; backlogMax?: number; firstVersion?: string; columns?: string[] }): Triage;
export function renderTriage(t: Triage): string;
export function triageLine(t: Triage): string;
