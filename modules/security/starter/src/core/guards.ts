// Small input guards: the pattern for anything read from a request, an uploaded file or a third-party page.
// Every one has a size or count cap; every refusal has a test whose name says what is refused (tests/security/guards.test.ts).
// Pure, so the browser can use them too.

/** A link that is safe to put in an `href`: http or https only. Returns the normalised address, or null (javascript:, data:, file:, relative...). */
export function safeHref(value: unknown, maxLength = 2048): string | null {
  if (typeof value !== 'string' || value.length > maxLength) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

/** JSON from outside: refused when the text is longer than `maxChars` (checked before parsing), null when it is not JSON. */
export function parseJsonCapped(text: string, maxChars: number): unknown {
  if (text.length > maxChars) throw new RangeError(`That is too large (more than ${maxChars} characters).`);
  try { return JSON.parse(text) as unknown; } catch { return null; }
}

/** The first `max` items of anything iterable, without walking the rest (bound a loop whose length comes from outside). */
export function atMost<T>(items: Iterable<T>, max: number): T[] {
  const out: T[] = [];
  for (const x of items) { if (out.length >= max) break; out.push(x); }
  return out;
}

/** Text from outside, cut to `max` characters with the control characters taken out (for names, titles, log lines). */
export function cleanText(value: unknown, max = 200): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
