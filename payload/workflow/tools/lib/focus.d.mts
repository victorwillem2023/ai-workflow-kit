interface Card { number: number; title: string; state: string; labels: string[]; column: string | null; createdAt?: string | null; updatedAt?: string | null; body?: string }
type Ranked = Card & { why: string; score: number; worth: number; v1: boolean };
export interface Focus { theme: string; cards: number[]; since?: string; goal?: string }
export interface Goal { id: string; name: string; kind: string; done: number; left: number; total: number; cards: number[]; uncarded: number; notes: string[]; due?: boolean }
export const DIRECTION: Record<string, string[]>;
export function sourcesFor(phase: string, own?: string[] | null): string[];
export function labelGoal(id: string, name: string, cards: Card[], labels: string[]): Goal;
export function healthGoal(cards: Card[], numbers?: Record<string, number>, seen?: Record<string, number> | null, options?: { health?: string; every?: number }): Goal;
export function suggestGoals(goals: Goal[], n?: number): Goal[];
export function goalCount(goal: Goal): string;
export function renderGoals(shown: Goal[], all?: Goal[]): string;
export function goalLine(goal: Goal, state: FocusState): string;
export interface Block { theme: string; cards: Ranked[]; more: number; days: number; v1: number; worth: number }
export interface Upkeep { due: boolean; shipped: number; open: number; never?: boolean }
export interface FocusState { theme: string; since: string | null; total: number; done: number; doing: Card[]; check: Card[]; left: Ranked[]; held: Card[]; finished: boolean }
export const HEALTH: string;
export function themeOf(card: Card, areas?: string[]): string;
export function proposeBlocks(cards: Card[], options?: { areas?: string[]; firstVersion?: string; size?: number; measured?: any }): Block[];
export function upkeepDue(cards: Card[], options?: { health?: string; every?: number }): Upkeep;
export function focusState(cards: Card[], focus: Focus, options?: { firstVersion?: string; measured?: any }): FocusState;
export interface SweepGroup { theme: string; cards: { number: number; title: string; column: string; missing: string[]; days: number }[] }
export function sweepGroups(cards: Card[], options?: { areas?: string[]; types?: string[]; now?: Date }): SweepGroup[];
export function renderSweep(groups: SweepGroup[], theme?: string | null, from?: number, size?: number): string;
export function toSort(cards: Card[], label: string): Card[];
export function expired(cards: Card[], options?: { now?: Date; days?: number; firstVersion?: string }): { number: number; title: string; days: number }[];
export function roomToStart(cards: Card[], limit?: number): { doing: Card[]; limit: number; room: number };
export function whereYouWere(cards: Card[]): string;
export function urgentOutside(cards: Card[], focus: Focus): Card[];
export function focusLine(state: FocusState): string;
export function renderBlocks(blocks: Block[], upkeep?: Upkeep, options?: { health?: string; show?: number }): string;
export function upkeepLine(upkeep: Upkeep, health?: string): string;
