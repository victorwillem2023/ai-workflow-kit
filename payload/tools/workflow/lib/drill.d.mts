export function drillRow(md: string, drill: { date: string; restoreSeconds: number; upSeconds: number }): string;
export function drillDue(md: string | null, now?: Date, setUp?: boolean): { area: string; severity: string; id: string; what: string; where: string }[];
