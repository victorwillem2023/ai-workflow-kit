// The access review (workflow/tools/lib/access.mjs): who can reach the project on GitHub, against the list of who should.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { accessReport, compareAccess, parseAccess } from '../../workflow/tools/lib/access.mjs';

const md = `# Access

Last review: 2026-08-01

| Who | Where | Role | Why |
|---|---|---|---|
| @owner | GitHub | admin | the owner |
| @old-friend | GitHub | write | helped with the first release |
| \`deploy-bot\` | GitHub deploy key | read | the server pulls the image list |
| DEPLOY_TOKEN | GitHub secret | | the release pipeline |
| owner | Hetzner console | owner | the server and the backups |

Text after the table.
`;

describe('the access review', () => {
  it('reads the table, wherever it sits in the file', () => {
    const rows = parseAccess(md);
    assert.equal(rows.length, 5);
    assert.deepEqual(rows[2], { who: 'deploy-bot', where: 'GitHub deploy key', role: 'read', why: 'the server pulls the image list' });
  });
  it('finds access nobody listed, rows for access that is gone, and a role that changed', () => {
    const found = [
      { kind: 'person' as const, who: 'owner', role: 'admin' },
      { kind: 'person' as const, who: 'stranger', role: 'write' },
      { kind: 'deploy key' as const, who: 'deploy-bot', role: 'write' },
      { kind: 'secret' as const, who: 'DEPLOY_TOKEN' },
    ];
    const c = compareAccess(found, parseAccess(md));
    assert.deepEqual(c.unlisted.map((f) => f.who), ['stranger']);
    assert.deepEqual(c.gone.map((r) => r.who), ['@old-friend']);
    assert.deepEqual(c.changed.map((f) => [f.who, f.role, f.listed]), [['deploy-bot', 'write', 'read']]);
    assert.deepEqual(c.byHand.map((r) => r.where), ['Hetzner console']);
  });
  it('writes the review as a checklist, with what no script can check', () => {
    const r = accessReport(compareAccess([], parseAccess(md)), '2026-11-15');
    assert.match(r, /^# Access review, 2026-11-15/);
    assert.match(r, /- \[ \] owner: Hetzner console, owner\. Still needed\?/);
  });
});
