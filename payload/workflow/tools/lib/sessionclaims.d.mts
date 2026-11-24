import type { Claim } from './claims.mjs';
export function mainOf(dir: string): string;
export function neverIn(main: string): string[];
export function specOf(main: string, topic: string, dir?: string): string;
export function changedIn(dir: string, on?: string): string[];
export function sessionClaims(main?: string): (Claim & { dir: string; on: string; spec: string })[];
