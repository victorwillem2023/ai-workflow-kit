export function dependencyNames(file: string, text: string): string[];
export function addedDependencies(file: string, before: string, after: string): string[];
export function unnamedDependencies(names: string[], stack: string): string[];
