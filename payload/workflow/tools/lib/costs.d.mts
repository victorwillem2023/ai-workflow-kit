interface CostLine { what: string; provider: string; plan: string; monthly: number | null; grows: string; checked: string; source: string }
interface Costs { lines: CostLine[]; hours: { what: string; hours: number }[]; rate: number | null }
interface Option { name: string; monthly?: number; perUnit?: number; units?: number; oneOff?: number; setupHours?: number; hoursPerMonth?: number; hourlyRate?: number }
export function parseCosts(md: string): Costs;
export function costReport(costs: Costs, now?: Date): { total: number; byProvider: Record<string, number>; hours: number; timeCost: number | null; problems: string[] };
export function optionCost(o: Option, months: number, rate?: number): number;
export function compareOptions(options: Option[], rate?: number): { rows: { name: string; m1: number; m12: number; m36: number; hours: number }[]; notes: string[] };
