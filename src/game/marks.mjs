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
export const MARK_FACTS = Object.freeze(["level", "wins", "matches", "sworn", "crowned"]);

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
  // ---- THE EVERYDAY THINGS A MAN OWNS — free, because he owns them ----
  {
    id: "comb", name: "Bone Comb", how: "free", need: 0,
    source: "The commonest small find of the age: antler combs out of every grave and every town layer.",
    d: "M4.5 8.5 L19.5 8.5 L19.5 12 L4.5 12 Z M6 12 L6 18 M8.4 12 L8.4 18.5 M10.8 12 L10.8 18.5 M13.2 12 L13.2 18.5 M15.6 12 L15.6 18.5 M18 12 L18 18",
  },
  {
    id: "spear", name: "The Spear", how: "free", need: 0,
    source: "The spear is the commonest weapon in an Anglo-Saxon grave — far commoner than the sword.",
    d: "M12 2.5 L14.6 8 C13.8 9.4 10.2 9.4 9.4 8 Z M12 8.6 L12 21.5 M9.6 11.4 L14.4 11.4",
  },
  // ---- THE LADDER: things earned ----
  {
    // NOT THORN, and the contact sheet is why: a stave with a triangle on it
    // is the Raven Banner's silhouette, and at 24 px the two read as one
    // device. Ing is a lozenge — the only one in the set — so it cannot be
    // mistaken for anything here, and its source is the better one.
    id: "ing", name: "The Ing Rune", how: "level", need: 3,
    source: "Ing, the lozenge stave of the futhorc, named in the Old English Rune Poem and cut on English metalwork.",
    d: "M12 4.2 L19 12 L12 19.8 L5 12 Z M12 8.4 L15.8 12 L12 15.6 L8.2 12 Z",
  },
  {
    id: "triskele", name: "Triskele", how: "matches", need: 10,
    source: "The three-legged spiral on British hanging-bowl metalwork, the escutcheons of the west.",
    d: "M12 12 C12 8 15.5 6.4 17.4 8.6 C18.9 10.3 17.2 12.6 14.6 12 M12 12 C8.6 13.9 8.6 17.8 11.4 18.6 C13.6 19.2 15 16.9 13.6 14.6 M12 12 C9.6 9.2 6.2 10.4 5.9 13.2 C5.7 15.5 8.4 16.4 10 14.4",
  },
  {
    id: "ringchain", name: "Ring-Chain", how: "level", need: 8,
    source: "The Borre ring-chain, the Danelaw's own ornament, on strap-ends and brooches out of York.",
    d: "M6 12 A3 3 0 1 1 5.99 12 M18 12 A3 3 0 1 1 17.99 12 M12 8 A3 3 0 1 1 11.99 8 M12 16 A3 3 0 1 1 11.99 16",
  },
  {
    id: "boar", name: "The Boar Crest", how: "wins", need: 10,
    source: "The boar standing on the Benty Grange helmet, Derbyshire — a helmet crest that is a real find.",
    d: "M3.5 15.5 C4.5 11.5 8 10 12 10 C16 10 19 11.5 20.5 14 L19 15.5 L20 17.5 L17.5 17 M6 12.2 L7 9.6 M9 11 L10 8.6 M4.6 16.6 L5.2 19.5 M9 17 L9.4 19.5 M15 16.6 L15.6 19.5 M18.4 16.2 L19 19",
  },
  {
    id: "helm", name: "The Helm", how: "wins", need: 15,
    source: "The Coppergate helmet, dug out of York: iron bowl, brass brow band, hanging mail.",
    d: "M5 15 C5 8.4 8.4 5 12 5 C15.6 5 19 8.4 19 15 M5 15 L19 15 M12 5 L12 15 M11 15 L11 20 L13 20 L13 15 M6.4 15 L6.4 19.5 M17.6 15 L17.6 19.5",
  },
  {
    id: "horn", name: "The Drinking Horn", how: "level", need: 12,
    source: "The aurochs-horn vessels from the Sutton Hoo grave, mounted in gilt bronze at rim and tip.",
    d: "M4.5 6.5 C10.5 6 16.5 8.5 19.5 15.5 C20 17 18.6 18.4 17.4 17.6 C12 14 8 10.4 4.5 9.6 Z M4.5 6.5 L4.5 9.6 M17.2 16 L19 15.2",
  },
  {
    id: "stag", name: "The Stag", how: "level", need: 20,
    source: "The bronze stag standing on the Sutton Hoo whetstone sceptre, Mound 1.",
    d: "M7.4 19.6 C7.4 15 8.2 12.6 11 11.9 C13.6 11.2 16 12 17.2 14 C18 15.4 17.8 17.8 17.4 19.6 M11 11.9 L9.4 9.6 L8.6 6.4 M8.6 6.4 L6.4 4.8 M8.6 7.8 L6.2 7.4 M10.6 7.2 L10.4 4.9 M10.2 19.6 L10.4 16 M14.8 19.6 L14.6 16.2",
  },
  {
    id: "keys", name: "The Keys", how: "matches", need: 50,
    source: "The keys at a Norse woman's belt, a grave-good that says who kept the hall's stores.",
    d: "M9 5.5 A2.6 2.6 0 1 1 8.99 5.5 M9 8.1 L9 19 M9 14.5 L12.4 14.5 M9 17.5 L11.8 17.5 M16 7.5 A2.2 2.2 0 1 1 15.99 7.5 M16 9.7 L16 19 M16 15 L18.6 15",
  },
  {
    id: "beast", name: "The Pictish Beast", how: "matches", need: 30,
    source: "The beast of the symbol stones, north of the Forth — the commonest device after the crescent.",
    d: "M4 15.5 C5.5 11 9 9.5 12.5 10.5 C15 11.2 15.6 13.6 14 14.6 C12.8 15.4 11.4 14.4 12 13.2 M12.5 10.5 C15.5 8 19 9 20 12 C20.8 14.4 19.4 17 17 17.4 M4 15.5 C4.6 18 6.6 19.4 8.6 19 M17 17.4 L18.4 19.6 M6.6 8.6 L8.4 10.6",
  },
  {
    id: "doubledisc", name: "Double Disc and Z-Rod", how: "sworn", need: 1,
    source: "The double disc crossed by a Z-rod, cut on Pictish symbol stones beside the crescent.",
    d: "M7 12 A3.4 3.4 0 1 1 6.99 12 M17 12 A3.4 3.4 0 1 1 16.99 12 M10.4 12 L13.6 12 M4 8.4 L11.5 8.4 L12.5 15.6 L20 15.6 M4 8.4 L6 6.4 M20 15.6 L18 17.6",
  },
  {
    id: "longship", name: "The Longship", how: "wins", need: 40,
    source: "The ships cut on the Gotland picture stones, sail set and shield-rail manned.",
    d: "M3 15.5 C6.5 18.6 17.5 18.6 21 15.5 M3 15.5 C4.6 15.5 5 14 4.6 12.6 M21 15.5 C19.4 15.5 19 14 19.4 12.6 M4.6 12.6 L19.4 12.6 M12 12.6 L12 3.5 M7.6 5.5 L16.4 5.5 L16.4 10 L7.6 10 Z",
  },
  {
    // THE ONE MARK NO NUMBER UNLOCKS. `crowned` is stamped by `settleSeason`
    // in exactly one place in the repository, which is what "cannot be
    // bought and cannot be lost" means in code — see players.bretwaldaSeasons.
    id: "crown", name: "The Crown", how: "crowned", need: 1,
    source: "No crown of the period survives; a plain three-point circlet, ours, and labelled so.",
    d: "M4.5 16.5 L5.2 9.2 L8.6 12.4 L12 5.2 L15.4 12.4 L18.8 9.2 L19.5 16.5 Z M6.5 19 L17.5 19",
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
    crowned: facts.crowned ? 1 : 0,
  };
  switch (mark.how) {
    case "free": return true;
    case "level": return f.level >= mark.need;
    case "wins": return f.wins >= mark.need;
    case "matches": return f.matches >= mark.need;
    case "sworn": return f.sworn >= mark.need;
    case "crowned": return f.crowned >= mark.need;
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
    case "crowned": return "Be crowned Bretwalda of Britain.";
    default: return "";
  }
}
