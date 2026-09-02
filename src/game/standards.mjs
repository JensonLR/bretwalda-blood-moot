// ============================================================
// THE STANDARDS — what a Hearth may fly, and what each one is.
//
// `docs/FACTIONS.md` §9 is the sourcing pass and this file is its table. The
// section turns on one distinction, §9.0: no Anglo-Saxon, Norse, British or
// Pictish battle flag survives as an object, so every device shipped is one of
// three things AND SAYS WHICH —
//
//   FIND        a physical object out of the ground, dated; drawn from it
//   TEXT        a written source says a banner existed, without a description;
//               the NAME is period and the drawing is ours
//   INVENTION   no period source at all; labelled in the UI in as many words
//
// "A device in the second tier is not dishonest. Calling it a find would be."
//
// THE HERALDRY LAW (docs/DESIGN-SYSTEM.md): a Hearth inherits its kingdom's
// colour and may not choose its own, because faction colour is how you read
// an enemy at range. So a standard is a DEVICE on the kingdom's own field,
// chosen from the kingdom's own list, and nothing here carries a colour.
//
// PRESETS, NOT FREE-DRAWN. The backlog called that "a moderation decision as
// much as an art one", and it is: a drawn flag is a text field with a brush,
// and §9.2's AVOID list — the grimoire designs and the appropriated period
// symbols — is exactly what a free brush would produce first. Thirteen devices,
// four kingdoms, every one sourced or labelled.
//
// Pure data, no browser global: the engine narrows a declared standard through
// this file and `tools/standardtest.mjs` holds its shape. Paths are 24-grid
// strokes, the same convention as `marks.mjs`, drawn in `currentColor`.
// ============================================================

/** How a device is known to us. */
export const TIERS = Object.freeze({
  find: { label: "FIND", blurb: "a real object, out of the ground, dated" },
  text: { label: "TEXT", blurb: "a period name; the drawing is ours" },
  invention: { label: "INVENTION", blurb: "ours — no period source" },
});

/**
 * The devices, by the kingdom that may fly them. `id`s are unique across all
 * four on purpose, so a standard can be named without its kingdom beside it.
 */
