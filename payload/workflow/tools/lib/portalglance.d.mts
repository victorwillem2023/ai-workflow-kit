import type { CardFacts } from './boardview.mjs';
export function rich(text: string, repo?: string | null): string;
export function glanceHtml(g: {
  project: string; repo?: string | null; styled?: boolean; shipped?: number | null;
  stage?: { title: string; command: string | null; time: string | null }[];
  phase?: { phase: string; facts?: string[]; status?: string; next: string | null; needs: { what: string; short?: string; how?: string; done: boolean }[] } | null;
  board?: { tie: CardFacts[]; next: CardFacts[]; waiting: { number: number; waitsFor: number[]; url: string | null }[]; loops?: number[][];
    unranked: number; inbox: number; decisions: { kind: string; title: string; hint: string; what: string; suggest: string; cards: number[] }[] } | null;
  boardNote?: string; boardAge?: string; asked?: string | null;
  decisions?: { path: string; title: string; date: string; ts?: number }[]; recent?: { path: string; title: string; date: string; ts?: number }[];
}): string;
