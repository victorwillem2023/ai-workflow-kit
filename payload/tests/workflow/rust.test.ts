// Rust in the import graph (tools/workflow/lib/graph.mjs) and the layer rules (boundaries.mjs): `use crate::…`, `mod name;`,
// and things from outside a folder may not name (`forbidUse`).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, affectedTests } from '../../tools/workflow/lib/graph.mjs';
import { findViolations } from '../../tools/workflow/lib/boundaries.mjs';
import { summaryOf } from '../../tools/workflow/lib/map.mjs';

const files = new Map(Object.entries({
  'src/main.rs': 'mod core;\nmod server;\nfn main() { server::run(); }\n',
  'src/core/mod.rs': '//! The rules of the app. Pure.\npub mod total;\n',
  'src/core/total.rs': 'use std::fs::File;\npub fn add(a: u32, b: u32) -> u32 { a + b }\n',
  'src/server.rs': 'use crate::core::total::add;\nuse tokio::net::TcpListener;\npub fn run() {}\n',
}));

describe('Rust files in the graph', () => {
  const graph = buildGraph(files);
  it('`use crate::core::total::add` reaches src/core/total.rs and `mod name;` the file next to it', () => {
    assert.deepEqual(graph.imports.get('src/server.rs'), ['src/core/total.rs']);
    assert.deepEqual(graph.imports.get('src/main.rs')!.sort(), ['src/core/mod.rs', 'src/server.rs']);
    assert.deepEqual(graph.imports.get('src/core/mod.rs'), ['src/core/total.rs']);
  });
  it('a layer rule names the file that reaches a forbidden folder, and the outside thing a pure folder may not use', () => {
    const rules = [
      { name: 'core is pure', from: 'src/core/**', forbid: ['src/server*'], forbidUse: ['std::fs', 'tokio'] },
      { name: 'main only starts', from: 'src/main.rs', forbid: ['src/core/**'] },
    ];
    assert.deepEqual(findViolations(graph, rules).map((v) => `${v.file} -> ${v.target}`), ['src/core/total.rs -> std::fs::File', 'src/main.rs -> src/core/mod.rs']);
  });
  it('a changed Rust file outside the graph means the whole suite, when the gate is told .rs is code', () => {
    const r = affectedTests(graph, ['src/new.rs'], { isTest: () => false, isCode: (f: string) => f.endsWith('.rs') });
    assert.equal(r.all, true);
  });
  it('the file map reads a //! comment and a # comment', () => {
    assert.equal(summaryOf(files.get('src/core/mod.rs')!), 'The rules of the app.');
    assert.equal(summaryOf('# Adds the totals. Pure.\nimport os\n'), 'Adds the totals.');
  });
});
