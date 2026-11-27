export function endStateOf(spec: string | null | undefined): string | null;
export function isApproved(spec: string | null | undefined): boolean;
export function endStateProblems(specs: [string, string][]): { fails: string[]; advice: string[] };
export function phoneLineOf(spec: string | null | undefined): string | null;
export function phoneLineProblems(specs: [string, string][], phone: boolean): { fails: string[]; advice: string[] };
