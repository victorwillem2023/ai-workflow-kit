export function specPaths(spec: string): string[];
export function outsideSpec(changed: string[], paths: string[], ignore?: string[]): string[];
export function ownTestFiles(outside: string[], paths: string[], graph: { imports: Map<string, string[]>; importedBy: Map<string, Set<string>> }, isTest: (f: string) => boolean): string[];
export function namesKitFiles(spec: string | null | undefined): boolean;
export function kitFilesIn(record: string | null | undefined): string[];
