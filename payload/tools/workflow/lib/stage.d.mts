export interface StageFacts {
  firstVersion: { total: number; open: number } | null;
  beforeDeploy: { number: number; title: string }[];
  launched: boolean;
  marketPage: boolean;
  installed: Record<string, boolean>;
  shippedThisWeek: number;
  daysSinceRetro: number | null;
}
export function stageNudges(f: StageFacts): string[];
export const BEFORE_DEPLOY: RegExp;
