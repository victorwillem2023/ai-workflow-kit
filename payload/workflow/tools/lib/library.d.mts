export const LIBRARY: Record<string, { files: string[]; title: string; when: string; read: string }>;
export function libraryTaken(recorded: string | null | undefined, has?: (file: string) => boolean): string[];
export function libraryLines(taken?: string[]): string[];
