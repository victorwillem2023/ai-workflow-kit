export const TRACKERS: [string, RegExp][];
export function pageProblems(html: string): { problems: string[]; warnings: string[] };
export function robotsProblems(robots: string | null): { problems: string[]; warnings: string[] };
export function sitemapUrls(xml: string | null): string[] | null;
