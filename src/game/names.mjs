// ============================================================
// NAMES — how an Anglo-Saxon was actually called, and one place to say it
//
// WHY THIS FILE EXISTS. The owner played a match in which every opponent was
// "<something> the Grim". The cause was not a small pool; it was that there was
// no pool at all. `BOT_TITLES` mapped a difficulty to exactly ONE epithet —
// `{ recruit: " the Young", warrior: "", jarl: " the Grim" }` — so at jarl
// difficulty every bot in the room carried the same byname by construction. The
// twelve forenames behind it were drawn with a bare `Math.random()`, so two
// "Uhtred the Grim" in one ring was not unlucky, it was likely.
//
// It also exists in ONE file because the second half of the owner's ask — a
// name generator to inspire players who cannot think of one — is the same
// problem. Two lists, one for bots and one for the generator, is precisely the
// mirrored definition this repository has recorded five separate defects for.
// The engine and the menu read the same elements out of here.
//
// ---------------------------------------------------------------- the history
//
// Old English personal names are DITHEMATIC: two meaningful elements bolted
// together, a prototheme and a deuterotheme. Ælf+ric is "elf-ruler", Ead+weard
// "prosperity-guardian", Wulf+stan "wolf-stone", Æthel+ræd "noble-counsel".
// The halves were recombined freely within a family — Alfred's own house ran
// Æthelwulf, Æthelbald, Æthelberht, Æthelred, Æthelflæd — which is exactly why
// a generator is the historically honest way to do this and a hand-written list
// is not. Roughly 30 x 24 elements here, so the pool is in the hundreds rather
// than the twelve it replaces, and every draw is a well-formed name rather than
// a plausible-looking invention.
//
// Bynames were descriptive and earned, not decorative. The vivid ones in the
// jarl pool are attested: Edmund Ironside, Eric Blood-Axe, Sweyn Forkbeard,
// Ivar the Boneless, Sigurd Snake-in-the-Eye, Thorfinn Skull-Splitter, Thorkell
// the Tall, Ulf the Quarrelsome, Harold Harefoot. "Raven-Feeder" and
// "Corpse-Maker" are skaldic kennings for a warrior — feeding the raven is
// killing men — and are of the period even where the exact pairing is not.
//
// THE DIFFICULTY SIGNAL IS KEPT. The old mapping did one useful thing: a
// player could read what he was facing off the name. That survives, because the
// three pools are graded — a recruit is Beardless or Newcome, a jarl is
// Blood-Axe or Widow-Maker. What changes is that the tier picks a POOL instead
// of a constant.
// ============================================================

/**
 * First elements. Meanings are kept beside them because a name generator that
 * cannot say what it just built is a random string generator with a costume on,
 * and the menu shows the gloss to the player.
 */
export const PROTOTHEMES = Object.freeze([
  ["Æthel", "noble"], ["Ælf", "elf"], ["Ead", "prosperity"], ["Wulf", "wolf"],
  ["Beorn", "warrior"], ["Cyne", "kingly"], ["Leof", "beloved"], ["Os", "god"],
  ["Sige", "victory"], ["Here", "army"], ["Wig", "war"], ["Beorht", "bright"],
  ["Ceol", "ship"], ["Dun", "hill"], ["Eald", "old"], ["Wine", "friend"],
  ["God", "good"], ["Hroth", "glory"], ["Theod", "people"], ["Mær", "famous"],
  ["Burg", "stronghold"], ["Frith", "peace"], ["Gar", "spear"], ["Hild", "battle"],
  ["Ord", "spear-point"], ["Rand", "shield-rim"], ["Swith", "strong"],
  ["Torht", "shining"], ["Wil", "will"], ["Cuth", "known"],
]);

/**
 * Second elements. Old English deuterothemes were gendered — `-ric`, `-weard`
 * and `-mund` are masculine, `-flæd`, `-gyth` and `-burg` feminine — and both
 * are here on purpose: the game does not gender its warriors, and a player
 * asking for a name should be offered the whole language, not half of it.
 */
