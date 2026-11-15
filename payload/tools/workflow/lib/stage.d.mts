export interface StageFacts {
  firstVersion: { total: number; open: number } | null;
  beforeDeploy: { number: number; title: string }[];
  launched: boolean;
  marketPage: boolean;
  installed: Record<string, boolean>;
  shippedThisWeek: number;
  daysSinceRetro: number | null;
  roadmap?: { stage: string | null; sign: string | null; daysSinceChange: number } | null;
}
export function stageNudges(f: StageFacts): string[];
export const BEFORE_DEPLOY: RegExp;
export function readRoadmap(text: string): { stage: string | null; sign: string | null };
