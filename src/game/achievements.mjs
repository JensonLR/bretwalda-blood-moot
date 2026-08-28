// STEAM ACHIEVEMENTS ↔ PROFILE MARKS — the Steam-prep wave's schema half.
//
// The law is `spectate.mjs`'s: ONE RULE, TWO READERS. An achievement here is
// not a second list of unlocks that could drift from the marks — it is the
// MARKS table read again, through `markEarned`, the same rule the picker and
// the profile surfaces already run. A mark that unlocks at level 5 IS the
// achievement that unlocks at level 5; change the mark's `need` and both
// readers move together, because there is only one number.
//
// WHY THIS EXISTS BEFORE THE APP ID DOES. docs/PLATFORM-PATH.md §8.3 keeps
// the Steam auth door deliberately unstubbed — a door that cannot check
// tickets must not open — but an achievement SCHEMA is not a door: it is
// inert data both sides need agreed before the store page can be filled in.
// `tools/steamsheet.mjs` prints this table in the shape Steamworks' admin
// wants it pasted; the wrapper's future `ISteamUserStats.SetAchievement`
// calls read the same `apiNameOf` ids. Nothing here talks to Steam.
//
// WHAT IS DELIBERATELY ABSENT: no extra achievements beyond the marks
// ("first blood", "play a tournament"). The marks ARE the achievement system
// this game already has — earned by facts the profile records, drawn beside
// the name, each sourced or labelled per docs/FACTIONS.md §9 — and a Steam
// list that outgrows the in-game one splits progression into two truths.
// New achievements are new MARKS first, here for free after.

import { MARKS, markEarned, markHint } from "./marks.mjs";

/** The Steamworks API name for a mark: MARK_VALKNUT, MARK_RAVENBANNER. */
export function apiNameOf(mark) {
  return `MARK_${String(mark.id).toUpperCase()}`;
}

/**
 * The achievement rows: every EARNED mark — the free rungs stay off Steam
 * (an achievement granted at first launch is noise, and the unmarked shield
 * is "most men most of the time", not an accomplishment).
 */
export function achievements() {
  return MARKS.filter((m) => m.how !== "free").map((m) => ({
    apiName: apiNameOf(m),
    markId: m.id,
    /** Steam display name: the mark's own name — the thing the player sees unlocked in both places. */
    name: m.name,
    /** Steam description: the mark's unlock line, which already says the deed. */
    description: markHint(m),
    /** Hidden until earned? The marks are a visible ladder in-game; Steam mirrors that. */
    hidden: false,
  }));
}

/**
 * Which achievements these profile facts have earned, by API name — the
 * wrapper's sync loop calls this after every match and sets the difference.
 * Same narrowing posture as `earnedMark`: partial facts under-claim.
 */
export function earnedAchievements(facts) {
  return MARKS.filter((m) => m.how !== "free" && markEarned(m, facts)).map((m) => apiNameOf(m));
}
