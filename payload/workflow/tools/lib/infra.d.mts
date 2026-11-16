type Resource = { file: string; kind: string; id: string; attrs: Record<string, string> };
export function parseTf(file: string, text: string): Resource[];
export function parseK8s(file: string, text: string): Resource[];
export function renderInfraMap(resources: Resource[]): string;
