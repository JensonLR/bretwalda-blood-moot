# The database, and how to point the game at a new one

The game runs **without** a database — `src/db/index.ts` returns `null` rather
than throwing, and the client falls back to device-local gold. So a wrong or
missing `DATABASE_URL` degrades the game; it does not break it.

## Standing one up

1. Create an empty Postgres database (Neon, Supabase, a container — anything).
2. Paste `db/schema.sql` into its SQL editor and run it. Seven tables,
   nine indexes, no extensions, no seed data.

   Three of them are the war (`seasons`, `territories`, `war_ledger`,
   `war_flips` — four, with `players` carrying the oath). `src/db/index.ts`
   also brings every one of them up in place on the first request after a boot,
   so an existing database does not need this file re-run; it is here for a
   database being stood up from nothing.

   **`war_ledger_match_player_idx` is not optional.** It is the unique index the
   attribution write's idempotency rests on: without it, a retried or
   double-delivered match banks its points twice, and two server instances bank
   every match twice. `tools/warflow.mjs` asserts Postgres itself refuses the
   duplicate.
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

The war has its own pair, and the split between them is the point:

```
npm run wartest              # the RULES: 79 checks, no database, four seconds
npm run wartest -- --prove   # the same file with the defects INJECTED: every
                             # neutrality gate must go RED, or it is blind
WAR_TEST_DB=... npm run warflow   # the WIRING: 22 checks, end to end
```

`wartest` would pass in full on a build where `src/db/war.ts` wrote nothing at
all — it holds the arithmetic, not the plumbing. `warflow` boots the game,
swears profiles to different peoples, fights real matches over a real socket
and then asks Postgres what it believes. It **drops and recreates the war
tables on every run**, so point it at a scratch database and never at anything
you want to keep.

## A note on connection strings

They are credentials. They belong in the deployment's environment and in
nothing else — not in this repo, not in `drizzle.config.json` (whose URL is a
local placeholder), and not in a chat log. If one is ever pasted somewhere it
should not be, rotate it at the provider rather than hoping.
