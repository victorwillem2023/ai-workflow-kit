// The data and permission checks (lib/datacheck.mjs): a migration that ran is never edited, SQL takes its values as parameters,
// a new route says who it refuses.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dataAdvice, editedMigrations, permissionAdvice, sqlAdvice } from '../../tools/workflow/lib/datacheck.mjs';
import { matchesAny } from '../../tools/workflow/lib/glob.mjs';

const added = (file: string, ...lines: string[]) => new Map([[file, lines]]);
const globs = ['**/migrations/**/*.sql', 'drizzle/**/*.sql'];

describe('migrations', () => {
  it('names a migration that was there before and is changed, renamed or deleted', () => {
    const status = 'M\tdb/migrations/0001_users.sql\nD\tdrizzle/0002_orders.sql\nR100\tdb/migrations/0003_a.sql\tdb/migrations/0003_b.sql\n';
    assert.deepEqual(editedMigrations(status, globs, matchesAny), [
      { file: 'db/migrations/0001_users.sql', how: 'changed' }, { file: 'drizzle/0002_orders.sql', how: 'deleted' }, { file: 'db/migrations/0003_a.sql', how: 'renamed' }]);
  });
  it('lets a new migration and every other file be', () => {
    assert.deepEqual(editedMigrations('A\tdb/migrations/0004_new.sql\nM\tsrc/server/orders.ts\nM\tdrizzle/meta/_journal.json\n', globs, matchesAny), []);
  });
});

describe('SQL built from a value', () => {
  const said = (file: string) => [`advice: ${file} builds SQL text from a value: pass it as a parameter (a name from a fixed list: say "fixed list" in a comment on that line). docs/workflow/DATA.md, *Queries*`];
  it('advises on a value filled into a plain template, on one line or over several', () => {
    assert.deepEqual(sqlAdvice(added('src/server/orders.ts', 'const q = `SELECT id FROM orders WHERE id = ${id}`;')), said('src/server/orders.ts'));
    assert.deepEqual(sqlAdvice(added('src/server/orders.ts', 'const q = `SELECT id, total', '  FROM orders', '  WHERE customer_id = ${customer}`;')), said('src/server/orders.ts'));
  });
  it('lets a tagged template be: it passes its values as parameters', () => {
    assert.deepEqual(sqlAdvice(added('src/server/orders.ts', 'const rows = await sql`SELECT id FROM orders WHERE id = ${id}`;')), []);
    assert.deepEqual(sqlAdvice(added('src/server/orders.ts', "db.query('SELECT id FROM orders WHERE id = $1', [id]);")), []);
  });
  it('advises on a joined string, in each language', () => {
    assert.equal(sqlAdvice(added('src/server/a.ts', "const q = 'SELECT id FROM orders WHERE id = ' + id;")).length, 1);
    assert.equal(sqlAdvice(added('src/store.py', 'cur.execute(f"SELECT id FROM orders WHERE id = {order_id}")')).length, 1);
    assert.equal(sqlAdvice(added('src/store.py', 'cur.execute("SELECT id FROM orders WHERE id = %s" % order_id)')).length, 1);
    assert.equal(sqlAdvice(added('internal/store/orders.go', 'q := fmt.Sprintf("SELECT id FROM orders WHERE id = %s", id)')).length, 1);
    assert.equal(sqlAdvice(added('src/store.rs', 'let q = format!("SELECT id FROM orders WHERE id = {}", id);')).length, 1);
    assert.deepEqual(sqlAdvice(added('src/store.py', 'cur.execute("SELECT id FROM orders WHERE id = %s", (order_id,))')), []);
  });
  it('lets plain text, comments, tests and a name from a fixed list be', () => {
    assert.deepEqual(sqlAdvice(added('src/web/list.ts', 'const label = `Select ${n} items and update ${m}`;')), []);
    assert.deepEqual(sqlAdvice(added('src/server/a.ts', "// const q = 'SELECT id FROM orders WHERE id = ' + id;")), []);
    assert.deepEqual(sqlAdvice(added('tests/server/a.test.ts', "const q = 'SELECT id FROM orders WHERE id = ' + id;")), []);
    assert.deepEqual(sqlAdvice(added('src/server/a.ts', 'const q = `SELECT id FROM orders ORDER BY ${column}`; // fixed list: SORTABLE')), []);
  });
});

describe('who a new route refuses', () => {
  const route = added('src/server/orders.ts', "app.get('/api/orders/:id', showOrder);");
  it('says nothing in an app without sign-in', () => {
    assert.deepEqual(permissionAdvice(route, {}), []);
  });
  it('advises when a route is added and no new test says who is refused', () => {
    assert.deepEqual(permissionAdvice(route, { signIn: true }), ["advice: src/server/orders.ts adds a route but no new test says who is refused (signed out, another user's id): docs/workflow/PERMISSIONS.md, *Tests*"]);
  });
  it('is quiet once the change adds a test named for a signed-out caller or another user', () => {
    const both = new Map([...route, ['tests/server/orders.test.ts', ["it('answers not found for another user\\'s order', async () => {"]]]);
    assert.deepEqual(permissionAdvice(both, { signIn: true }), []);
    const go = new Map([['internal/server/orders.go', ['mux.HandleFunc("/orders", h)']], ['internal/server/orders_test.go', ['func TestRefusesSignedOut(t *testing.T) {']]]);
    assert.deepEqual(permissionAdvice(go, { signIn: true, server: 'internal/server/' }), []);
  });
  it('reads the same diff as the gate\'s other advice', () => {
    const diff = "+++ b/src/server/orders.ts\n+const q = 'SELECT id FROM orders WHERE id = ' + id;\n+app.get('/api/orders', list);\n";
    assert.equal(dataAdvice(diff, new Map(), { security: { signIn: true } }).length, 2);
    assert.equal(dataAdvice(diff).length, 1);
  });
});
