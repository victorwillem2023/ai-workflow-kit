import type { SpawnSyncReturns } from 'node:child_process';
export function ghRun(args: string[], input?: string, opts?: { timeout?: number }): SpawnSyncReturns<string>;
