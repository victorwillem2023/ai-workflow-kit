export type CardFacts = { number: number; title: string; column: string | null; type: string | null; value: string | null; effort: string | null;
  feasibility: string | null; score: number | null; v1: boolean; unlocks: number; on: number[]; url: string | null };
type Card = { number: number; title: string; column?: string; labels: string[]; score?: number; v1?: boolean; unlocks?: number; on?: number[] };
export function cardFacts(c: Card, repo?: string | null): CardFacts;
export function boardView(o: { ranked: Card[]; tie: Card[]; waiting: { number: number; title: string; waitsFor: number[] }[]; loops?: number[][];
  inboxCount?: number; triage?: { findings: { kind: string; what: string; suggest: string; cards: { number: number }[] }[]; counts: Record<string, number> };
  n?: number; repo?: string | null }): { tie: CardFacts[]; next: CardFacts[]; waiting: { number: number; title: string; waitsFor: number[]; url: string | null }[];
  loops: number[][]; unranked: number; inbox: number; decisions: { kind: string; what: string; suggest: string; cards: number[] }[]; counts: Record<string, number> | null };
