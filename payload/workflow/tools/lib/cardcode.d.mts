import type { Hotspot } from './hotspots.mjs';
import type { ShipRecord } from './shipped.mjs';
type Card = { number: number; title: string; state: string; labels: string[]; body?: string | null };
export function filesNamed(text: string | null | undefined): string[];
export function codeAdvice(card: Card, o?: { spots?: Hotspot[]; records?: ShipRecord[]; areas?: string[]; open?: Card[]; health?: string }): { file: string; kind: string; card: number | null; line: string } | null;
