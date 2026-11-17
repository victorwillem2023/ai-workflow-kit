export type Fact = { id: string; phase: string; says: string };
export const FACTS: Fact[];
export const PAYMENT: RegExp;
export function fitPhase(f: { reachable?: boolean; personal?: boolean; money?: boolean; relied?: boolean }): { facts: Fact[]; fit: string };
export function phaseLines(o: { phase: string; facts: Fact[]; said?: string[] }): { status: string; notice: string; said: string[] };
export function missingFor(phase: string, has: { personal?: boolean; privacyDoc?: boolean; errorsSeen?: boolean; securityDoc?: boolean;
  secops?: boolean; drill?: boolean; rollback?: boolean; monitoring?: boolean; runDocs?: boolean }): { id: string; what: string }[];
export function deployRefusal(phase: string): string | null;
