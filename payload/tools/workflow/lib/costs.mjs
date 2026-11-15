// What the product costs (no I/O here): the running costs table and the hours in docs/company/COSTS.md, and the comparison of options
// over time for a buy-or-host decision (docs/run/BUY-OR-HOST.md). The model explains; the sums are done here, the same every time.
const DAY = 86_400_000;
const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());
const euros = (s) => { const m = /-?\d+(?:[.,]\d+)?/.exec(String(s).replace(/\s/g, '')); return m ? Number(m[0].replace(',', '.')) : null; };

/** The rows of the first table under a heading: [{ ...columns by header }]. */
function table(md, heading) {
  const at = md.search(new RegExp(`^## ${heading}`, 'm'));
  if (at < 0) return [];
  const lines = md.slice(at).split('\n').slice(1);
  const start = lines.findIndex((l) => l.trim().startsWith('|'));
  if (start < 0) return [];
  const rows = [];
  for (const l of lines.slice(start)) { if (!l.trim().startsWith('|')) break; rows.push(cells(l)); }
  const [head, , ...body] = rows;
  return body.filter((r) => !r.join('').startsWith('<')).map((r) => Object.fromEntries(head.map((h, i) => [h.toLowerCase(), r[i] ?? ''])));
}

/** docs/company/COSTS.md read: { lines, hours, rate }. */
export function parseCosts(md) {
  const lines = table(md, 'Running costs').map((r) => ({ what: r.what, provider: r.provider, plan: r['plan or size'], monthly: euros(r['€ a month']), grows: r['grows with'], checked: r.checked, source: r.source }));
  const hours = table(md, 'Your own time').map((r) => ({ what: r.what, hours: euros(r['hours a month']) ?? 0 }));
  const rate = euros(/^Hourly rate used for estimates:\s*(.+)$/m.exec(md)?.[1] ?? '') ;
  return { lines, hours, rate };
}

/** The sums and what to fix: { total, byProvider, hours, timeCost, problems }. */
export function costReport({ lines, hours, rate }, now = new Date()) {
  const problems = [];
  for (const l of lines) {
    if (l.monthly == null) problems.push(`${l.what}: no price`);
    if (!/^https?:\/\//.test(l.source ?? '')) problems.push(`${l.what}: no source link for the price (CLAUDE.md, Docs before memory)`);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(l.checked ?? '') ? new Date(`${l.checked}T00:00:00Z`) : null;
    if (!d) problems.push(`${l.what}: no date the price was checked`);
    else if ((now - d) / DAY > 90) problems.push(`${l.what}: price checked ${Math.floor((now - d) / DAY)} days ago; look again`);
  }
  const total = Math.round(lines.reduce((s, l) => s + (l.monthly ?? 0), 0) * 100) / 100;
  const byProvider = {};
  for (const l of lines) byProvider[l.provider] = Math.round(((byProvider[l.provider] ?? 0) + (l.monthly ?? 0)) * 100) / 100;
  const h = hours.reduce((s, x) => s + x.hours, 0);
  return { total, byProvider, hours: h, timeCost: rate ? Math.round(h * rate) : null, problems };
}

/** One option's cost after `months`: the fixed price, the usage, the one-off and the hours (setup once, then each month). */
export function optionCost(o, months, rate = 0) {
  const usage = (o.perUnit ?? 0) * (o.units ?? 0);
  const hours = (o.setupHours ?? 0) + (o.hoursPerMonth ?? 0) * months;
  return Math.round(((o.monthly ?? 0) + usage) * months + (o.oneOff ?? 0) + hours * (o.hourlyRate ?? rate));
}

/** Options compared at 1, 12 and 36 months, cheapest first at 36, and where two options cost the same per month by usage. */
export function compareOptions(options, rate = 0) {
  const rows = options.map((o) => ({ name: o.name, m1: optionCost(o, 1, rate), m12: optionCost(o, 12, rate), m36: optionCost(o, 36, rate), hours: (o.setupHours ?? 0) + (o.hoursPerMonth ?? 0) * 12 }))
    .sort((a, b) => a.m36 - b.m36);
  // break-even: the monthly units at which the per-unit option costs as much as the flat one (hours included)
  const notes = [];
  for (const a of options) for (const b of options) {
    if (a === b || !(a.perUnit > 0) || (b.perUnit ?? 0) > 0) continue;
    const flat = (b.monthly ?? 0) + (b.hoursPerMonth ?? 0) * (b.hourlyRate ?? rate) - (a.monthly ?? 0) - (a.hoursPerMonth ?? 0) * (a.hourlyRate ?? rate);
    if (flat > 0) notes.push(`${b.name} becomes cheaper than ${a.name} above about ${Math.ceil(flat / a.perUnit)} units a month (now ${a.units ?? 0}).`);
  }
  return { rows, notes };
}
