export interface Check { name: string; command: string; when?: string[]; all?: boolean; setup?: string }
export interface Together { name: string; when: string[]; needs: string[] }
export function dueChecks(checks?: Check[], changed?: string[], all?: boolean): { check: Check; due: boolean; why: string }[];
export function missingPartners(rules?: Together[], changed?: string[]): { name: string; changed: string[]; needs: string[] }[];
