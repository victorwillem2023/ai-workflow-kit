type Row = { who: string; where: string; role: string; why: string };
type Found = { kind: 'person' | 'deploy key' | 'secret'; who: string; role?: string };
type Compared = { unlisted: Found[]; gone: (Row & { kind: string })[]; changed: (Found & { listed: string })[]; byHand: Row[] };
export function parseAccess(md: string | null | undefined): Row[];
export function compareAccess(found: Found[], rows: Row[]): Compared;
export function accessReport(c: Compared, today: string): string;
