// The app map: every decision {{PROJECT}} makes, as yes/no trees. Open index.html beside this file to see it.
// This file is the data only. Keep it current: root CLAUDE.md, "The app map".
//
// A question:  { q: 'Is the file valid?', f: 'file it is decided in', yes: [nodes], no: [nodes] }
//              or  opts: [['label', [nodes]], ...]  when the answer is not yes or no
// An end:      { t: 'what happens', s: status, f: 'file', n: 'a note', card: [12] }
// status:      leave out = built (the code exists) · 'weak' = built, with a known problem (say which in n)
//              'gap' = not built · 'building' = a session is on it · 'unmapped' = exists, not drawn here yet
// A part:      { id, name, intro, src, basis, tree }   basis: 'code' (read from the code) or 'guide' / 'notes' (from the docs)
// kinds:       which parts each kind of request (docs/REQUESTS.md) runs through: { 'kind-slug': ['part-id'] }
// Write what the app does in plain words, one decision per node. Grep this file for the words; don't read it whole.
// The first group on the page, "What someone asks", is not in this file: build-requests.mjs makes it from docs/requests/.
window.FLOW = { asof: '', commit: '', kinds: {}, groups: [
{ name: 'How it works', stages: [
{ id: 'first', name: 'The first thing it decides', basis: 'notes', intro: 'An example to replace: /setup writes the first real parts.', src: '', tree: [
 { q: 'Is what came in something the app can handle?',
  yes: [{ t: 'It is handled.', s: 'gap' }],
  no: [{ t: 'The app says what is wrong, and what would work.', s: 'gap' }] },
]},
]},
]};
