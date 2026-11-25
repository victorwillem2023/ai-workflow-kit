import type { Browser } from './browser.mjs';
export interface WalkStep { name?: string; go?: string; type?: string; text?: string; click?: string; press?: string; swipe?: 'left' | 'right' | 'up' | 'down'; on?: string; see?: string; gone?: string; within?: number }
export interface Walk { path: string; width: number; steps: WalkStep[]; open?: string }
export const DIR: string;
export function readWalk(text: string, name?: string): Walk;
export function sayStep(step: WalkStep): string;
export function walksOn(levels: string | null): boolean;
export function prepareWalk(b: Browser, w: Walk): Promise<void>;
export function startWalk(b: Browser, base: string, w: Walk): Promise<void>;
export function runStep(b: Browser, base: string, s: WalkStep): Promise<string>;
export function walk(b: Browser, base: string, w: Walk): Promise<string>;
