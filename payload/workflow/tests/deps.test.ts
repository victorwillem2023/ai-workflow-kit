// New dependencies and docs/STACK.md (workflow/tools/lib/deps.mjs): a library a change adds is named in the stack, with a reason.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dependencyNames, addedDependencies, unnamedDependencies } from '../../workflow/tools/lib/deps.mjs';
import { globToRegExp } from '../../workflow/tools/lib/glob.mjs';

describe('dependencies', () => {
  it('reads the names from package.json, without the type packages', () => {
    const pkg = JSON.stringify({ dependencies: { react: '19.0.0', hono: '4' }, devDependencies: { vitest: '3', '@types/node': '22' } });
    assert.deepEqual(dependencyNames('package.json', pkg), ['react', 'hono', 'vitest']);
  });
  it('reads Cargo.toml, pyproject.toml and go.mod', () => {
    assert.deepEqual(dependencyNames('Cargo.toml', '[package]\nname = "x"\n\n[dependencies]\naxum = "0.8"\nserde = { version = "1", features = ["derive"] }\n\n[dev-dependencies]\ninsta = "1"\n'), ['axum', 'serde', 'insta']);
    assert.deepEqual(dependencyNames('pyproject.toml', '[project]\nname = "x"\ndependencies = ["fastapi>=0.110", "pydantic[email]"]\n\n[dependency-groups]\ndev = ["pytest", "ruff"]\n'), ['fastapi', 'pydantic', 'pytest', 'ruff']);
    assert.deepEqual(dependencyNames('go.mod', 'module example.com/app\n\ngo 1.24\n\nrequire (\n\tgithub.com/go-chi/chi/v5 v5.1.0\n)\n'), ['github.com/go-chi/chi/v5']);
  });
  it('names only what a change added, and of those only what docs/STACK.md does not mention', () => {
    const before = JSON.stringify({ dependencies: { react: '19' } });
    const after = JSON.stringify({ dependencies: { react: '19', 'left-pad': '1', zod: '3' } });
    const added = addedDependencies('package.json', before, after);
    assert.deepEqual(added, ['left-pad', 'zod']);
    assert.deepEqual(unnamedDependencies(added, '| Validation | Zod | schemas at the edge |'), ['left-pad']);
  });
});

describe('glob braces', () => {
  it('{ts,tsx} matches either ending', () => {
    const re = globToRegExp('**/*.test.{ts,tsx}');
    assert.ok(re.test('src/web/Card.test.tsx') && re.test('tests/a.test.ts') && !re.test('tests/a.test.js'));
  });
});

describe("the kit's own tools", () => {
  it('are never asked to be explained in docs/STACK.md (the kit chose them)', () => {
    assert.deepEqual(unnamedDependencies(['knip', 'tsx', '@biomejs/biome', 'esbuild', 'left-pad'], ''), ['left-pad']);
  });
});
