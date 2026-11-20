// What the AI sessions on this project used (no I/O here; workflow/tools/sessioncost.mjs reads Claude Code's own records): the
// tokens of every answer, by day, by model and by command (the skill that answered), instead of asking an agent to guess.
// Money only from prices the project wrote down (`session.prices` in workflow/config.json, per million tokens, with the date
// they were checked): prices change, so the kit never holds them.

/** One answer's use from a record line (a JSON object), or null when the line is not an answer. */
export function answerUse(line) {
  if (line?.type !== 'assistant' || !line.message?.usage) return null;
  const u = line.message.usage;
  return {
    at: line.timestamp ?? null, model: line.message.model ?? 'unknown', skill: line.attributionSkill ?? null, session: line.sessionId ?? null,
    side: Boolean(line.isSidechain), // a subagent's answer (a builder, a reviewer)
    input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0,
  };
}

const add = (a, b) => ({ input: a.input + b.input, output: a.output + b.output, cacheWrite: a.cacheWrite + b.cacheWrite, cacheRead: a.cacheRead + b.cacheRead, answers: a.answers + 1 });
const ZERO = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, answers: 0 };

/** The money for a use, from prices per million tokens ({ input, output, cacheWrite, cacheRead }), or null without prices. */
export function money(use, price) {
  if (!price) return null;
  return ((use.input * (price.input ?? 0)) + (use.output * (price.output ?? 0)) + (use.cacheWrite * (price.cacheWrite ?? price.input ?? 0)) + (use.cacheRead * (price.cacheRead ?? 0))) / 1e6;
}

/** The answers since `since` (a Date) summed: { total, byModel, bySkill, byDay, bySession } (each a Map of key -> use). */
export function sumUse(answers, since = null) {
  const out = { total: { ...ZERO }, byModel: new Map(), bySkill: new Map(), byDay: new Map(), bySession: new Map() };
  for (const a of answers) {
    if (since && a.at && new Date(a.at) < since) continue;
    out.total = add(out.total, a);
    for (const [map, key] of [[out.byModel, a.model], [out.bySkill, a.skill ? `/${a.skill}` : '(no command)'], [out.byDay, (a.at ?? '').slice(0, 10) || 'unknown'], [out.bySession, a.session ?? 'unknown']]) {
      map.set(key, add(map.get(key) ?? { ...ZERO }, a));
    }
  }
  return out;
}

/**
 * What one use of each command took under each kit version. `periods`: [{ from: ISO date, version }], when the project got each
 * kit version (oldest first); a use is one chat's answers under one command. Versions count by their first two numbers (4.6,
 * 4.7). Returns [{ skill, rows: [{ kit, uses, median }] }] for the commands with `min` uses under at least two versions, the
 * most used first: a kit update that made a command cost more, or less, shows here from real use.
 */
export function useByKit(answers, periods, { min = 3 } = {}) {
  const sorted = [...periods].sort((a, b) => new Date(a.from) - new Date(b.from));
  const kitAt = (at) => { let v = null; for (const p of sorted) { if (new Date(p.from) <= new Date(at)) v = p.version; else break; } return v ? String(v).split('.').slice(0, 2).join('.') : null; };
  const uses = new Map(); // "<skill>|<session>" -> { skill, kit, tokens }
  for (const a of answers) {
    if (!a.skill || !a.at) continue;
    const kit = kitAt(a.at);
    if (!kit) continue;
    const key = `${a.skill}|${a.session ?? 'unknown'}`;
    const u = uses.get(key) ?? { skill: `/${a.skill}`, kit, tokens: 0 };
    u.tokens += a.input + a.output + a.cacheWrite + a.cacheRead;
    uses.set(key, u);
  }
  const mid = (list) => { const s = [...list].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
  const bySkill = new Map();
  for (const u of uses.values()) { const m = bySkill.get(u.skill) ?? new Map(); m.set(u.kit, [...(m.get(u.kit) ?? []), u.tokens]); bySkill.set(u.skill, m); }
  return [...bySkill].map(([skill, m]) => ({ skill, rows: [...m].filter(([, t]) => t.length >= min).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([kit, t]) => ({ kit, uses: t.length, median: Math.round(mid(t)) })) }))
    .filter((s) => s.rows.length >= 2).sort((a, b) => b.rows.reduce((n, r) => n + r.uses, 0) - a.rows.reduce((n, r) => n + r.uses, 0));
}

/** The lines of that comparison; with nothing to compare yet, one line saying what it needs. */
export function kitLines(byKit, { min = 3, label = 'the last 60 days' } = {}) {
  if (!byKit.length) return [`By kit version: nothing to compare in ${label} yet (a command needs ${min} uses under each of two kit versions).`];
  return [`What one use of a command took, by kit version (${label}; the middle one of its uses):`, ...byKit.slice(0, 8).map((s) => {
    const [first, last] = [s.rows[0], s.rows.at(-1)];
    const change = first.median ? Math.round(((last.median - first.median) / first.median) * 100) : 0;
    return `  ${s.skill}: ${s.rows.map((r) => `kit ${r.kit}: ${tokens(r.median)} (${r.uses} uses)`).join('; ')}${Math.abs(change) >= 10 ? `: ${change > 0 ? `${change}% more` : `${-change}% less`} since ${first.kit}` : ''}`;
  })];
}

/** "1.2 M" for a token count. */
export const tokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n));

/** The report's lines. `prices`: { [model]: { input, output, cacheWrite, cacheRead } } or null; `checked`: when they were. */
export function costLines(sum, { prices = null, checked = null, label = 'the last 7 days' } = {}) {
  const all = (u) => u.input + u.output + u.cacheWrite + u.cacheRead;
  const priced = (rows) => rows.map(([k, u, model]) => {
    const m = prices ? money(u, prices[model ?? k]) : null;
    return `  ${k}: ${tokens(all(u))} tokens (${tokens(u.output)} written, ${tokens(u.cacheRead)} read again from the cache), ${u.answers} answers${m != null ? `, about ${m.toFixed(2)}` : ''}`;
  });
  if (!sum.total.answers) return [`No AI answers recorded for this project in ${label}.`];
  const byModel = [...sum.byModel].sort(([, a], [, b]) => all(b) - all(a));
  const totalMoney = prices ? byModel.reduce((s, [model, u]) => s + (money(u, prices[model]) ?? 0), 0) : null;
  return [
    `AI use in ${label}: ${tokens(all(sum.total))} tokens over ${sum.total.answers} answers${totalMoney != null ? `, about ${totalMoney.toFixed(2)} (prices checked ${checked ?? 'on an unknown date'})` : ' (no prices set: session.prices in workflow/config.json turns tokens into money)'}.`,
    'By model:', ...priced(byModel.map(([k, u]) => [k, u, k])),
    // (a command's answers can come from several models, so it gets tokens, not money)
    'By command (the skill that answered):', ...[...sum.bySkill].sort(([, a], [, b]) => all(b) - all(a)).slice(0, 8)
      .map(([k, u]) => `  ${k}: ${tokens(all(u))} tokens, ${u.answers} answers`),
    'By day:', ...[...sum.byDay].sort(([a], [b]) => a.localeCompare(b)).map(([d, u]) => `  ${d}: ${tokens(all(u))} tokens, ${u.answers} answers`),
  ];
}