export const STANDARDS = Object.freeze({
  saxon: Object.freeze([
    {
      id: "cross_lozenge", name: "The Cross and Lozenge", tier: "find",
      source: "Alfred's own coinage, c. 880 — the Cross-and-Lozenge penny, struck in the decade the game is set in. A state's chosen image.",
      d: "M12 3 V21 M3 12 H21 M12 7 L17 12 L12 17 L7 12 Z",
    },
    {
      id: "seax", name: "The Seax", tier: "find",
      source: "The single-edged blade that names the people, abundant in graves across the period.",
      d: "M3 12.5 H7.5 M7.5 10.8 L15 10.4 L21 13.4 L15 14.8 L7.5 14.6 Z",
    },
    {
      id: "wyvern", name: "The Wyvern", tier: "text",
      source: "The dragon standard near Harold on the Bayeux Tapestry — a wyvern's head on a pole with the body streaming from it — is real evidence, of c. 1070, two centuries after 878. A late-Saxon dragon, drawn after the Tapestry's, and not Alfred's.",
      d: "M4 3 V21 M4 7 C6 4 10 4 12 6.5 L15 5.5 L12.5 9 C10.5 10.5 7 10 4 9 M12 6.5 C15 8 17 12 20 12 C22 12 22 9 20 9.5 M12.5 9 C14.5 12 16.5 15 20 16",
    },
  ]),
  norse: Object.freeze([
    {
      id: "mjolnir", name: "Mjölnir", tier: "find",
      source: "Thor's-hammer pendants are among the commonest Norse finds of the 9th–10th centuries, and York has produced them.",
      d: "M12 3 V9 M6 9 H18 V14 H14 V21 H10 V14 H6 Z",
    },
    {
      id: "raven", name: "The Raven", tier: "text",
      source: "The Chronicle's annal for 878 records the West Saxons taking the Danish banner; what it looked like is not recorded. The name is that year's own; the bird is ours.",
      d: "M4 17 L7 16 C5 12 8 8 13 8 C15 8 16 7 17 7 L21 8 L17 9 C17 13 13 16 9 16 L7 16 M10 16 L9 19 M13 15.5 L12 19",
    },
    {
      id: "longship", name: "The Longship", tier: "find",
      source: "The ship burials — Gokstad and Oseberg are 9th-century finds — and the ship on the Gotland picture stones.",
      d: "M3 15 C6 17 18 17 21 15 L20 13 H4 Z M12 13 V5 M12 5 L16 7 L12 9 M6 13 L4 8 M18 13 L20 8",
    },
  ]),
  briton: Object.freeze([
    {
      id: "triskele", name: "The Triskele", tier: "find",
      source: "La Tène in origin, continuous through insular metalwork and manuscript art, on penannular brooches of the period.",
      d: "M12 12 C11 8 14 4 19 6 C17 8 16 10 17 12 M12 12 C15.5 13 16.5 18 12.5 21 C13 18.5 12 16.5 10 15.5 M12 12 C8.5 13.5 4 11.5 4.5 6.5 C6 8.5 8 9 10 8.5",
    },
    {
      id: "red_dragon", name: "The Red Dragon", tier: "text",
      source: "The Historia Brittonum (c. 829) carries the red dragon and the white, a British red dragon in a British source. Y Ddraig Goch as a rendered flag is Tudor: the association is period, the drawing is not.",
      d: "M3 13 C4 16 6 17 9 17 L15 17 C18 17 19 15 18 13 C17 11 15 11 15 8 L18 6 L21 7 L18 8 M15 17 L14 20 M10 17 L9 20 M11 17 L12 10 L16 14 M3 13 L2 10",
    },
    {
      id: "brooch", name: "The Penannular Brooch", tier: "find",
      source: "The open ring with the pin across it, on the shoulder of every man of standing — §9.3's own example of the insular finds of the period. A brooch on a field as a battle standard is our composition, and ships labelled a find only for the object.",
      d: "M14.5 5.5 A7.5 7.5 0 1 0 18.5 8.5 M13 4 L21 12 M13 4 L11.5 5.5 M21 12 L19.5 13.5",
    },
  ]),
  pict: Object.freeze([
    {
      id: "crescent_vrod", name: "The Crescent and V-rod", tier: "find",
      source: "Carved on the symbol stones, in the ground in Scotland today, 6th–9th century. What it meant is not known; that it is real is not in doubt.",
      d: "M4 13 A8 8 0 0 1 20 13 A6 6 0 0 0 4 13 Z M6 6 L12 15 L18 6",
    },
    {
      id: "double_disc_zrod", name: "The Double Disc and Z-rod", tier: "find",
      source: "The symbol stones again — two discs joined, a broken rod across them. Carved, dated, unambiguous.",
      d: "M7 12 A3.2 3.2 0 1 0 7.01 12 M17 12 A3.2 3.2 0 1 0 17.01 12 M10 12 H14 M5 6 L19 9 L5 15 L19 18",
    },
    {
      id: "beast", name: "The Pictish Beast", tier: "find",
      source: "The most common animal on the symbol stones and the least explained — a beaked, crested creature no one has named with confidence.",
      d: "M4 14 C6 10 9 9 12 10 C14 11 16 10 18 8 L21 7 M12 10 C11 13 9 15 6 15 M18 8 C19 11 18 13 15 14 M15 14 L17 17 M8 15 L7 18",
    },
    {
      id: "mirror_comb", name: "The Mirror and Comb", tier: "find",
      source: "A mirror and a comb, cut beside the other symbols on many of the stones; the objects themselves are known from graves.",
      d: "M8 10 A4 4 0 1 0 8.01 10 M8 14 V20 M14 12 H21 V16 H14 Z M15.5 16 V19 M17.5 16 V19 M19.5 16 V19",
    },
  ]),
});

/** The kingdoms that have standards at all. */
export const STANDARD_PEOPLES = Object.freeze(Object.keys(STANDARDS));

/** The list a kingdom may choose from; empty for the unsworn or the unknown. */
export function standardsFor(people) {
  return STANDARDS[people] || [];
}

/** The device by id within a kingdom, or null — a foreign id is null too. */
export function standardOf(people, id) {
  if (!id || id === "none") return null;
  return standardsFor(people).find((s) => s.id === id) || null;
}

/**
 * THE NARROWING, the same shape as `earnedMark`: a declared standard is kept
 * only if it is one of the declarer's OWN kingdom's devices, and is "none"
 * otherwise — so a modified client can fly nothing it could not have chosen,
 * and a stale profile that changed kingdom shows a bare field rather than the
 * old house's device on the new house's colour.
 */
export function narrowStandard(people, id) {
  return standardOf(people, id) ? id : "none";
}

/**
 * The names §9.2 refuses in as many words. Held here so the gate can assert no
 * device ever ships under one of them — the grimoire designs are not Viking-age
 * and the period symbols in the second half have been appropriated, and a game
 * that flies them is making a statement whether it means to or not.
 */
export const REFUSED = Object.freeze([
  "vegvisir", "aegishjalmur", "helm_of_awe", "valknut", "othala", "sunwheel", "sonnenrad", "black_sun",
]);
