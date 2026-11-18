export function endStateOf(spec: string | null | undefined): string | null;
export function isApproved(spec: string | null | undefined): boolean;
export function endStateProblems(specs: [string, string][]): { fails: string[]; advice: string[] };
