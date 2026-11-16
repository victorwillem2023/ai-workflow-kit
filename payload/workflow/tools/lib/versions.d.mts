type Pkg = { engines?: { node?: string }; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null | undefined;
export function readToolVersions(text: string | undefined): { tool: string; version: string; line: number }[];
export function unpinnedTools(text: string | undefined): string[];
export function nodeVersions(t: { toolVersions?: string; dockerfile?: string; pkg?: Pkg }): { where: string; major: number }[];
export function nodeOutOfStep(t: { toolVersions?: string; dockerfile?: string; pkg?: Pkg }): string[];
export function tofuUnpinned(files: Map<string, string>, tracked: Set<string>): string[];
