export function addedLines(diff: string): Map<string, string[]>;
/** `security` (the config's block): `code`, `server` and `inputFolders` say which folders count. */
export function securityAdvice(diff: string, extra?: Map<string, string[]>, security?: { code?: string; server?: string; inputFolders?: string[] }): string[];
