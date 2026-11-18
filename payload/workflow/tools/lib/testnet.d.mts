export function isDevPort(port: number): boolean;
export function isLoopback(host: string | undefined): boolean;
export function refusal(host: string | undefined, port: number, ownPorts?: Set<number>): string | null;
