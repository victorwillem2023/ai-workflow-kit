type Makers = Record<'phase' | 'bigdocs' | 'layers' | 'versions' | 'settings' | 'sensitive' | 'naming' | 'egress' | 'iprules', () => string>;
export function phaseBlock(levelsText: string | null | undefined, config?: Record<string, any>): string;
export function blockMakers(a: { config?: Record<string, any>; toolVersions?: string; envExample?: string; levelsText?: string | null; docSizes?: [string, number][] }): Makers;
export function fillBlocks(text: string, makers: Record<string, () => string>): string;
export function hasBlocks(text: string): boolean;
export function bigDocs(docSizes: [string, number][], over: number): string;
export function bare(text: string): string;
