# The database, and how to point the game at a new one

The game runs **without** a database — `src/db/index.ts` returns `null` rather
than throwing, and the client falls back to device-local gold. So a wrong or
missing `DATABASE_URL` degrades the game; it does not break it.

## Standing one up

1. Create an empty Postgres database (Neon, Supabase, a container — anything).
2. Paste `db/schema.sql` into its SQL editor and run it. Three tables,
   four indexes, no extensions, no seed data.
3. Set `DATABASE_URL` in the deployment's environment to the connection string.
   Nothing else changes — no code, no build flag.

`db/schema.sql` is generated from `src/db/schema.ts`, which is the source of
truth. Regenerate it after a schema change with:

```
npx drizzle-kit generate --dialect=postgresql --schema=./src/db/schema.ts --out=/tmp/g
cp /tmp/g/0000_*.sql db/schema.sql
```

## Proving a database works before trusting it

Both suites take a connection string and drive the real routes:

```
DATABASE_URL=... PROFILE_TEST_DB=... npm run profiletest   # 68/68 with a DB, 22/22 without
DATABASE_URL=... npm run cheattest                          # needs a FRESH database
```

`cheattest` is **not idempotent** — it asserts on once-per-save migration paths,
so it fails against a database it has already run on. Drop and recreate first.

## A note on connection strings

They are credentials. They belong in the deployment's environment and in
nothing else — not in this repo, not in `drizzle.config.json` (whose URL is a
local placeholder), and not in a chat log. If one is ever pasted somewhere it
should not be, rotate it at the provider rather than hoping.
