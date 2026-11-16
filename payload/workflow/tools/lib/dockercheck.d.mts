export function stages(text: string): { from: string; name: string | null; lines: { n: number; text: string }[] }[];
export function imageProblems(dockerfile: string, dockerignore: string | null | undefined): string[];
