export interface MemoryOptions { url: string; step: string; setup: string; ready: string; rounds: number; settle: number; width: number; detached: boolean; json: boolean }
export function parseMemoryArgs(argv: string[]): MemoryOptions;
export function verdict(first: { nodes: number; listeners: number; heapKB: number }, last: { nodes: number; listeners: number; heapKB: number }, rounds: number, slack?: number): { grows: boolean; per: { nodes: number; listeners: number; heapKB: number }; lines: string[] };
