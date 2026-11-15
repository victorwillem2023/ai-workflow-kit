type Group = { area: string; items: { text: string; hash?: string }[] };
export function groupCommits(commits: { hash?: string; subject: string }[], o?: { skip?: string[] }): Group[];
export function changelogText(heading: string, groups: Group[]): string;
