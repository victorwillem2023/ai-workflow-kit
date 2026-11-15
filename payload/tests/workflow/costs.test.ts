// What the product costs (lib/costs.mjs): the running costs in docs/COSTS.md, and options compared over time.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareOptions, costReport, parseCosts } from '../../tools/workflow/lib/costs.mjs';

const md = `# X: what it costs to run

## Running costs
| What | Provider | Plan or size | € a month | Grows with | Checked | Source |
|---|---|---|---|---|---|---|
| App server | Hetzner | CX22 | 4,59 | servers | 2026-11-01 | https://www.hetzner.com/cloud |
| Backups | Hetzner | Storage Box | 3.20 | data | 2026-05-01 | https://www.hetzner.com/storage |
| Email | Brevo | free | 0 | emails | 2026-11-01 |  |

## Your own time
| What | Hours a month | Notes |
|---|---|---|
| Updates | 2 | |

Hourly rate used for estimates: € 50
`;

describe('the running costs', () => {
  it('adds up the month by provider, counts the hours, and flags old prices and missing sources', () => {
    const r = costReport(parseCosts(md), new Date('2026-11-15'));
    assert.equal(r.total, 7.79);
    assert.deepEqual(r.byProvider, { Hetzner: 7.79, Brevo: 0 });
    assert.deepEqual([r.hours, r.timeCost], [2, 100]);
    assert.deepEqual(r.problems, ['Backups: price checked 198 days ago; look again', 'Email: no source link for the price (CLAUDE.md, Docs before memory)']);
  });
  it('reads the empty starter as no lines, not as a line of placeholders', () => {
    assert.deepEqual(parseCosts('## Running costs\n| What | € a month |\n|---|---|\n| <the app server> | <0.00> |\n').lines, []);
  });
});

describe('buy or host, compared over time', () => {
  const options = [
    { name: 'Paid routing API', perUnit: 0.0005, units: 40_000 },
    { name: 'Self-hosted routing', monthly: 30, setupHours: 16, hoursPerMonth: 3 },
  ];
  it('counts the hours as cost, and says where the self-hosted option starts to win', () => {
    const { rows, notes } = compareOptions(options, 50);
    assert.deepEqual(rows.map((r) => [r.name, r.m12, r.m36]), [['Paid routing API', 240, 720], ['Self-hosted routing', 2960, 7280]]);
    assert.match(notes[0], /Self-hosted routing becomes cheaper than Paid routing API above about 360000 units a month \(now 40000\)/);
  });
});
