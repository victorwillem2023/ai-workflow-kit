// What the AI sessions on this project used (no I/O here; tools/workflow/sessioncost.mjs reads Claude Code's own records): the
// tokens of every answer, by day, by model and by command (the skill that answered), instead of asking an agent to guess.
// Money only from prices the project wrote down (`session.prices` in workflow.config.json, per million tokens, with the date
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
    `AI use in ${label}: ${tokens(all(sum.total))} tokens over ${sum.total.answers} answers${totalMoney != null ? `, about ${totalMoney.toFixed(2)} (prices checked ${checked ?? 'on an unknown date'})` : ' (no prices set: session.prices in workflow.config.json turns tokens into money)'}.`,
    'By model:', ...priced(byModel.map(([k, u]) => [k, u, k])),
    // (a command's answers can come from several models, so it gets tokens, not money)
    'By command (the skill that answered):', ...[...sum.bySkill].sort(([, a], [, b]) => all(b) - all(a)).slice(0, 8)
      .map(([k, u]) => `  ${k}: ${tokens(all(u))} tokens, ${u.answers} answers`),
    'By day:', ...[...sum.byDay].sort(([a], [b]) => a.localeCompare(b)).map(([d, u]) => `  ${d}: ${tokens(all(u))} tokens, ${u.answers} answers`),
  ];
}
