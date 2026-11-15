// The access review (no I/O here): who and what can reach the project, compared with docs/ACCESS.md, the list of who should.
// docs/ACCESS.md holds a table | Who | Where | Role | Why | ; a row whose Where is "GitHub" is checked against GitHub itself
// (people, deploy keys, the names of the Actions secrets); every other row (the cloud, the domain, the database, Google's
// console) is checked by hand, and the review lists them so none is forgotten.

const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim().replace(/`/g, ''));

/** The rows of the first table with a "Who" and a "Where" column: [{ who, where, role, why }]. */
export function parseAccess(md) {
  const lines = String(md ?? '').split('\n');
  const start = lines.findIndex((l) => /^\|\s*Who\s*\|/i.test(l) && /\|\s*Where\s*\|/i.test(l));
  if (start < 0) return [];
  const head = cells(lines[start]).map((h) => h.toLowerCase());
  const out = [];
  for (const l of lines.slice(start + 2)) {
    if (!l.trim().startsWith('|')) break;
    const c = cells(l);
    const get = (n) => c[head.indexOf(n)] ?? '';
    if (get('who')) out.push({ who: get('who'), where: get('where'), role: get('role'), why: get('why') });
  }
  return out;
}

const key = (x) => `${x.kind}|${String(x.who).toLowerCase()}`;

/** What GitHub shows against what the list says. `found`: [{ kind: 'person' | 'deploy key' | 'secret', who, role }].
 *  Returns { unlisted, gone, changed, byHand } (byHand: the rows no script can check). */
export function compareAccess(found, rows) {
  const gh = rows.filter((r) => /^github/i.test(r.where));
  const listed = new Map(gh.map((r) => {
    const kind = /deploy key/i.test(r.where) ? 'deploy key' : /secret/i.test(r.where) ? 'secret' : 'person';
    return [key({ kind, who: r.who.replace(/^@/, '') }), { ...r, kind }];
  }));
  const seen = new Set();
  const unlisted = [];
  const changed = [];
  for (const f of found) {
    const r = listed.get(key(f));
    seen.add(key(f));
    if (!r) unlisted.push(f);
    else if (f.role && r.role && f.role.toLowerCase() !== r.role.toLowerCase()) changed.push({ ...f, listed: r.role });
  }
  const gone = [...listed.entries()].filter(([k]) => !seen.has(k)).map(([, r]) => r);
  return { unlisted, gone, changed, byHand: rows.filter((r) => !/^github/i.test(r.where)) };
}

/** The review in plain words, as Markdown (for the screen or an issue). */
export function accessReport(c, today) {
  const out = [`# Access review, ${today}`, ''];
  const list = (title, items, say) => { out.push(`## ${title}`, ...(items.length ? items.map(say) : ['None.']), ''); };
  list('On GitHub but not in docs/ACCESS.md', c.unlisted, (f) => `- ${f.kind} **${f.who}**${f.role ? ` (${f.role})` : ''}: add a row with why, or take the access away`);
  list('In docs/ACCESS.md but no longer on GitHub', c.gone, (r) => `- ${r.who} (${r.where}): take the row out`);
  list('Another role than the list says', c.changed, (f) => `- ${f.who}: ${f.role} on GitHub, ${f.listed} in the list: change one of them`);
  list('Check by hand (no script sees these)', c.byHand, (r) => `- [ ] ${r.who}: ${r.where}${r.role ? `, ${r.role}` : ''}. Still needed? Two-step sign-in on?`);
  out.push('When every line is settled: `npm run access -- --done` sets "Last review" in docs/ACCESS.md (the weekly security report reminds you after 90 days).');
  return out.join('\n');
}
