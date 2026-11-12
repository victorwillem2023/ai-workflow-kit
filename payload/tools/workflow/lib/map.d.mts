import type { Graph } from './graph.mjs';
export function summaryOf(text: string): string;
export function renderMap(graph: Graph, folders: string[]): string;
export function sameMap(onDisk: string | null | undefined, fresh: string): boolean;
export function findInMap(text: string, words: string[], max: number): { lines: string[]; more: number };
export function withoutImports(line: string): string;
export function usesInMap(text: string, file: string, max: number): { lines: string[]; more: number };
