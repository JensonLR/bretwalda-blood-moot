# The campaign

The owner's standing instruction, in his words: *"leave no stone unturned"* —
maps, mobile controls, profiles, flags, new features, and a bar of *"utterly
beautiful, perfect & play just as good as it looks."* He asked me to take
leadership on the decisions rather than bring him options.

So this file is decisions, not options. Where I have chosen, I say why, and I
say what would change my mind.

---

## Order of work, and why this order

Each wave unblocks the next. This is not arbitrary sequencing.

1. **Fire and the helm** *(in flight)* — finishing what is started.
2. **Cosmetics audit** — `docs/COSMETICS-AUDIT.md`. Depends on the capture
   harness rebuild in wave 1: 37 of 47 purchasable options have never been
   rendered, and the one comparison that existed was not comparable.
3. **Profiles** — `docs/PROFILES-AND-FLAGS.md`. **This gates the cosmetics
   audit's whole point.** Gold currently lives in localStorage, so the economy
   is editable in devtools in ten seconds. Auditing what players buy is moot
   until buying means something.
4. **Mobile controls** — `docs/MOBILE-CONTROLS.md`. Independent of the above,
   and the single biggest thing standing between this game and the phones it is
   pitched at.
5. **Maps** — `docs/MAPS.md`. The largest single body of work; needs the
   capture harness (wave 1) to be reviewable at all.
6. **Flags** — after profiles, because a flag is a profile-scoped cosmetic.
7. **New features** — through the gate below, not before.
8. **The long critique** — beautiful *and* fun, judged separately.

## The pass system for new features

The owner asked that new ideas be *"check[ed] over with a form of pass
system"* rather than built on enthusiasm. This is that gate. A feature is
written up before it is built and must clear **all five**:

1. **Does it serve the 30-second drop-in?** The whole product is a link in a
   group chat. Anything that adds a step before the first fight fails here,
   however good it is.
2. **Does it work on a phone, one-thumbed?** Most players are on a phone. A
   feature that needs a keyboard or a steady second thumb is a desktop feature,
   and desktop is the minority case.
3. **Zero new binary assets?** Non-negotiable. It is what makes the link
   instant.
4. **Does it make the game more fun, or only bigger?** The honest question.
   Surface area is not value. A feature that adds a screen but not a decision
   fails.
5. **Can it be judged?** If there is no frame, no measurement and no playtest
   that could show it is working, it cannot be held to the bar and will rot.

A feature that fails any one is written down as rejected **with the reason**,
so it is not re-proposed in three weeks. Rejections live in
`docs/FEATURES-REJECTED.md`.

## The bar, and who holds it

`docs/VISUAL-BAR.md` — 8+ on every axis, and *better than before is not a
pass*. Three things learned the hard way this project:

- **A reviewer who reads code instead of looking at frames will pass bad work.**
  This has now happened twice. Critics must regenerate captures themselves and
  check the timestamp against the last commit that touched the file.
- **Evidence that cannot support the question is worse than no evidence.** The
  ten-helmet lineup had every panel lit differently and produced a confident
  wrong verdict. Fix the instrument before trusting the reading.
- **"Plays as good as it looks" is a separate axis and needs a separate judge.**
  Everything above measures pixels. Nothing in the rubric asks whether a fight
  is *fun*. Wave 8 adds that, and it is not the same agent.

## Decisions already taken, so they are not relitigated

- **Rounds**: best of 1/3/5, default 3, first to `ceil(N/2)`. Gold pays once at
  match end. *(Shipped.)*
- **Sutton Hoo at 2400 gold** — 18–25 winning matches. Owner-confirmed.
  The `ARMOURY` comment still reasons from a disproved 200–260/match figure and
  needs correcting; the price does not.
- **Custom flags are constrained, not free-drawn.** See
  `docs/PROFILES-AND-FLAGS.md` for the reasoning — it is a moderation decision
  as much as an art one.
- **Profiles are anonymous and server-authoritative**, with a recovery code.
  No email, no password, no signup step. See the same doc.

## Constraints that apply to every wave

- Zero new binary assets. Everything procedural.
- `tsc --noEmit` clean; lint no worse than its 12-problem baseline.
- `npm run playtest` 9/9 and staying there.
- The server stays authoritative. This now matters more than it did: with a
  real economy, a client that can grant itself gold is a cheat, not a bug.
- 4 cores cap workflow concurrency at 2. Plan waves around it rather than
  pretending otherwise.
- No `git stash`. Owners commit their own work.
