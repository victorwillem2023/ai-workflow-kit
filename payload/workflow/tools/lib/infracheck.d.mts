export function toolOf(files: string[], preferred?: string): 'tofu' | 'terraform' | 'pulumi' | 'ansible' | null;
export function stacks(paths: string[], root?: string, preferred?: string): { dir: string; tool: string }[];
export function startupFiles(paths: string[]): string[];
export function startupProblems(file: string, text: string): string[];
