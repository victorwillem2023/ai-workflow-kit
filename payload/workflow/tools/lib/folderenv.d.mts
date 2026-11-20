export function envNames(text: string | null | undefined): string[];
export function withoutNames(env: Record<string, string | undefined>, names: string[]): Record<string, string | undefined>;
export function projectEnvNames(dir: string): string[];
export function folderEnv(dir: string, extra?: Record<string, string>, env?: Record<string, string | undefined>): Record<string, string | undefined>;
export function useFolderEnv(dir?: string): string[];
