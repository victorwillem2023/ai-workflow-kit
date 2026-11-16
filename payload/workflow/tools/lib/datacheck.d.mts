export function editedMigrations(nameStatus: string, globs: string[], matches: (path: string, globs: string[]) => boolean): { file: string; how: string }[];
export function sqlAdvice(added: Map<string, string[]>): string[];
export function permissionAdvice(added: Map<string, string[]>, security?: { signIn?: boolean; server?: string }): string[];
export function dataAdvice(diff: string, extra?: Map<string, string[]>, config?: { security?: { signIn?: boolean; server?: string } }): string[];
