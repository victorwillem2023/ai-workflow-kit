export function failureText(data: { name?: string; file?: string; line?: number; details?: { error?: unknown } }): string;
export default function quietReporter(source: AsyncIterable<{ type: string; data?: unknown }>): AsyncGenerator<string>;
export function shortMessage(text: unknown): string[];
/** How many of React's act() warnings a piece of a test file's stderr holds. */
export function actWarnings(text: unknown): number;
