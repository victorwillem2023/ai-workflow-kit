export interface StageFacts {
  firstVersion: { total: number; open: number } | null;
  beforeDeploy: { number: number; title: string }[];
  launched: boolean;
  marketPage: boolean;
  installed: Record<string, boolean>;
  shippedThisWeek: number;
  daysSinceRetro: number | null;
  /** a decision record on AI in the app exists (docs/decisions/*-ai.md); undefined: not known, no nudge */
  aiConsidered?: boolean;
  roadmap?: { stage: string | null; sign: string | null; daysSinceChange: number } | null;
}
export function stageNudges(f: StageFacts): string[];
export const BEFORE_DEPLOY: RegExp;
export function readRoadmap(text: string): { stage: string | null; sign: string | null };
