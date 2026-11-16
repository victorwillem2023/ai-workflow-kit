// Python and Go in the import graph (workflow/tools/lib/graph.mjs), for the layer rules and the file map, and a Python
// `def` in the function-length check.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../../workflow/tools/lib/graph.mjs';
import { findViolations } from '../../workflow/tools/lib/boundaries.mjs';
import { longFunctions } from '../../workflow/tools/lib/funclen.mjs';

describe('Python files in the graph', () => {
  const graph = buildGraph(new Map(Object.entries({
    'src/app/core/__init__.py': '',
    'src/app/core/total.py': 'import requests\nfrom . import rounding\n\ndef add(a, b):\n    return a + b\n',
    'src/app/core/rounding.py': 'import math\n',
    'src/app/server.py': 'from app.core import total\nfrom app.core.rounding import (\n    half_up,\n)\nimport os.path\n',
  })));
  it('`from app.core import total` reaches the file total.py, a relative import the file next to it', () => {
    assert.deepEqual(graph.imports.get('src/app/server.py')!.sort(), ['src/app/core/__init__.py', 'src/app/core/rounding.py', 'src/app/core/total.py']);
    assert.deepEqual(graph.imports.get('src/app/core/total.py'), ['src/app/core/rounding.py']);
  });
  it('a pure folder that names an outside module it may not use is a violation', () => {
    const v = findViolations(graph, [{ name: 'core is pure', from: 'src/app/core/**', forbid: [], forbidUse: ['requests', 'socket'] }]);
    assert.deepEqual(v.map((x) => `${x.file} -> ${x.target}`), ['src/app/core/total.py -> requests']);
  });
  it('a long def is measured by its indentation, blank lines inside it counted', () => {
    const body = Array.from({ length: 6 }, (_, i) => `    x${i} = ${i}`).join('\n');
    const f = new Map([['src/a.py', `def short():\n    return 1\n\nasync def long(a):\n${body}\n\n    return a\n\nY = 2\n`]]);
    assert.deepEqual(longFunctions(f, 8), { 'src/a.py:long': 9 });
  });
});

describe('Go files in the graph', () => {
  const graph = buildGraph(new Map(Object.entries({
    'cmd/app/main.go': 'package main\n\nimport (\n\t"fmt"\n\tcore "example.com/app/internal/core"\n)\n',
    'internal/core/total.go': 'package core\n\nimport "net/http"\n',
    'internal/core/total_test.go': 'package core\n',
  })));
  it('an import path reaches the files of the folder it ends in, tests left out', () => {
    assert.deepEqual(graph.imports.get('cmd/app/main.go'), ['internal/core/total.go']);
  });
  it('a pure folder that imports net/http is a violation', () => {
    const v = findViolations(graph, [{ name: 'core is pure', from: 'internal/core/**', forbid: [], forbidUse: ['net', 'os'] }]);
    assert.deepEqual(v.map((x) => `${x.file} -> ${x.target}`), ['internal/core/total.go -> net/http']);
  });
});
