// The human sign-off for sensitive files (workflow/tools/lib/signoff.mjs): a change to money, health or legal code passes only
// with a row for exactly that version of the files, signed by a signer the branch's main already trusts.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesAny } from '../../workflow/tools/lib/glob.mjs';
import { fingerprint, makeKey, publicOf, parseSignoffs, parseSigners, sensitiveFiles, signerRow, signoffRow, signoffVerdict, trustedKeys } from '../../workflow/tools/lib/signoff.mjs';

const paths = ['src/core/billing/**', 'docs/company/PRIVACY.md'];
const disk: Record<string, string> = { 'src/core/billing/vat.ts': 'export const VAT = 0.21;\n', 'docs/company/PRIVACY.md': '# Privacy\n' };
const read = (f: string) => disk[f];
const head = '| Who | Public key | Added | Endorsed by |\n|---|---|---|---|\n';
const owner = makeKey('owner passphrase long');
const signers = `${head}${signerRow({ who: 'Owner', key: owner.publicKey, date: '2026-11-01' })}\n`;
const files = ['src/core/billing/vat.ts'];
const print = fingerprint(files, read);
const signed = (key = owner, pass = 'owner passphrase long', who = 'Owner') => signoffRow({ date: '2026-11-15', who, print, files, privateKey: key.privateKey, passphrase: pass });
const verdict = (signoffs: string, o: { base?: string | null; now?: string | null; readWith?: (f: string) => string | undefined } = {}) =>
  signoffVerdict({ changed: files, paths, matches: matchesAny, read: o.readWith ?? read, signoffs, baseSigners: o.base === undefined ? signers : o.base, signers: o.now === undefined ? signers : o.now });

describe('what sensitive.paths covers', async () => {
  const { coversFile, deadPaths } = await import('../../workflow/tools/lib/signoff.mjs');
  it('a folder covers every file under it, written with or without the last slash; a glob stays a glob', () => {
    for (const p of ['src/server/accounts/', 'src/server/accounts', './src/server/accounts/', 'src/server/accounts/**']) {
      assert.deepEqual(sensitiveFiles(['src/server/accounts/login.ts', 'src/server/accounts/db/reset.ts', 'src/server/accounts-old.ts'], [p], matchesAny),
        ['src/server/accounts/db/reset.ts', 'src/server/accounts/login.ts'], p);
    }
    assert.equal(coversFile('src/core/billing/vat.ts', 'src/core/*.ts', matchesAny), false);
    assert.equal(coversFile('docs/company/PRIVACY.md', 'docs/company/PRIVACY.md', matchesAny), true);
  });
  it('names an entry that covers no file of the project, so a mistyped folder is seen', () => {
    assert.deepEqual(deadPaths(['src/server/accounts/', 'src/server/acounts/', 'src/**/*.sql'], ['src/server/accounts/login.ts'], matchesAny), ['src/server/acounts/', 'src/**/*.sql']);
  });
});

