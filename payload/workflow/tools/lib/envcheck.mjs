// The settings check: every setting the code reads from the environment is listed in .env.example, so a new server (or a
// new person) knows every name it needs before the app is started. Read from the source text, for any language:
//   TypeScript/JavaScript  process.env.NAME, process.env['NAME'], import.meta.env.VITE_NAME, Deno.env.get('NAME'),
//                          and the keys of a defineSettings({ NAME: ... }) call (src/server/config.ts)
//   Rust                   env::var("NAME"), env::var_os("NAME"), std::env::var("NAME")
//   Python                 os.environ["NAME"], os.environ.get("NAME"), os.getenv("NAME")
//   Go                     os.Getenv("NAME"), os.LookupEnv("NAME")
// A name in .env.example may be commented out (# NAME=...): an optional setting is still listed.

// names every runtime or tool sets by itself; never in .env.example
const BUILT_IN = new Set(['NODE_ENV', 'CI', 'HOME', 'PATH', 'TZ', 'MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL', 'PWD', 'USER', 'TMPDIR', 'TEMP']);

const PATTERNS = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[\s*['"`]([A-Z][A-Z0-9_]*)['"`]\s*\]/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g,
  /Deno\.env\.get\(\s*['"`]([A-Z][A-Z0-9_]*)['"`]/g,
  /env::var(?:_os)?\(\s*"([A-Z][A-Z0-9_]*)"/g,
  /os\.environ\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/g,
  /os\.(?:environ\.get|getenv)\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g,
  /os\.(?:Getenv|LookupEnv)\(\s*"([A-Z][A-Z0-9_]*)"/g,
];

/** The setting names one source file reads. */
export function namesRead(text) {
  const out = new Set();
  for (const re of PATTERNS) for (const m of text.matchAll(re)) out.add(m[1]);
  // defineSettings({ PORT: { ... }, DATABASE_URL: { ... } }): the top-level keys of the object
  for (const call of text.matchAll(/defineSettings\(\s*\{/g)) {
    let depth = 1;
    let i = call.index + call[0].length;
    const start = i;
    for (; i < text.length && depth > 0 && i - start < 50_000; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
    }
    const body = text.slice(start, i - 1);
    let level = 0;
    for (const line of body.split('\n')) {
      const key = level === 0 ? /^\s*['"]?([A-Z][A-Z0-9_]*)['"]?\s*:/.exec(line) : null;
      if (key) out.add(key[1]);
      for (const c of line) level += c === '{' ? 1 : c === '}' ? -1 : 0;
    }
  }
  for (const n of BUILT_IN) out.delete(n);
  return [...out];
}

/** The names .env.example lists, commented out or not. */
export function namesListed(example) {
  return new Set([...String(example).matchAll(/^[ \t]*#?[ \t]*(?:export[ \t]+)?([A-Z][A-Z0-9_]*)[ \t]*=/gm)].map((m) => m[1]));
}

/** What fails: [{ file, name }] for each name a file reads that .env.example does not list (and the config does not ignore). */
export function unlisted(files, example, ignore = []) {
  const listed = namesListed(example);
  const skip = new Set(ignore);
  const out = [];
  for (const [file, text] of files) for (const name of namesRead(text)) if (!listed.has(name) && !skip.has(name)) out.push({ file, name });
  return out;
}
