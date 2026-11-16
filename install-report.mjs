// What changed for the owner after an update, said in the update's own report so nothing surfaces later as a surprise: what each
// kit version since the project's own changed (its bold headlines in the kit's CHANGELOG.md), the commands whose text changed (a
// skill the update replaced), and the app map's request group when it came out different (docs/flow/requests.js, rebuilt).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { older } from './migrations/index.mjs';

/** The headlines of the kit versions after `from` up to `to`: [{ version, headlines: [...] }], newest first. */
export function changesSince(changelog, from, to) {
  const entries = [...changelog.matchAll(/^- \*\*(\d+\.\d+\.\d+)\*\*[^\n]*(?:\n {2}[^\n]*)*/gm)];
  return entries
    // (one line per entry; code spans out first, since `tools/workflow/**` is not bold)
    .map(([text, version]) => ({ version, headlines: [...text.replace(/\n\s+/g, ' ').replace(/`[^`]*`/g, '…').slice(text.indexOf('**', 4) + 2).matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1].replace(/[:.]\s*$/, '').trim()) }))
    .filter((e) => (!from || older(from, e.version)) && !older(to, e.version));
}

/** The names in a requests.js (the group and its sections), to say what the map now calls them. */
const mapNames = (text) => [...String(text ?? '').matchAll(/^ {1,3}"name": "([^"]+)"/gm)].map((m) => m[1]);

/** The report's lines. `before`: the project's kit version (null on a first install); `replaced`: the files the update replaced. */
export function whatChanged({ kit, target, before, now, replaced, requestsBefore }) {
  if (!before) return [];
  const lines = [];
  const log = existsSync(join(kit, 'CHANGELOG.md')) ? readFileSync(join(kit, 'CHANGELOG.md'), 'utf8') : '';
  const versions = before === now ? [] : changesSince(log, before === 'unknown' ? null : before, now);
  if (versions.length) {
    const shown = versions.slice(0, 8);
    lines.push(`what is new since ${before} (the kit's CHANGELOG.md has each in full):\n${shown.map((v) => `    ${v.version}: ${v.headlines.slice(0, 4).join('; ') || 'see the changelog'}`).join('\n')}${versions.length > shown.length ? `\n    and ${versions.length - shown.length} older versions` : ''}`);
  }
  const commands = replaced.map((f) => /^\.claude[\\/]skills[\\/]([\w-]+)[\\/]SKILL\.md$/.exec(f)?.[1]).filter(Boolean);
  if (commands.length) lines.push(`commands that work differently now (their skill changed): ${commands.map((c) => `/${c}`).join(' ')}`);
  const requestsAt = join(target, 'docs', 'flow', 'requests.js');
  const requestsAfter = existsSync(requestsAt) ? readFileSync(requestsAt, 'utf8') : null;
  if (requestsBefore != null && requestsAfter != null && requestsBefore !== requestsAfter) {
    const was = mapNames(requestsBefore), is = mapNames(requestsAfter);
    const renamed = is.filter((n) => !was.includes(n));
    lines.push(`the app map's request group was rebuilt${renamed.length ? `, and calls these differently now: ${renamed.join('; ')} (its words come from the index page: docs/requests/README.md says how)` : ' (same names; open docs/flow/index.html to see it)'}`);
  }
  return lines;
}
