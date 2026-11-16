// The pattern for a data test (docs/workflow/TESTING.md, *Data tests* and *The database in tests*; docs/workflow/DATA.md): the
// schema from the migrations, each test alone in a transaction that is rolled back, and a test for each rule the database holds
// (a constraint) or a query holds (who sees what). Shown with Node's own SQLite in memory; for Postgres keep the shape with a
// throwaway Postgres (a container), never SQLite standing in for it. Copy it to tests/data/<table>.test.ts and use your
// migrations folder and your queries. Not run as it is (the .example name keeps it out of the suite).
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

// --- stands in for your migrations folder (run in order, as production runs them) and your query file ---
const MIGRATIONS = [
  'CREATE TABLE rides (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, km INTEGER NOT NULL CHECK (km > 0), day TEXT NOT NULL)',
  'CREATE INDEX rides_owner ON rides (owner_id, day)',
];
const ridesOf = (db: DatabaseSync, ownerId: string, limit = 50) =>
  db.prepare('SELECT id, km FROM rides WHERE owner_id = ? ORDER BY day DESC LIMIT ?').all(ownerId, limit);
// --- end of the stand-in ---

describe('rides', () => {
  let db: DatabaseSync;
  before(() => {
    db = new DatabaseSync(':memory:');
    for (const m of MIGRATIONS) db.exec(m);
  });
  after(() => db.close());
  // each test alone: everything it writes is gone after it
  beforeEach(() => db.exec('BEGIN'));
  afterEach(() => db.exec('ROLLBACK'));

  const add = (id: string, ownerId: string, km: number, day = '2026-05-03') =>
    db.prepare('INSERT INTO rides (id, owner_id, km, day) VALUES (?, ?, ?, ?)').run(id, ownerId, km, day);

  it('refuses a ride of zero kilometres (the constraint holds the rule, not only the form)', () => {
    assert.throws(() => add('r1', 'u1', 0), /CHECK constraint failed/);
  });
  it('shows a person only their own rides, newest first', () => {
    add('a', 'u1', 20, '2026-05-01');
    add('b', 'u1', 35, '2026-05-02');
    add('c', 'u2', 50, '2026-05-03');
    assert.deepEqual(
      ridesOf(db, 'u1').map((r) => r.id),
      ['b', 'a'],
    );
  });
  it('never returns more than the limit, however many there are', () => {
    for (let i = 0; i < 60; i++) add(`r${i}`, 'u1', 10);
    assert.equal(ridesOf(db, 'u1').length, 50);
  });
  it('starts each test with nothing left from the one before', () => {
    assert.equal(ridesOf(db, 'u1').length, 0);
  });
});
