// The scope guard: the files a change touches that its spec never names ("while I was there" edits). Pure.
import { matchesAny } from './glob.mjs';

/** The files and folders a spec names in backticks (`src/a.ts`, `docs/guide/`); placeholders and globs are left out. */
export function specPaths(spec) {
  return [...new Set([...spec.matchAll(/`([^`\s]+)`/g)].map((m) => m[1].replace(/[:#].*$/, ''))
    .filter((p) => /[/.]/.test(p) && !/[<>*{}]/.test(p) && !/^npm\b/.test(p)))];
}

/** The changed files the spec does not name: not the file itself, not a folder it is in. `ignore` are globs never reported. */
export function outsideSpec(changed, paths, ignore = []) {
  const named = (f) => paths.some((p) => f === p || f.startsWith(p.replace(/\/$/, '') + '/'));
  return changed.filter((f) => !matchesAny(f, ignore) && !named(f)).sort();
}

/** True when a spec says it changes "the kit's files" (a kit update): then every file the kit wrote counts as named. */
export const namesKitFiles = (spec) => /\bthe kit['’]?s (?:own )?files\b/i.test(String(spec ?? ''));

/** The files the kit wrote, from workflow/record's `sha <hash> <file>` lines. */
export const kitFilesIn = (record) => [...String(record ?? '').matchAll(/^sha \S+ (.+)$/gm)].map((m) => m[1].trim());
