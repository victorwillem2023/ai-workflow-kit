import type { CardFacts } from './boardview.mjs';
export function rich(text: string, repo?: string | null): string;
export function productIntro(readme: string): { lead: string; text: string };
export function guideParts(guide: string, from?: string): { title: string; path: string; what: string }[];
export function glanceHtml(g: {
  project: string; repo?: string | null; styled?: boolean; shipped?: number | null;
  stage?: { title: string; command: string | null; time: string | null }[];
  phase?: { phase: string; facts?: string[]; status?: string; next: string | null; needs: { what: string; short?: string; how?: string; done: boolean }[] } | null;
  board?: { tie: CardFacts[]; next: CardFacts[]; waiting: { number: number; waitsFor: number[]; url: string | null }[]; loops?: number[][];
    unranked: number; inbox: number; focus?: string | null; was?: string | null; decisions: { kind: string; title: string; hint: string; what: string; suggest: string; cards: number[] }[] } | null;
  boardNote?: string; boardAge?: string; asked?: string | null;
  decisions?: { path: string; title: string; date: string; ts?: number }[]; recent?: { path: string; title: string; date: string; ts?: number }[];
  product?: { lead: string; text: string; parts?: { title: string; path: string; what: string }[] };
}): string;
