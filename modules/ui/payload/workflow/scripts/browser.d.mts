export function sleep(ms: number): Promise<void>;
export interface Browser {
  send(method: string, params?: Record<string, unknown>): Promise<any>;
  ev(expression: string): Promise<any>;
  until(expression: string, ms?: number): Promise<any>;
  go(url: string): Promise<void>;
  shot(file: string, options?: { full?: boolean }): Promise<void>;
  close(): Promise<void>;
}
export function openBrowser(options?: { width?: number; height?: number; scale?: number; theme?: 'light' | 'dark' }): Promise<Browser>;