export const DEUTEROTHEMES = Object.freeze([
  ["ric", "ruler"], ["weard", "guardian"], ["stan", "stone"], ["mund", "protector"],
  ["gar", "spear"], ["wine", "friend"], ["helm", "helm"], ["ræd", "counsel"],
  ["wulf", "wolf"], ["berht", "bright"], ["sige", "victory"], ["noth", "daring"],
  ["lac", "offering"], ["frith", "peace"], ["bald", "bold"], ["here", "army"],
  ["wig", "war"], ["gyth", "battle"], ["flæd", "beauty"], ["burg", "stronghold"],
  ["mær", "famous"], ["stæf", "staff"], ["hun", "cub"], ["wald", "power"],
]);

/**
 * Bynames, graded so the tier still reads off the name. `warrior` carries the
 * plain, un-boastful ones because the middle rung should not sound like the top
 * one, and a few of its entries are deliberately quiet.
 */
export const BYNAMES = Object.freeze({
  recruit: Object.freeze([
    "the Young", "the Untried", "Beardless", "the Green", "Half-Sworn",
    "the Fosterling", "Newcome", "the Ploughhand", "Late-Sworn", "the Cupbearer",
  ]),
  warrior: Object.freeze([
    "the Steadfast", "Shield-Bearer", "the Sworn", "Oar-Handed", "the Wary",
    "Hearth-Sworn", "the Even-Tempered", "Spear-Straight", "the Dane-Fighter",
    "Long-Strider",
  ]),
  jarl: Object.freeze([
    "Ironside", "Blood-Axe", "the Grim", "Forkbeard", "Snake-in-the-Eye",
    "Skull-Splitter", "the Boneless", "Raven-Feeder", "the Quarrelsome",
    "Widow-Maker", "the Unflinching", "Corpse-Maker", "Hard-Ruler", "the Tall",
    "Wolf-of-the-Hall",
  ]),
});

/**
 * Join two elements the way the language did.
 *
 * Two rules, both real. A doubled consonant at the seam collapses — Ead + d…
 * gives one `d`, which is why the attested form is Eadræd and never Eaddræd.
 * And a name never repeats its own element: Wulfwulf is not a name, so a draw
 * that would produce one is rejected by the caller rather than smoothed here.
 */
export function joinElements(proto, deutero) {
  const a = proto.toLowerCase(), b = deutero.toLowerCase();
  if (a.endsWith(b[0])) return proto + deutero.slice(1);
  return proto + deutero;
}

/** True when a pairing would repeat itself — Wulf+wulf, Beorht+berht, Mær+mær. */
export function isTautology(proto, deutero) {
  const a = proto.toLowerCase(), b = deutero.toLowerCase();
  return a === b || a.endsWith(b) || b.endsWith(a);
}

/**
 * Forge one name. `rand` is injected rather than reached for, so the engine can
 * seed it per bot and the tests can pin it. Returns the elements too, because
 * the menu shows a player what his name MEANS, which is the whole reason a
 * generator beats a list for inspiring one.
 */
export function forgeName(rand = Math.random) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const [p, pMean] = PROTOTHEMES[(rand() * PROTOTHEMES.length) | 0];
    const [d, dMean] = DEUTEROTHEMES[(rand() * DEUTEROTHEMES.length) | 0];
    if (isTautology(p, d)) continue;
    return { name: joinElements(p, d), gloss: `${pMean}-${dMean}`, proto: p, deutero: d };
  }
  // Unreachable in practice: the tautology rate is a few percent and 24 draws
  // makes a miss vanishingly unlikely. A fixed fallback beats a null return,
  // because a name generator that can hand back nothing is worse than one that
  // occasionally repeats.
  return { name: "Ealdweard", gloss: "old-guardian", proto: "Eald", deutero: "weard" };
}

/**
 * A bot's full name, DETERMINISTIC in its seed.
 *
 * Determinism is load-bearing rather than tidy: `retuneBot` re-grades a bot in
 * the lobby and the file's own comment promises that "difficulty is a dial, not
 * a birthmark: a bot can be re-graded and keeps its name". Drawing a fresh
 * random byname on every re-grade would break that promise. Seeding it means a
 * bot moved recruit -> jarl -> recruit comes back to the byname it started with.
 */
export function botName(seed, difficulty, forename) {
  const pool = BYNAMES[difficulty] || BYNAMES.warrior;
  return `${forename} ${pool[Math.abs(seed | 0) % pool.length]}`;
}

/** How many distinct names the forge can reach, minus the tautologies. */
export function forgeSize() {
  let ok = 0;
  for (const [p] of PROTOTHEMES) for (const [d] of DEUTEROTHEMES) if (!isTautology(p, d)) ok++;
  return ok;
}