describe('the sign-off for sensitive files', () => {
  it('only asks for one when a sensitive file changed', () => {
    assert.deepEqual(sensitiveFiles(['src/web/App.tsx', 'src/core/billing/vat.ts', 'src/core/billing/vat.ts'], paths, matchesAny), ['src/core/billing/vat.ts']);
    assert.equal(signoffVerdict({ changed: ['src/web/App.tsx'], paths, matches: matchesAny, read, signoffs: '', baseSigners: '', signers: '' }).ok, true);
  });
  it('fails a sensitive change no person signed, and says only a person at a terminal can sign', () => {
    const v = verdict('');
    assert.equal(v.ok, false);
    assert.match(v.line ?? '', /npm run signoff in a terminal/);
  });
  it('passes with a row the owner signed for this exact version, on any computer, and fails again after any later edit', () => {
    assert.equal(verdict(`${signed()}\n`).ok, true);
    const edited = (f: string) => (f === 'src/core/billing/vat.ts' ? 'export const VAT = 0.06;\n' : read(f));
    assert.equal(verdict(`${signed()}\n`, { readWith: edited }).ok, false);
  });
  it('does not care about line endings, and counts a deleted file as a change', () => {
    assert.equal(fingerprint(['a'], () => 'x\r\ny\n'), fingerprint(['a'], () => 'x\ny\n'));
    assert.notEqual(fingerprint(['a'], () => undefined), fingerprint(['a'], () => 'x'));
  });
  it('reads only well-formed rows from the records', () => {
    const rows = parseSignoffs('| 2026-11-15 | Owner | 0123456789abcdef | `a.ts`, `b.ts` | c2ln |\n| not a row |\n| 2026-11-15 | x | short | a |');
    assert.deepEqual(rows, [{ date: '2026-11-15', who: 'Owner', fingerprint: '0123456789abcdef', files: ['a.ts', 'b.ts'], signature: 'c2ln' }]);
    assert.deepEqual(parseSigners(signers).map((s) => [s.who, s.endorsed]), [['Owner', 'first']]);
  });
  it('a wrong passphrase cannot sign', () => {
    assert.throws(() => signed(owner, 'not the passphrase'));
  });
});

describe('the public half of a key', () => {
  it('comes out of the encrypted key only with its passphrase', () => {
    assert.equal(publicOf(owner.privateKey, 'owner passphrase long'), owner.publicKey);
    assert.throws(() => publicOf(owner.privateKey, 'not the passphrase'));
  });
});

describe('a sign-off an agent tries to make', () => {
  const agent = makeKey('the agent made this one');
  it('a row written by hand, or with a made-up signature, is refused', () => {
    const v = verdict(`| 2026-11-15 | Owner | ${print} | \`src/core/billing/vat.ts\` | ${'A'.repeat(86)}== |\n`);
    assert.equal(v.ok, false);
    assert.match(v.line ?? '', /no signer in docs\/company\/SIGNERS\.md signed it/);
  });
  it('a row with the name or date changed after signing is refused', () => {
    assert.equal(verdict(`${signed().replace('| Owner |', '| Agent |')}\n`).ok, false);
    assert.equal(verdict(`${signed().replace('2026-11-15', '2026-11-16')}\n`).ok, false);
  });
  it("its own key, added to SIGNERS.md in the same change, counts for nothing", () => {
    const withAgent = `${signers}${signerRow({ who: 'Agent', key: agent.publicKey, date: '2026-11-15' })}\n`;
    assert.equal(verdict(`${signed(agent, 'the agent made this one', 'Agent')}\n`, { now: withAgent }).ok, false);
  });
  it('the first signer of a project goes in on its own: a key and a sign-off in one change is refused', () => {
    const v = verdict(`${signed()}\n`, { base: null });
    assert.equal(v.ok, false);
    assert.match(v.line ?? '', /no signer yet on the branch this change left/);
  });
});

describe('more than one signer', () => {
  const second = makeKey('second computer passphrase');
  it('a signer the owner endorsed counts in the change that adds them, and their sign-off passes', () => {
    const now = `${signers}${signerRow({ who: 'Sam', key: second.publicKey, date: '2026-11-15', endorser: { privateKey: owner.privateKey, passphrase: 'owner passphrase long' } })}\n`;
    assert.deepEqual(trustedKeys(signers, now), [owner.publicKey, second.publicKey]);
    assert.equal(verdict(`${signed(second, 'second computer passphrase', 'Sam')}\n`, { now }).ok, true);
  });
  it('an endorsement made with a key main does not trust is not one', () => {
    const fake = makeKey('another made-up key');
    const now = `${signers}${signerRow({ who: 'Sam', key: second.publicKey, date: '2026-11-15', endorser: { privateKey: fake.privateKey, passphrase: 'another made-up key' } })}\n`;
    assert.deepEqual(trustedKeys(signers, now), [owner.publicKey]);
  });
});
