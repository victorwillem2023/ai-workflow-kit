#!/usr/bin/env node
// What the product costs, by script (lib/costs.mjs):
//   node tools/workflow/costs.mjs                       the monthly total from docs/company/COSTS.md, by provider, with your hours, and the
//                                                       lines with no source or a price older than 3 months
//   node tools/workflow/costs.mjs --compare <file.json> options side by side at 1, 12 and 36 months, hours included, and where a
//                                                       per-use option stops being the cheaper one (docs/run/BUY-OR-HOST.md)
// The options file: [{ "name": "Mapbox", "perUnit": 0.0005, "units": 40000 }, { "name": "Self-hosted GraphHopper", "monthly": 30,
// "setupHours": 16, "hoursPerMonth": 3 }]; the hourly rate comes from docs/company/COSTS.md unless an option sets its own.
import { existsSync, readFileSync } from 'node:fs';
import { compareOptions, costReport, parseCosts } from './lib/costs.mjs';

const args = process.argv.slice(2);
const md = existsSync('docs/company/COSTS.md') ? readFileSync('docs/company/COSTS.md', 'utf8') : null;
const costs = md ? parseCosts(md) : { lines: [], hours: [], rate: null };
const eur = (n) => `€${n.toLocaleString('en', { maximumFractionDigits: 2 })}`;

if (args.includes('--compare')) {
  const file = args[args.indexOf('--compare') + 1];
  if (!file || !existsSync(file)) { console.log('Name the options file: npm run costs -- --compare <file.json> (the header of tools/workflow/costs.mjs shows its shape).'); process.exit(1); }
  const { rows, notes } = compareOptions(JSON.parse(readFileSync(file, 'utf8')), costs.rate ?? 0);
  console.log(`| Option | first month | 12 months | 36 months | your hours in a year |\n|---|---|---|---|---|`);
  for (const r of rows) console.log(`| ${r.name} | ${eur(r.m1)} | ${eur(r.m12)} | ${eur(r.m36)} | ${r.hours} |`);
  for (const n of notes) console.log(n);
  console.log(costs.rate ? `(your hours at ${eur(costs.rate)} an hour, from docs/company/COSTS.md)` : '(no hourly rate in docs/company/COSTS.md: your hours count as free, which they are not)');
  process.exit(0);
}

if (!md) { console.log('No docs/company/COSTS.md yet: the kit\'s starter has one; /launch or /estimate fills it.'); process.exit(0); }
const r = costReport(costs);
if (!costs.lines.length) { console.log('docs/company/COSTS.md has no running costs filled in yet.'); process.exit(0); }
console.log(`costs: ${eur(r.total)} a month (${Object.entries(r.byProvider).map(([p, v]) => `${p} ${eur(v)}`).join(', ')}), ${eur(r.total * 12)} a year`);
if (r.hours) console.log(`your time: ${r.hours} hours a month${r.timeCost != null ? `, worth ${eur(r.timeCost)}` : ''}`);
for (const p of r.problems) console.log(`- ${p}`);
process.exit(0);
