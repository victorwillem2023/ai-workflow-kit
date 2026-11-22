export const STOPPED_FILE: string;
export interface StoppedNote { at: string; text: string; pushedAt?: string }
export function stoppedLines(note: StoppedNote | null, options?: { ahead?: number; now?: number }): string[];
export function markPushed(file: string, now?: Date): boolean;
