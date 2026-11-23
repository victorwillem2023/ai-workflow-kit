export interface Place { file: string; line: number; name?: string; value?: string }
export function repeatedRules(files: Map<string, string>): { what: string; value: string; places: Place[] }[];
export function lookAlikes(files: Map<string, string>, options?: { minLines?: number; min?: number; max?: number }): { a: { file: string; name: string; line: number }; b: { file: string; name: string; line: number }; alike: number }[];
