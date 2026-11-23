import type { Browser } from './browser.mjs';
export interface WalkStep { go?: string; type?: string; text?: string; click?: string; press?: string; see?: string; gone?: string; within?: number }
export interface Walk { path: string; width: number; steps: WalkStep[] }
export const DIR: string;
export function readWalk(text: string, name?: string): Walk;
export function sayStep(step: WalkStep): string;
export function walksOn(levels: string | null): boolean;
export function walk(b: Browser, base: string, w: Walk): Promise<string>;
