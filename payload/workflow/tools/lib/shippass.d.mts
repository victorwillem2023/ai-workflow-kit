export function treeOf(dir: string): string;
export function recordShipPass(dir: string, tree?: string): void;
export function shipPassOf(dir: string): string | null;
export function recordGatePass(dir: string, key: string, advice?: string[]): void;
export function gatePassOf(dir: string): string | null;
export function gatePassAdvice(dir: string): string[];
export function isTreeish(dir: string, ref: string): boolean;
export function untrackedInputs(dir: string): string;
export function changedSince(dir: string, tree: string): string[];
