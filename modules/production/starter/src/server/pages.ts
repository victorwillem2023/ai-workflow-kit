// The built pages (Vite's dist/: index.html and assets/), served by the assembled server (http.ts) for a GET that is no route.
// Only files inside the folder, only the kinds a page is made of, never the server's own bundle or a source map; a path with no
// file ending gets index.html, so the app's own links (/goals/42) open the page that draws them. Hashed files in assets/ are kept
// by the browser for a year; index.html is asked for again each time, so a deploy shows at once.
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Stored } from './httpguards';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
/** The server's own files in the same folder: never sent. */
const NEVER = /(?:^|[\\/])server\.[mc]?js$|\.map$/;

const isFile = async (p: string) => (await stat(p).catch(() => null))?.isFile() === true;

/** The answer for `path` from the pages folder `dir`, or null when it holds nothing for it. */
export async function servePage(dir: string, path: string): Promise<Stored | null> {
  const root = resolve(dir);
  let rel: string;
  try {
    rel = normalize(decodeURIComponent(path)).replace(/^[\\/]+/, '');
  } catch {
    return null;
  }
  const wanted = resolve(root, rel);
  // outside the folder (../), the server's bundle or a map: nothing here
  if ((wanted !== root && !wanted.startsWith(root + sep)) || NEVER.test(wanted)) return null;
  const ending = extname(wanted).toLowerCase();
  let file = ending && TYPES[ending] && (await isFile(wanted)) ? wanted : null;
  if (!file && !ending && (await isFile(join(root, 'index.html')))) file = join(root, 'index.html');
  if (!file) return null;
  const html = file.endsWith('.html');
  return {
    status: 200,
    body: await readFile(file),
    headers: {
      'content-type': TYPES[extname(file).toLowerCase()],
      'cache-control': html ? 'no-cache' : /[\\/]assets[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    },
  };
}
