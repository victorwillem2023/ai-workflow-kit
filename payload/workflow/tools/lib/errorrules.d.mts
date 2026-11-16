export function errorRuleFindings(file: string, text: string): { line: number; rule: string; say: string }[];
export function notRead(files: string[]): { files: string[]; langs: string; note: string | undefined; advice: string[] };
