export function namesRead(text: string): string[];
export function namesListed(example: string): Set<string>;
export function unlisted(files: Map<string, string> | [string, string][], example: string, ignore?: string[]): { file: string; name: string }[];
