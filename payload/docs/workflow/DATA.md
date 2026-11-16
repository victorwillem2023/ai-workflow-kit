# Data: how it is shaped, changed and asked for

The rules for everything the app stores. Which database is `/launch`'s decision (`docs/run/LAUNCH.md`, *The database*) and
restoring it is `docs/run/RECOVERY.md`'s; this page is about the daily work: the tables, the migrations and the queries. `/spec`
reads it when a card stores or changes data, `/review` when a diff does. Read by the section.

## Where data code lives
- **The core knows the shapes and the rules, never the database.** An order and how its total is worked out are core; that
  orders are rows in a table is not.
- **One folder owns the queries**, one file per kind of thing (orders, users). Nothing else writes SQL or calls the database
  library. The rest of the app asks that file: "the open orders of this customer".
- Each function there takes what it needs and returns the core's shapes, never a raw row. It takes the **tenant or user it
  acts for** as an argument, so a query that forgets it cannot be written (`docs/workflow/PERMISSIONS.md`).
- The same rule goes in `boundaries` in `workflow.config.json`, so the gate fails an import of the database library from
  anywhere else.

## Shaping the tables
| Rule | Why |
|---|---|
| Every table has a primary key that means nothing (a generated id), `created_at` and `updated_at` in UTC | a key with meaning changes one day; times are needed the day something goes wrong |
| **The database enforces what must always be true**: `NOT NULL`, `UNIQUE`, foreign keys, `CHECK` | code has bugs and a second writer comes one day; a constraint has neither |
| "Only one" is a `UNIQUE` constraint, never "look first, then insert" | two requests at once both find nothing |
| Money in the smallest unit as a whole number, with its currency beside it; never a floating-point number | cents that add up |
| A fixed set of values (a status) is text with a `CHECK`, or a small table | readable in every tool, and a wrong value is refused |
| What is searched, sorted or joined on is a column of its own, never a field inside JSON | it can be indexed and constrained |
| Every row that belongs to a customer or a user carries that id, with a foreign key | "only your own" becomes one condition on every query |
| A row is deleted for real unless there is a named reason to keep it (an invoice the law wants kept) | "deleted" rows that still exist leak, and every query must remember to skip them |
| One fact in one place; a copied value (a total kept on the order) names the rule that keeps it right | two copies disagree one day |

## Migrations
A migration is a file that changes the database from one version to the next. It is code that runs once, on real data, and
cannot be tried again.
- **Every change to the schema is a migration file in git**, numbered in order, made with the stack's migration tool
  (named in `docs/STACK.md`). Never a change typed into a database console.
- **A migration that has run anywhere is never edited.** A mistake is a new migration.
- **One change per migration**, small enough to read. Schema changes and large data changes are separate files.
- **It works while the old version of the app still runs** (expand, then contract): add the new column, write to both, move
  the data, read the new one, and only in a later release take the old one away. A rename is an add and a remove, never
  one step. The steps and the drill: `docs/run/RECOVERY.md` (*Database changes without downtime*).
- **Anything that destroys data** (dropping a table or column, deleting rows, changing a type so values are lost) is named in
  the spec in plain words, is the owner's yes, and runs only after a backup that was proven to restore.
- **On a big table**, a change that locks it is done the engine's safe way (in Postgres: an index made `CONCURRENTLY`, a
  constraint added `NOT VALID` and validated afterwards) and tried first on a copy with real sizes.
- **Tested**: the suite builds its database from the migrations (`docs/workflow/TESTING.md`); a migration that moves data has
  a test with rows before and after.
- **An agent never runs a migration against staging or production.** It writes and tests it; the deploy runs it.

## Queries
- **Values are always passed as parameters**, never joined into the SQL text, also when they "cannot" come from a user.
  A table or column name that varies comes from a fixed list in the code.
- **Name the columns**; never "all columns". A new column with something private in it then never reaches an old screen.
- **Every list has a limit** and is paged by a cursor (`docs/workflow/API.md`). A query whose size grows with the data, with no
  limit, is a bug that waits.
- **One query, not one per row.** Fetching a list and then asking the database again for each item (the "N+1" problem) is
  the commonest reason a page gets slow. Join, or fetch the second set in one query by its ids.
- **An index for every foreign key** and for the columns a common filter or sort uses. Postgres makes none for a foreign key
  by itself. Look at the engine's query plan (`EXPLAIN`) for a query on a path many people use, with real sizes.
- Work the database is good at stays there (filtering, adding up, sorting); rules stay in the core.

## Changing several things at once
- **One user action, one transaction**: either all of its rows change or none.
- **Nothing outside the database happens inside a transaction**: no email, no call to a payment provider. It may be slow, and
  it cannot be undone when the transaction rolls back.
- "Change it and tell someone" (save the order, send the mail): write the message to a table in the same transaction, and
  let a job send it. Then neither can happen without the other.
- **A write that may be sent twice** (a retry, a double click) carries a key, and the same key gives the same result.
- Two people changing the same row: a version number on the row, checked on write; the second one is told, never silently
  overwritten.

## Personal data
- Keep only what a feature needs, and write each kind in `docs/company/PRIVACY.md` in the same commit.
- A person's data can be exported and deleted: when a table gains personal data, the export and the delete gain it too.
- **Development and tests use made-up data**, made by a seed script in the repository. A copy of production is never pulled
  to a laptop or a test server.
- Passwords, tokens and keys are never stored as they are (`docs/workflow/PERMISSIONS.md`); personal fields never go into logs.

## What the gate checks
- **A migration that was there before a change and is edited, renamed or deleted fails** (`data.migrations` in
  `workflow.config.json` says where they are).
- **SQL text built from a value** gets an `advice:` line. A name from a fixed list in the code (a column to sort by) says
  "fixed list" in a comment on that line.
- **Only the data folder uses the database library**: the `boundaries` rule `/setup` writes.
- Not checked: the shape of the tables, the indexes, whether a migration is safe on a big table. That is the spec and `/review`.

## In a spec
A card that stores or changes data says, under *Files that change* and *Tests*: the tables and columns, the migration and
whether it destroys anything, the constraint that holds each new rule, the queries with their index, and who may read and
write the rows.
