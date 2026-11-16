// What counts as a new server route, in one place: the security-review advice (securityscan.mjs) and the "who is refused" advice
// (datacheck.mjs) both ask here, so the two never disagree. No I/O.
//   anywhere in the code: a framework's route (`app.post('/api/goals'`, Hono, Express, Fastify, a router of any name), a Next.js
//   route handler (`export async function POST`, `export const GET =`), a Next.js API page (pages/api/), a server action
//   ('use server'), a Python decorator (`@app.get(`), Go's `HandleFunc("/`, an axum or actix `.route("/`
//   only in the server folder (`security.server`): the plain-Node shapes that also appear elsewhere (`pathname ===`, `req.url`,
//   `createServer(`, `case '/goals'`, a `routes[...]` table)

const METHODS = 'get|post|put|patch|delete|del|all|options|head|any|use|route|handle|Handle|HandleFunc|Get|Post|Put|Patch|Delete|on';
const STRONG = [
  new RegExp(String.raw`\b[\w$]+\.(?:${METHODS})\s*\(\s*["'\`]\/`),
  /\bexport\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/,
  /\bexport\s+const\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/,
  /^\s*["']use server["']/,
  /@(?:\w+)\.(?:get|post|put|patch|delete|route|api_route|websocket)\s*\(/,
  /\bHandleFunc\s*\(\s*"\//,
  /\.route\(\s*["']\//,
];
const LOOSE = /\bpathname\s*(?:===|!==|\.startsWith\(|\.endsWith\()|\breq(?:uest)?\.url\b|\bcreateServer\(|\broutes?\s*\[|\bcase\s+['"`]\/[\w/-]*['"`]/;
const COMMENT = /^\s*(?:\/\/|\*|\/\*|#)/;
const API_PAGE = /(?:^|\/)pages\/api\/.+\.[mc]?[jt]sx?$/;

/** True when the added lines of `file` open a server route. `server` is the server folder ('src/server/'). */
export function addsRoute(file, lines, server = 'src/server/') {
  const code = lines.filter((l) => !COMMENT.test(l));
  if (!code.length) return false;
  if (API_PAGE.test(file) && code.some((l) => /\bexport\s+default\b/.test(l))) return true;
  if (code.some((l) => STRONG.some((re) => re.test(l)))) return true;
  return file.startsWith(server) && code.some((l) => LOOSE.test(l));
}

/**
 * Whether a test speaks for `file`: the test file is named after it (goals.test.ts for goals.ts) or its added lines import or
 * name it (`from '../src/server/goals'`). Advice about a file is quieted only by a test that speaks for that file, so one
 * refusal test somewhere in a change no longer silences the advice for every other file in it.
 */
export function testSpeaksFor(file, testFile, testLines) {
  const stem = file.split('/').pop().replace(/\.[^.]+$/, '');
  if (stem === 'index' || stem === 'route') {
    // a folder's index or a Next.js route.ts is named by its folder
    const dir = file.split('/').slice(-2, -1)[0];
    return testFile.includes(dir) || testLines.some((l) => l.includes(`/${dir}`));
  }
  const name = testFile.split('/').pop().replace(/(?:[._-]test|[._-]spec)?\.[^.]+$/, '').replace(/^test_/, '');
  // an import path ending in the file's name (`/goals'`, `/goals.ts"`), or Python's `from app.goals import` / `import goals`
  const named = (l) => [`/${stem}'`, `/${stem}"`, `/${stem}.`, `/${stem}\``, `.${stem} import`, `import ${stem}`].some((s) => l.includes(s));
  return name === stem || testLines.some(named);
}
