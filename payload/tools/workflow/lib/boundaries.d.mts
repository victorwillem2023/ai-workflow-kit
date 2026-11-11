import type { Graph } from './graph.mjs';
export interface Rule { name: string; from: string; forbid?: string[]; forbidNode?: boolean }
export interface Violation { rule: string; file: string; target: string; key: string }
export function findViolations(graph: Graph, rules: Rule[]): Violation[];
export function newViolations(all: Violation[], baselineKeys: string[]): Violation[];
