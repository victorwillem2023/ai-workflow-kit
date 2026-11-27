// One state, every view (no I/O here; the gate's *views* check, `views` in workflow/config.json): when the computer and the phone
// draw the same state (what the app says back: its notes, missed stops, tips, questions, problems), every field of it is read
// by every view, or is listed as one view's with a one-line reason. A field added for one screen and forgotten on the other is
// found when it is added, not when someone opens the other screen and the work is built a second time.
//   "views": [{ "state": "src/web/reply.ts#Reply",            the file and the type whose fields every view reads
//               "views": { "computer": ["src/web/desk/**"], "phone": ["src/web/deck/**"] },
//               "shared": ["src/web/parts/**"],                parts both views draw (read there counts for each)
//               "only": { "debug": "computer: debug numbers, for the owner" },   "<view>: <why>", or "none: <why>"
//               "names": ["reply"] }]                          optional: what the state is called in the views, so res.status is not reply.status

const word = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The code without its comments; strings are kept as they are (a "/*" inside a path is no comment). */
function noComments(text) {
  const s = String(text ?? '');
  let out = '', last = '';
  for (let i = 0; i < s.length; last = /\S/.test(out.at(-1) ?? '') ? out.at(-1) : last) {
    const c = s[i];
    // a quote right after a letter is text, not a string (JSX: <p>Don't miss</p>); ' and " end at the line's end
    if ((c === '"' || c === "'" || c === '`') && !/[\w$]/.test(s[i - 1] ?? '')) {
      let j = i + 1;
      while (j < s.length && s[j] !== c && (c === '`' || s[j] !== '\n')) j += s[j] === '\\' ? 2 : 1;
      out += s.slice(i, j + 1); i = j + 1;
    } else if (c === '/' && s[i + 1] !== '/' && s[i + 1] !== '*' && /[(,=:[!&|?{};]/.test(last || ';')) {
      // a regex literal (after an operator or a bracket): kept whole, so a /* or // in it is no comment
      let j = i + 1, cls = false;
      while (j < s.length && s[j] !== '\n' && (cls || s[j] !== '/')) { if (s[j] === '\\') j++; else if (s[j] === '[') cls = true; else if (s[j] === ']') cls = false; j++; }
      out += s.slice(i, j + 1); i = j + 1;
    } else if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; }
    else if (c === '/' && s[i + 1] === '*') { const end = s.indexOf('*/', i + 2); i = end < 0 ? s.length : end + 2; out += ' '; }
    else { out += c; i++; }
  }
  return out;
}

/**
 * The fields of a type, in order: a TypeScript `interface Name { ... }` or `type Name = { ... }`, its own fields only (not
 * those of a type inside it). null when the file has no such type.
 */
export function stateFields(source, name) {
  const text = noComments(source);
  // the body's opening brace: after the name, its type parameters and what it extends (a { inside <...> is theirs)
  const m = new RegExp(`\\b(interface|type)\\s+${word(name)}\\b`).exec(text);
  if (!m) return null;
  let i = m.index + m[0].length;
  for (let angle = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '<') angle++;
    else if (ch === '>' && text[i - 1] !== '=') angle--;
    else if (ch === '{' && angle <= 0) break;
    else if (ch === ';' && angle <= 0) return null; // type Name = Other; no object of its own
  }
  if (i >= text.length) return null;
  const fields = [];
  // each object of the type: one, or several joined with & or | ({ a } & { b })
  for (;;) {
    let depth = 1, own = '';
    for (i++; i < text.length && depth; i++) {
      const ch = text[i];
      if ('{[('.includes(ch)) depth++;
      else if ('}])'.includes(ch)) depth--;
      if (depth === 1 && !'}])'.includes(ch)) own += ch;
      else if (own.at(-1) !== ' ') own += ' ';
    }
    fields.push(...[...own.matchAll(/(?:^|[;,\n])\s*(?:readonly\s+)?(?:['"]([^'"]+)['"]|([A-Za-z_$][\w$]*))\s*\??\s*:/g)].map((x) => x[1] ?? x[2]));
    const next = /^\s*[&|]\s*\{/.exec(text.slice(i));
    if (!next || m[1] !== 'type') break;
    i += next[0].length - 1;
  }
  return [...new Set(fields)];
}

/**
 * True when the code reads the field: `x.field`, `x?.field`, `x['field']`, or taken apart (`const { field } = x`, a component's
 * `({ field }) =>`). Not: a comment, an object the code writes (`set({ field: 1 })`), a type naming it (`Reply['field']`, `typeof x.field`).
 */
export function readsField(text, field, names = []) {
  const t = noComments(text);
  const f = word(field);
  const dot = new RegExp(`([\\w$\\]\\)?]*)\\s*\\??\\.\\s*${f}\\b|([\\w$]*)\\[\\s*['"\`]${f}['"\`]\\s*\\]`, 'g');
  for (const m of t.matchAll(dot)) {
    const before = t.slice(Math.max(0, m.index - 40), m.index);
    if (/^[A-Z]/.test(m[2] ?? '') || /\btypeof\s+[\w$.?]*$/.test(before + (m[1] ?? ''))) continue; // a type, not a read
    // `names`: what the state is called in the views; then only a read on one of them counts (res.status is not reply.status)
    // (what it is read on: reply.x, reply!.x, reply?.['x'], (reply as Reply).x)
    const lead = (t.slice(Math.max(0, m.index - 60), m.index) + (m[1] ?? m[2] ?? '')).replace(/[\s?.!]+$/, '');
    const on = /([\w$]+)(?:\s*!|\s+as\s+[\w$.<>[\]]+|\s*\))*$/.exec(lead)?.[1];
    if (names.length && !names.includes(on)) continue;
    return true;
  }
  // taken apart, one level of nesting too ({ reply: { missed } }): `const {...} = from`, or a function's `({...}) =>` or `({...}): Type {`
  const braces = '(\\{(?:[^{}]|\\{[^{}]*\\})*\\})';
  const apart = new RegExp(`\\b(?:const|let|var)\\s*${braces}\\s*=\\s*(?:await\\s+)?([\\w$.?]*)|\\(\\s*${braces}\\s*(?::[^()]*)?\\)\\s*(?:=>|\\{|:\\s*[\\w$.<>\\[\\]|, ]+?\\s*(?:=>|\\{))`, 'g');
  // the field as a key ({ missed }, { missed: m }), not as the new name of another ({ tips: missed })
  const key = new RegExp(`(?:^|[{,])\\s*(?:\\.\\.\\.)?${f}\\b`);
  // with `names`: taken apart from one of them (`= reply`, `= props.reply`), or from a key named so (`({ reply: { missed } })`)
  const fromState = (m) => !names.length || (m[2] != null ? names.includes(m[2].split(/[.?]+/).filter(Boolean).at(-1)) : names.some((n) => new RegExp(`\\b${word(n)}\\s*:\\s*\\{[^{}]*\\b${f}\\b`).test(m[3])));
  return [...t.matchAll(apart)].some((m) => key.test(m[1] ?? m[3]) && fromState(m));
}

