type Makers = Record<'layers' | 'versions' | 'settings' | 'sensitive' | 'naming', () => string>;
export function blockMakers(a: { config?: Record<string, any>; toolVersions?: string; envExample?: string }): Makers;
export function fillBlocks(text: string, makers: Record<string, () => string>): string;
export function hasBlocks(text: string): boolean;
