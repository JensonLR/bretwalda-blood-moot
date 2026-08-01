# The profile API

Anonymous, server-authoritative profiles. No signup, no email, no step before
the first fight. See `docs/PROFILES-AND-FLAGS.md` for why it is shaped this
way; this file is the contract a client is built against.

Implementation lives in `src/db/` — `profiles.ts` (the store), `catalogue.ts`
(the server's view of `ARMOURY`), `matchLedger.ts` (what a match actually
paid), `credentials.ts` and `recoveryWords.ts`.

## The three answers every route can give

```
200  { ok: true,  mode: "server", ... }   normal
200  { ok: true,  mode: "local" }         no database — keep gold on the device
4xx  { ok: false, error: "<code>", message: "<human>" }
```

`mode: "local"` is **not an error**. It is what a deployment with no
`DATABASE_URL`, an expired free tier, or a database that is down answers with,
and it means "run the way the game ran before profiles existed". A client
branches on `mode` once, at boot, and never shows a failure for it.

Everything is `POST` with a JSON body, including the reads: the secret is a
bearer token and a query string is the part of a request that ends up in access
logs and screenshots.

## Routes

| Route | Body | Answers |
|---|---|---|
| `/api/profile/new` | `{ name? }` | `{ id, secret, profile }` |
| `/api/profile/me` | `{ id, secret }` | `{ profile }` |
| `/api/profile/equip` | `{ id, secret, appearance?, name?, favoriteClass? }` | `{ profile }` |
| `/api/profile/purchase` | `{ id, secret, itemIds: string[] }` | `{ profile, spent, bought }` |
| `/api/profile/bind` | `{ id, secret, playerId }` | `{ bound: boolean }` |
| `/api/profile/match` | `{ id, secret, playerId }` | `{ profile, award, granted }` |
| `/api/profile/recover` | `{ recoveryCode }` | `{ id, secret, profile }` |
| `/api/profile/claim` | `{ id, secret, save }` | `{ profile, granted }` |

`playerId` is the **engine** id from the `join` message, not the profile id.

`profile` is always the whole current profile, so a client can replace its
state from any successful response and never has to add up gold itself.

## The order a client calls them in

1. **Boot** — `POST /new` if there is no stored `{ id, secret }`, else
   `POST /me`. If either answers `mode: "local"`, stop here and use
   localStorage exactly as before.
2. **First boot with an old localStorage profile** — `POST /claim` once,
   immediately after `/new`, with the stored `bretwalda_profile` object as
   `save`. Never again; a second call is refused.
   **Never offer a save that carries a `recoveryCode`.** The client keeps
   mirroring the server's totals back into `bretwalda_profile` so a lapsed
   database degrades to the player's real hoard, and that mirror looks exactly
   like an old save. Claiming it feeds the migration its own output: grant
   3000, let the mirror be rewritten, drop the link key, mint again, claim the
   same 3000 — and one fight in between moves the numbers enough that the
   fingerprint index does not catch it. Only the server issues recovery codes,
   so their presence is what tells the two apart. The route refuses such a save
   with `replayed`; the client should not send it in the first place.
3. **On the `join` message** — `POST /bind` with the `playerId` the engine just
   handed out. **This is required.** An unreserved payout is paid to nobody,
   because every other phone in the lobby can read that id off a room snapshot.
4. **On the `match_end` message** — `POST /match` with the same `playerId`.
   Safe to retry: a repeat answers `granted: false` and the same totals.
5. **Armoury APPLY** — `POST /purchase` with the ids of everything staged.
   Owned items cost nothing, so this is also how kit is equipped from the shop.
6. **Anything free** — `POST /equip`.

## What the server will not do

- Take a price, a gold total or a balance from the client. `/purchase` takes
  ids; cost comes from `ARMOURY`.
- Grant gold that no match paid. `/match` pays only what the engine computed
  in `endMatch`, once, to the profile that reserved that warrior.
- Equip kit a profile does not own. The slot silently keeps what it had.
- Believe a migrated save. `/claim` is capped, once per profile, once per
  save, and closes on a fixed date.
