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

/**
 * Of the files outside the spec (`outside`), the ones that are the change's own all the same: a test that reaches a file the spec
 * names (its test is part of that file's change), and a file only such tests import (a fixture, a helper). `imports` and
 * `importedBy` are the import graph's (lib/graph.mjs).
 */
export function ownTestFiles(outside, paths, { imports, importedBy }, isTest) {
  const named = (f) => paths.some((p) => f === p || f.startsWith(p.replace(/\/$/, '') + '/'));
  const reachesNamed = (start) => {
    const seen = new Set([start]);
    const todo = [start];
    while (todo.length) for (const to of imports.get(todo.pop()) ?? []) { if (named(to)) return true; if (!seen.has(to)) { seen.add(to); todo.push(to); } }
    return false;
  };
  const tests = new Set(outside.filter((f) => isTest(f) && reachesNamed(f)));
  const helpers = outside.filter((f) => { const by = [...(importedBy.get(f) ?? [])]; return !isTest(f) && by.length > 0 && by.every((b) => isTest(b) && (tests.has(b) || named(b))); });
  return [...tests, ...helpers].sort();
}

/** True when a spec says it changes "the kit's files" (a kit update): then every file the kit wrote counts as named. */
export const namesKitFiles = (spec) => /\bthe kit['’]?s (?:own )?files\b/i.test(String(spec ?? ''));

/** The files the kit wrote, from workflow/record's `sha <hash> <file>` lines. */
export const kitFilesIn = (record) => [...String(record ?? '').matchAll(/^sha \S+ (.+)$/gm)].map((m) => m[1].trim());
