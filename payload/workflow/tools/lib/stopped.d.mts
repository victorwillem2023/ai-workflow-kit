export const STOPPED_FILE: string;
export interface StoppedNote { at: string; text: string; pushedAt?: string }
export function stoppedLines(note: StoppedNote | null, options?: { ahead?: number; now?: number; done?: number[] }): string[];
export function staleCards(text: string | null | undefined, done?: number[]): number[];
export function markPushed(file: string, now?: Date): boolean;
