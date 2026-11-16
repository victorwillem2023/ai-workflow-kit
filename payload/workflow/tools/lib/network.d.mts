type IpRule = { cidr: string; action?: 'allow' | 'block'; for?: string; why?: string; until?: string };
export function outboundHosts(files: Map<string, string>): Map<string, string[]>;
export function allowed(host: string, list?: string[]): boolean;
export function unlistedEgress(files: Map<string, string>, list?: string[]): string[];
export function ipRuleProblems(rules?: IpRule[] | null, now?: Date): { severity: string; what: string; where: string }[];
