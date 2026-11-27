// One state, every view (workflow/tools/lib/views.mjs): each field of a state the computer and the phone both draw is read by
// both, or listed as one's with why; and the "On the phone:" line of a spec (lib/endstate.mjs).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { onlyOf, readsField, stateFields, viewGaps, viewsCheck } from '../../workflow/tools/lib/views.mjs';
import { phoneLineProblems } from '../../workflow/tools/lib/endstate.mjs';
import { onPhone } from '../../workflow/tools/lib/surfaces.mjs';

const reply = `export interface Reply {
  notes: string[]; // what to know first
  missed?: Stop[];
  tips: { text: string; at: number }[];
  readonly questions: string[]
  debug: Record<string, number>;
}`;

describe('one state, every view', () => {
  it('reads the fields of an interface or an object type, its own only', () => {
    assert.deepEqual(stateFields(reply, 'Reply'), ['notes', 'missed', 'tips', 'questions', 'debug']);
    assert.deepEqual(stateFields('type Reply = { a: { b: number }; "c-d"?: string }', 'Reply'), ['a', 'c-d']);
    assert.equal(stateFields(reply, 'Answer'), null);
    assert.deepEqual(stateFields('export type Reply<T = Stop> = { notes: string[]; missed: T[] }', 'Reply'), ['notes', 'missed']);
    assert.deepEqual(stateFields('interface Reply extends Base<{ id: string }> { notes: string[]; missed: Stop[] }', 'Reply'), ['notes', 'missed']);
    assert.deepEqual(stateFields('type Reply = { notes: string[] } & { missed: Stop[] };', 'Reply'), ['notes', 'missed']);
  });

  it('a field is read through a dot, brackets or taken apart; a comment or an object written does not count', () => {
    for (const code of ['r.missed.length', 'r?.missed', "r['missed']", 'const { notes, missed } = reply;', 'function Deck({ missed }) {']) assert.ok(readsField(code, 'missed'), code);
    for (const code of ['function Deck({ missed }: Props) {', 'const Deck = ({ notes, missed }) => null', 'const { reply: { missed } } = props;', 'function Deck({ reply: { missed } }) {', "glob('./stops/*.tsx'); r.missed; at('/x/*/y')", "<p>Don't miss a stop</p>; glob('./stops/*.tsx'); r.missed", 'const Deck = ({ missed }): JSX.Element => null', "p.replace(/\\/*$/, ''); r.missed", "const u = /https?:\\/\\//; r.missed"]) assert.ok(readsField(code, 'missed'), code);
    for (const code of ['// r.missed', '/* r.missed */', 'const x = { missed: 1 }', 'const missedCount = 0', 'setReply({ missed: [] })', 'save({ missed })', 'ok ? setReply({ missed }) : null', 'const { tips: missed } = reply;', "type M = Reply['missed'];", 'let n: typeof r.missed;']) assert.ok(!readsField(code, 'missed'), code);
  });

  it('with the names the state goes by, a field of another object does not count', () => {
    assert.ok(readsField('if (res.status === 200) go()', 'status'));
    assert.ok(!readsField('if (res.status === 200) go()', 'status', ['reply']));
    assert.ok(readsField('reply?.status', 'status', ['reply']));
    assert.ok(!readsField('const { status } = await res.json();', 'status', ['reply']));
    assert.ok(readsField('const { status } = props.reply;', 'status', ['reply']));
    assert.ok(readsField('function Deck({ reply: { status } }) {', 'status', ['reply']));
    for (const code of ['reply!.status', '(reply as Reply).status', "reply?.['status']"]) assert.ok(readsField(code, 'status', ['reply']), code);
  });

  const desk = new Map([['src/web/desk/Map.tsx', 'r.notes; r.missed; r.tips; r.questions; r.debug']]);
  const deck = new Map([['src/web/deck/Card.tsx', 'const { notes, tips } = reply; reply.questions']]);

  it('says a field one view reads and another does not, with where it is read', () => {
    const gaps = viewGaps(stateFields(reply, 'Reply')!, { computer: desk, phone: deck });
    assert.equal(gaps.length, 2);
    assert.match(gaps[0], /^"missed" is read by the computer's view \(src\/web\/desk\/Map\.tsx\) but not by the phone's: draw it there too, or list it in views\.only/);
  });

  it('a field listed as one view\'s, with why, passes; a list without a reason, a wrong view or a gone field does not', () => {
    const fields = stateFields(reply, 'Reply')!;
    assert.deepEqual(viewGaps(fields, { computer: desk, phone: deck }, { debug: 'computer: debug numbers, for the owner', missed: 'computer: the phone shows the next stop only' }), []);
    const bad = viewGaps(fields, { computer: desk, phone: deck }, { debug: 'computer only', missed: 'watch: on the wrist', gone: 'none: old' });
    assert.ok(bad.some((l) => /"debug" needs the view and a reason/.test(l)));
    assert.ok(bad.some((l) => /"missed" names watch, which is no view here/.test(l)));
    assert.ok(!bad.some((l) => /the watch's/.test(l)), 'a view that is not there is never asked for');
    assert.ok(bad.some((l) => /names "gone", which the state does not have/.test(l)));
    assert.deepEqual(onlyOf('none: kept for the log'), { views: ['none'], why: 'kept for the log' });
    assert.deepEqual(viewGaps(fields, { Desk: desk, Phone: deck }, { debug: 'Desk: debug numbers, for the owner', missed: 'Desk: the next stop only on the phone' }), [], 'view names in any case');
  });

  it('a field no view reads is said too, unless it is listed as none\'s', () => {
    const quiet = new Map([['a.ts', 'r.notes']]);
    assert.match(viewGaps(['notes', 'raw'], { computer: quiet, phone: quiet })[0], /^"raw" is read by no view/);
    assert.deepEqual(viewGaps(['notes', 'raw'], { computer: quiet, phone: quiet }, { raw: 'none: kept for the log' }), []);
  });

  it('checks the config entries against the files, the shared parts counted for each view', () => {
    const texts: Record<string, string> = { 'src/web/reply.ts': reply, 'src/web/desk/Map.tsx': 'r.notes; r.missed; r.tips; r.questions; r.debug', 'src/web/deck/Card.tsx': 'r.notes; r.tips; r.questions', 'src/web/parts/Missed.tsx': 'r.missed' };
    const files = Object.keys(texts);
    const matches = (f: string, globs: string[]) => globs.some((g) => f.startsWith(g.replace('**', '')));
    const read = (f: string) => texts[f] ?? null;
    const entry = { state: 'src/web/reply.ts#Reply', views: { computer: ['src/web/desk/**'], phone: ['src/web/deck/**'] }, only: { debug: 'computer: debug numbers, for the owner' } };
    assert.match(viewsCheck([entry], { files, read, matches })[0], /"missed" is read by the computer's view .* but not by the phone's/);
    assert.deepEqual(viewsCheck([{ ...entry, shared: ['src/web/parts/**'] }], { files, read, matches }), []);
    assert.match(viewsCheck([{ ...entry, state: 'src/web/reply.ts' }], { files, read, matches })[0], /should be "<file>#<type>"/);
    assert.match(viewsCheck([{ ...entry, views: { computer: ['src/web/desk/**'], phone: ['src/web/watch/**'] } }], { files, read, matches })[0], /views\.phone: no code file matches/);
    assert.match(viewsCheck([{ ...entry, shared: ['src/web/parts/**'], views: { computer: ['src/web/desk/**'], phone: ['src/web/dek/**'] } }], { files, read, matches })[0], /views\.phone: no code file matches/, 'shared parts do not hide a view with no files');
  });
});

describe('the "On the phone:" line of a spec', () => {
  const spec = (line: string | null, approval = 'approved on 2026-11-28') => `# Spec: x\n\nCard: #3, type ui\n${line == null ? '' : `On the phone: ${line}\n`}Owner approval: ${approval}\n`;
  it('refuses an approved spec whose line is empty or the template\'s, when people use a phone', () => {
    for (const line of ['', '<what the phone shows of this change | the same as on the computer>']) assert.equal(phoneLineProblems([['x.md', spec(line)]], true).fails.length, 1, line);
    assert.deepEqual(phoneLineProblems([['x.md', spec('the next missed stop on the card; the full list stays on the computer')]], true), { fails: [], advice: [] });
  });
  it('advises on an older spec without the line, and asks nothing without a phone or before approval', () => {
    assert.match(phoneLineProblems([['x.md', spec(null)]], true).advice[0], /^advice: workflow\/specs\/x\.md has no "On the phone:" line/);
    assert.deepEqual(phoneLineProblems([['x.md', spec('')]], false), { fails: [], advice: [] });
    assert.deepEqual(phoneLineProblems([['x.md', spec('', 'not yet')]], true), { fails: [], advice: [] });
  });
  it('a phone is among the surfaces when a phone width is drawn', () => {
    assert.deepEqual([onPhone(['web-phone']), onPhone(['web', 'phone-companion']), onPhone(['web']), onPhone(['api'])], [true, true, false, false]);
  });
});
