# Money, in the right order

The owner asked how this game makes money. The honest answer starts one step
back: **retention is the monetisation problem; payments are the easy half.**
Stripe integration is a solved afternoon. A player who is still here in week
three is not. Nobody has ever monetised a game people play once, and every
decision below is ordered by that fact.

---

## Step 0 is paid hosting, and it is urgent

Before any revenue feature: **Render's free Postgres expires at 90 days** and
takes every profile with it — every recovery code, every helmet, every gold
balance. The profile system was built so a player's identity survives a cracked
phone (`src/db/recoveryWords.ts` exists so a code can be read aloud in a group
chat); it should not die of a hosting tier. A game that deletes its players'
stuff on a schedule has no retention to monetise and no trust to sell into.

Move the database before its birthday. The where is argued in
`docs/HOSTING.md` (Neon now, regardless of every other decision); the point
here is only the ordering: this comes before the first pound of revenue work,
because everything below deposits value into that database.

## PWA, not app stores

The distribution advantage of this game is that it has no install step. The app
stores would charge 30%, impose a review queue on every update, and give back
nothing this product needs — discovery there is pay-to-play and the game's real
discovery is a group chat.

A PWA keeps the advantage and adds the home-screen icon: **installable from the
link itself**, no review queue, no cut, updates ship on deploy. The game is
close already — it is a single-page app with procedural assets and a service
worker away from installing.

One rule about the prompt: **the install prompt is earned, not begged.** Never
at first load — the first load's only job is to get a stranger into a fight.
After a match, ideally after a won match, the ask is natural: you clearly like
this; put it on your phone. That is also the PWA's retention function — an icon
on the home screen is a reason to come back that does not depend on someone
re-dropping the link.

## Identity stays anonymous; the email is asked for once

There is no email, no password, no account anywhere in this game — the schema
says so in its own comment (`src/db/schema.ts:7`: the row is deliberately
worthless to steal) and the client says it again (`src/app/page.tsx`). That is
a feature. Every signup field costs players at the door, and the door is the
entire pitch.

Ask for an email exactly once, at purchase: **"where should we send your
receipt?"** It is the only moment the question is natural — the player is
already typing payment details, a receipt is a service rather than a capture,
and the law wants one sent anyway. The email attaches to the profile as
recovery and as the one channel for "your purchase is safe" — not as a
marketing list. Never at first load, never gating play, never a second time.

## What is never for sale

**Power.** Never. The link-in-a-group-chat pitch means the newcomer must be
killable by skill only — this is the same rule that rejected XP-bought power in
`docs/FEATURES.md`, and money makes it worse, not better. The moment a
purchase hits harder, the game is a scam with swords.

**Gold.** Also no, and this one needs the argument stated because every
free-to-play playbook says otherwise. The Sutton Hoo helm costs 2400 gold
(`src/game/client/characters.ts:179`) and the pricing comment beside it says
why: it is deliberately off the curve — ten matches of earnings — because it is
the game's crown. Its worth on another man's head is the knowledge that **it
was earned**. Sell gold and a bought Sutton Hoo debases every earned one; the
whole cosmetic ladder deflates at once, and with it the reason to play ten
matches. Money buys things priced in money; gold buys things priced in play;
the two currencies never convert.

What is sold, then: cosmetics priced in money that do not exist on the gold
ladder — founder's marks, dyes, emotes, trim. Distinct, visible, and never a
shortcut through the earned tier.

## The sequence

Each step funds and justifies the next. Do them in order.

1. **Paid hosting.** Stop the 90-day clock. Cost: pounds per month. Prerequisite
   for literally everything below.
2. **PWA.** Manifest, service worker, earned install prompt. The retention
   floor.
3. **Retention features.** Rematch, rating, Hearths — the FEATURES.md build
   list. This is the longest step and the one that decides whether the rest
   matters.
4. **Email at purchase.** The receipt question, wired but dormant until step 5
   gives it a reason to fire.
5. **Stripe founder's pack.** One product, one price, one purchase flow — the
   smallest possible test of whether anyone pays. A founder's mark that says "I
   was here before you", which is the one cosmetic that gets more valuable as
   the game grows.
6. **Cosmetic shop.** The money-priced tier, once the founder's pack proves the
   pipe.
7. **Seasons.** Rotating earnable cosmetics with an end date. Only when there
   are enough players that a season is an event rather than a changelog.

The failure mode this sequence exists to prevent: building steps 5-7 first,
against a database that expires, for players who play once. Payments are the
easy half. Do the hard half first.
