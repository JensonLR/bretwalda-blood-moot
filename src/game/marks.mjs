// PROFILE MARKS — backlog 5.5: "unlockable profile symbols earned by
// achievement", built to the design system's own glyph law (§3): marks on a
// 24 px grid in one flat colour, and every device either SOURCEABLE TO A REAL
// FIND or labelled an invention — the standard docs/FACTIONS.md §6 sets for
// flags. The `source` line on each row is that label, kept beside the path so
// the claim and the drawing cannot drift.
//
// A mark is a PROFILE thing, not kit: it rides `appearance.mark` (the wire
// already carries appearance opaquely on every snapshot, so every player sees
// every player's mark with no new transport), the builder never reads it, and
// it draws beside a man's name — the lobby, the results table, the landing.
//
// UNLOCKS ARE FACTS, NOT PURCHASES. Each rule reads what the profile already
// records — level, wins, matches, the oath — so there is no economy surface,
// no server column and nothing to refund. `earnedMark` narrows anything
// unknown or unearned to "none" exactly the way `peopleOf` narrows a hostile
// people: an old profile and a modified client both draw no mark rather than
// a wrong one.

/** What a rule may read. All of it is on the profile today. */
export const MARK_FACTS = Object.freeze(["level", "wins", "matches", "sworn"]);

/**
 * The marks. `d` is one SVG path on a 24 x 24 grid, stroke-drawn in
 * currentColor by the renderer (fill "none"), so a mark inherits whatever ink
 * its surface uses — the design system's "one flat colour".
 */
export const MARKS = Object.freeze([
  {
    id: "none", name: "No mark", how: "free", need: 0,
    source: "The unmarked shield: most men most of the time, and a deliberate look.",
    d: "",
  },
  {
    id: "boss", name: "Shield Boss", how: "free", need: 0,
    source: "The iron boss at a board's heart — every grave with a shield has one.",
    d: "M12 4 A8 8 0 1 1 11.99 4 M12 9 A3 3 0 1 1 11.99 9",
  },
  {
    id: "seax", name: "The Seax", how: "free", need: 0,
    source: "The single-edged knife that names the Saxons; finds from every county.",
    d: "M3 11.2 L6.5 10.7 L6.5 14 L3 13.6 Z M6.5 10.7 L14.5 10.1 L20.8 13 L6.5 14 Z",
  },
  {
    id: "valknut", name: "Valknut", how: "level", need: 5,
    source: "Three bound triangles, cut on the Stora Hammars I stone, Gotland.",
    d: "M12 3 L8 10 L16 10 Z M7.8 9 L3.8 16 L11.8 16 Z M16.2 9 L12.2 16 L20.2 16 Z",
  },
  {
    id: "sunwheel", name: "Sun-Wheel", how: "level", need: 10,
    source: "The wheel cross, on bracteates and picture stones across the North.",
    d: "M12 4 A8 8 0 1 1 11.99 4 M12 4 L12 20 M4 12 L20 12 M6.3 6.3 L17.7 17.7 M17.7 6.3 L6.3 17.7",
  },
  {
    id: "hammer", name: "The Hammer", how: "wins", need: 5,
    source: "A Mjölnir amulet of the kind dug out of York in exactly this decade.",
    d: "M10.6 4.5 L13.4 4.5 L13.4 11.5 L10.6 11.5 Z M4.5 11.5 L19.5 11.5 L19 17 L5 17 Z",
  },
  {
    id: "vrod", name: "Crescent and V-Rod", how: "sworn", need: 1,
    source: "The Pictish crescent-and-V-rod, cut on symbol stones north of the Forth.",
    d: "M4 11.5 A8.2 8.2 0 0 1 20 11.5 A13 13 0 0 0 4 11.5 Z M7 5.5 L12 18.8 L17 5.5",
  },
  {
    id: "triquetra", name: "Triquetra", how: "matches", need: 20,
    source: "The three-cornered knot, in the Book of Kells and on Anglian metalwork.",
    d: "M12 13 A5.7 5.7 0 0 1 12 5 A5.7 5.7 0 0 1 12 13 M12 13 A5.7 5.7 0 0 1 5.1 17 A5.7 5.7 0 0 1 12 13 M12 13 A5.7 5.7 0 0 1 18.9 17 A5.7 5.7 0 0 1 12 13",
  },
  {
    id: "wyrmknot", name: "The Wyrm", how: "level", need: 15,
    source: "A coiled serpent in the Urnes manner. An invention, and labelled one.",
    d: "M5 18 C4 13 8 10 12 11.5 C15 12.6 15.5 16 12.5 16.5 C10.5 16.8 10 14.5 11.5 14 M5 18 C8 20.5 14 20 16.5 16 C18.5 12.5 17.5 8 14.5 6 M14.5 6 L17.5 5.2 M14.5 6 L16 8.6",
  },
  {
    id: "ravenbanner", name: "The Raven Banner", how: "wins", need: 25,
    source: "The hrafnsmerki taken from the host at Cynwit — the Chronicle, year 878.",
    d: "M6 3.5 L6 20.5 M6 5 L18.6 6.8 A10.4 10.4 0 0 1 6 15.5 Z M18 9.5 L19.8 10.6 M16.6 12.4 L18.1 13.9 M14.2 14.6 L15.2 16.4",
  },
]);

/** The mark by id, or the unmarked default for anything unknown. */
export function markOf(id) {
  return MARKS.find((m) => m.id === id) ?? MARKS[0];
}

/**
 * Is this mark earned by these facts? `facts` is {level, wins, matches,
 * sworn} — anything missing counts as zero, so a caller with a partial
 * profile under-claims rather than over-claims.
 */
export function markEarned(mark, facts = {}) {
  const f = {
    level: Number(facts.level) || 0,
    wins: Number(facts.wins) || 0,
    matches: Number(facts.matches) || 0,
    sworn: facts.sworn ? 1 : 0,
  };
  switch (mark.how) {
    case "free": return true;
    case "level": return f.level >= mark.need;
    case "wins": return f.wins >= mark.need;
    case "matches": return f.matches >= mark.need;
    case "sworn": return f.sworn >= mark.need;
    default: return false;
  }
}

/**
 * The mark a man may actually wear: his chosen one if he has earned it,
 * "none" otherwise. This is the OWN-PROFILE narrowing: it runs where the
 * facts live — this client's profile — at pick time and at render of the
 * player's own surfaces, so a hand-edited localStorage cannot show its
 * owner a device he has not earned. What OTHER clients display for this man
 * is whatever id rode his appearance, unverified: the same trust model as
 * `appearance.people`, and acceptable for the same reason — a mark is
 * cosmetic, client-declared and worth nothing.
 */
export function earnedMark(id, facts) {
  const m = markOf(id);
  return markEarned(m, facts) ? m : MARKS[0];
}

/** What a mark's unlock line says to a player who has not earned it yet. */
export function markHint(mark) {
  switch (mark.how) {
    case "free": return "Yours already.";
    case "level": return `Reach level ${mark.need}.`;
    case "wins": return `Win ${mark.need} match${mark.need === 1 ? "" : "es"}.`;
    case "matches": return `Fight ${mark.need} match${mark.need === 1 ? "" : "es"}.`;
    case "sworn": return "Swear to a kingdom.";
    default: return "";
  }
}
