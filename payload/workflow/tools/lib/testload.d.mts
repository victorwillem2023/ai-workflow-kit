export function shareOfCores(cores: number, others: number): number;
export function concurrencyOption(commands?: { testFiles?: string; testConcurrency?: string }): string | null;
export function noteRun(dir: string): { others: number; done: () => void };
