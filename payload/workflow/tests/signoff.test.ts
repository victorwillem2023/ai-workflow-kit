// The human sign-off for sensitive files (workflow/tools/lib/signoff.mjs): a change to money, health or legal code passes only
// with a person's sign-off for exactly that version of the files.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesAny } from '../../workflow/tools/lib/glob.mjs';
import { fingerprint, parseSignoffs, sensitiveFiles, signoffRow, signoffVerdict } from '../../workflow/tools/lib/signoff.mjs';

const paths = ['src/core/billing/**', 'docs/company/PRIVACY.md'];
const disk: Record<string, string> = { 'src/core/billing/vat.ts': 'export const VAT = 0.21;\n', 'docs/company/PRIVACY.md': '# Privacy\n' };
const read = (f: string) => disk[f];

describe('the sign-off for sensitive files', () => {
  it('only asks for one when a sensitive file changed', () => {
    assert.deepEqual(sensitiveFiles(['src/web/App.tsx', 'src/core/billing/vat.ts', 'src/core/billing/vat.ts'], paths, matchesAny), ['src/core/billing/vat.ts']);
    assert.equal(signoffVerdict({ changed: ['src/web/App.tsx'], paths, matches: matchesAny, read, signoffs: '' }).ok, true);
  });
  it('fails a sensitive change no person signed, and says only a person at a terminal can sign', () => {
    const v = signoffVerdict({ changed: ['src/core/billing/vat.ts'], paths, matches: matchesAny, read, signoffs: '' });
    assert.equal(v.ok, false);
    assert.match(v.line ?? '', /npm run signoff in a terminal/);
  });
  it('passes once the row for this exact version is there, and fails again after any later edit', () => {
    const files = ['src/core/billing/vat.ts'];
    const print = fingerprint(files, read);
    const md = `| Date | Who | Fingerprint | Files |\n|---|---|---|---|\n${signoffRow({ date: '2026-11-15', who: 'Owner', print, files })}\n`;
    assert.equal(signoffVerdict({ changed: files, paths, matches: matchesAny, read, signoffs: md }).ok, true);
    const edited = (f: string) => (f === 'src/core/billing/vat.ts' ? 'export const VAT = 0.06;\n' : read(f));
    assert.equal(signoffVerdict({ changed: files, paths, matches: matchesAny, read: edited, signoffs: md }).ok, false);
  });
  it('does not care about line endings, and counts a deleted file as a change', () => {
    assert.equal(fingerprint(['a'], () => 'x\r\ny\n'), fingerprint(['a'], () => 'x\ny\n'));
    assert.notEqual(fingerprint(['a'], () => undefined), fingerprint(['a'], () => 'x'));
  });
  it('reads only well-formed rows from the record', () => {
    const rows = parseSignoffs('| 2026-11-15 | Owner | 0123456789abcdef | `a.ts`, `b.ts` |\n| not a row |\n| 2026-11-15 | x | short | a |');
    assert.deepEqual(rows, [{ date: '2026-11-15', who: 'Owner', fingerprint: '0123456789abcdef', files: ['a.ts', 'b.ts'] }]);
  });
});