/** "computer: debug numbers" -> { views: ['computer'], why }; null when it is not written that way. */
export function onlyOf(line) {
  const m = /^\s*([\w\s,-]+?)\s*(?:only)?\s*:\s*(.+)$/i.exec(String(line ?? ''));
  return m ? { views: m[1].split(/\s*,\s*|\s+and\s+/).map((v) => v.trim().toLowerCase()).filter(Boolean), why: m[2].trim() } : null;
}

const quoteList = (xs) => xs.length === 1 ? `the ${xs[0]}'s` : `the ${xs.slice(0, -1).join("'s, the ")}'s and the ${xs.at(-1)}'s`;

/**
 * What one shared state lacks: [problem line]. `fields`: its fields (stateFields); `views`: { name: Map(file -> text) }, each
 * view's own files with the shared ones in them; `only`: { field: "<view>: <why>" }; `at`: how to name the entry in a line.
 */
export function viewGaps(fields, views, only = {}, at = 'views', names = []) {
  const viewNames = Object.keys(views);
  const named = (v) => viewNames.find((n) => n.toLowerCase() === v); // the only list is read in lower case
  const out = [];
  for (const [field, line] of Object.entries(only)) {
    const o = onlyOf(line);
    if (!fields.includes(field)) out.push(`${at}.only names "${field}", which the state does not have (any more): take it out`);
    else if (!o || o.why.split(/\s+/).length < 2) out.push(`${at}.only "${field}" needs the view and a reason: "<${viewNames.join(' | ')} | none>: <why, in a few words>"`);
    else if (o.views.some((v) => v !== 'none' && !named(v))) out.push(`${at}.only "${field}" names ${o.views.filter((v) => v !== 'none' && !named(v)).join(', ')}, which is no view here (${viewNames.join(', ')})`);
  }
  for (const field of fields) {
    const by = viewNames.filter((n) => [...views[n].values()].some((t) => readsField(t, field, names)));
    // (a view the config does not have is said once, above; it is never asked for)
    const want = only[field] && onlyOf(only[field]) ? onlyOf(only[field]).views.map(named).filter(Boolean) : viewNames;
    const lacking = want.filter((n) => !by.includes(n));
    if (!lacking.length) continue;
    const where = (n) => [...views[n].entries()].find(([, t]) => readsField(t, field, names))?.[0];
    const said = by.length ? `"${field}" is read by ${quoteList(by)} view (${by.map(where).join(', ')}) but not by ${quoteList(lacking)}` : `"${field}" is read by no view`;
    out.push(`${said}: draw it there too, or list it in ${at}.only with the view and why ("${by[0] ?? 'none'}: <why>")`);
  }
  return out;
}

/**
 * The check over every entry of `views` in the config: [problem line]. `files`: the code files to look in (tests left out);
 * `read`: file -> text or null; `matches`: (file, globs) -> bool. A view's files and the shared ones count as that view.
 */
export function viewsCheck(entries, { files, read, matches }) {
  return entries.flatMap((v, k) => {
    const at = `views[${k}]`;
    const [file, type] = String(v.state ?? '').split('#');
    if (!file || !type) return [`${at}.state should be "<file>#<type>", for example "src/web/reply.ts#Reply"`];
    const src = read(file);
    if (src == null) return [`${at}.state: ${file} is not there`];
    const fields = Array.isArray(v.fields) ? v.fields : stateFields(src, type);
    if (!fields) return [`${at}.state: ${file} has no type ${type} (an interface, or a type of an object): name it, or list its fields in ${at}.fields`];
    const names = Object.keys(v.views ?? {});
    if (names.length < 2) return [`${at}.views names ${names.length} view${names.length === 1 ? '' : 's'}: the check is for a state two or more views draw`];
    const own = (globs) => files.filter((f) => f !== file && matches(f, [].concat(globs ?? [])));
    const shared = own(v.shared);
    // a view's own files first: one made of shared parts only is a glob that matches nothing (a typo), said as such
    const empty = names.filter((n) => !own(v.views[n]).length);
    const views = Object.fromEntries(names.map((n) => [n, new Map([...own(v.views[n]), ...shared].map((f) => [f, read(f) ?? '']))]));
    if (empty.length) return empty.map((n) => `${at}.views.${n}: no code file matches ${[].concat(v.views[n]).join(', ')}`);
    return viewGaps(fields, views, v.only ?? {}, at, [].concat(v.names ?? []));
  });
}
