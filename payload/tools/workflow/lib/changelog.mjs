// The changelog from the commits (no I/O here). Every commit on main is one feature with a subject "Area: what changed for
// the user" (docs/CONVENTIONS.md, *Commits and pushes*), so the list of what changed is already written: this groups it by
// area for a release note, a customer update or the guide's "what is new". The kit's own workflow commits are left out.

/** Commits ([{ hash, subject }]) grouped by area: [{ area, items: [{ text, hash }] }], areas in order of first appearance. */
export function groupCommits(commits, { skip = ['Workflow'] } = {}) {
  const groups = new Map();
  for (const c of commits) {
    const m = /^([A-Z][\w &/-]{0,30}):\s+(.+)$/.exec(String(c.subject).trim());
    const area = m ? m[1] : 'Other';
    if (skip.includes(area) || /^(Merge|Revert "|Release v?\d)/.test(c.subject)) continue;
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area).push({ text: m ? m[2] : c.subject, hash: c.hash });
  }
  return [...groups].map(([area, items]) => ({ area, items }));
}

/** The changelog as Markdown, under a heading (a version or a date). */
export function changelogText(heading, groups) {
  if (!groups.length) return `## ${heading}\n\nNothing that changes the app for its users.\n`;
  return `## ${heading}\n\n${groups.map((g) => `### ${g.area}\n${g.items.map((i) => `- ${i.text}${i.hash ? ` (${i.hash.slice(0, 7)})` : ''}`).join('\n')}`).join('\n\n')}\n`;
}
