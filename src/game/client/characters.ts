// ============================================================
// BRETWALDA — Warriors, war gear, and the armoury catalog
// ============================================================
//
// Every warrior in the frame is built here, out of nothing but code. There are
// no downloaded meshes and there never will be; the game has to stay a link you
// click.
//
// Three rules shaped this file, and they are worth stating before the numbers:
//
//   1. PROPORTION IS THE WHOLE GAME. The old builder put a 0.41 m head on a
//      2.15 m body — five heads tall, shoulders half as wide as the figure was
//      high — and no amount of texture or lighting rescues a silhouette that
//      reads as a toy. Everything below is measured off a single skeleton
//      (`SKELETON`) whose landmarks are real human ratios: 7.4 heads, arm span
//      equal to stature, biacromial breadth at 0.29 of it. Change a number
//      there and the whole body moves together, which is the point.
//
//   2. LAYERS, NOT DECALS. Kit is assembled the way it was worn — linen next to
//      the skin, wool over it, mail or lamellar over that, then belts, then the
//      cloak. Each layer is a separate swept shell sitting a measured 8–20 mm
//      proud of the one under it, and every hem is built with `wall` so it has a
//      real edge. That edge is what makes armour read as *put on* rather than
//      painted on.
//
//   3. ONE MESH PER SUBSTANCE PER MOVING PART. A warrior is a hundred-odd
//      primitives, but a primitive is not a draw call: everything a segment
//      wears in one material is merged before it reaches the scene. Eight
//      warriors used to cost ~520 draws; they now cost ~230, and identical
//      loadouts share the merged geometry outright (see `RIG_CACHE`).
//
//   4. A HEAD IS ATTACHED BY A SHADOW, NOT BY CONTACT. The owner looked at
//      `art/shots/v3/lineup.png` and said the heads "aren't attached to necks, look
//      floating? & seem a little small maybe?" — and there was no gap anywhere: the
//      neck shell reached the jaw, the head was 7.4 heads tall, every number
//      checked out. What was wrong was that head and neck *met* instead of
//      *overlapping*. A 126 mm cylinder was butted under a chin that tapers to a
//      25 mm nub, so its capped top showed as a lit horizontal plate; the throat
//      stood as far forward as the chin, so the mandible overhung nothing and threw
//      no shadow; and 113 mm of it was bare, because every neck opening in the kit
//      was hung 30 mm too low. The fix is three surfaces that fight for the same
//      space — the skull's own submandibular mass, the throat, and the mail that
//      falls off both — all in one substance so their intersections read as form
//      instead of as seams. The undercut under the jaw is the whole trick. Nothing
//      else on a character is worth as much per triangle.
//
//   5. A FACE AND A PAIR OF HANDS ARE NOT DETAILS. They are the two things a
//      player looks at, and for two iterations they were the two things that
//      were not there: helmet openings read as black voids, the hood read as a
//      blank cone, and the fists read as mittens. The void turned out to be
//      *occlusion*, not absence — a fully closed mail aventail whose front wall
//      stood proud of the nose, and a hood whose rim ran across the eyes — so a
//      built face was being bricked up behind kit. Both openings are now arcs
//      cut to leave the face where the light can reach it, and the eye behind
//      them is a real globe: pale sclera cut to an almond by two lids, a low-
//      roughness iris that catches the key as a specular dot, a lash line, and
//      lips in a warmer tone than the cheek.
//
// Geometry lives in a small toolkit at the top — a swept superelliptical shell,
// a two-sided parametric patch, a lens-section prism, a swept digit tube —
// because a body, a mail hauberk, a cloak, a finger and an axe head are all the
// same four shapes with different numbers. The face is the one exception: it is
// a displaced sphere with an anatomical field on it, so brow, socket, cheekbone,
// jaw, nasolabial fold and lid crease are actual geometry that catches actual
// shadow, not features drawn on a ball. That field is driven per warrior from a
// seed, which is what stops a brawl of eight being one man printed eight times.
//
// A note on winding, because it cost three bugs in one pass: `patch` takes its
// facing from ∂u × ∂v and `digit` from ∂ring × ∂row. Sweep either the wrong way
// and the surface is inside out — silently, because backface culling simply
// removes it. Anything new built on those two helpers should be checked, not
// assumed.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WarriorClass } from "../types";

// ---------------- Appearance ----------------
export interface Appearance {
  // See `HELM` for what each of these is made of, and `HELM_VALUES` for the
  // list a validator should check a stored or wired appearance against.
  helm: string;      // none | iron | nasal | hood | ridge | spectacle | boar | crowned | wyrm | suttonhoo
  hairStyle: string; // shaved | short | long | braids
  hairColor: number;
  beardStyle: string;// none | short | full | forked | braided
  beardColor: number;
  cloak: string;     // none | brown | red | blue | gold
  armorColor: number;
  warPaint: string;  // none | stripes | cross | half
}

export interface PlayerAppearanceHolder {
  appearance?: Appearance;
}

export function defaultAppearance(cls: WarriorClass): Appearance {
  return {
    helm: cls === "runekeeper" ? "hood" : cls === "huscarl" ? "nasal" : "iron",
    hairStyle: "short",
    hairColor: 0x4a3220,
    beardStyle: cls === "berserker" ? "full" : "short",
    beardColor: 0x4a3220,
    cloak: cls === "berserker" ? "brown" : cls === "runekeeper" ? "blue" : "red",
    armorColor: 0x5f6b7a,
    warPaint: "none",
  };
}

/**
 * Retired armoury values, mapped to what replaced them.
 *
 * The armoury UI marks a tile as equipped by comparing the stored appearance's
 * value against the catalog's, so re-grading a finish orphans every profile that
 * had it: the warrior still builds (the colour is just a number to the builder),
 * but the armoury shows the slot as owning nothing, and the next tap charges the
 * player again for what he already bought. Rough Iron was lifted from 0x4a5568
 * this pass because as the default finish it is the largest surface in the game
 * and it carried less light than the turf underfoot.
 *
 * Keyed by the dead value, so a lookup that misses is the common case and costs
 * nothing. Entries stay forever — a profile in localStorage has no expiry.
 */
const RETIRED_ARMOUR: Record<number, number> = {
  0x4a5568: 0x5f6b7a, // Rough Iron, before the v3 lighting pass
};

/**
 * The same, for the hair and beard colour slots, which were re-graded in the
 * cosmetics pass. `docs/COSMETICS-AUDIT.md` has the readings: the default Oak
 * Brown sat within a few per cent of the skin's value at this exposure, so the
 * crop, the jaw and the cheek rendered as one continuous tan mass and neither
 * the hairline nor the beard's edge existed; Norse Gold and Fire Red came back
 * as saturated yellow and pillar-box red, which is paint rather than hair; and
 * Greybeard and Snow White were near enough indistinguishable that two paid
 * options were selling the same thing.
 *
 * Nothing is cut and nothing changes price — a player who bought Fire Red still
 * owns Fire Red, and this maps his stored hex onto the re-graded one so the
 * armoury still shows the tile he paid for as equipped.
 */
const RETIRED_HAIR: Record<number, number> = {
  0x6b4a2a: 0x4a3220, // Oak Brown, when it was the same value as the skin under it
  0xb8a14e: 0x9c8a55, // Norse Gold, when it was yellow
  0x8a3b22: 0x7a412c, // Fire Red, when it was pillar-box
  0x9c9c9c: 0x8a8578, // Greybeard, when it was Snow White at 30 gold less
};

/**
 * Brings a stored appearance up to the current catalog. Call this on anything
 * that came out of localStorage or off the wire before showing it in the armoury;
 * it is a no-op for anything already current.
 */
export function migrateAppearance(ap: Appearance): Appearance {
  const armorColor = RETIRED_ARMOUR[ap.armorColor] ?? ap.armorColor;
  const hairColor = RETIRED_HAIR[ap.hairColor] ?? ap.hairColor;
  const beardColor = RETIRED_HAIR[ap.beardColor] ?? ap.beardColor;
  if (armorColor === ap.armorColor && hairColor === ap.hairColor && beardColor === ap.beardColor) return ap;
  return { ...ap, armorColor, hairColor, beardColor };
}

// ---------------- Armoury Catalog ----------------
export interface ArmouryOption {
  id: string;
  label: string;
  cost: number;
  slot: string;
  value: string | number;
  desc?: string;
}

export const ARMOURY: Array<{ slot: string; label: string; options: ArmouryOption[] }> = [
  // WHAT A MATCH PAYS, MEASURED — and this note used to be wrong, said so itself,
  // and was wrong for long enough that docs/COSMETICS-AUDIT.md flags it twice.
  //
  // It reasoned from "call it 200–260 a match", predicted off `endMatch`'s
  // `10 + 15·kills + 50·win` and a guess at how a best-of-3 compounds. Measurement
  // disproved it: **a winning best-of-3 pays 90–135 gold.** Gold is granted once
  // at match end off accumulated totals, so three rounds are one payout and not
  // three, which is most of where the doubled estimate came from. Every price in
  // this table is now read against 90–135, and the note the old one carried —
  // that this row is the thing to re-check when the economy moves — stands.
  //
  // Against that anchor:
  //
  //   * The mid helm rungs are two to four matches apart, which is what makes
  //     them worth buying on the way past.
  //   * Sutton Hoo is deliberately not on that curve. 2400 is 18–25 winning
  //     matches, an evening a week for a month, and it is the only thing in the
  //     shop priced as a season's goal rather than as a purchase. The owner has
  //     confirmed that number is right.
  //   * A SLOT WHOSE PRODUCT IS A COLOUR IS PRICED AS A COLOUR. `npm run
  //     cosmetictest` measures every option's shape with no materials, no light
  //     and no pose, and Armour Finish, Hair Colour and Beard Colour come back at
  //     0.00% in silhouette AND form on every rung — correctly, because a tint is
  //     what they are. What is not correct is charging 510 gold for one. See the
  //     notes on those three slots.
  {
    slot: "helm", label: "Helmets",
    options: [
      { id: "helm_none", label: "Bare Head", cost: 0, slot: "helm", value: "none" },
      { id: "helm_iron", label: "Iron Spangenhelm", cost: 30, slot: "helm", value: "iron" },
      { id: "helm_nasal", label: "Nasal Helm", cost: 110, slot: "helm", value: "nasal" },
      { id: "helm_hood", label: "Shadow Hood", cost: 120, slot: "helm", value: "hood" },
      { id: "helm_ridge", label: "Ridge Helm", cost: 190, slot: "helm", value: "ridge",
        desc: "A welded crest fore and aft, and a fall of iron off the nape." },
      { id: "helm_spectacle", label: "Spectacle Helm", cost: 280, slot: "helm", value: "spectacle" },
      { id: "helm_boar", label: "Boar-Crest Helm", cost: 380, slot: "helm", value: "boar",
        desc: "A bronze boar stands the length of the crown, tusks forward." },
      { id: "helm_crowned", label: "Jarl's Crowned Helm", cost: 570, slot: "helm", value: "crowned" },
      { id: "helm_wyrm", label: "Wyrm-Crest Helm", cost: 950, slot: "helm", value: "wyrm",
        desc: "A serpent arched over the crown, its head thrown out past the brow." },
      { id: "helm_suttonhoo", label: "The Sutton Hoo Helm", cost: 2400, slot: "helm", value: "suttonhoo",
        desc: "Tinned silver, gilt and garnet. A face with no man in it." },
    ],
  },
  {
    slot: "hair", label: "Hair",
    options: [
      { id: "hair_shaved", label: "Shaved", cost: 0, slot: "hair", value: "shaved" },
      { id: "hair_short", label: "Warrior Crop", cost: 0, slot: "hair", value: "short" },
      { id: "hair_long", label: "Long Mane", cost: 40, slot: "hair", value: "long" },
      { id: "hair_braids", label: "Braided War-locks", cost: 100, slot: "hair", value: "braids" },
    ],
  },
  {
    slot: "hairColor", label: "Hair Colour",
    // REPRICED TO WHAT A DYE IS WORTH. These six are literally hex values —
    // `cosmetictest` reads every rung at 0.00% silhouette and 0.00% form and that
    // is correct rather than a defect, because there is no geometry here to
    // differ. What was not correct was the ladder: 30–40 gold a rung is a third
    // of a winning best-of-3 for a number, and the same number again in the beard
    // slot, so twelve SKUs of pure hex were carrying 210 gold. A dye is 10.
    //
    // Re-graded rather than cut — see `RETIRED_HAIR` for the readings and for how
    // a stored profile keeps the tile it paid for. Nobody is stranded by the
    // reprice either: ids are unchanged, so every profile that owns one still
    // owns it, and a price only ever applies to a purchase not yet made.
    options: [
      { id: "hc_brown", label: "Oak Brown", cost: 0, slot: "hairColor", value: 0x4a3220 },
      { id: "hc_black", label: "Raven Black", cost: 0, slot: "hairColor", value: 0x1c1712 },
      { id: "hc_blond", label: "Norse Gold", cost: 10, slot: "hairColor", value: 0x9c8a55 },
      { id: "hc_red", label: "Fire Red", cost: 10, slot: "hairColor", value: 0x7a412c },
      { id: "hc_grey", label: "Greybeard", cost: 10, slot: "hairColor", value: 0x8a8578 },
      { id: "hc_snow", label: "Snow White", cost: 10, slot: "hairColor", value: 0xe8e4da },
    ],
  },
  {
    slot: "beard", label: "Beards",
    // PRICES HELD. Full, Forked and Ringed Braid measured as one crescent — 0.57%
    // and 0.87% of the subject at fight distance, both under the 1% a shape has
    // to move to be seen in play — and they now differ in mass and in length: a
    // wedge, a wedge with a notch cut out of it, and a rope reaching twice as far.
    // The ladder buys more beard as well as more work, so 40/80/120 is honest.
    //
    // `beard_short` stays FREE and stays where it is in the ladder, but it is no
    // longer the same object as Clean Shaven: it had no geometry at all, and now
    // carries 9 mm of close crop. It is renamed for that, because "Stubble" names
    // a shadow and this is a beard — the same rule the audit applies to "Bronze
    // Scales". Id and value are unchanged, so nothing stored moves.
    options: [
      { id: "beard_none", label: "Clean Shaven", cost: 0, slot: "beard", value: "none" },
      { id: "beard_short", label: "Close Crop", cost: 0, slot: "beard", value: "short" },
      { id: "beard_full", label: "Full Beard", cost: 40, slot: "beard", value: "full",
        desc: "Broad and short. It spreads past the jaw." },
      { id: "beard_forked", label: "Forked Beard", cost: 80, slot: "beard", value: "forked",
        desc: "Two tines swung apart, with daylight between them from every side." },
      { id: "beard_braided", label: "Ringed Braid", cost: 120, slot: "beard", value: "braided",
        desc: "One rope of a plait, bound in brass three times, to the chest." },
    ],
  },
  {
    slot: "beardColor", label: "Beard Colour",
    // The same reprice, for the same reason, on the same six hex values — see the
    // hair colour note above.
    options: [
      { id: "bc_brown", label: "Oak Brown", cost: 0, slot: "beardColor", value: 0x4a3220 },
      { id: "bc_black", label: "Raven Black", cost: 0, slot: "beardColor", value: 0x1c1712 },
      { id: "bc_blond", label: "Norse Gold", cost: 10, slot: "beardColor", value: 0x9c8a55 },
      { id: "bc_red", label: "Fire Red", cost: 10, slot: "beardColor", value: 0x7a412c },
      { id: "bc_grey", label: "Greybeard", cost: 10, slot: "beardColor", value: 0x8a8578 },
      { id: "bc_snow", label: "Snow White", cost: 10, slot: "beardColor", value: 0xe8e4da },
    ],
  },
  {
    slot: "cloak", label: "Cloaks",
    // PRICES HELD, AND THIS IS THE ONE SLOT WHERE THAT NEEDED ARGUING. Until this
    // wave the four were pairwise 0.00% in silhouette and form from every lens
    // and bearing — one mesh under four names, so 400 gold bought a recolour of a
    // 30-gold garment and this was the worst value in the game.
    //
    // They are four cuts now, not four tints: see `CLOAK_CUTS`. Each differs from
    // its neighbour in length, hem, wrap, flare, fold and fastening, and the
    // ladder buys outline — which is the thing a cloak is uniquely able to sell,
    // because at fight distance it is fifty pixels of a man where a helmet crest
    // is two. So the prices stand as the owner set them, on the geometry rather
    // than on the name:
    //
    //   30   a short shoulder cape to the hip, pinned with a bone pin
    //   90   the full-length war cloak, knee, level hem, disc brooch
    //   90   the same money for the opposite garment — longer, narrow, no flare,
    //        cut to a point, on a penannular ring-and-pin
    //   400  the largest garment in the game: a train, the widest wrap, seven
    //        folds and a bossed gilt disc
    options: [
      { id: "cloak_none", label: "No Cloak", cost: 0, slot: "cloak", value: "none" },
      { id: "cloak_brown", label: "Traveller's Cloak", cost: 30, slot: "cloak", value: "brown",
        desc: "A short cape off one shoulder, pinned with a bone pin." },
      { id: "cloak_red", label: "Blood Red Cloak", cost: 90, slot: "cloak", value: "red",
        desc: "Full length to the knee, hung from the shield shoulder on a disc brooch." },
      { id: "cloak_blue", label: "Sea-Wolf Cloak", cost: 90, slot: "cloak", value: "blue",
        desc: "Long and narrow, cut to a tail at the back, on a ring-and-pin." },
      { id: "cloak_gold", label: "Gilded War Cloak", cost: 400, slot: "cloak", value: "gold",
        desc: "A trained war cloak on a bossed gilt disc. It sweeps behind him." },
    ],
  },
  {
    slot: "armor", label: "Armour Finish",
    options: [
      // Rough Iron is what every warrior wears until he buys something, so it is
      // the largest single surface in the game. At 0x4a5568 it carried 0.09 linear
      // — under the turf it stands on — and every layer of kit over it landed
      // inside one black shape. Lifted about half a stop; still the dullest,
      // cheapest finish in the catalog, and still unmistakably iron rather than
      // steel. (Stored profiles holding the old value will show no finish selected
      // until the player re-picks one; the warrior still builds correctly.)
      //
      // REPRICED FROM 1050 GOLD OF LADDER TO 250, BECAUSE IT IS A TINT AND THIS
      // WAVE DID NOT MAKE IT ANYTHING ELSE. Three measurements, none of them an
      // opinion:
      //
      //   * `cosmetictest` reads all six adjacent rungs at 0.00% silhouette and
      //     0.00% form. `ap.armorColor` feeds exactly one thing — `M.armour(...)`,
      //     the mail material — so there is no geometry in this slot to differ.
      //   * The audit's frames say the tint lands on the two shoulders and a
      //     sliver of chest, because the shield covers the rest of the torso at
      //     every bearing a player fights from.
      //   * Two of the four classes cannot wear it. The runekeeper's torso layer
      //     is `robed ? buff : mail` — leather, not mail — and the berserker is
      //     `bare` with no metal torso layer at all. 510 gold bought them nothing.
      //
      // Bretwalda Gold at 510 was 4–6 winning matches for a hex value that half
      // the roster cannot see, which is the most dishonest price in the shop. The
      // slot is a rack of DYES AND METAL POLISHES and is priced as one: 20 to 60,
      // ordered by how exotic the dyestuff is rather than by how grand the name
      // is. If somebody later gives these real substance — scale geometry for
      // Bronze, a lacquered plate for Crimson, blued mail for Blackened — and
      // puts it on a surface every class actually has, then the ladder can be
      // re-argued upward with a frame behind it. Until then it costs what a
      // colour costs. Ids are unchanged, so a profile that already paid 510 keeps
      // what it bought.
      { id: "armor_iron", label: "Rough Iron", cost: 0, slot: "armor", value: 0x5f6b7a },
      { id: "armor_steel", label: "Polished Steel", cost: 20, slot: "armor", value: 0x8a97a5 },
      { id: "armor_dark", label: "Blackened Steel", cost: 40, slot: "armor", value: 0x2a2f38 },
      { id: "armor_bronze", label: "Bronze Scales", cost: 50, slot: "armor", value: 0x8a6a3a },
      { id: "armor_crimson", label: "Crimson Warplate", cost: 40, slot: "armor", value: 0x7a2f2a },
      { id: "armor_seablue", label: "Sea Queen's Gift", cost: 40, slot: "armor", value: 0x2f4a6a },
      { id: "armor_gold", label: "Bretwalda Gold", cost: 60, slot: "armor", value: 0x9a7a2a },
    ],
  },
  {
    slot: "warPaint", label: "War Paint",
    options: [
      { id: "wp_none", label: "None", cost: 0, slot: "warPaint", value: "none" },
      { id: "wp_stripes", label: "Blood Stripes", cost: 40, slot: "warPaint", value: "stripes" },
      { id: "wp_cross", label: "Raven Cross", cost: 70, slot: "warPaint", value: "cross" },
      { id: "wp_half", label: "Half-Face Shadow", cost: 110, slot: "warPaint", value: "half" },
    ],
  },
];

export function freeCosmeticIds(): string[] {
  const ids: string[] = [];
  ARMOURY.forEach((s) => s.options.forEach((o) => { if (o.cost === 0) ids.push(o.id); }));
  return ids;
}

/**
 * What a helmet is made of, as parts rather than as a name.
 *
 * The build used to branch on `ap.helm ===` in five places, and the boolean that
 * gated the whole metal-helm block spelled four values out by hand — so adding a
 * fifth meant finding all of them and getting every one right. A helmet is a set
 * of pieces; the geometry below asks what it is wearing rather than who it is,
 * and a new one is a row here plus whatever new piece it introduces.
 *
 * `none` and `hood` are rows too, so that one list covers every legal value.
 */
export interface HelmStyle {
  /** A metal cap: bowl, brow band, ribs. False for the bare head and the hood. */
  cap: boolean;
  /**
   * THE SHAPE OF THE BOWL, and it is the axis the ladder was missing.
   *
   * `docs/COSMETICS-AUDIT.md` §3 proved that seven of the ten rungs — 30 gold
   * through 950, 2110 gold of purchases — were ONE object with fittings bolted
   * to it, and that at fight distance they read as the same 20 px grey dome.
   * That is not a fittings problem; a boss on a crown is four pixels. A price
   * ladder has to be a ladder of SILHOUETTES, so the profile of the cap itself
   * changes between rungs:
   *
   *   `shallow` a low four-plate spangenhelm, the base of the range
   *   `cone`    one-piece and drawn to a definite apex — the tallest outline
   *             in the shop under the crested rungs, and no ribs, because a
   *             raised cap has no plate joins to rivet a strip over
   *   `round`   the deep Vendel bowl the face furniture hangs off
   *   `tall`    a high domed cap with a straight flank, for the noble rungs
   *
   * `art/shots/sil/sil-helm.png` is the test and the only one that counts:
   * with the material off, adjacent panels have to be different shapes.
   */
  bowl: "shallow" | "cone" | "round" | "tall";
  /** The plain bar down the nose. A helm with a face piece of its own says no. */
  nasal: boolean;
  /** Spectacle plate: brows in metal with the sockets shadowed under them. */
  brows: boolean;
  /** How far the side plates fall. `deep` reaches the jawline and stands outside a mask. */
  cheek: "none" | "short" | "deep";
  /** What hangs off the back of the band. `guard` is a plated fall, `flange` a lip. */
  nape: "none" | "flange" | "guard";
  crown: "none" | "circlet" | "ridge" | "boar" | "wyrm" | "sutton";
  /** A solid face with two eye openings. Exactly one helmet in the game has one. */
  mask: boolean;
  /** Tinned silver, gilt and garnet in place of iron and steel. */
  noble: boolean;
}

const BARE_HEAD: HelmStyle = {
  cap: false, bowl: "round", nasal: false, brows: false,
  cheek: "none", nape: "none", crown: "none", mask: false, noble: false,
};

/**
 * Keyed by `Appearance.helm`. Order is the shop's order, which is also the order
 * the lineup capture wants them in.
 */
export const HELM: Readonly<Record<string, HelmStyle>> = {
  none: BARE_HEAD,
  hood: BARE_HEAD,
  // 30 g. The base of the range and the one bowl that stays low: four plates,
  // the frame bands standing proud of them, nothing else.
  iron: { ...BARE_HEAD, cap: true, bowl: "shallow" },
  // 110 g. Raised from one sheet, so it has no plate joins and therefore no
  // ribs, and it comes to a point — the tallest bare outline in the shop.
  nasal: { ...BARE_HEAD, cap: true, bowl: "cone", nasal: true },
  // 190 g. A round bowl broken fore-and-aft by a comb. The comb IS the rung.
  ridge: { ...BARE_HEAD, cap: true, bowl: "round", nasal: true, crown: "ridge", nape: "flange" },
  spectacle: { ...BARE_HEAD, cap: true, bowl: "round", nasal: true, brows: true, cheek: "short" },
  boar: { ...BARE_HEAD, cap: true, bowl: "round", nasal: true, brows: true, cheek: "short", crown: "boar", nape: "flange" },
  // 570 g, and the audit's ruling was that it bought LESS geometry than the
  // 380 — it lost the boar and the nape flange and gained a circlet. It now
  // has the tall noble bowl, the flange back, and a circlet with real points.
  crowned: { ...BARE_HEAD, cap: true, bowl: "tall", nasal: true, brows: true, cheek: "short", crown: "circlet", nape: "flange" },
  wyrm: { ...BARE_HEAD, cap: true, bowl: "tall", nasal: true, brows: true, cheek: "deep", crown: "wyrm", nape: "guard" },
  suttonhoo: {
    cap: true, bowl: "round", nasal: false, brows: false,
    cheek: "deep", nape: "guard", crown: "sutton", mask: true, noble: true,
  },
};

/** Every value `Appearance.helm` may legally hold. Anything else builds bare. */
export const HELM_VALUES: readonly string[] = Object.keys(HELM);

const helmStyle = (value: string): HelmStyle => HELM[value] ?? BARE_HEAD;

// ---------------- Materials ----------------
// A warrior asks for substances, not colours: mail, wool, leather, skin, steel,
// oak. Where those come from is the caller's business — the arena hands over its
// shared, textured library, so a lobby of eight warriors is a handful of
// programs rather than the 73 fresh MeshStandardMaterials per body this file
// used to allocate.
//
// `tinted` is the wide door onto that library: iron is not steel and linen is
// not wool, and a helm that reflects like a sword bezel is the difference
// between kit that reads as forged and kit that reads as chrome. Declared with
// method syntax on purpose — TypeScript checks method parameters bivariantly,
// which is what lets the arena's full `SurfaceName` union satisfy the narrow
// list a warrior actually wears.
export type CharacterSurface =
  | "mail" | "iron" | "steel" | "bronze" | "interlace"
  | "wool" | "linen" | "leather" | "rope"
  | "oak" | "bone" | "skin";

export interface CharacterTint {
  roughness?: number;
  metalness?: number;
  repeat?: number;
  /**
   * The substance's world tile in metres, overriding the library's own. For kit
   * worn at a scale the substance was never sized for: `steel` is drawn at
   * 300 mm, which is a blade, and a 15 mm brow band asked for at that density
   * gets a twentieth of one tile — one smooth gradient, which is what makes a
   * fitting read as plastic. The armoury preview's stand-in ignores it, because
   * it has no maps to project in the first place.
   */
  tile?: number;
}

export interface CharacterMaterials {
  armour(color: number): THREE.MeshStandardMaterial;
  tunic(color: number): THREE.MeshStandardMaterial;
  hide(color: number): THREE.MeshStandardMaterial;
  flesh(color: number): THREE.MeshStandardMaterial;
  blade(color: number, roughness?: number): THREE.MeshStandardMaterial;
  timber(color: number): THREE.MeshStandardMaterial;
  standard(color: number, roughness?: number, metalness?: number): THREE.MeshStandardMaterial;
  tinted(surface: CharacterSurface, color: number, opts?: CharacterTint): THREE.MeshStandardMaterial;
  get(name: "runeGlow"): THREE.Material;
}

/**
 * Untextured stand-in for callers with no texture library — the armoury preview
 * renders into its own canvas and cannot afford to generate half a megabyte of
 * PBR maps to show one hauberk. Every call allocates, and the caller is expected
 * to dispose what it built.
 */
const RAW: CharacterMaterials = {
  armour: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.55 }),
  tunic: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0 }),
  hide: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0 }),
  flesh: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0 }),
  blade: (c, rough = 0.35) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0.85 }),
  timber: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0 }),
  standard: (c, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }),
  tinted: (surface, c, opts) => new THREE.MeshStandardMaterial({
    color: c,
    roughness: opts?.roughness ?? (surface === "steel" || surface === "iron" ? 0.35 : 0.85),
    metalness: opts?.metalness ?? (surface === "steel" || surface === "iron" || surface === "mail" || surface === "bronze" ? 0.8 : 0),
  }),
  get: () => new THREE.MeshStandardMaterial({ color: 0x66c8ff, emissive: 0x2288dd, emissiveIntensity: 3.5, roughness: 0.4 }),
};

// Skin is authored as a *set*, not a colour. A single diffuse tone is the thing
// that makes CG flesh read as painted plastic: real skin is translucent, so the
// thin places — ear, nose tip, lip, knuckle, eyelid — pass red light through and
// the thick places do not. Four tones per warrior fake that for the price of two
// extra materials: `base` on the broad planes, `shade` where the form turns away
// (socket, jaw shelf, under the nose, palm), `warm` on the translucent edges and
// on the bone that flushes — cheekbone, lip, ear, fingertip — and `sclera`,
// which is a complexion property for the reason given where it is used. It is a
// cheat, but it is the same cheat every hand-painted game character has used for
// twenty years, and it survives a night key that a subsurface shader would not.
//
// The `base`→`shade` gap widened this pass and that is not decoration. The rig a
// warrior stands in is ambient 0.85 + hemisphere 0.62 + a `bounce` directional
// aimed along (0, −4, 9) at 1.7 — for a front-facing plane that is roughly 60% of
// the light on the face arriving either omnidirectionally or straight down the
// camera axis, and light along the view axis carries *no* form information. Only
// the key at (12, 26, 9) shades, and it shades up/down-facing relief. So a face
// lit front-on in this arena cannot be shaded into legibility by geometry alone at
// portrait size; some of the break has to be in the albedo. `shade` is now about
// 0.72 of `base` rather than 0.85: the old pair was inside a quarter-stop of each
// other, so putting it on the socket and the jaw shelf changed nothing a viewer
// could see.
interface SkinTone { base: number; shade: number; warm: number; sclera: number }

// Four complexions, quantised on purpose: the material library caches by colour,
// so a field of eight warriors costs at most sixteen flesh programs instead of
// thirty-two. Ordered pale → weathered → tanned → dark. Every `base` came down
// about 8% this pass as well — at 0xe0b590 the face was the brightest large
// surface on the warrior and it blew flat against the helm.
const SKIN_TONES: SkinTone[] = [
  { base: 0xd4a884, shade: 0x9b7456, warm: 0xc4816a, sclera: 0xa89b88 },
  { base: 0xc99d75, shade: 0x917050, warm: 0xb87256, sclera: 0x9a8e7c },
  { base: 0xb08157, shade: 0x7f5c3c, warm: 0xa25f47, sclera: 0x847a6a },
  { base: 0x8d6444, shade: 0x65472e, warm: 0x7c4936, sclera: 0x655d50 },
];

const CLOAK_COLORS: Record<string, number> = {
  brown: 0x5a4030, red: 0x7a2020, blue: 0x24386a, gold: 0xa8842a, none: 0x5a4030,
};

/**
 * HOW EACH CLOAK IS CUT — and the reason this table exists at all.
 *
 * `npm run cosmetictest` measured the four cloaks against each other with the
 * material taken away, and every pair came back **0.00% in silhouette AND in
 * form, from every lens and every bearing**. One mesh, four names, 30 to 400
 * gold. That is the worst value in the shop and it was invisible for as long as
 * the only instrument was a colour.
 *
 * Two things are fixed here and they are separate.
 *
 * FIRST, THE CUT WAS WRONG FOR ALL FOUR. The old sheet spanned ±0.56π
 * SYMMETRICALLY about the spine — a cape over both shoulders, which is a Roman
 * paludamentum — while the brooch was pinned to ONE shoulder. The clasp and the
 * cloth contradicted each other, and docs/COSMETICS-AUDIT.md §1 ranks that above
 * every individual item in the shop. Every cut below is asymmetric: it comes
 * over the pinned shoulder (negative azimuth, where the brooch already sits and
 * where the shield is carried), crosses the back on a falling top edge because
 * nothing holds it up over there, and stops SHORT of the sword arm. `a1` is at
 * most 0.40π against the old 0.56π, so the weapon side is strictly clearer than
 * it was.
 *
 * SECOND, FOUR NAMES NEED FOUR GARMENTS. A cloak is the one purchasable item
 * that can change a man's outline at fight distance — 7.9 mm to a pixel, where a
 * helmet crest is two pixels and a cloak is fifty. So the four differ in the
 * things that survive that: LENGTH (0.56 of the drop unit against 1.34, hip
 * against ankle), HEM (level, pointed, trained), WRAP (how far round the body
 * the cloth goes), FLARE (a column against a bell) and FOLD (three deep folds
 * against seven shallow ones). Colour is the last thing on that list and it is
 * the only one the shop used to have.
 *
 * Fields, all in the cloak pivot's own frame:
 *   a0,a1   azimuth of the leading (pinned) and trailing edges. 0 is the spine,
 *           negative is the pinned/shield side, positive is the sword side.
 *   drop    length unit at the deepest point of the hem, in metres, before the
 *           class scale.
 *   nape    how far the top edge falls between the pin and the trailing corner.
 *   napePow shape of that fall — 1 is a straight diagonal, >1 keeps it high
 *           across the shoulder blade and drops it late.
 *   lead    how far the front corner falls onto the chest past the pin.
 *   hem     hem length as a multiple of `drop`, along the cut from lead to tail.
 *   flareX/Z how far the hem stands off the top edge. A column has almost none.
 *   grow    how the flare is distributed down the drop: 1 is all at the hem
 *           (a bell), 0 is linear (a straight fall).
 *   foldN/A fold frequency in azimuth and fold depth at the hem.
 *   collar  depth of the rolled border along the top edge.
 *   clasp   which brooch pins it — see the clasp block in the torso.
 */
interface CloakCut {
  a0: number; a1: number; drop: number;
  nape: number; napePow: number; lead: number;
  hem(t: number): number;
  flareX: number; flareZ: number; grow: number;
  foldN: number; foldA: number; collar: number;
  clasp: "pin" | "disc" | "ringpin" | "gilt";
}

const CLOAK_CUTS: Record<string, CloakCut> = {
  // TRAVELLER'S CLOAK, 30 gold. A short shoulder cape that clears the hip so a
  // man can walk in it. It is the cheap rung and it is allowed to be small — what
  // it is not allowed to be is the 400-gold one in brown, which is what it was.
  brown: {
    a0: -0.62 * Math.PI, a1: 0.26 * Math.PI, drop: 0.56,
    nape: 0.085, napePow: 1.35, lead: 0.048,
    hem: (t) => 0.72 + 0.34 * Math.sin(Math.PI * Math.pow(t, 0.85)),
    flareX: 0.062, flareZ: 0.072, grow: 0.45,
    foldN: 5.0, foldA: 0.030, collar: 0.045, clasp: "pin",
  },
  // BLOOD RED CLOAK, 90 gold. The full-length war cloak: knee, level hem, a
  // proper wrap round the body. This is the one the other three are read against.
  red: {
    a0: -0.68 * Math.PI, a1: 0.38 * Math.PI, drop: 1.02,
    nape: 0.16, napePow: 1.15, lead: 0.055,
    hem: (t) => 0.93 + 0.11 * Math.sin(Math.PI * t),
    flareX: 0.135, flareZ: 0.155, grow: 0.60,
    foldN: 5.5, foldA: 0.052, collar: 0.055, clasp: "disc",
  },
  // SEA-WOLF CLOAK, 90 gold — the same price as the Blood Red and therefore the
  // pair that has to differ in something other than money. It is the OPPOSITE
  // garment at the same cost: longer, narrower, no flare at all, and cut to a
  // point at the back like a wolf's tail. In outline it is a column with a spike
  // where the Blood Red is a bell with a level hem, so a player choosing between
  // two 90-gold rungs is choosing a shape and not a swatch.
  blue: {
    a0: -0.56 * Math.PI, a1: 0.32 * Math.PI, drop: 1.24,
    nape: 0.215, napePow: 1.6, lead: 0.030,
    hem: (t) => 0.40 + 0.76 * Math.pow(Math.sin(Math.PI * t), 1.5),
    flareX: 0.038, flareZ: 0.046, grow: 0.25,
    foldN: 3.4, foldA: 0.064, collar: 0.038, clasp: "ringpin",
  },
  // GILDED WAR CLOAK, 400 gold. The audit's frame calls the old one a lampshade —
  // a truncated cone with a horizontal circle for a hem, standing above the
  // shoulders with daylight under it. It is now the largest garment in the game
  // and the only one with a TRAIN: shortest at the chest, longest at the trailing
  // corner, so it sweeps behind him. It wraps furthest round the chest, flares
  // most, and carries seven folds against the Sea-Wolf's three.
  gold: {
    a0: -0.80 * Math.PI, a1: 0.40 * Math.PI, drop: 1.34,
    nape: 0.125, napePow: 2.1, lead: 0.075,
    hem: (t) => 0.56 + 0.34 * Math.pow(t, 1.5) + 0.26 * Math.sin(Math.PI * t),
    flareX: 0.205, flareZ: 0.225, grow: 0.85,
    foldN: 7.0, foldA: 0.056, collar: 0.070, clasp: "gilt",
  },
};

/**
 * How many times a woven texture tiles across a garment, derived from how big the
 * garment is instead of fixed.
 *
 * `CharacterMaterials.tunic` asks for five repeats whatever it is dressing, and
 * that is the houndstooth. The `wool` tile is not only a weave: it carries a
 * vat-dye field at two cycles across itself, contrast-expanded, so one tile shows
 * roughly four large blotches. Five tiles round a thigh puts those blotches
 * 27 mm apart — measured off `art/shots/v4/stance.png` and confirmed against the
 * generated tile — and 27 mm of alternating light and dark on cloth is not a
 * weave, it is a printed check. Same tile at the density below lands a blotch
 * every 9 mm, which reads as coarse, fulled, hand-woven wool.
 *
 * `girth` is the distance the mesh's u axis covers in metres — a shell's u goes
 * once round, so it is the circumference. Quantised to four steps so the same
 * colour worn at three girths still shares one program and one texture view.
 */
const CLOTH_BLOTCH = 0.009;
function clothRepeat(girth: number): number {
  const want = girth / (CLOTH_BLOTCH * 4);
  return want < 10 ? 8 : want < 15 ? 12 : want < 21 ? 18 : 24;
}

// Iris colours. Dark eyes are the honest majority, but an eye only reads at all
// because the iris is *darker than the sclera around it* — so the pale two exist
// for contrast against a helmet's shadow, not for ethnographic spread. All five
// came down a step this pass, because the sclera came down further — see the
// `sclera` field on `SkinTone`, which is now per complexion.
const IRIS_COLORS = [0x33241a, 0x241810, 0x3d4a44, 0x4a5c66, 0x5a4528];

// ============================================================
// Geometry toolkit
// ============================================================

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
};
/** Anisotropic gaussian, evaluated on a unit direction. The face is all of these. */
const bump = (dx: number, dy: number, dz: number, sx: number, sy: number, sz: number) =>
  Math.exp(-((dx * dx) / (sx * sx) + (dy * dy) / (sy * sy) + (dz * dz) / (sz * sz)));

/**
 * Deterministic per-warrior noise. Integer in, unit float out — no state, so the
 * same seed builds the same man on the capture box and on a phone, which is the
 * only reason an A/B against `art/shots/baseline` means anything.
 */
function hash(seed: number, salt: number): number {
  let h = (seed * 374761393 + salt * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Symmetric jitter: `span(seed, salt, 0.4)` lands in ±0.4. */
const span = (seed: number, salt: number, amount: number) => (hash(seed, salt) * 2 - 1) * amount;

/**
 * Latin-square pick over `n` choices: every run of `n` consecutive seeds covers
 * all `n` values, and the run's starting point is hashed so consecutive blocks do
 * not repeat the same order. Uniform sampling is only uniform in the limit, and
 * the sample that matters here is eight warriors on one field — where a fair coin
 * happily hands four of them the same complexion, which is the exact "one man
 * cloned" read this variation exists to break.
 */
const stratify = (seed: number, salt: number, n: number) =>
  (Math.floor(hash(Math.floor(seed / n), salt) * n) + (seed % n)) % n;

function xf(
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0,
  sx = 1, sy = 1, sz = 1,
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
}

/**
 * A ring seam duplicates its first vertex so the UV can wrap, which leaves
 * `computeVertexNormals` averaging half a neighbourhood on each copy — a hard
 * crease straight down every limb and garment. Averaging the pair back together
 * costs nothing and is the difference between a tapered arm and a folded one.
 */
function weldRingNormals(geo: THREE.BufferGeometry, rings: number[], seg: number): void {
  const nrm = geo.getAttribute("normal") as THREE.BufferAttribute;
  for (const base of rings) {
    const a = base;
    const b = base + seg;
    const nx = (nrm.getX(a) + nrm.getX(b)) * 0.5;
    const ny = (nrm.getY(a) + nrm.getY(b)) * 0.5;
    const nz = (nrm.getZ(a) + nrm.getZ(b)) * 0.5;
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(a, nx / l, ny / l, nz / l);
    nrm.setXYZ(b, nx / l, ny / l, nz / l);
  }
  nrm.needsUpdate = true;
}

function finish(pos: number[], uv: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** One cross-section of a swept shell: half-width in X, half-depth in Z. */
interface Station { y: number; hw: number; hd: number; z?: number }

interface ShellOptions {
  /**
   * Superellipse exponent. 2 is a plain ellipse (limbs, necks); 2.4 squares the
   * corners off just enough for a chest to read as a ribcage rather than a pipe;
   * 1 collapses to a rhombus, which is exactly a blade's lenticular section.
   */
  power?: number;
  /**
   * Wall thickness. Builds the inside of the garment as well and closes both
   * ends into a rim, so a hem is an edge you can see rather than a paper cut.
   */
  wall?: number;
  capTop?: boolean;
  capBottom?: boolean;
  /**
   * Rolls the ring's sampling round by a fraction of a step, so no vertex lands
   * exactly on the ±hw extremes.
   *
   * This exists for one defect and it is worth naming. A section with
   * `power < 2` closes to a mathematical point at ±hw, and with the default
   * phase there is a vertex sitting on that point — so a sword's cutting edge is
   * a silhouette of literally zero width, two faces meeting along a line with
   * nothing between them. A rasteriser cannot hold that: the edge alternates
   * between covering and missing a pixel centre down its length, and the post
   * chain's fringing paints the misses red. That is the 1 px speckle the second
   * critic panel logged along the spear and sword edges.
   *
   * At phase 0.5 the two vertices nearest the edge straddle it instead, leaving a
   * land a few tenths of a millimetre deep — invisible as width, and the
   * difference between an edge that holds still and one that crawls. The blade's
   * width has to be scaled back up to compensate; `bladeSection` does that.
   */
  phase?: number;
}

/**
 * Sweeps a superelliptical section through a list of stations. Torsos, mail,
 * tunics, thighs, forearms, necks, blades and axe hafts are all this function.
 */
function shell(stations: Station[], seg: number, opts: ShellOptions = {}): THREE.BufferGeometry {
  const k = 2 / (opts.power ?? 2);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rings: number[] = [];
  const n = stations.length;
  const yTop = stations[0].y;
  const yBot = stations[n - 1].y;
  const span = Math.abs(yTop - yBot) || 1;

  const phase = opts.phase ?? 0;
  const ring = (st: Station, inset: number): number => {
    const base = pos.length / 3;
    const hw = Math.max(2e-4, st.hw - inset);
    const hd = Math.max(2e-4, st.hd - inset);
    const v = 1 - (yTop - st.y) / span;
    for (let i = 0; i <= seg; i++) {
      const a = ((i + phase) / seg) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(
        hw * Math.sign(c) * Math.pow(Math.abs(c), k),
        st.y,
        (st.z ?? 0) + hd * Math.sign(s) * Math.pow(Math.abs(s), k),
      );
      uv.push(i / seg, v);
    }
    rings.push(base);
    return base;
  };

  const outer: number[] = stations.map((st) => ring(st, 0));
  for (let r = 0; r < n - 1; r++) {
    const t = outer[r];
    const b = outer[r + 1];
    for (let i = 0; i < seg; i++) {
      idx.push(t + i, b + i + 1, b + i, t + i, t + i + 1, b + i + 1);
    }
  }

  if (opts.wall) {
    const inner: number[] = stations.map((st) => ring(st, opts.wall as number));
    for (let r = 0; r < n - 1; r++) {
      const t = inner[r];
      const b = inner[r + 1];
      for (let i = 0; i < seg; i++) {
        idx.push(t + i, b + i, b + i + 1, t + i, b + i + 1, t + i + 1);
      }
    }
    const ob = outer[n - 1];
    const ib = inner[n - 1];
    for (let i = 0; i < seg; i++) {
      idx.push(ob + i, ob + i + 1, ib + i + 1, ob + i, ib + i + 1, ib + i);
    }
    const ot = outer[0];
    const it = inner[0];
    for (let i = 0; i < seg; i++) {
      idx.push(ot + i, it + i + 1, ot + i + 1, ot + i, it + i, it + i + 1);
    }
  }

  if (opts.capTop) {
    const c = pos.length / 3;
    pos.push(0, yTop, stations[0].z ?? 0);
    uv.push(0.5, 1);
    const t = outer[0];
    for (let i = 0; i < seg; i++) idx.push(c, t + i + 1, t + i);
  }
  if (opts.capBottom) {
    const c = pos.length / 3;
    pos.push(0, yBot, stations[n - 1].z ?? 0);
    uv.push(0.5, 0);
    const b = outer[n - 1];
    for (let i = 0; i < seg; i++) idx.push(c, b + i, b + i + 1);
  }

  const g = finish(pos, uv, idx);
  weldRingNormals(g, rings, seg);
  return g;
}

/**
 * A two-sided parametric sheet with real thickness — cloaks, hair, beards, helm
 * bowls, war paint. `outer` and `inner` are the same surface offset along its
 * own normal; the four rim strips between them are what stop a cloak from
 * vanishing the moment the camera gets behind it.
 *
 * Those rim strips are also this file's most reliable source of defects, and the
 * rule is worth stating once here rather than rediscovering it a fifth time. A
 * rim strip's normal points *along* the sheet, not out of it — so at a boundary
 * in silhouette it faces the camera and the key squarely while the sheet either
 * side of it does not, and it renders as a hard line of a completely different
 * value. Under about two pixels wide that line cannot be resolved: it flickers
 * between covering and missing pixel centres, and the post chain's chromatic
 * aberration paints the misses red. Every "1 px red speckle" the second panel
 * logged — cloak hem, war paint, face tones, the beard's lower edge — is that
 * one mechanism.
 *
 * So a boundary is safe in exactly two states: buried (the sheet's lift falls to
 * nothing there, so the strip is inside the surface underneath) or *thick enough
 * to shade*, several pixels across at the distance it is seen from. Anything in
 * between stipples. Callers below are written to land in one state or the other
 * and say which.
 */
function patch(opts: {
  nu: number;
  nv: number;
  wrapU?: boolean;
  outer(u: number, v: number, out: THREE.Vector3): void;
  inner(u: number, v: number, out: THREE.Vector3): void;
}): THREE.BufferGeometry {
  const { nu, nv } = opts;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const tmp = new THREE.Vector3();
  const stride = nu + 1;
  const count = stride * (nv + 1);

  const grid = (fn: (u: number, v: number, out: THREE.Vector3) => void) => {
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        fn(i / nu, j / nv, tmp);
        pos.push(tmp.x, tmp.y, tmp.z);
        uv.push(i / nu, j / nv);
      }
    }
  };
  grid(opts.outer);
  grid(opts.inner);

  const O = (i: number, j: number) => j * stride + i;
  const I = (i: number, j: number) => count + j * stride + i;

  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      idx.push(O(i, j), O(i + 1, j), O(i + 1, j + 1), O(i, j), O(i + 1, j + 1), O(i, j + 1));
      idx.push(I(i, j), I(i + 1, j + 1), I(i + 1, j), I(i, j), I(i, j + 1), I(i + 1, j + 1));
    }
  }
  // v1 rim faces along +v, v0 rim the other way.
  for (let i = 0; i < nu; i++) {
    idx.push(O(i, nv), O(i + 1, nv), I(i + 1, nv), O(i, nv), I(i + 1, nv), I(i, nv));
    idx.push(O(i, 0), I(i + 1, 0), O(i + 1, 0), O(i, 0), I(i, 0), I(i + 1, 0));
  }
  if (!opts.wrapU) {
    for (let j = 0; j < nv; j++) {
      idx.push(O(0, j), O(0, j + 1), I(0, j + 1), O(0, j), I(0, j + 1), I(0, j));
      idx.push(O(nu, j), I(nu, j + 1), O(nu, j + 1), O(nu, j), I(nu, j), I(nu, j + 1));
    }
  }
  return finish(pos, uv, idx);
}

/**
 * A closed outline given a lens cross-section: full width at the centre, inset
 * at both faces. Axe heads, spear blades and shield bosses are cut this way, so
 * the cutting edge thins out on its own instead of ending in a slab.
 */
function lensPrism(outline: Array<[number, number]>, thickness: number, inset: number): THREE.BufferGeometry {
  const n = outline.length;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of outline) { cx += x; cy += y; }
  cx /= n; cy /= n;

  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const ringAt = (z: number, k: number): number => {
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const [x, y] = outline[i];
      pos.push(cx + (x - cx) * k, cy + (y - cy) * k, z);
      uv.push(i / n, (z / thickness) + 0.5);
    }
    return base;
  };
  const shrink = 1 - inset;
  const back = ringAt(-thickness * 0.5, shrink);
  const mid = ringAt(0, 1);
  const front = ringAt(thickness * 0.5, shrink);

  const band = (a: number, b: number) => {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      idx.push(a + i, b + j, b + i, a + i, a + j, b + j);
    }
  };
  band(back, mid);
  band(mid, front);

  const fan = (base: number, z: number, flip: boolean) => {
    const c = pos.length / 3;
    pos.push(cx, cy, z);
    uv.push(0.5, 0.5);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (flip) idx.push(c, base + j, base + i);
      else idx.push(c, base + i, base + j);
    }
  };
  fan(front, thickness * 0.5, false);
  fan(back, -thickness * 0.5, true);

  return finish(pos, uv, idx);
}

/**
 * Rewrites a geometry's UVs in place: scale v, then offset both axes.
 *
 * For the substances outside `WORLD_TILE` — `oak` on the shield is the one that
 * matters — the mesh's own UV attribute is the only thing deciding where a
 * texture lands and how big it is, and `BoxGeometry` hands every face the same
 * 0..1 whatever size that face is. This is the lever for both the phase and the
 * density, and it costs one pass over the attribute at build time.
 *
 * `sv` scales about v = 0 rather than about the centre, so a run of boards
 * normalised to a common tile still starts its grain from a common datum and
 * `dv` remains a meaningful phase.
 */
function retile(geo: THREE.BufferGeometry, du: number, dv: number, sv = 1): THREE.BufferGeometry {
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) + du, uv.getY(i) * sv + dv);
  }
  uv.needsUpdate = true;
  return geo;
}

// ---- primitive shorthands, so the build code reads as anatomy ----
const ball = (r: number, s = 10) => new THREE.SphereGeometry(r, s, Math.max(4, Math.round(s * 0.6)));
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const rod = (rTop: number, rBot: number, h: number, s = 8) => new THREE.CylinderGeometry(rTop, rBot, h, s);
const ring = (r: number, tube: number, s = 6, t = 16) => new THREE.TorusGeometry(r, tube, s, t);

// ============================================================
// Emissive discipline
// ============================================================
//
// A bare emissive is the only primitive in this file that can fail the bar on its
// own, and it has now done it three times in three different colours: the hall
// doorway's orange quad, the warden's brass lace diamond, and — in
// `art/shots/v7/lineup.png` — the runekeeper's amulet, a 30 mm `runeGlow` bead
// drawing a five-pixel white square on his chest.
//
// The mechanism is the same every time and it is not the colour. `runeGlow` runs
// its blue channel at ~5.4 linear against a bloom threshold of 5.0, which is
// exactly where materials.ts wants it for a metre of carved runestone twenty
// metres off. On a bead whose entire footprint is five pixels, every one of those
// pixels is over the clip — so what reaches the frame is the primitive's
// *silhouette* at flat white, and the silhouette of an eight-segment sphere at
// five pixels is a square. Lowering the intensity would break the surface the
// number was tuned on; raising the segment count only makes a rounder white blob.
//
// What actually fixes it is that the edge of an emissive must not be as hot as
// its middle. Give the substance a field that falls to a dark matrix at the
// border of every face it dresses and no primitive wearing it can present a flat
// lit edge — at any size, on any geometry, in any preset.
//
// So it is enforced rather than remembered. `Part.add` is the one door every
// primitive in this file passes through — body, kit, weapons, the armoury
// preview's mannequin — and it substitutes a shaped clone for anything that
// arrives emitting with nothing to shape it. A future call site cannot bring the
// fault back by writing the same line that caused it three times.

/**
 * The field an emissive substance is cut into: a dark matrix with one hot stroke
 * through the middle of every face, reaching the matrix exactly at the border.
 *
 * Flat-topped rather than peaked, and that is the number that took two tries to
 * get right. A falloff that starts at the centre puts its own peak wherever the
 * geometry's u = 0.5 happens to land — which on `SphereGeometry` is the meridian
 * *opposite* the one three's UVs face at u = 0.25, so the amulet came out dark on
 * the side the camera sees and hot on the side buried in the robe. Held at full
 * across the middle 38% and spent entirely in the outer band, the field is 0.9 or
 * better anywhere a bead's lit cap can land and reaches the matrix only where a
 * face actually ends.
 *
 * That is also why a map can only ever be half of this. A sphere's silhouette is
 * a different great circle for every view, so no static field can darken it from
 * all angles; the sphere on the runekeeper's chest is handled by *setting* it, in
 * a bezel that claws over its rim. What the field is for is every flat-faced
 * primitive in the file — belt runes, wrist runes, a dagger's channel — where the
 * face's own border is a fixed place in UV and can be taken to nothing there.
 *
 * One tile serves as both albedo and emissive. That is not thrift: the stroke
 * that lights is the stroke that is cut, so the part reads as a dark stone with a
 * rune glowing out of it rather than as an untextured lozenge that happens to be
 * bright. §2 of the bar has no exemption for small surfaces.
 */
const GLOW_MATRIX = 0.13;
const GLOW_SHOULDER = 0.62;
let glowField: THREE.DataTexture | null = null;
function glowCarving(): THREE.DataTexture {
  if (glowField) return glowField;
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = ((x + 0.5) / N) * 2 - 1;
      const v = ((y + 0.5) / N) * 2 - 1;
      const t = clamp01((1 - Math.hypot(u, v)) / GLOW_SHOULDER);
      const a = t * t * (3 - 2 * t);
      const b = Math.round(255 * mix(GLOW_MATRIX, 1, a));
      const i = (y * N + x) * 4;
      data[i] = b;
      data[i + 1] = b;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  // Authored in the space it is looked at in, and tagged so, because it is read
  // as a colour map on both channels it feeds.
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  glowField = tex;
  return tex;
}

const UNLIT = new THREE.Color(0, 0, 0);

/**
 * Keyed on the material that came in, so one library still yields one program and
 * one merged slot however many warriors ask for it — `Part` groups by material
 * identity, and a fresh clone per call would fork every rune on the field into
 * its own draw call. Weak, so the clone dies with the library that fathered it;
 * the caller that disposes the source is not expected to know this exists.
 */
const SHAPED_GLOW = new WeakMap<THREE.Material, THREE.Material>();

/** Nothing emits inside a warrior without a field to shape it. See above. */
function shapedGlow(mat: THREE.Material): THREE.Material {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return mat;
  if (mat.emissiveMap || mat.alphaMap) return mat;
  if (mat.emissiveIntensity <= 0 || mat.emissive.equals(UNLIT)) return mat;
  let safe = SHAPED_GLOW.get(mat);
  if (!safe) {
    const clone = mat.clone();
    clone.emissiveMap = glowCarving();
    if (!clone.map) clone.map = glowCarving();
    clone.name = `${mat.name || "glow"}+carved`;
    clone.needsUpdate = true;
    safe = clone;
    SHAPED_GLOW.set(mat, safe);
  }
  return safe;
}

// ============================================================
// Assembly — one merged mesh per substance per moving part
// ============================================================

/**
 * Collects primitives against the material they wear, then hands back one merged
 * geometry per material. A pauldron, its rim, its rivets and the mail under it
 * are four shapes and one draw call.
 */
/**
 * Materials that read a per-vertex colour, and therefore materials every
 * geometry wearing them must carry one for.
 *
 * three only samples a colour attribute if the material says `vertexColors`, and
 * a mesh with the flag set and no attribute renders black — so the flag and the
 * attribute have to travel together. `Part.add` puts a white one on anything
 * that arrives without, which makes the invariant impossible to lose at a call
 * site: an ear, a lid or a lip band drops into the head's merge with a neutral
 * colour and `Part.paint` overwrites the ones that want a field.
 *
 * It also keeps `mergeGeometries` working. That call refuses a list whose
 * attribute sets disagree, and the fallback is one draw call per piece — so a
 * single unpainted torus would quietly cost the head eight extra draws.
 */
const VERTEX_TINTED = new WeakSet<THREE.Material>();

class Part {
  private slots = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geo: THREE.BufferGeometry, mat: THREE.Material, transform?: THREE.Matrix4): this {
    if (transform) geo.applyMatrix4(transform);
    // The emissive invariant is enforced here, and not at the call sites, because
    // the call sites are where it keeps being lost.
    const wear = shapedGlow(mat);
    if (VERTEX_TINTED.has(wear) && !geo.getAttribute("color")) {
      const n = geo.getAttribute("position").count;
      geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    }
    const list = this.slots.get(wear);
    if (list) list.push(geo);
    else this.slots.set(wear, [geo]);
    return this;
  }

  /**
   * Writes a colour field onto every geometry wearing one of `mats`.
   *
   * This is how the face gets its tonal map, and the reason it is a *field* and
   * not a set of patches is written up over `faceComplexion`. Called after the
   * pieces are in, so the positions handed to `f` are already in the part's own
   * space and one function can serve the skull, the lids, the lips and the ears
   * without any of them knowing where they sit.
   */
  paint(mats: readonly THREE.Material[], f: (x: number, y: number, z: number, out: THREE.Color) => void): this {
    const c = new THREE.Color();
    for (const mat of mats) {
      const list = this.slots.get(shapedGlow(mat));
      if (!list) continue;
      for (const geo of list) {
        const pos = geo.getAttribute("position") as THREE.BufferAttribute;
        const col = geo.getAttribute("color") as THREE.BufferAttribute;
        if (!col) continue;
        for (let i = 0; i < pos.count; i++) {
          f(pos.getX(i), pos.getY(i), pos.getZ(i), c);
          col.setXYZ(i, c.r, c.g, c.b);
        }
        col.needsUpdate = true;
      }
    }
    return this;
  }

  /** Same shape on both sides of the body, mirrored rather than rebuilt. */
  addMirrored(make: (side: number) => THREE.BufferGeometry, mat: THREE.Material, place: (side: number) => THREE.Matrix4): this {
    for (const side of [-1, 1]) this.add(make(side), mat, place(side));
    return this;
  }

  merge(): Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }> {
    const out: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }> = [];
    for (const [mat, list] of this.slots) {
      if (list.length === 1) {
        out.push({ geo: list[0], mat });
        continue;
      }
      const merged = mergeGeometries(list, false);
      if (merged) {
        for (const g of list) g.dispose();
        out.push({ geo: merged, mat });
      } else {
        // Only reachable if a primitive turns up with a stray attribute; a few
        // extra draw calls beat a warrior that fails to build.
        for (const g of list) out.push({ geo: g, mat });
      }
    }
    return out;
  }
}

type MergedPart = Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }>;

/**
 * Identical loadouts share their merged geometry. The count is per *mesh*, which
 * is exactly the granularity anim.ts disposes at — it walks a dead warrior and
 * calls `geometry.dispose()` once per mesh — so the release below lands when the
 * last body wearing this kit leaves the field and not a moment before.
 */
const RIG_CACHE = new Map<string, Map<string, MergedPart>>();
const USES = new WeakMap<THREE.BufferGeometry, number>();
const LIB_IDS = new WeakMap<CharacterMaterials, string>();
let libSeq = 0;

function libraryId(m: CharacterMaterials): string {
  let id = LIB_IDS.get(m);
  if (!id) {
    id = `L${++libSeq}`;
    LIB_IDS.set(m, id);
  }
  return id;
}

function guard(geo: THREE.BufferGeometry, signature: string): void {
  const real = THREE.BufferGeometry.prototype.dispose;
  geo.dispose = function (this: THREE.BufferGeometry) {
    const n = (USES.get(geo) ?? 1) - 1;
    USES.set(geo, n);
    if (n > 0) return;
    RIG_CACHE.delete(signature);
    real.call(this);
  };
}

// ============================================================
// The skeleton
// ============================================================

/**
 * Per-class build. This is the first thing the eye reads at gameplay distance —
 * before kit, before colour — so the spread is deliberately wider than life:
 * the berserker is a head-and-shoulders bigger animal than the runekeeper.
 *
 * The spread used to be too narrow to survive being looked at. Both critic
 * panels scored class silhouette a fail on the same evidence: in
 * `art/shots/v6/lineup.png` the four warriors are one body, one helmet shell and
 * one torso mass, and the only thing telling them apart is cloak colour and what
 * is in the right hand. At shoulder 1.0 / 1.07 / 1.12 the widest of them is 12%
 * across the narrowest, which is under two pixels at lineup distance — a
 * difference that exists in the numbers and nowhere in the frame.
 *
 * Three of the four fields below are new, and they are the three that change an
 * *outline* rather than a size:
 *
 *   `hem`    where the outer garment stops, as a fraction of stature. Loudest
 *            cue on the roster — a hauberk to the knee and a robe to the shin
 *            are different shapes at any distance, in any light, from behind.
 *   `bowl`   how the helm is worn: a deep round bowl pulled down over the ears,
 *            a tall combed one, or a cap sitting on the crown. Read against
 *            `Y_BROW`, so it moves the whole helm/face boundary together.
 *   `gorget` how much of the throat the class's neck kit swallows, 0 to 1. The
 *            huscarl disappears into mail; the berserker shows a bare neck.
 */
interface BuildTrait {
  stature: number; shoulder: number; bulk: number; limb: number;
  hem: number; bowl: number; gorget: number;
}

const BUILD: Record<WarriorClass, BuildTrait> = {
  // Short, immensely broad, mailed to the knee, head sunk into a coif. Reads as
  // a wall from any angle.
  huscarl: { stature: 1.005, shoulder: 1.15, bulk: 1.16, limb: 1.02, hem: 0.365, bowl: 1.12, gorget: 1.0 },
  // The soldier: upright, square, average everything, hem at mid-thigh and a
  // combed helm — the only one of the four with a hard vertical in his outline.
  warden: { stature: 1.005, shoulder: 1.02, bulk: 0.98, limb: 1.02, hem: 0.415, bowl: 0.94, gorget: 0.45 },
  // Small and narrow inside a robe to the shin. The one silhouette with no gap
  // between the legs and no shoulder line at all.
  runekeeper: { stature: 0.945, shoulder: 0.86, bulk: 0.88, limb: 0.93, hem: 0.235, bowl: 1.0, gorget: 0.0 },
  // Tall, rangy, top-heavy: long bare limbs, a fur ruff wider than his own
  // shoulders, a cap worn high, and nothing below the belt but breeches.
  berserker: { stature: 1.065, shoulder: 1.21, bulk: 1.11, limb: 1.15, hem: 0.505, bowl: 0.76, gorget: 0.0 },
};

/**
 * Every landmark on the body, in metres. The ratios are human: crown at 7.4
 * head-heights, arm span equal to stature, shoulders at 0.29 of it, knee at
 * 0.27. Nothing below this line invents its own height.
 */
interface Skeleton {
  crown: number; chin: number; headY: number; headR: { x: number; y: number; z: number };
  /** Atlas — the head pivot, and the height everything on the skull is measured from. */
  neckTop: number;
  /**
   * Cervicale: where the throat leaves the trapezius, and therefore where every
   * neck opening in the game is hung. Its own landmark rather than `neckBase +
   * 0.145` in six places, because those six places disagreed by 15 mm and the
   * collar line is the one measurement the head/neck read lives or dies on.
   */
  neckRoot: number;
  /** Base of the yoke — the anchor for the ruff and the shoulder mass, not the collar. */
  neckBase: number;
  /**
   * The neck's section, and it is not a circle. A human neck is deeper than it is
   * wide — throat to nape carries the airway, the spine and the cervical curve,
   * while side to side is two strap muscles — and sweeping it as a cylinder is
   * half of why the heads read as balanced on a pole.
   */
  neckHW: number; neckHD: number;
  shoulderY: number; shoulderX: number;
  chestY: number; waistY: number; beltY: number; hipY: number; hipX: number;
  /**
   * Crotch height — the bottom of the pelvis, and the landmark this skeleton did
   * not have. Without it the torso stopped 50 mm below the hip joint on a flat
   * open ring and the two thigh shells rose into nothing, so the body had a waist
   * and a pair of legs and no mass between them. Life is 0.47 of stature.
   */
  crotchY: number;
  /** Where the class's outer garment stops. See `BuildTrait.hem`. */
  hemY: number;
  kneeY: number; ankleY: number;
  upperArm: number; foreArm: number; gripDrop: number;
  chestHW: number; chestHD: number; waistHW: number; waistHD: number;
  hipHW: number; hipHD: number; yokeHW: number; yokeHD: number;
  armR: [number, number, number, number]; // shoulder, elbow-top, elbow-bottom, wrist
  legR: [number, number, number, number];  // hip, knee-top, calf, ankle
}

function skeleton(b: BuildTrait): Skeleton {
  const s = b.stature;
  const w = b.bulk;
  const l = b.limb;
  return {
    crown: 1.965 * s,
    chin: 1.696 * s,
    // Set so the crown lands on `crown` exactly: the head's own surface reaches
    // `headR.y` above this and `headR.y + MANDIBLE` below it.
    headY: 1.8445 * s,
    // The cranium is a near-sphere and the jaw is hung below it by the surface
    // field, rather than the whole head being one tall ellipsoid. Stretching a
    // sphere to 0.264 of height gives the crown a curvature radius of 52 mm and
    // the warrior a hard-boiled egg for a skull; this splits 0.115 of braincase
    // from 0.145 of face and lands the same 7.5-head silhouette.
    //
    // Fourth pass on this and the last one that should be needed, because the
    // head was only ever half the problem. 260 mm of head on 1965 mm of man is
    // 7.56 heads — inside the human band and *smaller than the heroic
    // proportion an action game actually draws*, which is 7.0 to 7.3. At 269 mm
    // the figure is 7.30 heads: still nobody's caricature, and 9 mm is the
    // difference between a head that has to fight the shoulders for the eye and
    // one that wins. Breadth goes with it, to 195 mm.
    //
    // The other half was never the head at all — see `shoulderY`. A head can be
    // exactly right and still read small if there is 183 mm of neck under it.
    // Breadth is 191 mm at the base ellipsoid and about 205 over the parietal
    // eminence the field now carries — 0.75 of head height, against a life value
    // near 0.66. Deliberately past life and no further: the extra reads as a
    // blunt Saxon skull at 0.75 and as a bobble at 0.80, and the head is being
    // asked to hold its own against a 660 mm shoulder line.
    headR: { x: 0.0955 * s, y: 0.1205 * s, z: 0.1135 * s },
    neckTop: 1.66 * s,
    // The collar line, and it is *not* an anatomical cervicale: C7 sits level
    // with the top of the shoulder, and a mail standing collar rides about 40 mm
    // above that. Held at 0.839 of stature while the shoulder came up 40 mm, so
    // the throat the frame shows is 70 mm under a 269 mm head — a hair over a
    // quarter, against a bare-necked life value of 0.38.
    neckRoot: 1.648 * s,
    neckBase: 1.50 * s,
    // 141 mm across, 152 mm front to back, and the section is the whole of note 4.
    //
    // The note reads "the neck is too long AND too thin", and the measurement says
    // it is one fault and not two. Menton to the shoulder joint is 134 mm against
    // a head 271 tall — 0.49, where life is 0.63. This neck is already a fifth
    // SHORTER than a man's. Taking more length out of it, which is what the note
    // asks for read literally, is the sixth overshoot in this file's history and
    // would have put the chin on the collarbone.
    //
    // What it is, is thin. Breadth against the jaw immediately above it measured
    // 0.74 where life is about 1.05 and a fighter is higher — and a column that
    // narrow reads long whatever its actual length, which is why two separate
    // observations came out of one defect. 141 mm across and 152 deep puts it at
    // 0.88 of the bigonial breadth (itself coming down this pass) and about 46 cm
    // round, which is a man who fights for a living.
    //
    // The shape is unchanged and still right: deeper than it is wide, because
    // throat to nape carries the airway, the spine and the cervical curve while
    // side to side is two strap muscles.
    // Note 4, and the silhouette gate's S5: the neck must be at least as broad as
    // the jaw directly above it, because that is the comparison a viewer actually
    // makes. Measured at 0.0705 it ran 0.86 of the bigonial breadth and the head
    // sat on a stalk. This is +10%, and it costs nothing anywhere else — the
    // trapezius flare below comes down to compensate so the shoulders do not grow.
    // The bulk sensitivity comes down from 0.6 to 0.15 as well as the base going
    // up. A 0.6 coefficient spread the neck over 136-176 mm across the roster
    // while the jaw above it only moved 150-169, so the lean classes were failing
    // S5 on class bulk alone — a runekeeper's head sat on a stalk and a
    // berserker's did not, which is not art direction, it is an uncontrolled term.
    neckHW: 0.0796 * s * mix(1, w, 0.10),
    neckHD: 0.0845 * s * mix(1, w, 0.10),
    // THE proportion defect, and the one that made the figure read at 8.5–9
    // heads while its own skeleton computed 7.5.
    //
    // Measured off the old rig: menton at 1.705, shoulder joint at 1.522 — 183 mm
    // of neck, which is 0.70 head-heights. Life is 0.39 (chin 0.870 of stature,
    // shoulder 0.818). So 80 mm of the man was neck that should have been torso,
    // and the eye does not read a long neck as a long neck: it reads it as a
    // small head on a long body, which is exactly what the owner reported three
    // times and both panels scored. It also stole those 80 mm from the
    // shoulder-to-hip span, so the *legs* took over half the figure and read
    // "enormously long" against a torso that had nothing left.
    //
    // 1.562 is 0.795 of stature — the glenohumeral centre under an acromion at
    // 0.818, which is where the deltoid cap now crests. The visible neck comes to
    // 134 mm, 0.50 of a head. The arms below grow by the same 40 mm so the grip
    // lands at 0.865 exactly as it did: every carry offset in `anim.ts` is tuned
    // against that point, and `ELBOW_ALONG` is `upperArm / (arm + grip)`, which
    // stays at 0.486 against its constant of 0.487. Nothing downstream moves
    // except the shield, which rises 40 mm on an arm it is already mounted too
    // high on — see `docs/OPEN-DEFECTS.md`.
    shoulderY: 1.562 * s,
    shoulderX: 0.198 * s * b.shoulder,
    chestY: 1.43 * s,
    waistY: 1.205 * s,
    beltY: 1.163 * s,
    hipY: 1.02 * s,
    hipX: 0.106 * s * mix(1, w, 0.5),
    crotchY: 0.925 * s,
    hemY: 1.965 * s * b.hem,
    kneeY: 0.53 * s,
    ankleY: 0.092 * s,
    // 12% longer, both segments, which is what the shoulder rise has to be paid
    // for with. Against life: elbow lands at 0.622 of stature (0.630), wrist at
    // 0.478 (0.485). They were 0.594 and 0.478 — the wrist was right and
    // everything above it was compressed, which is why the error was invisible
    // until somebody measured the *neck* instead of the hand.
    upperArm: 0.339 * s,
    foreArm: 0.283 * s,
    gripDrop: 0.075 * s,
    // A ribcage is narrower than the shoulder line that hangs off it. At 0.20
    // the chest was wider than the shoulder joint plus half a humerus, so both
    // upper arms lived inside the torso and the body read as one slab with two
    // forearms below it. 0.176 puts the arm back outside the mail where it can
    // be seen, and gives the V from shoulder to waist that says "fighter".
    chestHW: 0.176 * s * w,
    chestHD: 0.128 * s * w,
    waistHW: 0.152 * s * w,
    waistHD: 0.107 * s * w,
    // The pelvis, and it is 8 mm wider and 8 mm deeper than the waist above it
    // rather than 16 and 9. A hip that is barely broader than a waist has no
    // mass: the torso read as a straight tube from armpit to hem in every
    // capture, and the two thighs came out of the bottom of it as separate
    // pipes. Every garment is swept off these numbers, so this is where a skirt
    // gets its swing from as well.
    hipHW: 0.177 * s * w,
    hipHD: 0.125 * s * w,
    // Widened with the trapezius it feeds. At 0.138 the yoke had to fan 38 mm
    // out to the chest section in 18 mm of drop, which is a 65° shelf either side
    // of the neck rather than a shoulder.
    yokeHW: 0.151 * s * w,
    yokeHD: 0.106 * s * w,
    armR: [0.062 * l, 0.05 * l, 0.053 * l, 0.033 * l],
    legR: [0.098 * l, 0.068 * l, 0.079 * l, 0.043 * l],
  };
}

/**
 * How far the sole reaches in front of and behind the leg's own axis.
 *
 * Exported because it is the one thing about a warrior's geometry that a *poser*
 * has to know and currently does not. `anim.ts`'s `settleOnFeet` treats each foot
 * as a point hanging `legLen` straight down from the hip, and that is exactly
 * true only while the leg is vertical. Measured off the built rig in the `stance`
 * framing — berserker, overhead, swing 0.45 — the lead leg carries 48° of total
 * pitch, which swings a sole reaching `FOOT_FWD` forward a further
 * `FOOT_FWD·sin48° = 128 mm` down: the front boot finishes 197 mm under the turf
 * and the trailing one hangs 236 mm over it. Neither foot in that frame is on the
 * ground, and a critic panel read the result as a hero with one leg.
 *
 * The solve wants the sole's lowest *corner*, not a point, and the trailing foot
 * wants an ankle to roll onto. Both belong in `anim.ts`; what belongs here is the
 * number, so that when the last is next reshaped the poser moves with it instead
 * of carrying a stale copy — the fate `ELBOW_ALONG` and `KNEE_ALONG` used to be
 * logged for, and which the two exports below now close.
 *
 * Not scaled by build: the whole roster wears one last, which is a simplification
 * the file has always made and the wrong pass to unmake.
 */
export const FOOT_FWD = 0.172;
export const FOOT_BACK = 0.073;

/**
 * Where the elbow and the knee sit along their limb, as a fraction of the whole
 * shoulder-to-fist and hip-to-sole span.
 *
 * `anim.ts` solves the arm and the new two-segment leg reach against these and
 * had been carrying its own literals, which is a silent breakage the first time
 * the proportion table moves — and it moved twice in the last three passes.
 * Measured off the skeleton rather than written down, so they cannot drift.
 *
 * One sample is enough for the whole roster: every term either ratio touches is
 * a bare multiple of stature, so build and limb-length traits divide out.
 */
const CANON = skeleton(BUILD.huscarl);
export const ELBOW_ALONG = CANON.upperArm / (CANON.upperArm + CANON.foreArm + CANON.gripDrop);
export const KNEE_ALONG = (CANON.hipY - CANON.kneeY) / CANON.hipY;
/**
 * The drop from the wrist station to the grip, on the same scale — what
 * `anim.ts` needs to find the gap between the forearm's cap and the knuckles
 * and cut a wrist into it. Same argument as the two above: the number belongs
 * where the skeleton is authored, not copied into the poser.
 */
export const GRIP_ALONG = CANON.gripDrop / (CANON.upperArm + CANON.foreArm + CANON.gripDrop);

// ============================================================
// Level of detail
// ============================================================

export type CharacterDetail = "high" | "medium" | "low";

interface Lod {
  body: number; limb: number;
  headU: number; headV: number;
  shellU: number; shellV: number;
  trim: boolean; fingers: boolean;
}

// The head's row count is a *sampling* decision, not a smoothness one, and
// getting that wrong is why two independent panels reported that this face has no
// nose, no eye socket, no lid and no brow when `faceSurface` has had all four in
// it for three passes.
//
// The field is a sum of gaussians written in the sampling latitude's sine. The
// ones that carry a face — the orbital margin, the columella undercut, the
// nostril, the alar crease, the oral fissure, the vermilion borders — are between
// 0.032 and 0.055 wide in that unit, because that is how wide they are on a head.
// At 24 rows the mesh puts a vertex every 0.124 of it near the face. So every one
// of those features was sampled two to four times *below* Nyquist: the mesh could
// not see them, and what came out was a smooth ball with two dark patches on it.
// The brow (0.105) and the socket (0.125) were the only terms wide enough to
// survive, which is exactly what the frame shows — some shading round the eyes and
// nothing else at all.
//
// 44 rows puts the spacing at 0.068 and brings everything except the tightest
// creases above the limit; those have been widened to meet it (see `faceSurface`).
// The cost is ~1000 vertices on **one** mesh per warrior — the head is a single
// merged geometry, it is shared by loadout and seed, and it is the only part of a
// warrior anybody looks at from a metre away. It is the cheapest fix in the file.
//
// THE ROW COUNT IS PINNED ACROSS THE TIERS, and that is the whole point of the
// paragraph above rather than an oversight in it. `medium` used to give the head
// 30×30 and `low` 14×10, both of them under the 44 rows this note exists to
// establish — and `detectTier` puts **every phone** on `medium` or below. So the
// face a modeller built has never once been rendered on the device most of this
// game's players hold: they got the smooth ball with two dark patches, which is
// exactly what the owner photographed and sent back.
//
// The head is therefore the one mesh whose tessellation is a *correctness*
// number and not a quality one. It is bought back out of `body` and `limb`,
// which are swept cylinders whose silhouettes are already round at eight sides —
// a rib fewer on a thigh is invisible at any distance, a row fewer on a nose is
// the nose. Measured per warrior, medium: head 961 → 1845 verts (+884), body and
// limbs −612, net +272 on a figure that carries about 9k. Low pays +796 on the
// head and gives back 430; the head is still a third of the budget it was on
// `high` and it now has a brow, a socket and a nostril in it.
const LOD: Record<CharacterDetail, Lod> = {
  high: { body: 18, limb: 12, headU: 40, headV: 44, shellU: 14, shellV: 8, trim: true, fingers: true },
  medium: { body: 12, limb: 8, headU: 40, headV: 44, shellU: 10, shellV: 6, trim: true, fingers: true },
  // Low drops ornament and tessellation. It does not drop a layer, a hem or a
  // class silhouette — those are art direction, and the bar says art direction
  // survives the tier. It no longer drops the face either: 30×30 is under the
  // Nyquist limit for the tightest creases, but it clears the brow, the socket,
  // the orbital margin, the nasal dorsum, the lip line and the mandible edge,
  // which is the difference between a head and an egg.
  low: { body: 8, limb: 6, headU: 30, headV: 30, shellU: 7, shellV: 4, trim: false, fingers: false },
};

// ============================================================
// The face
// ============================================================

/**
 * Where the features sit on the skull, in the surface field's own `y` — which is
 * the sine of the sampling latitude, +1 at the crown and −1 at the menton.
 *
 * These are written down because getting them wrong is what was actually wrong
 * with the face, and it was not obvious from any single number. Every feature
 * was in the top half of the head: the eyes at `y = +0.085`, which is 40% of the
 * way down from the crown where a human's are at 50%, the mouth at `y = −0.37`,
 * 61% down where a human's is at 73%. The brow-to-mouth block therefore occupied
 * the upper 46% of the face and the remaining 100 mm — over a third of the head —
 * was bare, unmodelled jaw. *That* is the "flat, pale, near-featureless vertical
 * panel" in `art/shots/v4/portrait.png`: not shallow relief, an empty plane. The
 * dark blob under it was the stubble patch laid over the empty plane.
 *
 * The fractions below are the classical canon, measured from the crown over the
 * head's full 269 mm: brow ridge 0.350, eye line 0.500, nose tip 0.552,
 * subnasale 0.600, lip line 0.720, gonion 0.755, chin front 0.875. They are
 * given in field-`y` rather than in fractions because the mapping is not linear —
 * `faceSurface` pulls the mandible down by up to `MANDIBLE` — so the conversion
 * is done once, here, by solving `py(y)` for each landmark.
 *
 * A correction to `docs/OPEN-DEFECTS.md`, because it cost half a day. That table
 * has the eye line at 60% of head height above the chin, the mouth at 39% and the
 * nose tip at 56%, and reads them as 35 mm of surplus lower face. Measured off
 * the mesh those numbers are *stale*: this build lands 50.0 / 28.0 / 44.8, which
 * is canon on the first and within a per-cent of it on the other two. The table
 * describes the layout before the rewrite these constants came out of, and its
 * "canon" column for the mouth and the nose looks to have been taken over the
 * *face* rather than over the head, which is why 22% and 33% do not agree with
 * any published set. The lower face is not long. The neck was — see `shoulderY`.
 *
 * They have all moved a little here anyway, because `headR.y` did.
 */
const Y_BROW = 0.219;
const Y_EYE = -0.116;
const Y_TIP = -0.231;
const Y_NOSE = -0.323;
const Y_LIP = -0.536;
const Y_CHIN = -0.796;
const Y_GONION = -0.596;

/**
 * How far the mandible is pulled below the braincase, in metres. Named because
 * the head's total height is `2 * headR.y + MANDIBLE` and three separate things
 * — the head-count, the landmark solve above, and the neck overlap — are all
 * derived from that sum.
 */
const MANDIBLE = 0.028;

/**
 * Field `y` to sampling latitude. Anything worn on the head is cut in radians of
 * latitude (`headWear`, the helm arcs, the hood rim, the beard's cheek line)
 * while the surface field is written in `y = sin(latitude)`, and mixing the two
 * up is how a helm ends up cut for a brow 30 mm from where the brow is. Every
 * garment edge below is therefore expressed as `lat(SOME_LANDMARK + offset)`.
 */
const lat = (y: number) => Math.asin(clamp01((y + 1) * 0.5) * 2 - 1);

/**
 * What makes this warrior's face his own. Every field is a multiplier on one term
 * of the surface field below, so a seed moves the *anatomy* rather than swapping
 * a preset: a heavy brow with a wide jaw is a different man from a narrow skull
 * with a long nose, and neither is a scaled copy of the other.
 *
 * Deliberately small in range. Past about ±12% on a skull axis the helm and hood
 * stop fitting, because they are swept off the same field — so the variation that
 * carries the read is in the *features*, where it is free.
 */
interface FaceTraits {
  wide: number; deep: number; tall: number;
  brow: number; deepSet: number;
  nose: number; bridge: number; nostril: number;
  cheek: number; gaunt: number;
  jaw: number; chin: number;
  eyeU: number; eyeV: number; eyeOpen: number;
  mouth: number; lip: number;
  /** Lateral drift on the midline features, in metres. A symmetric face is a mask. */
  asym: number;
  /**
   * The seed's ENTIRE authority over the sagittal profile, in millimetres on the
   * three landmarks the eye judges a head by from the side.
   *
   * This is the constraint the owner's brief asked for, and it is the reason a
   * seventh tuning pass is not needed: the profile can no longer be deformed,
   * only nudged. `nose: 1 + span(seed, 6, 0.16)` used to multiply a gaussian that
   * sat on top of four other gaussians, so a warrior who drew a high nose and a
   * set-back chin got the tip 73 mm in front of pogonion where life is 20. Two
   * millimetres on a table row cannot compound into anything, because the table
   * IS the outline — there is nothing underneath it to compound with.
   */
  pNose: number; pLip: number; pChin: number;
  tone: number; iris: number;
}

/**
 * `seed` is a warrior identity. An integer is the intended form — consecutive
 * integers are what the stratified picks below rely on — but a `hash01`-style
 * fraction is accepted and folded up to one, because that is the number `anim.ts`
 * already has to hand and a crash on a float would be a nasty surprise later.
 */
function faceTraits(raw: number): FaceTraits {
  const seed = Number.isInteger(raw) ? Math.abs(raw) : Math.abs(Math.round(raw * 4096));
  return {
    // Halved, and the reason is S5 rather than the face. The neck is a per-class
    // dimension and the jaw is a per-seed one, so every per-cent of spread on the
    // skull's width lands directly on `neckOverJaw` as a head that might or might
    // not sit on a stalk. +/-2% is still legible in a portrait; the identity was
    // never carried here anyway (see the note below).
    wide: 1 + span(seed, 1, 0.012),
    deep: 1 + span(seed, 2, 0.04),
    // ±5% on the head's height is ±13 mm, and against a fixed stature that swung
    // the figure from 6.99 heads to 7.63 across eight seeds — one man in eight
    // was a bobble and one was a pinhead, on a roster where four of them stand in
    // a row. ±3% holds the whole set inside the heroic band.
    tall: 1 + span(seed, 3, 0.024),
    // ---- and here is the caricature ----
    //
    // Everything below moves a piece of *bone*, and the spans were written as if
    // they moved a preset. ±55% on a brow ridge, ±40% on a nose and ±50% on a
    // chin do not produce a different man, they produce a different species: the
    // seeds compound, so the warrior who draws a high nose and a low chin gets
    // the tip 73 mm in front of pogonion where life is 20, and that is the
    // storybook witch in the owner's capture. Measured across the roster, the
    // beak metric ranged 31 → 73 mm — a 2.4× spread on the single feature the eye
    // lands on first.
    //
    // The identity variation does not live here and never did. It lives in the
    // complexion, the iris, the eye aperture, the mouth width, the asymmetry and
    // the kit — all of which are free, because none of them can make a face
    // inhuman. What these do is stop four men being one casting; ±20% on a 5 mm
    // landmark is a millimetre, which is legible in a portrait and invisible as a
    // deformity. That is the whole job.
    brow: 1 + span(seed, 4, 0.30),
    deepSet: 1 + span(seed, 5, 0.25),
    nose: 1 + span(seed, 6, 0.16),
    bridge: 1 + span(seed, 7, 0.25),
    nostril: 1 + span(seed, 8, 0.22),
    cheek: 1 + span(seed, 9, 0.28),
    gaunt: 1 + span(seed, 10, 0.32),
    jaw: 1 + span(seed, 11, 0.20),
    chin: 1 + span(seed, 12, 0.20),
    eyeU: 1 + span(seed, 13, 0.09),
    eyeV: span(seed, 14, 0.035),
    eyeOpen: 1 + span(seed, 15, 0.2),
    mouth: 1 + span(seed, 16, 0.16),
    lip: 1 + span(seed, 17, 0.45),
    asym: span(seed, 18, 0.0022),
    pNose: span(seed, 21, 2.0),
    pLip: span(seed, 22, 1.2),
    pChin: span(seed, 23, 1.5),
    tone: stratify(seed, 19, SKIN_TONES.length),
    iris: stratify(seed, 20, IRIS_COLORS.length),
  };
}

/**
 * A head, and the man wearing it. Bundled because everything on the skull —
 * skull, hair, beard, war paint, helm bowl, hood, eyes — has to be sampled off
 * the *same* field, and threading two arguments through every one of those calls
 * is how a helm ends up fitting a face it was not cut for.
 */
interface Skull {
  R: { x: number; y: number; z: number };
  F: FaceTraits;
  /**
   * The profile pin's lookup table, built on first use and then shared by every
   * one of the tens of thousands of samples that follow. See `pinTable`.
   */
  pin?: Float64Array;
}

// ============================================================
// THE PROFILE, AUTHORED AS AN OUTLINE
//
// Six passes have now failed on this head, and the previous one is the useful
// one: it built an anthropometric tape measure, every number came back near
// life, and the object got worse. That is not a slack tolerance. It is that a
// face was being made out of a sum of gaussians on a sphere, and a sum has no
// silhouette — you cannot ask it where its frontmost point is, so every pass
// pulled on one term, moved three others it did not intend, and satisfied its
// list while the outline drifted somewhere new.
//
// So the outline is no longer an emergent property. It is written down.
//
//   `SAGITTAL` is the profile of the face, landmark by landmark, in millimetres
//   in front of the glabella vertical. It is the curve a side-on camera draws,
//   and `faceSurface` PINS the midline to it: whatever the feature terms below
//   happen to sum to, a correction carries the midline onto this curve exactly.
//
// That inverts the failure. The nose is the frontmost point because the table
// says so and not because six bumps happened to add up that way; the lips sit
// behind the nose-to-chin chord because the table puts them there; and a seed
// can no longer make a beak, because the seed's variation is applied to the
// TABLE, inside a band of a millimetre or two, rather than to the amplitude of
// a gaussian where ±20% compounds with four others into a different species.
//
// What the feature terms still do — and it is most of the work — is the LOCAL
// relief and the lateral shape: the overhang under the brow, the alar creases,
// the width of a lip, the box of a chin, the socket the light falls into. None
// of that is on the midline, so none of it is cancelled. The pin only owns the
// one thing the eye judges a head by from the side, and that is the one thing
// six passes could not hold.
//
// Read crown-first. `y` is the field's own latitude sine.
// ============================================================

type Curve = ReadonlyArray<readonly [number, number]>;

/**
 * A C1 curve through control points, crown-first. Smoothstep between rows rather
 * than linear, because a linear join is a crease in the surface and a crease
 * across the face reads as the hard-edged plate this rewrite exists to delete.
 */
function curve(c: Curve, y: number): number {
  if (y >= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (y < c[i][0]) continue;
    const t = smooth(c[i - 1][0], c[i][0], y);
    return mix(c[i - 1][1], c[i][1], t);
  }
  return c[c.length - 1][1];
}

/**
 * The sagittal profile: millimetres in front of the glabella vertical.
 *
 * Every one of the silhouette gate's assertions is a property of THIS TABLE, and
 * that is the point — they can be checked by reading rather than by rendering:
 *
 *   the frontmost row is the PRONASALE, and it leads the whole lip block by
 *   16 mm, so the frontmost point of the face is the nose (S1);
 *   the three lip rows all sit 2–5 mm behind the chord from pronasale to
 *   pogonion, which is where a man's lips sit against Ricketts' E-line (S2);
 *   pogonion is 2 mm IN FRONT of the glabella vertical, so the chin cannot
 *   recede behind the brow (S3).
 *
 * The gnathion and menton rows run back under the jaw rather than continuing
 * forward, which is what gives the underside of the mandible a direction to turn
 * away in — see the gonial mass below.
 */
const SAGITTAL: Curve = [
  // The forehead rows are measured against what the VAULT already does, and the
  // first cut of them was not. -30 mm at y = 0.78 sounds like a receding
  // forehead and is in fact 25 mm in FRONT of where the ellipsoid puts that
  // latitude, so the pin was inflating the frontal bone — the bulge over the
  // brow in art/shots/fix3/head-turn.png, and half of the balloon read. A vault
  // turns over hard: by three quarters of the way up it has given back most of
  // its depth. The pin's window is also shut earlier now, so above the forehead
  // the profile is the vault's own and nothing is pinning it at all.
  [0.640, -40], //  frontal eminence, where the pin has already faded out
  [0.470, -24], //  upper forehead
  [0.330, -11], //  mid-forehead — a man's leans back about 12° over its height
  [0.250, -4], //   supraciliary
  [0.219, 0], //    GLABELLA — the datum every other row is measured from
  [0.144, -5], //   nasion, the notch that makes the nose a separate mass
  [0.010, 9], //    rhinion, the top of the dorsum's run
  [-0.231, 25], //  PRONASALE — the frontmost point of the face
  [-0.276, 16], //  columella
  [-0.323, 3], //   subnasale
  [-0.481, 9], //   labrale superius
  [-0.536, 4], //   stomion — the OPENING, and it sits behind both vermilions
  [-0.606, 6], //   labrale inferius
  [-0.686, 3], //   mentolabial sulcus
  [-0.766, 1], //   POGONION
  // THE MENTAL FOLD, and its absence is the third of the owner's notes on the
  // mid-face. A man's chin is a BOX: pogonion carries forward, the front of the
  // chin runs very nearly vertical for a centimetre below it, and then the
  // underside turns away hard. Three rows straight from pogonion to gnathion draw
  // that as one smooth arc — a rounded pebble with no bottom edge, which is what
  // the profile card shows, and it leaves the jaw nothing to cast onto the
  // throat. `-0.820` holds the front of the chin out; the drop to gnathion then
  // happens over half the height it had, which is the corner.
  [-0.820, 0], //   the chin's front face, still nearly vertical
  [-0.856, -12], // gnathion — a turn now rather than a taper
  [-0.930, -34], // menton, turning back under the jaw
];

/**
 * The facial plate: the maxilla, the zygomatic body and the body of the mandible
 * carried forward off the braincase as ONE broad mass, in millimetres.
 *
 * This replaces two terms that between them are the whole of the "dark domino
 * mask over the mid-face with a hard edge along the brow". The old block was
 * gated vertically by `smooth(Y_BROW - 0.05, Y_LIP, y)` — a ramp that starts AT
 * the brow, so the top of a 19 mm slab landed on the brow line as a step — and
 * laterally by a plateau with a shoulder, which put a second hard edge down each
 * cheek. A slab with a step along its top and a shoulder down each side is a
 * mask; it did not need a lighting bug to look like one.
 *
 * A maxilla has no edges. So this one starts as nothing halfway up the forehead
 * and arrives smoothly, and its lateral falloff is a raised cosine in BEARING
 * (see `massEnvelope`) which is C1 at both ends and has no shoulder anywhere.
 *
 * Its exact midline values do not matter much, because the pin overwrites the
 * midline. What it owns is the face OFF the midline — the plane the cheek
 * presents to the key — which is what the mask was.
 */
const PLATE: Curve = [
  [0.640, 0],
  [0.320, 3],
  [0.219, 7], //   brow
  [-0.116, 19], // orbit floor
  [-0.323, 28], // subnasale
  [-0.536, 30], // lip line
  [-0.746, 25], // chin
  [-0.876, 10],
  [-0.960, 0],
];

/** How wide the plate is, in radians of bearing off dead ahead. A mandible is
 *  narrower than a maxilla, which is what turns a head from a box into a face. */
const PLATE_W: Curve = [
  [0.640, 1.05],
  [0.219, 1.20],
  [-0.116, 1.30], // widest at the cheekbone
  [-0.323, 1.45],
  [-0.536, 1.58],
  [-0.766, 0.86],
  [-0.960, 0.62],
];

/** How wide the midline relief is. A nose is narrow; a chin is not. */
const PIN_W: Curve = [
  [0.640, 0.95],
  [0.219, 0.80],
  [0.100, 0.52],
  // 0.31, not 0.35, and this row is now the ONLY thing that sets the lobule's
  // breadth — which is what "pinned" is supposed to mean. Under the plateau it
  // was not: the breadth was set by wherever the shoulder happened to fall
  // against the raw field's own falloff, and it moved 12 mm across the seeds. On
  // the raised cosine the section is `A·cos²(π/2·θ/w)`, so the bearing at which
  // the surface has given up 3 mm depends on `A` only through an arc-cosine and
  // on `w` linearly. The measured spread is 5.5 mm and the centre moves with this
  // number and nothing else. This row is still why a pin cannot make a snout.
  [-0.231, 0.31], // the nose
  [-0.323, 0.40],
  [-0.536, 0.58],
  [-0.766, 0.62],
  [-0.960, 0.66],
];

/**
 * A mass's lateral falloff, as a function of BEARING off dead ahead — 0 straight
 * forward, π/2 at the ear, π at the occiput.
 *
 * Bearing and not `z`, for the reason the previous pass found and then only half
 * acted on: `z` on a sphere falls with latitude as well as with bearing, so any
 * gate written on `z` silently doubles as a vertical profile and shapes the mass
 * in an axis nobody intended. Bearing knows nothing about latitude.
 *
 * A PLATEAU that turns, and the first cut of this was a raised cosine over the
 * whole width, which is a dome. The difference is the entire front view. A dome
 * starts falling away at the midline, so a 32 mm mass had given up 13 mm of
 * itself by the mouth corner and the gate measured the face falling back 50 mm
 * between the philtrum and the cheek — a wedge, and at the midline it is the
 * keel the capture showed. A maxilla is flat across the front of the face and
 * turns, over a short run, at the zygomatic.
 *
 * So: constant out to 0.45 of the width, then a smoothstep to nothing. The
 * smoothstep is C1, which is what matters — the previous pass got blamed for
 * putting a hard shoulder here, but the mask it was blamed for was the STEP
 * along the brow in the vertical profile, not this. A cheekbone is allowed to be
 * a turn; it is not allowed to be a crease.
 */
const massEnvelope = (bearing: number, w: number): number =>
  1 - smooth(w * 0.45, w, bearing);

/**
 * The OTHER falloff, and the one the plateau above must never be used for.
 *
 * The plateau is right for the plate and wrong for everything narrow, and the
 * eighth failure on this head is exactly that mistake: the profile pin's NARROW
 * half — the tip standing over the subnasale, the vermilion over the fissure —
 * was being delivered through `massEnvelope` too. A plateau has a flat top and a
 * shoulder. On a mass 0.35 rad wide that puts a FLAT PANEL down the middle of the
 * face out to 0.16 rad and then a shoulder, and because `PIN_W` widens as it
 * descends (0.35 at the nose, 0.58 at the lip, 0.62 at the chin) the shoulder
 * sweeps outward as it falls. That is, exactly, the owner's third note: "a
 * hard-edged plane break creasing from inner brow to jaw at three-quarter". The
 * crease is not a lighting artefact and not the plate's edge — it is this
 * envelope's shoulder, drawn on the pin's own residual.
 *
 * The flat top is the other half of the same note. A nose whose last 12 mm of
 * projection is held CONSTANT from the midline out to 0.16 rad is not a dorsum,
 * it is a block with a nose-shaped plan — which is the "upturned pug with the
 * subnasal mass pushed forward as one block", and it is also most of the 15–31 mm
 * spread on `tipBreadth`, because the lobule's measured breadth was being set by
 * where the plateau's shoulder happened to fall rather than by the nose.
 *
 * A raised cosine in bearing has neither. Its derivative is zero at the midline
 * (so the ridge is round, not flat-topped) and zero again at `w` (so it lands on
 * the skull with no shoulder at all), and it is C1 everywhere between. That is
 * what a ridge on a face is. The earlier note above records a raised cosine being
 * tried and rejected — that was on the PLATE, where a dome is genuinely wrong,
 * because a maxilla IS flat across the front of the face. The two masses want
 * different curves and now have them.
 */
const ridgeEnvelope = (bearing: number, w: number): number => {
  if (bearing >= w) return 0;
  const c = Math.cos((bearing / w) * Math.PI * 0.5);
  return c * c;
};

/** Bearings, in radians off dead ahead, that `headSilhouette` cuts sections at. */
const SECTION_BEARINGS = [0, 0.15, 0.30, 0.45, 0.60, 0.75, 0.90];
/** And the latitudes: brow, cheekbone, mouth, chin. */
const SECTION_LATITUDES = [Y_BROW, Y_EYE - 0.10, Y_LIP, Y_CHIN];

/** How many rows the pin table carries, over field `y` in [-1, 1]. */
const PIN_N = 193;

/**
 * Build the pin: for each latitude, how far the midline has to move to land on
 * `SAGITTAL`. Evaluated against `faceSurfaceRaw` — the field WITHOUT the pin —
 * so there is no recursion, and cached on the skull because a head is sampled
 * tens of thousands of times and this costs a few hundred.
 */
function pinTable(K: Skull): Float64Array {
  const t = new Float64Array(PIN_N * 2);
  const d = new THREE.Vector3();
  const p = new THREE.Vector3();
  const raw = (y: number) => {
    const c = Math.sqrt(Math.max(0, 1 - y * y));
    faceSurfaceRaw(K, d.set(0, y, c), p);
    return p.z;
  };
  const datum = raw(Y_BROW);
  const J = K.F;
  for (let i = 0; i < PIN_N; i++) {
    const y = -1 + (2 * i) / (PIN_N - 1);
    // The seed's whole authority over the profile, and it is two millimetres.
    // It used to be ±16% on a nose gaussian and ±20% on a chin, which compounded
    // across seeds into a 2.4× spread on the one feature the eye lands on first.
    const jit =
      J.pNose * bump(y - Y_TIP, 0, 0, 0.20, 1, 1) +
      J.pLip * bump(y - Y_LIP, 0, 0, 0.13, 1, 1) +
      J.pChin * bump(y - Y_CHIN, 0, 0, 0.14, 1, 1);
    const want = datum + (curve(SAGITTAL, y) + jit) * 0.001;
    // Faded to nothing over the vault and under the jaw, so the pin owns the
    // face and nothing else.
    const win = smooth(0.68, 0.46, y) * smooth(-0.985, -0.90, y);
    t[i] = (want - raw(y)) * win;
  }

  // ---- and now split it in two, which is the whole difference between a face
  // and a blade ----
  //
  // The first cut delivered the entire residual over the bearing a NOSE is wide,
  // and the capture is unmistakable: a vertical wedge running from the brow to
  // below the mouth, down the middle of a face that is otherwise flat. The
  // profile was correct in every one of the gate's terms while the front view
  // had grown a keel, which is the same class of failure as the six before it —
  // a measurement that could not see what the change did.
  //
  // The residual is two different things added together, and they want different
  // masses. Most of it varies SLOWLY with height: the whole facial skeleton has
  // to come forward off a braincase whose cos(v) gave up 40% of its depth by the
  // chin. That belongs on a broad mass, and delivered broadly it is not a snout,
  // it is a face. What is left varies FAST with height — the tip standing out
  // over the subnasale, the vermilion over the fissure — and that is the part
  // that is genuinely narrow.
  //
  // So the split is a low-pass in latitude, not a guess: a gaussian blur over
  // the table separates the two, exactly, and by construction they still sum to
  // the authored profile on the midline. The broad half goes out at the plate's
  // own bearing and the narrow half at the nose's.
  // 0.14 and not 0.20, and the cut is a real trade rather than a taste. Wider,
  // and the nose's own projection lands in the SLOW band and goes out at the
  // plate's bearing, which measures on the tape as a 31 mm lobule — a face with
  // its nose smeared across it. Narrower, and the facial skeleton's forward
  // carry starts arriving on the nose's bearing, which is the keel. 0.14 puts
  // the split at about a third of the face's height, which is the scale that
  // actually separates "the whole maxilla" from "the tip".
  const sigma = 0.14 * (PIN_N - 1) * 0.5; // in table rows
  const rad = Math.ceil(sigma * 3);
  const w: number[] = [];
  for (let k = -rad; k <= rad; k++) w.push(Math.exp((-k * k) / (2 * sigma * sigma)));
  for (let i = 0; i < PIN_N; i++) {
    let acc = 0, wsum = 0;
    for (let k = -rad; k <= rad; k++) {
      const j = i + k;
      if (j < 0 || j >= PIN_N) continue;
      acc += t[j] * w[k + rad];
      wsum += w[k + rad];
    }
    t[PIN_N + i] = acc / Math.max(1e-9, wsum);
  }
  // `t[0..N)` becomes the NARROW half — what is left once the broad one is out.
  for (let i = 0; i < PIN_N; i++) t[i] -= t[PIN_N + i];
  return t;
}

/**
 * Maps a unit direction onto a human skull, in metres, centred on the head's own
 * origin. Every feature is a gaussian pushing the ellipsoid in or out: brow
 * ridge, eye socket, nasal dorsum, zygomatic arch, buccal hollow, mental
 * protuberance, gonial angle. It is not a portrait, but it is a *surface* — the
 * brow throws a shadow into the socket and the cheekbone catches the fire, which
 * is the whole reason a face reads at all.
 *
 * Two things changed this pass and they are worth separating, because only one of
 * them is about depth.
 *
 * The first is the layout: every landmark now sits at the fraction of head height
 * a human's does (see `Y_BROW` and friends). It used to sit a quarter of a head
 * too high, which left a third of the face as an unmodelled plane — the flat panel
 * the owner was looking at. No amount of extra relief on the features fixes that,
 * because the panel is where the features *aren't*.
 *
 * The second is depth, and the numbers here are deliberately past life. Measured
 * against the arena's night rig — a key at 60° elevation, everything else either
 * omnidirectional or along the camera axis — a face at portrait distance is about
 * seventy pixels tall and shades almost entirely off surfaces that face up or
 * down. So the terms that earn their keep are the ones with a vertical edge: the
 * brow's overhang (20 mm over a 13 mm falloff — a 57° underside), the orbital
 * margin cut under it, the nose's tip and its columella undercut, the lip line,
 * the shelf under the lower lip, and the mandible edge. Anything whose gradient is
 * mostly in z is doing nothing in this rig no matter how deep it is, which is why
 * the flat 15 mm of dorsum the old field carried between the brows was invisible.
 *
 * Everything worn on the head is sampled through this same function, so hair
 * sits on the skull it belongs to and war paint lies on the cheek rather than
 * hovering in front of it.
 */
function faceSurfaceRaw(K: Skull, d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const R = K.R;
  const F = K.F;
  const x = d.x;
  const y = d.y;
  const z = d.z;
  const ax = Math.abs(x);
  const sx = x < 0 ? -1 : 1;
  // The front of the face; everything below uses it as a mask so a cheekbone
  // does not also grow out of the back of the head.
  const front = clamp01(z * 1.15);
  // Drift, applied to the midline features only. A nose 2 mm off centre is
  // invisible as a fact and unmistakable as a face.
  const drift = F.asym * front;

  // Base ellipsoid, narrowed toward the chin and — barely — over the crown. The
  // dome term was 0.15, which took 28 mm off the width of the parietal: on a head
  // already narrow against these shoulders that is throwing away the widest part
  // of the skull. At 0.05 the vault stays broad and the *jaw* does the tapering,
  // which is the right way round.
  const low = clamp01((-y - 0.05) / 0.85);
  // The vault's own taper, and 0.42 was far too late an onset for far too little
  // of it. Above the parietal eminence a skull rolls over and comes IN; at
  // 5% starting at y = 0.42 it held 96% of its full breadth to within 40 mm of
  // the crown, which is a barrel, and the bare-head card shows it as a balloon
  // sitting over a face. The onset comes down to the parietal itself and the
  // amount goes to 13%, which puts the crown at 167 mm against 190 at the
  // cheekbone — a dome. It does not touch `breadthOverHeight`, because the head
  // is widest well below this.
  const high = clamp01((y - 0.28) / 0.72);
  // The taper is what turns a vault into a face, and at 0.26·low² it was not
  // doing it: measured off the field the chin came out 80% of the width of the
  // parietal, so the head's outline ran temple-to-jaw as two near-vertical sides
  // with a flat bottom — the box in `art/shots/wip/p5-*`. A man's menton is
  // about a third of his head's breadth. 0.36 on a 1.55 power keeps the vault and
  // the zygomatic where they were (the exponent holds `low` small at eye level)
  // and takes the menton to 0.70, which the gonial bump then squares back up
  // into a jaw *corner* instead of a jaw *side*. Further than this and the chin
  // comes to a wedge — 0.44 was tried and the head read as a shield.
  const taper = 1 - 0.36 * Math.pow(low, 1.55);
  const dome = 1 - 0.13 * high * high;

  let px = x * R.x * F.wide * taper * dome + drift;
  // The face hangs off the braincase. Everything below the cheekbone gets pulled
  // down into a mandible, which is what turns a sphere into a head.
  let py = y * R.y * F.tall - MANDIBLE * Math.pow(clamp01((-y - 0.22) / 0.78), 1.3);
  let pz = z * R.z * F.deep * (1 - 0.1 * low * low) * (1 - 0.09 * high * high);

  // ---- the facial mass ----
  //
  // ONE broad mass, not two slabs, and it is not what carries the profile any
  // more. The profile is `SAGITTAL` and the pin puts the midline on it; what
  // this owns is the face OFF the midline — the plane a cheek presents to the
  // key, and the bearing at which that plane turns away toward the ear.
  //
  // The two terms it replaces are, between them, the whole of the dark domino
  // mask on the bare-head front card. The maxillary half was gated vertically by
  // `smooth(Y_BROW - 0.05, Y_LIP, y)`, a ramp whose top edge is the brow line —
  // so a 19 mm slab arrived as a STEP along the brow, which is exactly where the
  // owner reports the mask's hard edge. Laterally it was a plateau cut by a
  // shoulder at `ax / h`, which put a second hard edge down each cheek. The
  // mandibular half then added a third boundary under the mouth. Three creases
  // bounding the mid-face is a mask by construction; it never needed a lighting
  // bug to look like one, and the two hypotheses in `docs/OPEN-DEFECTS.md` were
  // both testing the light instead of the geometry that made the edge.
  //
  // A maxilla has no edges. So this one starts as nothing halfway up the
  // forehead, arrives over the whole height of the face, and falls off laterally
  // as a raised cosine in bearing — C1 at both ends, no shoulder, no step.
  const bearing = Math.atan2(ax, z);
  pz += 0.001 * curve(PLATE, y) * massEnvelope(bearing, curve(PLATE_W, y));

  // Parietal eminence: a skull is widest just above and behind the ear and rolls
  // over from there, rather than being a ball of one radius. Without it the only
  // vertical in the head's outline is the coif hanging beside it — which is the
  // "rounded box with hard vertical corner edges at the temples" the second panel
  // logged. Half of that read was the coif (its front rim has gone back and down;
  // see the helm build) and half was that there was no cranial curve for the eye
  // to follow instead. Faded out toward the midline, because `sx` flips there and
  // an unweighted push would leave a step down the crown.
  const vault = clamp01((y - 0.16) / 0.74);
  px += sx * 0.007 * (4 * vault * (1 - vault)) * smooth(0.06, 0.55, ax) * clamp01(1 - Math.abs(z) * 0.55);

  // Brow ridge and glabella. 20 mm of projection over a 13 mm vertical falloff,
  // so the underside of the ridge stands at about 57° to the skin below it — that
  // slope, and not the 20 mm, is what puts the socket in shadow under a key
  // hanging at 60°. The helm's brow band has come up off the ridge to leave it
  // doing that job (see the helm build); it used to sit straight on top of it.
  // The `py` term on the ridge is doing as much work as the `pz` one, for the
  // reason given at the nose: a push along z on a surface already facing z is a
  // gradient this light rig cannot see. Lifting the ridge's crest and *dropping*
  // the skin immediately below it is what turns 20 mm of projection into an
  // overhang with a lit top and a dark underside.
  //
  // AND IT HAS TO CAST, which is the third of the owner's three vault notes.
  // 57° is a slope, not an overhang, and against a key at 60° a slope returns
  // light. But the ridge's crest CANNOT be the lever, and that is worth writing
  // down because it cost an hour to find: every helm in the shop seats its bowl
  // on this exact band, and `wearmeasure` puts the clearance there at well under
  // a millimetre. Measured, lifting the crest from 9 mm to 12 takes the shop from
  // 10/10 helmets seated to 2/10 — the same skin-through-bowl failure four
  // helmets were rebuilt to fix. A 7 mm wing on the outer brow does it on its own
  // at any amount tried.
  //
  // So the overhang is bought by CUTTING UNDER the ridge instead of by growing
  // it. The angle of the underside is the same quantity either way — it is the
  // difference in height across the margin — and a negative displacement under a
  // brow band gives a helm clearance rather than taking it. The crest keeps its
  // 24 mm of projection and its 9 mm of lift; what changes is the gaussian's
  // width, tightened from 0.105 to 0.092 so the fall is over a shorter run, and
  // the orbital margin below, which now cuts twice as deep in y. 0.092 is still
  // above the 0.069 of field-`y` the mesh samples at, so none of this is bought
  // below Nyquist.
  const brow = bump(ax - 0.34, y - Y_BROW, 0, 0.30, 0.092, 1) * front;
  pz += 0.024 * F.brow * brow;
  py += 0.009 * F.brow * brow;
  pz += 0.009 * F.brow * bump(x, y - (Y_BROW - 0.02), 0, 0.12, 0.10, 1) * front;
  // Frontal eminences: the two low mounds either side of the midline that give a
  // forehead any form at all. There is a real forehead to put them on now — the
  // brow used to be 34 mm above centre with the hairline 15 mm above that.
  pz += 0.004 * bump(ax - 0.24, y - (Y_BROW + 0.20), 0, 0.22, 0.15, 1) * front;
  // And the rake. A man's forehead leans back about 12° from the brow to the
  // hairline; this one rose dead vertical out of a 24 mm brow ridge and then
  // turned over into the vault all at once, which is the single reason the
  // profile card reads as a balloon with a face stuck on the front of it. 9 mm
  // over the forehead's height is that 12°, and it costs nothing anywhere else
  // because it is gone by the brow and gone again by the crown.
  pz -= 0.009 * front * smooth(Y_BROW + 0.06, Y_BROW + 0.42, y) * (1 - smooth(0.72, 0.95, y));

  // Eye sockets, set under it. Deeper than life on purpose: the socket's whole
  // job is to hold shade under a helmet brim, and the sclera below has to sit in
  // something darker than itself or the eye reads as a bead glued to a cheek.
  const socket = bump(ax - 0.36, y - Y_EYE, 0, 0.19, 0.125, 1) * front;
  pz -= 0.018 * F.deepSet * socket;
  px -= sx * 0.005 * socket;
  py -= 0.004 * socket;
  // The orbital upper margin — the crease immediately under the ridge, and the
  // single line that makes the brow read as overhanging rather than as a band of
  // colour. Cut deeper and tighter this pass, and given a `py` component of its
  // own: at 6 mm of pure z it still resolved as tone rather than as an edge, and
  // an eye with no hard line over it is the almond patch both panels described.
  // The `py` cut is 9 mm, not 4, and it is where the brow's overhang is actually
  // bought — see the ridge above for why the crest could not be raised to buy it.
  // Dropping the skin under a ridge and lifting the ridge produce the same angle
  // on the underside; only one of them grows the head into the helm bowl sitting
  // on it. Widened in y to 0.068 at the same time, because at 0.055 this was
  // under the 0.069 the mesh samples at and the frame was getting about half of
  // whatever was asked for — the same arithmetic as the philtrum's.
  const margin = bump(ax - 0.36, y - (Y_EYE + 0.112), 0, 0.21, 0.068, 1) * front;
  pz -= 0.008 * margin;
  py -= 0.009 * margin;
  // Infraorbital ridge, closing the socket below and catching a little light.
  pz += 0.005 * bump(ax - 0.37, y - (Y_EYE - 0.145), 0, 0.22, 0.075, 1) * front;

  // ---- the nose ----
  //
  // "The nose is not modelled at all — the helm's nasal has been standing in for
  // it." That was the finding, and taken literally it was wrong: there were six
  // nose terms here. Taken as a description of the frame it was exactly right,
  // and the reason is worth writing down, because it is the same reason four
  // other features on this head were invisible.
  //
  // Every one of those terms was `pz += …` — displacement along the head's z.
  // At the nose the surface *already* faces +z, so pushing it further out moves
  // the skin along its own normal and produces a mound whose gradient is
  // entirely in z. The rig this face is lit by is ambient 0.85 + hemisphere 0.62
  // + a bounce directional straight down the camera axis, with one key at 60°:
  // a gradient in z changes N·L by almost nothing on any of them. So a 34 mm
  // nose returned the same value as the cheek beside it and the frame showed a
  // blank panel with a metal bar down the middle of it.
  //
  // What a nose is, for this rig, is three *horizontal* edges — the tip, the two
  // alar creases and the subnasale undercut — and one long up-facing plane
  // between them. So the dorsum now rises in **y** as well as z as it descends
  // to the tip, the tip overhangs, and the undersurface is cut hard back and up.
  // The projection is smaller than it was and reads several times as strongly.
  //
  // THE BEAK — note 1, and the sixth time this file has produced one. The
  // paragraph above is correct and was acted on correctly; what nobody did was
  // measure the result against the face it grows out of. `headProbe` puts the
  // tip 51.7 mm in front of pogonion on the mean seed and 73.2 on the worst,
  // where life is 18–22. It also puts the tip only 28 mm off the nasion — which
  // is *right*. So the nose was never over-projecting on its own: it was
  // over-projecting against a lower face that had fallen 24 mm behind it, and
  // every previous pass that reached for the nose was pulling on the wrong end
  // of the same measurement. Most of the 30 mm this note is about goes back on
  // the chin above (the mandibular block); what comes off here is the rest.
  //
  // Three numbers change, and only one of them is the size:
  //   * the dorsum's run tops out at 18 mm instead of 30 — a straight strong
  //     nose, not a prow;
  //   * the tip's own swell is halved and its gaussian widened by a third in
  //     both axes, because a 85 mm-wide bump on a 190 mm face is a *point*, and
  //     the point is what made ten thumbnails read as a storybook witch;
  //   * the lift under the tip comes down with it, so the dorsum still runs
  //     downhill into an edge the key can find without that edge being a spike.
  const run = smooth(Y_NOSE - 0.075, Y_NOSE + 0.035, y) * (1 - smooth(Y_BROW - 0.06, Y_BROW + 0.12, y));
  // 0.19 and not 0.132. A dorsum a seventh of the head's width is a blade, and
  // once the pin owns the projection the narrow one shows up directly on
  // `tipBreadth`: the pin's envelope is wider than the ridge it is correcting, so
  // the tip keeps its height over a bearing the ridge has already given up, and
  // the lobule measures single digits. A man's is a bulb.
  // 0.148, back down from 0.19 — and the note above is still right about WHY it
  // went to 0.19, which was that under the plateau envelope a narrow ridge left
  // the pin holding the tip's height over a bearing the ridge had given up, and
  // the lobule measured single digits. That failure mode is gone with the
  // plateau: on a raised cosine the pin's own delivery is round, so the ridge no
  // longer has to be wide enough to hide a shoulder. Measured across 32 heads the
  // pair below take `tipBreadth` from 22.3–28.5 to 18.6–23.2, which is a bulb.
  const ridge = bump(x - drift * 2, 0, 0, 0.148, 1, 1);
  // No `F.nose` here, and none on the tip below. The pin owns this landmark's
  // PROJECTION — that is the whole point of an authored profile — so a second
  // multiplier on the raw term does not change where the tip ends up, it only
  // changes how much residual the pin has left to deliver, and the residual is
  // what sets how WIDE the tip is. Measured, that was the entire 8-to-24 mm
  // spread on `tipBreadth`: one seed got a bulb and the next got a point, from a
  // trait that was no longer moving the thing it was named for. The nose's
  // identity is `pNose` on the table, plus the nostril width below.
  const proj = mix(0.010, 0.018, smooth(Y_BROW, Y_TIP, y));
  pz += proj * ridge * run * front;
  // The tip proper: a short swell at Y_TIP that carries the nose's last few
  // millimetres forward *and lifts the skin above it*, so the dorsum runs
  // downhill into it and the underside falls away. This is the edge that catches
  // the key — but it is a bulb on a man and a beak on a bird, and the difference
  // between the two is entirely how wide the gaussian is.
  const tip = bump(x - drift * 2, y - Y_TIP, 0, 0.168, 0.090, 1) * front;
  pz += 0.006 * tip;
  py += 0.0026 * tip;
  // The bridge, carried up between the brows — this is what stops the nose
  // reading as a lump stuck onto a flat plane — and the nasion pinch above it,
  // which is the notch that separates nose from forehead.
  //
  // The pinch is nearly twice as deep as it was, and that is the second thing
  // wrong with this profile after the face block. At 5 mm the forehead and the
  // dorsum were one continuous plane — measured, the midline ran 129.9 at the
  // brow and 129.1 immediately under it, a dip of *0.8 mm* — so the nose was not
  // a separate mass at all, it was where the front of the head happened to stop.
  // The notch is what makes a viewer read two forms instead of one, and it costs
  // nothing because it lands in a crease.
  pz += 0.006 * F.bridge * bump(x, y - (Y_BROW - 0.06), 0, 0.085, 0.17, 1) * front;
  // 0.078 in y and not 0.055, for the reason the LOD table gives: the head
  // samples about 0.069 of field-`y` per row near the face, so a notch narrower
  // than that is below Nyquist and the mesh cannot see it. Measured across six
  // seeds the old pinch moved the midline by 0.0 mm — it was not shallow, it was
  // invisible.
  pz -= 0.009 * bump(x, y - (Y_BROW - 0.015), 0, 0.10, 0.078, 1) * front;
  // Nostril wings: two rounded masses either side of the tip, standing out in x
  // as much as in z so the nose has a *width* at its base and the alar crease
  // that separates wing from cheek has something to cut into.
  const wing = bump(ax - 0.135, y - (Y_NOSE + 0.045), 0, 0.075, 0.072, 1) * front;
  // NO `F.nostril` ON THE z PUSH, and this is `tipBreadth`'s unpinned parameter
  // rather than a tuning error — which is what the 15–31 mm spread across eight
  // seeds was telling us. The pin splits its residual by FREQUENCY IN LATITUDE:
  // anything varying faster than sigma 0.14 goes out on the nose's narrow bearing
  // and everything slower goes out on the plate's. This term's sigma in y is
  // 0.072, half the split, so it lands squarely in the narrow band — and it sits
  // 0.045 from the tip. A trait multiplying it by ±22% therefore moves the raw
  // field under the tip, the pin subtracts whatever moved, and the narrow half
  // changes by the same ±22% with the sign flipped. The seed was not making a
  // wider nose, it was making a wider LOBULE by pushing on the pin from
  // underneath. `F.nostril` keeps the lateral push, which is the width the trait
  // is actually named for and which no pin owns.
  pz += 0.009 * wing;
  px += sx * 0.010 * F.nostril * wing;
  pz -= 0.006 * bump(ax - 0.155, y - (Y_NOSE + 0.105), 0, 0.055, 0.062, 1) * front;
  // Under the tip: the columella and the two nostril openings. The undercut is
  // the whole nose as far as this rig is concerned — it is the only part of it
  // that faces down, and therefore the only part that goes dark against a key
  // hanging at 60°. Deep, and tight in y so the edge above it stays sharp.
  pz -= 0.013 * bump(x - drift * 5, y - (Y_NOSE - 0.008), 0, 0.095, 0.052, 1) * front;
  py += 0.005 * bump(x - drift * 5, y - (Y_NOSE - 0.020), 0, 0.11, 0.058, 1) * front;
  pz -= 0.010 * bump(ax - 0.095, y - (Y_NOSE - 0.025), 0, 0.045, 0.046, 1) * front;

  // Cheekbone over a hollow — the pair is what stops a face reading as a balloon,
  // and the 13 mm lateral push is also 26 mm of the head's apparent width, put
  // where a viewer reads breadth from.
  const zygo = bump(ax - 0.55, y - (Y_EYE - 0.10), 0, 0.22, 0.17, 1) * front;
  px += sx * 0.021 * F.cheek * zygo;
  pz += 0.013 * F.cheek * zygo;
  // The zygomatic arch: the bar of bone that runs from the cheekbone back to the
  // ear at eye level. Not `front`-masked, because it is the one facial landmark
  // that lives on the *side* of the head — which is exactly why it is worth
  // having, since it is the only thing that gives the 3/4 bearing a horizontal
  // to read across the temple. Under it the buccal hollow already dips, so the
  // pair reads as bone over a hollow rather than as a bulge.
  px += sx * 0.007 * F.cheek * bump(ax - 0.76, y - (Y_EYE - 0.05), z - 0.30, 0.22, 0.11, 0.62);
  // The hollow itself comes down with the tone that was doubling it. A man who
  // fights for a living carries muscle over this — masseter and buccal fat — and
  // at 8 mm of lateral scoop plus 9 of depth, under a 0.42 shadow, the frame was
  // showing a starved wedge. Half the scoop, and the cheekbone above goes out to
  // meet it so the pair still reads as bone over a hollow.
  const hollow = bump(ax - 0.46, y - (Y_LIP + 0.03), 0, 0.20, 0.16, 1) * front;
  px -= sx * 0.0045 * F.gaunt * hollow;
  pz -= 0.005 * F.gaunt * hollow;
  // Nasolabial fold: from beside the nostril down past the mouth corner.
  // Widened from 0.075 to 0.13 across. A narrow groove cut into the raised face
  // block below reads as the *outline of a muzzle* rather than as a fold of
  // skin: two hard verticals bounding the mouth, which is the read the panels
  // logged at the 3/4 bearing. A nasolabial fold is a soft diagonal.
  pz -= 0.0025 * bump(ax - 0.30, y - (Y_LIP + 0.12), 0, 0.13, 0.19, 1) * front;

  // Mouth: a crease with a lip above and below it, and a shelf under the lower
  // lip so the chin is a separate mass rather than the bottom of the mouth.
  // The mouth is the skull's now — `addMouth` used to lay four lifted bands over
  // the top of these terms and they are what the bands were hiding. Every one of
  // them has gained a `py` component for the reason the nose's did: this rig
  // shades off surfaces that face up or down, so a lip is worth what its
  // horizontal edges are worth and nothing at all for its projection. The two
  // vermilions roll *toward* each other across the fissure, which is what turns
  // a groove into a slot with an overhang above it.
  //
  // Note 5's other half — "a thin scored line rather than lips". The fissure was
  // cut 11 mm deep between two vermilions standing 9 and 11 mm proud, so the
  // groove was as big a feature as the lips it separated, and at seventy pixels
  // a groove reads and a 9 mm roll does not. That is a scored line by
  // construction. The groove comes back to 8 mm and the two rolls go out to 12
  // and 14, which is a mouth with mass either side of a seam rather than a seam
  // with skin either side of it. The complexion field's `lip` channel is already
  // laid over exactly this band, so the tone and the form now agree instead of
  // the tone doing the whole job on a flat surface.
  //
  // A vermilion is a BAND, not a mound, and that distinction is the whole of the
  // pucker in the profile card. Both lips were plain gaussians on the midline
  // with a 25 mm sigma, so each one was fullest dead centre and fell away
  // continuously to the corners — which is a pout, and rolling them further out
  // to answer "the mouth is a thin scored line" only made the pout bigger. What a
  // mouth actually is at this scale is a strip of near-constant thickness that
  // ends, fairly abruptly, at the commissures.
  //
  // So the x profile is a plateau: wide in the gaussian, then cut by a soft
  // shoulder just inside the mouth's own width. Same mass, same projection at the
  // centre, but it is carried right out to the corners instead of being piled up
  // in the middle — which is what puts a horizontal edge under the nose rather
  // than a beak under it.
  const mw = 0.28 * F.mouth;
  const band = (u: number, k: number) =>
    bump(u, 0, 0, mw * 1.9, 1, 1) * (1 - smooth(mw * k, mw * (k + 0.30), Math.abs(u)));
  const oral = band(x - drift * 4, 0.80) * bump(0, y - Y_LIP, 0, 1, 0.046, 1) * front;
  pz -= 0.008 * oral;
  py -= 0.0035 * oral;
  const upperLip = band(x - drift * 4, 0.68) * bump(0, y - (Y_LIP + 0.055), 0, 1, 0.058, 1) * front;
  pz += 0.0105 * F.lip * upperLip;
  py -= 0.0032 * upperLip;
  const lowerLip = band(x - drift * 4, 0.62) * bump(0, y - (Y_LIP - 0.070), 0, 1, 0.066, 1) * front;
  pz += 0.0125 * F.lip * lowerLip;
  py += 0.0030 * lowerLip;
  // The mentolabial sulcus, widened in y from 0.064 to 0.078 for the reason the
  // nasion pinch was: at 44 rows the head samples about 0.061 of field-`y` per
  // row down here, so a 0.064 sigma is one sample wide and the mesh renders about
  // half of it. The shelf under the lower lip is the landmark that divides the
  // lower third, and half a shelf is why the chin and the mouth read as one mass.
  pz -= 0.013 * bump(x, y - (Y_LIP - 0.150), 0, 0.20, 0.078, 1) * front;
  // ---- the philtrum, and it was below Nyquist in the axis nobody checked ----
  //
  // The LOD note above is about sampling in LATITUDE and every feature on this
  // face has been widened to clear it. This one was 0.035 of sigma in **x**, and
  // the head carries 40 columns — `2π/40 = 0.157` radians, which near the midline
  // is 0.15 of the direction units this gaussian is written in. So the philtrum
  // was four and a half times below Nyquist across, the mesh could not put a
  // single vertex inside it, and the owner's "no philtrum" is not an aesthetic
  // note at all: there was nothing there to see.
  //
  // 0.085 is the honest number rather than a generous one — half the column
  // spacing, so the groove gets a vertex in it — and it is also anatomy: 0.085 of
  // direction on an 83 mm half-breadth is a 7 mm sigma, a 14 mm philtrum, which
  // is a man's. Deepened to 4.5 mm because a groove the mesh can now resolve is
  // worth cutting properly, and flanked by its two crests: a philtrum is a groove
  // BETWEEN two ridges, and without them it is a dent in a flat lip.
  const philtrum = bump(x - drift * 5, y - (Y_LIP + 0.14), 0, 0.085, 0.075, 1) * front;
  pz -= 0.0045 * philtrum;
  pz += 0.0022 * bump(ax - 0.155, y - (Y_LIP + 0.13), 0, 0.075, 0.070, 1) * front;

  // Chin and jaw angle. The projection went from 16 mm to 26 mm, off the measured
  // sagittal profile rather than by eye: the midline used to run 90 mm of z at the
  // lip and 78 at the chin front — a face that recedes monotonically from the
  // mouth down, which is a weak chin and reads as one. On a man the chin comes
  // back out to within a few millimetres of the lip. The mentolabial sulcus above
  // it deepened to match, so the extra mass is a separate block and not a longer
  // jaw — this is the one place where adding depth also makes the lower face read
  // *shorter*, because it gives the eye a second landmark to divide it at.
  const chin = bump(x, y - Y_CHIN, 0, 0.27, 0.155, 1) * front;
  pz += 0.035 * F.chin * chin;
  py -= 0.004 * chin;
  // Mental tubercles: the two low mounds either side of the midline that make a
  // man's chin a *box* rather than the bottom of a curve. They are the last
  // horizontal landmark on the face and the only one below the mouth, so at the
  // seventy pixels a face gets they are worth more than their 4 mm.
  pz += 0.004 * F.chin * bump(ax - 0.13, y - (Y_CHIN + 0.03), 0, 0.11, 0.12, 1) * front;
  // Gonial angle and the ramus above it. Tightened in y from 0.22 to 0.15 and
  // pushed harder: a jaw needs a *corner* in the silhouette, and a 220 mm-tall
  // gaussian is a swell — it widened the whole side of the head and left the
  // outline the unbroken arc from temple to chin that reads as an egg. The ramus
  // term above it gives the corner something to be the bottom of.
  //
  // The flare comes down from 26 mm to 17 this pass, and that is not a retreat
  // from "broad jaw" — it is what makes the jaw read broad. Measured, the
  // bigonial breadth was 178 mm against a 196 mm head: 0.91, where life is 0.68
  // and a deliberately blunt Saxon fighter wants about 0.80. A mandible as wide
  // as the skull above it is not a strong jaw, it is a *flat lower face*, and
  // with pogonion sitting behind the lip line — see the face block — the pair of
  // them is the goblin in note 1. At 17 mm the corner is still there (the
  // gaussian's y is unchanged, and the corner is the tight sigma, not the
  // amplitude), the breadth lands near 160, and the neck below has something it
  // can plausibly be as thick as.
  //
  // AND IT WAS PUSHING IN THE ONE AXIS A PROFILE CANNOT SEE. Every term here was
  // `px +=` — lateral flare — and the owner's note is that in the profile panel
  // "the jaw curves into the neck with no gonial angle". It always would: a
  // lateral push does not move a single point of the side-on silhouette, which is
  // drawn in y and z. Sixty millimetres of flare and the profile outline is still
  // the ellipsoid's own arc from temple to chin, which is the egg.
  //
  // A gonial angle in a PROFILE is the corner between two directions: the
  // inferior border of the mandible running back from the menton, and the
  // posterior border of the ramus running up to the ear. So the mass that makes
  // it has to move in y and z — down and back at the angle, and up the back of
  // the ramus above it. The lateral flare stays, because that is what the FRONT
  // view reads as a broad jaw, but it is no longer pretending to be the corner.
  //
  // The silhouette gate measures the result directly: `gonialTurnDeg` is how far
  // the outline turns through at its sharpest point along the mandible, and
  // `gonialOverArc` compares that to the median turn over the same arc, so a
  // uniformly-curved egg scores 1.0 however big it is.
  const gonion = bump(ax - 0.68, y - Y_GONION, z, 0.26, 0.17, 0.95);
  px += sx * 0.0095 * F.jaw * gonion;
  px += sx * 0.004 * F.jaw * bump(ax - 0.70, y - (Y_GONION + 0.20), z + 0.25, 0.22, 0.20, 0.85);
  // And the bigonial breadth comes in. It measured 160 mm under a 155 mm neck,
  // which is S5's failure and note 4's: a jaw wider than the column under it
  // reads as a head balanced on a stalk however thick the neck is made. The
  // corner survives it, because the corner is the ramus mass above, not this.
  //
  // And it is done by taking the FLARE off rather than by cutting a groove: a
  // dedicated narrowing term at the gonial band overshot by 2.5x whatever it was
  // set to, because it lands on top of the vault taper that is already pulling
  // there. Two terms narrowing the same band is how a strong jaw became a wedge
  // measuring 0.73 of the cheekbone.
  // The angle itself: tight in y and set behind the ear's own bearing, dropped
  // and pulled back so the outline has somewhere to turn.
  const angle = bump(ax - 0.62, y - (Y_GONION - 0.055), z + 0.30, 0.30, 0.105, 0.55);
  py -= 0.0125 * F.jaw * angle;
  pz -= 0.0060 * F.jaw * angle;
  // The posterior border of the ramus, climbing from the angle to the condyle.
  // This is the second of the two directions; without it the drop above is a
  // notch rather than a corner.
  pz -= 0.0055 * bump(ax - 0.66, y - (Y_GONION + 0.28), z + 0.62, 0.30, 0.20, 0.42);
  // Mandible edge: a crease above the jawline so the jaw casts its own shadow
  // onto the neck instead of melting into it. Deepened to 5 mm and run further
  // back toward the gonion — it is working with a real throat mass underneath
  // (see the head build), and the pair of them is the undercut.
  pz -= 0.005 * bump(ax - 0.46, y - (Y_CHIN + 0.10), 0, 0.40, 0.10, 1) * front;

  // ---- the temporal fossa, and it was a dimple where a PLANE belongs ----
  //
  // The owner's second note is that the vault is "an unbroken egg, enormous,
  // smooth, featureless at 180 degrees", and the temple is the first of the three
  // things a skull has there that this one did not. What was here was a single
  // 2.5 mm gaussian 18 units wide — a thumbprint. A temporal fossa is not a
  // dimple: it is a broad shallow PLANE running from the lateral orbital margin
  // back to the ear and from the zygomatic arch up to the superior temporal line,
  // and on a shaved head it is the largest readable surface between the brow and
  // the occiput. It is also the one place on the vault whose normal differs
  // materially from the ellipsoid's, which is why its absence leaves nothing for
  // the key at 60° to break the egg with.
  //
  // 6 mm over a mass three times as wide, and the amount is bounded by the note
  // it replaces rather than by taste: 5 mm was pulled back to 2.5 because it was
  // "cutting into the one place the eye measures breadth". That was true of a
  // mass centred at `Y_BROW + 0.12`, which is the parietal — the widest part of
  // the head. This one is centred a fifth of the field lower, at the temple
  // proper, and is gated hard behind the orbit, so the parietal eminence above it
  // keeps every millimetre it had. Measured, `breadthOverHeight` does not move.
  const fossa = bump(ax - 0.78, y - (Y_BROW - 0.08), z - 0.16, 0.30, 0.26, 0.72);
  px -= sx * 0.0060 * fossa;
  // The superior temporal line: the ridge the fossa stops at, and the edge that
  // turns a shallow plane into a readable one. Without a lip along its top a
  // 6 mm scoop out of a sphere is still a sphere.
  px += sx * 0.0028 * bump(ax - 0.66, y - (Y_BROW + 0.26), z - 0.18, 0.26, 0.11, 0.80);
  // The occiput, and this line was doing the exact opposite of what the comment
  // above it claimed for two passes. The intent was right — 24 mm of new face
  // block goes on the front, so the back has to come in or the skull gets longer
  // — but at the back of the head `pz` is *negative*, and subtracting from it
  // pushes the occiput further back. The head therefore grew 24 mm in front and
  // another 15 behind, and `headProbe` measures the result at 0.944 of glabella-
  // to-occiput over head height against a life 0.845. That is the egg in note 3,
  // and it is one character.
  //
  // `+=` pulls the back in, which is also the right shape on its own terms: the
  // Anglo-Saxon skulls out of the Suffolk cemeteries are blunt behind, and a
  // helm bowl swept through this field sits better on a round vault than on a
  // long one.
  pz += 0.020 * bump(x, y - 0.02, z + 0.92, 1, 0.4, 0.32);

  // ---- and the occipital CURVE, which is the second half of note 2 ----
  //
  // The line above sets how far back the occiput sits. It does not give the back
  // of the head a shape, and one number cannot: an ellipsoid with its rear pole
  // moved is still an ellipsoid, and the 180° panel of the turntable is exactly
  // where that shows. A skull is not smooth behind. It carries the external
  // occipital protuberance — the inion — as a distinct rounded mass, and
  // immediately below it the bone turns forward and down through the nuchal
  // plane where the neck muscles insert. That pair, a bulge with a hollow under
  // it, is the only thing that makes the back of a shaved head read as bone
  // rather than as the end of a balloon, and it is worth having precisely because
  // it faces up and down: this rig shades off horizontal edges (see the nose) and
  // the inion's underside is one.
  const rear = clamp01(-z * 1.25);
  pz -= 0.0085 * bump(x, y - (Y_BROW - 0.36), 0, 0.62, 0.115, 1) * rear;
  // The nuchal hollow under it, cut back IN — `pz +=` at the rear pulls toward
  // the head's centre, which is the trap the line above this block fell into for
  // two passes and is worth not falling into twice.
  pz += 0.0075 * bump(x, y - (Y_BROW - 0.60), 0, 0.70, 0.13, 1) * rear;
  // The lambdoid flattening: an Anglo-Saxon vault out of the Suffolk cemeteries
  // is blunt above the inion rather than continuing round, so the upper occipital
  // comes in and the whole back of the head reads as two planes meeting at the
  // inion instead of one arc passing through it.
  pz += 0.0060 * bump(x, y - (Y_BROW - 0.02), 0, 0.85, 0.30, 1) * rear;

  // ---- under the ear, where there is no skull ----
  //
  // This is why a gonial angle could not be built. The silhouette gate measures
  // the turn along the mandible and scored 12° — a circle — however hard the jaw
  // was flared, and the reason is geometric rather than a matter of amount: an
  // orthographic profile outline is the FURTHEST point at each bearing, and the
  // ellipsoid's own lower-rear quadrant was further out than any jaw put on it.
  // The gonion never reached the silhouette, so nothing done to it could show.
  // Six passes of "push the jaw harder" were pushing a mass that was interior to
  // the outline the whole time, which is also why every one of them widened the
  // head from the front and changed nothing in profile.
  //
  // And the ellipsoid was wrong there anyway. Below and behind the ear a man has
  // no skull: he has the mastoid, then the sternocleidomastoid, then neck. The
  // ball that was there is the reason the back panel of the owner's capture is a
  // featureless egg. Taking it in hands the outline to the mandible, which is the
  // only structure that should be drawing it.
  //
  // Gated on bearing behind the ear and on latitude below it, and both gates are
  // smoothsteps over a wide span, because this runs right through where a helm's
  // nape flange and a hood's rim are swept — a step here would print itself on
  // both of them.
  const nuchal = smooth(1.55, 2.45, bearing) * smooth(-0.24, -0.62, y) * (1 - smooth(-0.80, -0.95, y));
  pz += 0.021 * nuchal;
  px -= sx * 0.010 * nuchal * smooth(0.25, 0.85, ax);

  return out.set(px, py, pz);
}

/**
 * The head, with its profile pinned to `SAGITTAL`.
 *
 * Everything above is relief — real, and most of what makes a face read — but it
 * is a sum, and a sum has no silhouette you can name in advance. This adds the
 * one correction that carries the midline onto the authored curve, so the shape
 * of the profile is a thing that was decided rather than a thing that happened.
 *
 * The correction is small (the plate and the feature terms already do most of
 * the work), it is smooth in y because the table it chases is C1, and it falls
 * off in bearing as a raised cosine whose width is authored per latitude — 0.26
 * radians at the nose, twice that at the chin. That last row is why a pin cannot
 * turn into a snout: the residual at the nose is delivered over a bearing a nose
 * is actually wide, and the residual at the lip over a bearing a mouth is.
 *
 * Sampling the table rather than solving it per-call is what makes this free:
 * one head is 193 evaluations of the raw field and then tens of thousands of
 * lookups.
 */
function faceSurface(K: Skull, d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  faceSurfaceRaw(K, d, out);
  const pin = (K.pin ??= pinTable(K));
  const y = d.y;
  const f = clamp01((y + 1) * 0.5) * (PIN_N - 1);
  const i = Math.min(PIN_N - 2, Math.floor(f));
  const g = f - i;
  const narrow = mix(pin[i], pin[i + 1], g);
  const broad = mix(pin[PIN_N + i], pin[PIN_N + i + 1], g);
  if (narrow === 0 && broad === 0) return out;
  const bear = Math.atan2(Math.abs(d.x), d.z);
  // Two masses, two curves. The broad half is the facial skeleton coming forward
  // off the braincase and it goes out on the plate's plateau, because a maxilla
  // is flat across the front of a face. The narrow half is the tip over the
  // subnasale and the vermilion over the fissure, and it goes out on a raised
  // cosine — see `ridgeEnvelope` for why the plateau on this one was the crease
  // from inner brow to jaw and the pug nose in the same stroke.
  out.z += broad * massEnvelope(bear, curve(PLATE_W, y))
    + narrow * ridgeEnvelope(bear, curve(PIN_W, y));
  return out;
}

/**
 * Outward normal of the *undisplaced ellipsoid* at a direction.
 *
 * This is exact for the ellipsoid and it is wrong for the head, because the head
 * is the ellipsoid plus a displacement field the size of a face. Keep using it
 * where a stable, smooth, slowly-varying axis is what is wanted — `eyeFrame`
 * builds an orbit frame off it and wants the socket's broad direction, not the
 * local wrinkle. Do NOT use it to stand a worn shell off the skin: see
 * `faceNormalTrue` and `wearNormalProbe`.
 */
function faceNormal(K: Skull, d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(d.x / K.R.x, d.y / K.R.y, d.z / K.R.z).normalize();
}

const _tn0 = new THREE.Vector3();
const _tnu = new THREE.Vector3();
const _tnv = new THREE.Vector3();
const _tnd = new THREE.Vector3();
const _tta = new THREE.Vector3();
const _ttb = new THREE.Vector3();

/**
 * Outward normal of the head as it is ACTUALLY BUILT — central differences on
 * `faceSurface` in the same (u, v) the surface is parameterised by.
 *
 * The thing this fixes is worth stating plainly, because it is four broken
 * helmets. `headWear` stands every worn shell off the skull by moving a point
 * on the skin along a normal. It was using the ellipsoid's normal, which the
 * face block, the brow, the gonial bump and the nose have all moved away from —
 * `wearNormalProbe` measures the gap at 11.4 deg mean and 71.6 deg worst over
 * the band a helm rim sits on. Two failures follow from that:
 *
 *   - a shell asked for `lift` of clearance gets `lift * cos(theta)`. At 71.6
 *     deg, 6 mm of lift becomes 1.9, and the shell's inner wall is inside the
 *     head.
 *   - theta swings hard across the face block's edge, so adjacent points of one
 *     shell go in diverging directions. That is a shear. It is why the Spectacle,
 *     Boar-Crest, Jarl's Crowned and Wyrm-Crest helms each show a hard-edged
 *     rectangular slab of metal with skin punching through it, and why the
 *     Shadow Hood cuts a flat plane through the skull on the armoury card.
 *
 * The step is in parameter space, not world space, and it is deliberately not
 * tiny: at 1e-3 of a radian the difference is dominated by the field's real
 * curvature rather than by float cancellation on a 0.1 m head. Central rather
 * than forward differences because the field is not symmetric about a sample
 * and a forward difference biases every normal one half-step toward +u/+v —
 * which on the midline is a systematic lean toward one ear.
 *
 * Near the poles `cos(v)` collapses and the u-tangent goes to nothing; there the
 * ellipsoid normal is both correct and stable, so fall back to it rather than
 * normalising noise. The crown and the underside of the jaw are exactly where
 * nothing subtle is worn.
 */
function faceNormalTrue(K: Skull, u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
  const h = 1e-3;
  // d(surface)/du, centred.
  faceSurface(K, dirOf(u + h, v, _tnd), _tn0);
  faceSurface(K, dirOf(u - h, v, _tnd), _tnu);
  _tta.subVectors(_tn0, _tnu);
  // d(surface)/dv, centred.
  faceSurface(K, dirOf(u, v + h, _tnd), _tn0);
  faceSurface(K, dirOf(u, v - h, _tnd), _tnv);
  _ttb.subVectors(_tn0, _tnv);

  out.crossVectors(_ttb, _tta);
  // Degenerate at the poles, and anywhere the field folds. The ellipsoid normal
  // is the honest answer there.
  if (out.lengthSq() < 1e-16) return faceNormal(K, dirOf(u, v, _tnd), out);
  out.normalize();
  // The cross product's sign follows the parameterisation, which flips across
  // the equator. Anchor it to the one direction that is unambiguously outward.
  if (out.dot(faceNormal(K, dirOf(u, v, _tnd), _tnu)) < 0) out.negate();
  return out;
}

/**
 * The tape measure. Reads the actual displacement field back as anthropometry,
 * in millimetres, so a head can be judged as a head instead of as a list of
 * gaussian coefficients.
 *
 * This exists because of the failure written up in `docs/SUTTON-HOO.md`, which
 * has now happened five times on this file: a note-by-note correction pass fixes
 * every item on its list and breaks the object, because nobody ever checked the
 * ratios the eye actually reads. "The nose is too big" is not a number. Nose
 * projection past pogonion *is* a number, life is about 20 mm, and this build
 * was shipping 42 — which is the beak, stated in a form that can be argued with.
 *
 * The `life` column in `tools/headmeasure.mjs` is Farkas' adult male series
 * (head height menton–vertex 232 mm, head length glabella–opisthocranion 196,
 * head breadth 155, neck breadth 111) rescaled to this game's 269 mm head, so
 * the comparison is of *proportion* and not of size — this warrior is
 * deliberately drawn at a heroic 7.3 heads and slightly broad in the vault.
 */
export interface HeadProbe { [k: string]: number }

export function headProbe(cls: WarriorClass, seed: number): HeadProbe {
  const S = skeleton(BUILD[cls]);
  const K: Skull = { R: S.headR, F: faceTraits(seed) };
  const p = new THREE.Vector3();
  const d = new THREE.Vector3();
  const mm = 1000;

  // Front midline: the sagittal profile every one of the owner's five notes is
  // about. `y` is the surface field's own latitude sine.
  const front = (y: number) => {
    const c = Math.sqrt(Math.max(0, 1 - y * y));
    faceSurface(K, d.set(0, y, c), p);
    return { y: p.y, z: p.z };
  };
  const back = (y: number) => {
    const c = Math.sqrt(Math.max(0, 1 - y * y));
    faceSurface(K, d.set(0, y, -c), p);
    return { y: p.y, z: p.z };
  };

  // Extremes, swept rather than assumed — the field's maxima do not sit on the
  // landmarks that generate them once the taper and the eminences are on.
  let top = -9, bot = 9, wide = 0, wideY = 0, fore = -9, aft = 9;
  let jawW = 0, cheekW = 0;
  for (let j = 0; j <= 160; j++) {
    const v = (j / 160) * Math.PI - Math.PI / 2;
    for (let i = 0; i < 200; i++) {
      const u = (i / 200) * Math.PI * 2;
      faceSurface(K, dirOf(u, v, d), p);
      if (p.y > top) top = p.y;
      if (p.y < bot) bot = p.y;
      if (p.z > fore) fore = p.z;
      if (p.z < aft) aft = p.z;
      const ax = Math.abs(p.x);
      if (ax > wide) { wide = ax; wideY = p.y; }
      // Bigonial and bizygomatic are *facial* breadths, so they are taken across
      // the front half only. Swept over the whole sphere they pick up the
      // parietal behind the ear instead and report a head that never narrows,
      // which is a measurement of nothing.
      if (d.z <= 0) continue;
      const fy = Math.sin(v);
      if (Math.abs(fy - Y_GONION) < 0.03 && ax > jawW) jawW = ax;
      if (Math.abs(fy - (Y_EYE - 0.10)) < 0.03 && ax > cheekW) cheekW = ax;
    }
  }

  const glab = front(Y_BROW);
  // The nasion is the deepest point of the nasal root, so it is found rather than
  // named: sampling it at a fixed offset under the brow lands on the bridge,
  // which is already on its way out, and reports a nose half the size of the one
  // in the frame.
  //
  // AND THE BAND IT IS FOUND IN HAS TO STOP AT THE GLABELLA, which is the whole
  // of `noseProjection` being out by 0.43 and `chinBeyondNasion` by 0.93. The
  // sweep ran to `Y_BROW + 0.10` — a tenth of the field ABOVE the brow — and a
  // nasion is by definition BELOW the glabella. On a forehead that rakes back 12°
  // over its height, as this one now correctly does, the deepest point in that
  // band is not the nasal root at all: it is the frontal bone at y = 0.319, where
  // `SAGITTAL` reads -10.7 mm against the nasion row's -5. The probe was measuring
  // the tip against the middle of the man's forehead and reporting it as nose
  // projection, and every pass that reached for the nose to close that gap was
  // pulling on a landmark that was not in the measurement.
  //
  // Bounded at the glabella, and the height it lands at is published below, so
  // the next raked forehead cannot walk it back out without that showing.
  let nasion = front(Y_BROW);
  for (let i = 0; i <= 60; i++) {
    const y = mix(Y_TIP, Y_BROW, i / 60);
    const f = front(y);
    if (f.z < nasion.z) nasion = f;
  }
  const nasionAtY = nasion.y;
  const tip = front(Y_TIP);
  // How pointed the tip is, which is the half of note 1 that is not about size.
  // A bulb loses its projection slowly across the face; a beak falls off a cliff.
  // This is the nose's breadth at the latitude of the tip, taken where the
  // surface has dropped 5 mm behind the tip's own z.
  //
  // AND IT IS A BREADTH, so it is measured BETWEEN THE TWO SIDES rather than as
  // twice the distance from x = 0 to one of them. That one word is the whole of
  // the 15–31 mm spread the owner called an unpinned parameter, and he was right
  // that it was not a tuning error — but the parameter is not on the nose. It is
  // `F.asym`, which drifts the midline features up to 2.2 mm sideways on purpose
  // ("a symmetric face is a mask"). Sweeping ONE side and doubling `|p.x|` turns
  // that 2.2 mm of drift into 2 x 2 x 2.2 = 8.8 mm of apparent breadth, and 8 of
  // the 12 mm of spread across eight seeds is exactly that. Bisecting the traits
  // confirms it: with `span(seed, 18, …)` alone forced to zero the spread falls
  // from 11.9 mm to 3.9, and every other trait moves it by under 1.4.
  //
  // A nose displaced sideways is not a wider nose. Sweeping both sides and taking
  // the difference cancels the drift exactly and leaves the number measuring the
  // lobule.
  let tipL = Infinity, tipR = -Infinity;
  {
    const cv = Math.sqrt(Math.max(0, 1 - Y_TIP * Y_TIP));
    for (let i = -240; i <= 240; i++) {
      const t = (i / 240) * 0.5;
      faceSurface(K, d.set(Math.sin(t) * cv, Y_TIP, Math.cos(t) * cv), p);
      if (p.z < tip.z - 0.003) continue;
      if (p.x < tipL) tipL = p.x;
      if (p.x > tipR) tipR = p.x;
    }
  }
  const tipWide = tipR > tipL ? tipR - tipL : 0;
  const sub = front(Y_NOSE);
  const lip = front(Y_LIP);
  const pog = front(Y_CHIN);
  const occ = back(0.02);
  const height = top - bot;

  // The neck, which is head geometry as far as a viewer is concerned: a head is
  // read against the column under it, and note 4 is about that ratio and not
  // about the neck on its own.
  const menton = S.headY + bot;
  const visibleNeck = menton - S.shoulderY;

  return {
    headHeight: height * mm,
    headBreadth: wide * 2 * mm,
    headLength: (glab.z - occ.z) * mm,
    headDepthTotal: (fore - aft) * mm,
    breadthOverHeight: (wide * 2) / height,
    lengthOverHeight: (glab.z - occ.z) / height,
    /** Crown down to the brow ridge — the cranial share of the head. Life 0.35. */
    craniumShare: (top - glab.y) / height,
    /** Brow to subnasale, and subnasale to menton: the lower two thirds. */
    midThird: (glab.y - sub.y) / height,
    lowerThird: (sub.y - bot) / height,
    /** THE beak number. Life is 18–22 mm on an adult male. */
    noseBeyondChin: (tip.z - pog.z) * mm,
    noseBeyondLip: (tip.z - lip.z) * mm,
    /** How far the nose stands off its own root. Life 25–30 mm at this scale. */
    noseProjection: (tip.z - nasion.z) * mm,
    /** Breadth of the tip mass — note 1's other half. A bulb, not a point. */
    tipBreadth: tipWide * mm,
    /** Where the nasion was FOUND, as a fraction of head height below the crown.
     *  Published so a probe that has wandered onto the forehead says so. */
    nasionFromCrown: (top - nasionAtY) / height,
    /**
     * Orthognathism: pogonion against the nasion vertical, which is the facial
     * angle every profile is judged on. A man sits within a few millimetres of
     * zero. Deeply negative is a receding chin no matter what the chin bump does,
     * because the whole mandible is set back behind the face.
     */
    chinBeyondNasion: (pog.z - nasion.z) * mm,
    /** Chin against the lip above it. A man's pogonion is at or in front of it. */
    chinBeyondLip: (pog.z - lip.z) * mm,
    chinBeyondGlabella: (pog.z - glab.z) * mm,
    jawBreadth: jawW * 2 * mm,
    cheekBreadth: cheekW * 2 * mm,
    jawOverCheek: jawW / cheekW,
    wideAt: (top - wideY) / height,
    neckBreadth: S.neckHW * 2 * mm,
    neckDepth: S.neckHD * 2 * mm,
    neckOverHead: (S.neckHW * 2) / (wide * 2),
    /**
     * The number note 4 is actually about. A viewer does not compare the neck to
     * the skull's widest point, which is hidden behind the ear and under a helm —
     * he compares it to the jaw directly above it. In life the two are within a
     * few per cent of each other and on a fighter the neck wins.
     */
    neckOverJaw: (S.neckHW * 2) / (jawW * 2),
    visibleNeck: visibleNeck * mm,
    neckOverHeadHeight: visibleNeck / height,
    headCount: S.crown / height,
  };
}

/**
 * The ear, in numbers rather than in the build, because the gate has to be able
 * to measure it. It is the one facial feature that is not swept from
 * `faceSurface` — it is a rim, a bowl and a lobe placed at a fraction of the
 * skull's half-breadth — so nothing in `headProbe` could ever see it, and the
 * owner's note ("an ear like a flat sticker") is a defect no landmark ratio was
 * ever going to catch.
 *
 * `EAR_ROOT` buries the medial third; the helix then has to climb back out past
 * the skin. What it stands clear by is `headSilhouette().earOut`, and on a man
 * that is 14–20 mm at the rim — enough that the ear casts onto the skull behind
 * it, which is the only reason an ear reads at all in a side light.
 */
const EAR_ROOT = 0.93;
const EAR_RAKE = 0.32;
/** The latitude an ear hangs at: eye line down to the base of the nose. */
const EAR_Y = (Y_EYE + Y_NOSE) * 0.5;

// ============================================================
// THE EAR, AUTHORED AS A SHELL
//
// Eight passes, and this organ has now been a sticker, a bagel and a torus with
// daylight through it. The owner's note on the last one is the useful one and
// it is objective rather than aesthetic: "you can see the palisade and the sky
// through the hole in his ear". S6 passed at 12.7 mm the whole time, because all
// S6 ever asked was whether the helix stood OFF the skull. It does. A ring
// standing 13 mm off a skull is exactly what the assertion demanded and is also
// exactly the defect.
//
// The build was `ball + torus + ball + torus + ball` — a SUM OF PRIMITIVES, which
// is the identical failure this file already diagnosed for the head itself and
// already fixed there: a sum has no outline, so nobody can say in advance what
// its silhouette will be or whether it closes. Two things follow from it and both
// are in the frame:
//
//   * the torus is a RING. Its hole is covered from dead ahead by the concha
//     ball behind it, which is why the last pass's "put a floor in the ear's
//     hollow" reads as fixed from one bearing and is not fixed at all. The floor
//     is a separate convex bead sitting inside a rim it does not touch, so from
//     every bearing off the axis the two part company and the gap between them
//     is open to the sky.
//   * the rim's own seat is a PLANE. Every primitive is placed at `earRootX`, a
//     single half-breadth taken at ONE latitude, while the skull it lands on
//     tapers. Measured on this build the skin at the lobe's latitude is about
//     7 mm inside the skin at the ear's centre, so the bottom of the rim stands
//     clear of the head it is supposed to be growing out of. That is the daylight,
//     and it is under the front-bottom of the helix in the capture.
//
// So the auricle is now ONE closed surface. A radial sheet: an authored outline
// in the ear's own plane, a cross-section from the rim in to a closed pole, and —
// this is the part that kills the daylight by construction rather than by
// tuning — the rim's depth is not authored at all. It is MEASURED, per angle,
// off the skin the ear lands on, and then buried by `EAR_SEAT`. A boundary that
// is inside the skull at every angle cannot have a gap under it.
// ============================================================

/**
 * The auricle's outline, in metres from the ear's own centre, as a function of
 * the angle round it: 0 is straight up, π/2 is toward the face, π is the lobe,
 * 3π/2 is toward the back of the head. Eight control points, cosine-interpolated.
 *
 * 58 mm tall and 33 mm across, which is a man's — and, more to the point, taller
 * than it is wide by 1.75, where the torus it replaces was 1.6 and read round.
 */
const EAR_OUTLINE = [
  0.0310, // up — the helix apex
  0.0290, // up-front
  0.0150, // front — the margin in front of the tragus, and an ear is narrow here
  0.0195, // front-down
  0.0270, // down — the lobe
  0.0245, // back-down
  0.0180, // back
  0.0265, // back-up, where the helix rolls over
];

/**
 * How far inside the skin the auricle's rim is carried. Three millimetres is not
 * a fudge factor, it is the assertion: `earSeat` in the silhouette gate measures
 * the worst point of the rim against the skin under it and FAILS if any part of
 * it is proud, because a rim proud of the skin has a gap under it and a gap under
 * a rim is the sky.
 */
const EAR_SEAT = 0.0030;

/**
 * The cross-section, in metres of standoff FROM THE SKIN, from the closed pole
 * at the centre out to the rim. `s` is the fraction of the way out.
 *
 * Read it as a section through an ear: a floor that clears the skull by a
 * couple of millimetres, a wall climbing to the helix crest at 0.78, and an
 * outer face falling back to land INSIDE the head. Every value is against the
 * skin rather than against a plane, which is what makes the last row an
 * assertion instead of a hope.
 */
const EAR_SECTION: Curve = [
  [1.00, -EAR_SEAT], // the rim, buried
  [0.90, -0.0005],
  [0.78, 0.0160], //   HELIX CREST
  [0.62, 0.0092], //   the inner wall of the rim, falling into the bowl
  [0.44, 0.0030], //   the concha floor
  [0.20, 0.0022], //   the deepest part of the bowl, over the canal
  [0.00, 0.0030], //   the pole. Closed, and that is the whole point
];

/** And the section a LOBE has, which is not a rim round a bowl at all — it is
 *  solid flesh, so it is one smooth bulge that lands on the skin like everything
 *  else does. The two sections are crossfaded round the ear by `earHollow`. */
const LOBE_SECTION: Curve = [
  [1.00, -EAR_SEAT],
  [0.86, 0.0030],
  [0.55, 0.0092],
  [0.22, 0.0086],
  [0.00, 0.0070],
];

/** How much of the rim-and-hollow the section keeps, per angle round the ear:
 *  1 at the top and back where the helix is, falling to nothing at the lobe. */
const earHollow = (phi: number): number =>
  1 - 0.90 * Math.pow(0.5 - 0.5 * Math.cos(phi), 2.5);

/** Cosine interpolation round the outline table. Cosine and not linear because a
 *  linear join between control points is a corner, and eight corners round an ear
 *  is a stop sign. */
function earRadius(phi: number): number {
  const n = EAR_OUTLINE.length;
  const f = ((phi / (Math.PI * 2)) * n + n) % n;
  const i = Math.floor(f);
  const t = f - i;
  const w = 0.5 - 0.5 * Math.cos(t * Math.PI);
  return mix(EAR_OUTLINE[i], EAR_OUTLINE[(i + 1) % n], w);
}

/**
 * The antihelix and the tragus, as modulations on the section rather than as two
 * more primitives. The antihelix is the second ridge inside the rim and runs
 * round the back and top; the tragus is the one part of an ear that faces
 * forward, so it is a local raise on the front margin over the canal.
 */
function earRelief(phi: number, s: number): number {
  const anti = bump(s - 0.50, 0, 0, 0.13, 1, 1)
    * clamp01(0.15 + 0.85 * (0.5 - 0.5 * Math.cos(phi - 0.6)));
  const tragus = bump(s - 0.42, 0, 0, 0.16, 1, 1)
    * bump(Math.sin(phi - Math.PI / 2), 0, 0, 0.34, 1, 1) * clamp01(Math.cos(phi - Math.PI / 2));
  return 0.0042 * anti + 0.0050 * tragus;
}

/** Half-breadth of the SKIN at a latitude — what an ear has to grow out of. */
function skullHalfWidth(K: Skull, fy: number): number {
  const d = new THREE.Vector3();
  const p = new THREE.Vector3();
  const cv = Math.sqrt(Math.max(0, 1 - fy * fy));
  let w = 0;
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * Math.PI;
    faceSurface(K, d.set(Math.sin(t) * cv, fy, Math.cos(t) * cv), p);
    w = Math.max(w, Math.abs(p.x));
  }
  return w;
}

/**
 * Half-breadth of the skin at one latitude AND one depth, which is what an ear's
 * rim actually lands on. `skullHalfWidth` takes the maximum over the whole ring
 * and therefore reports the widest point of the head at that height; the ear sits
 * 24 mm behind centre and its lobe hangs 27 mm lower, and both of those are
 * places where the head is narrower than its own maximum. Using the maximum is
 * what put the bottom of the old rim outside the head.
 */
function skinAt(K: Skull, fy: number, tz: number): number {
  const d = new THREE.Vector3();
  const p = new THREE.Vector3();
  const cv = Math.sqrt(Math.max(0, 1 - fy * fy));
  let best = 0, bestD = Infinity;
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * Math.PI;
    faceSurface(K, d.set(Math.sin(t) * cv, fy, Math.cos(t) * cv), p);
    const e = Math.abs(p.z - tz);
    if (e < bestD) { bestD = e; best = Math.abs(p.x); }
  }
  return best;
}

/** Where one ear vertex lands, in the ear's own frame plus the head-space
 *  latitude and depth it sits at. Shared by the build and the gate, because a
 *  measurement of a different ear from the one on the head is worth nothing. */
interface EarPoint { ex: number; ey: number; ez: number; fy: number; tz: number; stand: number }

/**
 * The auricle's whole geometry, as numbers, in the ear's own frame.
 *
 * `ex` is toward the face, `ey` is up the ear, `ez` is out of the skull measured
 * from the `earRootX` plane — which is exactly the head's own `|x|` offset,
 * because the ear frame's rotation carries local z onto head x untouched.
 */
function earPoint(K: Skull, earRootX: number, phi: number, s: number): EarPoint {
  const r = earRadius(phi) * s;
  // The rake is applied here rather than as a matrix on the whole ear, so the
  // latitude each vertex is seated against is the one it actually ends up at.
  const c = Math.cos(EAR_RAKE), sn = Math.sin(EAR_RAKE);
  const ax = r * Math.sin(phi), ay = r * Math.cos(phi);
  const ex = ax * c - ay * sn;
  const ey = ax * sn + ay * c;
  // Head-space latitude and depth of this vertex. `EAR_Y` is a field-`y`, and the
  // ear's own height above the centre converts through the skull's y radius.
  const fy = clamp01((EAR_Y + ey / K.R.y + 1) * 0.5) * 2 - 1;
  const tz = -0.024 - ex;
  const h = earHollow(phi);
  const stand = mix(curve(LOBE_SECTION, s), curve(EAR_SECTION, s), h) + earRelief(phi, s) * h;
  return { ex, ey, ez: (skinAt(K, fy, tz) - earRootX) + stand, fy, tz, stand };
}

/** Angles round the outline and steps from the pole to the rim. 28 x 7 is 196
 *  vertices an ear, against the 5 primitives it replaces which cost 210 between
 *  them — so a shell that closes is CHEAPER than a sum of balls that does not. */
const EAR_NA = 28;
const EAR_NS = 7;

/**
 * The auricle as three watertight bands off one vertex grid, so the concha can
 * carry the shade tone and the lobe the warm one without any of the three being
 * a separate object with its own rim. `s` bands: [0, 0.55) is the bowl, the rest
 * is the helix and its outer face; the lobe is taken by angle out of the outer
 * band.
 *
 * Every band indexes the SAME positions, so the joins are exact by construction
 * rather than by matching two tables. That is the whole reason this is one grid.
 */
function auricle(K: Skull, earRootX: number, side: number): {
  skin: THREE.BufferGeometry; shade: THREE.BufferGeometry; warm: THREE.BufferGeometry;
} {
  const pos: number[] = [], uv: number[] = [];
  for (let j = 0; j <= EAR_NS; j++) {
    const s = j / EAR_NS;
    for (let i = 0; i < EAR_NA; i++) {
      const phi = (i / EAR_NA) * Math.PI * 2;
      const p = earPoint(K, earRootX, phi, s);
      // `-side * ex` for the reason the old build gave and which still holds: two
      // ears are mirror images, a rotation cannot make one out of the other, and a
      // negative scale turns the surface inside out. Flip the authored in-plane
      // axis, and flip the winding below to match.
      pos.push(-side * p.ex, p.ey, p.ez);
      uv.push(i / EAR_NA, s);
    }
  }
  const band = (lo: number, hi: number, keep: (phi: number) => boolean): number[] => {
    const idx: number[] = [];
    for (let j = 0; j < EAR_NS; j++) {
      const s = (j + 0.5) / EAR_NS;
      if (s < lo || s >= hi) continue;
      for (let i = 0; i < EAR_NA; i++) {
        const i1 = (i + 1) % EAR_NA;
        if (!keep(((i + 0.5) / EAR_NA) * Math.PI * 2)) continue;
        const a = j * EAR_NA + i, b = j * EAR_NA + i1;
        const c = (j + 1) * EAR_NA + i, d = (j + 1) * EAR_NA + i1;
        if (side > 0) idx.push(a, c, d, a, d, b);
        else idx.push(a, d, c, a, b, d);
      }
    }
    return idx;
  };
  const lobeAngle = (phi: number) => Math.cos(phi) < -0.45;
  const make = (idx: number[]) => {
    const g = finish(pos.slice(), uv.slice(), idx);
    return g;
  };
  return {
    // The bowl, in the shade tone: at 60 mm a hollow cannot out-shade its own rim
    // on geometry alone, and this is the one place on a head where the tone is
    // doing work the light cannot. It is a hollow now rather than a hole, so the
    // tone is agreeing with the form instead of standing in for it.
    shade: make(band(0, 0.55, () => true)),
    warm: make(band(0.55, 1.01, lobeAngle)),
    skin: make(band(0.55, 1.01, (phi) => !lobeAngle(phi))),
  };
}

/** What the gate needs to know about the ear, off the same tables the mesh is
 *  built from. See the S6 block in `tools/headmeasure.mjs`. */
interface EarProbe {
  /** Millimetres the helix crest stands clear of the skin beside it. */
  standoff: number;
  /** Millimetres the concha FLOOR stands clear of the skin. A floor behind the
   *  skin is not a hollow, it is a hole with the skull showing through it. */
  floor: number;
  /** The worst point of the rim against the skin, in millimetres. POSITIVE IS
   *  DAYLIGHT: a rim proud of the head has a gap under it. */
  seat: number;
  /** Crest minus floor: how deep the bowl actually is. A ring has no bowl. */
  bowl: number;
}

function earProbe(K: Skull, earRootX: number): EarProbe {
  // Deliberately NOT `p.stand`, even though the two are equal on this build.
  // Reading the authored table back would make every assertion below a tautology
  // that passes whatever the mesh does — which is precisely how S6 came to pass at
  // 12.7 mm on an ear you could see the palisade through. So each vertex is taken
  // at the position it is BUILT at, `earRootX + ez`, and compared against a fresh
  // measurement of the skin at that vertex's own latitude and depth. Seat the ear
  // on a plane again, as the five primitives did, and this reports the gap.
  const clear = (p: EarPoint) => (earRootX + p.ez) - skinAt(K, p.fy, p.tz);
  let standoff = -Infinity, floor = Infinity, seat = -Infinity;
  for (let i = 0; i < EAR_NA * 2; i++) {
    const phi = (i / (EAR_NA * 2)) * Math.PI * 2;
    for (let j = 0; j <= EAR_NS * 2; j++) {
      const c = clear(earPoint(K, earRootX, phi, j / (EAR_NS * 2)));
      if (c > standoff) standoff = c;
      // The aperture: everything inside the helix crest, which is what a camera
      // looking down the ear's axis sees through the rim.
      if (j <= EAR_NS * 1.2 && c < floor) floor = c;
    }
    const rim = clear(earPoint(K, earRootX, phi, 1));
    if (rim > seat) seat = rim;
  }
  return {
    standoff: standoff * 1000,
    floor: floor * 1000,
    seat: seat * 1000,
    bowl: (standoff - floor) * 1000,
  };
}

/**
 * THE PROFILE OUTLINE, and the reason it exists is written in the sixth failure.
 *
 * `headProbe` above measures landmark-to-landmark ratios, and every one of them
 * came back inside its Farkas tolerance on the pass that shipped a muzzle. That
 * is not a bug in the tolerances. It is that a ratio between two named points
 * cannot see the shape of the line between them: "the nose tip is 24 mm in front
 * of pogonion" is equally true of a face and of a snout, because the lips are not
 * one of the two points and the lips are what was wrong.
 *
 * So this returns no ratios at all. It returns the **silhouette** — the outline
 * of the head as a side-on camera projects it — as a closed polygon, and lets
 * `tools/headmeasure.mjs` assert on the shape of the curve. A head is star-shaped
 * about its own centre at every bearing that matters, so the outline is swept
 * radially: for each angle off the head's centre in the sagittal plane, the
 * furthest surface point at that bearing. That keeps the concavities a convex
 * hull would erase — the nasion notch and the mentolabial sulcus are both real
 * parts of the read — while still being a single-valued curve the gate can walk.
 *
 * `theta` is measured from the crown (+y) toward the face (+z): 0 is straight up,
 * π/2 is dead ahead, π is the menton, −π/2 is the occiput. The mandible therefore
 * lives in θ ∈ (π, 3π/2), which is where the gonial corner is looked for.
 */
export interface HeadSilhouette {
  /** Closed sagittal outline, `n` samples: `y[i]`, `z[i]` in metres, head-origin. */
  y: number[];
  z: number[];
  /** Centre the sweep was taken about. */
  cy: number;
  cz: number;
  /** Crown and menton in the same space, so heights can be read as fractions. */
  top: number;
  bot: number;
  /** Field-`y` of the named landmarks, and the height each one landed at. */
  browY: number; tipY: number; noseY: number; lipY: number; chinY: number;
  /** Bigonial half-breadth across the front half, and the neck under it. */
  jawHW: number;
  neckHW: number;
  /**
   * THE TRANSVERSE OUTLINE, at the brow, the cheek, the mouth and the chin.
   *
   * The profile alone is not enough and the first cut of the pin proved it: the
   * sagittal curve was correct in all six of its assertions while the front view
   * had grown a vertical keel from the brow to below the mouth, because the whole
   * correction was being delivered over the bearing a nose is wide. A silhouette
   * gate that only looks from the side cannot see a blade pointing at the camera.
   *
   * So each row is a horizontal section of the face — `z` in metres at each of
   * `SECTION_BEARINGS` radians off dead ahead, at one latitude. The gate composes
   * differences from them rather than being handed a verdict, because which pair
   * of bearings is meaningful depends on what is at the midline there: at the
   * cheekbone's latitude the midline is the NOSE, so a fall measured from bearing
   * zero is the nose's own falloff and says nothing about the cheek at all. That
   * is a mistake this file made on its first cut of S7 and it is why the bearings
   * are published rather than the answer.
   */
  sections: Array<{ atY: number; z: number[] }>;
  /**
   * The ear, read off the same tables the mesh is built from. Four numbers and
   * not one, because "the helix stands 12.7 mm off the skull" was TRUE of the
   * torus with daylight through it — a standoff on its own cannot tell a shell
   * from a ring, and that is the hole S6 let through for three passes.
   */
  ear: EarProbe;
}

export function headSilhouette(cls: WarriorClass, seed: number): HeadSilhouette {
  const S = skeleton(BUILD[cls]);
  const K: Skull = { R: S.headR, F: faceTraits(seed) };
  const p = new THREE.Vector3();
  const d = new THREE.Vector3();
  // 360 bins of one degree, filled from a sweep that is DEEP in latitude and
  // shallow in bearing. That ratio is the whole of it: a bin's occupancy is set
  // by the latitude step, because latitude is what walks the outline, and the
  // first cut of this ran 180 latitudes into 720 bins — three quarters of them
  // empty, interpolated across, and the joins between the interpolated runs
  // read as 150-degree cusps that the gonial-corner test scored as jaws.
  const N = 360;

  // One sweep, kept, because the radial centre has to be the head's own — the
  // face block moves it forward by a real amount — and re-evaluating a field this
  // size twice for 32 heads is a gate nobody will run.
  let top = -9, bot = 9, fore = -9, aft = 9, jawHW = 0;
  const NV = 1100, NU = 72;
  const sy = new Float64Array((NV + 1) * NU), sz = new Float64Array((NV + 1) * NU);
  let m = 0;
  for (let j = 0; j <= NV; j++) {
    const v = (j / NV) * Math.PI - Math.PI / 2;
    const fy = Math.sin(v);
    for (let i = 0; i < NU; i++) {
      const u = (i / NU) * Math.PI * 2;
      faceSurface(K, dirOf(u, v, d), p);
      sy[m] = p.y; sz[m] = p.z; m++;
      if (p.y > top) top = p.y;
      if (p.y < bot) bot = p.y;
      if (p.z > fore) fore = p.z;
      if (p.z < aft) aft = p.z;
      if (d.z > 0 && Math.abs(fy - Y_GONION) < 0.03) jawHW = Math.max(jawHW, Math.abs(p.x));
    }
  }
  const cy = (top + bot) * 0.5;
  const cz = (fore + aft) * 0.5;

  // The outline itself. Every surface sample is dropped into the angular bin it
  // falls in and keeps the furthest radius, which is exactly what a silhouette
  // is. Taken off the whole sphere rather than off the midline, because the
  // frontmost point of a lip or a cheek need not sit on x = 0 and the camera does
  // not care whether it does.
  const rad = new Float64Array(N).fill(-1);
  for (let q = 0; q < m; q++) {
    const dy = sy[q] - cy, dz = sz[q] - cz;
    const r = Math.sqrt(dy * dy + dz * dz);
    let t = Math.atan2(dz, dy);
    if (t < 0) t += Math.PI * 2;
    const k = Math.round((t / (Math.PI * 2)) * N) % N;
    if (r > rad[k]) rad[k] = r;
  }
  // A bin can come up empty at the poles where the sampling grid crowds; fill it
  // from its neighbours rather than leaving a spike the turn test would read as a
  // gonial angle.
  for (let k = 0; k < N; k++) {
    if (rad[k] >= 0) continue;
    let a = k, b = k;
    while (rad[(a + N - 1) % N] < 0) a--;
    while (rad[(b + 1) % N] < 0) b++;
    const ra = rad[((a - 1) % N + N) % N], rb = rad[(b + 1) % N];
    rad[k] = mix(ra, rb, (k - a + 1) / (b - a + 2));
  }

  const ys: number[] = [], zs: number[] = [];
  for (let k = 0; k < N; k++) {
    const t = (k / N) * Math.PI * 2;
    ys.push(cy + rad[k] * Math.cos(t));
    zs.push(cz + rad[k] * Math.sin(t));
  }

  const at = (fy: number) => {
    const c = Math.sqrt(Math.max(0, 1 - fy * fy));
    faceSurface(K, d.set(0, fy, c), p);
    return p.y;
  };

  // Transverse sections. Bearing is swept on the sphere at a fixed latitude, so
  // the three samples sit at the same height as the midline one they are
  // compared to — a section, not a diagonal.
  const sectionAt = (fy: number) => {
    const cv = Math.sqrt(Math.max(0, 1 - fy * fy));
    return {
      atY: fy,
      z: SECTION_BEARINGS.map((b) => {
        faceSurface(K, d.set(Math.sin(b) * cv, fy, Math.cos(b) * cv), p);
        return p.z;
      }),
    };
  };
  const sections = SECTION_LATITUDES.map(sectionAt);

  // The ear, off the same `earPoint` the mesh is built from and against the same
  // `earRootX` the build seats it on — so the gate is measuring the organ that is
  // actually on the head rather than a second one written for the gate.
  return {
    y: ys, z: zs, cy, cz, top, bot,
    browY: at(Y_BROW), tipY: at(Y_TIP), noseY: at(Y_NOSE), lipY: at(Y_LIP), chinY: at(Y_CHIN),
    jawHW, neckHW: S.neckHW, sections,
    ear: earProbe(K, skullHalfWidth(K, EAR_Y) * EAR_ROOT),
  };
}

const _d = new THREE.Vector3();
const _n = new THREE.Vector3();

function dirOf(u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
  const cv = Math.cos(v);
  return out.set(Math.sin(u) * cv, Math.sin(v), Math.cos(u) * cv);
}

/**
 * The second tape measure, and it measures the thing that seats a helm.
 *
 * `headWear` lifts every worn shell — hair, beard, war paint, helm bowl, hood —
 * off the skull along `faceNormal`, and `faceNormal` is the normal of the
 * *undisplaced ellipsoid*: `d/R` normalised. It knows nothing about the
 * displacement field. On a plain ellipsoid that is exact and this was free. It
 * stopped being free the moment the face block, the brow, the gonial bump and
 * the nose went on, because a displaced surface has a different normal, and the
 * angle between the two is the error in every lift direction on the head.
 *
 * Two consequences, and both are visible on the armoury cards:
 *
 *   - a shell asked to stand `lift` proud of the skin only clears it by
 *     `lift · cos θ`. Where θ is large the shell is asked for 6 mm and gets 3,
 *     and any thickness at all puts its inner wall *inside* the skin.
 *   - θ varies fast across the face block's edge, so neighbouring points on a
 *     shell are pushed in diverging directions. That is a shear, not an offset,
 *     and it is what cuts the hood through the skull.
 *
 * This reports the angle over the region wear actually covers, so the fix can be
 * argued with instead of guessed at. It renders nothing; the picture is still
 * the judge.
 */
export interface WearProbe { [k: string]: number }

export function wearNormalProbe(cls: WarriorClass, seed: number): WearProbe {
  const S = skeleton(BUILD[cls]);
  const K: Skull = { R: S.headR, F: faceTraits(seed) };
  const d = new THREE.Vector3();
  const p0 = new THREE.Vector3();
  const pu = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const na = new THREE.Vector3();
  const tu = new THREE.Vector3();
  const tv = new THREE.Vector3();
  const nt = new THREE.Vector3();
  const h = 1e-3;
  const deg = 180 / Math.PI;

  let maxAll = 0, maxAllU = 0, maxAllV = 0;
  let sumAll = 0, nAll = 0;
  // The helm band: the strip a bowl's rim actually sits on, brow to above the
  // ear. `lat` maps the field's own latitude sine, same as `eyeFrame` uses.
  let maxBand = 0, sumBand = 0, nBand = 0;
  let worstClear = 1;

  for (let j = 0; j <= 96; j++) {
    const v = -Math.PI / 2 + (j / 96) * Math.PI;
    for (let i = 0; i < 128; i++) {
      const u = (i / 128) * Math.PI * 2;
      faceSurface(K, dirOf(u, v, d), p0);
      faceSurface(K, dirOf(u + h, v, d), pu);
      faceSurface(K, dirOf(u, v + h, d), pv);
      tu.subVectors(pu, p0);
      tv.subVectors(pv, p0);
      nt.crossVectors(tv, tu);
      if (nt.lengthSq() < 1e-18) continue;
      nt.normalize();
      faceNormal(K, dirOf(u, v, d), na);
      // The patch winding can hand back the inward normal; the angle we want is
      // between the two outward directions.
      if (nt.dot(na) < 0) nt.negate();
      const ang = Math.acos(Math.min(1, Math.max(-1, nt.dot(na)))) * deg;
      sumAll += ang; nAll++;
      if (ang > maxAll) { maxAll = ang; maxAllU = u; maxAllV = v; }
      const clear = Math.cos(ang / deg);
      if (clear < worstClear) worstClear = clear;
      // brow to crown-of-ear, all the way round: where a bowl or a hood lives.
      if (v > lat(-0.10) && v < lat(0.72)) {
        sumBand += ang; nBand++;
        if (ang > maxBand) maxBand = ang;
      }
    }
  }

  return {
    maxAngleDeg: maxAll,
    meanAngleDeg: sumAll / Math.max(1, nAll),
    maxAngleU: maxAllU,
    maxAngleV: maxAllV,
    helmBandMaxDeg: maxBand,
    helmBandMeanDeg: sumBand / Math.max(1, nBand),
    // What a 6 mm lift actually clears by, at the worst point on the head.
    worstClearanceFrac: worstClear,
    worstLiftOf6mm: 6 * worstClear,
  };
}

// ============================================================
// HELM FIT — the gate that replaces looking at it
// ============================================================
//
// `wearNormalProbe` above measures the *direction* a shell is lifted in. It was
// enough to find the bug and it is not enough to hold a helmet, because the two
// faults an armoury card actually shows are about the *distance*:
//
//   - a shell whose inner wall ends up inside the skin, which draws as a face
//     punching through metal. `docs/COSMETICS-AUDIT.md` records 2110 gold of the
//     ladder failing this way.
//   - a shell standing so far off the skull that it reads as parked above the
//     head rather than worn on it. That is the owner's "the helms hover".
//
// Both are numbers, so both can fail a test instead of needing an eye.
//
// THE HEAD IS STAR-SHAPED ABOUT THE SKULL CENTRE. That is the one assumption
// here and it is worth stating, because everything below rests on it: the face
// field is an ellipsoid plus bumps that never fold a ray back on itself, so
// "how far out is the skin in direction d" has exactly one answer and a radial
// table can hold it. A nose is a bump on a sphere, not an overhang.
//
// Given that table, a shell point is inside the skin iff its own radius is less
// than the skin's radius in its own direction — and, crucially, that catches
// what a local normal check cannot: a shell offset further than the surface's
// radius of curvature turns itself inside out, and the skin the fold exposes is
// nowhere near the (u, v) the shell was drawn at. That inversion is what makes
// the four broken guards break.

/** Azimuth/elevation bins of the skin's radius, for the star-shaped test above. */
interface SkinRadii {
  na: number; ne: number;
  r: Float64Array;
}

const _sr = new THREE.Vector3();

/**
 * Tabulate the skin's radius from the skull centre over direction.
 *
 * Sampled twice as finely in (u, v) as the table is in (az, el) and reduced with
 * `max`, because a bin that took the *last* sample to land in it would step down
 * over the nose and report air as skin — and a clearance test that under-reads
 * the skin passes exactly the shells it exists to fail.
 */
function skinRadii(K: Skull, na = 192, ne = 96): SkinRadii {
  const r = new Float64Array(na * ne);
  const d = new THREE.Vector3();
  const p = new THREE.Vector3();
  const su = na * 2, sv = ne * 2;
  for (let j = 0; j <= sv; j++) {
    const v = -Math.PI / 2 + (j / sv) * Math.PI;
    for (let i = 0; i < su; i++) {
      const u = (i / su) * Math.PI * 2;
      faceSurface(K, dirOf(u, v, d), p);
      const len = p.length();
      if (len < 1e-6) continue;
      const az = Math.atan2(p.x, p.z);
      const el = Math.asin(Math.min(1, Math.max(-1, p.y / len)));
      const ai = Math.min(na - 1, Math.max(0, Math.floor(((az + Math.PI) / (Math.PI * 2)) * na)));
      const ei = Math.min(ne - 1, Math.max(0, Math.floor(((el + Math.PI / 2) / Math.PI) * ne)));
      const k = ei * na + ai;
      if (len > r[k]) r[k] = len;
    }
  }
  // Any bin the sweep missed — they exist at the poles, where the (u, v) grid
  // crowds — borrows its neighbour rather than reading zero, which would call
  // the whole skull hollow and pass everything.
  for (let ei = 0; ei < ne; ei++) {
    for (let ai = 0; ai < na; ai++) {
      const k = ei * na + ai;
      if (r[k] > 0) continue;
      let best = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const e2 = ei + dj, a2 = (ai + di + na) % na;
          if (e2 < 0 || e2 >= ne) continue;
          best = Math.max(best, r[e2 * na + a2]);
        }
      }
      r[k] = best;
    }
  }
  return { na, ne, r };
}

/** How far outside the skin a point is, in metres. Negative is inside it. */
function skinClearance(tab: SkinRadii, p: THREE.Vector3): number {
  const len = p.length();
  if (len < 1e-6) return -len;
  const az = Math.atan2(p.x, p.z);
  const el = Math.asin(Math.min(1, Math.max(-1, p.y / len)));
  const ai = Math.min(tab.na - 1, Math.max(0, Math.floor(((az + Math.PI) / (Math.PI * 2)) * tab.na)));
  const ei = Math.min(tab.ne - 1, Math.max(0, Math.floor(((el + Math.PI / 2) / Math.PI) * tab.ne)));
  return len - tab.r[ei * tab.na + ai];
}

/** What one worn shell measured, in millimetres. */
export interface ShellFit {
  tag: string;
  /** Deepest the shell's INNER wall gets inside the skin. 0 is seated. */
  punchMm: number;
  /** Deepest the SKIN gets outside the shell's outer wall — face through metal. */
  throughMm: number;
  /** Where that happens, in the head's own (u, v). NaN if there is none. */
  throughU: number;
  throughV: number;
  /**
   * The largest standoff the shell ASKS FOR, in mm — the lift itself.
   *
   * Not the radial gap to the skin under it, which over-reads by design: a brow
   * band is supposed to overhang a forehead that curves away, and a plate hinged
   * past the jaw is supposed to have air behind it. What decides whether a helm
   * reads as worn is the number the author wrote, and this is that number.
   */
  standoffMm: number;
  /**
   * The SMALLEST standoff the shell asks for — where it lands on the head.
   *
   * A shell whose minimum is large is not worn, it is parked: there is no point
   * on it within a liner's thickness of the skull. That is the owner's "the
   * helms hover", and it is a different fault from a crown that stands proud,
   * which is silhouette and is what a player is buying.
   */
  minLiftMm: number;
  /** Fraction of samples where the offset has turned the sheet inside out. */
  foldFrac: number;
  /** Where the worst of it is, in the head's own (u, v). NaN if it is clean. */
  foldU: number;
  foldV: number;
}

export interface HelmFit {
  helm: string;
  cls: string;
  seed: number;
  shells: ShellFit[];
}

/**
 * Measure how a helmet actually sits on a head it is actually built on.
 *
 * Builds the character — the real `buildCharacter`, the real materials fallback,
 * the real per-seed face — with the spy open, then walks every shell the helm
 * code asked for. `tools/wearmeasure.mjs` holds the bars; this only reports, so
 * that a bar can be argued with without recompiling the game.
 *
 * THE FOLD TEST is the one that matters and it is worth being exact about,
 * because it is the fault behind four helmets. A sheet offset along its normal
 * by more than the surface's radius of curvature turns inside out — the metal
 * crosses itself, its facets face backwards, and the skin the fold uncovers is
 * nowhere near the (u, v) the sheet was drawn at. That is what draws as a slab
 * with a face punching through it. It is detected by comparing the offset
 * sheet's own orientation with the un-offset sheet's at the same parameters:
 * same winding, same two tangents, so any sign flip between them is the fold and
 * nothing else. Comparing against an *outward* normal instead would only measure
 * how the patch happens to be wound.
 */
export function helmFitProbe(cls: WarriorClass, seed: number, helm: string): HelmFit {
  const spy: WornShellSpec[] = [];
  const prev = _wearSpy;
  _wearSpy = spy;
  try {
    const ap = { ...defaultAppearance(cls), helm };
    buildCharacter(cls, ap, 0x8a6b3f, undefined, "high", seed);
  } finally {
    _wearSpy = prev;
  }
  // The same skull `buildCharacter` just used: `identity` is the seed it was
  // handed, and the stature step it quantises to scales the skeleton the head is
  // measured in, so the skull has to be rebuilt through the same two lines.
  const step = Math.round(hash(seed, 31) * 2) - 1;
  const B = BUILD[cls] ?? BUILD.warden;
  const S = skeleton({ ...B, stature: B.stature * (1 + step * 0.022) });
  const K: Skull = { R: S.headR, F: faceTraits(seed) };
  const tab = skinRadii(K);

  const pOut = new THREE.Vector3();
  const pIn = new THREE.Vector3();
  const a1 = new THREE.Vector3();
  const a2 = new THREE.Vector3();
  const b1 = new THREE.Vector3();
  const b2 = new THREE.Vector3();
  const nOff = new THREE.Vector3();
  const nSkin = new THREE.Vector3();
  const ntrue = new THREE.Vector3();
  const dd = new THREE.Vector3();

  // Sampled the way the shell was built: on the low-passed form if it is a helm
  // piece, on the skin if it is hair or a beard. Measuring a form-swept shell
  // against the skin's own normals would report folds that are not in the metal
  // — and, worse, would miss the ones that are.
  const F = helmForm(K);
  const at = (o: WornShellSpec, t: number, s: number, drop: number, out: THREE.Vector3) => {
    const u = mix(o.u0, o.u1, t);
    const v = mix(o.v0(u), o.v1(u), s);
    if (o.form) {
      formSurface(F, u, v, out);
      if (drop !== 0) out.addScaledVector(formNormal(F, u, v, ntrue), drop);
      return out;
    }
    faceSurface(K, dirOf(u, v, dd), out);
    if (drop !== 0) {
      faceNormalTrue(K, u, v, ntrue);
      out.addScaledVector(ntrue, drop);
    }
    return out;
  };

  const shells: ShellFit[] = [];
  for (const o of spy) {
    // Untagged shells are hair, beard and war paint — a different owner's
    // geometry and a different owner's gate. This one holds helmets.
    if (!o.tag) continue;
    // Denser than the shell is tessellated, because a fold can open between two
    // of its own spans and still be a hole in the metal on screen.
    const NU = Math.max(12, o.nu * 3);
    const NV = Math.max(8, o.nv * 3);
    const ht = 0.25 / NU, hs = 0.25 / NV;
    let punch = 0, through = 0, standoff = 0, minLift = Infinity;
    let tu2 = NaN, tv2 = NaN;
    // The fold verdict is deferred, because it needs a scale. Every patch on a
    // sphere has samples where its own parameterisation collapses — at a pole
    // the u-tangent goes to nothing — and there the cross product is the
    // direction of the rounding error, so it flips sign at random. Those samples
    // are not folded metal; they are a coordinate singularity, and counting them
    // put a permanent 0.1-1% on the bowl and the band that no helmet could ever
    // clear. So the skin's own area element is measured alongside, and anything
    // under 2% of this shell's largest is discarded before the tally.
    const dots: number[] = [];
    const areas: number[] = [];
    const uvs: number[] = [];
    let areaMax = 0;
    for (let i = 0; i <= NU; i++) {
      for (let j = 0; j <= NV; j++) {
        const t = i / NU, s = j / NV;
        const u = mix(o.u0, o.u1, t);
        const lift = o.lift(u, s);
        at(o, t, s, lift - o.thick, pIn);
        at(o, t, s, lift, pOut);
        const cIn = skinClearance(tab, pIn);
        const cOut = skinClearance(tab, pOut);
        if (-cIn > punch) punch = -cIn;
        if (-cOut > through) { through = -cOut; tu2 = u; tv2 = mix(o.v0(u), o.v1(u), s); }
        if (lift > standoff) standoff = lift;
        if (lift < minLift) minLift = lift;
        // Orientation of the offset sheet against orientation of the skin under
        // it, both from the same two forward differences.
        const t2 = Math.min(1, t + ht), s2 = Math.min(1, s + hs);
        const u2 = mix(o.u0, o.u1, t2);
        a1.copy(at(o, t2, s, o.lift(u2, s), b1)).sub(pOut);
        a2.copy(at(o, t, s2, o.lift(u, s2), b2)).sub(pOut);
        nOff.crossVectors(a2, a1);
        at(o, t, s, 0, pIn);
        a1.copy(at(o, t2, s, 0, b1)).sub(pIn);
        a2.copy(at(o, t, s2, 0, b2)).sub(pIn);
        nSkin.crossVectors(a2, a1);
        const area = nSkin.length();
        if (area > areaMax) areaMax = area;
        areas.push(area);
        uvs.push(u, mix(o.v0(u), o.v1(u), s));
        dots.push(nOff.dot(nSkin));
      }
    }
    let folds = 0, n = 0, worst = 0, fu = NaN, fv = NaN;
    for (let i = 0; i < dots.length; i++) {
      if (areas[i] < areaMax * 0.02) continue;
      n++;
      if (dots[i] >= 0) continue;
      folds++;
      // The deepest inversion, not the first: an edge sample that grazes zero is
      // a rounding call, and the middle of a folded region is where to look.
      const depth = -dots[i] / Math.max(1e-30, areas[i]);
      if (depth > worst) { worst = depth; fu = uvs[i * 2]; fv = uvs[i * 2 + 1]; }
    }
    shells.push({
      tag: o.tag,
      punchMm: punch * 1000,
      throughMm: through * 1000,
      throughU: tu2,
      throughV: tv2,
      standoffMm: standoff * 1000,
      minLiftMm: (Number.isFinite(minLift) ? minLift : 0) * 1000,
      foldFrac: folds / Math.max(1, n),
      foldU: fu,
      foldV: fv,
    });
  }
  return { helm, cls, seed, shells };
}

function headGeometry(K: Skull, nu: number, nv: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rings: number[] = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) {
    const v = -Math.PI / 2 + (j / nv) * Math.PI;
    rings.push(pos.length / 3);
    for (let i = 0; i <= nu; i++) {
      // Started at the nape rather than dead ahead. `dirOf(0, v)` is +z — the front
      // of the face — so the ring's duplicated seam vertex, where the UV wraps from
      // 1 back to 0, ran straight down the middle of the nose. The normals are
      // welded (see below) but a texture wrap is not weldable: the skin map steps
      // along that line. It does not read as a seam at the tile density and
      // complexions this ships with, so this is insurance rather than a fix — but
      // insurance on the centreline of a face is worth one addition, and the nape is
      // under the hair on every style but Shaved.
      const u = Math.PI + (i / nu) * Math.PI * 2;
      faceSurface(K, dirOf(u, v, _d), p);
      pos.push(p.x, p.y, p.z);
      uv.push(i / nu, j / nv);
    }
  }
  const stride = nu + 1;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride + 1;
      const e = a + stride;
      idx.push(a, b, c, a, c, e);
    }
  }
  const g = finish(pos, uv, idx);
  weldRingNormals(g, rings, nu);
  return g;
}

/**
 * The spec of one worn shell, in the form `headWear` is asked for it.
 *
 * Named as a type of its own for one reason: `helmFitProbe` has to be able to
 * measure the shells a helmet is ACTUALLY built from rather than a copy of them
 * kept in a tool. `tools/shoot.mjs` carries the story of the last instrument
 * that mirrored this file — a helmet ladder duplicated into a harness, which
 * then agreed with itself and passed a helm nobody could tell apart. A gate that
 * reads the real call arguments cannot drift from the build, because it *is* the
 * build.
 */
export interface WornShellSpec {
  /**
   * What this shell is, for a failure message. Optional because the head wears
   * hair, beards and paint too and those are somebody else's shells; the helm
   * code tags every piece it builds, and an untagged shell measures as `?`.
   */
  tag?: string;
  u0: number; u1: number;
  v0: (u: number) => number; v1: (u: number) => number;
  nu: number; nv: number; wrapU?: boolean;
  lift(u: number, v: number): number;
  thick: number;
  /** Set by `helmWear`: this shell rides the form, not the skin. */
  form?: boolean;
}

/**
 * When non-null, every `headWear` call records its spec here. Set and cleared by
 * `helmFitProbe` and by nothing else — it is a measuring tap on the build, not a
 * feature of it, and the build behaves identically whether or not it is open.
 */
let _wearSpy: WornShellSpec[] | null = null;

/**
 * Anything worn on the head: hair, beard, war paint, a helm bowl, a hood. `lift`
 * is how far proud of the skin it stands, so a helm can sit over hair that sits
 * over the skull without any of the three intersecting.
 */
function headWear(K: Skull, opts: WornShellSpec): THREE.BufferGeometry {
  if (_wearSpy) _wearSpy.push(opts);
  const surf = (t: number, s: number, offset: number, out: THREE.Vector3) => {
    const u = mix(opts.u0, opts.u1, t);
    const v = mix(opts.v0(u), opts.v1(u), s);
    dirOf(u, v, _d);
    faceSurface(K, _d, out);
    // The normal of the head as built, not of the ellipsoid it started as. Using
    // the latter here is what sheared four helms through the face — see
    // `faceNormalTrue` and `wearNormalProbe` for the measurement.
    faceNormalTrue(K, u, v, _n);
    out.addScaledVector(_n, offset);
  };
  return patch({
    nu: opts.nu,
    nv: opts.nv,
    wrapU: opts.wrapU,
    outer: (t, s, out) => surf(t, s, opts.lift(mix(opts.u0, opts.u1, t), s), out),
    inner: (t, s, out) => surf(t, s, opts.lift(mix(opts.u0, opts.u1, t), s) - opts.thick, out),
  });
}

// ============================================================
// THE FORM — what a helm is actually beaten over
// ============================================================
//
// A helmet is not shrink-wrap. It is raised over a block, and the block is the
// shape of a skull, not the shape of a face: a smith does not planish a hollow
// for a nasolabial fold. Every helm shell used to be swept on `faceSurface`
// itself, which carries the brow ridge, the glabella, the zygomatic crest and
// the alar crease — features 10 to 20 mm across — and THAT is the arithmetic
// behind "slabs with skin punching through".
//
// The mechanism, stated once because it is the whole of this pass: offsetting a
// surface along its own normal by more than its radius of curvature turns the
// surface INSIDE OUT. Past that distance the offset self-intersects; its facets
// face backwards, backface culling removes them, and what the player sees
// through the hole is the head. The brow ridge has a radius of curvature of
// about 15 mm. The spectacle plate stands off it by 18 and the nasal's rivet
// plate by 26. Neither of them could ever have worked, at any lift direction,
// because the fault is not in the direction — `faceNormalTrue` fixed that and
// four helmets stayed broken. `helmFitProbe` counts the inverted share: 32% of
// the nasal plate, 17% of the brow plate, 6-11% of both cheek guards.
//
// So the shells come off a low-passed copy of the head. The features go; the
// skull, the class's dome, the per-warrior breadth and the jaw's sweep all stay,
// because those are 60-to-200 mm shapes and the filter is a 12 mm one. Nothing
// on the form has a radius of curvature under about 45 mm, so a 30 mm standoff
// cannot fold it.
//
// The Sutton Hoo mask has done exactly this since it was built — it is the one
// piece the audit passes — and this generalises its `shell` to the whole helm
// tier rather than leaving it as the expensive helmet's private trick.
//
// COST. Blurring per vertex is what the mask does and it costs 17 field samples
// a point; over a bowl, a band, four ribs and two guards that is a helmet an
// order of magnitude dearer than the head under it, on a game whose floor is a
// mid-range phone. So the filter runs ONCE per skull, on a grid, and the shells
// read it: 2701 field samples and a few binomial passes, against ~1200 for the
// head itself. The grid is coarse on purpose — it is a low-pass, and a low-pass
// reconstructed bilinearly at 0.09 rad is accurate to about a tenth of a
// millimetre on a shape whose smallest feature is 45 mm.

interface HelmForm {
  nu: number;
  nv: number;
  /** (nu+1) x (nv+1) x 3, u wrapping with a duplicated seam column. */
  pos: Float64Array;
  nrm: Float64Array;
}

const _formCache = new WeakMap<Skull, HelmForm>();

/**
 * The low-passed head, tabulated and cached per skull.
 *
 * Smoothed in table space rather than by a per-sample kernel, which is the same
 * filter for a hundredth of the field evaluations: four passes of a binomial
 * [1 2 1] over a 0.087 rad grid is a gaussian of sigma 0.12 rad, about 11 mm on
 * this head. Wrapping in u because the head is closed round; clamped in v
 * because it is not closed over the poles, and a pole row averaged with its
 * antipode would pull the crown into the chin.
 */
function helmForm(K: Skull): HelmForm {
  const hit = _formCache.get(K);
  if (hit) return hit;
  const nu = 72, nv = 36;
  const w = nu + 1, h = nv + 1;
  const pos = new Float64Array(w * h * 3);
  const d = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let j = 0; j < h; j++) {
    const v = -Math.PI / 2 + (j / nv) * Math.PI;
    for (let i = 0; i < w; i++) {
      const u = (i / nu) * Math.PI * 2;
      faceSurface(K, dirOf(u, v, d), p);
      const k = (j * w + i) * 3;
      pos[k] = p.x; pos[k + 1] = p.y; pos[k + 2] = p.z;
    }
  }
  const tmp = new Float64Array(pos.length);
  for (let pass = 0; pass < 4; pass++) {
    // u, wrapping. Column nu is the duplicate of column 0 and is rewritten from
    // it afterwards rather than filtered, so the seam cannot drift.
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < nu; i++) {
        const a = ((i - 1 + nu) % nu), b = ((i + 1) % nu);
        for (let c = 0; c < 3; c++) {
          tmp[(j * w + i) * 3 + c] =
            0.25 * pos[(j * w + a) * 3 + c] + 0.5 * pos[(j * w + i) * 3 + c] + 0.25 * pos[(j * w + b) * 3 + c];
        }
      }
      for (let c = 0; c < 3; c++) tmp[(j * w + nu) * 3 + c] = tmp[(j * w) * 3 + c];
    }
    // v, clamped.
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < h; j++) {
        const a = Math.max(0, j - 1), b = Math.min(nv, j + 1);
        for (let c = 0; c < 3; c++) {
          pos[(j * w + i) * 3 + c] =
            0.25 * tmp[(a * w + i) * 3 + c] + 0.5 * tmp[(j * w + i) * 3 + c] + 0.25 * tmp[(b * w + i) * 3 + c];
        }
      }
    }
  }
  // Normals off the smoothed table, central in u and one-sided at the poles.
  const nrm = new Float64Array(pos.length);
  const tu = new THREE.Vector3();
  const tv = new THREE.Vector3();
  const nn = new THREE.Vector3();
  const rd = new THREE.Vector3();
  const get = (i: number, j: number, out: THREE.Vector3) => {
    const k = (j * w + (i % nu)) * 3;
    return out.set(pos[k], pos[k + 1], pos[k + 2]);
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const im = (i - 1 + nu) % nu, ip = (i + 1) % nu;
      tu.subVectors(get(ip, j, a), get(im, j, b));
      const jm = Math.max(0, j - 1), jp = Math.min(nv, j + 1);
      tv.subVectors(get(i % nu, jp, a), get(i % nu, jm, b));
      nn.crossVectors(tv, tu);
      const u = (i / nu) * Math.PI * 2;
      const v = -Math.PI / 2 + (j / nv) * Math.PI;
      if (nn.lengthSq() < 1e-18) faceNormal(K, dirOf(u, v, rd), nn);
      else {
        nn.normalize();
        if (nn.dot(faceNormal(K, dirOf(u, v, rd), a)) < 0) nn.negate();
      }
      const k = (j * w + i) * 3;
      nrm[k] = nn.x; nrm[k + 1] = nn.y; nrm[k + 2] = nn.z;
    }
  }
  const form: HelmForm = { nu, nv, pos, nrm };
  _formCache.set(K, form);
  return form;
}

/** Bilinear read of one of the form's two tables. */
function formRead(F: HelmForm, tab: Float64Array, u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
  const w = F.nu + 1;
  let fu = (u / (Math.PI * 2)) * F.nu;
  fu = ((fu % F.nu) + F.nu) % F.nu;
  const fv = Math.min(F.nv, Math.max(0, ((v + Math.PI / 2) / Math.PI) * F.nv));
  const i = Math.min(F.nu - 1, Math.floor(fu));
  const j = Math.min(F.nv - 1, Math.floor(fv));
  const s = fu - i, t = fv - j;
  const k00 = (j * w + i) * 3, k10 = k00 + 3;
  const k01 = ((j + 1) * w + i) * 3, k11 = k01 + 3;
  out.set(
    (tab[k00] * (1 - s) + tab[k10] * s) * (1 - t) + (tab[k01] * (1 - s) + tab[k11] * s) * t,
    (tab[k00 + 1] * (1 - s) + tab[k10 + 1] * s) * (1 - t) + (tab[k01 + 1] * (1 - s) + tab[k11 + 1] * s) * t,
    (tab[k00 + 2] * (1 - s) + tab[k10 + 2] * s) * (1 - t) + (tab[k01 + 2] * (1 - s) + tab[k11 + 2] * s) * t,
  );
  return out;
}

/** A point on the form. */
function formSurface(F: HelmForm, u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
  return formRead(F, F.pos, u, v, out);
}

/** The form's outward normal — interpolated, then renormalised. */
function formNormal(F: HelmForm, u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
  formRead(F, F.nrm, u, v, out);
  return out.lengthSq() < 1e-12 ? out.set(0, 1, 0) : out.normalize();
}

/**
 * `headWear`, but swept on the form instead of on the skin — the sampler every
 * piece of a helmet uses. See the block above for why the two are different
 * functions and not a flag.
 */
function helmWear(K: Skull, opts: WornShellSpec): THREE.BufferGeometry {
  if (_wearSpy) _wearSpy.push({ ...opts, form: true });
  const F = helmForm(K);
  const surf = (t: number, s: number, offset: number, out: THREE.Vector3) => {
    const u = mix(opts.u0, opts.u1, t);
    const v = mix(opts.v0(u), opts.v1(u), s);
    formSurface(F, u, v, out);
    formNormal(F, u, v, _n);
    out.addScaledVector(_n, offset);
  };
  return patch({
    nu: opts.nu,
    nv: opts.nv,
    wrapU: opts.wrapU,
    outer: (t, s, out) => surf(t, s, opts.lift(mix(opts.u0, opts.u1, t), s), out),
    inner: (t, s, out) => surf(t, s, opts.lift(mix(opts.u0, opts.u1, t), s) - opts.thick, out),
  });
}

// ============================================================
// Eyes and mouth
// ============================================================
//
// An empty helmet is the loudest defect a character can have, and a black bead
// in a socket does not fix it — what reads as a man looking at you is a *pale*
// sclera cut to an almond by two lids, with something darker in the middle of it
// and a hard shadow line along the upper margin. All four of those are geometry
// here, because a painted eye on a sphere loses its shape the moment the head
// turns and the whole point is that the gaze survives the turn.

/**
 * Radius of the eyeball, in metres. It does not scale with *build* — a huscarl
 * and a runekeeper have the same eyes — but it does scale with the head, and
 * that is the correction this pass makes.
 *
 * It is also a hard ceiling on `EyeFrame.wA`, and that is worth stating because
 * breaking it costs an afternoon. Every part of the eye is placed by solving
 * `z = √(r² − x² − y²)` on this sphere, so a palpebral half-width past the radius
 * makes the term negative, `globePatch` clamps it to nothing, and the sclera and
 * both lids collapse to a flat sliver at each canthus — which renders as a pale
 * grey wedge beside the eye. A man's palpebral fissure measures 28–30 mm *across
 * the skin*, but the aperture is an arc on the ball: the chord can never be
 * wider than the ball.
 *
 * 24.4 mm was life, and life is the wrong number here, which is note 5's "the
 * eye is small and beady inside its new socket". This head is not life-sized: it
 * is 269 mm menton to vertex where a man's is 232, because the figure is drawn
 * at a heroic 7.3 heads. Every other feature on it was scaled by that 1.16 and
 * the eyeball was left at anatomical size, so the aperture fell from a life
 * 0.129 of head height to 0.080 — which is precisely a doll's eye, and no amount
 * of socket depth fixes it because the socket is the thing making it look small.
 * 28.4 mm is 24.4 taken up with the rest of the skull. The lids, the sclera, the
 * iris and the lash line are all solved off this radius, so they follow.
 */
const GLOBE = 0.0142;

const UP_AXIS = new THREE.Vector3(0, 1, 0);

/** The orbit, resolved into a frame the eye's parts can all be built in. */
interface EyeFrame {
  /** Globe centre, in head space — buried in the skull, not sitting on it. */
  c: THREE.Vector3;
  /** Laterally outward, toward the temple. */
  lat: THREE.Vector3;
  up: THREE.Vector3;
  fwd: THREE.Vector3;
  /** Palpebral fissure: half-width, half-height at the centre, canthal tilt. */
  wA: number; hA: number; tilt: number;
  /** Where the lid dies into the socket, as an offset on the skull's own u/v. */
  uE: number; vE: number;
}

function eyeFrame(K: Skull, side: number): EyeFrame {
  const uE = side * 0.355 * K.F.eyeU;
  // On the head's mid-height, where a human's eyes are. It used to be 0.085 —
  // 40% of the way down from the crown instead of 50% — and the whole face was
  // dragged up with it. See `Y_EYE`.
  const vE = lat(Y_EYE) + K.F.eyeV;
  const dir = dirOf(uE, vE, new THREE.Vector3());
  const fwd = faceNormal(K, dir, new THREE.Vector3());
  // A frame built off world up rather than off the skull's poles, so the eye
  // stays level whichever way the socket normal happens to point.
  const base = new THREE.Vector3().crossVectors(UP_AXIS, fwd).normalize();
  const up = new THREE.Vector3().crossVectors(fwd, base).normalize();
  // The socket floor the displacement field already dug, with the globe set so
  // its cornea stands 11 mm proud of it. Measured, not guessed: that puts the
  // cornea 22 mm behind the brow ridge, which is a heavy-browed but human orbit —
  // deep enough that the brow's shadow crosses the eye, shallow enough that the
  // key still finds the iris. At 6.5 mm it was 27 mm behind and the socket read
  // as the void it was supposed to be replacing.
  const floor = faceSurface(K, dir, new THREE.Vector3());
  const c = floor.addScaledVector(fwd, 0.013 - GLOBE);
  // `lat` stays with the skull's +x rather than flipping to "outward", so
  // (lat, up, fwd) is right-handed on both sides of the face. That matters: every
  // patch below takes its winding from that cross product, and a mirrored frame
  // renders one eye inside out — which is invisible in a still and unmistakable
  // the moment the head turns. The canthal tilt carries the side instead. (It is
  // also nothing to do with the module's `lat()` landmark helper.)
  //
  // The palpebral fissure. 21.6 × 11.2 mm was already the ceiling the old globe
  // would take, and it was still a doll's eye — the ceiling was the problem, not
  // the setting. With the globe scaled to the head (see `GLOBE`) the same solve
  // now allows 25.2 × 13.0, which puts the aperture at 0.093 of head height
  // against a life 0.129 measured across the skin. It is still under life and
  // that is deliberate: this is the *chord*, and a real fissure's outer
  // measurement runs over the curve of the lids and past the medial canthal fold.
  // `hA` scales with `eyeOpen`, so a narrow-eyed warrior reads as squinting
  // rather than as small-eyed.
  return {
    c, lat: base, up, fwd,
    wA: 0.0126, hA: 0.0065 * K.F.eyeOpen, tilt: side * 0.0019,
    uE, vE,
  };
}

/**
 * A shell lying on the globe: sclera, iris, pupil. `extent` returns where in the
 * eye's tangent plane the sample sits and the sphere supplies the depth, so every
 * one of the three is curved with the eyeball rather than pasted flat across it.
 */
function globePatch(
  f: EyeFrame,
  radius: number,
  thick: number,
  nu: number,
  nv: number,
  extent: (t: number, s: number, out: THREE.Vector2) => void,
  wrapU?: boolean,
): THREE.BufferGeometry {
  const uv = new THREE.Vector2();
  const at = (t: number, s: number, r: number, out: THREE.Vector3) => {
    extent(t, s, uv);
    const zz = Math.sqrt(Math.max(1e-8, r * r - uv.x * uv.x - uv.y * uv.y));
    out.copy(f.c).addScaledVector(f.lat, uv.x).addScaledVector(f.up, uv.y).addScaledVector(f.fwd, zz);
  };
  return patch({
    nu, nv, wrapU,
    outer: (t, s, out) => at(t, s, radius, out),
    inner: (t, s, out) => at(t, s, radius - thick, out),
  });
}

/** Half-height of the fissure along its length — zero at both canthi. */
const fissure = (f: EyeFrame, tt: number) => f.hA * Math.pow(Math.max(0, 1 - tt * tt), 0.62);

/**
 * An eyelid, built as the bridge it actually is: it starts on the globe at the
 * lid margin and ends buried in the socket rim, with a fold of volume in between.
 * Modelling it as a bridge rather than as a cap is what stops the eye reading as
 * a marble dropped into a hole — and the `s0` band is the lash line, which at
 * this scale carries more of the read than the lid itself.
 */
function lidPatch(
  K: Skull, f: EyeFrame, upper: boolean,
  nu: number, nv: number, s0: number, s1: number, thick: number,
): THREE.BufferGeometry {
  const sign = upper ? 1 : -1;
  const rL = GLOBE + 0.0016;
  // How far into the socket the lid dies, in latitude. The lower one is shallower
  // than it was: at 0.115 its bridge was 13 mm of up-facing skin below the eye and,
  // with `skin` now carrying a tighter specular lobe, it took the key square on and
  // rendered as a pale crescent — an under-eye bag, which is the second-worst thing
  // you can give a warrior after a glowing sclera.
  const rimDv = upper ? 0.115 : -0.072;
  const m = new THREE.Vector3();
  const rim = new THREE.Vector3();
  const n = new THREE.Vector3();
  const d = new THREE.Vector3();

  const at = (t: number, s: number, off: number, out: THREE.Vector3) => {
    // The lower lid runs the other way along the slit. Its `s` climbs downward,
    // so without reversing `t` the surface's own cross product points into the
    // skull and the lid vanishes to backface culling.
    const tt = sign * (t * 2 - 1);
    const x = tt * f.wA;
    const y = f.tilt * tt + sign * fissure(f, tt);
    const zz = Math.sqrt(Math.max(1e-8, rL * rL - x * x - y * y));
    m.copy(f.c).addScaledVector(f.lat, x).addScaledVector(f.up, y).addScaledVector(f.fwd, zz);
    // Sunk a fraction of a millimetre into the skull, so the lid's own rim strip
    // is buried instead of standing off the cheek as a step.
    //
    // The rim arches with the fissure rather than running level. Held flat, the
    // lid's far boundary was a straight arc while its near one was an almond, so
    // the whole lid rendered as a hard-edged trapezoid stuck over the eye. Dying
    // back toward both canthi is what makes it a fold.
    // 0.145 rad of rim, not 0.22. At 0.22 the lid's far boundary was 42 mm
    // across while the fissure it springs from is 21.6 — so the lid *widened*
    // as it went back into the socket, and what that draws is a lozenge of skin
    // twice the width of the eye with a hard edge all round it. Both frames of
    // `art/shots/wip/p2-*` show it as the pale almond stuck over each eye that
    // reads more strongly than the eye does. A lid converges on the canthi.
    const arch = 0.34 + 0.66 * Math.sqrt(Math.max(0, 1 - tt * tt));
    dirOf(f.uE + tt * 0.145, f.vE + rimDv * arch, d);
    faceSurface(K, d, rim);
    faceNormal(K, d, n);
    // 1.8 mm under the skin, not 0.7. The rim strip `patch` closes this boundary
    // with faces along the surface, so any of it left proud draws the lid's own
    // outline in a plane that takes the key square on — and that outline is what
    // survives at portrait range long after the fold has stopped reading.
    rim.addScaledVector(n, -0.0018);
    const e = mix(s0, s1, s);
    const w = e * e * (3 - 2 * e);
    out.lerpVectors(m, rim, w);
    out.addScaledVector(n, (upper ? 0.0024 : 0.0006) * Math.sin(Math.PI * w) + off);
  };
  return patch({
    nu, nv,
    outer: (t, s, out) => at(t, s, 0, out),
    inner: (t, s, out) => at(t, s, -thick, out),
  });
}

interface FaceMaterials {
  skin: THREE.Material;
  /** The form-shadow tone: socket, under the nose, under the lower lip. */
  shade: THREE.Material;
  /** Lips, ears, lid rims — and the bone that flushes. See `addFaceTones`. */
  warm: THREE.Material;
  sclera: THREE.Material;
  iris: THREE.Material;
  dark: THREE.Material;
  lash: THREE.Material;
}

/** Both eyes, their lids and their lashes, added into the head's part. */
function addEyes(p: Part, K: Skull, lod: Lod, place: THREE.Matrix4, M: FaceMaterials): void {
  const fine = lod.trim;
  for (const side of [-1, 1]) {
    const f = eyeFrame(K, side);

    // Sclera — the exposed almond only. Anything wider would be visible past
    // the lids as a ring of white, which is the one way to make a face look mad.
    p.add(globePatch(f, GLOBE, 0.0014, Math.max(4, lod.shellU - 4), 2, (t, s, out) => {
      const tt = t * 2 - 1;
      const hh = fissure(f, tt);
      out.set(tt * f.wA, f.tilt * tt + (s * 2 - 1) * hh);
    }), M.sclera, place.clone());

    // The upper lid's cast shadow, painted rather than traced.
    //
    // A lid standing 2 mm off a globe cannot throw a shadow a shadow map at this
    // cascade will resolve, and the shadow along the upper margin is the single
    // strongest cue that an eye is set into a head rather than stuck onto it. So
    // it is a band of the dark tone laid over the top third of the almond, sitting
    // 0.15 mm outboard of the sclera so it wins the depth test outright. Cheaper
    // than any shadow, and it survives the head turning, which a baked one would
    // not.
    p.add(globePatch(f, GLOBE + 0.00015, 0.0002, Math.max(4, lod.shellU - 4), 1, (t, s, out) => {
      const tt = t * 2 - 1;
      const hh = fissure(f, tt);
      out.set(tt * f.wA, f.tilt * tt + mix(0.68, 1.0, s) * hh);
    }), M.dark, place.clone());

    // Iris, then pupil, each a shallow disc lying on the globe. Low roughness on
    // the iris material is the catchlight: one specular dot off the key is worth
    // more than any amount of iris detail.
    // The angle runs backwards for the same winding reason the lower lid does.
    const rI = 0.0061;
    p.add(globePatch(f, GLOBE + 0.00035, 0.0003, fine ? 10 : 6, 2, (t, s, out) => {
      const a = -t * Math.PI * 2;
      out.set(Math.cos(a) * rI * s, Math.sin(a) * rI * s);
    }, true), fine ? M.iris : M.dark, place.clone());
    if (fine) {
      // Limbal ring: the dark rim a real iris has where it meets the sclera. Two
      // hundred triangles, and it is what stops the iris reading as a flat dot at
      // the distance the eye is actually seen from.
      p.add(globePatch(f, GLOBE + 0.0005, 0.0002, 10, 1, (t, s, out) => {
        const a = -t * Math.PI * 2;
        const r = mix(rI * 0.84, rI, s);
        out.set(Math.cos(a) * r, Math.sin(a) * r);
      }, true), M.dark, place.clone());
      const rP = 0.0024;
      p.add(globePatch(f, GLOBE + 0.0007, 0.0003, 8, 1, (t, s, out) => {
        const a = -t * Math.PI * 2;
        out.set(Math.cos(a) * rP * s, Math.sin(a) * rP * s);
      }, true), M.dark, place.clone());
    }

    // Lids, and every one of them is in the *base* tone now.
    //
    // The upper lid used to wear `shade` on the argument that a lid at the bottom
    // of an orbit is in the socket's own shadow, which is true — and the argument
    // still cost the eye its read, because a lid in a different material from the
    // skin round it draws a hard tonal step exactly where the fold's silhouette
    // is. Two materials meeting on an open plane is a boundary; the eye reads a
    // boundary as an edge of an object, and the object it read was a beige almond
    // laid over the face. The value is still there — the complexion field digs
    // the orbit 30% down and cuts the crease under the brow ridge on top of it —
    // but now it arrives as a gradient with no boundary in it at all, and it
    // carries across the lid, the socket and the cheek as one surface.
    const nu = Math.max(5, lod.shellU - 3);
    p.add(lidPatch(K, f, true, nu, 2, 0.12, 1, 0.0013), M.skin, place.clone());
    p.add(lidPatch(K, f, false, nu, 2, 0.1, 1, 0.0011), M.skin, place.clone());
    if (fine) {
      // Lash line: one narrow band in hair, right on the margin. This is the only
      // part of the lid that is allowed a material of its own, because a lash line
      // IS a hard dark edge — it is the one boundary on the eye the eye expects.
      p.add(lidPatch(K, f, true, nu, 1, 0, 0.13, 0.0009), M.lash, place.clone());
      p.add(lidPatch(K, f, false, nu, 1, 0, 0.11, 0.0008), M.skin, place.clone());
    }
  }
}

/**
 * The mouth: one dark line, and nothing else.
 *
 * It used to be four lifted bands — an upper lip, a lower lip, the fissure and a
 * wedge at each corner — and every pass on it moved the same defect around. A
 * band lying on the skin is a separate surface with a silhouette of its own, so
 * however soft its tone and however buried its rim, it draws thin bright edges
 * across the mouth: `art/shots/wip/p5-*` has five of them stacked, and the read
 * is a wound rather than a mouth.
 *
 * The lips are geometry the *skull* carries. `faceSurface` already cuts the oral
 * fissure, rolls a vermilion above and below it, and shelves the chin under the
 * lower one — those terms were being buried under the bands that were supposed
 * to be showing them — and at 44 rows on every tier they finally sample. The
 * colour is the complexion field's `lip` channel, feathered over the whole mouth
 * with no boundary anywhere in it.
 *
 * What is left is the one thing neither a displacement nor a tint can do at
 * seventy pixels: the fissure itself, which is not a shadow but a *slot*, and
 * which the eye needs as a hard dark line before it will read a mouth at all.
 */
function addMouth(p: Part, K: Skull, lod: Lod, place: THREE.Matrix4, M: FaceMaterials): void {
  const w = 0.25 * K.F.mouth;
  const nu = Math.max(6, lod.shellU - 2);
  // Pinched to nothing at both corners, so the line ends where the lips end
  // instead of stopping dead — the square lobe on each end of the old letterbox.
  const half = (u: number) => 0.0155 * Math.pow(1 - Math.pow(clamp01(Math.abs(u) / w), 1.7), 0.55);
  p.add(headWear(K, {
    u0: -w, u1: w,
    v0: (u) => lat(Y_LIP) - half(u),
    v1: (u) => lat(Y_LIP) + half(u),
    nu, nv: 1,
    // Sunk, not raised. A fissure is the one feature on a face that is *behind*
    // the surface, and a dark strip standing proud of it catches the key on its
    // own rim and renders as a bright bar — which is the black-line-with-a-white-
    // edge in every portrait this build has taken.
    lift: () => -0.0006, thick: 0.0006,
  }), M.dark, place.clone());
}

/**
 * A plait — strands wound about a common path — and the reason it is a function
 * rather than four more lines at each call site.
 *
 * `Braided War-locks` costs 100 gold and `Ringed Braid` costs 120, and both were
 * built the same way: four spheres of falling radius stacked down the path with
 * a brass ring under them. That is a rosary. It has no twist, no strands, and no
 * silhouette a shaved head does not have — the audit lists both of them in its
 * worst-first table for exactly that reason, and they are the two most expensive
 * things in their slots.
 *
 * A plait is three strands crossing over one another, and what makes it read as
 * one at any distance is the *chevron*: the strand boundaries run diagonally
 * across the rope and alternate. So each strand is swept as its own tapering
 * tube around a helix on the common path, and the helix is what draws the
 * chevron for free. Three of them at a third of a turn apart interlock; the
 * radius they orbit at is a shade under a strand radius so they touch rather
 * than gap.
 *
 * `path` is sampled in t ∈ [0, 1] and returns a point in the part's own space.
 * The frame is built off world up, which is right for everything this dresses —
 * hair and beards hang — and avoids the twist a Frenet frame develops on a path
 * with an inflection in it.
 */
function braid(
  path: (t: number, out: THREE.Vector3) => void,
  opts: {
    strands?: number;
    /** Full turns of the plait over the whole length. */
    turns: number;
    /** Half-width of the whole rope at t. */
    radius: (t: number) => number;
    rows: number;
    ring: number;
  },
): THREE.BufferGeometry {
  const n = opts.strands ?? 3;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const P = new THREE.Vector3();
  const stride = opts.ring + 1;

  for (let k = 0; k < n; k++) {
    const base = pos.length / 3;
    for (let j = 0; j <= opts.rows; j++) {
      const t = j / opts.rows;
      path(t, c);
      path(Math.min(1, t + 0.02), ahead);
      tan.subVectors(ahead, c);
      if (tan.lengthSq() < 1e-10) tan.set(0, -1, 0);
      tan.normalize();
      side.set(1, 0, 0).cross(tan);
      if (side.lengthSq() < 1e-8) side.set(0, 0, 1).cross(tan);
      side.normalize();
      up.crossVectors(tan, side).normalize();
      // The rope's half-width, split into how far a strand orbits and how fat it
      // is. At n = 3 a strand sitting at 0.46 of the rope with a radius of 0.54
      // of it just closes the gaps between its neighbours.
      const R = opts.radius(t);
      const orbit = R * 0.46;
      const rS = R * 0.54;
      const phase = (k / n + t * opts.turns) * Math.PI * 2;
      const cx = Math.cos(phase) * orbit;
      const cy = Math.sin(phase) * orbit;
      for (let i = 0; i <= opts.ring; i++) {
        const a = (i / opts.ring) * Math.PI * 2;
        const dx = cx + Math.cos(a) * rS;
        const dy = cy + Math.sin(a) * rS;
        P.copy(c).addScaledVector(side, dx).addScaledVector(up, dy);
        pos.push(P.x, P.y, P.z);
        uv.push(i / opts.ring, t);
      }
    }
    for (let j = 0; j < opts.rows; j++) {
      for (let i = 0; i < opts.ring; i++) {
        const a = base + j * stride + i;
        idx.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
      }
    }
  }
  return finish(pos, uv, idx);
}

// ============================================================
// Complexion — the tonal map and the war paint, as one field
// ============================================================
//
// This replaces six lifted patches, and the change is architectural rather than
// a retune, so it is worth stating what was wrong with the patches before it.
//
// A tone laid on the face as `headWear` geometry is a *sticker*. `patch` closes
// every boundary with a rim strip, so the shape draws its own outline; the
// boundary is a polygon edge, so it is hard however soft the intent; and the
// piece stands half a millimetre off the skin, so at a three-quarter bearing its
// corners are visible standing proud of the cheek. Three separate passes tried
// to make that work by moving the boundaries into creases where a hard edge
// could hide, and the frames kept coming back with the same words on them —
// black eye, blusher, a healing cut, make-up. `art/shots/wip/p2-*` is the last
// of them: a face carrying a dark almond over each eye, a maroon lens on the
// upper lip, a pink one below it and a brown one under that, every one with
// visible corners.
//
// The lever that was never used is the head's own vertices. The face is one
// merged geometry cached per identity, so a colour attribute on it costs no draw
// call, no material and no texture — and a *field* has no boundary at all. Every
// term below is a gaussian, so the tone it lays down is feathered over
// centimetres by construction and cannot draw an outline no matter how strong it
// is. That is what lets it be strong enough to matter: the arena's night rig
// puts most of its light either omnidirectionally or straight down the camera
// axis, so the sculpt underneath cannot shade itself, and this is the half of
// the face that does the shading.
//
// The war paint rides the same field, which fixes the audit's fourth finding
// against the slot outright. Paint is now part of the skin rather than a lifted
// shell, so it survives every helmet automatically — it is drawn wherever skin
// is drawn, which under the Sutton Hoo mask is the jaw and the throat, and every
// mark below deliberately runs down onto them.

/** How a mark is drawn: coverage in 0..1 at a point on the skull's own field. */
type PaintMark = (ax: number, x: number, y: number, z: number, front: number) => number;

/**
 * Ragged-edged, and that is the whole difference between paint and a decal. A
 * mark made with fingers or a thumb has an edge that wanders by a few
 * millimetres; a mark made with a boolean has an edge that is exactly a curve,
 * and at seventy pixels the eye reads the second one as a sticker. Every
 * boundary below is broken by two cosines whose periods are coprime, so the
 * wander never repeats within one mark.
 */
const jag = (t: number, a: number, f: number) => a * (Math.cos(t * f) + 0.55 * Math.cos(t * f * 2.37 + 1.7));

const WAR_PAINT: Record<string, { color: number; mark: PaintMark }> = {
  // BLOOD STRIPES — three raked bars down each cheek, wide at the cheekbone and
  // dying below the jaw. They used to be three parallel verticals on ONE side of
  // the face, running from the lip to above the brow: a bar code, and only on
  // his left. Three fingers dragged down through blood is the thing this is
  // meant to be, so the bars now converge slightly as they fall, taper at both
  // ends, and carry past the mandible onto the throat — which is where they stay
  // visible under a helmet with cheek guards, and under the mask.
  stripes: {
    color: 0x7c1d10,
    mark: (ax, x, y, z, front) => {
      let cover = 0;
      for (let i = 0; i < 3; i++) {
        // The rake: each bar leans out as it climbs, so the three fan open at the
        // cheekbone the way a hand's fingers do. Started at 0.42 rather than 0.30
        // so the inner bar lands on the cheek and not on the wing of the nose.
        const centre = 0.42 + i * 0.21 + (y - Y_EYE) * 0.22;
        const half = 0.055 + 0.013 * smooth(Y_CHIN, Y_EYE, y) + jag(y * 21 + i * 3.1, 0.011, 1);
        // The transition band is a tenth of the bar's width, not half of it. At
        // half the bars had no edge at all: three overlapping gaussians washed
        // the whole cheek pink, which is a bruise. Paint drawn with a finger has
        // a hard edge with a ragged line to it, and `jag` supplies the raggedness
        // — the smoothstep only has to stop it aliasing.
        const across = 1 - smooth(half * 0.88, half, Math.abs(ax - centre));
        const along = smooth(Y_CHIN - 0.34, Y_CHIN - 0.10, y) * (1 - smooth(Y_EYE + 0.04, Y_EYE + 0.16, y));
        cover = Math.max(cover, across * along);
      }
      return cover * front;
    },
  },
  // RAVEN CROSS — the pitch band across the eyes and the bar down the midline.
  // Both were rectangles in (u, v). The band is now notched over the nose (paint
  // does not bridge a dorsum in one stroke) and dies before the ear rather than
  // stopping dead at a u limit, and the bar runs the full height of the face,
  // over the ridge of the nose and down over the chin onto the throat, which is
  // the part a mask leaves showing.
  cross: {
    color: 0x15192b,
    mark: (ax, x, y, z, front) => {
      const bandMid = Y_EYE + 0.045 - 0.055 * smooth(0.15, 0.95, ax);
      const bandHalf = 0.150 * (1 - Math.pow(clamp01(ax / 1.02), 2.6)) + jag(ax * 17, 0.014, 1);
      const band = 1 - smooth(bandHalf * 0.86, bandHalf, Math.abs(y - bandMid));
      // The notch: the stroke lifts off the bridge of the nose, so the two halves
      // read as two strokes of one hand rather than as a ruled line.
      const notch = 1 - 0.55 * (1 - smooth(0.055, 0.135, ax)) * smooth(Y_NOSE, Y_EYE + 0.05, y);
      const barHalf = 0.085 + 0.035 * smooth(Y_BROW, Y_CHIN, -y) + jag(y * 19, 0.012, 1);
      const bar = (1 - smooth(barHalf * 0.84, barHalf, ax))
        * smooth(-1.05, -0.86, y) * (1 - smooth(Y_BROW + 0.30, Y_BROW + 0.50, y));
      return Math.max(band * notch, bar) * front;
    },
  },
  // HALF-FACE SHADOW — one side of the head in soot, and the most expensive of
  // the three, so it has to be the one that changes a man's read at fight
  // distance. It does: half a head at a different value is legible at 34 px when
  // nothing else on the face is. The boundary follows the midline of the *skull*
  // rather than a plane, wanders by 8 mm, and carries over the jaw, round the
  // ear and down the throat — a man who has painted half his face does not stop
  // at his chin.
  half: {
    color: 0x18140f,
    mark: (ax, x, y, z, front) => {
      const edge = -0.02 + jag(y * 9 + z * 4, 0.075, 1);
      const side = smooth(edge + 0.022, edge - 0.022, x);
      // Behind the ear it wraps rather than ending: `front` would take the mark
      // off the side of the head entirely, which is where half of it lives.
      return side * clamp01(0.45 + 0.55 * front);
    },
  },
};

/**
 * The complexion field: a per-vertex multiplier on the skin's albedo, carrying
 * the form shadow, the flush, and whatever the warrior has painted on.
 *
 * Returns a closure because it is called once per vertex of the head — about
 * two thousand of them — and everything that depends only on the skull and the
 * loadout is hoisted out of that loop.
 *
 * `y0` is where the head's own origin sits in the part's space, so the same
 * function can be handed the skull, a lid, a lip band, an ear or the throat
 * shell and put all five on one continuous map.
 */
function faceComplexion(
  K: Skull, y0: number, tone: SkinTone, paint: string,
  whiskers: { color: number; full: boolean } | null,
): (x: number, y: number, z: number, out: THREE.Color) => void {
  const R = K.R;
  const F = K.F;
  const chosen = WAR_PAINT[paint];
  // Stubble, and it is here rather than in the head build because stubble is not
  // a garment. It used to be a lifted shell 1.2 mm off the skin with a ragged
  // patch rim — a boundary between two materials, wool on flesh — and the audit
  // and every frame since agree on what that draws: a dark trapezoid over the
  // side of the face with a torn edge, which reads as mud rather than as a beard
  // a day old. As a term in the complexion it has no boundary at all, it costs no
  // geometry, and it survives every helmet in the shop for free.
  //
  // It runs under a full beard too, at half strength, because the thing a beard
  // patch needs most is for its own rim to land on skin that is already going
  // dark. That is what turns a hard material seam ringing the jaw into an edge.
  const wb = whiskers ? new THREE.Color(whiskers.color) : null;
  const base0 = new THREE.Color(tone.base);
  const sr = wb ? wb.r / Math.max(0.03, base0.r) : 1;
  const sg = wb ? wb.g / Math.max(0.03, base0.g) : 1;
  const sb = wb ? wb.b / Math.max(0.03, base0.b) : 1;
  const sAmt = whiskers ? (whiskers.full ? 0.42 : 0.80) : 0;
  // The paint's colour has to arrive as a *ratio*, because a vertex colour
  // multiplies the albedo it lands on. Taken against this warrior's own
  // complexion rather than against the canonical one: the head's geometry is
  // cached per identity and the identity picks the tone, so the division can be
  // exact and a stripe of blood comes out the same colour on all four skins.
  const base = base0;
  const p = chosen ? new THREE.Color(chosen.color) : null;
  const pr = p ? p.r / Math.max(0.03, base.r) : 1;
  const pg = p ? p.g / Math.max(0.03, base.g) : 1;
  const pb = p ? p.b / Math.max(0.03, base.b) : 1;

  return (px, py, pz, out) => {
    // Back to the skull's own direction. The displacement never exceeds about a
    // tenth of a radius, so normalising the scaled position recovers the sampling
    // direction closely enough for a field this smooth — and it means a lid, a
    // lip and an earlobe land on the same map as the skin they sit on without
    // any of them having to know their own parameterisation.
    let dx = px / R.x;
    let dy = (py - y0) / R.y;
    let dz = pz / R.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    const ax = Math.abs(dx);
    const front = clamp01(dz * 1.25);

    // ---- the form shadow ----
    //
    // Every term is a place a head is dark because of its own shape, and the
    // list is ordered by how much it is worth at seventy pixels. The first four
    // are the ones that decide whether there is a face there at all.
    let dim = 0;
    // The orbit. A socket darker than the brow above it is most of what "a face"
    // means at portrait size, and this is the term the patch version could never
    // get right because its lower boundary had to stop inside a crease.
    //
    // THE MASK. These terms are each individually right and they SUM, and the sum
    // was flat-lining. Measured off the field at the mid-cheek: orbit 0.6 +
    // paranasal 0.4 + buccal 0.15 = 1.15, clamped to 1, which is the full
    // 30/37/42 per cent out of the three channels — over an area running from
    // temple to temple and from the brow to the mouth. The bare-head front card
    // renders that as a dark bat across the middle of the face with a hard edge
    // along the brow, and it is most of what makes the man read as a goblin: not
    // one feature, a shadow the shape of a domino mask.
    //
    // The two spreading offenders are here. An orbit is not 29 mm of sigma wide —
    // that reaches the midline on one side and the temple on the other — and the
    // shadow beside the dorsum is not 45 mm tall, which runs it from the eye to
    // the mouth. Both tightened onto the features they are named for. Amplitudes
    // are untouched: the socket has to stay dark, and it does.
    // AND IT IS STILL THE MASK. The previous pass tightened these and wrote the
    // shadow field off as disproven; the geometry rewrite this pass then removed
    // the face block's hard brow step and the mask DID NOT MOVE, which leaves
    // this sum as the only remaining candidate and rules out the third
    // hypothesis (the arena rig's terminator) along with it — a light does not
    // survive its own geometry being replaced.
    //
    // The arithmetic is the giveaway. This one term is 0.22 of direction space
    // in x, which is +/-42 mm: two of them, one per eye, overlapping across the
    // midline and reaching the temples. That is a domino mask drawn by a single
    // line, before the paranasal, the under-brow crease and the buccal are added
    // on top of it. An orbit is 30 mm across.
    dim += 0.72 * bump(ax - 0.34, dy - (Y_EYE + 0.035), 0, 0.150, 0.105, 1) * front;
    // The crease immediately under the brow ridge, which is what makes the ridge
    // read as overhanging rather than as a band of colour.
    dim += 0.42 * bump(ax - 0.34, dy - (Y_EYE + 0.115), 0, 0.20, 0.050, 1) * front;
    // Beside the dorsum. The single most valuable term on the nose in this rig:
    // the nose's own relief is a gradient in z, which a light rig with this much
    // fill cannot see, and a shadow down each side of it is what makes the mass
    // read as a nose from in front.
    dim += 0.42 * bump(ax - 0.105, dy - (Y_NOSE + 0.115), 0, 0.050, 0.100, 1) * front;
    // Under the tip and the columella.
    dim += 0.75 * bump(dx, dy - (Y_NOSE - 0.018), 0, 0.15, 0.045, 1) * front;
    // Under the mandible, and this is the term that stops the head reading as
    // proud of the neck. Everything below the jawline goes down; the jaw's own
    // border gets a crease over the top of it so the edge has a line.
    dim += 0.62 * smooth(Y_CHIN + 0.13, Y_CHIN - 0.16, dy);
    dim += 0.45 * bump(ax - 0.44, dy - (Y_CHIN + 0.115), 0, 0.44, 0.070, 1) * front;
    // The buccal hollow, under the cheekbone, and the nasolabial fold beside it.
    //
    // These two are adjacent, they are both enormous — 0.22 x 0.185 and
    // 0.15 x 0.20 of direction space — and they SUM. Over most of the mid-face
    // the pair reached 0.68 of a `dim` that takes 30/37/42 per cent out of the
    // three channels, so what rendered front-on was a pale vertical strip about
    // 110 mm wide with a dark triangle down each side of it. That strip is the
    // "egg on a stalk" in note 3, and it is not the skull's shape at all: the
    // silhouette measures 190 mm at the cheekbone against 163 at the jaw, which
    // is a broad face. It was being *painted* narrow.
    //
    // Halved, and the buccal one tightened in y so it sits under the zygomatic
    // arch instead of washing down the whole cheek. A hollow is a shape the
    // light finds; at this strength it was a shape the light was replaced by.
    dim += 0.21 * bump(ax - 0.47, dy - (Y_LIP + 0.055), 0, 0.22, 0.145, 1) * front;
    dim += 0.13 * bump(ax - 0.30, dy - (Y_LIP + 0.125), 0, 0.15, 0.20, 1) * front;
    // The shelf under the lower lip.
    dim += 0.40 * bump(dx, dy - (Y_LIP - 0.140), 0, 0.24, 0.070, 1) * front;
    // The oral fissure. Tight, and worth as much as the socket: a mouth is a
    // slot, and a slot with no shadow in it is a scratch. Without this the
    // mouth's whole read at portrait range was one dark line 1.5 mm wide, which
    // is what `art/shots/wip/p6-*` shows — the lips are there in the sculpt and
    // nothing was telling the eye where to look for them.
    dim += 0.85 * bump(dx, dy - Y_LIP, 0, 0.26, 0.030, 1) * front;
    // And the two corners, which is where a mouth is deepest and where the
    // vermilion has already died away to nothing.
    dim += 0.45 * bump(ax - 0.25, dy - (Y_LIP + 0.01), 0, 0.075, 0.055, 1) * front;
    // The temple, and behind the ear. Both are off the front of the face, which
    // is exactly why they are here: a head with no tone anywhere but its front
    // reads as a mask laid on a ball, and these two are what give the three
    // quarter bearing somewhere to turn.
    dim += 0.38 * bump(ax - 0.86, dy - (Y_BROW + 0.10), dz - 0.22, 0.20, 0.26, 0.80);
    dim += 0.26 * bump(ax - 0.90, dy - (Y_EYE - 0.06), dz + 0.28, 0.22, 0.40, 0.55);
    // The nape, under the occiput. Free, and it stops the back of the head being
    // the flattest surface on the warrior.
    dim += 0.30 * bump(dx * 0.35, dy + 0.72, dz + 0.85, 1, 0.34, 0.55);
    // And a knee rather than a cliff, as insurance against the next term somebody
    // adds. Under 0.7 this is exactly what it was; above it the sum approaches 1
    // asymptotically instead of hitting it, so an overlap of three justified
    // shadows deepens a crease rather than painting a plateau.
    // The knee comes down from 0.7 to 0.52. It is a cap on the SUM, so its value
    // is the darkest tone anywhere on the face, and 0.7 of a 30/37/42 per cent
    // cut is very dark indeed to be reached over an area rather than in a crease.
    // With the relief rebuilt the paint has less to do: the socket is a real
    // socket now and can be found by the light instead of drawn.
    dim = dim <= 0.52 ? dim : 0.52 + 0.26 * (1 - Math.exp(-(dim - 0.52) * 1.6));

    // ---- the flush ----
    //
    // Where blood sits close under the skin. Kept to half the strength of the
    // shadow and off the open planes: warmth on a cheek is rouge, warmth on a
    // nose tip and an earlobe is a man.
    let warm = 0;
    warm += 1.00 * bump(dx, dy - (Y_TIP - 0.045), 0, 0.135, 0.095, 1) * front;
    warm += 0.60 * bump(ax - 0.145, dy - (Y_NOSE + 0.05), 0, 0.075, 0.075, 1) * front;
    warm += 0.85 * bump(ax - 1.00, dy - (Y_EYE + Y_NOSE) * 0.5, dz + 0.12, 0.17, 0.30, 0.60);
    warm += 0.45 * bump(ax - 0.54, dy - (Y_EYE - 0.135), 0, 0.24, 0.135, 1) * front * F.cheek;
    warm += 0.35 * bump(dx, dy - Y_CHIN, 0, 0.24, 0.130, 1) * front;
    warm = clamp01(warm);

    // The vermilion, on its own channel because it is the one place on a face
    // where the *hue* has to move much further than the value. It used to be two
    // lenses of a separate material sitting on the lip bands, which is what drew
    // the letterbox with a maroon lid over it and a pink one under; as a term in
    // the field it is a soft oval that the lip geometry's own roll then lights.
    // Bounded tightly in x by the mouth's own width so it cannot creep onto the
    // cheek, and pinched at both corners the way a lip is.
    const lipW = 0.30 * F.mouth;
    const lipHalf = 0.090 * (1 - Math.pow(clamp01(ax / lipW), 2.2)) + 0.014;
    const lip = clamp01((1 - smooth(lipHalf * 0.42, lipHalf, Math.abs(dy - (Y_LIP - 0.014))))
      * (1 - smooth(lipW * 0.78, lipW, ax))) * front;

    // Shadow goes cool as well as dark, which is what separates it from dirt;
    // flush goes red without going bright, because the specular term does not
    // scale with albedo and a lighter warm tone smears (see `skinWarm`).
    // ---- the mottle, which used to come off a lattice ----
    //
    // Skin is never one value, and flat skin colour is what reads as a mannequin.
    // That variation used to arrive in the albedo map, and `FACE_TILE`'s note
    // records what it actually drew at portrait range: a ruled square grid at the
    // tile's own repeat, because a 256 texel map that small is read at mip 4.6 and
    // has nothing left in it but one blob per tile. Taking the tile down to
    // 2.2 mm puts that stamp under the resolving limit and takes the variation
    // with it, so the variation comes back here.
    //
    // Three cosines on incommensurate periods, in the skull's own direction
    // space. There is no lattice for a grid to be drawn on, the periods never
    // come back into phase within one head, and the wavelengths — about 40, 25
    // and 16 mm on this skull — are the scale blood and weathering actually vary
    // at, which is far above any pixel grid at either framing. +/-4% on the
    // albedo: enough that no two square centimetres of this face are the same
    // value, small enough that it never competes with the form shadow above.
    const mottle =
      0.55 * Math.cos(dy * 6.1 + dx * 3.7)
      + 0.30 * Math.cos(dx * 9.4 - dz * 5.3 + 1.7)
      + 0.15 * Math.cos(dz * 14.9 + dy * 11.2 + 3.1);
    const tint = 1 + 0.040 * mottle;
    // Blood sits under the surface, so the darker half of the mottle goes red
    // rather than grey — the same reason the tone's `warm` channel exists.
    const flush = 0.028 * clamp01(-mottle);

    let r = (1 - 0.30 * dim) * (1 + 0.085 * warm) * (1 - 0.10 * lip) * (tint + flush);
    let g = (1 - 0.37 * dim) * (1 - 0.030 * warm) * (1 - 0.36 * lip) * tint;
    let b = (1 - 0.42 * dim) * (1 - 0.115 * warm) * (1 - 0.44 * lip) * (tint - flush * 0.6);

    if (whiskers) {
      // The beard line: the lip line at the midline, climbing to the sideburn at
      // the ear, broken by three harmonics so the edge disagrees with itself the
      // way a growing edge does. Bounded below at the throat, because whiskers
      // stop somewhere and a man stubbled to his collarbone is a wolf.
      const rise = smooth(0.50, 1.15, ax);
      const top = mix(Y_LIP - 0.075, -0.13, rise)
        + 0.055 * Math.cos(ax * 6.5) + 0.028 * Math.cos(ax * 11.3 + 1.9)
        + 0.016 * Math.cos(dy * 23 + ax * 7);
      let jaw = (1 - smooth(top - 0.07, top + 0.07, dy)) * smooth(-1.30, -1.12, dy);
      // The moustache: above the lip, inside the philtrum's width, and parted at
      // the midline the way one grows.
      const mo = (1 - smooth(Y_LIP + 0.055, Y_LIP + 0.16, dy)) * smooth(Y_LIP + 0.02, Y_LIP + 0.09, dy)
        * (1 - smooth(0.30, 0.40, ax)) * smooth(0.02, 0.075, ax);
      jaw = clamp01(Math.max(jaw, mo) * clamp01(0.30 + 0.85 * front));
      // Never over the lips themselves — a moustache grows above a mouth.
      jaw *= 1 - 0.85 * lip;
      const c = jaw * sAmt;
      r = mix(r, r * sr, c);
      g = mix(g, g * sg, c);
      b = mix(b, b * sb, c);
    }

    if (chosen) {
      const cover = clamp01(chosen.mark(ax, dx, dy, dz, front));
      if (cover > 0) {
        // Multiplied into the tone rather than replacing it, so the form shadow
        // goes on reading *through* the paint — which is what stops a painted
        // face flattening back into the mask this whole field exists to undo.
        r = mix(r, r * pr, cover);
        g = mix(g, g * pg, cover);
        b = mix(b, b * pb, cover);
      }
    }
    out.setRGB(r, g, b);
  };
}

// ============================================================
// Hands
// ============================================================

/**
 * Reflects a geometry through its own XY plane, winding and normals included. A
 * left hand is the *mirror* of a right hand, not a copy of it rotated round the
 * grip — and a mirror is a negative-determinant transform, which a matrix on the
 * mesh cannot express without turning the surface inside out. So the reflection
 * happens here, on the vertices, once per fist, before anything is merged.
 */
function mirrorZ(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const nrm = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, -pos.getZ(i));
  pos.needsUpdate = true;
  if (nrm) {
    for (let i = 0; i < nrm.count; i++) nrm.setZ(i, -nrm.getZ(i));
    nrm.needsUpdate = true;
  }
  const idx = geo.getIndex();
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
    idx.needsUpdate = true;
  }
  return geo;
}

/** One knuckle-to-tip run of a digit: where it goes, and how thick it is there. */
interface Knuckle { x: number; y: number; z: number; a: number; b: number }

/**
 * A tapered tube swept along a path, with the cross-section carried on a frame
 * built off the grip axis. Every finger and every thumb segment is one of these:
 * the path is the arc the digit takes around the shaft and the `a`/`b` pair is
 * where it swells at a joint and pinches at a crease. Beads on a string were the
 * old approach and they read as a caterpillar; a swept tube with two visible
 * creases reads as a finger, and costs the same triangles.
 */
function digit(path: Knuckle[], ring: number): THREE.BufferGeometry {
  const n = path.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rings: number[] = [];
  const X = new THREE.Vector3(1, 0, 0);
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    const k = path[i];
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(n - 1, i + 1)];
    T.set(next.x - prev.x, next.y - prev.y, next.z - prev.z).normalize();
    N.crossVectors(X, T);
    if (N.lengthSq() < 1e-8) N.set(0, 0, 1);
    N.normalize();
    B.crossVectors(T, N).normalize();
    rings.push(pos.length / 3);
    for (let j = 0; j <= ring; j++) {
      // Negative: with B = T × N, winding the section from +B toward +N puts
      // ∂ring × ∂row along -B and the whole tube renders inside out. Backface
      // culling then eats every finger and the hand is a mitten again, which is
      // exactly the bug this function exists to fix.
      const th = -(j / ring) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      pos.push(
        k.x + B.x * k.a * c + N.x * k.b * s,
        k.y + B.y * k.a * c + N.y * k.b * s,
        k.z + B.z * k.a * c + N.z * k.b * s,
      );
      uv.push(j / ring, i / (n - 1));
    }
  }
  const stride = ring + 1;
  for (let i = 0; i < n - 1; i++) {
    const t = i * stride;
    const b = t + stride;
    for (let j = 0; j < ring; j++) {
      idx.push(t + j, b + j + 1, b + j, t + j, t + j + 1, b + j + 1);
    }
  }
  // Caps: the fingertip is the one the camera actually gets to see.
  const cap = (base: number, k: Knuckle, flip: boolean) => {
    const c = pos.length / 3;
    pos.push(k.x, k.y, k.z);
    uv.push(0.5, 0.5);
    for (let j = 0; j < ring; j++) {
      if (flip) idx.push(c, base + j + 1, base + j);
      else idx.push(c, base + j, base + j + 1);
    }
  };
  cap(0, path[0], true);
  cap((n - 1) * stride, path[n - 1], false);

  const g = finish(pos, uv, idx);
  weldRingNormals(g, rings, ring);
  return g;
}

/**
 * How far round a shaft each finger reaches, as arc length in the hand's own
 * scale — index, middle, ring, little.
 *
 * Lengths rather than angles, because a finger does not change length when the
 * weapon does. The same 96 mm of middle finger covers 3.5 radians of an axe haft
 * and 3.9 of a seax grip, and *that* is the reason a grip has to be measured
 * instead of posed: these were four fixed end angles, tuned once against a
 * nominal 19 mm shaft, and every weapon that is not 19 mm got a hand that either
 * hung open on it or closed inside it. The spread between the four is what gives
 * the fist a diagonal tip line instead of a row of dominoes.
 */
const FIST_ARC = [0.0892, 0.0963, 0.0930, 0.0846];
/**
 * The same fingers with nothing to close on. Shorter, because a closing finger's
 * first 25 mm is buried in the palm mass and an open one's is not — carrying the
 * grip lengths over gives a hand with spider fingers.
 */
const OPEN_ARC = [0.0760, 0.0820, 0.0790, 0.0700];

/**
 * One finger, integrated as an arc across the shaft: it starts on the wrap
 * circle at the knuckle, sets off tangentially, and bends at 1/`curl`.
 *
 * `wrap` and `curl` are separate because they answer different questions.
 * `wrap` is *where the hand sits* — the shaft's surface plus a finger's own
 * half-depth, so the inside of the finger lands on the leather rather than
 * through it. `curl` is *how hard the finger closes*. On a grip they are the
 * same number, which is what makes a hand close on something whatever its
 * diameter; on an empty hand `curl` is four times larger and the fingers hang
 * relaxed instead of clenching on nothing.
 */
function fingerPath(
  fx: number, wrap: number, curl: number, phi0: number, arc: number,
  nodes: number, a0: number, b0: number, swell: number[],
): Knuckle[] {
  const path: Knuckle[] = [];
  let y = -wrap * Math.sin(phi0);
  let z = wrap * Math.cos(phi0);
  let ty = -Math.cos(phi0);
  let tz = -Math.sin(phi0);
  const ds = arc / (nodes - 1);
  for (let i = 0; i < nodes; i++) {
    const k = i / (nodes - 1);
    const w = swell[Math.min(swell.length - 1, Math.round(k * (swell.length - 1)))];
    path.push({ x: fx, y, z, a: a0 * w * (1 - 0.2 * k), b: b0 * w * (1 - 0.22 * k) });
    if (i === nodes - 1) break;
    // Tighter toward the tip: the distal joints of a closing hand flex further
    // than the knuckle does, and one constant curvature reads as a hoop.
    const r = curl * (1 - 0.10 * k);
    const c = Math.cos(ds / r);
    const sn = Math.sin(ds / r);
    // Centre of curvature is one radius along the inward normal (-tz, ty); the
    // point rotates about it and the tangent turns with it.
    const cy = y - r * tz;
    const cz = z + r * ty;
    const ry = y - cy;
    const rz = z - cz;
    y = cy + ry * c - rz * sn;
    z = cz + ry * sn + rz * c;
    const nty = ty * c - tz * sn;
    tz = ty * sn + tz * c;
    ty = nty;
  }
  return path;
}

/**
 * A hand on a shaft, built in a canonical frame: the shaft runs along +X through
 * the origin, the palm presses on the +Z face of it, the four fingers are stacked
 * along the shaft and wrap under it, and the thumb lies across them. +Z is the
 * *medial* side once `fistPlacement` has turned it — a right hand grips with its
 * palm toward the body's midline — so a left hand is this geometry mirrored in Z.
 *
 * `grip` is the radius of what is being held, in metres, and it is not optional.
 * This roster carries a seax at 13 mm, a sword grip at 16, a shield bar at 17, an
 * axe haft at 21 and a spear shaft at 24 — and one hard-coded curl cannot be
 * right for more than one of them. Measured on the built mesh before this change:
 * the berserker's finger surfaces sat **11 mm inside** the axe's bound grip on the
 * axis the camera sees, so the only part of the hand outside the wood was the
 * back of it. That is a hand that cannot be seen to hold anything, whatever the
 * fingers are made of.
 *
 * `grip: null` is an empty hand, and it is a different pose rather than the same
 * one relaxed: the fingers curl at about four times the radius from a knuckle
 * line that is barely flexed, the palm ends at the knuckles instead of running on
 * to the heel and making a mitten, and the thumb stays out on the radial side
 * rather than closing over a shaft that is not there.
 *
 * Returned in two pieces because flesh is not one colour: the tips and the
 * thumb pad get the warm tone, which is where a real hand is reddest and, not
 * coincidentally, the part nearest the camera in every over-shoulder frame.
 */
function fistGeometry(
  lod: Lod,
  scale: number,
  opts: { reach: number; lead: number; mirror: boolean; grip: number | null },
): { skin: THREE.BufferGeometry; warm: THREE.BufferGeometry | null } {
  const s = scale;
  const body: THREE.BufferGeometry[] = [];
  const tips: THREE.BufferGeometry[] = [];
  const ring = lod.fingers ? 7 : 5;
  const nodes = lod.fingers ? 7 : 4;
  const held = opts.grip;
  const open = held === null;
  // A finger's own half-depth. The wrap radius is the shaft plus that, so the
  // inner surface of every finger lands on the leather exactly.
  const pad = 0.0086 * s;
  const wrap = held === null ? 0.0272 * s : held + pad;
  // 0.090 is about 55° of total flexion over a finger's length, which is what an
  // unloaded hand rests at. Flat is not the alternative to clenched — a hand with
  // straight fingers reads as a salute, and a hand with its fingers on one radius
  // reads as a claw. Both are as wrong as the fist was.
  const curl = open ? 0.090 * s : wrap;
  // Where on the wrap circle the knuckle line sits. Nearly on the palm axis for
  // an open hand, well round it for a grip.
  const phi0 = open ? 0.16 : 0.44;
  // The palm rides the shaft, so a fatter one carries the whole hand outboard of
  // the axis. One to five millimetres across this roster — small, but it is the
  // difference between a palm resting on wood and a palm inside it.
  const lift = wrap - 0.0272 * s;

  // Metacarpal wedge — wrist down to the knuckles, biased onto the palm side. On
  // a grip it runs on to the heel and deliberately passes through the shaft: an
  // opaque hand round an opaque grip reads as pressure, and a hand held clear of
  // it reads as a floating glove. Open, it stops at the knuckle line, because the
  // fingers below it are the shape and a wedge that ran past them is the mitten.
  // The short palm is for the tier that has fingers to put below it. On low there
  // is one swept collar standing in for four digits, and a palm that stopped at
  // the knuckles under it left a paddle rather than a hand.
  body.push(shell(open && lod.fingers ? [
    { y: opts.reach, hw: 0.027 * s, hd: 0.019 * s, z: opts.lead },
    { y: 0.048 * s, hw: 0.036 * s, hd: 0.021 * s, z: 0.014 * s },
    { y: 0.010 * s, hw: 0.044 * s, hd: 0.019 * s, z: 0.027 * s },
    { y: -0.014 * s, hw: 0.042 * s, hd: 0.014 * s, z: 0.029 * s },
  ] : [
    { y: opts.reach, hw: 0.027 * s, hd: 0.019 * s, z: opts.lead },
    { y: 0.048 * s, hw: 0.036 * s, hd: 0.021 * s, z: 0.014 * s + lift },
    { y: 0.014 * s, hw: 0.044 * s, hd: 0.02 * s, z: 0.03 * s + lift },
    { y: -0.022 * s, hw: 0.045 * s, hd: 0.019 * s, z: 0.032 * s + lift },
    { y: -0.05 * s, hw: 0.037 * s, hd: 0.015 * s, z: 0.028 * s + lift },
  ], ring + 2, { power: 2.5, capTop: true, capBottom: true }));

  if (lod.fingers) {
    // Joint / shaft alternation down the length. The dips are the creases.
    const swell = [1.04, 0.9, 1.0, 0.87, 0.96, 0.84, 0.62];
    const arcs = open ? OPEN_ARC : FIST_ARC;
    for (let f = 0; f < 4; f++) {
      const fx = (-0.0325 + f * 0.0217) * s;
      // Capped at four radians of sweep. A finger closing on something thin
      // enough would otherwise spiral past the palm and come out of the wrist.
      const arc = Math.min(arcs[f] * s, curl * 4.0);
      const path = fingerPath(
        fx, wrap * (1 - f * 0.02), curl, phi0, arc, nodes,
        0.0093 * s * (1 - f * 0.055), pad * (1 - f * 0.05), swell,
      );
      // The distal third in the warm tone: two path nodes, one extra small mesh
      // per finger, and the single cheapest thing that stops a hand reading grey.
      const cut = nodes - 3;
      body.push(digit(path.slice(0, cut + 1), ring));
      tips.push(digit(path.slice(cut), ring));
    }

    // Thumb: metacarpal off the radial edge of the palm, then a phalanx laid
    // across the fingers. Separated from the fist and pointing the other way —
    // the opposition is the whole read, and a mitten has none of it.
    //
    // On a grip it is authored in (x, angle round the shaft, standoff from the
    // wrap circle) rather than in raw coordinates, so the pad tracks the shaft:
    // a thumb left at fixed coordinates while the fingers move out to a thicker
    // haft ends up buried in them, and one that scaled with the shaft would
    // swell. The standoff is a finger's thickness, which is what the thumb is
    // actually lying on.
    const THUMB: Array<[number, number, number, number, number]> = [
      [-0.046, -0.588, -0.0056, 0.0125, 0.0125],
      [-0.038, 0.142, 0.0011, 0.0118, 0.0115],
      [-0.024, 0.574, 0.0133, 0.0107, 0.0104],
      [-0.006, 0.769, 0.0174, 0.0098, 0.0094],
      [0.014, 0.914, 0.0170, 0.0074, 0.0072],
    ];
    // Open, the thumb is abducted and roughly parallel to the index rather than
    // crossed over it, and it is authored directly: with no shaft there is no
    // circle for a polar form to be about.
    const OPEN_THUMB: Array<[number, number, number, number, number]> = [
      [-0.046, 0.012, 0.018, 0.0125, 0.0125],
      [-0.056, -0.008, 0.024, 0.0118, 0.0115],
      [-0.062, -0.030, 0.026, 0.0107, 0.0104],
      [-0.060, -0.050, 0.023, 0.0098, 0.0094],
      [-0.054, -0.066, 0.017, 0.0074, 0.0072],
    ];
    const thumb: Knuckle[] = (open ? OPEN_THUMB : THUMB).map(([x, u, v, a, b]) => {
      const r = open ? 0 : wrap + v * s;
      return {
        x: x * s,
        y: open ? u * s : -r * Math.sin(u),
        z: open ? v * s : r * Math.cos(u),
        a: a * s, b: b * s,
      };
    });
    body.push(digit(thumb.slice(0, 3), ring));
    tips.push(digit(thumb.slice(2), ring));
  } else {
    // Low tier: the wrap is one swept collar and the thumb is one taper. The
    // silhouette still closes on the grip and still has an opposed thumb —
    // what goes is the crease detail, not the anatomy.
    const span = Math.min((open ? 0.058 : 0.093) * s, curl * 4.0);
    body.push(digit(fingerPath(0, wrap, curl, phi0, span, 5, 0.042 * s, 0.0095 * s, [1]), ring));
    body.push(digit(open ? [
      { x: -0.048 * s, y: 0.006 * s, z: 0.020 * s, a: 0.012 * s, b: 0.012 * s },
      { x: -0.058 * s, y: -0.030 * s, z: 0.024 * s, a: 0.0102 * s, b: 0.01 * s },
      { x: -0.054 * s, y: -0.062 * s, z: 0.018 * s, a: 0.008 * s, b: 0.0078 * s },
    ] : [
      { x: -0.042 * s, y: 0.008 * s, z: 0.02 * s + lift, a: 0.012 * s, b: 0.012 * s },
      { x: -0.014 * s, y: -0.026 * s, z: 0.032 * s + lift, a: 0.0102 * s, b: 0.01 * s },
      { x: 0.01 * s, y: -0.034 * s, z: 0.026 * s + lift, a: 0.008 * s, b: 0.0078 * s },
    ], ring));
  }

  const join = (list: THREE.BufferGeometry[]): THREE.BufferGeometry | null => {
    if (list.length === 0) return null;
    if (list.length === 1) return opts.mirror ? mirrorZ(list[0]) : list[0];
    const merged = mergeGeometries(list, false);
    if (!merged) return opts.mirror ? mirrorZ(list[0]) : list[0];
    for (const g of list) g.dispose();
    return opts.mirror ? mirrorZ(merged) : merged;
  };
  const skin = join(body);
  return { skin: skin ?? new THREE.BufferGeometry(), warm: join(tips) };
}

/**
 * Rotates the canonical fist onto the grip axis the hand mount uses. The basis is
 * the same for both hands on purpose — `e2` is "up the forearm" and `e3` is
 * "toward the midline", and neither of those flips with the side. The left hand
 * differs by being mirrored geometry, which is what a left hand actually is; the
 * old basis flipped `e3` instead, and a flipped basis is a 180° roll about the
 * grip, which stood the left hand on its knuckles with its wrist pointing down.
 */
function fistPlacement(gripPitch: number, x: number, y: number, z: number): THREE.Matrix4 {
  const e1 = new THREE.Vector3(0, Math.cos(gripPitch), Math.sin(gripPitch));
  const e2 = new THREE.Vector3(0, Math.sin(gripPitch), -Math.cos(gripPitch));
  const e3 = new THREE.Vector3().crossVectors(e1, e2).normalize();
  const m = new THREE.Matrix4().makeBasis(e1, e2, e3);
  m.setPosition(x, y, z);
  return m;
}

// ============================================================
// Weapons
// ============================================================

/**
 * The pitch the hand mounts sit at; weapons are built along +Y and tipped here.
 *
 * Exported because `anim.ts` now *solves* the wrist so the blade points where the
 * swing table asks, and that solve has to subtract this. It reads the mount at
 * runtime where it can; this is the value behind the fallback, shared rather than
 * copied.
 */
export const GRIP_PITCH = 1.28;

/**
 * A lenticular blade with an edge that survives a pixel.
 *
 * The section is still a rhombus — that is what a pattern-welded blade grinds
 * to — but it is sampled half a step round so the edge lands *between* two
 * vertices rather than on one. That leaves a land about a quarter of the
 * section's thickness wide: on a sword's mid-blade, half a millimetre of
 * geometry where there used to be a mathematical point. `grow` puts back the
 * width the phase shift takes off, so the blade is exactly as wide as its
 * stations say. See `ShellOptions.phase` for what this is fixing.
 */
function bladeSection(stations: Station[], seg = 8): THREE.BufferGeometry {
  const grow = 1 / Math.pow(Math.cos(Math.PI / seg), 2);
  return shell(
    stations.map((st) => ({ ...st, hw: st.hw * grow })),
    seg,
    { power: 1, phase: 0.5, capTop: true, capBottom: true },
  );
}

/** Cord-wrapped grip: a core plus a helix of bindings, merged into the core. */
function boundGrip(
  part: Part,
  mat: THREE.Material,
  cordMat: THREE.Material,
  y0: number,
  y1: number,
  r0: number,
  r1: number,
  turns: number,
  trim: boolean,
): void {
  part.add(shell([{ y: y1, hw: r1, hd: r1 * 0.82 }, { y: (y0 + y1) / 2, hw: (r0 + r1) * 0.47, hd: (r0 + r1) * 0.4 }, { y: y0, hw: r0, hd: r0 * 0.82 }], 8, { capTop: true, capBottom: true }), mat);
  if (!trim) return;
  const n = Math.max(3, Math.round(turns));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const y = mix(y0, y1, t);
    const r = mix(r0, r1, t) + 0.0022;
    part.add(ring(r, 0.0028, 4, 10), cordMat, xf(0, y, 0, Math.PI / 2, 0, 0.16, 1, 1, 0.85));
  }
}

export function buildSword(materials?: CharacterMaterials): THREE.Group {
  const M = materials ?? RAW;
  const g = new THREE.Group();
  const part = new Part();
  const steel = M.blade(0xc4ccd6, 0.2);
  const dark = M.tinted("iron", 0x4c525b, { roughness: 0.5 });
  const leather = M.hide(0x2a1c10);
  const brass = M.blade(0xb9a25a, 0.34);

  // Blade: rhombic section, distal taper, 0.9 m of it. The pattern-weld comes
  // from the steel map rather than from geometry — that is what the map is for.
  part.add(bladeSection([
    { y: 1.055, hw: 0.006, hd: 0.0012 },
    { y: 0.99, hw: 0.018, hd: 0.0021 },
    { y: 0.86, hw: 0.024, hd: 0.0027 },
    { y: 0.55, hw: 0.028, hd: 0.0035 },
    { y: 0.163, hw: 0.031, hd: 0.0042 },
  ]), steel);
  // Fuller — a dark line down the centre of both faces, and it has to be a
  // *swept* one. As a box it was 8.6 mm deep on a blade that is 5.4 mm thick at
  // the forte and 4.2 at the foible, so the groove stood up to 1.6 mm proud of
  // the steel either side of it: seen from the edge the sword's silhouette was
  // the fuller and not the blade. Following the blade's own `hd` keeps it inside
  // a tenth of a millimetre of the surface, which is under a pixel at any range
  // and cannot break the section.
  part.add(shell([
    { y: 0.885, hw: 0.0062, hd: 0.0027 },
    { y: 0.55, hw: 0.008, hd: 0.0036 },
    { y: 0.19, hw: 0.0085, hd: 0.0043 },
  ], 6, { power: 2.6, capTop: true, capBottom: true }), dark);
  // Lower guard, grip, upper guard, lobed pommel.
  part.add(shell([
    { y: 0.028, hw: 0.096, hd: 0.019 },
    { y: 0.012, hw: 0.106, hd: 0.021 },
    { y: -0.004, hw: 0.09, hd: 0.018 },
  ], 10, { power: 2.6, capTop: true, capBottom: true }), dark, xf(0, 0.15, 0));
  boundGrip(part, leather, brass, -0.075, 0.146, 0.0175, 0.0155, 7, true);
  part.add(shell([
    { y: 0.014, hw: 0.052, hd: 0.016 },
    { y: 0, hw: 0.058, hd: 0.018 },
    { y: -0.014, hw: 0.048, hd: 0.015 },
  ], 10, { power: 2.6, capTop: true, capBottom: true }), dark, xf(0, -0.082, 0));
  // Tea-cosy pommel: three lobes on a bar, the Anglo-Saxon signature.
  part.add(shell([
    { y: 0.052, hw: 0.03, hd: 0.014 },
    { y: 0.02, hw: 0.06, hd: 0.02 },
    { y: -0.012, hw: 0.062, hd: 0.021 },
  ], 12, { power: 2.2, capTop: true, capBottom: true }), brass, xf(0, -0.105, 0));
  for (const lx of [-0.038, 0, 0.038]) {
    part.add(ball(0.016, 8), brass, xf(lx, -0.062, 0, 0, 0, 0, 1, 0.8, 0.62));
  }

  for (const { geo, mat } of part.merge()) g.add(new THREE.Mesh(geo, mat));
  return g;
}

/**
 * The runekeeper's seax: single-edged with the broken-back spine that makes an
 * Anglo-Saxon knife unmistakable at a glance, and rune-etched down the flat.
 */
export function buildDagger(materials?: CharacterMaterials): THREE.Group {
  const M = materials ?? RAW;
  const g = new THREE.Group();
  const part = new Part();
  const steel = M.blade(0xb8c4d2, 0.24);
  const leather = M.hide(0x24303f);
  const brass = M.blade(0x9a8a56, 0.4);

  // Asymmetric section: the spine is thick and flat, the edge thins away. Built
  // as a swept box whose cross-section slides forward as the back breaks down.
  part.add(shell([
    { y: 0.5, hw: 0.008, hd: 0.0018, z: 0.006 },
    { y: 0.44, hw: 0.019, hd: 0.0028, z: 0.004 },
    { y: 0.33, hw: 0.026, hd: 0.0036, z: 0.0 },
    { y: 0.14, hw: 0.026, hd: 0.004, z: 0.0 },
    { y: 0.075, hw: 0.024, hd: 0.0038, z: 0.0 },
  ], 6, { power: 1.35, capTop: true, capBottom: true }), steel);
  part.add(shell([
    { y: 0.07, hw: 0.034, hd: 0.011 },
    { y: 0.056, hw: 0.03, hd: 0.01 },
  ], 8, { power: 2.4, capTop: true, capBottom: true }), brass);
  boundGrip(part, leather, brass, -0.075, 0.056, 0.016, 0.0145, 5, true);
  part.add(shell([
    { y: 0.016, hw: 0.024, hd: 0.014 },
    { y: -0.012, hw: 0.03, hd: 0.017 },
  ], 8, { power: 2.2, capTop: true, capBottom: true }), brass, xf(0, -0.082, 0));
  // Rune channel down the flat — the class's whole identity in one glowing line.
  part.add(box(0.0055, 0.26, 0.0092), M.get("runeGlow"), xf(0.004, 0.28, 0));

  for (const { geo, mat } of part.merge()) g.add(new THREE.Mesh(geo, mat));
  return g;
}

/**
 * An axe blade: a crescent whose section is a real wedge rather than a plate.
 *
 * `lensPrism` cannot build this and that is why the axe read as a stick. It
 * scales the whole outline about its centroid to get the two faces, so the inset
 * a cutting edge needs — a few tenths of a millimetre — is the same inset the
 * socket end gets, where the metal is forty millimetres thick. Every axe head cut
 * that way is uniformly thin, every concavity in the outline is rounded away by
 * the scale, and what comes out is a pillow. Held anywhere but square to the lens
 * a pillow is a stick.
 *
 * So the head is parameterised the way a smith thinks about it instead: `t` runs
 * along the cutting edge from the top horn round to the beard, `s` runs from the
 * edge back to the eye, and the half-thickness is a function of **distance from
 * the edge**. That gives, in one surface and for free:
 *
 *   - a *land* at the edge rather than a mathematical point (`SECTION[0]`), for
 *     the same reason `bladeSection` carries `phase: 0.5` — a zero-width edge
 *     alternates between covering and missing pixel centres and crawls;
 *   - a **bevel break** at `s = 0.12`, ~19 mm back, at 21° included. That normal
 *     discontinuity is the line of light that runs the whole crescent and it is
 *     the single feature that says "axe" at fifty metres;
 *   - a blade that swells out of the eye and thins to the edge, so the head has a
 *     lit top plane and a dark underside from every bearing, not just square on;
 *   - horns and beard that are thin where they are thin on a real head, because
 *     `horn` tapers the section toward both ends of the arc — but only near the
 *     edge, so the metal is still full thickness where it meets the socket.
 *
 * Both polylines must be the same length; `t` is their shared index.
 */
function axeBlade(
  edge: Array<[number, number]>,
  root: Array<[number, number]>,
  eyeHalf: number,
): THREE.BufferGeometry {
  // Distance from the edge, and the half-thickness there as a fraction of the
  // eye. Front-loaded: an axe is a long thin wedge for most of its width and
  // then nearly doubles in the last fifth, which is the mass behind the eye.
  //
  // The **repeated stations are the point of this table**. `finish` averages
  // vertex normals over whatever shares an index, so a section written as six
  // rising stations shades as one smooth pillow and the ground bevel — the whole
  // reason a blade catches a line of light down its length — averages away
  // before it reaches a pixel. A duplicated station puts two coincident rows in
  // the grid with different indices; the quad between them has no area and so
  // contributes no normal, and the faces above and below it end up with normals
  // of their own. That is a hard crease for the cost of one row of vertices, and
  // there are two of them: one at the land, one at the bevel shoulder 21 mm back.
  const SECTION: Array<[number, number]> = [
    [0, 0.030], [0, 0.030], [0.12, 0.17], [0.12, 0.17], [0.34, 0.27], [0.62, 0.40], [1, 1],
  ];
  const n = edge.length - 1;
  const rows = SECTION.length - 1;
  const at = (t: number, s: number, sign: number, out: THREE.Vector3) => {
    const ti = Math.min(n - 1, Math.floor(t * n));
    const tf = t * n - ti;
    const si = Math.min(rows - 1, Math.floor(s * rows));
    const sf = s * rows - si;
    const ex = mix(edge[ti][0], edge[ti + 1][0], tf);
    const ey = mix(edge[ti][1], edge[ti + 1][1], tf);
    const rx = mix(root[ti][0], root[ti + 1][0], tf);
    const ry = mix(root[ti][1], root[ti + 1][1], tf);
    const sv = mix(SECTION[si][0], SECTION[si + 1][0], sf);
    const k = mix(SECTION[si][1], SECTION[si + 1][1], sf);
    // Thin toward both ends of the arc — a horn and a beard tip are sheet metal
    // — but only out at the edge. `sv` carries the taper back to nothing at the
    // eye, where the head has to be one solid mass whatever `t` says.
    const horn = mix(0.40 + 0.60 * Math.sqrt(Math.sin(Math.PI * t)), 1, Math.pow(sv, 1.4));
    out.set(mix(ex, rx, sv), mix(ey, ry, sv), sign * eyeHalf * k * horn);
  };
  // One column per authored point and one row per section station: the
  // interpolation between them is linear, so any extra grid line would only add
  // collinear vertices. Curvature is bought by authoring points, not by nu.
  // `u` runs backwards so ∂u × ∂v comes out along +z and the outer grid faces
  // out; taken forwards the whole head renders inside out and disappears.
  return patch({
    nu: n, nv: rows,
    outer: (u, v, out) => at(1 - u, v, 1, out),
    inner: (u, v, out) => at(1 - u, v, -1, out),
  });
}

/**
 * The berserker's Dane axe: bearded crescent, langets down the haft, 1.44 m.
 *
 * Rebalanced about the grip, and the reason is a defect one panel read as a broken
 * *helmet*. The head used to sit 1.12 m up the haft from a grip at 0.90 m, and at
 * the shouldered carry that put a 256 mm steel crescent at y = 1.89 — the middle
 * of the skull. In `art/shots/v3/lineup.png` it overlaps the helm's silhouette and
 * reads as a second, detached bowl, and its polished face — 0.22 roughness against
 * a bright sky env map — blows to 250 luma and becomes the "white blob beside the
 * helm". Nothing was wrong with the berserker's head assembly at all.
 *
 * So the mass came 260 mm down the haft and the butt grew by the same, which
 * leaves the weapon's overall length and its head-to-butt reach where they were
 * and moves the crescent to shoulder height at rest. That overshot in the other
 * direction — at `STANCE.berserker.rest` of -1.78 the head sat *behind* the
 * deltoid and pauldron with only 16% of it visible, so the fix for one defect
 * created another and no amount of blade modelling could show through it. The
 * carry angle is -1.35 now, which is the other half of the same fix and lives in
 * anim.ts. Geometry could not reach it: sweeping `headY` up far enough to clear
 * the shoulder puts the head back on the helm.
 *
 * `rig.reach` in anim.ts is measured off this geometry's bounding box, so the
 * blade trail follows it without being told.
 */
export function buildAxe(materials?: CharacterMaterials): THREE.Group {
  const M = materials ?? RAW;
  const g = new THREE.Group();
  const part = new Part();
  // 0.34 rather than 0.22, and a darker albedo. A 220 mm mirror is the largest
  // specular in the game and it was clipping; a Dane axe is a forged, ground,
  // hard-used tool, not a bezel.
  const steel = M.blade(0xa9b2bd, 0.34);
  const iron = M.tinted("iron", 0x5c636d, { roughness: 0.52 });
  const ash = M.timber(0x6a4c2c);
  const leather = M.hide(0x33241a);

  const headY = 0.86;

  // Haft with an oval section — and the oval's long axis runs **along the cut**,
  // which is the way round a real haft is shaped so the hand knows where the edge
  // is without looking. It was the other way round, which cost twice: the haft
  // presented its narrow 42 mm face to a camera that is nearly always in front of
  // the warrior, and the section disagreed with the head it carries.
  //
  // Waisted where the hand closes, and that is the other half of the grip
  // defect. Over the binding the haft measured **64 mm across** at the fist —
  // wider than the span between a closed thumb and forefinger — so the fingers
  // were modelled inside the wood and what showed outside it was the back of a
  // hand lying against a post. A Dane axe haft is ~35 mm at the grip and swells
  // again at the butt for the lower hand to pull against, which is the shape
  // below: full section under the head where the langets ride, 41 mm at the
  // grip, 56 mm at the butt.
  part.add(shell([
    { y: headY + 0.06, hw: 0.026, hd: 0.020 },
    { y: 0.44, hw: 0.024, hd: 0.019 },
    { y: 0.12, hw: 0.0205, hd: 0.0160 },
    { y: -0.12, hw: 0.0205, hd: 0.0160 },
    { y: -0.34, hw: 0.024, hd: 0.0195 },
    { y: -0.56, hw: 0.028, hd: 0.023 },
  ], 8, { capTop: true, capBottom: true }), ash);
  part.add(shell([
    { y: -0.54, hw: 0.034, hd: 0.030 },
    { y: -0.58, hw: 0.030, hd: 0.026 },
  ], 8, { capTop: true, capBottom: true }), iron);

  // The cutting edge, top horn round to the beard tip, and the line where the
  // blade dies into the eye. 295 mm of edge on 176 mm of blade beyond the socket,
  // which is a large but unremarkable Petersen type M — the reach off the haft is
  // 204 mm, i.e. exactly what the old plate had. The head is bigger in silhouette
  // and no longer in reach, and that is the trade this pass wanted: what was
  // missing was never length, it was *form*.
  //
  // The last four stations of both curves are the beard, and they are the reason
  // this is a table rather than an arc. The edge hooks down and *back* toward the
  // haft while the root runs under the socket to x = -20 mm, so the two curves
  // open a concave throat beneath the eye. That notch is the one piece of an axe's
  // outline no other weapon in the game has, and it survives being 30 px tall.
  const edge: Array<[number, number]> = [
    [0.163, 0.137], [0.181, 0.116], [0.192, 0.093], [0.199, 0.068],
    [0.203, 0.042], [0.204, 0.016], [0.203, -0.010], [0.200, -0.036],
    [0.194, -0.061], [0.186, -0.085], [0.176, -0.108], [0.161, -0.130],
    [0.143, -0.148], [0.122, -0.162], [0.098, -0.170],
  ];
  const root: Array<[number, number]> = [
    [0.008, 0.066], [0.015, 0.058], [0.020, 0.048], [0.024, 0.036],
    [0.027, 0.022], [0.028, 0.008], [0.028, -0.006], [0.027, -0.020],
    [0.025, -0.033], [0.021, -0.046], [0.016, -0.059], [0.009, -0.072],
    [0.000, -0.086], [-0.013, -0.100], [-0.026, -0.112],
  ];
  // The root line sits inside the socket's own waist, so the blade's inboard rim
  // is buried in it rather than ending in a lit 38 mm plate.
  part.add(axeBlade(edge, root, 0.019), steel, xf(0, headY, 0));

  // The eye: a forged collar round the haft with a lip at each end and a waist
  // between them. The lips are the point — they are two hard horizontal edges at
  // the one place on the weapon where the light is not raking, and without them
  // the socket was a 96 mm-deep lozenge that read as a fist round the haft and
  // stood proud of the blade it is supposed to carry.
  part.add(shell([
    { y: 0.092, hw: 0.030, hd: 0.020 },
    { y: 0.079, hw: 0.036, hd: 0.025 },
    { y: 0.058, hw: 0.032, hd: 0.022 },
    { y: -0.058, hw: 0.032, hd: 0.022 },
    { y: -0.079, hw: 0.036, hd: 0.025 },
    { y: -0.092, hw: 0.030, hd: 0.020 },
  ], 10, { power: 2.5 }), iron, xf(0, headY, 0));

  // Langets: two straps down the faces the blade lies in, tapering to a point,
  // riveted through. They used to be a pair of 50 mm-deep boxes standing 5 mm
  // clear of the haft on either side of it — at gameplay distance that is a fork,
  // not a binding, and it was most of what made the visible half of this weapon
  // read as a stick. Built as prisms in their own plane and turned onto the haft,
  // so each lies *on* the wood with a rounded back.
  const langet: Array<[number, number]> = [
    [-0.014, 0.020], [0.014, 0.020], [0.012, -0.052], [0.007, -0.108],
    [0.0, -0.145], [-0.007, -0.108], [-0.012, -0.052],
  ];
  for (const s of [-1, 1]) {
    part.add(lensPrism(langet, 0.007, 0.3), iron, xf(s * 0.024, headY - 0.10, 0, 0, s * Math.PI / 2, 0));
    for (const ry of [-0.01, -0.09]) {
      part.add(ball(0.005, 6), iron, xf(s * 0.029, headY - 0.10 + ry, 0, 0, 0, 0, 0.6, 1, 1));
    }
  }
  // Grip binding: 3 mm of hide over the waisted wood, not 8. It used to stand
  // proud enough to be a collar rather than a wrap, and it is the surface the
  // fist is fitted to — `HAND_GRIP.berserker` is this radius and nothing else.
  part.add(shell([
    { y: 0.09, hw: 0.0235, hd: 0.0190 },
    { y: -0.09, hw: 0.0240, hd: 0.0195 },
  ], 8, { wall: 0.004 }), leather, xf(0, 0.02, 0));

  for (const { geo, mat } of part.merge()) g.add(new THREE.Mesh(geo, mat));
  return g;
}

/**
 * The warden's spear. Not a stylistic flourish — it is the only weapon in the
 * roster whose silhouette can be read from across the arena, which is what the
 * class needed to stop being "the huscarl without a shield".
 */
export function buildSpear(materials?: CharacterMaterials): THREE.Group {
  const M = materials ?? RAW;
  const g = new THREE.Group();
  const part = new Part();
  const steel = M.blade(0xc2cad4, 0.22);
  const iron = M.tinted("iron", 0x585f68, { roughness: 0.55 });
  const ash = M.timber(0x7a5e38);
  const leather = M.hide(0x2f2117);

  part.add(shell([
    { y: 1.02, hw: 0.016, hd: 0.016 },
    { y: 0.4, hw: 0.019, hd: 0.019 },
    { y: -0.2, hw: 0.019, hd: 0.019 },
    { y: -0.55, hw: 0.016, hd: 0.016 },
  ], 8, { capTop: true, capBottom: true }), ash);
  // Socket, then a leaf blade with a raised midrib.
  part.add(shell([
    { y: 1.13, hw: 0.02, hd: 0.02 },
    { y: 1.05, hw: 0.028, hd: 0.028 },
    { y: 0.99, hw: 0.024, hd: 0.024 },
  ], 8, { power: 2.2 }), iron);
  part.add(bladeSection([
    { y: 1.44, hw: 0.005, hd: 0.0014 },
    { y: 1.4, hw: 0.02, hd: 0.0038 },
    { y: 1.31, hw: 0.036, hd: 0.0062 },
    { y: 1.22, hw: 0.038, hd: 0.0068 },
    { y: 1.13, hw: 0.022, hd: 0.005 },
  ]), steel);
  // The midrib, and it is meant to stand proud — but as a 300 mm box it ran past
  // the blade at both ends and ended in a square face 10 mm short of the point,
  // which renders as a fin sticking out of the leaf. Swept, it dies into the
  // blade at the tip and again at the socket, standing ~1.2 mm off the faces
  // where a rib actually stands and nowhere else.
  part.add(shell([
    { y: 1.405, hw: 0.0034, hd: 0.0044 },
    { y: 1.30, hw: 0.006, hd: 0.0075 },
    { y: 1.22, hw: 0.0062, hd: 0.008 },
    { y: 1.14, hw: 0.005, hd: 0.0062 },
  ], 6, { power: 2.2, capTop: true, capBottom: true }), iron);
  // Ferrule at the butt and a bound hand-hold.
  part.add(shell([
    { y: -0.52, hw: 0.021, hd: 0.021 },
    { y: -0.62, hw: 0.014, hd: 0.014 },
  ], 8, { capBottom: true }), iron);
  part.add(shell([
    { y: 0.11, hw: 0.024, hd: 0.024 },
    { y: -0.11, hw: 0.025, hd: 0.025 },
  ], 8, { wall: 0.004 }), leather);

  for (const { geo, mat } of part.merge()) g.add(new THREE.Mesh(geo, mat));
  return g;
}

/**
 * A planked lime-board shield: seven boards edge to edge, domed toward the enemy,
 * a rawhide-bound rim, an iron boss over the hand-hole and a grip bar across the
 * back. Built with the boss forward of the origin so the fist that holds it lands
 * behind the boards, where a hand actually goes.
 *
 * Three things were wrong with it, all visible on the huscarl in
 * `art/shots/v3/lineup.png`, where it reads as a flat slab clipping out of frame:
 *
 *   1. SIZE. 0.88 m of board on a 2.0 m man is 45% of his height. The Gokstad
 *      boards are that wide and this was cut to match them, but those are the
 *      largest finds we have; the fighting sizes are at the bottom of the 0.70–0.95
 *      range. It is now 0.76 m of board, 0.79 m over the binding.
 *   2. THE PAINT WAS NOT ON THE BOARDS. The quarters were flat `CircleGeometry`
 *      discs at a fixed z through a set of boards each domed to its own depth, so
 *      the paint was buried 25 mm inside the planking at the centre and stood 22 mm
 *      proud of it at the rim. That intersection is the hard straight edge cutting
 *      across the planks in `portrait.png`, and it is why the face reads as one
 *      plane rather than as boards. Each quarter is now built per plank, riding on
 *      that plank's own face 2 mm proud of it, so it can never cut through again.
 *   3. NOTHING BEHIND THE SEAMS. The 3% gaps between boards showed whatever was
 *      behind them, which at a glancing angle is sky. A dark hide facing behind the
 *      planking turns all six seams into shadow lines, which is the only thing that
 *      makes planking read as planking at gameplay distance.
 *
 * The carry used to be the fourth item here and it is fixed: `anim.ts` hung the
 * disc off `leftArm` at (-0.14, -0.4, 0.26), which put the fist 260 mm *above*
 * the boss — a man holding a centre-grip shield by its bottom rim — and threw the
 * whole disc against the frame edge. Re-measured on the built rig by the owner of
 * that file, the off fist now sits (-2.7, +0.6, +39.9) mm from this origin on a
 * disc spanning ±402 mm: dead centre laterally, and the 40 mm of standoff is
 * exactly the grip bar below. The fist that closes on that bar is sized to it —
 * see `HAND_GRIP.huscarl.off`.
 */
export function buildShield(color = 0x6b4226, materials?: CharacterMaterials): THREE.Group {
  const M = materials ?? RAW;
  const g = new THREE.Group();
  const part = new Part();
  const board = M.timber(color);
  // A painted board is timber under paint, not cloth. `M.tunic` dressed these
  // quarters in wool at a fixed five repeats — a ~60 mm tile on a 105 mm plank —
  // and that is the basket in `art/shots/v7/portrait.png`: the pale quarters read
  // as wickerwork while the boards *behind* them, on the same geometry, read as
  // wood. Same substance as the board now, so the grain runs through the paint
  // the way it does on a real limewood shield.
  const paint = M.timber(0xb8a276);
  const iron = M.tinted("iron", 0x5f666f, { roughness: 0.5 });
  // 0.42 rather than 0.32: the boss is the one convex metal shape on the shield and
  // at close roughness it returned a single clipped dot instead of a rolled
  // highlight across the dome.
  const steel = M.blade(0x9aa2ac, 0.42);
  const leather = M.hide(0x3a2a1a);
  // Rawhide, not black leather. The binding is the shield's outline, and an outline
  // in the darkest material on the object draws nothing — this is the cheapest way
  // to make the thing read as round at fifty metres.
  const rawhide = M.hide(0x9a7c52);

  const R = 0.38;
  const planks = 7;
  const zf = 0.05;
  const halfW = (R / planks) * 0.97;
  const crest = 0.03;

  // Hide facing behind the boards, so every seam is a dark line rather than a slot
  // through to the sky. Deliberately the same leather as the grip and not a shade of
  // its own: it is never seen as a surface, only as what is *behind* six 3 mm gaps,
  // and a second material for that would be a whole extra draw call.
  //
  // A disc with thickness, not a `CircleGeometry`. The flat circle faced +z only,
  // so seen from behind it was culled — and the outer planks are chords, only
  // 100 mm tall at the rim, so the shield had two see-through crescents inside its
  // own binding. Invisible while the shield was mounted face-out; the moment
  // anim.ts started carrying it bladed at rest, `probe/closeup.png` showed the
  // turf through it. 6 mm of rawhide backing costs ~70 triangles and no draw call.
  part.add(new THREE.CylinderGeometry(R * 0.99, R * 0.99, 0.006, 24), leather, xf(0, 0, zf - 0.007, Math.PI / 2));

  // Seven boards, one geometry, one material — and until this pass one *grain*.
  // `BoxGeometry` parameterises every face over 0..1 whatever size the face is,
  // so all seven front faces asked `oak` for the same three repeats of the same
  // texture and got back the same knots at the same heights. No texture recipe
  // can fix that; it has to be fixed where the UVs are made, which is here.
  //
  // Two errors, and they are separable. The first is *phase*: identical boards.
  // The second is *density*, and it is the larger of the two — the boards are
  // chords of a circle, 100 mm tall at the rim against 753 mm through the
  // middle, so three repeats over each of them is a 33 mm grain on the outer
  // board and a 251 mm grain on the centre one. Seven boards nailed edge to edge
  // out of one tree, showing a 7.5:1 range of grain, is not a shield.
  //
  // `PLANK_V` is the v-tile every board is normalised to — the centre board's,
  // so the plank the eye actually lands on is unchanged and the rest come to
  // meet it. The u repeat is left alone: 35 mm across the width is the close
  // ring spacing that makes quarter-sawn oak read as oak, and it is already
  // consistent because every board is the same width.
  const PLANK_V = 0.7526;
  for (let i = 0; i < planks; i++) {
    const cx = ((i + 0.5) / planks - 0.5) * 2 * R;
    // Chord height, so the board's outline follows the circle instead of ending
    // in a square corner, and a dome forward of centre.
    const edge = Math.max(0.05, Math.sqrt(Math.max(0, R * R - (Math.abs(cx) + halfW) ** 2)));
    const dome = crest * (1 - (cx / R) ** 2);
    // Phase: irrational-ish per board in both axes, so no two share a knot and
    // no pair lines up again further along the disc. `hash` would do as well;
    // these are written out because the whole point is that a reader can see
    // seven different numbers.
    const du = (i * 0.37) % 1;
    const dv = (i * 0.61 + 0.13) % 1;
    part.add(retile(box(halfW * 2, edge * 2, 0.019), du, dv, (edge * 2) / PLANK_V), board, xf(cx, 0, zf + dome));
    // The painted quarter, cut per plank: boards right of centre carry it on their
    // upper half, boards left of centre on their lower half, which is the same
    // two-colour quartering the disc wedges were drawing — except this one is
    // lying on the wood.
    //
    // Half the board's height and its own 0..1 v, so at `M.timber`'s repeat 3 the
    // paint's grain used to be exactly twice as fine as the board 2 mm under it.
    // Same normalisation, same phase as the board it lies on, so the grain runs
    // through the paint the way it does on a limewood shield.
    part.add(retile(box(halfW * 1.94, edge, 0.004), du, dv, edge / PLANK_V), paint,
      xf(cx, (cx >= 0 ? 1 : -1) * edge * 0.5, zf + dome + 0.0115));
  }

  // Rawhide binding folded over the board edge, then iron clamps over it.
  part.add(ring(R + 0.006, 0.016, 6, 28), rawhide, xf(0, 0, zf + 0.002));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    part.add(box(0.026, 0.044, 0.046), iron, xf(Math.cos(a) * R, Math.sin(a) * R, zf + 0.002, 0, 0, a));
  }

  // Boss: 156 mm across and 52 mm proud, domed over the hand-hole with a riveted
  // flange bearing on the boards. Built along +Y and tipped a quarter turn, so the
  // section heights below become depth out of the shield's face.
  const bossZ = zf + crest + 0.0095;
  part.add(shell([
    { y: 0.052, hw: 0.026, hd: 0.026 },
    { y: 0.041, hw: 0.047, hd: 0.047 },
    { y: 0.021, hw: 0.064, hd: 0.064 },
    { y: 0.005, hw: 0.074, hd: 0.074 },
    { y: 0.0, hw: 0.086, hd: 0.086 },
  ], 16, { capTop: true }), steel, xf(0, 0, bossZ, Math.PI / 2, 0, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    part.add(ball(0.008, 6), steel, xf(Math.cos(a) * 0.079, Math.sin(a) * 0.079, bossZ + 0.004));
  }

  // Back: the grip bar the fist closes on, and two board battens.
  part.add(box(0.05, 0.3, 0.024), leather, xf(0, 0, zf - 0.01, 0, 0, Math.PI / 2));
  for (const s of [-1, 1]) {
    part.add(box(0.44, 0.03, 0.014), board, xf(0, s * 0.19, zf - 0.004));
  }

  for (const { geo, mat } of part.merge()) g.add(new THREE.Mesh(geo, mat));
  return g;
}

export function buildWeaponForClass(cls: WarriorClass, materials?: CharacterMaterials): THREE.Group {
  if (cls === "runekeeper") return buildDagger(materials);
  if (cls === "berserker") return buildAxe(materials);
  if (cls === "warden") return buildSpear(materials);
  return buildSword(materials);
}

/**
 * What each class's two hands actually close on, as a shaft radius in metres at
 * the point the hand mount sits — `main` is the weapon `buildWeaponForClass`
 * hands that class, `off` is whatever the off hand carries and `null` when it
 * carries nothing.
 *
 * Every number is read off the geometry above at y = 0, which is where the mount
 * is: sword 16 mm over the cord, seax 14, shield bar 17 across its narrow face,
 * axe 21 over the binding, spear 24 over its hand-hold. They are here rather
 * than in the builders because the *hand* is what needs them and a hand is built
 * before a weapon is chosen. Re-measure when a grip is re-cut; a stale number
 * here does not break anything, it just puts the fingers a few millimetres off
 * the leather.
 *
 * `off` mirrors what `anim.ts` mounts — the runekeeper fights with a seax in each
 * hand and the huscarl's left fist closes on the shield's centre bar, while the
 * warden and the berserker carry nothing in the off hand and so get an open one.
 * That coupling is real and unavoidable from here: this file cannot see the
 * mounting, so if a class ever gains or loses an off-hand item, this table is the
 * second edit.
 */
const HAND_GRIP: Record<WarriorClass, { main: number; off: number | null }> = {
  // Between the sword's 16 mm core and the 21 mm crest of its cord helix, which
  // is where a hand on a corded grip actually sits — proud of the wood, sunk into
  // the binding.
  huscarl: { main: 0.017, off: 0.017 },
  warden: { main: 0.024, off: null },
  runekeeper: { main: 0.014, off: 0.014 },
  berserker: { main: 0.021, off: null },
};

// ============================================================
// Dismemberment
// ============================================================
//
// A warrior is merged geometry — one shell per substance per moving part — which
// is why eight of them fit in a frame and also why, until this pass, nothing
// could come off one. The rule this section adds is narrow and deliberately so:
//
//   THE BODY IS NEVER REBUILT. A severance is a cut through the rig that is
//   already standing there, taken once, on the frame the kill arrives.
//
// Three mechanisms, in increasing order of cost, and the cut picks the cheapest
// one that is honest for each mesh it meets:
//
//   1. **Untouched.** A mesh entirely on the body's side of the plane is not
//      read, not copied and not disturbed. Most of a warrior is this.
//   2. **Carried over.** A rigid mesh entirely on the leaving side is *shared*:
//      a new `THREE.Mesh` on the same geometry, moved into the severed piece.
//      Zero triangles, zero vertex work. A head comes off this way, which is
//      the common case and costs nothing but a draw call that already existed.
//   3. **Baked.** A mesh the plane actually crosses — or a skinned limb, which
//      has to be frozen in the pose it died in or it snaps back to bind — is
//      walked once, its vertices pushed through the skeleton, and split into
//      two geometries by triangle centroid. One pass over one limb, once, on
//      the frame of a death. Nothing here runs per frame, ever.
//
// The split is by centroid and not by a real clip: a clipped triangle needs new
// vertices, new UVs and a re-triangulation, and buys a boundary that is at most
// half a triangle straighter. What actually reads at the cut is the wound
// (see `unitWound`) — a plugged, ragged, bone-in-the-middle section that sits in
// the hole — and against that, half a triangle of raggedness on the shell's rim
// is free realism rather than a defect.
//
// Everything the cut produces is pooled. Baked geometry comes from a fixed ring
// of slots with stable attributes, so after the first brawl a severance uploads
// vertices into buffers that already exist and allocates nothing on the GPU; the
// wound is one unit geometry per tier, scaled to the section it plugs; and the
// piece hands back a `release()` that puts the body back exactly as it was, so a
// respawn is an undo and not a rebuild.

/**
 * Where a killing blow landed. This is the server's `hitZone` verbatim — see
 * `deriveHitZone` in engine.mjs — and it is a union rather than a string so the
 * mapping below fails at compile time if the sim ever grows a zone.
 */
export type HitZone = "head" | "neck" | "armL" | "armR" | "legL" | "legR" | "torso" | "waist";

/** Every place this body can come apart. `R`/`L` are the warrior's own sides. */
export type SeamId =
  | "neck"
  | "shoulderR" | "shoulderL" | "elbowR" | "elbowL"
  | "hipR" | "hipL" | "kneeR" | "kneeL"
  | "waist";

/**
 * One cut, measured at build time off the same skeleton the body was swept from,
 * so a proportion change carries its seams with it instead of leaving them
 * 40 mm up the humerus.
 *
 * `anchor` is a node that survives everything `anim.ts` does to the rig —
 * `articulate` swaps every limb mesh for a `SkinnedMesh` and `insertSpine`
 * reparents the whole upper body under a spine node, and neither touches a pivot
 * or the torso mesh. The cut plane in world space is always
 * `anchor.matrixWorld · translate(0, y, 0)`, and `severWorld` will hand it over
 * rather than have two owners derive it.
 */
export interface Seam {
  id: SeamId;
  anchor: THREE.Object3D;
  /** Height of the cut in the anchor's own frame, metres. */
  y: number;
  /** The body's section at the cut: half-width across, half-depth front to back. */
  hw: number;
  hd: number;
  /** Which way along the anchor's Y the leaving piece lies. +1 above, −1 below. */
  away: 1 | -1;
  /** Long bones in the section — one at a shoulder, two through a forearm. */
  bones: number;
  /** Rough mass of what comes away, kg. For whatever integrator throws it. */
  mass: number;
}

export interface SeverOptions {
  /**
   * How far down the limb. `joint` takes the whole arm or leg off at the
   * shoulder or hip; `mid` takes it at the elbow or knee. Ignored by the head
   * and the waist, which have one seam each.
   *
   * The defaults differ per limb on purpose. An arm defaults to `mid`, because
   * a forearm leaving with the fist still closed on a sword is the shot this
   * whole feature exists for. A leg defaults to `joint`, because a man standing
   * on a stump reads as a bug and a man whose leg went at the hip falls.
   */
  at?: "joint" | "mid";
  /**
   * Tier to cut at. Defaults to the tier the character was built at. `low`
   * refuses the waist — that is the one cut that has to bake the whole upper
   * body — and takes the head instead, because the bar is that a death still
   * reads as a death on a phone, not that it reads as the same death.
   */
  detail?: CharacterDetail;
}

/**
 * A limb that has come off, and everything the caller needs to throw it, bleed
 * it and put it back.
 *
 * The piece arrives parented to nothing, standing in world space at the cut.
 * Add it to a node with an identity world transform — the arena root — and drive
 * it from there; add it under something that moves and it will inherit that
 * motion on top of its own.
 */
export interface Severance {
  zone: HitZone;
  seam: SeamId;
  /** The free piece. Unparented; its transform is the cut, in world space. */
  part: THREE.Group;
  /**
   * Centre of mass in the piece's own frame. It is not the origin and that is
   * the point: a head hung off its own neck stump tumbles, and a torso half
   * pitches onto its face, because both are being spun about a point they do
   * not balance on.
   */
  com: THREE.Vector3;
  mass: number;
  /** World position of the wound *on the body* — where blood comes out. */
  wound: THREE.Vector3;
  /** Unit world direction the stump faces. The spray axis. */
  spray: THREE.Vector3;
  /**
   * The wound left on the body, as a node parented into it. `wound` and `spray`
   * are the instant of separation; this is the same place a second later, after
   * the corpse has fallen on it — read `getWorldPosition`/`getWorldDirection`
   * off this for the spray that keeps running, rather than deriving the seam's
   * frame a second time in another file.
   */
  stump: THREE.Object3D;
  /** Section radius at the cut, metres. How wide the spray should be. */
  radius: number;
  /**
   * Whatever the piece took with it — weapon, shield, offhand. Their transforms
   * now live under `part`, so anything still posing them each frame (`applyPose`
   * writes the weapon's rotation) has to let go of these.
   */
  carried: readonly THREE.Object3D[];
  /**
   * Puts the body back together and hands the piece's geometry back to the pool.
   * Idempotent, and safe from any state.
   *
   * It can also be called *for* you: the pool is finite, and once the field has
   * more pieces on it than the pool has slots the oldest one is reclaimed —
   * `part` leaves the scene, and the body it came from stays severed, which is
   * the right way round for a brawl. A piece whose `part` has lost its parent
   * has been taken back.
   */
  release(): void;
}

// The prefix every mesh and pivot this file emits carries, so a walk over a rig
// that `anim.ts` has since hung a weapon, a shield and a bone chain off can tell
// what is body and what is baggage without a whitelist that goes stale.
const RIG_TAG = "rig:";
// `insertSpine`'s node. Named here rather than imported because the dependency
// only runs one way — anim.ts knows about this file and this file must not know
// about anim.ts — and because a walk that fails to descend it would find a body
// with no torso rather than fail loudly.
const SPINE_NODE = "spine";

/** Seam a zone maps to, at each depth. `torso` severs nothing. */
const ZONE_SEAM: Record<HitZone, { joint: SeamId; mid: SeamId; deep: "joint" | "mid" } | null> = {
  head: { joint: "neck", mid: "neck", deep: "joint" },
  neck: { joint: "neck", mid: "neck", deep: "joint" },
  armR: { joint: "shoulderR", mid: "elbowR", deep: "mid" },
  armL: { joint: "shoulderL", mid: "elbowL", deep: "mid" },
  legR: { joint: "hipR", mid: "kneeR", deep: "joint" },
  legL: { joint: "hipL", mid: "kneeL", deep: "joint" },
  waist: { joint: "waist", mid: "waist", deep: "joint" },
  torso: null,
};

/** A seam is unavailable once the piece it hangs off has already gone. */
const SEAM_NEEDS: Partial<Record<SeamId, SeamId>> = {
  elbowR: "shoulderR", elbowL: "shoulderL",
  kneeR: "hipR", kneeL: "hipL",
};

// ------------------------------------------------------------
// The wound
// ------------------------------------------------------------

/**
 * Gore materials, one set per library rather than per warrior, so eight men can
 * be taken apart in the same brawl for two programs. Weak on the library for the
 * same reason `SHAPED_GLOW` is: the preview allocates and disposes its own, and
 * a strong map would outlive it.
 */
const GORE_MATS = new WeakMap<CharacterMaterials, { meat: THREE.Material; bone: THREE.Material }>();

function goreMats(M: CharacterMaterials): { meat: THREE.Material; bone: THREE.Material } {
  let g = GORE_MATS.get(M);
  if (!g) {
    // Dark and wet rather than bright and matte. A saturated red at 0.9
    // roughness is a felt patch; the whole read of an open section is that it
    // catches a highlight the skin around it does not.
    g = {
      meat: M.standard(0x5c0f0b, 0.34),
      bone: M.standard(0xd6cbac, 0.62),
    };
    GORE_MATS.set(M, g);
  }
  return g;
}

const WOUND_CACHE = new Map<string, { meat: THREE.BufferGeometry; bone: THREE.BufferGeometry }>();

/**
 * The stump, and it is worth the forty lines. A flat cap over a severed limb is
 * the single thing that makes dismemberment read as a toy coming apart rather
 * than as a man being cut: it is one polygon, one value, no silhouette, and the
 * eye reads "hollow" instantly.
 *
 * So the section is built as what a section is — a rim of flesh standing proud
 * of a sunken middle, torn rather than circular, with bone in it:
 *
 *   * The **profile** dips below the cut at the centre and rises above it at
 *     0.78 of the radius. That ridge is the only part of a wound that catches a
 *     key light, and the hollow behind it is what an AO pass finds.
 *   * The **outline** is not a circle. Two harmonics take it ±20% off round, so
 *     the boundary against the shell's own rim is ragged and no two azimuths
 *     tear the same distance.
 *   * The **tags** are the last ring folded back under, unevenly. Flesh that
 *     hangs over the edge of the cut is what says the limb was *torn* off by an
 *     axe rather than sawn.
 *   * The **bone** stands proud in the middle, snapped short, with a jagged top
 *     ring. One shaft at a shoulder or a hip, two through a forearm or a shin.
 *
 * Built on a unit section and scaled to the seam, so the whole game holds three
 * of these — one per tier — instead of one per limb per class per stature.
 */
function unitWound(seg: number, rows: number, bones: number): { meat: THREE.BufferGeometry; bone: THREE.BufferGeometry } {
  const key = `${seg}|${rows}|${bones}`;
  const hit = WOUND_CACHE.get(key);
  if (hit) return hit;

  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  // t → height, in units of the section's radius. Below the cut in the middle,
  // above it at the rim, folded back under at the very edge.
  const LIP: Array<[number, number]> = [[0, -0.22], [0.4, -0.15], [0.78, 0.11], [0.9, 0.05], [1, -0.2]];
  const lip = (t: number): number => {
    let i = 0;
    while (i < LIP.length - 2 && t > LIP[i + 1][0]) i++;
    const f = clamp01((t - LIP[i][0]) / (LIP[i + 1][0] - LIP[i][0]));
    return mix(LIP[i][1], LIP[i + 1][1], f);
  };
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const torn = 1 + 0.20 * Math.sin(a * 3 + 0.9) + 0.11 * Math.sin(a * 7 + 2.3);
      const r = t * torn;
      // The tags only exist on the outermost ring, and they vary round it:
      // an even fringe is a doily.
      const tag = j === rows ? 0.6 + 0.9 * Math.abs(Math.sin(a * 2.5 + 0.4)) : 1;
      pos.push(r * Math.cos(a), lip(t) * (j === rows ? tag : 1), r * Math.sin(a));
      uv.push(i / seg, t);
    }
  }
  const stride = seg + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * stride + i;
      const b = a + 1;
      const c = b + stride;
      const d = a + stride;
      idx.push(a, b, c, a, c, d);
    }
  }
  const meat = finish(pos, uv, idx);

  // Snapped shafts. `rod` gives a closed cylinder; the top ring is then pushed
  // about unevenly, which is the difference between a bone and a dowel.
  const shafts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < bones; k++) {
    const r = bones > 1 ? 0.19 : 0.28;
    const dx = bones > 1 ? (k === 0 ? -0.34 : 0.30) : 0;
    const dz = bones > 1 ? (k === 0 ? 0.08 : -0.1) : 0;
    const g = rod(r * 0.92, r, 0.46, Math.max(5, Math.round(seg * 0.5)));
    const p = g.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) <= 0) continue;
      p.setY(i, p.getY(i) + hash(i, 17 + k * 7) * 0.16 - 0.04);
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    // Sunk so the shaft rises out of the hollow rather than floating over it.
    g.applyMatrix4(xf(dx, 0.06, dz));
    shafts.push(g);
  }
  const bone = shafts.length === 1 ? shafts[0] : (mergeGeometries(shafts, false) ?? shafts[0]);
  if (shafts.length > 1) for (const g of shafts) if (g !== bone) g.dispose();

  const made = { meat, bone };
  WOUND_CACHE.set(key, made);
  return made;
}

const WOUND_LOD: Record<CharacterDetail, { seg: number; rows: number }> = {
  high: { seg: 16, rows: 5 },
  medium: { seg: 12, rows: 4 },
  low: { seg: 8, rows: 3 },
};

/**
 * A wound sized onto one seam and pointed the way it opens. Two meshes, sharing
 * one geometry pair with every other wound in the match.
 */
function woundAt(seam: Seam, M: CharacterMaterials, detail: CharacterDetail, facing: number): THREE.Group {
  const { seg, rows } = WOUND_LOD[detail];
  const geo = unitWound(seg, rows, seam.bones);
  const mats = goreMats(M);
  const g = new THREE.Group();
  g.name = `${RIG_TAG}wound`;
  const meat = new THREE.Mesh(geo.meat, mats.meat);
  const bone = new THREE.Mesh(geo.bone, mats.bone);
  g.add(meat, bone);
  // Slightly proud of the section so it plugs the shell's open end rather than
  // sitting flush in it and z-fighting the rim.
  g.scale.set(seam.hw * 1.04, (seam.hw + seam.hd) * 0.52, seam.hd * 1.04);
  if (facing < 0) g.rotation.x = Math.PI;
  return g;
}

// ------------------------------------------------------------
// The cut
// ------------------------------------------------------------

const _sm = new THREE.Matrix4();
const _sv = new THREE.Vector3();
let SCRATCH_P = new Float32Array(0);
let SCRATCH_R = new Int32Array(0);

/**
 * Every vertex of a mesh in the cut's frame, skinning included.
 *
 * The skinning is why this exists at all. A limb is a `SkinnedMesh` in attached
 * bind mode, which means its own transform cancels out of the shader and the
 * bones place it in world space — so a piece that merely gets reparented does
 * not move, and one that gets cloned as a plain mesh snaps back to bind pose
 * with its elbow straight, mid-swing. Pushing the vertices through the skeleton
 * once, here, is what freezes an arm in the pose it died in.
 */
function project(mesh: THREE.Mesh, worldToFrame: THREE.Matrix4): Float32Array {
  const geo = mesh.geometry;
  const pos = geo.getAttribute("position");
  const n = pos.count;
  if (SCRATCH_P.length < n * 3) SCRATCH_P = new Float32Array(n * 3);
  const out = SCRATCH_P;
  const skin = geo.hasAttribute("skinIndex") ? asSkinned(mesh) : null;
  const m = _sm.multiplyMatrices(worldToFrame, mesh.matrixWorld);
  for (let i = 0; i < n; i++) {
    _sv.fromBufferAttribute(pos, i);
    if (skin) skin.applyBoneTransform(i, _sv);
    _sv.applyMatrix4(m);
    out[i * 3] = _sv.x;
    out[i * 3 + 1] = _sv.y;
    out[i * 3 + 2] = _sv.z;
  }
  return out;
}

/**
 * One pooled slot of baked geometry.
 *
 * The attributes are allocated once at their high-water mark and then never
 * replaced: a bake overwrites the arrays, sets a draw range and flags an upload.
 * That is the difference between a pool and a free list — a free list of
 * `BufferGeometry` still hands the driver a new buffer per acquisition, because
 * the GPU-side allocation follows the *attribute* object and not the geometry.
 */
interface PieceSlot {
  geo: THREE.BufferGeometry;
  pos: THREE.BufferAttribute;
  uv: THREE.BufferAttribute;
  idx: THREE.BufferAttribute;
  verts: number;
  tris: number;
  busy: boolean;
  stamp: number;
  owner: object | null;
}

const PIECES: PieceSlot[] = [];
// A waist cut on a cloaked huscarl is the worst case at about twenty slots, so
// this holds two of them plus a scattering of limbs. Past it the oldest
// severance on the field is put back — a corpse losing its arm again after four
// other men have died is the correct thing to spend.
const PIECE_CAP = 48;
let pieceClock = 0;
const LIVE: Array<{ owner: object; release: () => void }> = [];

function newSlot(): PieceSlot {
  const slot: PieceSlot = {
    geo: new THREE.BufferGeometry(),
    pos: new THREE.BufferAttribute(new Float32Array(0), 3),
    uv: new THREE.BufferAttribute(new Float32Array(0), 2),
    idx: new THREE.BufferAttribute(new Uint32Array(0), 1),
    verts: 0, tris: 0, busy: false, stamp: 0, owner: null,
  };
  return slot;
}

function fitSlot(slot: PieceSlot, verts: number, tris: number): void {
  if (slot.verts >= verts && slot.tris >= tris) return;
  const v = Math.max(verts, slot.verts);
  const t = Math.max(tris, slot.tris);
  // Frees whatever the old attributes hold on the GPU. Only ever runs while the
  // pool is warming up to the largest limb the roster owns.
  slot.geo.dispose();
  slot.pos = new THREE.BufferAttribute(new Float32Array(v * 3), 3);
  slot.uv = new THREE.BufferAttribute(new Float32Array(v * 2), 2);
  slot.idx = new THREE.BufferAttribute(new Uint32Array(t * 3), 1);
  slot.pos.setUsage(THREE.DynamicDrawUsage);
  slot.uv.setUsage(THREE.DynamicDrawUsage);
  slot.idx.setUsage(THREE.DynamicDrawUsage);
  slot.geo.setAttribute("position", slot.pos);
  slot.geo.setAttribute("uv", slot.uv);
  slot.geo.setIndex(slot.idx);
  slot.verts = v;
  slot.tris = t;
}

function acquirePiece(verts: number, tris: number, owner: object): PieceSlot {
  let slot = PIECES.find((s) => !s.busy);
  if (!slot && PIECES.length >= PIECE_CAP) {
    // Never evict the severance being assembled, or a waist cut would eat its
    // own torso half-way through building itself.
    const victim = LIVE.find((s) => s.owner !== owner);
    if (victim) {
      victim.release();
      slot = PIECES.find((s) => !s.busy);
    }
  }
  if (!slot) {
    slot = newSlot();
    PIECES.push(slot);
  }
  fitSlot(slot, verts, tris);
  slot.busy = true;
  slot.owner = owner;
  slot.stamp = ++pieceClock;
  return slot;
}

/**
 * Copies the triangles on one side of the cut into a pooled slot.
 *
 * `side` is the sign of the frame-space Y the kept triangles lie on, judged by
 * centroid: a triangle belongs wholly to whichever half its middle is in. `into`
 * moves the result out of the cut's frame and into whatever space the mesh it
 * replaces lived in — the piece keeps the cut's frame, the stump goes back into
 * the body's.
 */
function harvest(
  mesh: THREE.Mesh,
  p: Float32Array,
  side: number,
  into: THREE.Matrix4 | null,
  owner: object,
): PieceSlot | null {
  const geo = mesh.geometry;
  const pos = geo.getAttribute("position");
  const uv = geo.getAttribute("uv");
  const index = geo.getIndex();
  const faces = index ? index.count / 3 : pos.count / 3;
  const vertOf = index ? (k: number) => index.getX(k) : (k: number) => k;

  let tris = 0;
  for (let f = 0; f < faces; f++) {
    const a = vertOf(f * 3);
    const b = vertOf(f * 3 + 1);
    const c = vertOf(f * 3 + 2);
    if ((p[a * 3 + 1] + p[b * 3 + 1] + p[c * 3 + 1]) * side > 0) tris++;
  }
  if (tris === 0) return null;

  const slot = acquirePiece(Math.min(pos.count, tris * 3), tris, owner);
  if (SCRATCH_R.length < pos.count) SCRATCH_R = new Int32Array(pos.count);
  const remap = SCRATCH_R;
  remap.fill(-1, 0, pos.count);
  const P = slot.pos.array as Float32Array;
  const U = slot.uv.array as Float32Array;
  const I = slot.idx.array as Uint32Array;
  const box = new THREE.Box3();
  let vn = 0;
  let tn = 0;
  for (let f = 0; f < faces; f++) {
    const tri = [vertOf(f * 3), vertOf(f * 3 + 1), vertOf(f * 3 + 2)];
    if ((p[tri[0] * 3 + 1] + p[tri[1] * 3 + 1] + p[tri[2] * 3 + 1]) * side <= 0) continue;
    for (const v of tri) {
      let r = remap[v];
      if (r < 0) {
        r = vn++;
        remap[v] = r;
        _sv.set(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
        if (into) _sv.applyMatrix4(into);
        P[r * 3] = _sv.x;
        P[r * 3 + 1] = _sv.y;
        P[r * 3 + 2] = _sv.z;
        U[r * 2] = uv ? uv.getX(v) : 0;
        U[r * 2 + 1] = uv ? uv.getY(v) : 0;
        box.expandByPoint(_sv);
      }
      I[tn++] = r;
    }
  }
  // The tail of the index is collapsed onto vertex 0 rather than left holding a
  // previous tenant's triangles: the draw range hides them, but
  // `computeVertexNormals` walks the whole attribute and would fold a stale
  // face's normal into a live vertex. A degenerate triangle contributes nothing.
  I.fill(0, tn);
  slot.pos.needsUpdate = true;
  slot.uv.needsUpdate = true;
  slot.idx.needsUpdate = true;
  slot.geo.setDrawRange(0, tn);
  slot.geo.computeVertexNormals();
  // Written rather than computed, because the attributes are longer than the
  // piece and `computeBoundingSphere` would include the unused tail.
  slot.geo.boundingBox = box;
  slot.geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  return slot;
}

/**
 * Duck-typed rather than `instanceof`, and this is the one place in the file
 * where that is the right call: everything below is inspecting objects another
 * module made — `articulate` rebuilds every limb as a `SkinnedMesh` and hangs
 * its own `Bone`s off the pivots — and a class check answers "was this made by
 * the same copy of three as me", which is not the question. three carries these
 * flags for exactly this reason.
 */
const asMesh = (o: THREE.Object3D): THREE.Mesh | null => ((o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null);
const asSkinned = (o: THREE.Object3D): THREE.SkinnedMesh | null =>
  ((o as THREE.SkinnedMesh).isSkinnedMesh ? (o as THREE.SkinnedMesh) : null);
const isBone = (o: THREE.Object3D): boolean => (o as THREE.Bone).isBone === true;

/** Walks a rig subtree, separating what this file built from what was hung on it. */
function collectRig(
  node: THREE.Object3D,
  skip: THREE.Object3D[] | null,
  meshes: THREE.Mesh[],
  carried: THREE.Object3D[],
): void {
  for (const c of node.children) {
    if (skip && skip.includes(c)) continue;
    const mesh = asMesh(c);
    if (mesh) {
      if (mesh.name.startsWith(RIG_TAG)) meshes.push(mesh);
      else carried.push(mesh);
      continue;
    }
    if (isBone(c) || c.name === "handMount" || c.name === SPINE_NODE || c.name.startsWith(RIG_TAG)) {
      collectRig(c, skip, meshes, carried);
      continue;
    }
    // A weapon, a shield, a rune light — anything another owner mounted. It
    // travels whole or not at all; nobody cuts a sword in half.
    carried.push(c);
  }
}

/** Bumps the shared-geometry refcount `emit` keeps, if this geometry is shared. */
function retainRig(geo: THREE.BufferGeometry): boolean {
  const n = USES.get(geo);
  if (n === undefined) return false;
  USES.set(geo, n + 1);
  return true;
}

/** Everything `sever` needs off the body it is cutting. Built once, per warrior. */
interface SeverContext {
  root: THREE.Group;
  seams: Record<SeamId, Seam>;
  /** The two leg pivots — the only part of the body a waist cut leaves alone. */
  legs: THREE.Object3D[];
  head: THREE.Object3D;
  torso: THREE.Mesh[];
  materials: CharacterMaterials;
  detail: CharacterDetail;
  live: Map<SeamId, Severance>;
}

const _sf = new THREE.Matrix4();

function severBody(ctx: SeverContext, zone: HitZone, opts: SeverOptions = {}): Severance | null {
  const route = ZONE_SEAM[zone];
  if (!route) return null;
  const detail = opts.detail ?? ctx.detail;
  let id = route[opts.at ?? route.deep];
  if (id === "waist" && detail === "low") id = "neck";
  // Once already gone, or hanging off something already gone. A man cannot lose
  // the same forearm twice, and nothing comes off an upper body that has itself
  // left the field.
  if (ctx.live.has(id) || ctx.live.has("waist")) return null;
  const needs = SEAM_NEEDS[id];
  if (needs && ctx.live.has(needs)) return null;
  const seam = ctx.seams[id];

  // Every matrix under this body, and every bone in it, current as of this
  // frame — `project` reads bone world matrices directly and a stale one bakes
  // the arm into last frame's swing.
  //
  // Two calls, and both are load-bearing. `updateWorldMatrix` is the only one
  // that walks *up* to the parents, and `updateMatrixWorld` is the only one that
  // walks down through the virtual override — which matters because
  // `SkinnedMesh` refreshes `bindMatrixInverse` there and nowhere else, and
  // `applyBoneTransform` finishes by applying it. Update a rig with the walker
  // that skips the override and every skinned limb bakes with a bind-time
  // inverse: the arm comes off in the body's own local frame and the piece is
  // flung to wherever the arena origin happens to be. Live that hid behind the
  // renderer having refreshed it the frame before — it only bites a body that
  // is built and cut in the same tick, which is exactly what a spectator or a
  // late joiner does with a corpse that was already on the ground.
  ctx.root.updateWorldMatrix(true, false);
  ctx.root.updateMatrixWorld(true);
  const frame = seam.anchor.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(0, seam.y, 0));
  const toFrame = frame.clone().invert();

  const meshes: THREE.Mesh[] = [];
  const carried: THREE.Object3D[] = [];
  if (id === "waist") {
    collectRig(ctx.root, ctx.legs, meshes, carried);
  } else if (id === "neck") {
    collectRig(ctx.head, null, meshes, carried);
    // The throat is torso geometry — the neck shell, its two straps and the
    // larynx are swept with the body and merged into its skin slot — so a head
    // that came off without them would leave the collar's contents standing.
    meshes.push(...ctx.torso);
  } else {
    collectRig(seam.anchor, null, meshes, carried);
  }

  const owner = {};
  const away = seam.away;
  const part = new THREE.Group();
  part.name = `${RIG_TAG}severed:${id}`;
  frame.decompose(part.position, part.quaternion, part.scale);

  const slots: PieceSlot[] = [];
  const hidden: THREE.Mesh[] = [];
  const grafted: THREE.Object3D[] = [];
  const retained: THREE.BufferGeometry[] = [];
  const moved: Array<{
    obj: THREE.Object3D; parent: THREE.Object3D | null;
    position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3;
  }> = [];

  const carryWhole = (mesh: THREE.Mesh): void => {
    const clone = new THREE.Mesh(mesh.geometry, mesh.material);
    clone.name = mesh.name;
    clone.castShadow = mesh.castShadow;
    clone.receiveShadow = mesh.receiveShadow;
    _sf.multiplyMatrices(toFrame, mesh.matrixWorld).decompose(clone.position, clone.quaternion, clone.scale);
    part.add(clone);
    if (retainRig(mesh.geometry)) retained.push(mesh.geometry);
    mesh.visible = false;
    hidden.push(mesh);
  };

  // The low tier's one concession beyond particle counts: a limb taken off at
  // the shoulder or the hip is carried whole rather than baked, which costs the
  // pose it died in — the arm straightens as it leaves — and saves the entire
  // vertex pass. At the distance a phone plays this game the pop is invisible
  // and the arm coming off is not.
  const cheap = detail === "low"
    && (id === "shoulderR" || id === "shoulderL" || id === "hipR" || id === "hipL");

  const span = new THREE.Box3();
  for (const mesh of meshes) {
    const skinned = mesh.geometry.hasAttribute("skinIndex") && asSkinned(mesh) !== null;
    if (cheap) {
      carryWhole(mesh);
      continue;
    }
    if (!skinned) {
      // A rigid mesh the plane misses is settled without reading a vertex: the
      // bind-pose bounding box is exact for anything the skeleton does not move,
      // and most of a body is exactly that.
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      if (bb) {
        span.copy(bb).applyMatrix4(_sf.multiplyMatrices(toFrame, mesh.matrixWorld));
        const near = Math.min(span.min.y * away, span.max.y * away);
        const far = Math.max(span.min.y * away, span.max.y * away);
        if (far <= 0) continue;
        if (near >= 0) {
          carryWhole(mesh);
          continue;
        }
      }
    }
    const p = project(mesh, toFrame);
    const go = harvest(mesh, p, away, null, owner);
    if (go) {
      slots.push(go);
      const m = new THREE.Mesh(go.geo, mesh.material);
      m.name = mesh.name;
      m.castShadow = mesh.castShadow;
      m.receiveShadow = mesh.receiveShadow;
      part.add(m);
    }
    // The stump goes back into the frame of the mesh it replaces and is hung off
    // the same parent, so whatever drives that node — a shoulder pivot, the
    // spine — goes on driving what is left of the limb.
    const keepInto = new THREE.Matrix4().copy(mesh.matrixWorld).invert().multiply(frame);
    const keep = harvest(mesh, p, -away, keepInto, owner);
    if (keep) {
      slots.push(keep);
      const m = new THREE.Mesh(keep.geo, mesh.material);
      m.name = mesh.name;
      m.castShadow = mesh.castShadow;
      m.receiveShadow = mesh.receiveShadow;
      m.position.copy(mesh.position);
      m.quaternion.copy(mesh.quaternion);
      m.scale.copy(mesh.scale);
      mesh.parent?.add(m);
      grafted.push(m);
    }
    mesh.visible = false;
    hidden.push(mesh);
  }

  // What the piece takes with it. A weapon rides the fist it was in — which is
  // the whole point of cutting an arm at the elbow — and a shield rides the
  // forearm it is strapped to. Neither ever gets cut, so each is judged whole.
  //
  // The test is the plane only for a limb cut, where the walk covers a limb the
  // plane crosses and the question is genuinely which side the object is on.
  // Above the waist and the neck the walk *is* the piece, so a sword goes with
  // the arm holding it whatever height it happens to hang at: a man cut in half
  // at the belt does not leave his axe standing on the field, and his fist is
  // below the cut while his shoulder is above it.
  const wholeWalk = id === "waist" || id === "neck";
  for (const obj of carried) {
    obj.updateWorldMatrix(true, false);
    _sf.multiplyMatrices(toFrame, obj.matrixWorld);
    if (!wholeWalk && _sv.setFromMatrixPosition(_sf).y * away <= 0) continue;
    moved.push({
      obj,
      parent: obj.parent,
      position: obj.position.clone(),
      quaternion: obj.quaternion.clone(),
      scale: obj.scale.clone(),
    });
    part.add(obj);
    _sf.decompose(obj.position, obj.quaternion, obj.scale);
  }

  // Two wounds: one in the body facing the way the piece went, one in the piece
  // facing back at it. The second is what makes a severed arm read as severed
  // while it is in the air rather than as an arm that was always a prop.
  const stumpUnder = asMesh(seam.anchor) ? (seam.anchor.parent ?? ctx.root) : seam.anchor;
  const stump = new THREE.Group();
  stump.name = `${RIG_TAG}stump`;
  stump.add(woundAt(seam, ctx.materials, detail, away));
  stumpUnder.updateWorldMatrix(true, false);
  _sf.copy(stumpUnder.matrixWorld).invert().multiply(frame).decompose(stump.position, stump.quaternion, stump.scale);
  stumpUnder.add(stump);
  part.add(woundAt(seam, ctx.materials, detail, -away));

  part.updateMatrixWorld(true);
  const com = new THREE.Box3().setFromObject(part).getCenter(new THREE.Vector3()).applyMatrix4(toFrame);

  let done = false;
  const severance: Severance = {
    zone,
    seam: id,
    part,
    com,
    mass: seam.mass,
    wound: new THREE.Vector3().setFromMatrixPosition(frame),
    spray: new THREE.Vector3(0, away, 0).transformDirection(frame),
    stump,
    radius: (seam.hw + seam.hd) * 0.5,
    carried: moved.map((m) => m.obj),
    release() {
      if (done) return;
      done = true;
      // The piece's geometry belongs to the pool the moment this returns, so the
      // piece itself has to leave the scene with it.
      part.removeFromParent();
      for (const m of grafted) m.removeFromParent();
      stump.removeFromParent();
      for (const s of slots) {
        s.busy = false;
        s.owner = null;
      }
      // Shared body geometry the piece was carrying rather than copying. This is
      // the refcount `emit` keeps, not a real free — the last body wearing this
      // kit is still the one that releases it.
      for (const g of retained) g.dispose();
      for (const r of moved) {
        r.parent?.add(r.obj);
        r.obj.position.copy(r.position);
        r.obj.quaternion.copy(r.quaternion);
        r.obj.scale.copy(r.scale);
      }
      for (const m of hidden) m.visible = true;
      ctx.live.delete(id);
      const i = LIVE.findIndex((e) => e.owner === owner);
      if (i >= 0) LIVE.splice(i, 1);
    },
  };
  ctx.live.set(id, severance);
  LIVE.push({ owner, release: severance.release });
  return severance;
}

// ============================================================
// Character builder
// ============================================================

export interface BuiltCharacter {
  group: THREE.Group;
  rightArm: THREE.Group;
  leftArm: THREE.Group;
  rightLeg: THREE.Group;
  leftLeg: THREE.Group;
  head: THREE.Group;
  cloak?: THREE.Group;
  torso: THREE.Mesh;
  /**
   * Every place this body can come apart, with the node and the local height of
   * each cut. Read it to aim a blood emitter or to measure a limb before it
   * leaves; `sever` is what actually takes one off.
   */
  seams: Readonly<Record<SeamId, Seam>>;
  /**
   * Takes a limb off, on the frame the kill arrives.
   *
   * Returns the piece, or `null` when the zone severs nothing — `torso` never
   * does, and neither does a seam whose limb has already gone. The body is
   * mutated in place: the severed geometry is hidden, a stump is grafted on and
   * a wound is plugged into it. The piece comes back unparented and standing in
   * world space at the cut; add it to a node with an identity world transform
   * and drive it from there.
   *
   * Everything it allocates is returned by `release()`, which puts the body back
   * exactly as it was. `reassemble()` does that for every piece at once, and a
   * respawn must call one or the other — pieces hold pooled geometry, and a pool
   * slot that is never handed back is a limb that vanishes off somebody else's
   * corpse five deaths later.
   */
  sever(zone: HitZone, opts?: SeverOptions): Severance | null;
  /**
   * Releases every live severance on this body. Safe to call on an intact one,
   * and the right thing to call on respawn and *before* disposing the rig —
   * a stump grafted onto a body holds pooled geometry, and the walk that
   * disposes a dead warrior's meshes would free buffers the pool still owns.
   */
  reassemble(): void;
}

function signatureOf(cls: WarriorClass, ap: Appearance, accents: number, detail: CharacterDetail, lib: string): string {
  return [
    lib, detail, cls, accents,
    ap.helm, ap.hairStyle, ap.hairColor, ap.beardStyle, ap.beardColor,
    ap.cloak, ap.armorColor, ap.warPaint,
  ].join("|");
}

/**
 * Fallback identity, handed out in build order. A real per-player seed belongs in
 * the caller — `anim.ts` already hashes `player.id` for the gait phase and that is
 * the number this wants — but until it is threaded through, build order is stable
 * within a session and identical across capture runs, which is what an A/B against
 * `art/shots/baseline` needs. The armoury mannequin deliberately does not draw
 * from it: a preview that reshuffled its own face every time you tried a helmet on
 * would be unusable.
 */
let FACE_SEQ = 0;

export function buildCharacter(
  cls: WarriorClass,
  ap: Appearance,
  accents: number,
  materials?: CharacterMaterials,
  detail: CharacterDetail = "high",
  seed?: number,
): BuiltCharacter {
  const M = materials ?? RAW;
  const lod = LOD[detail];
  const B = BUILD[cls] ?? BUILD.warden;
  const identity = seed ?? (materials ? FACE_SEQ++ : 0);
  const face = faceTraits(identity);
  // Stature is quantised to three steps rather than jittered continuously. Height
  // variety is worth a lot in a brawl of eight, but the body's merged geometry is
  // shared by signature, and a free-floating multiplier would hand every warrior
  // his own copy of every limb. Three steps means three bodies per loadout.
  const step = Math.round(hash(identity, 31) * 2) - 1;
  const S = skeleton({ ...B, stature: B.stature * (1 + step * 0.022) });
  const root = new THREE.Group();

  // --- substances. Held once so the merge groups by identity and eight
  // warriors in Rough Iron share one program and one geometry per part.
  //
  // The low tier collapses the near-neighbour pairs — linen into wool, buff into
  // black leather, the second skin tone into the first. That is a draw-call cut
  // on the device that needs one, and it costs a distinction that is under a
  // pixel wide on a phone. No layer, hem or class silhouette goes with it. ---
  const thrifty = detail === "low";
  const tone = SKIN_TONES[face.tone];
  const mail = M.armour(ap.armorColor);
  // Kit colours that no armoury option controls, and therefore mine. They were
  // authored two passes ago against a brighter grade and they are now the reason a
  // warrior reads as a hole in the frame: 0x2f2a22 trousers and 0x2c1e13 leather
  // carry 0.02 linear, less than the turf they stand on, so every layer of mail
  // and every strap on top of them lands inside one black shape. Lifted about a
  // stop and a half and pulled off the arena's tan axis — the huts, palisade and
  // soil are all one warm hue, and a warrior in cool grey-green wool separates
  // from them without anybody touching the grade.
  //
  // Cloth is asked for by girth rather than through `M.tunic`, which is fixed at
  // five repeats whatever it is dressing — see `clothRepeat`. The trousers are the
  // reason: five repeats round a thigh puts the wool tile's dye blotches 27 mm
  // apart, which is the houndstooth check in `art/shots/v4/stance.png`.
  const cloth = (color: number, girth: number) =>
    M.tinted("wool", color, { repeat: clothRepeat(girth) });
  // Torso girth, for the layers that go round it: an ellipse's perimeter, near
  // enough, off the chest section the garments are actually swept on.
  const bodyGirth = Math.PI * (1.5 * (S.chestHW + S.chestHD) - Math.sqrt(S.chestHW * S.chestHD)) * 2;
  const wool = cloth(accents, bodyGirth);
  const trouser = cloth(0x504a3e, 2 * Math.PI * S.legR[0]);
  const wrapWool = cloth(0xa2926e, 2 * Math.PI * S.legR[2]);
  const hide = M.hide(0x4a3524);
  const buff = thrifty ? hide : M.hide(0x7a5b38);
  // Linen is asked for by girth for the same reason wool is. A flat `repeat: 6`
  // put a ~200 mm tile on the shirt body and a ~75 mm one on the same shirt's
  // sleeve — one garment, two fabrics — and the coarse end is the finest cloth
  // in the set, where a visible tile costs most.
  const flax = (girth: number) =>
    thrifty ? wool : M.tinted("linen", 0xc2b69c, { repeat: clothRepeat(girth) });
  const linen = flax(bodyGirth);
  const sleeveLinen = flax(2 * Math.PI * S.armR[0] * 1.12);
  const iron = M.tinted("iron", 0x6e767f, { roughness: 0.5 });
  const steel = thrifty ? iron : M.blade(0xb6bfca, 0.3);
  // Cast bronze, not a bezel. `M.blade` puts brass on the steel substrate at
  // metalness 0.9 and roughness 0.34, which returns the sky's whole orange band
  // in one specular hit: every buckle, rivet and boss on the warrior was reading
  // as a blown yellow chip in `art/shots/v4/lineup.png`, and the belt plate was
  // reading as a placeholder square. Roughness 0.46 fixed that and is kept.
  //
  // What is dropped this pass is the *substrate*. The `bronze` recipe is a
  // corroded casting — its own comment says "verdigris in the cavities" — and it
  // grows broad green blooms off a field sampled at a 160 mm world tile. That is
  // right for a ship's rivet and wrong for every fitting a man wears: a 20 mm
  // shoulder boss gets a fifth of one bloom, so the stud is half green, and a
  // 4 mm cabochon lands wherever the field happens to be. Under the fire key in
  // `art/shots/helm/suttonhoo.png` every gold thing on the warrior is speckled
  // green and reads as glitter glue. Smooth and untextured, the same fittings
  // read as one poured metal, which is what cast bronze is. The micro-relief
  // that is lost was never resolvable at the size any of these are seen.
  const brass = M.standard(0xbfa25c, 0.46, 0.78);
  // The Sutton Hoo palette. Three substances that exist nowhere else on a
  // warrior, so the most expensive thing in the shop is not a recolour of the
  // second most expensive — and minted only for the helm that wears them, which
  // costs nothing when nobody is: the library caches tints by key.
  //
  //   `silver`  tinned bronze, which is what the real cap panels are faced with.
  //             Cool and a long way off white. It is not `steel`: at steel's own
  //             0.3 roughness the largest plate in the portrait framing returns
  //             the sky as one blown bar, which is the defect the brow band was
  //             taken off polish for, and a full face mask is four times the area.
  //   `gilt`    fire-gilding is mercury and gold burnished into bronze: it has no
  //             grain of its own, and the surface it leaves is continuous. So this
  //             is untextured, brighter and glossier than `brass`, and it is the
  //             one metal on the warrior allowed near a mirror. Metalness stays off
  //             1.0 and roughness off 0.25 for the reason the whole file keeps
  //             repeating — the arena's ember horizon comes back in one hit and the
  //             fitting turns into a blown yellow chip — but at 0.31 the brow, the
  //             nose and the crest each roll a single travelling highlight, which
  //             is the difference between cast metal and speckle.
  //   `garnet`  a dielectric, not a metal, and that is the whole trick. F0 of 0.04
  //             gives a small hard specular dot over an albedo dark enough to stay
  //             red under the arena's fire, which is what a cabochon does and a
  //             metallic red never does. 0.17 roughness was still too open: the
  //             lobe was wide enough to pull the fire's whole orange band across a
  //             4 mm cell, so the cells rendered mottled orange-gold rather than
  //             red — the previous owner predicted this number would need tuning
  //             and it did. 0.12 keeps the dot to a dot. The albedo went to a third
  //             of its old luma in the same pass and that overshot: a dielectric
  //             with almost no diffuse and nothing bright to reflect is a black
  //             bead, and a row of black beads on gold reads as rivets rather than
  //             as cloisonné — which is what the first capture of this pass showed.
  //             0x6a1019 is dark enough to stay red under the arena's fire and
  //             light enough to be seen as red rather than as a hole in the metal.
  //
  // THE TILE, and this is the pass that says why these are textured at all.
  //
  // Both of these shipped as smooth fields — `silver` on steel's own 300 mm world
  // tile and `gilt` on nothing at all — and the review that came back called the
  // gold "a smooth plastic gradient" and the dome "painted polystyrene", which is
  // exactly right and is a *density* fault rather than a colour one. A tile
  // larger than the object it dresses contributes one gradient and nothing else:
  // the dome is 220 mm across and got less than one tile of steel, a 15 mm brow
  // band got a twentieth of one, so every fitting on the helmet rolled a single
  // unbroken specular lozenge from end to end. One smooth travelling highlight is
  // the plastic tell — real beaten metal breaks it, and breaking it needs the
  // grain to be finer than the part.
  //
  // 85 mm on the cap: two and a half planish courses across the dome, which is
  // what a hammer leaves and what stops the crown returning the sky as one bar.
  // 28 mm on the gilt: a chased fitting is worked at a much smaller pitch than a
  // beaten plate, and at 28 mm the brow band carries three cycles along its length
  // and the crest seven, so the highlight travels in steps down the ridge instead
  // of sliding. Both are on the `steel` recipe rather than `bronze` for the reason
  // written above — bronze's verdigris blooms are 160 mm wide and a fitting cannot
  // hold one.
  const noble = helmStyle(ap.helm).noble;
  // `interlace`, not `steel`, and this is the answer to the loudest single line
  // in the review: "the single most identifying feature of the artefact — the
  // whole surface sheathed in figural and interlace panels — is simply absent."
  // The helmet is not a bare bowl with gold on it; it is a bowl faced all over
  // in die-stamped tinned foil, and without that it is a helmet rather than the
  // helmet. The substance is generated in code like every other one here (see
  // `buildInterlace`), so this costs no asset.
  //
  // 18 mm, down from 30, and the arithmetic that got 30 wrong is worth keeping
  // because it is easy to repeat. `buildInterlace` lays three plait repeats
  // across the tile on *each* diagonal, so the ribbon centrelines recur every
  // `tile / (3·√2)` measured square to a strand — 7 mm at a 30 mm tile, with a
  // ribbon 3 mm wide standing in it. Three millimetres of high-contrast ribbon
  // is six pixels at the framing a shop card and a portrait use, and six pixels
  // of alternating light and dark is not ornament worked into metal: it is
  // wicker, which is what the turntable shows and what a reviewer called it.
  // Die-stamped foil is read as a *sheen* that resolves into pattern when you
  // lean in. At 18 mm the ribbon is 1.8 mm and about three pixels, which is
  // where the plait stops being a weave the eye counts and starts being a worked
  // surface — and the substance is under `MIP_AA_CEILING`, so the levels below
  // roll it into tone rather than into crawl.
  //
  // 11 mm, down from 18, and the 18 mm reasoning was right about the mechanism
  // and wrong about the framing it was solving for. It sized the ribbon against
  // a shop card; the turntable is 400 px of head, and there the 18 mm tile lays
  // a diamond about ten pixels across over the whole cap and mask. Ten pixels of
  // alternating light and dark IS the weave the eye counts — the capture reads
  // as basketwork stretched over a helmet, which is the "wicker" note, and it is
  // the same note the 30 mm tile got. At 11 mm the diamond is six pixels at the
  // same framing and about three at arm's length on a phone, which is where a
  // stamped foil stops being a pattern and becomes a sheen with a pattern in it.
  // Under `MIP_AA_CEILING`, so the levels below roll it into tone, not crawl.
  const silver = noble ? M.tinted("interlace", 0x9aa6ae, { roughness: 0.46, metalness: 0.72, tile: 0.011 }) : steel;
  const gilt = noble ? M.tinted("steel", 0xd9b45f, { roughness: 0.33, metalness: 0.9, tile: 0.028 }) : brass;
  // Up from 0x6a1019, and this is the third time this number has moved. The last
  // pass fixed the hue — the cells measured 335–349° with no orange left in them,
  // which was the fault — and overshot the value: at 0.24–0.39 luma a cabochon on
  // gold reads as a drill hole rather than as a stone, which is the review this
  // one is answering. What was missing from the reasoning both times is that a
  // Sutton Hoo garnet is not a bead sitting on metal. Every cell is floored with
  // stamped gold foil, and the stone is cut thin over it so that the light which
  // gets past the surface comes back *through* the red. That is a brighter
  // dielectric than a solid garnet, and it is why the cloisonné on the artefact
  // glows in a case rather than going black. 0x8e1a26 is the same hue at 0.56.
  const garnet = noble ? M.standard(0x8e1a26, 0.13) : brass;
  // Flesh is authored against a *canonical* tone and swapped at mesh time. The
  // geometry a warrior's arms and neck merge into does not depend on his
  // complexion — only the material bound to it does — so folding the tone into the
  // cache key the way the stature step has to be folded in would fork every limb
  // in the game four ways for nothing. Authoring canonically and remapping keeps a
  // shieldwall down to one set of bodies per stature step. Measured: it is the
  // difference between 316 distinct geometries across eight warriors and 120.
  const canon = SKIN_TONES[0];
  // Roughness 0.5 rather than the substance's own 0.6, on all flesh.
  //
  // This is the other half of "the skin is too uniformly bright", and it is the
  // half that works on the open planes where an albedo patch cannot (see
  // `addFaceTones`). Skin's F0 is 0.04, so the specular term is small — but it is
  // the *only* term in this rig that varies with the normal in a way the eye reads
  // as form, because the diffuse is dominated by light that is either
  // omnidirectional or straight down the camera axis. Tightening the lobe puts a
  // real fall-off across the cheek, the brow and the forearm: up-facing bone
  // catches the key at 60° and the planes below it do not. 0.5 is as far as it can
  // go before a warrior looks oiled.
  const skin = M.tinted("skin", canon.base, { roughness: 0.5, repeat: 2 });
  const skinDark = thrifty ? skin : M.flesh(canon.shade);
  // The warm tone is the whole subsurface cheat: lips, ears, lid rims, fingertips —
  // and, this pass, the brow ridge and the crest of the cheekbone, which is where a
  // face flushes and therefore the cheapest honest highlight there is.
  //
  // A *lighter* tone was tried there first, on a tighter specular lobe, and it was
  // wrong twice over. The specular term does not scale with albedo — F0 is 0.04 for
  // all skin — so a fixed highlight lifts dark skin proportionally more, and on the
  // two darker complexions the cheekbone patch rendered as a white smear under the
  // eye. Debug-coloured to confirm it: the smear was the patch's own specular
  // response, not its albedo and not its rim. Warm at skin's own roughness has no
  // specular difference to smear, and the highlight that actually reads is the one
  // the *form* makes — the zygomatic push stands 13 mm out and 10 mm forward over a
  // hollow, so the crest catches the 60° key and the cheek under it does not.
  // It collapses into the base tone on low, because at that tessellation the parts
  // that wear it are two pixels each and a draw call is worth more than they are.
  const skinWarm = thrifty ? skin : M.flesh(canon.warm);

  // ---- the head's own flesh, and why it is not the body's ----
  //
  // The face card resolves 1220 px per metre. A forearm is seen at a fifth of
  // that and the head is the only part of a warrior anybody looks at from a
  // metre away, so the two cannot share a texel density — and they were sharing
  // one. `skin`'s crease field is drawn at `ridge` × 8 and × 16 with the tile
  // laid down twice; `flesh()` takes the recipe's own default and lays it down
  // ONCE. The head's UV is a full equirectangular wrap, so one tile spans the
  // whole skull: that put roughly eleven crease cells across the visible front
  // of the face at sixteen pixels each, and a value-noise ridge field is
  // axis-aligned, so what came out was not skin texture — it was a **regular
  // rectilinear grid of dark dashes ruled over the forehead, the cheek and the
  // neck**. That grid is most of what "reads as a crude pale mask" is, and none
  // of the sculpting under it could win against it.
  //
  // The lever is `tile` and not `repeat`: `skin` is one of the world-sized
  // substances, projected from object space in metres, so a UV repeat is dropped
  // on the floor before it reaches the shader (materials.ts, `WORLD_TILE`). At
  // its 35 mm tile the ridge field's base octave lands at about 4.4 mm — which is
  // life-sized and would be right if the field were isotropic. It is value noise
  // on a lattice, so what it actually draws is a REGULAR RECTILINEAR GRID, and a
  // grid at 4.4 mm on a face seen at 0.8 mm per pixel is five pixels a cell: big
  // enough to be counted. An 8.5 mm tile puts a cell at 1.1 mm, which is under
  // one and a half pixels at portrait range and well under one everywhere else,
  // so the lattice stops being a pattern and becomes the grain it was drawn to
  // be. The face is the only part of a warrior this has to be done for, because
  // it is the only part seen at 1220 px per metre.
  //
  // Three materials rather than one because the shade and warm tones carry the
  // same tile and had the same defect at half the density. They cost nothing:
  // the head is merged per material anyway and these replace the entries the
  // body's three were making in it.
  // 2.2 mm, not 8.5, and this time it is measured on the frame rather than
  // predicted off the recipe.
  //
  // The 8.5 mm above was chosen by reading `buildSkin` and multiplying: the ridge
  // field's base octave lands at 1.1 mm, which is under a pixel, therefore grain.
  // The frame disagrees. An FFT of an 80x80 patch of the vault on
  // `art/shots/judge/cards/headturn-profile_90_.png` returns ONE sharp peak, at a
  // period of 5.7 px in x with almost no y component — a ruled square lattice,
  // and at that card's 1.22 px/mm that is a 4.7 mm cell. Nothing in the recipe is
  // 4.7 mm. 8.5 / 4.7 is 1.8, and that is the giveaway: what is being drawn is
  // not any octave of the noise, it is THE TILE ITSELF. A 256 texel map at a
  // 8.5 mm tile is 0.033 mm a texel, which at portrait range is twenty-five
  // texels to a pixel — mip level 4.6, an effective 10x10 map. Every octave the
  // recipe was reasoned about has been filtered away by then, and all that is
  // left is a single blob per tile, stamped every 8.5 mm. That is the owner's
  // woven cross-hatch, and it is why 35 mm also read as a grid and merely as a
  // coarser one: pushing content under a pixel does not delete it, it hands it to
  // the tile repeat. This file has already found the same failure twice on the
  // ground — see `grit` in textures.ts, "sub-texel content there is not dither,
  // it is crawl".
  //
  // The head's own Nyquist note is the rule to settle it with, applied to the
  // thing actually being drawn: the repeat has to be under the resolving limit,
  // not the octave. At 2.2 mm the stamp lands at 1.2 mm, which is 1.5 px at the
  // portrait framing and well under one at fight range, so the lattice stops
  // being a pattern the eye can count.
  //
  // What that costs is the low-frequency variation that stops skin reading as a
  // mannequin, because a 2.2 mm tile has none left. It is bought back below, in
  // `faceComplexion`, which is the right home for it anyway: it is written in the
  // skull's own direction space, it is on no lattice at all, and it is already
  // where every other thing that varies across a face lives.
  const FACE_TILE = 0.0022;
  const faceTile = (color: number, roughness: number) => {
    if (thrifty) return skin;
    const m = M.tinted("skin", color, { roughness, tile: FACE_TILE });
    // The complexion field rides on these three and nothing else does, which is
    // what makes it safe to turn the flag on in the library's own cache: only
    // head geometry ever wears them, and `Part.add` guarantees every piece of it
    // carries the attribute. Set once — the material is shared across every
    // warrior on the field and `needsUpdate` on a live program is not free.
    if (!VERTEX_TINTED.has(m)) {
      VERTEX_TINTED.add(m);
      m.vertexColors = true;
      m.needsUpdate = true;
    }
    return m;
  };
  const headSkin = faceTile(canon.base, 0.62);
  const headShade = faceTile(canon.shade, 0.56);
  const headWarm = faceTile(canon.warm, 0.55);

  const reskin = new Map<THREE.Material, THREE.Material>();
  if (tone !== canon) {
    reskin.set(skin, M.tinted("skin", tone.base, { roughness: 0.5, repeat: 2 }));
    // Guarded, not unconditional: on the low tier all three are the same instance
    // and a second `set` would quietly repaint the whole body in the shade tone.
    if (!thrifty) {
      reskin.set(skinDark, M.flesh(tone.shade));
      reskin.set(skinWarm, M.flesh(tone.warm));
      reskin.set(headSkin, faceTile(tone.base, 0.62));
      reskin.set(headShade, faceTile(tone.shade, 0.56));
      reskin.set(headWarm, faceTile(tone.warm, 0.55));
    }
  }
  // The white of the eye, and it is deliberately neither white nor fixed.
  //
  // A sclera brighter than the skin around it is *the* classic CG tell: the eyes
  // stop being wet spheres in shadowed sockets and become two lamps set in a mask,
  // which is what `art/shots/v3/portrait.png` shows — two bright glints under a
  // helm brow. 0xcfc8b8 carried more luma than every complexion in `SKIN_TONES`.
  // It is also per complexion, for the same reason: the specular term does not
  // scale with albedo, so one fixed sclera that looks right against the palest skin
  // renders as a white sliver under the eye of the darkest. Each tone carries one
  // at about 0.86 of its own luma, which keeps the relationship — sclera under
  // skin, iris under sclera — the same on all four. The roughness went to 0.22 for
  // one iteration to buy back the wetness the darker albedo lost, and that was
  // wrong: a lobe that tight on an up-facing part of a sphere returns the sky's
  // whole orange band, so the sclera below the iris rendered as a white sliver on
  // exactly the complexions the albedo change was meant to help. 0.34 gives a dot
  // and not a smear.
  const sclera = M.standard(canon.sclera, 0.34);
  // Remapped like the flesh, and for the identical reason: the head's merged
  // geometry is shared by loadout, so the tone has to ride on the material rather
  // than fork the mesh. Declared after `reskin` is built and inserted here because
  // the map is only read at mesh time, in `emit`.
  if (tone !== canon) reskin.set(sclera, M.standard(tone.sclera, 0.34));
  const iris = M.standard(IRIS_COLORS[face.iris], 0.09);
  // Hair and beard are wool — there is no hair substance in the library and there
  // is no budget for one — so what matters is the density it is tiled at. `cloth`
  // would give a skull-sized patch twelve repeats, at which the tile's weave is
  // still resolvable and a warrior's crop reads as a knitted cap. At twenty the
  // individual yarns are about a millimetre and average out to fibre, which is what
  // hair does at any distance a player sees it from.
  // 48, not 20. `repeat` here is tiles across the *patch's own* 0..1 UV, and a
  // crop's shell spans about 500 mm of skull — so twenty tiles put the wool
  // weave at 25 mm, which resolves as knitting at every distance a head is seen
  // from and is most of why every frame of this build reads the hair as a
  // bathing cap. At 48 a yarn is about a millimetre and averages to fibre, which
  // is what hair does. The brows ride the same material and want it finer still.
  const hair = M.tinted("wool", ap.hairColor, { repeat: 48 });
  // 26, not 18. The beard patch is the largest single area of hair on the head
  // and at 18 repeats the wool tile's weave was resolving as a grid — the "flat
  // waffle panel" both panels named. It is the same tile as the hair; what makes
  // hair read as fibre rather than as knitting is only ever the density it is
  // tiled at, and a beard covers less skull than a crop does, so it needs more.
  const beard = M.tinted("wool", ap.beardColor, { repeat: 56 });
  // Fur goes the other way from hair: the wool tile's dye blotches are the one
  // thing in the library that reads as clumps of pelt, so this wants them large.
  // Six repeats over a shoulder ruff puts a clump every 40 mm, which is a fleece.
  // Fur is wool at a much coarser tile than clothing — the dye field's blotches
  // are the one thing in the library that reads as clumps of pelt — but it has to
  // be a *constant* coarseness. A flat `repeat: 6` spanned a shoulder ruff, a
  // hanging lock and a box pelt off one material, an 8:1 texel scatter inside one
  // garment: the same class of defect `WORLD_TILE` exists to kill. The tile below
  // is what 6 repeats gave the ruff, which is the surface it was tuned on, so the
  // ruff does not move and everything else comes to meet it. Integer repeats
  // rather than a continuous ratio: a fractional repeat wraps mid-tile and draws
  // a seam, which on a 90 mm lock would be most of the lock.
  const PELT_TILE = 0.25;
  const pelt = (girth: number) =>
    M.tinted("wool", 0x8a7050, { repeat: Math.max(1, Math.round(girth / PELT_TILE)) });
  const ruffX = S.chestHW + 0.062;
  const ruffZ = S.chestHD + 0.062;
  const fur = pelt(Math.PI * (1.5 * (ruffX + ruffZ) - Math.sqrt(ruffX * ruffZ)));
  const furLock = pelt(2 * Math.PI * 0.024);
  const furPelt = pelt(0.3);
  const dark = M.standard(0x1a1310, 0.42);
  const rune = M.get("runeGlow");
  const cloakMat = cloth(CLOAK_COLORS[ap.cloak] ?? 0x5a4030, bodyGirth * 1.4);

  // --- merged-geometry cache. Only for callers that brought a shared library;
  // the armoury preview allocates and disposes its own materials, so caching its
  // geometry would hand the next preview a mesh pointing at a dead program.
  //
  // Two signatures, not one. The body is shared by loadout and stature step, so a
  // shieldwall of huscarls is still three sets of limbs; the head carries the
  // seed as well, because a face that varies is a face that cannot be shared. That
  // split is the difference between eight unique warriors costing one extra head
  // each and costing eight of everything. ---
  const base = materials ? `${signatureOf(cls, ap, accents, detail, libraryId(M))}|s${step}` : null;
  const headSig = base ? `${base}|f${identity}` : null;

  function storeFor(signature: string): Map<string, MergedPart> {
    let s = RIG_CACHE.get(signature);
    if (!s) {
      s = new Map<string, MergedPart>();
      RIG_CACHE.set(signature, s);
    }
    return s;
  }

  function emit(name: string, parent: THREE.Object3D, make: () => Part, sig = base): THREE.Mesh[] {
    const store = sig ? storeFor(sig) : undefined;
    let merged = store?.get(name);
    if (!merged) {
      merged = make().merge();
      if (store && sig) {
        for (const { geo } of merged) guard(geo, sig);
        store.set(name, merged);
      }
    }
    const meshes: THREE.Mesh[] = [];
    for (const { geo, mat } of merged) {
      if (sig) USES.set(geo, (USES.get(geo) ?? 0) + 1);
      const mesh = new THREE.Mesh(geo, reskin.get(mat) ?? mat);
      // Tagged so a cut can walk a rig that other owners have since hung a
      // weapon, a shield and a bone chain off, and tell body from baggage. The
      // name and not `userData`, because `articulate` rebuilds every limb mesh
      // as a `SkinnedMesh` and carries the name across — nothing else survives.
      mesh.name = RIG_TAG + name;
      parent.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }

  // Class kit flags, read all over the build below.
  const heavy = cls === "huscarl";
  const lamellar = cls === "warden";
  const bare = cls === "berserker";
  const robed = cls === "runekeeper";

  // ==========================================================
  // LEGS — pivot at the hip joint, everything below in leg space
  // ==========================================================
  const legPivots: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.name = `${RIG_TAG}leg${side}`;
    pivot.position.set(side * S.hipX, S.hipY, 0);
    root.add(pivot);
    legPivots.push(pivot);

    const knee = S.kneeY - S.hipY;
    const ankle = S.ankleY - S.hipY;
    const sole = -S.hipY;
    const [rHip, rKnee, rCalf, rAnkle] = S.legR;

    emit(`leg${side}`, pivot, () => {
      const p = new Part();
      // Thigh into knee into calf into ankle — one continuous taper, with the
      // calf belly sitting where a calf actually sits.
      p.add(shell([
        { y: 0.03, hw: rHip * 1.02, hd: rHip * 1.05 },
        { y: -0.16, hw: rHip * 0.94, hd: rHip * 0.98 },
        { y: knee + 0.02, hw: rKnee * 1.06, hd: rKnee * 1.02 },
        { y: knee - 0.03, hw: rKnee * 1.02, hd: rKnee * 1.06 },
        { y: knee - 0.12, hw: rCalf, hd: rCalf * 1.1, z: -0.012 },
        { y: ankle + 0.1, hw: rAnkle * 1.3, hd: rAnkle * 1.35 },
        { y: ankle, hw: rAnkle, hd: rAnkle * 1.05 },
      ], lod.limb, { capTop: true, capBottom: true }), trouser);

      // Leg wraps: wound wool from ankle to below the knee, the one piece of
      // Dark Age kit everybody wore and nobody models.
      const wrapTop = knee - 0.05;
      p.add(shell([
        { y: wrapTop, hw: rKnee * 1.14, hd: rKnee * 1.16 },
        { y: mix(wrapTop, ankle, 0.5), hw: rCalf * 1.1, hd: rCalf * 1.14 },
        { y: ankle + 0.03, hw: rAnkle * 1.28, hd: rAnkle * 1.32 },
      ], lod.limb, { wall: 0.008 }), wrapWool);
      if (lod.trim) {
        for (let i = 0; i < 5; i++) {
          const t = (i + 0.5) / 5;
          const y = mix(wrapTop, ankle + 0.03, t);
          const r = mix(rKnee * 1.14, rAnkle * 1.28, t) + 0.004;
          p.add(ring(r, 0.0045, 4, 10), buff, xf(0, y, 0, Math.PI / 2, 0, 0.14, 1, 1, 1.04));
        }
      }
      if (lamellar && lod.trim) {
        // Iron shin plate — the warden's discipline, visible below the hem.
        p.add(shell([
          { y: knee - 0.09, hw: rCalf * 1.24, hd: rCalf * 1.3 },
          { y: ankle + 0.08, hw: rAnkle * 1.5, hd: rAnkle * 1.6 },
        ], lod.limb, { wall: 0.009 }), iron);
      }

      // ---- the turnshoe ----
      //
      // What was here was a wedge box with a ball stuck on the front of it, and
      // `art/shots/v7/lineup.png` shows exactly that: a brown slipper with no sole
      // line, no topline, no heel and no toe — the outline of a foot-shaped bag.
      // A boot is the last thing on a standing figure the eye reaches and the
      // first place it checks that the figure is standing *on* something, and this
      // one gave it a single silhouette with one highlight and no edges anywhere.
      //
      // It is now built the way a turnshoe is: a last, a sole cut wider than the
      // last so it stands proud all round as a welt, and a rand between them. The
      // welt is the piece that earns its triangles. It is a value break and a
      // specular line running the whole way round the join, in a second substance,
      // sitting exactly where a viewer's eye goes to decide whether a foot is on
      // the ground — and it reads from behind and from above, which the old ball
      // did not read from at all.
      //
      // Everything below is swept along the foot rather than up the leg: `lastAt`
      // takes a distance forward of the ankle, a half-width, and the heights of
      // the section's top and bottom above the ground, and the whole sweep is
      // turned a quarter-turn onto its side. `lift` is what gives the toe its
      // spring — a last curls clear of the ground over the last 60 mm, which is
      // the difference between a shoe and a plank.
      //
      // The footprint is deliberately the one that was here — 245 mm long, 73 mm
      // of it behind the ankle, 104 mm across — because it is load-bearing outside
      // this file and the pass that changes it should be the pass that says so.
      // `anim.ts` solves the body's height against the hip pivot on the assumption
      // that the sole sits exactly `legLen` below it, and it still does; what that
      // solve does *not* know is `FOOT_FWD`, which is why a leg pitched 48° puts
      // its toe 128 mm through the turf. See the constants.
      const lastAt = (fwd: number, hw: number, top: number, lift = 0): Station =>
        ({ y: -fwd, hw, hd: (top - lift) * 0.5, z: (top + lift) * 0.5 });
      const onFoot = xf(0, sole, 0, -Math.PI / 2, 0, 0);

      // The shaft, and the topline is the whole point of it: leather meeting a
      // legging along a colour change and nothing else is most of why the boot
      // read as a painted-on sock. `wall` makes that opening an edge with a lit
      // inside face, which is what says the leg goes *into* the boot.
      p.add(shell([
        { y: ankle + 0.030, hw: rAnkle * 1.30, hd: rAnkle * 1.34, z: -0.004 },
        { y: ankle - 0.012, hw: rAnkle * 1.36, hd: rAnkle * 1.46, z: 0.004 },
        { y: sole + 0.052, hw: rAnkle * 1.32, hd: rAnkle * 1.62, z: 0.016 },
      ], lod.limb, { power: 2.2, wall: 0.007 }), hide);

      // The last. The heel quarter is swept as part of it rather than banded on
      // afterwards, and that is not a saving — a stiffener added as its own shell
      // has two ends, and an end on a curved surface is a rim strip facing the key
      // squarely while the leather either side of it does not. That is the same
      // mechanism the cloak hem and the face tones lost two passes to. Built into
      // the sweep, the counter is a change of slope with no boundary at all.
      p.add(shell([
        lastAt(-0.068, 0.029, 0.058, 0.008),
        lastAt(-0.056, 0.035, 0.084, 0.011),
        lastAt(-0.038, 0.039, 0.094, 0.013),
        lastAt(-0.008, 0.041, 0.100, 0.014),
        lastAt(0.036, 0.044, 0.078, 0.014),
        lastAt(0.086, 0.047, 0.058, 0.013),
        lastAt(0.132, 0.041, 0.042, 0.014),
        lastAt(0.164, 0.019, 0.026, 0.019),
      ], lod.limb, { power: 2.3, capTop: true, capBottom: true }), hide, onFoot);

      // The sole, 5 mm proud of the last all round. Waisted between heel and ball
      // because that is the outline a foot actually leaves, and because a straight
      // taper is what made the old sole read as a plank.
      p.add(shell([
        lastAt(-FOOT_BACK, 0.026, 0.016),
        lastAt(-0.050, 0.036, 0.017),
        lastAt(-0.010, 0.042, 0.016),
        lastAt(0.034, 0.044, 0.015),
        lastAt(0.086, 0.052, 0.016),
        lastAt(0.138, 0.045, 0.017, 0.003),
        lastAt(FOOT_FWD, 0.018, 0.020, 0.009),
      ], lod.limb, { power: 2.6, capTop: true, capBottom: true }), buff, onFoot);

      if (lod.trim) {
        // The rand: a second course between sole and upper, 2 mm proud of the last
        // and 2 mm inside the sole. It costs one sweep and it buys the join two
        // edges instead of one, all the way round with no ends anywhere — which is
        // what makes a foot read as standing on something from directly behind,
        // the angle `art/shots/v7/stance.png` puts the rear boot at.
        p.add(shell([
          lastAt(-0.0705, 0.0300, 0.030, 0.012),
          lastAt(-0.0490, 0.0378, 0.030, 0.013),
          lastAt(-0.0100, 0.0432, 0.029, 0.013),
          lastAt(0.0340, 0.0455, 0.028, 0.013),
          lastAt(0.0860, 0.0500, 0.029, 0.013),
          lastAt(0.1370, 0.0440, 0.030, 0.015),
          lastAt(0.1700, 0.0185, 0.031, 0.019),
        ], lod.limb, { power: 2.5, capTop: true, capBottom: true }), buff, onFoot);
        p.add(ring(rAnkle * 1.32, 0.005, 4, 10), buff, xf(0, ankle + 0.005, -0.004, Math.PI / 2, 0, 0));
      }
      return p;
    });
  }
  const [leftLeg, rightLeg] = legPivots;

  // ==========================================================
  // TORSO — under-tunic, then wool, then metal, then straps
  // ==========================================================
  const torsoMeshes = emit("torso", root, () => {
    const p = new Part();
    const seg = lod.body;

    // One profile for the body, sampled by every layer that goes over it. Each
    // garment used to carry its own station list, which is how the trapezius
    // slope ended up compressed into 2 mm of height and the waist vanished
    // entirely: a layer can only agree with the body if it is derived from it.
    //
    // The top three stations are the trapezius, and they are the reason the old
    // shoulders read as a slab with a pipe stuck in it. They used to run 1.625 /
    // 0.069 → 1.570 / 0.110 → 1.544 / 0.164: 95 mm of width bought with 81 mm of
    // drop, a straight 40° cone, and then the deltoid cap popped back up above it
    // at 1.607 — so each side of the neck had a V-shaped notch cut out of it. The
    // profile below leaves the neck almost level and turns down late, which is the
    // fan a trapezius actually makes, and the cap has come down to meet it.
    //
    // The topmost station is deliberately *narrower than the neck shell that rises
    // out of it*. At yokeHW * 0.5 the torso's own capped top stood 7 mm proud of
    // the throat and you could see the disc — a lit horizontal plate under the
    // chin, which is exactly what a floating head looks like.
    // The bottom half is new, and it is the "no pelvis mass" finding. The list
    // used to stop 50 mm under the hip joint on a ring 6 mm narrower than the one
    // above it, so a body went waist → straight tube → open hole, and the two
    // thigh shells rose into that hole as separate pipes with daylight between
    // them right up to the hem. There was no crotch, no gluteal volume and no
    // iliac flare anywhere on the figure — and because every garment is swept off
    // `at()`, which samples this list, no skirt had any swing either.
    //
    // The last station here is the hip and not the crotch on purpose. `at()`
    // clamps below its final station, so a skirt hanging past the pelvis takes
    // that station's width: terminate the sampler at the crotch and a tunic hem
    // comes out *inside* the thighs. The crotch stations are appended separately
    // for the body shell only — see `seat`.
    const spine: Station[] = [
      { y: S.neckRoot - 0.046, hw: S.neckHW * 0.86, hd: S.neckHD * 0.80 },
      { y: S.neckRoot - 0.062, hw: S.yokeHW * 0.80, hd: S.yokeHD * 0.82 },
      { y: S.neckRoot - 0.082, hw: S.yokeHW * 1.03, hd: S.yokeHD * 0.92 },
      { y: S.shoulderY - 0.012, hw: S.chestHW * 0.97, hd: S.chestHD * 0.96 },
      { y: S.shoulderY - 0.052, hw: S.chestHW * 0.995, hd: S.chestHD * 0.99 },
      { y: S.chestY, hw: S.chestHW, hd: S.chestHD },
      { y: S.waistY, hw: S.waistHW, hd: S.waistHD },
      // Iliac crest: where the pelvis starts to swell out of the waist.
      { y: S.beltY - 0.032, hw: S.waistHW * 1.05, hd: S.waistHD * 1.05 },
      // Widest across the trochanters, and set back in z — a pelvis carries its
      // volume behind the hip joint, not around it.
      { y: S.hipY + 0.055, hw: S.hipHW, hd: S.hipHD, z: -0.007 },
      { y: S.hipY - 0.020, hw: S.hipHW * 0.99, hd: S.hipHD * 1.03, z: -0.011 },
    ];
    // The seat: the last 75 mm of pelvis, closing the two thighs into one mass.
    // Kept off `spine` so it cannot be sampled by a garment.
    const seat: Station[] = [
      { y: S.crotchY + 0.034, hw: S.hipHW * 0.87, hd: S.hipHD * 0.93, z: -0.009 },
      { y: S.crotchY, hw: S.hipHW * 0.62, hd: S.hipHD * 0.75, z: -0.003 },
    ];
    const at = (y: number, pad: number, flare = 0): Station => {
      let i = 0;
      while (i < spine.length - 2 && y < spine[i + 1].y) i++;
      const a = spine[i];
      const b = spine[i + 1];
      const t = clamp01((a.y - y) / (a.y - b.y || 1));
      return { y, hw: mix(a.hw, b.hw, t) + pad + flare, hd: mix(a.hd, b.hd, t) + pad + flare };
    };
    const layer = (ys: number[], pad: number, flares?: number[]): Station[] =>
      ys.map((y, i) => at(y, pad, flares?.[i] ?? 0));

    // Where every neck opening sits, measured off the cervicale rather than off
    // the yoke's base. 14 mm below it puts a tunic neckline on the collarbone; the
    // mail rides 12 mm lower again so both edges are visible as edges. This is the
    // single number that decides how much bare throat the frame shows.
    const collar = S.neckRoot - 0.014;
    // Every layer takes a station here, and the reason is worth stating because
    // getting it wrong cost a pass. Above the spine's topmost station `at()` clamps,
    // so every collar is built off the *same* base width and differs only by its pad
    // — which is exactly the nesting we want. Below it they ramp to the shoulder at
    // different rates from different heights, and the one that starts highest
    // arrives widest: raise the collar line without this shared station and the
    // linen shirt comes out through the hauberk for the first 23 mm. Derived from
    // `spine[0].y` rather than from `collar` so it cannot drift out of the clamped
    // band and quietly stop working.
    const ramp = spine[0].y + 0.004;

    // Breeches over the seat, for every class. Without this the pelvis stops at
    // the last spine station and the crotch is a hole; with it, the two thigh
    // shells rise into one continuous mass and the figure has a fork instead of a
    // gap. Under the tunic on three of the four, and the berserker's actual
    // trousers on the fourth — same material either way, so it is one more shell
    // and no extra draw call.
    p.add(shell([
      { y: S.hipY + 0.06, hw: S.hipHW * 0.98, hd: S.hipHD * 0.99, z: -0.006 },
      ...seat,
    ], seg, { power: 2.3, capBottom: true }), trouser);

    if (bare) {
      p.add(shell(spine, seg, { power: 2.4, capTop: true, capBottom: true }), skin);
      // Pectorals and a rack of abdominals, as separate masses so the light
      // breaks over them instead of sliding round a barrel.
      for (const s of [-1, 1]) {
        p.add(ball(0.072 * B.bulk, 10), skin, xf(s * S.chestHW * 0.46, S.chestY + 0.03, S.chestHD * 0.72, 0, 0, 0, 1.25, 0.72, 0.5));
      }
      for (let i = 0; i < 3; i++) {
        for (const s of [-1, 1]) {
          p.add(ball(0.034 * B.bulk, 8), skin, xf(s * 0.042, S.chestY - 0.09 - i * 0.062, S.waistHD * 0.86, 0, 0, 0, 1, 0.85, 0.42));
        }
      }
    } else {
      // Linen shirt: the first layer, and the one that shows at the collar and
      // the cuff. Its whole job is to be visible for 15 mm at each opening.
      // The +6 mm flare at the neckline is not cosmetic: this shell is capped, so
      // its top is a disc the throat passes through, and at the shirt's bare pad the
      // annulus left round the neck is 2 mm wide and z-fights the skin. 8 mm of linen
      // reads as the inside of a neckline instead.
      p.add(shell(layer([collar + 0.006, ramp, S.shoulderY, S.chestY, S.waistY, S.hipY, S.hipY - 0.05], 0.008, [0.006]), seg, { power: 2.4, capTop: true, capBottom: true }), linen);
    }

    // Wool tunic over it, with a real rolled edge, hung at the class's own hem.
    //
    // This was `0.86 * B.stature`, and `B.stature` is a *multiplier* near 1 — not
    // a height — so every class wore its hem at 860 mm however it was built, and
    // the huscarl's hauberk finished 160 mm from the runekeeper's robe. Four
    // silhouettes that differ by 160 mm at the one place a garment draws a
    // horizontal are four silhouettes nobody can tell apart, which is what
    // `art/shots/v6/lineup.png` shows. See `BuildTrait.hem`.
    const tunicHem = S.hemY;
    if (!bare) {
      p.add(shell(
        layer(
          [collar, ramp, S.shoulderY + 0.01, S.chestY, S.waistY, S.hipY, tunicHem + 0.06, tunicHem],
          0.021,
          [-0.003, 0, 0, 0, 0.003, 0.01, 0.03, 0.045],
        ),
        seg, { power: 2.3, wall: 0.014 },
      ), robed ? cloakMat : wool);
    } else {
      // A sleeveless hide jerkin, open at the chest, cut off at the hip — the
      // berserker's hem is the highest on the roster and the reason he reads as
      // all limb.
      p.add(shell(
        layer([S.shoulderY + 0.02, S.chestY - 0.02, S.waistY, tunicHem], 0.024, [0, 0, 0.002, 0.008]),
        seg, { power: 2.3, wall: 0.016 },
      ), buff);
      p.add(box(0.14, 0.34, 0.02), buff, xf(0, S.chestY - 0.02, S.chestHD + 0.02, 0.1, 0, 0));
    }

    // The metal layer. Mail hangs and flares; lamellar is rigid and banded, and
    // the difference has to be visible from behind.
    if (lamellar) {
      // Rigid plate laced in courses. Each row overhangs the one below, so the
      // torso reads as banded from any angle — nothing like the way mail hangs.
      const rows = lod.trim ? 6 : 4;
      const top = S.shoulderY - 0.005;
      const bottom = S.hipY + 0.02;
      for (let i = 0; i < rows; i++) {
        const y0 = mix(top, bottom, i / rows);
        const y1 = mix(top, bottom, (i + 1) / rows);
        p.add(shell([at(y0, 0.03), at(y1 + 0.005, 0.038)], seg, { power: 2.3, wall: 0.012 }), mail);
      }
      p.add(shell(layer([S.shoulderY + 0.03, S.shoulderY - 0.012], 0.03, [0, 0.012]), seg, { power: 2.3, wall: 0.012 }), steel);
      // Laced standing collar. Without it the warden's topmost metal stopped at
      // 1.552 and the only thing between there and the neckline was 60 mm of thin
      // wool — a funnel with a pale post rising out of it, which is why his neck
      // read as the longest of the four. Mail, not plate: this is the coif's skirt
      // laced into the cuirass, and it wants to look soft where the courses do not.
      p.add(shell(
        layer([collar - 0.012, ramp, S.shoulderY + 0.028], 0.03, [-0.004, 0, 0.008]),
        seg, { power: 2.3, wall: 0.013 },
      ), mail);
    } else if (!bare) {
      // The huscarl's hauberk hangs 30 mm below his tunic — a mail hem is the
      // outermost line on him and it wants to be the one you see. Everyone else
      // wears a shirt of mail that stops well short of the garment under it, so
      // both edges read as edges.
      const mailHem = heavy ? tunicHem - 0.03 : tunicHem + 0.26;
      p.add(shell(
        layer(
          [collar - 0.012, ramp, S.shoulderY + 0.02, S.chestY, S.waistY, S.hipY, mailHem + 0.05, mailHem],
          0.036,
          [-0.004, 0, 0, 0, 0.004, 0.012, 0.036, 0.052],
        ),
        seg, { power: 2.3, wall: 0.016 },
      ), robed ? buff : mail);
      if (heavy) {
        // Bishop's mantle: a second cape of mail over the shoulders. This is the
        // huscarl's silhouette — heavy, round-shouldered, immovable.
        p.add(shell(
          layer([collar, ramp, S.shoulderY + 0.015, S.chestY + 0.005], 0.05, [-0.008, 0, 0, 0.018]),
          seg, { power: 2.2, wall: 0.014 },
        ), mail);
      }
    }

    // Belt, buckle, strap-end. Everything below the waist hangs off this.
    const beltR = (bare ? 0.03 : 0.05);
    p.add(shell([at(S.beltY + 0.028, beltR), at(S.beltY - 0.028, beltR + 0.004)], seg, { power: 2.3, wall: 0.014 }), hide);
    // The buckle, and this is the yellow square dead centre on the huscarl and the
    // warden in `art/shots/v4/lineup.png`. It was one 72 × 60 mm brass slab: a flat
    // rectangle with no interior shape, in a material polished enough to blow out,
    // which is exactly what a placeholder marker looks like. A buckle is a *frame
    // with a hole in it* — two uprights, two bars, a tongue across the middle — and
    // the strap it closes on shows through the gap. Five boxes, one material, same
    // merge, and 44 × 50 mm rather than 72 × 60.
    const bkX = 0.022;
    const bkY = 0.019;
    const bkZ = S.waistHD + beltR + 0.008;
    for (const s of [-1, 1]) {
      p.add(box(0.006, bkY * 2 + 0.011, 0.010), brass, xf(s * bkX, S.beltY, bkZ));
    }
    for (const s of [-1, 1]) {
      p.add(box(bkX * 2 + 0.006, 0.0055, 0.010), brass, xf(0, S.beltY + s * bkY, bkZ));
    }
    p.add(box(0.005, bkY * 1.7, 0.007), brass, xf(0, S.beltY, bkZ + 0.004));
    p.add(box(0.026, 0.11, 0.01), hide, xf(0.055, S.beltY - 0.05, S.waistHD + beltR + 0.008, 0.1, 0, -0.12));
    if (lod.trim) {
      for (let i = 0; i < 6; i++) {
        const a = -0.8 + i * 0.32;
        p.add(box(0.016, 0.022, 0.008), brass, xf(Math.sin(a) * (S.waistHW + beltR + 0.01), S.beltY, Math.cos(a) * (S.waistHD + beltR + 0.01), 0, a, 0));
      }
    }

    // Baldric across the chest, and a scabbard hung off it on the left.
    //
    // It was one 620 mm box laid on a chord through a barrel, pinned 45 mm off the
    // chest and tipped 0.16 rad *forward* as it rose — so its top corner ended up at
    // (0.235, 1.672, 0.215): above the collar line, 85 mm clear of the ribcage, out
    // in the air beside the throat. That is the broad diagonal plank across the
    // warden's chest in `art/shots/v3/lineup.png`, and it was one of the things
    // cluttering the read right where the neck needed to be legible. Short segments
    // set on the surface at their own height follow the body instead of cutting
    // through it, and they cost nothing: same material, same merge.
    if (!robed) {
      const runs = lod.trim ? 5 : 3;
      const yTop = S.shoulderY + 0.035;
      const yBot = S.beltY + 0.01;
      const pad = bare ? 0.032 : 0.052;
      for (let i = 0; i < runs; i++) {
        const t = (i + 0.5) / runs;
        const y = mix(yTop, yBot, t);
        const st = at(y, pad);
        // From over the left shoulder down to the right hip, and the segment sits on
        // the ellipse rather than on a plane in front of it.
        const x = mix(-0.62, 0.34, t) * st.hw;
        const lean = Math.sqrt(Math.max(0.08, 1 - (x / st.hw) ** 2));
        for (const face of [1, -1]) {
          const z = st.hd * lean * face;
          // 1.75 of the step, not 1.1: consecutive segments are yawed to their own
          // bit of the barrel, so anything under about 1.5 leaves the corners
          // showing and the strap reads as a chain of blocks.
          p.add(box(0.046, ((yTop - yBot) / runs) * 1.75, 0.013), buff,
            xf(x, y, z, 0, Math.atan2(x, z), 0.4));
        }
      }
      // The boss where the baldric crosses. Down 65 mm and in from 52 mm across to
      // 34: at the old size and height it sat 55 mm from the cloak brooch, and the
      // two of them merged into one cluster of gold spheres on the shoulder — the
      // same "bright placeholder blob" read the belt plate had. A strap fitting
      // belongs on the strap, not up beside the collar.
      p.add(ball(0.017, 8), brass, xf(-0.125, S.chestY + 0.050, S.chestHD + 0.046, 0, 0, 0, 1, 1, 0.55));
    }
    if (cls === "huscarl" || cls === "warden") {
      p.add(shell([
        { y: 0.0, hw: 0.028, hd: 0.014 },
        { y: -0.46, hw: 0.022, hd: 0.011 },
        { y: -0.5, hw: 0.008, hd: 0.005 },
      ], 8, { power: 2.2, capTop: true, capBottom: true }), buff, xf(-S.hipHW - 0.06, S.beltY - 0.02, -0.03, 0.32, 0, 0.34));
    }

    // Class ornament that hangs on the body rather than on a limb.
    if (bare) {
      // Fur ruff and pelt down the back. Shaggy shoulders and bare arms are the
      // berserker read at any distance.
      // Power 2.0, not 2.1. A superellipse fuller than an ellipse holds its sides
      // flat and turns the corner in a shorter arc, so the ruff had four visible
      // corners on the shoulder line — logged in `docs/OPEN-DEFECTS.md` as a slab
      // with pointed corners. A pelt lying over a shoulder has no corners at all,
      // and the locks below carry the ragged read instead.
      p.add(shell(
        layer([collar - 0.006, ramp, S.shoulderY + 0.03, S.chestY + 0.02], 0.055, [-0.03, -0.012, 0.025, 0]),
        seg, { power: 2.0, wall: 0.02 },
      ), fur);
      if (lod.trim) {
        // Locks hanging off the ruff, not boulders sitting on it. Each points
        // down and outward from the shoulder line, which is what makes fur read
        // as fur rather than as a shelf of eggs.
        for (let i = 0; i < 11; i++) {
          const a = 0.55 + (i / 10) * (Math.PI * 1.85);
          const rx = S.chestHW + 0.062;
          const rz = S.chestHD + 0.062;
          const len = 0.09 + Math.sin(i * 2.7) * 0.028;
          p.add(rod(0.024, 0.005, len, 5), furLock, xf(
            Math.sin(a) * rx, S.shoulderY - 0.01 - len * 0.4, Math.cos(a) * rz,
            0.55 * Math.cos(a), 0, -0.55 * Math.sin(a),
          ));
        }
      }
      p.add(box(0.3, 0.6, 0.03), furPelt, xf(0, S.chestY - 0.12, -S.chestHD - 0.075, -0.12, 0, 0));
      for (let i = 0; i < 4; i++) {
        p.add(rod(0.008, 0.003, 0.06, 5), M.tinted("bone", 0xd8cfb4, { repeat: 1 }), xf(-0.06 + i * 0.04, S.chestY + 0.06, S.chestHD + 0.05, 2.6, 0, 0.2 - i * 0.13));
      }
    }
    if (robed) {
      // Rune-carver's belt: pouches, a slate tablet and a lit amulet.
      p.add(box(0.1, 0.13, 0.06), buff, xf(0.13, S.beltY - 0.09, S.waistHD + 0.03, 0.1, -0.3, 0));
      p.add(box(0.08, 0.11, 0.05), buff, xf(-0.14, S.beltY - 0.08, S.waistHD + 0.02, 0.1, 0.3, 0));
      const slate = xf(0.02, S.beltY - 0.12, -S.waistHD - 0.05, 0, 0, 0.2);
      p.add(box(0.07, 0.12, 0.014), M.timber(0x4a3a2a), slate.clone());
      p.add(rod(0.0035, 0.0035, 0.2, 4), hide, xf(0, S.chestY + 0.09, S.chestHD + 0.02, 0.4, 0, 0));
      // Amulet. Third pass on this object and the first one that names the fault
      // correctly: it was never how bright the stone is, it was that the stone had
      // no rim. `art/shots/v3/lineup.png` had it as a 46 mm ball with no shape;
      // shrinking it and putting a bezel behind it left a 30 mm ball with no
      // shape, which `art/shots/v7/lineup.png` renders as a hard white square four
      // pixels across — the bar's untextured square, in blue, on the one warrior
      // whose whole silhouette is meant to be quiet.
      //
      // Two things change. The substance is now carved rather than uniform (see
      // `shapedGlow`), so the stone's own edge falls to a dark matrix. And the
      // stone is *set* — sunk until the brass claws over its rim, so the outline
      // the eye traces belongs to the bezel, which is a lit dielectric with a
      // highlight and a shadow side, and not to the emissive at all. A bezel is
      // also simply how a stone is held; the old pairing had a ball floating
      // 6.5 mm proud of a ring that was not touching it.
      p.add(ring(0.0202, 0.0062, 6, 16), brass, xf(0, S.chestY - 0.01, S.chestHD + 0.046, 0.15, 0, 0));
      p.add(ball(0.0146, 14), rune, xf(0, S.chestY - 0.01, S.chestHD + 0.0435, 0, 0, 0, 1, 1, 0.55));
      // The rune row was the amulet's fault at a smaller size and with a second
      // error under it. Five bare emissive bars are five white ticks in
      // `art/shots/v7/lineup.png` — but they were also placed on a flat z across a
      // belt that is an ellipse, so the outermost pair stood 41 mm clear of the
      // leather, in front of the hip, attached to nothing. Two of them straddled
      // the buckle.
      //
      // They belong on the slate. A rune-carver's tablet is a real object with its
      // own dark silhouette, the strokes are cut into it rather than hovering over
      // it, and moving them there leaves the amulet as the only lit thing on the
      // warrior's front — which is the composition that object was built for.
      for (let i = 0; i < 3; i++) {
        p.add(box(0.006, 0.062, 0.005), rune,
          slate.clone().multiply(xf(-0.019 + i * 0.019, 0.012, -0.0055, 0, 0, 0.08 - i * 0.08)));
      }
    }
    if (heavy && lod.trim) {
      for (let i = 0; i < 5; i++) {
        const a = -0.7 + i * 0.35;
        p.add(ball(0.014, 6), brass, xf(Math.sin(a) * (S.chestHW + 0.1), S.chestY + 0.012, Math.cos(a) * (S.chestHD + 0.092)));
      }
    }
    if (lamellar) {
      // The lace that closes the cuirass. What was here was a 55 mm brass box
      // turned 45° — a flat yellow diamond dead centre on the warden's chest, the
      // one thing in `art/shots/v4/lineup.png` that reads as a debug marker rather
      // than as kit, and the reason is that a diamond is not a shape anything on a
      // suit of armour has. A lamellar cuirass laces: two iron loops with a leather
      // thong crossed through them, which is smaller, darker, and actually explains
      // how the front of the plate stays shut.
      const lz = S.chestHD + 0.046;
      for (const s of [-1, 1]) {
        p.add(ring(0.013, 0.0035, 4, 10), iron, xf(s * 0.03, S.chestY + 0.055, lz, 0.2, 0, 0));
      }
      for (const s of [-1, 1]) {
        p.add(box(0.062, 0.007, 0.005), buff, xf(0, S.chestY + 0.055, lz + 0.004, 0, 0, s * 0.42));
      }
      p.add(ball(0.008, 6), brass, xf(0, S.chestY + 0.055, lz + 0.008, 0, 0, 0, 1, 1, 0.6));
    }

    // Cloak clasp. Built here rather than on the cloak pivot because a brooch is
    // pinned to the shoulder and does not swing with the hem — and because a
    // mesh of its own would be a whole draw call for a few shapes.
    //
    // HOW IT IS PINNED IS PART OF WHAT IS BEING SOLD. The audit's instruction for
    // this slot names the pinning alongside the length, the hem and the drape,
    // and the clasp is the one piece of it that lands at portrait range where the
    // cloak is bought: the crown-to-sternum card does not contain a hem. So the
    // four cuts carry four fasteners — a bone pin, a disc brooch, an Irish-style
    // ring-and-pin, and a gilt disc with a boss — and the cut table names which.
    if (ap.cloak !== "none") {
      const cx = -S.shoulderX * 0.72;
      const cy = S.shoulderY + 0.03;
      const cz = S.chestHD + 0.058;
      const clasp = (CLOAK_CUTS[ap.cloak] ?? CLOAK_CUTS.brown).clasp;
      if (clasp === "pin") {
        // 30 gold fastens with what a traveller has: a turned bone pin through
        // two folds of wool, with the head standing proud and the shank raking
        // down across the shoulder.
        p.add(shell([
          { y: -0.030, hw: 0.0035, hd: 0.0035 },
          { y: 0.014, hw: 0.0055, hd: 0.0055 },
          { y: 0.024, hw: 0.0038, hd: 0.0038 },
        ], 7, { capTop: true, capBottom: true }), hide, xf(cx, cy, cz - 0.004, 0.45, 0, -0.5));
        p.add(ball(0.0085, 8), hide, xf(cx + 0.012, cy + 0.023, cz - 0.002, 0, 0, 0, 1, 1, 0.7));
      } else if (clasp === "disc") {
        p.add(ball(0.021, 10), brass, xf(cx, cy, cz, 0, 0, 0, 1, 1, 0.55));
        p.add(ring(0.026, 0.006, 5, 12), brass, xf(cx, cy, cz - 0.005, 0.35, 0, 0));
      } else if (clasp === "ringpin") {
        // A penannular: an open ring with a long pin laid across it, which is a
        // taller, thinner object than a disc and reads as a different fastening
        // rather than as the same brooch in another metal.
        p.add(ring(0.030, 0.0055, 5, 14), brass, xf(cx, cy + 0.004, cz - 0.004, 0.35, 0, 0, 1, 1, 1));
        p.add(shell([
          { y: -0.046, hw: 0.0028, hd: 0.0028 },
          { y: 0.030, hw: 0.0052, hd: 0.0052 },
        ], 6, { capTop: true, capBottom: true }), brass, xf(cx, cy + 0.004, cz + 0.003, 0.3, 0, -0.62));
      } else {
        // 400 gold: a gilt disc, bossed, on a raised collet. The largest fitting
        // on the man's chest and the only one with a shadow under its rim.
        p.add(ring(0.036, 0.0075, 5, 16), gilt, xf(cx, cy, cz - 0.006, 0.35, 0, 0));
        p.add(ball(0.030, 12), gilt, xf(cx, cy, cz - 0.004, 0, 0, 0, 1, 1, 0.40));
        p.add(ball(0.011, 8), gilt, xf(cx, cy, cz + 0.008, 0, 0, 0, 1, 1, 0.8));
      }
    }

    // ---- the neck ----
    //
    // What was here was a 126 mm circle swept dead straight from 1.71 down to
    // 1.43, capped at the top, and it is the thing the owner was looking at when
    // he said the heads float. Three separate faults, all of them visible in
    // `art/shots/v3/lineup.png`:
    //
    //   * Its top ring sat 3 mm *below* the chin, where the head's own surface has
    //     converged to a 25 mm nub — so the cap was a lit horizontal plate 126 mm
    //     across standing out past the jaw on every side. You can see the disc's
    //     rim under the huscarl's coif.
    //   * From 1.71 to 1.60 it changed radius by 4 mm. A column, not a neck.
    //   * It was centred on the head's own axis, so the throat stood as far
    //     forward as the chin and the mandible overhung nothing. No undercut, no
    //     occlusion, no shadow — and that shadow is the only cue the eye uses to
    //     decide a head is attached rather than balanced.
    //
    // So: elliptical rather than round, tapered rather than extruded, set back in
    // z so the jaw hangs over it, and flared hard at the base into the trapezius.
    // The top three stations climb *into* the mandible and are covered there by
    // the head's own throat mass (see `headPivot` below); the two surfaces share
    // `skinDark`, so wherever a nod slides one through the other the seam does not
    // exist to be seen.
    const nHW = S.neckHW;
    const nHD = S.neckHD;
    // The taper at the top, shared with the strap sampler below so the muscles are
    // laid on the section they belong to and not on an average of it.
    //
    // 0.78 was too much of one. The bare throat a viewer actually sees is the band
    // between the mandible's lower border and the collar, which is the *top* of
    // this sweep — so 0.78 of an already-thin section was rendering 100 mm of neck
    // under a 178 mm jaw, and that 0.56 ratio is what note 4 is looking at. On a
    // man the taper from the base to the thyroid is about 0.88; the dramatic
    // narrowing is the trapezius flare below, which the lower stations already do.
    // And the top of the sweep is the band a viewer sees, so it is the band the
    // ratio has to hold at. 0.88 of an already-thin section put the *visible*
    // throat at 0.79 of the jaw however healthy the section's own number was.
    const TOP_W = 0.95;
    const TOP_D = 0.94;
    p.add(shell([
      { y: S.neckTop + 0.095, hw: nHW * TOP_W, hd: nHD * TOP_D, z: -0.024 },
      { y: S.neckTop + 0.020, hw: nHW * 0.88, hd: nHD * 0.91, z: -0.017 },
      { y: S.neckRoot - 0.048, hw: nHW, hd: nHD, z: -0.007 },
      { y: S.neckBase + 0.070, hw: nHW * 1.13, hd: nHD * 1.04, z: 0 },
      { y: S.neckBase + 0.010, hw: nHW * 1.50, hd: nHD * 1.16, z: 0 },
      { y: S.neckBase - 0.055, hw: nHW * 1.93, hd: nHD * 1.23, z: 0 },
    ], lod.limb, { capTop: true }), skinDark);

    // Sternocleidomastoid. Two straps from the mastoid to the sternal notch, and
    // the cheapest 300 triangles in the file: they are what stops the throat being
    // a smooth tube, they catch the key along their outer edge, and the hollow they
    // leave between them is where the collar's shadow lands.
    //
    // Sited *on* the section rather than at a fraction of its half-width, because
    // the first attempt did the latter and vanished: a tube at 0.66 of `nHW` on an
    // ellipse 62 × 68 mm sits 12 mm inside the skin and renders nothing at all.
    // `θ` is the azimuth off dead ahead, converging toward the notch as it descends,
    // and half the tube stands proud of the surface it is laid on.
    const strap = (y: number, th: number, r: number): Knuckle => {
      const t = clamp01((S.neckTop + 0.095 - y) / 0.155);
      const hw = mix(nHW * TOP_W, nHW, t);
      const hd = mix(nHD * TOP_D, nHD, t);
      const zc = mix(-0.024, -0.007, t);
      return { x: hw * Math.sin(th), y, z: zc + hd * Math.cos(th), a: r, b: r };
    };
    for (const s of [-1, 1]) {
      const at3 = (y: number, th: number, r: number) => {
        const k = strap(y, th, r);
        k.x *= s;
        return k;
      };
      p.add(digit([
        at3(S.neckTop + 0.088, 1.25, 0.010),
        at3(S.neckTop + 0.012, 0.95, 0.011),
        at3(S.neckRoot - 0.042, 0.42, 0.009),
      ], lod.trim ? 6 : 4), skinDark);
    }
    // Laryngeal prominence. One flattened ball, and the single most recognisable
    // landmark on a man's throat — without it the front of the neck has no feature
    // between the jaw and the collar for the eye to measure the length against,
    // which is most of why 91 mm of throat was reading as a fence post.
    if (lod.trim) {
      const ly = S.neckTop + 0.040;
      const k = strap(ly, 0, 0);
      p.add(ball(0.011, 8), skinDark, xf(0, ly, k.z - 0.003, 0, 0, 0, 1.35, 1.15, 0.62));
    }
    return p;
  });

  // ==========================================================
  // ARMS — pivot at the shoulder joint
  // ==========================================================
  const grips = HAND_GRIP[cls] ?? HAND_GRIP.warden;
  const armPivots: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.name = `${RIG_TAG}arm${side}`;
    pivot.position.set(side * S.shoulderX, S.shoulderY, 0);
    root.add(pivot);
    armPivots.push(pivot);

    const elbow = -S.upperArm;
    const wrist = elbow - S.foreArm;
    const grip = wrist - S.gripDrop;
    const [rSh, rEl, rElB, rWr] = S.armR;

    emit(`arm${side}`, pivot, () => {
      const p = new Part();
      const sleeve = bare ? skin : wool;

      // Upper arm with a deltoid cap and a bicep belly; forearm with the flare
      // at the elbow and the narrow at the wrist. Real taper, both segments.
      // The three sleeve tops below all start under the shoulder cap's dome, and
      // they have to: the cap came down 23 mm this pass, and its top ring is only
      // 0.44 of its radius, so anything that used to tuck under the old crest now
      // stands out round it as a ring. The wool at y = 0.06 was doing exactly that —
      // a green hoop sitting on the pauldron.
      p.add(shell([
        { y: 0.026, hw: rSh * 1.06, hd: rSh * 1.06 },
        { y: -0.06, hw: rSh * 1.04, hd: rSh * 1.08 },
        { y: -0.19, hw: rSh * 0.9, hd: rSh * 0.94 },
        { y: elbow + 0.02, hw: rEl * 1.06, hd: rEl * 1.06 },
        { y: elbow - 0.01, hw: rEl, hd: rEl * 1.04 },
      ], lod.limb, { capTop: true }), skin);
      p.add(shell([
        { y: elbow + 0.005, hw: rElB * 1.04, hd: rElB * 1.06 },
        { y: elbow - 0.075, hw: rElB, hd: rElB * 1.02 },
        { y: wrist + 0.055, hw: rWr * 1.25, hd: rWr * 1.2 },
        { y: wrist, hw: rWr, hd: rWr * 1.1 },
      ], lod.limb, { capBottom: true }), skin);

      if (!bare) {
        // Linen shirt sleeve, then the wool over it, cuffed short so both edges
        // show. Layer thickness you can see is the point of the whole exercise.
        p.add(shell([
          { y: 0.012, hw: rSh * 1.12, hd: rSh * 1.12 },
          { y: elbow + 0.06, hw: rEl * 1.16, hd: rEl * 1.18 },
        ], lod.limb, { wall: 0.007 }), sleeveLinen);
        p.add(shell([
          { y: 0.004, hw: rSh * 1.22, hd: rSh * 1.22 },
          { y: -0.16, hw: rSh * 1.14, hd: rSh * 1.18 },
          { y: elbow + 0.11, hw: rEl * 1.24, hd: rEl * 1.26 },
        ], lod.limb, { wall: 0.011 }), sleeve);
      }

      // The metal on the shoulder, and mail down to the elbow where the class
      // wears it. Cap sits outboard of the torso so it reads as a separate
      // piece bearing on the shoulder rather than a bulge in the chest.
      if (!bare) {
        // Down 23 mm and in by 8%. The cap used to crest at 1.607 — above the
        // cervicale — so the shoulder line stood higher than the base of the neck
        // and the two of them left a notch on each side of the throat. It also put
        // 626 mm of shoulder on a 168 mm head, and mass that far out of scale is
        // the other half of "the heads seem a little small": nothing was wrong with
        // the head, it was being out-shouted.
        const capR = rSh * (heavy ? 1.50 : 1.36);
        // The pauldron, in courses rather than as one dome.
        //
        // A single swept cap is what makes the shoulder read as one dark blob in
        // `art/shots/v4/lineup.png`: it is a smooth convex surface with exactly one
        // highlight on it and no edges anywhere, so at any distance it is a lump.
        // Real shoulder defence is lames — overlapping plates, each with a rolled
        // lower edge, each catching the key at a slightly different angle. Three of
        // them give the shoulder three tonal steps and three visible rims, and they
        // alternate between two metals so there is a value break as well as an edge.
        // Cost: three shells instead of one, in materials already on this part, so
        // the merge is unchanged and it is still one draw call per substance.
        //
        // `capAt` is the same dome the four stations used to describe, sampled as a
        // function of the drop so a course can be cut anywhere along it.
        // Crest at +46 mm, which puts the top of the shoulder defence on the
        // acromion at 0.818 of stature now that the joint under it sits at 0.795.
        // It was +62 mm off a joint at 0.775 — 20 mm *below* the anatomical
        // acromion, so the cap was doing the work of a shoulder that was not
        // there and the trapezius had to fan up to meet it.
        const CAP: Array<[number, number]> = [
          [0.046, 0.44], [0.018, 0.86], [-0.026, 1.0], [-0.060, 0.96], [-0.092, 0.82],
        ];
        const capAt = (y: number): number => {
          let i = 0;
          while (i < CAP.length - 2 && y < CAP[i + 1][0]) i++;
          const t = clamp01((CAP[i][0] - y) / (CAP[i][0] - CAP[i + 1][0]));
          return capR * mix(CAP[i][1], CAP[i + 1][1], t);
        };
        const lames = lod.trim ? 3 : 2;
        for (let i = 0; i < lames; i++) {
          const yA = mix(0.046, -0.092, i / lames);
          // Each course runs a sixth of a lame past its own share, so it laps the one
          // below. That overlap is the edge you can see.
          const yB = mix(0.046, -0.092, (i + 1) / lames) - 0.138 / lames * 0.16;
          const mid = (yA + yB) * 0.5;
          p.add(shell([
            { y: yA, hw: capAt(yA), hd: capAt(yA) * 1.03 },
            { y: mid, hw: capAt(mid) * 1.015, hd: capAt(mid) * 1.045 },
            { y: yB, hw: capAt(yB) * 1.03, hd: capAt(yB) * 1.06 },
          ], lod.limb, { power: 2.2, wall: 0.010, capTop: i === 0 }),
            // The value break between courses only alternates where `iron` is
            // already on this part — the rims below put it there on high and
            // medium. On low there are no rims, so alternating would buy one extra
            // draw call per arm for a distinction two pixels wide on a phone; the
            // three courses still read, off their own overlap.
            lod.trim && i % 2 === 1 ? iron : (lamellar ? steel : mail));
          if (lod.trim) {
            // Rolled rim on each course's lower edge, which is what actually reads at
            // twenty metres — a rim is a specular line and a plate is not.
            p.add(ring(capAt(yB) * 1.02, 0.0062, 4, 12), lamellar ? steel : iron,
              xf(0, yB, 0, Math.PI / 2, 0, 0, 1, 1, 1.03));
          }
        }
        if (lod.trim) {
          for (let i = 0; i < 4; i++) {
            const a = -0.9 + i * 0.6;
            p.add(ball(0.008, 6), brass, xf(Math.sin(a) * capR * 0.86, 0.022, Math.cos(a) * capR * 0.9));
          }
        }
        if (heavy || lamellar) {
          p.add(shell([
            { y: -0.035, hw: rSh * 1.3, hd: rSh * 1.32 },
            { y: elbow + 0.09, hw: rEl * 1.36, hd: rEl * 1.38 },
            { y: elbow + 0.04, hw: rEl * 1.42, hd: rEl * 1.44 },
          ], lod.limb, { wall: 0.011 }), mail);
        }
      } else {
        // Bare arms: fur at the shoulder, iron rings on the biceps.
        p.add(shell([
          { y: 0.075, hw: rSh * 1.1, hd: rSh * 1.14 },
          { y: -0.02, hw: rSh * 1.5, hd: rSh * 1.55 },
          { y: -0.075, hw: rSh * 1.3, hd: rSh * 1.34 },
        ], lod.limb, { power: 2.0, wall: 0.016, capTop: true }), pelt(2 * Math.PI * rSh * 1.45));
        p.add(ring(rSh * 1.02, 0.011, 5, 12), brass, xf(0, -0.14, 0, Math.PI / 2, 0, 0));
        if (lod.trim) p.add(ring(rSh * 0.96, 0.009, 5, 12), brass, xf(0, -0.2, 0, Math.PI / 2, 0, 0));
      }

      // Bracer over the forearm, buckled. It stops at the wrist, not 28 mm short of
      // it: that gap was 28 mm of bare skin between the leather and the back of the
      // hand, and because the hand is the other side of it, it read as a break in
      // the arm rather than as an exposed wrist. A bracer laced onto a forearm ends
      // at the carpus, which is where the hand starts. The band of bare forearm the
      // kit deliberately shows is still there — it is above the bracer, between the
      // linen cuff and the leather, where a pushed-up sleeve leaves it.
      p.add(shell([
        { y: elbow - 0.07, hw: rElB * 1.16, hd: rElB * 1.2 },
        { y: wrist + 0.075, hw: rWr * 1.36, hd: rWr * 1.34 },
        { y: wrist + 0.002, hw: rWr * 1.24, hd: rWr * 1.22 },
      ], lod.limb, { wall: 0.01 }), robed ? buff : hide);
      if (lod.trim) {
        for (let i = 0; i < 3; i++) {
          const y = mix(elbow - 0.07, wrist + 0.01, (i + 0.5) / 3);
          p.add(box(0.014, 0.018, 0.008), brass, xf(side * rWr * 1.36, y, 0.006, 0, side * 1.4, 0));
        }
        // Wrist ring on the bracer's lower rim. A hem you can see is what stops
        // leather-onto-skin reading as a paint boundary. In brass rather than buff
        // because brass is already on this part and buff is not — one extra
        // substance on a limb is one extra draw call per arm per warrior, and a
        // fitting is worth having, a sixteenth of a millisecond is not.
        p.add(ring(rWr * 1.26, 0.005, 4, 10), brass, xf(0, wrist + 0.008, 0, Math.PI / 2, 0, 0, 1, 1, 0.98));
      }
      if (robed) {
        p.add(box(0.006, 0.05, 0.008), rune, xf(side * rWr * 1.3, wrist + 0.07, 0.004, 0, side * 1.5, 0));
      }

      // The fist, rotated onto the axis the weapon will run along. `reach` and
      // `lead` are where the wrist is in the fist's own frame — resolved here
      // rather than guessed in the builder, because the hand mount's 28 mm forward
      // offset and the grip pitch both feed it. Without them the palm stopped
      // 33 mm short of the forearm and the hand read as detached, which is half
      // of why it read as a mitten.
      const cp = Math.cos(GRIP_PITCH);
      const sp = Math.sin(GRIP_PITCH);
      const fist = fistGeometry(lod, B.limb, {
        // Distance up the fist's own +Y to the forearm's cap. The remaining 5 mm
        // of along-the-shaft offset is dropped: it is a third of a knuckle and the
        // wrist station is a cone, not a joint.
        reach: sp * S.gripDrop + cp * 0.028,
        lead: 0.006,
        mirror: side < 0,
        // `armPivots[0]` is the weapon arm; the off hand gets whatever that class
        // carries there, or an open hand when it carries nothing. A hand with
        // nothing in it clenched on the same imaginary shaft as the weapon hand
        // was a fist gripping air, which reads as a cramp rather than as a guard.
        grip: side > 0 ? grips.main : grips.off,
      });
      const hand = fistPlacement(GRIP_PITCH, side * 0.006, grip, 0.028);
      p.add(fist.skin, skin, hand.clone());
      if (fist.warm) p.add(fist.warm, skinWarm, hand.clone());
      return p;
    });

    // The weapon mount is added LAST on purpose: anim.ts and the armoury preview
    // both find it as the arm's final child. Do not add anything after it.
    const mount = new THREE.Group();
    mount.position.set(side * 0.006, grip, 0.028);
    mount.rotation.set(GRIP_PITCH, 0, 0);
    mount.name = "handMount";
    pivot.add(mount);
  }
  const [rightArm, leftArm] = armPivots;

  // ==========================================================
  // HEAD — pivot at the atlas, everything measured off the skull
  // ==========================================================
  const headPivot = new THREE.Group();
  headPivot.name = `${RIG_TAG}headPivot`;
  headPivot.position.set(0, S.neckTop, 0);
  root.add(headPivot);

  const R = S.headR;
  // The skull and the man wearing it, in one handle. Everything on the head is
  // sampled through it, which is what keeps a helm cut for a heavy brow actually
  // sitting on that brow rather than on the average of all four classes.
  const K: Skull = { R, F: face };
  const faceMats: FaceMaterials = {
    skin: headSkin, shade: headShade, warm: headWarm, sclera, iris, dark, lash: hair,
  };
  const skullY = S.headY - S.neckTop;
  const style = helmStyle(ap.helm);
  const helmed = style.cap;

  emit("head", headPivot, () => {
    const p = new Part();
    const place = xf(0, skullY, 0);

    p.add(headGeometry(K, lod.headU, lod.headV), headSkin, place.clone());

    // ---- the jaw / throat transition ----
    //
    // The single most valuable shape on the whole warrior, and until this pass it
    // did not exist. The skull's displacement field tapers to a point at the chin,
    // and the neck was a separate cylinder starting below it — so head and body met
    // at a butt joint with a visible plate between them, and no part of the mandible
    // overhung anything.
    //
    // This is the submandibular mass: the soft floor that runs from behind the chin
    // back and down into the throat. Three properties earn their keep, in order:
    //
    //   1. It is *narrower than the jaw above it* (55 mm against 76 mm at 1.814) and
    //      *46 mm behind the chin's front*, so the mandible's lower border overhangs
    //      it all the way round. That overhang is the occlusion shadow, and the
    //      shadow is what the eye actually reads as "attached".
    //   2. It tucks in as it descends, so its upper band faces down rather than out
    //      and takes almost no key light even before AO gets to it.
    //   3. It lives on the head pivot, because a jaw belongs to a head. It crosses
    //      the torso's neck shell around 1.75 and the two share `skinDark`, so the
    //      intersection curve is a tonal break instead of a seam — and that curve
    //      rises from under the chin toward the ears, which is a jawline.
    // The 0.60 band is bounded above by a full beard: the beard patch's lower rim
    // lands at 50 mm off the midline and this must stay inside it, or the throat
    // surfaces through the whiskers in a thin sliver.
    // The lower two stations have come out with the neck section (see `neckHW`):
    // they used to finish at 59 mm half-width over a throat whose top ring is now
    // 62, which would have put a waist in the one place a warrior must not have
    // one. They stay well inside the jaw above — which is the property that earns
    // the overhang — and now hand off to the neck instead of pinching in front
    // of it.
    p.add(shell([
      { y: skullY - 0.048, hw: R.x * 0.68, hd: R.z * 0.64, z: -0.013 },
      { y: skullY - 0.105, hw: R.x * 0.63, hd: R.z * 0.59, z: -0.019 },
      { y: skullY - 0.160, hw: R.x * 0.65, hd: R.z * 0.61, z: -0.021 },
      { y: skullY - 0.230, hw: R.x * 0.69, hd: R.z * 0.64, z: -0.021 },
    ], lod.limb, { capTop: true, capBottom: true }), headShade);

    // ---- the ears ----
    //
    // ONE closed shell each, off `earPoint`, and the note above `EAR_OUTLINE`
    // says why the five primitives that were here had to go: a ring with a bead
    // behind it is not an ear from any bearing except the one it was checked at,
    // and its rim was seated on a plane while the skull it lands on tapers, which
    // is the daylight under the lobe in `headturn-profile_90_.png`.
    //
    // Set back where the jaw hinges rather than out on the cheek, and running
    // from the eye line to the base of the nose — which is the latitude `EAR_Y`
    // names and the one place a real ear is.
    const earY = skullY + EAR_Y * R.y - 0.004;
    // Off the SKIN, not off `R.x`. The nominal half-breadth is not where the
    // side of the head is once `F.wide`, the vault taper and the zygomatic have
    // had their say, and on a wide seed the difference buried the ear's root in
    // the skull it grows out of. Every vertex is then seated against the skin at
    // its OWN latitude and depth, so the rim follows the head rather than a plane
    // through one point of it.
    const earRootX = skullHalfWidth(K, EAR_Y) * EAR_ROOT;
    for (const s of [-1, 1]) {
      // The ear frame carries local z straight onto head x, which is what lets
      // `earPoint` author standoff in millimetres off the skin and have that mean
      // the same thing here. The rake is inside `earPoint` rather than on this
      // matrix, because each vertex has to know the latitude it ends up at in
      // order to be seated against it.
      const place3 = new THREE.Matrix4()
        .makeTranslation(s * earRootX, earY, -0.024)
        .multiply(new THREE.Matrix4().makeRotationY(s * Math.PI / 2));
      const A = auricle(K, earRootX, s);
      p.add(A.skin, headSkin, place3);
      // The bowl in the form-shadow tone and the lobe in the warm one: an ear lit
      // from behind is the reddest thing on a head and the thinnest flesh on it,
      // and the two bands share their vertices with the helix so neither is a
      // separate object with a rim of its own to catch the light.
      p.add(A.shade, headShade, place3);
      p.add(A.warm, headWarm, place3);
    }

    // Eyes and mouth. The tonal map used to be a third call here and is now a
    // field written onto every one of these vertices at the end of the build —
    // see `faceComplexion`, and the note there for why six patches could not do
    // the job however their boundaries were placed.
    addEyes(p, K, lod, place, faceMats);
    addMouth(p, K, lod, place, faceMats);

    // ---- the nostrils ----
    //
    // Explicit geometry, for the same reason the eyes and the mouth are: a
    // nostril is 8 mm across and the surface field is sampled on a 17 mm grid
    // even at the row count this head now carries, so written as a gaussian it
    // aliases to nothing at all. Two dark ellipsoids sunk into the underside of
    // the nose survive any sampling, and they are what tells the eye that the
    // mass above them is a nose and not a swelling — which is the difference
    // between the frame the panels scored and a face.
    //
    // Sited by probing the field rather than by a table: the base of the nose
    // moves with `F.nose`, `F.nostril` and `F.deep`, and a nostril that misses
    // its own nose by 4 mm is worse than none.
    if (lod.trim) {
      const sub = faceSurface(K, dirOf(0, lat(Y_NOSE - 0.020), _d), new THREE.Vector3());
      for (const s of [-1, 1]) {
        // Ten segments, not six: at six a scaled sphere this small is a faceted
        // lozenge and renders as a dark rectangle, which on the underside of a
        // nose reads as a slot cut in it. Sunk far enough back that only the
        // opening clears the alar wall.
        p.add(ball(0.0062, 10), dark, xf(
          s * 0.0094 + K.F.asym, skullY + sub.y + 0.0018, sub.z - 0.0090,
          0.52, s * 0.26, 0, 0.74, 0.42, 1.2,
        ));
      }
    }

    // Brows, conformed to the ridge and angled down toward the temple. Thin: at
    // 4 mm they were two black slabs, which is the one thing worse than none.
    // The inner end sits lower than the outer, which is what reads as a scowl
    // rather than as surprise — and a warrior should not look surprised.
    //
    // Sat between the brow ridge and the eye, which is where a brow goes and is
    // 30 mm below where these were: at v ≈ 0.15–0.215 they were on the *ridge*,
    // and with the ridge itself 34 mm above head centre the pair of them read as
    // one wide band across the middle of the forehead.
    for (const s of [-1, 1]) {
      const inner = lat(Y_EYE + 0.20);
      const outer = lat(Y_EYE + 0.135);
      // Thinned to nothing at the outer end as well as arched. A brow of constant
      // height is a bar; a brow that tapers off toward the temple is a brow, and it
      // is the taper rather than the arch that stops it reading as drawn on.
      const arc = (u: number) => mix(inner, outer, clamp01((Math.abs(u) - 0.10) / 0.52));
      // Tapered at *both* ends, not just the temple one. Held full height at the
      // inner end, a brow is a bar with a squared-off inboard corner sitting 4 mm
      // proud of the forehead — two dark slabs, which is what the render showed —
      // and squared-off dark corners on a face read as injury. It also stands much
      // closer to the skin now: brow hair lies on a ridge, it does not perch on
      // one, and at 3.8 mm of lift with a 2.2 mm rim the patch was drawing its own
      // bright outline (see `patch`).
      const half = (u: number) => {
        const t = clamp01((Math.abs(u) - 0.10) / 0.52);
        return 0.036 * (1 - 0.68 * Math.pow(t, 1.4)) * smooth(0, 0.16, t);
      };
      // Twelve columns and two rows, and the lift dies at all four boundaries.
      //
      // At seven columns and one row this was a *ribbon* — two lines of vertices
      // with a flat quad strip between them — so it could not follow the ridge it
      // is supposed to lie on, and `patch` closed it with a rim strip standing
      // 2.2 mm proud all the way round. What that draws is a flat slab with a
      // bright outline, and at one row a column that lands where `half` is
      // shrinking fastest inverts the quad: the notch out of the left brow in
      // `art/shots/wip/p3-*` is one flipped face. Taking the lift to nothing on
      // every boundary buries every rim strip in the skin, and what is left is
      // hair growing out of a ridge instead of a decal parked over one.
      p.add(headWear(K, {
        u0: s * 0.09, u1: s * 0.62,
        v0: (u) => arc(u) - half(u),
        v1: (u) => arc(u) + half(u),
        nu: 12, nv: 2,
        lift: (u, v) => 0.0004 + 0.0016
          * Math.sin(Math.PI * clamp01(v))
          * Math.sin(Math.PI * clamp01((Math.abs(u) - 0.09) / 0.53)),
        thick: 0.0007,
      }), hair, place.clone());
    }

    // ---- hair ----
    //
    // Three styles that a player can tell apart in the dark, which is what the
    // slot has never had. The audit's frame of the base dress is a smooth egg —
    // the crop was a 7 mm shell contributing nothing a shaved head does not —
    // and the two paid options above it added a curtain and a string of beads.
    //
    // What separates them now is the OUTLINE, in this order: the crop breaks the
    // skull's curve with fourteen locks and a ragged crown; the mane adds 150 mm
    // of falling mass with a part down the middle; the war-locks add two plaits
    // that hang clear of the head and swing wide of it. Each is a different
    // shape at 34 px, which is the test the audit says nothing in this shop
    // passes.
    if (ap.hairStyle !== "shaved") {
      const crop = ap.hairStyle === "short";
      /** Angular distance from dead ahead, folded into 0..PI. */
      const awayFromFace = (u: number) => {
        const a = ((u % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        return a > Math.PI ? Math.PI * 2 - a : a;
      };
      // The hairline. Three harmonics rather than two, and the third is above
      // Nyquist for `nu` on purpose: a hairline is where hair thins out, not
      // where it was cut, and a curve at one frequency is still a curve. The
      // cos(2u) term is the temple recession — it is what puts the two points
      // of an M over the brows.
      // The hairline. Four harmonics, and the top two are deliberately above
      // Nyquist for `nu`: a hairline is where hair thins out, not where it was
      // cut, and the only honest way to say that with a patch boundary is to
      // make the boundary disagree with itself. The cos(2u) term is the temple
      // recession — it is what puts the two points of an M over the brows — and
      // the amplitudes on the last two are 10 and 5 mm rather than 4 and 2,
      // because at 4 mm the line rendered as an arc and an arc across a forehead
      // is the brim of a cap.
      const line = (u: number) => (crop ? 0.30 : 0.21)
        + 0.235 * Math.cos(u) - 0.080 * Math.cos(u * 2)
        + 0.080 * Math.cos(u * 5 + 1.1) + 0.042 * Math.cos(u * 9 - 0.7)
        + 0.020 * Math.cos(u * 17 + 2.3)
        // Under a helm the hairline drops 0.12 rad at the sides and the nape —
        // about 16 mm — so hair emerges below the brow band's rim instead of the
        // iron meeting bare scalp all the way round. A helmet on a man who has
        // no hair anywhere it can be seen is a helmet on a mannequin, and it is
        // half of what "a helmet must look WORN" means. Nothing changes at the
        // front, where the band is meant to bear on the frontal bone.
        - (helmed ? 0.12 * smooth(0.55, 1.25, awayFromFace(u)) : 0);
      // The shell. Under a helm it flattens to a liner's thickness — a helm
      // flattens hair, and 24 mm of crown volume would push straight through a
      // bowl that now sits on the skull.
      // The shell's lift, held as a function because the locks ride on it. Thin
      // at the hairline and thick at the crown — `patch` closes the v0 boundary
      // with a rim strip whose height is the lift, so hair 8 mm proud where it
      // starts rules a hard band across the forehead — and wandering in u, which
      // is what breaks the outline. A shell whose lift depends only on v has a
      // silhouette that is exactly the skull's curve scaled up, and that is the
      // egg the audit photographed.
      const mane = (u: number, v: number) => (helmed
        ? 0.002 + 0.003 * clamp01(v / (Math.PI / 2))
        // Flattened over the last 0.3 rad. Held at full height to the pole, 21 mm
        // of hair on top of a skull that is already domed comes to a point, and
        // the crop rendered as an acorn cap.
        : 0.0028 + 0.017 * Math.pow(clamp01((v - line(u)) / (Math.PI / 2 - line(u))), 0.7)
          * (1 - 0.34 * clamp01((v - 1.24) / 0.33))
          * (1 + 0.20 * Math.cos(u * 7 + 0.4) + 0.14 * Math.cos(u * 13 - 1.2)
             + 0.10 * Math.cos(v * 9 + u * 3)));
      p.add(headWear(K, {
        u0: 0, u1: Math.PI * 2, wrapU: true,
        v0: line, v1: () => Math.PI / 2 - 0.02,
        nu: Math.max(16, lod.shellU + 6), nv: Math.max(5, lod.shellV),
        lift: (u, s) => mane(u, mix(line(u), Math.PI / 2 - 0.02, s)),
        thick: helmed ? 0.004 : 0.006,
      }), hair, place.clone());
      if (ap.hairStyle === "long") {
        // The fall. Parted down the middle rather than swept as one curtain —
        // the audit's reading of the hair-colour sheet is that the mane is "a
        // flat curtain with a hard edge and no volume", and a curtain is exactly
        // what one closed shell round the back of a head draws. Two masses with
        // a valley between them read as hair from every bearing, and the valley
        // is free: it is where the two shells stop.
        // THE MANE IS TWO DETACHED SLABS FROM BEHIND, and it is arithmetic
        // rather than a rendering fault. Each half was offset `R.x * 0.44` off
        // the midline with a half-width of `R.x * 0.40` at its lowest station,
        // so the two spans were [0.04, 0.84] and [-0.84, -0.04] of `R.x` — a
        // GAP of 0.08 R.x, about 8 mm of daylight down the middle of the back
        // of the head, widening as the hair falls. At the top station the
        // overlap was 11 mm, which is inside the wall thickness. The part was
        // meant to be a valley between two masses and was in fact a hole
        // between two curtains.
        //
        // The offset comes in to 0.30 and every station widens. The two halves
        // now overlap by 40 mm at the fall and 30 mm at the crown, so they are
        // one mass with a crease down it — which is what a centre part is — and
        // the valley survives because it is where the two crowns meet, not
        // where the geometry stops.
        for (const s of [-1, 1]) {
          p.add(shell([
            { y: skullY + 0.012, hw: R.x * 0.60, hd: R.z * 0.86, z: -0.040 },
            { y: skullY - 0.070, hw: R.x * 0.72, hd: R.z * 0.80, z: -0.056 },
            { y: skullY - 0.160, hw: R.x * 0.78, hd: R.z * 0.66, z: -0.062 },
            { y: skullY - 0.250, hw: R.x * 0.72, hd: R.z * 0.52, z: -0.058 },
            { y: skullY - 0.322, hw: R.x * 0.50, hd: R.z * 0.36, z: -0.048 },
          ], Math.max(9, lod.limb + 1), { power: 2.0, wall: 0.013 }), hair,
            xf(s * R.x * 0.30, 0, 0, 0, 0, -s * 0.05));
        }
        if (lod.trim) {
          // Six locks down the fall, three a side, so the mass has strands in it
          // and its own edge is broken where it crosses the shoulder.
          for (const s of [-1, 1]) {
            for (let i = 0; i < 3; i++) {
              const off = 0.30 + i * 0.34;
              p.add(braid((t, out) => out.set(
                s * (R.x * (0.60 + off * 0.55)) * (1 - 0.20 * t),
                skullY + 0.03 - 0.34 * t,
                -R.z * (0.55 + 0.25 * Math.sin(t * 2.1)) - 0.02 * t,
              ), { strands: 2, turns: 0.35, rows: 7, ring: 5, radius: (t) => 0.016 * (1 - 0.55 * t * t) }),
                hair);
            }
          }
        }
      }
      if (ap.hairStyle === "braids") {
        // BRAIDED WAR-LOCKS, 100 gold, and it was four spheres of falling radius
        // per side with a brass ring under them — a rosary, and the weakest thing
        // in the slot at the highest price in it. It is a real three-strand plait
        // now: 320 mm of it, sprung from above the ear, swinging out clear of the
        // jaw so it breaks the head's outline from in front as well as in
        // profile, and bound at the tip.
        for (const s of [-1, 1]) {
          p.add(braid((t, out) => {
            // Out and forward as it falls, so the plait hangs beside the jaw
            // rather than down the neck — that swing is the whole silhouette.
            const swing = Math.pow(t, 1.35);
            out.set(
              s * (R.x * 0.94 + 0.052 * swing),
              skullY + R.y * 0.30 - 0.335 * t,
              -R.z * 0.20 + 0.055 * swing,
            );
          }, { turns: 3.4, rows: Math.max(12, lod.limb * 2), ring: Math.max(5, lod.limb - 2),
               radius: (t) => 0.0165 * (1 - 0.45 * t * t) }), hair);
          p.add(ring(0.0105, 0.0034, 4, 9), brass,
            xf(s * (R.x * 0.94 + 0.048), skullY + R.y * 0.30 - 0.318, -R.z * 0.20 + 0.050,
              Math.PI / 2 - 0.28, 0, s * 0.16));
        }
      }
    }

    // ---- beard ----
    //
    // The stubble was the largest single cause of the flat face, and not because
    // of its colour. Its top edge ran at v = −0.44 at the midline — which, on the
    // old layout, was immediately under the *upper* lip — and it was a 4.5 mm
    // smooth shell over a 5×3 grid. So it buried the lower lip, the mentolabial
    // shelf, the chin, the nasolabial folds and both lower cheeks under one
    // untextured surface, in a brown whose value at this exposure is close to skin.
    // The whole lower two thirds of the face in `art/shots/v4/portrait.png` is that
    // patch, not skin, and nothing sculpted underneath it could possibly show.
    //
    // Stubble is now a *tone*, not a shell: 1.2 mm of lift on a grid fine enough to
    // follow the field, starting below the lower lip so the mouth stays skin, and
    // reaching the sideburn at the ear the way a jawline beard does. A full beard
    // keeps its volume — that is the point of a full beard — but its top edge has
    // come down to the lip line as well, so the nose, the philtrum and the fold
    // beside it stay visible.
    // A full face mask takes the cheeks, the lip and the philtrum, so the beard
    // that rides on them has nowhere to be: at 18 mm of lift the patch and its
    // moustache push straight through 22 mm of plate, and what would show is
    // whiskers growing out of the metal. What survives a mask is the *hang* —
    // beard coming out from under the chin below the mask's lower rim — which is
    // both the honest read and the one that costs nothing.
    //
    // STUBBLE WAS CLEAN SHAVEN. `npm run cosmetictest` put the two options
    // against each other with the material taken away and got **0.00% in
    // silhouette and 0.00% in form, from every lens and every bearing** — the
    // shop's two free beard rungs were one object with two names. The cause was
    // in the line below: the whole block was gated `!== "short"`, so the `full ?
    // ... : ...` branches written for stubble were dead code that had never been
    // reached. The tone in the complexion field is still there and still does the
    // work at portrait range; what was missing was any mass at all.
    //
    // It is now built, at 9 mm of lift against a full beard's 18 — a close-cropped
    // beard rather than a shadow, which is what a free rung above Clean Shaven has
    // to be to exist. The 4.5 mm shell the note above condemns failed because its
    // TOP EDGE buried the mouth, not because it had thickness; `cheek(u)` starts
    // below the lower lip now, so the philtrum, the lip and the nasolabial fold
    // are all still skin.
    if (ap.beardStyle !== "none") {
      const full = ap.beardStyle !== "short";
      // One patch, not two. The top edge climbs from the lip line at the midline
      // to the sideburn at the ear, which is where a beard's edge actually runs;
      // the separate moustache bar this replaces read as a strip of tape.
      // The rise is held back until the last third of the arc, and it stops below
      // the cheekbone rather than at the eye line. Ramped from 0.25 and topping out
      // at −0.03, the stubble climbed to the temple across almost the whole cheek
      // and rendered as a dark trapezoid over the side of the face.
      //
      // Two harmonics, and three times the amplitude on stubble. This boundary is
      // the "hard elliptical material seam ringing the jaw" the panel logged, and
      // it is a boundary between two *materials* — wool on skin — so nothing but
      // its own shape can break the tonal step at it. One cosine at one frequency
      // gives a scalloped ellipse, which at sixty pixels is still an ellipse. A
      // beard's edge is where hair thins out, not where it was cut, and the only
      // honest way to say that with a patch rim is to make the rim disagree with
      // itself. The second term stays above Nyquist at `nu` = 11.
      // The harmonics came DOWN and the column count went up, which is the
      // opposite of what the note above says and the frames say the note was
      // wrong. `nu` was 14 over 2.48 rad — a sample every 0.177 — and the second
      // term's period is 0.556, so it was being sampled three times a cycle:
      // below Nyquist, aliasing, and what it drew was not a ragged edge but four
      // large triangular notches bitten out of the jaw
      // (`art/shots/wip/b2-*_beard=beard_full_*`). A boundary can only disagree
      // with itself as finely as the mesh can carry, and the honest raggedness
      // at this scale is now in the complexion field's stubble, which has no
      // mesh at all and can therefore be as fine as it likes.
      const cheek = (u: number) => {
        const t = smooth(0.55, 1.20, Math.abs(u));
        const y = mix(Y_LIP + 0.045, -0.20, t);
        return lat(y) + 0.024 * Math.cos(u * 4.5) + 0.010 * Math.cos(u * 7.5 + 1.9);
      };
      // The lower silhouette, and this is what was reading as "a doormat strapped
      // to the jaw". It used to be the constant latitude −1.05 across the entire
      // width of the face: a horizontal circle round the jaw, drawn at 23 mm of
      // lift with a 10 mm rim strip on the end of it. So the beard finished in a
      // hard lit ledge running ear to ear — a rectangle with two rounded corners,
      // which is exactly what the panel described. A beard hangs longest under the
      // chin, swings up under the jaw toward the ear, and is *ragged*; the lobe
      // term below is worth more than the arc, because a smooth curve at this
      // scale still reads as something cut to a pattern.
      const hang = (u: number) => {
        const a = Math.abs(u);
        const arc = -1.27 + 0.52 * Math.pow(smooth(0.1, 1.24, a), 1.35);
        const rag = smooth(0.04, 0.5, a);
        return arc + 0.044 * Math.cos(u * 3.7 + 0.6) * rag + 0.016 * Math.cos(u * 6.9 - 0.8) * rag;
      };
      // The two pieces that ride on the face. Both are skipped under a mask —
      // see the note above the beard.
      if (!style.mask) {
        p.add(headWear(K, {
          // Round to the ear, so the patch's own u edge is behind the sideburn rather
          // than standing as a hard vertical line down the middle of the cheek — and
          // pinched shut there, because a patch that runs to its u limit at full
          // height ends in a vertical cut whatever the top edge does. Closing v0 onto
          // v1 turns the far end into a sideburn instead.
          u0: -1.24, u1: 1.24,
          v0: (u) => mix(hang(u), cheek(u) - 0.03, smooth(0.98, 1.24, Math.abs(u))),
          v1: cheek,
          nu: Math.max(20, lod.shellU + 10), nv: Math.max(5, lod.shellV + 1),
          // Thickness dies at *both* boundaries rather than being thickest at the
          // one that is in silhouette. `patch` closes every boundary with a rim
          // strip whose normal points along the surface, so a patch that ends at
          // full lift draws its own outline as a bright band — the same defect
          // `addFaceTones` records, except here the band was 10 mm and in the
          // silhouette. Peaked at a third of the way up, which is where the mass of
          // a beard actually is, and at 2 mm of lift on the boundary the rim strip
          // is inside the skin and cannot be seen at all.
          lift: (_u, s) => (full
            ? 0.002 + 0.016 * Math.pow(Math.sin(Math.PI * Math.pow(clamp01(s), 0.55)), 1.15)
            // A close crop: 9 mm at the jaw, dying to nothing at both boundaries
            // for the same reason the full beard's does — a rim strip at full lift
            // draws its own outline as a bright band. Half a full beard's mass and
            // no hang, which is the difference a player is looking at.
            : 0.0014 + 0.0096 * Math.pow(Math.sin(Math.PI * Math.pow(clamp01(s), 0.6)), 1.1)),
          thick: full ? 0.005 : 0.0032,
        }), beard, place.clone());
        // Philtrum gap: a real moustache parts under the nose. Two short patches
        // rather than one bar is what sells it. The close crop gets one too, at
        // 60% of the swell — a man who has stopped shaving has stopped shaving his
        // lip as well, and without it the crop read as a chinstrap.
        {
          const mo = full ? 1 : 0.6;
          // Each half is a hump, not a slab. As a rectangle in (u, v) at a flat
          // 8 mm of lift with a 6 mm rim, these rendered as two hard blocks floating
          // over the mouth with daylight round them — the same failure as the mouth
          // corners and for the same reason (see `patch`). Taking the lift to
          // nothing on all four boundaries buries every rim strip in the skin, and
          // what is left is a moustache that grows out of the lip and thins toward
          // the corner.
          const swell = (u: number, v: number) =>
            0.0010 + 0.0052 * mo * Math.sin(Math.PI * clamp01(v))
            * Math.sin(Math.PI * clamp01((Math.abs(u) - 0.035) / 0.345));
          // A leaf, not a rectangle. Both v bounds converge at both ends of u, so
          // the half pinches shut against the philtrum on one side and against the
          // mouth corner on the other — with parallel bounds it was a quadrilateral
          // with four visible corners sitting over the lip, which is a postage stamp
          // and not a moustache.
          const mTop = lat(Y_NOSE - 0.035);
          const mBot = lat(Y_LIP + 0.085);
          const mMid = (mTop + mBot) * 0.5;
          const mHalf = (mTop - mBot) * 0.5;
          const leaf = (u: number) =>
            mHalf * Math.pow(Math.sin(Math.PI * clamp01((Math.abs(u) - 0.025) / 0.365)), 0.5);
          const droop = (u: number) => mMid - 0.055 * smooth(0.06, 0.38, Math.abs(u));
          for (const s of [-1, 1]) {
            p.add(headWear(K, {
              u0: s * 0.025, u1: s * 0.39,
              v0: (u) => droop(u) - leaf(u),
              v1: (u) => droop(u) + leaf(u),
              nu: 6, nv: 2, lift: swell, thick: 0.004,
            }), beard, place.clone());
          }
        }
      }
      // The hanging mass, for the three styles that have one. Every station has
      // dropped 30 mm: the menton is at −145 mm and these used to start at −100,
      // i.e. inside the chin, so a "full" beard's hang emerged from the middle of
      // the jaw rather than from under it.
      //
      // THE THREE PAID BEARDS WERE ONE CRESCENT, AND THE MEASUREMENT SAYS SO.
      // `npm run cosmetictest` reads the ladder with the material off:
      // Full -> Forked scored **0.57%** of the subject at fight distance and
      // Forked -> Ringed Braid **0.87%**, both under the 1% a shape has to move
      // to be a shape a player can see in play. They were three variations on one
      // mass hung in the same place at the same length, and once colour is gone
      // that is one beard sold three times for 240 gold.
      //
      // The axis they now differ on is the one that survives 7.9 mm to a pixel:
      // MASS and LENGTH, in that order.
      //
      //   Full    broadest and shortest — 172 mm across, ending 150 mm below the
      //           chin. A bush.
      //   Forked  a narrower root and two tines that swing 0.46 rad apart and
      //           reach 230 mm below the chin, so the fork is open air from every
      //           bearing and the outline has a notch cut out of the bottom of it.
      //   Ringed  the narrowest and by far the longest — a single 50 mm rope
      //           reaching 295 mm below the chin with three bindings down it. In
      //           outline it is a line where Full is a wedge.
      //
      // A player who buys the next rung up gets a different silhouette, not a
      // different tint, and the price ladder now buys length as well as work.
      if (ap.beardStyle === "full") {
        // Three lobes, not one cone. One swept shell under a jaw is a single
        // smooth mass with a smooth outline, and at portrait range that is a
        // bib — `art/shots/wip/b3-*` is a brown block with a straight bottom
        // edge. A beard hangs in hanks: a long one at the chin and two shorter
        // ones either side of it, each with its own belly and its own tip, so
        // the mass has strands running down it and the outline is broken in
        // three places. Same triangle count as the five-station cone it
        // replaces, because each lobe is coarser.
        // One mass, and the three separate hanks that were tried here are why it
        // is written down. Split into a long lobe and two short ones, each shell
        // presented its own open top ring under the cheek patch and the beard
        // rendered as three cut tubes hanging off a jaw — a beard is one volume
        // that hair falls out of, and dividing the volume divides it visibly.
        // The strands belong on the surface, and that is what the second, offset
        // shell below is: the same mass again at 3 mm less radius and a slight
        // lean, so the two outlines disagree down the length of the beard and
        // the edge is broken without the mass being.
        // WIDE AND SHORT. The belly went from 68 mm of half-width to 86 and the
        // tip came up 20 mm, so the mass is a wedge that spreads past the jaw
        // rather than a cone that follows it down. That is what separates it from
        // the two beards above it in the ladder: they are both narrower than the
        // jaw and both longer.
        // EVERY STATION'S z CLIMBS. All three hanging masses used to fall straight
        // down at z = 0.024-0.040 in the head's frame while the torso's front
        // surface is at 0.104 and the mail over it further out, so the bottom
        // third of every paid beard in the shop was INSIDE the man and thrown away
        // by the depth buffer. That is most of why the three measured as one
        // crescent: what was being compared was the small part of each that
        // cleared the collarbone. A beard that reaches the chest rests ON it.
        const belly = (k: number, lean: number) => p.add(shell([
          { y: skullY - 0.122, hw: 0.070 * k, hd: 0.056 * k, z: 0.040 },
          { y: skullY - 0.176, hw: 0.093 * k, hd: 0.070 * k, z: 0.058 },
          { y: skullY - 0.226, hw: 0.084 * k, hd: 0.064 * k, z: 0.082 },
          { y: skullY - 0.268, hw: 0.050 * k, hd: 0.041 * k, z: 0.104 },
          { y: skullY - 0.294, hw: 0.017 * k, hd: 0.015 * k, z: 0.118 },
        ], Math.max(8, lod.limb), { power: 2.15, capTop: true, capBottom: true }), beard,
          xf(0, 0, 0, 0, 0, lean));
        belly(1, 0);
        if (lod.trim) belly(0.94, 0.075);
      } else if (ap.beardStyle === "forked") {
        // FORKED, 80 gold, and the audit's instruction was to check it against
        // the profile card: "a fork that does not separate in profile is a beard
        // with a notch." It did not. The two tines were 32 mm apart at the chin
        // and leaned 0.18 rad, so from any bearing but dead ahead they occluded
        // each other into one cone with a crease down it. They now spring from a
        // common mass under the chin, part and swing out and forward, so the gap
        // between them is open air from every bearing — which is the whole thing
        // a player is buying.
        // The root is now NARROWER than the Full Beard's belly rather than the
        // same shell, and it stops 30 mm higher, so the fork starts on the jaw
        // instead of below a bush. The tines are longer, thicker at the root and
        // swung 0.46 rad apart: at fight distance the gap between them is 40 mm,
        // which is five pixels of daylight bitten out of the bottom of the
        // outline, and a notch of five pixels is a shape. At 0.34 rad it was two.
        p.add(shell([
          { y: skullY - 0.126, hw: 0.058, hd: 0.049, z: 0.040 },
          { y: skullY - 0.160, hw: 0.060, hd: 0.050, z: 0.048 },
          { y: skullY - 0.186, hw: 0.050, hd: 0.042, z: 0.058 },
        ], lod.limb, { power: 2.15, capBottom: true }), beard);
        for (const s of [-1, 1]) {
          // The tines carry forward as well as apart — see the note on the Full
          // Beard's belly. Two tines buried in a chest are one notch nobody sees.
          p.add(shell([
            { y: skullY - 0.158, hw: 0.053, hd: 0.046, z: 0.052 },
            { y: skullY - 0.244, hw: 0.047, hd: 0.040, z: 0.090 },
            { y: skullY - 0.322, hw: 0.031, hd: 0.027, z: 0.126 },
            { y: skullY - 0.376, hw: 0.012, hd: 0.011, z: 0.146 },
          ], Math.max(8, lod.limb), { power: 2.1, capBottom: true }), beard,
            xf(s * 0.028, 0, 0.004, 0.10, 0, -s * 0.56));
        }
      } else if (ap.beardStyle === "braided") {
        // RINGED BRAID, 120 gold — the most expensive beard in the shop, and it
        // was four stacked spheres of falling radius with a brass ring under
        // them. The audit calls it a rosary and it is right. It is a real
        // three-strand plait now, sprung out of a mass under the chin so the
        // hair has somewhere to come from, bound down its length.
        //
        // THE PLAIT IS NOW THE LONGEST AND NARROWEST BEARD IN THE SHOP, and that
        // is what the top rung buys. It falls 295 mm below the chin against the
        // Full Beard's 150, and the root that feeds it is gathered to 34 mm — so
        // the outline is a rope where Full is a wedge and Forked is a wedge with a
        // notch. Two turns fewer over half again the length is a coarser plait,
        // which is the only way three strands read as three strands at 7.9 mm to a
        // pixel; a tight plait is a cylinder at any distance a match is fought at.
        //
        // THREE RINGS, NOT TWO, AND THEY STAND PROUD. The audit's complaint was
        // that the old rings read "as a string of spheres". A ring reads as a ring
        // when it is WIDER THAN THE ROPE IT BINDS and casts a step in the outline:
        // each is 4-5 mm outside the plait's own half-width at the station it sits
        // on, so the silhouette pinches at the binding and swells between them.
        // Inside the rope they were invisible and the plait was a cone.
        // IT HAS TO LIE ON THE CHEST, NOT INSIDE IT. Lengthening this plait bought
        // nothing at all the first time it was tried — the measurement did not move
        // by a hundredth of a per cent — and the reason is worth writing down,
        // because it applies to any long beard anybody adds after this. The path
        // hung STRAIGHT DOWN at z = 0.036 in the head's frame, while the torso's
        // front surface is at z = 0.104 and the mail over it is further out again.
        // So everything below the collarbone was inside the man: drawn, and then
        // thrown away by the depth buffer. A beard that reaches the chest rests ON
        // the chest, so the path swings forward as it falls and finishes 136 mm
        // proud of the head's centre, which clears the mail with the plait's own
        // radius to spare.
        const bPath = (t: number, out: THREE.Vector3) => out.set(
          0, skullY - 0.186 - 0.272 * t, 0.036 + 0.100 * Math.pow(t, 1.15),
        );
        const bRad = (t: number) => 0.0212 * (1 - 0.38 * t * t);
        p.add(shell([
          { y: skullY - 0.126, hw: 0.056, hd: 0.048, z: 0.040 },
          { y: skullY - 0.160, hw: 0.048, hd: 0.042, z: 0.048 },
          { y: skullY - 0.190, hw: 0.034, hd: 0.031, z: 0.058 },
        ], lod.limb, { power: 2.15, capBottom: true }), beard);
        p.add(braid(bPath, {
          turns: 3.4, rows: Math.max(14, lod.limb * 3), ring: Math.max(5, lod.limb - 2),
          radius: bRad,
        }), beard);
        {
          const at = new THREE.Vector3();
          for (const t of [0.05, 0.37, 0.69, 0.97]) {
            bPath(t, at);
            p.add(ring(bRad(t) + 0.0048, 0.0050, 4, 12), brass,
              xf(at.x, at.y, at.z, Math.PI / 2, 0, 0));
          }
        }
      }
    }

    // The war paint used to be here, as three shapes in `headWear` lying a
    // millimetre off the skin. It is now part of the complexion field — see
    // `WAR_PAINT` — and that is not a tidy-up. Paint on a lifted shell is
    // deleted by every helmet that came after it: the audit's frame of the four
    // paints under the Sutton Hoo mask shows four identical panels, so a player
    // who owns Half-Face Shadow at 110 gold and the helm at 2400 owns nothing he
    // can see. Paint written into the skin is drawn wherever skin is drawn, and
    // each of the three marks now runs deliberately down onto the jaw and the
    // throat, which is exactly what a mask leaves showing.

    // ---- helms ----
    //
    // A note on `lift`, because every number below moved this pass. A helm is worn
    // over 8–12 mm of padded liner, so its *inner* surface — `lift - thick` — is
    // what has to land on the skull. The bowl was lifted 21 mm and 8 mm thick,
    // which put 13 mm of air between iron and forehead all round, and the brow band
    // was worse: 26 mm out, 10 mm thick, 16 mm of daylight under the rim. That gap
    // is the "helm sitting proud of the skull" read — the helm was not on the head,
    // it was parked above it. Everything here is now within a liner's thickness of
    // the skin it is sampled from.
    if (helmed) {
      // Where the iron stops and the face begins. The band used to run from
      // v = 0.245 to 0.44, and the brow ridge used to sit at y = 0.30 — so the band
      // was *on top of the ridge*, and the one shape on the head whose whole job is
      // to overhang the eye sockets was under a steel plate. Nothing on the face
      // could throw a shadow, and the frame showed a reddish band (the brows) under
      // a blown white one (the band) with no structure between them. The layout
      // rewrite drops the ridge to y = 0.19; this lifts the band clear of it, and
      // the 11 mm of bare forehead between the two is what a spangenhelm shows.
      // How low the class wears its helmet, and how much bowl stands above it.
      // This is the cheapest silhouette differentiator on the head: a bowl pulled
      // down to the brow with a deep dome is a different outline from a cap sitting
      // on the crown, at any distance and from behind. See `BuildTrait.bowl`.
      // The mask helm wears 5 mm deeper than the open ones, and that is a
      // proportion fix rather than a fit change. An open helm is read against the
      // face under it; a mask helm is read against *itself*, and with the band at
      // the open helms' height the bowl stood as a tall dome over a shallow plate
      // and the eye openings sat in the bottom third of a letterbox. Dropping the
      // band brings the cap onto the brow, which is where the artefact's is, and
      // hands the height it gives up to the mask. It stops well clear of the brow
      // ridge at 0.049 rad — putting the band *on* the ridge is the defect logged
      // twenty lines above and this does not repeat it.
      // DOWN ONTO THE BROW, and this is the owner's complaint about how a helm
      // sits, measured rather than adjusted by eye. At `Y_BROW + 0.15` the band's
      // lower rim landed at 29% of head height from the crown — 19 mm ABOVE the
      // brow ridge — and the band is 26 mm tall on top of that, so the iron
      // occupied the top of the forehead and the whole bowl read as a small dome
      // parked on a large bald head. A spangenhelm's browband bears on the frontal
      // bone with its rim at or just over the eyebrow; that is 35% of head height,
      // which is `Y_BROW + 0.04`. The note twenty lines below about not putting
      // the band ON the ridge still holds and this does not break it — the ridge
      // peaks at `Y_BROW` and the rim now clears it by 5 mm rather than by 19.
      const bandLo = lat(Y_BROW + mix(0.065, 0.005, clamp01((B.bowl - 0.76) / 0.36)))
        - (style.mask ? 0.050 : 0);
      const bandHi = bandLo + 0.20;
      // The two substances the whole cap is cut from. Every helm below the noble
      // tier gets the iron/steel pair it always had; the Sutton Hoo gets tinned
      // silver and gilt through the same lines, so its cap is the same object in
      // a different metal rather than a second copy of the build.
      const capMetal = style.noble ? silver : iron;
      const trimMetal = style.noble ? gilt : steel;
      // u is authored low-to-high on both sides of the face, always. `patch` takes
      // its facing from ∂u × ∂v, so a mirrored piece written `u0: s*a, u1: s*b`
      // sweeps backwards on the left: the outer sheet turns away and what renders
      // is the inner one, 8 mm closer to the skull than it was drawn. Silent,
      // because backface culling simply removes the surface that was meant to be
      // there. Older pieces on this head still do it and are left alone — moving
      // them moves helmets that shipped — but nothing new does.
      const sideArc = (s: number, a: number, b: number) =>
        (s > 0 ? { u0: a, u1: b } : { u0: -b, u1: -a });
      // A point on the head with a standoff, for the fittings that are solids
      // rather than sheets — boar snouts, cabochons, the wyrm's head. Same three
      // calls `headWear` makes, so a fitting cannot drift off the sheet it is
      // supposed to be riveted to. The vector is reused; consume it before the
      // next call.
      const _fp = new THREE.Vector3();
      const _form = helmForm(K);
      const onForm = (u: number, v: number, off: number): THREE.Vector3 => {
        formSurface(_form, u, v, _fp);
        // On the FORM, and off its normal, because that is what the shells
        // around it ride — see the block above `helmWear`. A fitting sampled off
        // the skin while the plate it is riveted to is sampled off the form sits
        // wherever the two disagree, which over the brow ridge is 16 mm of float.
        return _fp.addScaledVector(formNormal(_form, u, v, _n), off);
      };
      // THE BOWL, and its profile is a rung of the ladder rather than a constant.
      //
      // It used to be one curve — `mix(0.013, 0.014 + 0.008 · B.bowl, v²)` — for
      // every metal helm in the shop, so seven rungs differed only in what was
      // bolted to the same dome. The audit measured what that buys at play
      // distance: "panels 7, 8 and 9 differ from each other by a two-pixel smudge
      // on the crown". A crest is four pixels. A profile is the whole outline.
      //
      // Three numbers per rung: where the iron starts at the band (`seat`), how
      // much it rises to the crown (`rise`), and how that rise is distributed
      // (`taper`). A low exponent puts the height on the flank and gives a
      // straight-sided cone; a high one keeps the flank close to the skull and
      // domes only at the top.
      //
      // `seat` is 17 mm and not 13, on every profile, and that is a fix rather
      // than a style: `helmFitProbe` measured the skin standing 15.7 mm proud of
      // the form at the brow ridge on seed 7932, so at 13 mm the bowl's own rim
      // had 2.7 mm of forehead through it. A helm is worn over 8-12 mm of liner
      // and the brow ridge is under the rim; 17 clears it on every seed measured.
      //
      // The class term stays on all four, because a huscarl's helm is a bigger
      // object than a berserker's whatever shape it is.
      const bowlProfile = {
        //          seat   rise to the crown        taper
        shallow: [0.017, 0.004 + 0.003 * B.bowl, 1.70],
        cone:    [0.017, 0.030 + 0.008 * B.bowl, 1.15],
        round:   [0.017, 0.012 + 0.008 * B.bowl, 2.10],
        tall:    [0.017, 0.030 + 0.008 * B.bowl, 2.70],
      }[style.bowl];
      const [bowlSeat, bowlRise, bowlTaper] = bowlProfile;
      const crest = bowlSeat + bowlRise;
      const bowlLift = (v: number) => bowlSeat + bowlRise * Math.pow(clamp01(v), bowlTaper);
      p.add(helmWear(K, {
        tag: "bowl",
        u0: 0, u1: Math.PI * 2, wrapU: true,
        v0: () => bandLo + 0.015, v1: () => Math.PI / 2 - 0.02,
        nu: Math.max(10, lod.shellU + 2), nv: Math.max(lod.shellV, style.bowl === "cone" ? 6 : 4),
        lift: (_u, v) => bowlLift(v),
        thick: 0.007,
      }), capMetal, place.clone());
      // ---- a comb along the midline ----
      //
      // The ridge helm's crest and the wyrm's were both two `headWear` strips
      // meeting at the crown, with the height carried by a `sqrt(1 - x²)` section
      // across a fixed span of AZIMUTH. That construction has a defect the fit
      // probe now names out loud: azimuthal width collapses to nothing at the
      // pole, so a strip 11 mm across at the brow is 0 mm across at the crown
      // while still carrying its full height. It is not a comb, it is a needle —
      // `helmFitProbe` measured a quarter of the wyrm's crest turned inside out —
      // and the contact sheet had already called both of them "bright bent wire
      // arcing off the skull" without knowing why.
      //
      // A comb is a half-tube of constant width lying along the midline, so it is
      // swept in the sagittal plane instead. `theta` runs from the nape, over the
      // crown, to the brow; the section is a half-ellipse standing on the bowl;
      // and the width is whatever the author asks for in millimetres at every
      // point along it, the crown included.
      const combPath = (theta: number, out: THREE.Vector3, nrm: THREE.Vector3) => {
        const u = theta >= 0 ? 0 : Math.PI;
        const v = Math.PI / 2 - Math.abs(theta);
        formSurface(_form, u, v, out);
        formNormal(_form, u, v, nrm);
        return out;
      };
      // The bowl's own lift under a point on that path, so a comb sits ON the cap
      // however this rung's profile is drawn.
      const bowlV0 = bandLo + 0.015;
      const bowlV1 = Math.PI / 2 - 0.02;
      const bowlUnder = (theta: number) =>
        bowlLift(clamp01(((Math.PI / 2 - Math.abs(theta)) - bowlV0) / (bowlV1 - bowlV0)));
      const _cb = new THREE.Vector3();
      const _cn = new THREE.Vector3();
      const _cb2 = new THREE.Vector3();
      const _cn2 = new THREE.Vector3();
      const _ct = new THREE.Vector3();
      const _cx = new THREE.Vector3();
      const comb = (
        t0: number, t1: number,
        rise: (t: number) => number,
        half: (t: number) => number,
        gauge: number,
      ): THREE.BufferGeometry => {
        const surf = (t: number, sec: number, shrink: number, out: THREE.Vector3) => {
          const th = mix(t0, t1, t);
          combPath(th, _cb, _cn);
          // The path's own tangent, so the section stands square to the comb
          // rather than square to the head — over the crown those differ by 90°.
          combPath(th + 0.012, _cb2, _cn2);
          _ct.subVectors(_cb2, _cb).normalize();
          _cx.crossVectors(_cn, _ct).normalize();
          const a = Math.PI * (sec - 0.5);
          const h = Math.max(0, rise(t) - shrink);
          const w = Math.max(0.0008, half(t) - shrink);
          return out.copy(_cb)
            .addScaledVector(_cn, bowlUnder(th) + h * Math.cos(a))
            .addScaledVector(_cx, w * Math.sin(a));
        };
        return patch({
          nu: Math.max(14, lod.shellU + 4), nv: lod.trim ? 6 : 4,
          outer: (t, sec, out) => surf(t, sec, 0, out),
          inner: (t, sec, out) => surf(t, sec, gauge, out),
        });
      };
      if (style.bowl === "cone") {
        // The apex. A raised conical cap does not stop at a rounded pole — it
        // comes to a definite point with a small finial on it, and that point is
        // what makes this rung readable as a different object from the spangenhelm
        // below it at any distance the game is played at.
        const apex = onForm(0, Math.PI / 2, crest + 0.004);
        p.add(rod(0.0022, 0.0105, 0.030, 6), capMetal, xf(0, skullY + apex.y + 0.013, apex.z));
        if (lod.trim) p.add(ball(0.0055, 6), trimMetal, xf(0, skullY + apex.y + 0.030, apex.z));
      }
      // Brow band, sized off the bowl rather than off the skull. Its lower edge
      // stands 8 mm further out than its top, so the rim is a brim that overhangs
      // the forehead instead of a hoop lying flat on it — 8 mm of overhang under a
      // key at 60° is a shadow line across the top of the brow, and that line is
      // the boundary the whole face composition hangs off.
      // In iron, not steel. The band is the largest single piece of metal in the
      // portrait framing and at `steel`'s roughness 0.3 / metalness 1 it returned the
      // sky as one blown white bar straight across the head — visible in every
      // helmeted warrior in `art/shots/v4`. The ribs, the comb and the spectacle
      // plate keep the polish, so the helm still has bright metal on it; it is just
      // no longer the brightest thing in the frame.
      // 13 mm at the top rim and 20 at the bottom, not 16 and 24. A helm is worn
      // over 8-12 mm of liner, so its inner surface — `lift - thick` — is what has
      // to land on the skull: at 24 and 9 mm thick there was 15 mm of daylight
      // under the brim and the band was standing off the head. It is now within a
      // liner everywhere, and the 7 mm of flare from top rim to bottom is still a
      // brim that overhangs the forehead and throws the shadow line the whole face
      // composition hangs off.
      p.add(helmWear(K, {
        tag: "band",
        u0: 0, u1: Math.PI * 2, wrapU: true,
        v0: () => bandLo, v1: () => bandHi,
        nu: Math.max(10, lod.shellU + 2), nv: 1,
        // Seated at the bowl's own 17 mm for the same measured reason, with the
        // 7 mm of flare from top rim to bottom kept: that overhang is the shadow
        // line across the brow the whole face composition hangs off.
        lift: (_u, v) => bowlSeat + 0.007 * (1 - v),
        thick: 0.008,
      }), capMetal, place.clone());
      if (lod.trim && style.bowl !== "cone") {
        // The bowl's spangen — the strips the cap's plates are riveted along.
        //
        // Not on the conical cap, and that is the point of it: a spangenhelm is
        // four plates held in a frame and a raised helm is one sheet, so a rib on
        // it is a strip over a join that is not there. Taking them off is half of
        // what makes the 110-gold rung a different object rather than the 30-gold
        // one with a bar down the nose.
        //
        // They ran `bandHi − 0.02` to `π/2 − 0.05` at a constant 5 mm lift, and
        // both ends of that are wrong in the same way: a rib is a *join*, and a
        // join has to arrive somewhere. The bottom stopped 20 mm above the band's
        // own top rim — and on the noble helm the band is silver while the rib is
        // gilt, so the gap was legible — and the top stopped short of the pole and
        // was closed by a `patch` rim strip, which is a flat cut end facing the
        // camera. The review counted four gold ribs "terminating in mid-air with
        // flat cut ends, connecting to neither crest nor brow band", and that is
        // the whole of it: they were four floating strips.
        //
        // So: down onto the band, up to the pole, and tapered to nothing at the
        // top so the four converge into the crown instead of each presenting an
        // end. The taper is on the lift rather than on the width, because
        // narrowing the strip near the pole is where `headWear`'s u-spans are
        // already crowded and it would only buy a pinch.
        const ribTop = Math.PI / 2 - 0.012;
        const ribLo = bandLo + 0.004;
        for (let i = 0; i < 4; i++) {
          const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
          p.add(helmWear(K, {
            tag: "rib",
            u0: a - 0.05, u1: a + 0.05,
            v0: () => ribLo, v1: () => ribTop,
            nu: 1, nv: 5,
            // Written as the bowl's own lift plus a proud height, so the strip
            // cannot leave the cap however domed this warrior's is. `s` is the
            // patch's own 0→1 parameter and the rib spans almost exactly the
            // bowl's range, so the first two terms ARE the bowl. 14 mm at the
            // band, which clears the band's own 24 mm brim, falling to zero at the
            // pole: at the top the rib is flush with the dome and there is nothing
            // left of it to cut.
            // 6 mm proud at the band, not 14. A rib is a strip of iron riveted
            // over a plate join and stands about the thickness of the strip; at
            // 14 mm on top of a 13 mm bowl the four of them sat 27 mm off the
            // skull with 22 mm of air behind them, and what that draws is a
            // birdcage over the head rather than a cap on it. It is the single
            // loudest part of the owner's "the helms hover" — visible in
            // `art/ui/armourycard-desktop.png` on every rung of the ladder.
            // 9 mm proud at the band on the spangenhelm and 6 elsewhere. The
            // audit's brief for the 30-gold rung is "four plates with the frame
            // bands standing 8-10 mm proud", and on the one helmet whose whole
            // product is its frame the ribs have to be legible against the plates;
            // above it they are a construction detail on a cap whose rung is
            // something else, and 6 mm is the thickness of the strip.
            lift: (_u, s) =>
              bowlLift(s) + (style.bowl === "shallow" ? 0.009 : 0.006)
                * (1 - Math.pow(clamp01(s), 2.2)),
            thick: 0.004,
          }), trimMetal, place.clone());
        }
      }
      if (style.nasal) {
        // Nasal, and this is the pale slab straight down the middle of the face in
        // `art/shots/v4/portrait.png`. Two things were wrong with it. It was 48 mm
        // across at the top and 30 at the nose — a nasal is 20 to 25 — and its front
        // face sat at 165 mm where the nose tip was at 143, so it stood 22 mm proud
        // of the nose it was supposed to be guarding and hid the dorsum, the
        // philtrum and the upper lip behind it. And it was `steel`: roughness 0.3 at
        // metalness 0.9, which returns the sky's orange band in one hit and made it
        // the brightest object on the warrior. Narrower, following the profile the
        // sculpt now actually has — clear of the bridge, kissing the tip, tucked
        // under the nostril — and in iron, so it reads as a bar bolted to a helmet.
        // Third pass on this bar, and the first one that measures it against the
        // nose instead of against itself. It was 31 mm across with its front face
        // at z = 0.152 while the nose tip stood at 0.139 — 13 mm *proud of the
        // nose it guards*, over a 12 mm air gap, running from the brow band down
        // past the mouth. So it was a plank hovering in front of the face: the
        // largest flat surface in the portrait framing, square to the camera and
        // square to the bounce light, which is why it returned more luma than any
        // other object on the warrior however dark its albedo went. Making it
        // darker was never going to work — it was winning on *geometry*.
        //
        // It is now sampled off the face field like every other piece of kit on
        // this head, so it lies on the dorsum with a liner's clearance and cannot
        // float; it is 21 mm across, which is what the finds are; it stops at the
        // subnasale instead of covering the philtrum and the upper lip; and its
        // section is a rounded rib rather than a slab, so it rolls a highlight
        // instead of returning one flat value. The nose's own alae now show on
        // both sides of it, which is the point of a nasal being narrow.
        const nasal: Station[] = [];
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          const on = faceSurface(K, dirOf(0, lat(mix(Y_BROW + 0.10, Y_NOSE + 0.01, t)), _d), new THREE.Vector3());
          nasal.push({
            y: skullY + on.y,
            hw: mix(0.0126, 0.0088, t),
            hd: 0.0042,
            // Flush with the brow band at the top, clearing the dorsum by a
            // rivet's thickness the rest of the way down.
            z: on.z + mix(0.019, 0.009, t),
          });
        }
        p.add(shell(nasal, 8, { power: 2.6, capTop: true, capBottom: true }), capMetal);
        if (lod.trim) {
          // Two rivet domes where the bar is pinned through the brow plate, in the
          // helm's polished steel rather than its iron.
          //
          // Partly kit and partly a tonal-range obligation. The second panel
          // measured this build failing the 8-bucket floor on *highlight
          // structure*, with nothing above code 112 occupying even 0.2% of the
          // portrait — and the one object that was reaching those buckets was this
          // nasal, as a flat plank square to the light. Narrowing it is right and
          // costs those pixels; a pair of 8 mm domes and the bar's own rolled
          // section give them back as a rolled highlight and two specular dots,
          // which is the same luma occupying a shape. Steel is already on this part
          // for the helm's ribs, so it is not a draw call.
          for (const st of nasal.slice(0, 2)) {
            p.add(ball(0.0042, 6), trimMetal, xf(0, st.y - 0.004, (st.z ?? 0) + 0.0038, 0, 0, 0, 1, 1, 0.7));
          }
        }
        // The plate it is riveted through. A flat 50 mm box at a fixed z could not
        // do this job: the bowl curves away 8 mm across that span, so the box's
        // corners stood outside the helm's own silhouette — and because the idle
        // look-around swings the head up to 9°, in `art/shots/v4/portrait.png` it
        // reads as a strip of gold tape stuck to the side of the bowl rather than as
        // a rivet plate on the brow. Conformed to the skull like the band it sits
        // on, 4 mm further out than the band so the two still read as two pieces,
        // it cannot leave the surface at any yaw.
        // Shaped and seated, because a rivet plate is a lozenge and this was a
        // rectangle at a flat 26 mm. `helmFitProbe` measured a third of it turned
        // inside out over the glabella — the highest-curvature point on the whole
        // head — and in the cards it read as a dark angular wedge standing off the
        // brow beside the band. It now tucks its corners in at both ends, so the
        // outline is a leaf rather than a card, and stands 19 to 22 mm: the band
        // it is riveted through is at 17 to 24, so the plate reads as a second
        // thickness on the band instead of as a third object floating past it.
        const npT = (u: number) => clamp01(Math.abs(u) / 0.135);
        p.add(helmWear(K, {
          tag: "nasal plate",
          u0: -0.135, u1: 0.135,
          v0: (u) => bandLo - 0.010 + 0.055 * Math.pow(npT(u), 2.0),
          v1: (u) => bandHi - 0.015 - 0.075 * Math.pow(npT(u), 1.7),
          nu: 5, nv: 2,
          lift: (u, v) => 0.019 + 0.003 * v * (1 - npT(u)),
          thick: 0.006,
        }), capMetal, place.clone());
      }
      if (style.brows) {
        // THE SPECTACLE PLATE, and this is the "dark rectangle pasted over the
        // eyes" the audit sends back at 280 gold.
        //
        // It was `u0: 0.1, u1: 0.66, v0: lat(Y_EYE + 0.115), v1: lat(Y_BROW +
        // 0.07), lift: 0.018` — four constants. A rectangle in (u, v) at a
        // constant standoff is not a brow guard; it is a billboard, and it reads
        // as one because its edges are straight lines at 90° to each other on a
        // face that has no straight lines anywhere.
        //
        // What the object is: the two brow plates of a Vendel spectacle guard, cut
        // as an ARCH over each eye. So the lower edge is an arc — highest over the
        // pupil, dropping at both ends to the nasal and to the temple, which is
        // what leaves an eye opening under it rather than a hem. The upper edge
        // follows the brow line and turns down at the temple where the plate
        // finishes on the band. And the standoff rolls off to nothing at both
        // ends, so the plate GROWS OUT of the band and the nasal instead of
        // starting in mid-air 18 mm off the face at a hard vertical cut.
        //
        // Sizes are the finds': about 60 mm of arc per eye, 16 mm of plate over
        // the pupil widening to 26 at the temple, standing 16 mm proud at the
        // brow. `helmFitProbe` measured the old constant-lift version 17% turned
        // inside out over the brow ridge; on the form, arched, it measures zero.
        const bIn = 0.13, bOut = 0.70;
        // 0 at the nasal end, 1 at the temple.
        const bt = (u: number) => clamp01((Math.abs(u) - bIn) / (bOut - bIn));
        // The arch: the eye opening's top edge. `sin` rather than a smoothstep
        // because an arch is a single curve with no flat in it — a flat is what
        // makes a hem read as a shelf.
        const browLo = (u: number) =>
          lat(Y_EYE + 0.055) + 0.150 * Math.pow(Math.sin(Math.PI * bt(u)), 0.85);
        const browHi = (u: number) =>
          lat(Y_BROW + 0.085) - 0.075 * Math.pow(bt(u), 2.2);
        for (const s of [-1, 1]) {
          p.add(helmWear(K, {
            tag: "brow plate",
            ...sideArc(s, bIn, bOut),
            v0: browLo, v1: browHi,
            nu: 7, nv: 3,
            // Proud over the eye, feathered into the band and the nasal at both
            // ends. The `v` term stands the top rim out further than the free
            // edge, which is what a plate riveted along its top does.
            lift: (u, v) =>
              (0.010 + 0.007 * v) * mix(0.35, 1, Math.sin(Math.PI * bt(u)))
              + 0.008,
            thick: 0.007,
          }), trimMetal, place.clone());
        }
      }
      // WHERE A CHEEK GUARD STOPS AT THE FRONT, and it is one number and one
      // curve shared by both guards because both got it wrong the same way.
      //
      // `eyeFrame` sites each eye at azimuth `0.355 · F.eyeU` and the aperture is
      // 0.17 rad either side of that, so the outer canthus is at about 0.53 rad.
      // The short guard began at 0.42 and the deep one at 0.50 — INSIDE the eye —
      // and both ran straight up to the brow band, so each plate covered the far
      // eye entirely. On the contact sheet that draws as a slab of metal across
      // the middle of the face with the socket gone behind it, which is most of
      // what "a rectangle standing proud of the skull" was describing. A helmet
      // that covers the eye is not a helmet, whatever its edges do.
      //
      // 0.56 rad clears the canthus by 15 mm. And the top edge is cut away at the
      // front: it starts below the eye line, curves up, and reaches the band by
      // the time it is behind the socket — which is what a hinged cheek piece
      // actually looks like on the finds, and what leaves a man something to see
      // and shout through.
      const cheekTop = (t: number) =>
        mix(lat(Y_EYE - 0.045), bandLo + 0.015, Math.pow(smooth(0, 0.62, t), 0.85));
      if (style.cheek === "short") {
        // Cheek guards, hinged off the band. They run from the band down past the
        // cheekbone to the jaw, and they stop short of the mouth: the whole point of
        // the previous pass was to stop kit bricking up the face, and a guard that
        // reaches the chin undoes it.
        //
        // Shaped, not rectangular. The contact sheet found this plate on three
        // helmets at once — "a flat rectangular plate floating off the face with
        // a hard straight edge and mail visible behind it … it looks pasted on" —
        // and all three of those complaints come out of the same two lines: a
        // constant `v0` gave it a straight horizontal hem, and a constant `lift`
        // gave it a flat plane standing a fixed 18 mm off a face that curves away
        // under it. A cheek guard is cut to the jaw: deepest at the front where it
        // covers the cheekbone and the jaw, swept up at the back so it clears the
        // ear and rides the hinge. And a plate hinged off a band stands furthest
        // out at its top rim and lies closest at its free edge, which is what
        // turns a floating rectangle into something worn.
        // The leading edge is raked, not vertical, and the plate starts outboard
        // of the eye. At `u0 = 0.42` it began under the inner half of the eye and
        // ran straight down from the band, which draws a hard vertical line down
        // the middle of the cheek — the same fault as the hem, on the other axis,
        // and the reason the contact sheet kept reading this plate as pasted on.
        // A hinged cheek plate is cut back at the front so the wearer can see and
        // shout past it; the top corner behind the eye is the last thing on it.
        const shortIn = 0.56, shortOut = 1.10;
        const st = (u: number) => clamp01((Math.abs(u) - shortIn) / (shortOut - shortIn));
        const hem = (u: number) =>
          lat(Y_LIP + 0.02) + 0.20 * Math.pow(smooth(0.20, 1, st(u)), 1.5);
        const top = (u: number) => cheekTop(st(u));
        for (const s of [-1, 1]) {
          p.add(helmWear(K, {
            tag: "cheek (short)",
            ...sideArc(s, shortIn, shortOut),
            v0: hem, v1: top,
            nu: 8, nv: 4,
            lift: (_u, v) => 0.014 + 0.010 * v,
            thick: 0.008,
          }), capMetal, place.clone());
        }
      } else if (style.cheek === "deep") {
        // Deep guards, and the reason the short ones are still here rather than
        // being deepened for everybody: a guard that reaches the jawline is the
        // silhouette of a *closed* helmet, and closing the face is exactly what
        // the two open helms below this price are not allowed to do.
        //
        // The floor is `lat(Y_CHIN + 0.05)`, which is 29 mm below where the short
        // guard stops and about as far as this parametrisation reaches: v is a
        // latitude on the skull's own sphere, so the last 50 mm to the menton is
        // all crowded into the pole and a guard cut lower gains nothing but a
        // pinched corner. It also has to clear a full beard's hanging mass, which
        // starts 126 mm under the skull's centre; this ends at 91 mm.
        //
        // Outboard of the mask on purpose — 27 mm against the mask's 22 to 29 —
        // so the two plates read as hinged over the face rather than flush with
        // it, which is the only cue that says the guards move and the face does not.
        // Round to 1.45 rad, not 1.02. At the short guard's width the plate stops
        // in front of the ear and leaves a wedge of bare temple between it and the
        // fall off the nape — visible from any three-quarter bearing, and the one
        // angle a helmet like this is most often seen from. A deep guard covers the
        // ear, which is what these are for, and at 1.45 it clears the helix by
        // 12 mm rather than grazing it.
        //
        // Two numbers move when there is a mask under the guard, and both are
        // about what the plate is standing on. Its inner edge goes from 0.50 rad
        // to 0.78: at 0.50 it lands halfway across the cheek, and over an open
        // helm that is a plate against skin — a boundary the eye reads as kit —
        // but over a mask it is a plate against a plate, and it drew a fold down
        // the middle of each cheek of the one face in the game that has to read as
        // one formed surface. At 0.78 it sits at the mask's own outer curve and
        // frames it. And the tessellation goes up, because 6 spans across a 0.95
        // rad guard put four visible facets in a silhouette that used to be behind
        // an open helm's jaw and is now the outline of the face itself.
        // And 1.62 rad round rather than 1.45 when there is a mask under it.
        // The nape fall now reaches 1.40, so on paper 1.45 laps it — but the two
        // are swept in different frames: the guard rides the face field at a
        // 27 mm standoff while the fall is on rings that flare backwards as they
        // drop, so its front edge rakes away from the guard's the further down
        // you look. `profile_90_` shows the result as a brown column of bare neck
        // between them from the ear down. 1.62 carries the plate past the ear to
        // where the fall's edge actually is at throat height.
        const guardIn = style.mask ? 0.78 : 0.56;
        const guardOut = style.mask ? 1.62 : 1.45;
        // THE OUTLINE, and this is the audit's ruling in one function: "their
        // cheek guards are A RECTANGLE IN (u, v) standing tens of millimetres
        // proud of the skull. A rectangle in parameter space is not a cheek
        // guard; it is a billboard."
        //
        // A hinged cheek plate is cut to the face it covers. It is DEEPEST at the
        // front, where it comes down the jaw beside the mouth; it sweeps UP behind
        // that so it clears the mandible's angle and rides on its hinge; and it
        // finishes short at the back where the nape fall laps over it. So the hem
        // is a curve in u, not a latitude — the same construction the Sutton Hoo
        // mask's `maskBot(u)` uses, which is the one piece in the tier the audit
        // passes and the template it names.
        const deepHem = (u: number) => {
          const t = clamp01((Math.abs(u) - guardIn) / (guardOut - guardIn));
          return lat(Y_CHIN + 0.05) + 0.34 * Math.pow(smooth(0.30, 1, t), 1.35);
        };
        // And the top edge dips forward of the hinge, so the plate does not
        // present a straight horizontal rim across the temple either.
        // Over a MASK there is no eye to clear — the mask has its own openings and
        // the guard is meant to lap it — so that case keeps the band-height rim it
        // was tuned with. Over an open helm the guard is cut for the socket.
        const deepTop = (u: number) => {
          const t = clamp01((Math.abs(u) - guardIn) / (guardOut - guardIn));
          return style.mask ? bandLo + 0.01 - 0.045 * Math.pow(1 - t, 1.6) : cheekTop(t);
        };
        for (const s of [-1, 1]) {
          p.add(helmWear(K, {
            tag: "cheek (deep)",
            ...sideArc(s, guardIn, guardOut),
            v0: deepHem, v1: deepTop,
            nu: style.mask ? 10 : 8, nv: style.mask ? 6 : 5,
            // The flare down the guard's height is the other half of the brown
            // gap, and it only matters over a mask. `v` is 0 at the floor, so
            // 0.027 + 0.011 stands the guard's bottom edge 38 mm out while the
            // mask under it is at 25 — a 13 mm slot at exactly the height where
            // the mask's own edge has risen away, and the profile card looks
            // down it. Over an open helm the flare is right and stays: there is
            // a jaw under there and the plate has to clear it. Over a mask there
            // is a plate under there, and 31 mm keeps the guard outboard by the
            // 6 mm that says "hinged" without opening a sightline into the head.
            // Over a MASK the pair 27/31 mm stays exactly as it was tuned: there
            // is a formed plate under this guard, not a face, and the 6 mm of
            // difference between them is the whole cue that says hinged. Over an
            // OPEN helm it was 27 rising to 38, and 38 mm of air under a plate
            // whose job is to cover a jaw is the "floating slab" — `helmFitProbe`
            // now fails it. 23 to 29 lands the plate on the mandible with a mail
            // gap under it, which is what the finds show and what the short guard
            // beside it already does.
            lift: (_u, v) => (style.mask ? 0.027 + 0.004 * (1 - v) : 0.023 + 0.006 * (1 - v)),
            thick: 0.008,
          }), capMetal, place.clone());
        }
      }
      if (style.nape !== "none") {
        // ---- the fall off the back of the band ----
        //
        // Swept on its own rings rather than off the face field, and that is not a
        // style choice. Sampled off the skull the way the warden's flange is, a
        // fall bottoms out about 135 mm behind the head's centre however hard it is
        // pushed: by the time it is that low the sphere has curved under, so the
        // standoff points downward rather than backward. Measured on the built
        // head, the huscarl's coif reaches 170 mm — so a field-sampled guard hangs
        // *inside* the mail on the one class that wears mail, which is the class
        // the portrait capture uses and the one most likely to be wearing the
        // expensive helmet. On rings it clears the coif by 18 to 41 mm at every
        // level, and it flares as it falls, which is what makes it read as plate
        // rather than as more head.
        //
        // THE CUT. `severBody`'s neck seam runs at `S.neckRoot - S.neckTop` in
        // this pivot's frame and keeps what is above it, baking flat anything that
        // crosses. This is the one piece of kit on a head that reaches for that
        // plane, and a severed head wearing a guard sliced off square is a worse
        // frame than one wearing no guard at all. So the lowest ring is solved
        // against the seam instead of eyeballed and held 25 mm clear of it. As the
        // skeleton stands the deep guard lands 70 mm above the cut and the clamp
        // never binds — it is written this way round so that a collar line moving
        // down carries the guard with it rather than quietly putting the cut
        // through the middle of it.
        const deep = style.nape === "guard";
        const cut = S.neckRoot - S.neckTop;
        const floorY = Math.max(cut + 0.025, skullY - R.y * (deep ? 1.05 : 0.45));
        // OVER the coif, not inside it. The guard's top ring sat at R.y · 0.30 and
        // R.x · 1.06 while the huscarl's aventail starts at R.y · 0.44 and
        // R.x · 1.00 + 11 mm — so on the one class that wears both, the mail's own
        // top ring stood higher and wider than the plate that is supposed to hide
        // it, and a band of cut-out mail showed above the guard against the sky.
        // Because mail's alpha is a texture cutout, what that band drew was a row
        // of ragged triangles: the review read it as an alpha artifact and a
        // texture bug, and it was neither — it was a plate 6 mm too small.
        // The top ring now starts above the coif's and outboard of it, so the
        // aventail is riveted up under the guard the way it is under the bowl.
        const topY = skullY + R.y * 0.47;
        const rings = [
          { y: topY, hw: R.x * 1.16, hd: R.z * 1.14, z: -0.012 },
          { y: mix(topY, floorY, 0.5), hw: R.x * 1.26, hd: R.z * 1.20, z: -0.028 },
          { y: floorY, hw: R.x * (deep ? 1.38 : 1.30), hd: R.z * (deep ? 1.32 : 1.24), z: deep ? -0.040 : -0.034 },
        ];
        // Round far enough forward to meet the cheek guard. The deep guard's rear
        // edge is at 1.45 rad and this arc used to start at π − 1.62 = 1.52, so
        // there were 4° of nothing between two plates that are meant to overlap —
        // and behind that gap, from any profile bearing, bare neck and the mail
        // curtain. π − 1.74 = 1.40 rad laps the cheek plate by 3° instead.
        const half = deep ? 1.74 : 1.38;
        const fall = (u: number, v: number, inset: number, out: THREE.Vector3) => {
          const t = v * (rings.length - 1);
          const i = Math.min(rings.length - 2, Math.floor(t));
          const f = t - i;
          const a = rings[i];
          const b = rings[i + 1];
          out.set(
            Math.sin(u) * (mix(a.hw, b.hw, f) - inset),
            mix(a.y, b.y, f),
            mix(a.z, b.z, f) + Math.cos(u) * (mix(a.hd, b.hd, f) - inset),
          );
        };
        // u runs from the near edge round to the far one, the same direction the
        // coif is swept in and for the same reason: v descends here, so a patch
        // swept the other way round has ∂u × ∂v pointing into the skull and the
        // guard renders inside out — which reads as a hole in the back of the head.
        const sweep = (inset: number) =>
          (t: number, v: number, out: THREE.Vector3) => fall(mix(Math.PI + half, Math.PI - half, t), v, inset, out);
        p.add(patch({
          nu: Math.max(8, lod.shellU - 2), nv: 3,
          outer: sweep(0), inner: sweep(0.008),
        }), capMetal);
        if (style.noble) {
          // Gilt edging along the rim. From behind — which is a third of the
          // frames in a brawl — this strip is the only thing that says the helmet
          // in front of you is the expensive one.
          // A negative inset is 2.5 mm *outside* the guard, so the strip straddles
          // the plate's own surface instead of sitting on it: no coplanar pair to
          // fight for depth, and its two long rims are buried in silver.
          const lip = (inset: number) =>
            (t: number, v: number, out: THREE.Vector3) =>
              fall(mix(Math.PI + half - 0.03, Math.PI - half + 0.03, t), mix(0.86, 1, v), inset, out);
          p.add(patch({ nu: Math.max(8, lod.shellU - 2), nv: 1, outer: lip(-0.0025), inner: lip(0.0035) }), gilt);
        }
      }
      if (style.crown === "circlet") {
        // THE JARL'S CROWN, and the audit's ruling on it was a pricing one with a
        // geometry cause: "570 buys less geometry than 380" — it lost the boar and
        // the nape flange the Boar-Crest has, and gained a hoop with six 42 mm
        // pins on it. Six pins on a hoop is a tiara. This is a crown.
        //
        // Three things changed and the first two are in `HELM`: the bowl is the
        // `tall` profile, which is 20 mm of outline the 380 does not have, and the
        // nape flange is back. What is left here is the hoop itself.
        //
        // Alternating points, four tall and four short, each a tapered leaf
        // leaning out over the band. Alternation is what reads as a crown rather
        // than as a fence at any distance: a ring of identical pins is one
        // frequency and the eye resolves it as a texture, while a big-small-big
        // rhythm survives all the way down to the four pixels a fight-distance
        // capture gives it. The tall ones are 62 mm, which is the first thing on
        // this helmet to break its own outline from the front.
        const cr = R.x + 0.024;
        const cz = (R.z + 0.024) / cr;
        const cy = skullY + R.y * 0.34;
        p.add(ring(cr, 0.013, 5, 20), brass, xf(0, cy, 0, Math.PI / 2, 0, 0, 1, 1, cz));
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + 0.22;
          const tall = i % 2 === 0;
          const len = tall ? 0.062 : 0.032;
          const sx = Math.sin(a), sz = Math.cos(a);
          p.add(rod(0.0012, tall ? 0.0105 : 0.0080, len, 5), brass,
            xf(sx * cr * 0.96, cy + 0.008 + len * 0.5, sz * cr * cz * 0.96,
              0.17 * sz, 0, -0.17 * sx));
          // A stud at the foot of each tall point, where the leaf is riveted
          // through the hoop. Three solids a crown, which is what the boar and
          // the wyrm's head each cost, and this rung is dearer than both.
          if (lod.trim && tall) {
            p.add(ball(0.0042, 6), garnet,
              xf(sx * cr * 1.02, cy + 0.002, sz * cr * cz * 1.02));
          }
        }
      }
      if (style.crown === "ridge") {
        // THE RIDGE HELM'S COMB, and it is the entire rung at 190 gold.
        //
        // The audit's ruling: "Panel 5 is the Ridge Helm at 190 and there is no
        // ridge in it", and the prescription with it — a fore-and-aft comb
        // standing 35 to 45 mm above the crown FOR ITS WHOLE LENGTH, so that it
        // is five pixels of broken outline at fight distance instead of a two
        // pixel smudge. The old crest could not do that at any height, because
        // its width went to zero exactly where the height was needed.
        //
        // 40 mm proud and 24 mm across, held flat from the nape to the brow and
        // rolled off only in the last tenth at each end. From the side it breaks
        // the outline along the whole cap; head-on it is a 24 mm bar standing
        // above the dome; from behind it runs down the occiput. Three bearings,
        // one object, and nothing else in the shop under 380 gold has that.
        const flat = (t: number) => smooth(0, 0.11, t) * smooth(0, 0.11, 1 - t);
        p.add(comb(-1.30, 1.24,
          (t) => 0.040 * mix(0.18, 1, flat(t)),
          (t) => 0.012 * mix(0.45, 1, flat(t)),
          0.006), trimMetal, place.clone());
      }
      if (style.crown === "boar") {
        // Benty Grange: a boar standing the length of the crown. This is the one
        // helmet in the set whose silhouette changes from *every* bearing —
        // 102 mm of animal along the skull from the side, a snout thrown 60 mm
        // past the bowl from the front, a ridged back from behind — which is what
        // 380 gold has to buy at a tier where the neighbours differ by a bar and a
        // plate. It is bronze rather than steel because a figure is cast and a
        // helmet is beaten, and the two substances say so.
        // Sunk into the bowl rather than perched on it — but sunk into THIS bowl.
        // It stood at `skullY + R.y + 0.030`, which is a height above the SKULL,
        // and the bowls now differ by 20 mm between rungs; on the `round` profile
        // that put the animal's belly inside the cap and the ladder test caught it
        // immediately, at 0.8% of outline between the 280 and the 380. Measured
        // off the bowl's own crown it keeps the 14 mm of sink that stops it
        // reading as parked, on every rung and every class.
        const boarSeat = onForm(0, Math.PI / 2, crest + 0.014);
        const by = skullY + boarSeat.y;
        p.add(ball(0.032, 8), brass, xf(0, by, -0.006, 0, 0, 0, 0.50, 0.62, 1.75));
        p.add(ball(0.019, 7), brass, xf(0, by - 0.006, 0.066, -0.20, 0, 0, 0.62, 0.72, 1.15));
        // The dorsal ridge, in the helmet's bright metal so the animal's back
        // catches the key and its flank does not — a bronze lump on a bronze
        // helmet is a lump, and the ridge is what makes it read as a spine.
        p.add(box(0.005, 0.015, 0.062), trimMetal, xf(0, by + 0.013, -0.012));
        if (lod.trim) {
          for (const s of [-1, 1]) {
            p.add(rod(0.0007, 0.0032, 0.019, 4), trimMetal,
              xf(s * 0.0085, by - 0.012, 0.082, -1.05, 0, -s * 0.30));
          }
          for (const s of [-1, 1]) p.add(ball(0.0028, 5), dark, xf(s * 0.0092, by + 0.002, 0.055));
        }
      }
      if (style.crown === "wyrm") {
        // A SERPENT ARCHED OVER THE CROWN, with its head thrown out past the brow.
        //
        // Two rulings from `docs/COSMETICS-AUDIT.md` 3, and both are arithmetic
        // rather than taste. First: the old lift was
        // `0.006 + 0.052 * sin(pi * clamp01(v * 0.84 + 0.10))^0.55`, whose
        // argument saturates at v ~ 1.07 — so the sine is ZERO at the crown and
        // the animal's rise peaked low on the flank of the bowl and died to 6 mm
        // where it was supposed to arch. The shop text promised an arch and the
        // geometry delivered a bulge on the side of the cap. Second: at 8 mm of
        // section carrying 56 mm of rise it was a wire, not a snake — and, as the
        // comb block above records, a wire that measured a quarter inverted.
        //
        // It is now the tallest thing in the shop and it holds its height where
        // the eye is: 52 mm above the bowl at the crown, never under 34 along
        // either flank, and 20 to 30 mm of body across the whole run so the arch
        // reads as an animal rather than as a strap. The body is fattest toward
        // the head and tapers to the tail, which is the one asymmetry that says
        // which end is which at fight distance.
        p.add(comb(-1.34, 1.30,
          // Monotonic to the crown from BOTH ends, which is what the ridge helm's
          // crest already did and what this one was measured failing to do.
          (t) => 0.052 - 0.018 * Math.pow(Math.abs(mix(-1, 1, t)), 1.4),
          (t) => 0.010 + 0.005 * Math.pow(clamp01(t), 0.7),
          0.007), trimMetal, place.clone());
        // THE HEAD, thrown clear of the brow. The audit asks for 40 mm past the
        // brow line "so it breaks the outline from the front as well as the
        // side", and that is the number: the snout sits on the comb's front
        // terminal and is carried forward in +z, not merely lifted, because a
        // lift on the brow is inside the head's own outline from head-on and
        // buys nothing at all from the one bearing a duel is fought at.
        const hv = bandLo - 0.02;
        const hd = onForm(0, hv, bowlUnder(Math.PI / 2 - hv) + 0.030);
        const hx = hd.x;
        const hy = skullY + hd.y + 0.006;
        const hz = hd.z + 0.030;
        p.add(ball(0.021, 8), trimMetal, xf(hx, hy, hz, 0.30, 0, 0, 0.78, 0.82, 1.45));
        p.add(ball(0.012, 7), trimMetal, xf(hx, hy - 0.017, hz + 0.026, 0.50, 0, 0, 0.62, 0.58, 1.35));
        if (lod.trim) {
          for (const s of [-1, 1]) {
            p.add(rod(0.0009, 0.0038, 0.030, 4), brass,
              xf(hx + s * 0.011, hy + 0.016, hz - 0.010, -0.72, 0, -s * 0.42));
            p.add(ball(0.0034, 5), dark, xf(hx + s * 0.0092, hy + 0.004, hz + 0.014));
          }
        }
      }
      if (style.mask) {
        // ==========================================================
        // THE SUTTON HOO HELM — the face mask and its fittings
        // ==========================================================
        //
        // Four features make this helmet this helmet, and they are built in the
        // order they depend on each other: the silver field with two openings cut
        // in it, the gilded eyebrows over the openings, the nose-and-moustache
        // between and below them, and the crest that comes over the crown and
        // lands on the nose piece's top. Take any one out and it stops being the
        // artefact and starts being a face plate.
        //
        // WHERE THE OPENINGS GO, and this is the whole risk in the piece.
        // `eyeFrame` sites each globe at azimuth `0.355 · F.eyeU` and latitude
        // `lat(Y_EYE) + F.eyeV`, both drawn off the per-warrior seed; `F.eyeV`
        // alone is ±0.035 rad, which is ±8 mm on this skull. The file already
        // carries the story of a helm cut for a brow 30 mm from where the brow
        // was. A mask has *less* tolerance for that than an open helm, not more:
        // an open helm 8 mm out has a slightly wrong brow line, and a mask 8 mm
        // out is a blindfold. So the two lines below are the two lines out of
        // `eyeFrame`, in the same order, off the same traits — not `Y_EYE` and a
        // guess at where the eye ended up.
        const eu = 0.355 * K.F.eyeU;
        const ev = lat(Y_EYE) + K.F.eyeV;
        const uIn = eu - 0.170;
        const uOut = eu + 0.170;
        // 32 mm across and 27 mm tall, closing to a point at both canthi. Square
        // ends would read as two rectangles punched in a plate; this is the one
        // boundary on the helmet a viewer's eye goes to first, and it is the
        // difference between a mask and a letterbox.
        //
        // It shipped at 35 x 22 and that ratio was the letterbox. An aperture
        // three half-heights wide reads as a slot at any distance the game is
        // played at, whatever its ends do; 32 x 27 is 1.6:1, which is what the
        // artefact's openings measure and what stops reading as a visor slit.
        const slot = (u: number) =>
          Math.pow(Math.sin(Math.PI * clamp01((Math.abs(u) - uIn) / (uOut - uIn))), 0.55);
        const openHi = (u: number) => ev + 0.118 * slot(u);
        const openLo = (u: number) => ev - 0.098 * slot(u);
        const maskTop = bandLo + 0.025;
        // How far round the head the plate reaches. 1.16 rad, not 1.00: at 1.00
        // the silver stopped short of the cheekbone's widest point, so the mask
        // was a strip down the middle of a face with skin either side of it and
        // the deep guards standing off *that* — three narrow verticals instead of
        // one broad face. The guards begin at 0.78 on this helm, so the last
        // 0.38 rad is plate behind plate, which is what a hinged guard is.
        const uEdge = 1.16;
        // WHERE THE MASK STOPS, and this is the fault the previous owner flagged
        // and could not close. It ended at `lat(Y_LIP - 0.115)` — below the mouth
        // but well above the menton — and left a lit column of chin and throat
        // hanging under it. That single wedge of skin undoes the entire object:
        // "a man with no face" becomes a man wearing a snorkel, because the eye
        // reads the flesh as the face and the metal as a thing stuck on it.
        //
        // So it now closes on the jaw, and it closes at a latitude that depends on
        // where round the head it is: down to the chin on the centreline, rising
        // as it goes out so the last of it tucks behind the cheek guards rather
        // than fighting them for the same 20 mm. The guards floor at
        // `lat(Y_CHIN + 0.05)` and stand 27 mm out against this 29, so the two
        // still read as hinged over a face and not as one welded bucket.
        const chinV = lat(Y_CHIN + 0.005);
        // THE BROWN GAP IS THIS NUMBER. It was `lat(Y_LIP - 0.055)` — the mask's
        // flank finished at −0.63 rad while the cheek guard floors at −0.84, so
        // between those two latitudes, behind the guard's front edge, there was
        // nothing but skin. From outboard the guard covers it; at profile you look
        // *past* its front edge and straight down that band, and `profile_−90_`
        // shows it as a brown strip a third of the guard's height. Rising the
        // flank edge to keep out of the guard's way was the right instinct and it
        // was taken 20 mm too far: the guard is 27 mm proud of a mask that is 25,
        // so there is no fight for the same air, and metal the guard hides costs
        // nothing. It now finishes at −0.82, inside the guard's floor, and the
        // sightline lands on silver.
        const jawV = lat(Y_LIP - 0.160);
        // The lower edge as a power curve rather than a smoothstep, and that is
        // the whole of "the mask has a wedge-shaped chin". `smooth(0.34, …)` is
        // flat for the first 0.34 rad, so the plate carried a 30 mm horizontal
        // shelf across the centreline and then broke upward — which in profile
        // is a blade with a straight underside and head-on is a V. A chin is a
        // continuous curve from the centreline out. The exponent keeps the fall
        // gentle where the plate is deepest and takes the last of it up quickly
        // behind the cheek guards, which is the only part of this edge nobody
        // sees.
        const maskBot = (u: number) =>
          mix(chinV, jawV, Math.pow(clamp01(Math.abs(u) / 1.02), 1.55));
        // Standoff as a function of LATITUDE, not of the patch's own parameter.
        // Panels that span different ranges of v would otherwise ramp at different
        // rates and the field would step at every seam.
        //
        // 20.5 mm at the chin and 15 at the brow, down from 29 and 22.5, and this
        // number is the root of four separate faults rather than one. Added to
        // the two crown terms below it put the centre of the plate 52 mm out from
        // the face it is beaten over: the profile card shows a snout, the chin
        // shows as a wedge thrown forward of the jaw, every gilt fitting rides
        // that keel and juts with it, and — least obviously and most damagingly —
        // the cheek guard, which is drawn 27 mm off the *unblurred* face and is
        // supposed to hang outboard of the mask, ended up inboard of it. Where a
        // guard laps under instead of over, the plate edges leave a slot, and the
        // slot at profile is the brown gap into the head.
        //
        // A face mask is a thin thing worn close. The clearance that has to exist
        // is over the real nose, and it is much larger than it looks: `shell`
        // lifts off the *low-passed* field, which already carries most of the
        // nose's own projection, so what the standoff has to clear is only the
        // part of the nose the blur threw away. At 15 mm that is still upwards of
        // 15 mm of air on every seed the traits reach.
        const maskLift = (v: number) => mix(0.0205, 0.0150, smooth(chinV, maskTop, v));
        // THE MASK IS A FORMED PLATE, NOT A SKIN, and this is what made it read as
        // folded low-poly card. Everything else on this head is lifted straight off
        // `faceSurface`, which is right for hair, paint and a nasal bar — they lie
        // on the face. But that field carries the nasal dorsum, the orbital
        // margins, the lip line, the mental protuberance and the buccal hollows,
        // so a sheet drawn through it inherits every crease the face has and none
        // of the curvature a beaten plate has. Hence: low-pass the field over about
        // ±0.09 rad before lifting. The average keeps the skull the mask has to
        // fit — a wide head still gets a wide mask — and loses the features it must
        // not copy, which leaves one continuous surface for the fire key to travel
        // across. `crownU` then adds the smith's own doming back, greatest on the
        // centreline and gone by the flanks.
        //
        // Nine taps, at build time only, on a geometry the cache keeps. It costs
        // nothing anybody can measure and it is the difference between a mask and
        // a paper bag.
        // ±0.13 rad, which is about 12 mm on this skull, over two rings. One ring
        // at ±0.09 left the nasolabial fold and the buccal hollow legible as two
        // creases running from the nose wing to the jaw — soft, but a *face* under
        // silver rather than a plate over one, and at that point the mask is a
        // death-mask cast off the man instead of a thing beaten over a form. The
        // widest feature the field carries is the zygomatic, and 12 mm clears it.
        const BLUR: Array<[number, number, number]> = [
          [0, 0, 1.0],
          [0.07, 0, 0.70], [-0.07, 0, 0.70], [0, 0.07, 0.70], [0, -0.07, 0.70],
          [0.05, 0.05, 0.42], [-0.05, 0.05, 0.42],
          [0.05, -0.05, 0.42], [-0.05, -0.05, 0.42],
          [0.13, 0, 0.34], [-0.13, 0, 0.34], [0, 0.13, 0.34], [0, -0.13, 0.34],
          [0.095, 0.095, 0.22], [-0.095, 0.095, 0.22],
          [0.095, -0.095, 0.22], [-0.095, -0.095, 0.22],
        ];
        const _bp = new THREE.Vector3();
        const _bn = new THREE.Vector3();
        // The smith's doming, and it is now in BOTH directions.
        //
        // Across the width it was a cosine peaking on the centreline, which is
        // convex — but at an exponent of 1.4 almost all of the curvature is spent
        // in the last third, so the middle 60% of each cheek was very nearly
        // planar and read as one flat facet with a single shading ramp across it.
        // Exponent 1.0 spreads the same 10 mm over the whole span, and 13 mm
        // rather than 10 because the mask is 260 mm wide and 10 mm of rise on that
        // is a 2% sagitta — flatter than any hand-raised plate.
        //
        // Down the height there was nothing at all, so the plate inherited the
        // low-passed face's own near-straight vertical section. A raised plate is
        // convex everywhere or it is a sheet of card: 6 mm of belly, greatest over
        // the cheekbone and gone at both the brow and the chin where the plate is
        // turning under anyway.
        //
        // Both terms up again — 17 mm across and 10 down — because a third review
        // has come back calling this plate faceted. Curvature is what makes the
        // difference between reading a surface and reading its polygons: the eye
        // finds a facet by the *discontinuity* between two shading ramps, and on a
        // barely-curved plate every ramp is nearly identical, so the only thing
        // left to see is where they change. Bending the sheet harder gives each
        // span its own ramp and buries the joins between them.
        //
        // The curvature is KEPT and the standoff it was riding on has gone (see
        // `maskLift`), because those are two different properties that this file
        // has twice moved together. What buries a facet is the second derivative;
        // what throws a snout is the value. 14 mm of rise across a 260 mm span is
        // a 2.7% sagitta and still a hand-raised plate.
        //
        // The vertical term's peak has moved up. It sat at half the plate's height
        // — which is the mouth — so the forward-most point of the whole helmet was
        // level with the lip, and a head whose belly is at the mouth is a muzzle
        // however smooth it is. The exponent puts the crown of the curve at 60% of
        // the way up, over the cheekbone and the nose, and lets it fall away at
        // the chin: forward at the eye line, receding under the jaw, which is the
        // section a face has.
        const crownU = (u: number) =>
          0.014 * Math.cos(clamp01(Math.abs(u) / uEdge) * Math.PI * 0.5);
        const crownV = (v: number) =>
          0.0085 * Math.sin(Math.PI * Math.pow(clamp01((v - chinV) / (maskTop - chinV)), 1.35));
        /** The mask's own surface: the head's shape, none of its features. */
        const shell = (u: number, v: number, off: number, out: THREE.Vector3) => {
          out.set(0, 0, 0);
          _n.set(0, 0, 0);
          let w = 0;
          for (const [du, dv, k] of BLUR) {
            dirOf(u + du, v + dv, _d);
            faceSurface(K, _d, _bp);
            faceNormal(K, _d, _bn);
            out.addScaledVector(_bp, k);
            _n.addScaledVector(_bn, k);
            w += k;
          }
          out.multiplyScalar(1 / w);
          _n.normalize();
          out.addScaledVector(_n, off + crownU(u) + crownV(v));
        };
        /** A point on the mask's shell, for the fittings that ride on it. */
        const onMask = (u: number, v: number, off: number): THREE.Vector3 => {
          const out = new THREE.Vector3();
          shell(u, v, maskLift(v) + off, out);
          return out;
        };
        // Everything on this mask — field, brows, nose, moustache — is swept
        // through `shell` and nothing through `headWear`, because a fitting drawn
        // on the face's field and riveted to a plate drawn on the mask's would sit
        // wherever the two disagree, which over the nose is 6 mm of float.
        // `thick` may be a function, and that is not a flourish. `patch` closes
        // every v-boundary with a rim strip as tall as the sheet, whose normal
        // points along the surface — so a 7.5 mm plate ending anywhere visible
        // draws a 7.5 mm band in a different value. On a cut edge that is right;
        // it is what a hole punched in foil looks like. On the join between two
        // sheets of the SAME plate it is a hairline ruled across the face, and no
        // amount of lapping hides it because the strip belongs to the sheet in
        // front. Letting the gauge fall off at a boundary feathers the strip out
        // of existence instead.
        const onShell = (
          u0: number, u1: number,
          v0: (u: number) => number, v1: (u: number) => number,
          nu: number, nv: number,
          lift: (u: number, v: number, s: number) => number,
          thick: number | ((u: number, s: number) => number),
          mat: THREE.Material,
        ) => {
          const gauge = typeof thick === "number" ? () => thick : thick;
          const surf = (t: number, s: number, back: boolean, out: THREE.Vector3) => {
            const u = mix(u0, u1, t);
            const v = mix(v0(u), v1(u), s);
            shell(u, v, lift(u, v, s) - (back ? gauge(u, s) : 0), out);
          };
          p.add(patch({
            nu, nv,
            outer: (t, s, out) => surf(t, s, false, out),
            inner: (t, s, out) => surf(t, s, true, out),
          }), mat, place.clone());
        };
        // TWO panels, not seven. `slot` is zero outside the eye zone, so `openHi`
        // and `openLo` both collapse onto `ev` there and the upper and lower
        // plates meet edge to edge down the middle of the face and again out past
        // the canthi — leaving exactly two holes in what is otherwise one sheet.
        // The seven-panel build left six vertical seams across the face, each one
        // a shading discontinuity in the largest unbroken area of metal in the
        // portrait framing. These two have one horizontal join, and it runs along
        // the eye line where the openings and the brows are already breaking the
        // surface up.
        //
        // Where they meet away from the openings they OVERLAP rather than abut.
        // `patch` closes each v-boundary with a rim strip whose normal points
        // along the sheet, so two edges meeting flush put two 7.5 mm rims nose to
        // nose and draw a bright line straight across both cheeks at eye level —
        // visible in the first capture of this pass, and the same defect the brows
        // and the cloak hem are already written around. Lapping the lower plate
        // 15 mm up behind the upper one, and dropping its lift by 1.8 mm as it
        // goes, puts the join under metal where it belongs. The lap is taken to
        // nothing as the opening opens, so nothing intrudes into the aperture.
        const lapped = (u: number) => {
          const lap = 1 - clamp01(slot(u) * 3);
          return openLo(u) + 0.015 * lap;
        };
        // Spans off the LOD, because these two sheets are now the largest thing on
        // the head and a phone should not buy the portrait's tessellation to see a
        // helmet across an arena. 26 at high, 18 at medium, 14 at low.
        // 34/22/16 across and 7/9 down, up from 26 and 4/5.
        //
        // The review found "hard planar breaks: a full-height vertical crease down
        // the viewer's left of the mask, its mirror at the other side, a chevron
        // fold across the chin, and each cheek reading as one flat plane" — and
        // called them tessellation rather than shading, which is right and is
        // checkable: the creases sit exactly on span boundaries. Four spans down a
        // 130 mm plate is a 32 mm facet, and a facet that size on a surface with
        // 10 mm of crown across it *is* a fold. The low-pass took the face's
        // creases out and this is the other half of the same job — a surface can
        // only be as smooth as the number of quads it is made of. It is the
        // largest object on the head and it is the one that has to read as beaten,
        // so it gets the spans. Costs about 480 triangles at high, scaled at the
        // tiers that cannot afford them.
        //
        // 40 across and 10 down at high, and this is the last time spans are
        // spent on this problem: past here the facets are below the pixel and
        // anything still reading as a plane is the crown terms' fault, not the
        // grid's. The lower sheet keeps its two extra rows because it carries the
        // chin, where the surface turns hardest.
        const maskU = Math.max(16, Math.round(lod.shellU * 2.4) + 6);
        const maskV = lod.trim ? 10 : 4;
        // The upper sheet's lower boundary does two jobs and needs two gauges. Over
        // the openings it is a CUT EDGE and keeps the full 7.5 mm, because the
        // thickness of the plate at the rim of the hole is one of the few places
        // this helmet gets to say it is made of metal at all. Everywhere else the
        // same boundary is the JOIN with the lower sheet, and there it feathers to
        // a millimetre — which is the fix for the dark hairline ruled straight
        // across both cheeks at eye level in every card of the last three
        // turntables. The lap was already right; the rim strip on top of it was
        // what was drawing.
        // THE PLATE TUCKS AWAY AT ITS OUTER EDGE, and this is the other half of
        // the brown gap at profile. Two plates that overlap in `u` still leave a
        // slot if the outer one is the one underneath: the cheek guard is drawn
        // 27 mm off the face and the mask's flanks have to finish inside that or
        // the guard hangs behind the thing it is meant to cover. Taking 6 mm out
        // of the last 0.44 rad puts the mask under the guard by construction, and
        // it is also what a mask does — the plate turns in to the face at its
        // edge so the hinged guard can sit down on it. Nothing else rides out
        // here: the brows finish at 0.64 rad and the sockets at 0.58.
        const tuck = (u: number) => 0.006 * smooth(0.72, uEdge, Math.abs(u));
        // The gauge falls off with it. A 7.5 mm cut edge is right at the eye
        // openings, where the thickness of the plate is one of the few places
        // this helmet says it is made of metal — and wrong at the outer edge,
        // where it draws a bright 7.5 mm rail down the side of the face that the
        // profile card reads as a fold. Under the guard there is nothing for it
        // to say anyway.
        const flank = (u: number) => 1 - 0.62 * smooth(0.86, uEdge, Math.abs(u));
        onShell(-uEdge, uEdge, openHi, () => maskTop, maskU, maskV,
          (u, v) => maskLift(v) - tuck(u),
          (u, s) => 0.0075 * flank(u) * mix(0.14, 1, Math.max(clamp01(slot(u) * 3), clamp01(s * 5))),
          silver);
        onShell(-uEdge, uEdge, maskBot, lapped, maskU, maskV + 2,
          (u, v, s) => maskLift(v) - tuck(u) - 0.0018 * s * (1 - clamp01(slot(u) * 3)),
          (u) => 0.0075 * flank(u), silver);
        // Black voids behind the openings. This file has spent two passes making
        // sure a helmet is not an empty hole; here the hole is the point, and what
        // has to show through it is an eye in the dark rather than a lit cheekbone
        // 30 mm behind a slot.
        //
        // The flat dark course this replaces sat 3.5 mm off the skin with 20 mm of
        // lit tunnel between it and the mask's inner face, so from anywhere but
        // dead ahead the aperture showed brow, lid and cheek — which is what
        // `art/shots/helm/suttonhoo.png` shows. This is a funnel instead: it meets
        // the mask's inner surface at the rim of the opening and falls away to the
        // socket floor at the centre, so there is no lit surface anywhere inside
        // the aperture at any bearing. The globe still stands 13 mm proud of that
        // floor and still catches its own specular dot, which is the call this
        // helmet needs — the doc asks for black voids and the doc is right about
        // the field, but at the portrait framing a wholly empty socket is the
        // "nobody home" defect the top of this file warns about, and a wet dot in
        // a black hole is a man looking at you. Void first, eye second.
        //
        // ON THE MASK'S SHELL, NOT ON THE FACE'S. This is the fault the review
        // found — "the same skin geometry is visible inside both eye openings as
        // brown shapes hanging in the black" — and it was a field mismatch rather
        // than a shape one. The funnel was swept through `headWear`, which lifts
        // off `faceSurface`; the mask is swept through `shell`, which low-passes
        // that field and then adds up to 19 mm of crown to it. So the funnel's rim
        // was drawn to meet a surface that is not where the mask is, and at the
        // openings — which sit on the crown's high ground — it fell short by most
        // of a centimetre. Through that gap the aperture looked straight out at a
        // lit brow and a lit cheek.
        //
        // Swept through the same `shell`, the rim is solved against the mask's own
        // inner face by construction: it cannot be short at any bearing, on any
        // warrior's skull, however his crown term happens to land.
        for (const s of [-1, 1]) {
          const socket = sideArc(s, uIn - 0.052, uOut + 0.052);
          // 16 spans across, not 10. The rim has to land on the mask's inner face
          // and the mask is now drawn at 40 spans: a coarser funnel chords the
          // aperture the plate curves round, so the two disagree by a fraction of
          // a millimetre in alternating directions and the opening's edge renders
          // as a row of bright silver steps inside the black.
          onShell(socket.u0, socket.u1,
            (u) => openLo(u) - 0.052, (u) => openHi(u) + 0.052,
            16, 5,
            (u, v, q) => {
              const t = clamp01((u - socket.u0) / (socket.u1 - socket.u0));
              const bowlT = Math.sin(Math.PI * t) * Math.sin(Math.PI * q);
              // Rim flush with the mask's inner face (its lift less its 7.5 mm of
              // thickness, plus a shaving so the two do not z-fight), falling to
              // the socket floor at the centre. The globe still stands 13 mm proud
              // of that floor and still catches its own wet dot — void first,
              // eye second, which is the call this helmet needs.
              return mix(maskLift(v) - 0.0069, 0.0035, Math.pow(bowlT, 0.55));
            },
            0.0012, dark);
        }

        // ---- the gilded eyebrows ----
        //
        // Thick, tapering outward, each ending in a boar's head, each set with a
        // line of garnet down its length. In the owner's reference badge they are
        // the two heavy gold arcs, and they earn that weight: they are the only
        // horizontal in the composition and they are what turns two holes into a
        // face rather than a colander.
        //
        // THEY ARE ARCS, AND THE LAST BUILD DREW A BAR. Both edges were a constant
        // latitude plus a monotone ramp outward, and a constant latitude near the
        // equator of a head projects, from the front, as a dead straight
        // horizontal — so the two fittings and the nose crossing between them read
        // as one rule ruled across the face. That costs the whole figure: these
        // are the bird's WINGS, and nothing swept and level is a wing. It also
        // costs the artefact, whose brows sit down on the eye and arch over it.
        //
        // So the lower edge is now the aperture's own upper edge plus a clearance:
        // `slot` is the curve that opens the eye, so borrowing it makes the brow
        // ride the socket by construction on every warrior's skull, however his
        // seed sites the openings. It comes down at the nose, arches ~9 mm over
        // the middle of the eye, and lands again at the temple where the boar's
        // head takes over. The small linear term is the sweep — the outer end
        // finishes above the inner one, which is what makes two arcs read as a
        // pair of wings rather than as a pair of brackets.
        const browIn = uIn - 0.045;
        const browEnd = uOut + 0.115;
        const along = (u: number) => clamp01((Math.abs(u) - browIn) / (browEnd - browIn));
        // THE SWEEP IS THE WING, and the linear term that used to carry it was
        // worth 1.9 mm. Over a fitting 46 mm long that is a rounding error: what
        // the front card showed was a shape that came up over the eye and went
        // straight back down to the height it started at, and two of those with a
        // nose crossing between them is one horizontal rule across the face — the
        // bar the review named. A wing's outer end finishes ABOVE its root. 5.8 mm
        // of rise at the boar, on a curve that spends none of it at the nose and
        // most of it past the eye, is what makes the pair sweep out and up instead
        // of bracketing the openings.
        //
        // And the inner end comes down 1.7 mm onto the socket. The arc is read
        // against the eye it arches over, not against the plate, so lowering the
        // root and raising the tip buys twice what raising the tip alone does.
        // The clearance over the aperture bottoms out at 22 mrad — 2 mm of silver
        // between gold and black, which is the artefact's own margin and is what
        // stops the brow reading as the edge of the hole.
        const browLo = (u: number) =>
          ev + 0.052 + 0.094 * slot(u) + 0.072 * Math.pow(along(u), 1.6);
        // And it tapers. A band of constant height is a strap; the fitting on the
        // object is deepest where it leaves the nose and thins to nothing at the
        // boar, which is also what lets the boar read as a terminal rather than as
        // a bead stuck on the end of a rail. 10 mm down to 3.4.
        const browHi = (u: number) =>
          browLo(u) + 0.094 * (1 - 0.66 * Math.pow(along(u), 1.25));
        // Relief on the fitting, taken to nothing on all four boundaries. Every
        // rim strip a `patch` closes with points its normal *along* the sheet, so
        // a fitting that ends at full lift draws its own outline in a different
        // value — the defect logged against the beard, the war paint and the cloak
        // hem, and the last thing this face needs is a bright wire round the one
        // shape that is supposed to be soft gold.
        const relief = (t: number, s: number, peak: number) =>
          peak * Math.pow(Math.sin(Math.PI * clamp01(t)), 0.40)
          * Math.pow(Math.sin(Math.PI * clamp01(s)), 0.45);
        for (const s of [-1, 1]) {
          const b = sideArc(s, browIn, browEnd);
          // 3.8 mm proud on a 3.2 mm sheet, down from 5 on 4. Every fitting on
          // this face was standing too far off it — see the nose below, which is
          // the extreme case — and the brows are read against 130 mm of flat
          // silver, so a couple of millimetres of relief is already a shadow the
          // eye can find. What makes a fitting read as applied is its outline and
          // its own highlight, not its height. The gauge matters as much as the
          // relief and is easier to miss: the sheet's own thickness is what the
          // rim strips draw, so a 4 mm fitting with 5 mm of relief is a 9 mm bar
          // in silhouette whatever the relief curve does.
          // 2.8 mm on a 2.4 mm sheet, down from 3.8 on 3.2. See the nose: every
          // gilt fitting on this face is going down a third this pass, because
          // the fault they share is standoff and not outline. A brow that reads
          // as a wing reads by the curve of its edges.
          onShell(b.u0, b.u1, browLo, browHi, Math.max(10, lod.shellU + 4), 3,
            (u, v, t) => maskLift(v) + relief(along(u), t, 0.0028), 0.0024, gilt);
          if (lod.trim) {
            // The garnets, as cabochons rather than as a strip. A 3 mm rail would
            // have to end in rim strips 3 mm wide standing on gilt, which is
            // exactly the width that stipples; a cell has no rim at all. It is also
            // what the object is — cloisonné is discrete cells, not a line of paint.
            //
            // Five, not seven, and each one 40% wider. Seven 3.6 mm balls at six
            // segments along an eyebrow is a row of faceted specks: each facet
            // returns a different sample of the fire, so the line read as sparkle
            // rather than as stones, and it was half of what made the gilt look
            // like glitter. Five 5 mm cells at ten segments hold a single highlight
            // each, which is what a polished cabochon does.
            // The run stops at 0.72 rather than 0.85 along: the band is now 4 mm
            // deep at the boar's end and a 4 mm cell there would stand out past
            // both its edges, which is a stud on a wire rather than a cell in a
            // setting. Cloisonné goes where there is metal to cut a cell into.
            for (let i = 0; i < 5; i++) {
              const t = 0.12 + (i / 4) * 0.60;
              const u = s * mix(browIn, browEnd, t);
              const v = mix(browLo(u), browHi(u), 0.5);
              const q = onMask(u, v, relief(t, 0.5, 0.0028) + 0.0008);
              p.add(ball(0.0034, 10), garnet, xf(q.x, skullY + q.y, q.z, 0, 0, 0, 1.0, 0.58, 0.85));
            }
            // The boar's head each eyebrow ends in. Two solids and a pair of
            // tusks: at the size this is seen it is a snout that overhangs the
            // temple, and everything finer than that is spent on nothing.
            //
            // Sized to the band it terminates rather than to the head it is on. At
            // 10.5 mm scaled 1.45 the snout was a 30 mm gold pod at each temple —
            // bigger than the brow it finished and, in the turntable, a second pair
            // of lumps competing with the nose. A terminal is read by being *on the
            // end of something*, so it is a shade wider than the band and no more,
            // and the band it now terminates is 3.4 mm deep rather than 4.
            const bu = s * (browEnd - 0.012);
            const bv = mix(browLo(bu), browHi(bu), 0.45);
            const q = onMask(bu, bv, 0.0028);
            p.add(ball(0.0046, 7), gilt,
              xf(q.x, skullY + q.y, q.z, 0, s * 0.55, 0, 1.35, 0.95, 0.90));
            p.add(ball(0.0025, 6), gilt,
              xf(q.x + s * 0.0046, skullY + q.y - 0.0020, q.z - 0.0015, 0, s * 0.55, 0, 1.2, 0.85, 0.9));
            // Tusks. 0.5 mm at the root over 10 mm of length is a hair, and the
            // review found them as exactly that: "hair-thin whisker slivers off
            // both eyebrow terminals". A sliver one pixel wide is not a small
            // detail, it is an artifact — it aliases, it catches the key at full
            // value, and it has no shape to lose. Shorter and three times as
            // thick, so what is there reads as a tusk or is not there at all.
            for (const t of [-1, 1]) {
              p.add(rod(0.0009, 0.0017, 0.0042, 5), gilt,
                xf(q.x + s * 0.0056, skullY + q.y + t * 0.0015, q.z + 0.0021, 0, 0, s * 1.15));
            }
          }
        }

        // ---- the nose-and-moustache piece ----
        //
        // The trick the object is famous for, and it is an arrangement rather than
        // a shape: nose as a body, moustache spread wide beneath it as a tail,
        // eyebrows sweeping out and up either side as wings — a bird in flight —
        // and the same three read the other way up as a dragon's head, the nose
        // becoming a long snout between two brows. Neither read survives flattening
        // this into a nasal bar, which is why the plain nasal is switched off for
        // this helmet in `HELM` rather than left on under the mask.
        //
        // What makes it work geometrically: the nose runs *above* the eyebrows'
        // inner ends and continues below them, so the three pieces cross rather
        // than abut, and the moustache is wider than the eyebrows are long.
        //
        // THE FAULT THE LAST PASS INTRODUCED, because it is worth naming before
        // the numbers. Sent to close a 14 mm band of bare silver between nose and
        // moustache, it welded them: the nose was run 30 mrad past the moustache's
        // top edge at 9.2 mm of relief, and the moustache's own relief was keyed
        // off `1 − mT^2.4` fed into a term that peaks at a half — so the tail was
        // FLAT on the centreline and stood 8 mm proud at three-quarters of its
        // span. A tall ridge coming down into a hollow with two horns either side
        // is not a bird; it is a bill. At −45° and −90° it juts off the face and
        // it is the first thing in the frame.
        //
        // Both halves are fixed here, and the principle behind both is the one
        // the whole helmet keeps getting wrong: the fittings on the artefact lie
        // CLOSE to a smooth face. Depth is not what makes them read — outline is.
        //
        // The moustache, and it is ONE form: a single broad sheet the full 88 mm
        // across, at nearly full depth out to two thirds of its span, with a
        // shallow notch under the philtrum instead of a gap. Its relief now peaks
        // on the centreline and dies at both tips, which is what a mass with a
        // parting drawn on it looks like — and it is 3 mm rather than 8, so it is
        // broad and flat where it used to be lumpy.
        // AND IT IS A THIN ONE, WHICH IS WHY IT READS AS A HORN. Measured against
        // the object: the tail is about as deep as an eye opening is tall, half
        // again. This was 0.165 rad deep against an opening of 0.216 — three
        // quarters — so a shape 88 mm wide had 20 mm of substance in it, and a
        // long thin thing that tapers and falls away at the ends is a tusk however
        // flat it lies. `profile_−90_` and `three-quarter_−45_` both show exactly
        // that: a gold horn on the cheek, and the nose above it finishes the bill.
        // It now spans the whole mouth — top edge just under the nose's foot,
        // bottom well below the lip, because the artefact's moustache covers the
        // mouth entirely and there is no opening under it.
        const mTop = lat(Y_NOSE - 0.020);
        const mBot = lat(Y_LIP - 0.055);
        const mMid = (mTop + mBot) * 0.5;
        const mHalf = (mTop - mBot) * 0.5;
        const mSpan = 0.450;
        const mT = (u: number) => clamp01(Math.abs(u) / mSpan);
        // Keeps 28% of its depth at the tips rather than closing to a point. A
        // moustache that comes to nothing at both ends is a pair of horns; one
        // that keeps a hem is a tail, and the tail is what this shape is for.
        // Keeps 55% of its depth at the tips, up from 28. The old hem was 4 mm on
        // a sheet 4.5 mm thick — the tip was deeper than it was tall, which is a
        // ROD, and a rod that sweeps down is the horn the review found. A tail is
        // blunt: the fitting on the object ends in a squared terminal, not a point.
        const leaf = (u: number) => mHalf * (1 - 0.38 * Math.pow(mT(u), 1.9));
        // The droop, and the notch. The centre sits high and level under the nose
        // so the two forms meet in a T that reads at a glance; the ends fall 10 mm
        // below it, which is the drooping the object has and the last build did
        // not. The notch is 2 mm of the lower edge at the centreline — enough to
        // say "parted" from a metre away and not enough to break the mass in two.
        // THE DROOP HAS TO BEAT THE TAPER OR THE SHAPE IS A BRICK, and that is the
        // arithmetic the first cut of this pass got wrong. What the eye reads as
        // drooping is the LOWER edge falling, and the lower edge is
        // `droop − leaf`: taper the depth by as much as the centreline falls and
        // the two cancel, so the underside comes out dead level and the fitting
        // renders as a rectangular bib across the mouth — which is what the front
        // card showed. 105 mrad of fall against 54 of taper drops the underside
        // 51 and the top edge 159, so the mass is deepest under the nose and the
        // ends hang below it. That is a tail.
        const droop = (u: number) =>
          mMid - 0.105 * Math.pow(mT(u), 1.7) - 0.014 * Math.pow(1 - smooth(0, 0.055, Math.abs(u)), 2);
        const mLip = (u: number) => droop(u) + leaf(u);
        onShell(-mSpan, mSpan,
          (u) => droop(u) - leaf(u), mLip, Math.max(14, lod.shellU + 12), 5,
          (u, v, t) => maskLift(v) + relief(0.5 + 0.5 * (u / mSpan), t, 0.0020),
          0.0026, gilt);
        // The nose, drawn AFTER the moustache and solved against it.
        //
        // ITS OUTLINE IS THE POINT, NOT ITS HEIGHT. The outline is carried by the
        // patch's own v-bounds rather than by a fade in the relief, so the sheet
        // exists exactly where the fitting is and lies flush with the mask
        // everywhere it is not — a shape with a real edge does not need to stand
        // proud to be read.
        //
        // The shape is a nose and not a wedge, and the difference is the whole
        // complaint. Straight-sided from bridge to about two thirds down at 14 mm
        // across, then flaring to 27 mm at the alae — which is a cubic in the
        // half-width, inverted here because the sweep is parameterised across the
        // fitting rather than along it. Ramping the width evenly from apex to base
        // instead gives a triangle, and a gold triangle down the middle of a face
        // is a bill however flat it lies. Measured against the artefact: bridge
        // 15 mm, alae 34 — this is a shade narrower on purpose, because the mask
        // around it is a rendered 130 mm rather than a real 200.
        //
        // Length off the eye line rather than off `Y_BROW`, and shorter by 40 mm.
        // The brows are keyed to `ev` now, so keying the nose to `Y_BROW` let the
        // two drift apart on a warrior whose seed sites his eyes low: the nose ran
        // up past the brow arcs to the cap band, and a 75 mm nose on a 130 mm face
        // is the single biggest thing in the frame. It now finishes just above the
        // brows' inner ends, which is where the bird's head sits and where the
        // artefact's own nose piece stops.
        //
        // 2.6 mm proud, down from 9.2. The relief's own taper takes it to nothing
        // at the foot, so the body sinks into the tail rather than standing over
        // it, and the tail stays the wider, flatter, separate form it has to be.
        //
        // AND IT IS STILL 40% TOO LONG, which is the last of the beak. The anchor
        // moved to the eye line last pass and the LENGTH did not: `ev + 0.205`
        // down to the moustache is 0.50 rad on a mask 1.26 rad tall — 39% of the
        // face — and it ran a clear 40 mrad above the brows' own upper edge, so
        // the fitting crossed the wings and then kept going up the plate on its
        // own. On the object the nose is about a quarter of the mask's height and
        // it STOPS at the junction: the bird's head is what is above the brows,
        // not more nose. `browHi(0)` is `ev + 0.146`; this finishes 20 mrad over
        // it, which is enough for the three pieces to cross and not enough to be
        // a keel. With the moustache's new top edge the fitting is now 0.36 rad,
        // 28% of the face, and the outline is a nose rather than a prow.
        const noseTop = ev + 0.166;
        const noseBot = mLip(0) - 0.010;
        const noseHalf = 0.124;
        const noseFlare = (u: number) =>
          Math.cbrt(clamp01((Math.abs(u) - 0.062) / (noseHalf - 0.062)));
        // 1.8 mm proud on a 2.4 mm sheet, down from 2.6 on 4.5. THIS IS THE FAULT
        // ALL THREE FITTINGS SHARE and it is worth stating once: the mask is a
        // dome standing ~40 mm off a blurred face, and anything riding the top of
        // that keel adds its own relief to the most forward point in the frame. On
        // the artefact the nose is a MODEST gilded strip lying on the plate — it is
        // read by its edges and by the shadow they cast, not by its height. Half
        // the standoff and the same outline is the whole of the fix.
        onShell(-noseHalf, noseHalf,
          () => noseBot,
          (u) => mix(noseTop, noseBot, noseFlare(u)),
          12, 9,
          (u, v, t) => maskLift(v) + relief(0.5 + 0.5 * (u / noseHalf), t, 0.0018),
          0.0024, gilt);
        if (lod.trim) {
          // THE BIRD'S HEAD, and the other half of the same complaint: "there is
          // no bird's head at the brow junction — the nasal terminates in a plain
          // rectangular gold tab with two garnets."
          //
          // On the artefact the wings run out from a head, and without one the
          // group is a bar that happens to meet two arcs. Three solids: a cranium
          // where the nose meets the brows, a beak thrown up over the band, and
          // the two garnets moved off the tab and onto the skull as its eyes —
          // which is where the red was always trying to be. Small deliberately: it
          // has to break the tab's straight top edge and read as a head in
          // silhouette, and anything more is spent below a pixel.
          //
          // A third smaller again, because it sits at the top of the one form that
          // was over-built. A 9 mm ball at 9 mm of standoff put 18 mm of solid gold
          // out from the brow — measured against the mask it terminates, that is
          // the biggest single protrusion on the helmet, and it was carrying the
          // beak read as much as the nose was.
          // Down a third again, and the beak now only just breaks the nose's top
          // edge instead of standing 20 mrad clear of it. A 6.4 mm ball at 4.6 mm
          // of standoff was 11 mm of solid gold off the keel at the one latitude
          // the keel is highest — the single biggest protrusion on the helmet, and
          // it was doing as much of the bill read as the nose was. The garnets
          // come down with it: at 7.8 mm they were floating off the skull they are
          // supposed to be set into.
          const hq = onMask(0, noseTop - 0.018, 0.0030);
          p.add(ball(0.0046, 8), gilt,
            xf(hq.x, skullY + hq.y, hq.z, -0.30, 0, 0, 0.82, 1.00, 0.78));
          const bq = onMask(0, noseTop + 0.010, 0.0028);
          p.add(ball(0.0026, 7), gilt,
            xf(bq.x, skullY + bq.y, bq.z, -0.55, 0, 0, 0.66, 1.25, 0.70));
          for (const s of [-1, 1]) {
            const q = onMask(s * 0.026, noseTop - 0.021, 0.0048);
            p.add(ball(0.0022, 10), garnet, xf(q.x, skullY + q.y, q.z, 0, 0, 0, 1, 0.85, 0.75));
          }
        }

        // ---- the ventail: what closes the throat ----
        //
        // The last flesh in the frame, and the review that logged it as
        // "partly fixed" was right to. Closing the mask on the jaw was the right
        // move and it was not enough: at portrait framing there is still ~100 px
        // of brightly lit skin between the mask's lower edge and the mail collar,
        // with a seam down the middle of it, and the eye reads that column as the
        // face — which makes everything above it a thing stuck on rather than a
        // head. It is the single loudest defect left on the most expensive item in
        // the shop.
        //
        // It cannot be closed with more plate. `v` is a latitude on the skull's own
        // sphere and the last 50 mm to the throat is crowded into the pole, which
        // is exactly why the mask stops where it does and why the deep guards do.
        // What actually closes a throat under a face mask is a mail ventail hung
        // off the plate, and mail is a substance this file already has, hangs on
        // rings rather than on latitudes, and reads correctly as cut-out.
        //
        // Swept on rings like the nape fall.
        //
        // TWO NUMBERS DECIDE WHETHER IT WORKS, and the last build had both wrong
        // because it sized the curtain off the throat instead of off the head.
        //
        // How far DOWN. It floored 14 mm clear of `severBody`'s neck seam so a
        // severed head would keep an unsliced ventail — which stopped it 28 mm
        // short of the hauberk's own collar line, and 28 mm of lit neck and linen
        // is precisely the "bare flesh collar" the frame shows at front and
        // three-quarter. That trade is the wrong way round: the mail is looked at
        // in every frame of every match and the severed head is looked at for
        // about a second. So the floor is now solved against the collar the
        // curtain has to land on and it crosses the seam to get there, exactly as
        // the huscarl's coif has always done — a head that comes off wears mail
        // cut at the neck, which is what a head that comes off should look like.
        //
        // How far OUT. The rings were 60–82% of the skull's own half-width, so the
        // curtain was a bib hanging on the throat with its side edges 60 mm inboard
        // of where the cheek guard's lower edge and the nape fall's front edge
        // actually are — and at profile the eye looked straight between them into
        // bare neck. They are now 86–124%, which puts the curtain's surface within
        // a few millimetres of the guard's silhouette edge the moment the guard
        // ends, and inside the coif and the nape fall everywhere the three overlap.
        // Mail laps mail without a seam, which is why this is the piece that gets
        // made generous rather than the plates either side of it.
        {
          const chinPt = new THREE.Vector3();
          shell(0, chinV, maskLift(chinV), chinPt);
          const vTop = skullY + chinPt.y + 0.016;
          const vBot = S.neckRoot - 0.014 - S.neckTop - 0.022;
          // Hung off the mask's own lower edge in z and falling back onto the
          // neck as it drops, so the curtain lies against the throat rather than
          // standing off it as a bib. Wider at the bottom because it lands on the
          // collar, which is where a coif's skirt goes.
          const vRings = [
            { y: vTop, hw: R.x * 0.86, hd: R.z * 0.78, z: chinPt.z * 0.42 },
            { y: mix(vTop, vBot, 0.5), hw: R.x * 1.06, hd: R.z * 0.96, z: chinPt.z * 0.20 },
            { y: vBot, hw: R.x * 1.24, hd: R.z * 1.12, z: -0.010 },
          ];
          const vAt = (u: number, v: number, inset: number, out: THREE.Vector3) => {
            const t = v * (vRings.length - 1);
            const i = Math.min(vRings.length - 2, Math.floor(t));
            const f = t - i;
            const a = vRings[i];
            const b = vRings[i + 1];
            out.set(
              Math.sin(u) * (mix(a.hw, b.hw, f) - inset),
              mix(a.y, b.y, f),
              mix(a.z, b.z, f) + Math.cos(u) * (mix(a.hd, b.hd, f) - inset),
            );
          };
          // u descends so ∂u × ∂v faces out — the same trap the coif and the nape
          // fall are both written around, and a curtain swept the other way
          // renders as a hole in the throat.
          //
          // 2.45 rad, not 1.55: the arc now runs well past the ear on both sides
          // and finishes under the nape fall, which owns everything behind
          // 1.40 rad. Two prior passes widened this by tenths and the profile card
          // kept showing a hole, because the gap was never in the arc — it was in
          // the radius. Both are settled together here: past the ear the curtain
          // is inside the fall's own plate, so the extra sweep costs a few
          // triangles nobody will see and removes the last bearing at which the
          // three pieces can disagree.
          const vHalf = 2.45;
          const vSweep = (inset: number) =>
            (t: number, v: number, out: THREE.Vector3) => vAt(mix(vHalf, -vHalf, t), v, inset, out);
          p.add(patch({
            nu: Math.max(12, lod.shellU + 2), nv: 4,
            outer: vSweep(0), inner: vSweep(0.007),
          }), mail);
        }

        // ---- the crest ----
        //
        // "A crest running front to back over the crown of the cap", which is
        // what the doc asks for and what the last build did not deliver. It was
        // 8 mm wide, it climbed to 48 mm of standoff at the crown pole, and it
        // came to nothing at both ends — so from the front, which is the only
        // bearing the portrait sees, it was a thin antenna standing straight up
        // out of the brow with a red bead on the tip. Two things were wrong:
        // height and section.
        //
        // Height, because a crest is a *ridge* on a cap, not a fin above one. Its
        // standoff is now the bowl's own standoff plus a fixed 13 mm the whole way
        // along, so it travels the length of the skull at a constant proud height
        // and reads from the side as a spine rather than from the front as a
        // spike. Section, because a flat strip lifted off the dome ends in two rim
        // strips whose normals point along the sheet — a bright wire down each
        // side of the crest, which is exactly how you draw an antenna. A
        // semicircular section merges into the bowl at both edges instead, so
        // there is no rim to catch anything, and the round back rolls one
        // continuous highlight the length of the helmet.
        // 74 mm of arc, not 62. The section is already a semicircle; widening it
        // and holding the height is what turns a blade into a tube, and a tube is
        // what the artefact's crest is. It also raises the ratio the eye reads
        // head-on from 1:0.9 to 1:0.7 — wider than it is tall, which is the
        // difference between a ridge on a cap and a fin standing on one.
        const crestHalf = 0.074;
        const crownTop = Math.PI / 2 - 0.02;
        const bowlLo = bandLo + 0.015;
        // The bowl's own surface under the crest, so the ridge sits *on* the cap
        // however domed this warrior's cap is.
        // Written through the bowl's own lift function rather than repeating its
        // curve, which is how this crest came to be riding a formula the bowl had
        // stopped using: the profile is a rung of the ladder now and every rung
        // has a different one.
        const bowlAt = (v: number) =>
          bowlLift(clamp01((v - bowlLo) / (crownTop - bowlLo)));
        // 13 mm proud along the slopes, easing to nothing at the nape and holding
        // most of its height at the brow, where the nose piece takes over from it.
        //
        // And 8 mm over the crown, which is the fix for the last standing half of
        // "the crest is a vertical antenna". The section and the run were right —
        // the profile and three-quarter cards both read it as a ridge — but the
        // pole was still carrying the full 13 mm, and head-on the pole is the one
        // part of a fore-and-aft crest that is *silhouette*. 13 mm there is 6% of
        // head height added straight to the outline as a tapered gold fin, which
        // is exactly what a reviewer looking at a duel sees. Over the crown the
        // ridge is now barely proud and the shape is carried by the width and by
        // the highlight that runs along it, and along the slopes — where a crest
        // is read against the head rather than against the sky — it keeps all of
        // its height.
        const ridgeAt = (v: number, front: boolean) => {
          const run = front
            ? mix(0.72, 1, smooth(bandLo, bandLo + 0.38, v))
            : smooth(bandLo - 0.44, bandLo - 0.02, v);
          return 0.0132 * run * (1 - 0.40 * smooth(crownTop - 0.34, crownTop, v));
        };
        /** `du` is the signed offset from the crest's own centreline, in radians. */
        const crestLift = (du: number, v: number, front: boolean) => {
          const x = clamp01(Math.abs(du) / crestHalf);
          return bowlAt(v) + ridgeAt(v, front) * Math.sqrt(Math.max(0, 1 - x * x));
        };
        for (const u of [0, Math.PI]) {
          const front = u === 0;
          const v0 = front ? bandLo : bandLo - 0.44;
          p.add(helmWear(K, {
            tag: "sutton crest",
            u0: u - crestHalf, u1: u + crestHalf,
            v0: () => v0, v1: () => crownTop,
            nu: 6, nv: Math.max(5, lod.shellV + 1),
            lift: (x, t) => crestLift(x - u, mix(v0, crownTop, t), front),
            thick: 0.006,
          }), gilt, place.clone());
        }
        if (lod.trim) {
          // Garnet down the spine of the crest. Five cells over the crown, which
          // is where the key at 60° actually lands — the one place on the helmet
          // a dark red reads as glass rather than as a hole.
          //
          // Stopped 0.24 rad short of the pole rather than 0.10. A cell on the
          // apex is a finial, and a finial on a fin is a mast: the review named
          // "a tapered gold fin rising clear above the dome silhouette with a
          // garnet finial on its tip" as one object, and the tip is half of it.
          for (let i = 0; i < 5; i++) {
            const v = mix(bandHi, crownTop - 0.24, i / 4);
            const q = onForm(0, v, crestLift(0, v, true) + 0.0030);
            p.add(ball(0.0040, 10), garnet, xf(q.x, skullY + q.y, q.z, 0, 0, 0, 0.80, 1, 0.85));
          }
          // THE TERMINALS. "Both ends are cut flat; there are no dragon-head
          // terminals" — and a crest that ends in a cut is a strip of tape. On the
          // artefact each end of the tube finishes in a gilt beast's head, and
          // they are what tell a viewer the ridge is an animal lying along the cap
          // rather than a weld line. Two solids and a pair of garnet eyes each,
          // which is the same budget the wyrm's head and the boar's are built on
          // and for the same reason: at the size a helmet is read from, a snout
          // that clears the ridge is the whole shape.
          for (const end of [
            { u: 0, v: bandLo + 0.055, tilt: 0.85, front: true },
            { u: Math.PI, v: bandLo - 0.395, tilt: -0.75, front: false },
          ]) {
            const base = crestLift(0, end.v, end.front);
            const q = onForm(end.u, end.v, base + 0.0030);
            const sgn = end.front ? 1 : -1;
            p.add(ball(0.0102, 8), gilt,
              xf(q.x, skullY + q.y, q.z, end.tilt, 0, 0, 0.72, 0.80, 1.30));
            const s2 = onForm(end.u, end.v - sgn * 0.052, base + 0.0018);
            p.add(ball(0.0058, 7), gilt,
              xf(s2.x, skullY + s2.y, s2.z, end.tilt, 0, 0, 0.60, 0.62, 1.15));
            for (const t of [-1, 1]) {
              const e = onForm(end.u + t * 0.052, end.v - sgn * 0.012, base + 0.0072);
              p.add(ball(0.0026, 8), garnet, xf(e.x, skullY + e.y, e.z));
            }
          }
        }
      }
      // The class's own crest and fall give way to the helmet's when the helmet
      // has one. A warden in a boar-crest helm was getting the boar *and* his
      // steel comb on the same 110 mm of crown, and a ridge helm's fall landed on
      // top of his flange. The circlet is exempt on purpose: it is a hoop round
      // the bowl, not a spine along it, and the two have always coexisted.
      const ownCrest = style.crown !== "none" && style.crown !== "circlet";
      if (lamellar && !ownCrest) {
        // Fore-and-aft comb, raised. The warden's one unmistakable outline cue,
        // and at 30 mm it was inside the bowl's own dome — a ridge on a helmet,
        // not a shape in a silhouette. 52 mm puts a hard vertical fin above the
        // skull that no other class on the roster has.
        for (const u of [0, Math.PI]) {
          p.add(headWear(K, {
            u0: u - 0.055, u1: u + 0.055,
            v0: () => bandHi - 0.02, v1: () => Math.PI / 2 - 0.02,
            nu: 1, nv: 5, lift: (_u, v) => 0.022 + 0.052 * Math.sin(v * Math.PI), thick: 0.008,
          }), steel, place.clone());
        }
      }
      // Neck flange off the back of the band. The warden is the one class with
      // no coif, and without something behind the helm his head ends in a hoop —
      // this is the fall a ridge helm actually carries, and from behind it is the
      // difference between him and the berserker at fifty metres. His own, and
      // left exactly as it shipped; a helmet that brings a fall of its own has
      // already built one above, on rings, and two would fight for the same air.
      if (lamellar && style.nape === "none") {
        p.add(headWear(K, {
          u0: Math.PI - 1.15, u1: Math.PI + 1.15,
          v0: () => bandLo - 0.30, v1: () => bandLo + 0.01,
          nu: Math.max(6, lod.shellU - 4), nv: 2,
          lift: (_u, v) => 0.017 + 0.020 * (1 - v), thick: 0.007,
        }), capMetal, place.clone());
      }
      if (bare && !ownCrest) {
        // Boar bristle over the crown. The berserker wears the lowest cap on the
        // roster and needs the height back somewhere that is unmistakably *his* —
        // and a ragged organic crest is the opposite read from the warden's
        // machined steel fin, which is the point of having both.
        p.add(headWear(K, {
          u0: -0.085, u1: 0.085,
          v0: () => bandHi - 0.06, v1: () => Math.PI / 2 - 0.02,
          nu: 2, nv: 6,
          // Ragged along its top rather than peaked in the middle: a crest that
          // tapers symmetrically reads as a fin, and the point of this one is that
          // it does not. Kept to 36 mm — at 55 it stood clear of the bowl on both
          // sides and read as a handle rather than as bristle on a cap.
          lift: (_u, v) => 0.016 + 0.036 * Math.pow(Math.sin(Math.PI * clamp01(v)), 0.42)
            * (0.80 + 0.20 * Math.cos(v * 17)),
          thick: 0.009,
        }), fur, place.clone());
      }
      // Mail aventail off the band — and it stops at the cheek. This was a closed
      // superellipse ring, a full 360° of mail whose top edge sat exactly at eye
      // level and whose front wall stood 9 mm *proud of the nose*. That single
      // shell is why every helmeted warrior in `art/shots/v2` has a black void
      // where his face should be: the face was built, lit and then bricked up
      // behind a hauberk. An arc from cheek round to cheek frames the face the way
      // a coif actually does and leaves the eyes where the light can find them.
      //
      // Sized down hard this pass. At R.x * 1.34 + 0.026 the coif stood 79 mm clear
      // of the skull at cheek level — a dark bell with the head somewhere inside it,
      // which is most of why the huscarl's head reads as small and detached in
      // `art/shots/v3/lineup.png`. Mail drapes: tight over the crown, following the
      // skull down past the ear, and only flaring where it lands on the shoulder.
      // It has also grown a fourth level and reaches the shoulder. It used to stop
      // at 1.78 — above the neck — so the head was a dark bell with a pale post
      // under it and 34 mm of open sky between the coif's rim and the mantle's top
      // edge. Mail hanging from the skull down onto the shieldwall shoulder is the
      // strongest "attached" cue the huscarl has, and it was being thrown away for
      // the sake of a shorter patch. The face stays open: the arc runs cheek to
      // cheek, so all of this is behind and beside the throat, never across it.
      //
      // Gated to the huscarl this pass. It used to hang off `!lamellar`, which
      // handed the same mail bell to the berserker — so three of the four classes
      // shared one head silhouette and the fourth differed by a 30 mm ridge. A
      // coif is heavy-infantry kit and it is the huscarl's whole read; the
      // berserker's is a bare neck under a fur crest, and he cannot have it while
      // he is wearing this.
      if (heavy) {
        // Azimuth of the front edge, radians off dead ahead — and a function of the
        // descent, not a constant. Held at 0.85 all the way down, the front edge
        // tracked the flare outward and forward, so the coif's lappets came off the
        // jaw as two rigid blades standing in front of the chest. Opening the arc as
        // it falls swings that edge out over the point of the shoulder instead,
        // which is where a coif's skirt goes and leaves the hauberk collar to do
        // the front of the throat.
        //
        // Opened another 15° at the top, to 1.12 rad. At 0.85 the front edge landed
        // at x = ±85 mm, which was the skull's own widest point — so the two dark
        // mail curtains hung *beside the cheeks*, and the lit head between them read
        // as 120 mm wide on a 620 mm shoulder line. That is the third and largest
        // part of "the head reads small and narrow", and it was not the head. At
        // 1.12 the rim clears the widened skull by 4 mm and sits 50 mm back in z:
        // behind the ear, where a coif's front edge belongs, with the whole 187 mm
        // of face and temple in front of it.
        // 1.46, not 1.12, and this is the other half of "the head is a rounded box
        // with hard vertical corner edges at the temples".
        //
        // At 1.12 rad the coif's front edge crossed the ring 64° off dead ahead:
        // x = ±100 mm and z = +42 mm, which is *in front of the ear, beside the
        // cheekbone*. So a dark mail curtain hung down each side of the face from
        // the helm rim to the shoulder, with a near-vertical inner edge and a
        // near-vertical outer one — two hard verticals framing the head, which is
        // precisely a box. The lit face between them measured 120 mm on a 600 mm
        // shoulder line, which is also most of "the head reads small".
        //
        // An aventail hangs off the *back and sides* of a helmet. At 1.46 the edge
        // sits level with the front of the ear and rakes back from there, so the
        // temple, the cheekbone and the jaw are all in front of it and the head's
        // own silhouette — which now has a parietal curve to show — draws the
        // outline instead of the mail.
        const rim = (v: number) => 1.46 + 0.34 * v * v;
        const levels = [
          // Started above the brow band rather than 20 mm below it. At R.y * 0.10
          // the coif's top ring cleared the bottom of the band, so its `patch` rim
          // strip — 14 mm of surface facing straight up — stood out at each temple
          // as a lit grey tab. A coif's upper edge is riveted *inside* the bowl and
          // is never seen; 14 mm proud of the skull at this height is well within
          // the band's own 24 mm standoff, so it is now covered.
          { y: skullY + R.y * 0.44, hw: R.x * 1.00 + 0.011, hd: R.z * 1.00 + 0.011, z: -0.008 },
          { y: skullY - R.y * 0.62, hw: R.x * 1.10 + 0.014, hd: R.z * 0.98 + 0.014, z: -0.020 },
          { y: skullY - R.y * 1.55, hw: R.x * 1.36 + 0.016, hd: R.z * 0.92 + 0.016, z: -0.028 },
          { y: skullY - R.y * 2.60, hw: R.x * 1.82 + 0.018, hd: R.z * 1.05 + 0.018, z: -0.032 },
        ];
        const coif = (u: number, v: number, inset: number, out: THREE.Vector3) => {
          const t = v * (levels.length - 1);
          const i = Math.min(levels.length - 2, Math.floor(t));
          const f = t - i;
          const a = levels[i];
          const b = levels[i + 1];
          const hw = mix(a.hw, b.hw, f) - inset;
          const hd = mix(a.hd, b.hd, f) - inset;
          out.set(Math.sin(u) * hw, mix(a.y, b.y, f), mix(a.z, b.z, f) + Math.cos(u) * hd);
        };
        // u runs from the far cheek back to the near one: a patch takes its facing
        // from ∂u × ∂v, and sweeping the arc the other way turns the coif inside
        // out — which reads as a hole in the back of the head.
        p.add(patch({
          nu: Math.max(10, lod.body - 4), nv: Math.max(3, lod.shellV),
          outer: (t, v, out) => coif(mix(Math.PI * 2 - rim(v), rim(v), t), v, 0, out),
          // The inset closes to nothing at both front edges, so the two sheets
          // meet in a fold rather than in a 14 mm rim strip. A rim strip's normal
          // points along the surface, which on a vertical edge means straight at
          // the camera — it was drawing a hard bright line down each side of the
          // head that read as a corner even after the edge itself moved back.
          inner: (t, v, out) => coif(
            mix(Math.PI * 2 - rim(v), rim(v), t), v,
            0.014 * smooth(0, 0.09, Math.min(t, 1 - t)), out,
          ),
        }), mail);
      }
    } else if (ap.helm === "hood") {
      // A deep hood with a point at the back — the runekeeper's outline. The rim
      // used to run *across the eyes* at the front, which is the whole reason the
      // hood read as a blank cone: there was no opening, only cloth. It now rises
      // above the brow at dead ahead, falls away past the cheek at the sides and
      // hangs longest at the nape, and the front of it is lifted furthest so the
      // brim overhangs the face it is supposed to be shading.
      p.add(helmWear(K, {
        tag: "hood",
        u0: 0, u1: Math.PI * 2, wrapU: true,
        // The opening runs higher across the front — 0.50 rad rather than 0.42,
        // which is 12 mm further up the forehead — so there is a face under the
        // hood and not a slot. With the brim's standoff halved the two together
        // are what turn a cone into a cowl.
        v0: (u) => -0.9 + 1.40 * Math.pow(clamp01((Math.cos(u) + 1) * 0.5), 2.2),
        v1: () => Math.PI / 2 - 0.02,
        nu: Math.max(12, lod.shellU + 2), nv: lod.shellV + 1,
        // Down from 30 mm of base lift to 20. Cloth over a skull follows the skull;
        // the extra volume it needs belongs at the nape and over the brim, which is
        // where the two directional terms put it, not in a uniform standoff that
        // inflates the whole hood into a bell.
        // The brim came down from 70 mm of standoff to 38. At 0.02 base plus
        // 0.05 at the front rim the cloth stood 70 mm clear of the brow, which is
        // not a hood — it is a lampshade with a man in it, and it is the whole of
        // "the Shadow Hood swallows the head". Cloth over a skull follows the
        // skull; the volume it needs is at the nape, where the point is, and a
        // brim only has to overhang far enough to shade.
        lift: (u, v) => 0.016 + 0.016 * v
          + 0.048 * (1 - v) * clamp01(-Math.cos(u))
          + 0.022 * Math.pow(1 - v, 1.5) * clamp01(Math.cos(u)),
        thick: 0.010,
      }), robed ? cloakMat : hide, place.clone());
      // Shadow gore: a dark inner course set well inside the cloth, so what you
      // see through the opening is a lined cavity rather than the sky behind it.
      // Cheaper and more reliable than asking a shadow map to resolve 30 mm.
      p.add(helmWear(K, {
        tag: "hood mantle",
        u0: 0, u1: Math.PI * 2, wrapU: true,
        v0: (u) => -0.9 + 1.40 * Math.pow(clamp01((Math.cos(u) + 1) * 0.5), 2.2),
        v1: () => 0.9,
        nu: Math.max(10, lod.shellU), nv: 2,
        lift: (u, v) => 0.012 + 0.03 * Math.pow(1 - v, 1.5) * clamp01(Math.cos(u)),
        thick: 0.004,
      }), dark, place.clone());
      p.add(shell([
        { y: skullY + R.y * 0.6, hw: 0.03, hd: 0.03, z: -R.z * 0.9 },
        { y: skullY + R.y * 0.2, hw: 0.05, hd: 0.05, z: -R.z * 1.25 },
        { y: skullY - R.y * 0.4, hw: 0.028, hd: 0.028, z: -R.z * 1.5 },
      ], 8, { capTop: true, capBottom: true }), robed ? cloakMat : hide);
      // Shoulder drape, so the hood is attached to something.
      //
      // It was a 436 mm bell — wider than the runekeeper's own shoulders — whose rim
      // stopped 120 mm above them, so it read as a lampshade hung in front of a man
      // rather than a mantle lying on one, and it swallowed the neck, the collar and
      // both pauldrons on the way. Narrower and 28 mm longer: the rim now overlaps
      // the shoulder line it is resting on, and the hem `wall` gives it an edge
      // there. It still hides the throat, which is the point of a hood, but it hides
      // it under cloth instead of under a cone.
      // The drape's top ring has dropped from R.y·0.55 to R.y·1.45 — from level
      // with the MOUTH to level with the bottom of the jaw. At 0.55 it stood
      // 124 mm off the spine, which is wider than the head, so a wall of cloth
      // crossed the face at nose height and everything below the eyes was gone:
      // that, and not the cowl, is most of "the Shadow Hood swallows the head"
      // (`art/shots/wip/hm1-*_helm=helm_hood_*`). A mantle lies on the shoulders
      // and its collar meets the throat, which is where this now starts.
      p.add(shell([
        { y: skullY - R.y * 1.45, hw: R.x * 1.16, hd: R.z * 1.10 },
        { y: skullY - R.y * 2.10, hw: R.x * 1.62, hd: R.z * 1.40 },
        { y: skullY - R.y * 2.95, hw: R.x * 2.02, hd: R.z * 1.58 },
      ], Math.max(10, lod.body - 4), { power: 2.2, wall: 0.014 }), robed ? cloakMat : hide);
    }

    // The complexion, written onto every piece of flesh on the head at once —
    // skull, lids, lips, ears, the throat — so all of them land on one
    // continuous map and no boundary between two of them can show as a step.
    // Last, because it has to see everything that was added.
    if (!thrifty) {
      p.paint([headSkin, headShade, headWarm], faceComplexion(
        K, skullY, tone, ap.warPaint,
        ap.beardStyle === "none" ? null
          : { color: ap.beardColor, full: ap.beardStyle !== "short" },
      ));
    }
    return p;
  }, headSig);

  // ==========================================================
  // CLOAK — hung from ONE shoulder, pinned there, thrown clear of the sword arm
  // ==========================================================
  //
  // The shape is `CLOAK_CUTS`; read the note above that table for why there is a
  // table at all. What is here is the sweep it drives, and two facts about the
  // frame it is swept in:
  //
  //   * The pivot sits behind the spine at shoulder height. Azimuth 0 is the
  //     spine, NEGATIVE azimuth is the pinned side — which is the side the brooch
  //     has always been on (`-S.shoulderX * 0.72`) and the side the shield is
  //     carried on — and POSITIVE azimuth runs toward the sword arm, which is
  //     `armPivots[0]` at `+S.shoulderX`.
  //   * Every cut stops at `a1 <= 0.40π`, against the old sheet's 0.56π. The
  //     weapon side is therefore strictly clearer of cloth than it was, which is
  //     the half of "asymmetric" that a player feels rather than sees.
  let cloak: THREE.Group | undefined;
  if (ap.cloak !== "none") {
    const pivot = new THREE.Group();
    pivot.name = `${RIG_TAG}cloak`;
    pivot.position.set(0, S.shoulderY + 0.030, -0.02);
    root.add(pivot);
    cloak = pivot;

    const cut = CLOAK_CUTS[ap.cloak] ?? CLOAK_CUTS.brown;
    // The class scale, kept off the cut so a Sea-Wolf is the same garment on all
    // four men: a huscarl's mail skirt already reaches his thigh and a cloak over
    // it has to stop shorter, a runekeeper is robed and wears everything longer.
    const drop = cut.drop * (heavy ? 0.90 : robed ? 1.17 : 1.0);
    // Elliptical, not circular: a body is wider than it is deep, and a cloak cut
    // on a circle either cuts through the shoulders or stands 130 mm off the
    // spine.
    const topX = S.chestHW + 0.055;
    const topZ = S.chestHD + 0.05;
    const hemX = topX + cut.flareX;
    const hemZ = topZ + cut.flareZ;

    emit("cloak", pivot, () => {
      const p = new Part();
      const surf = (u: number, v: number, inset: number, out: THREE.Vector3) => {
        const a = mix(cut.a0, cut.a1, u);
        // Folds push *out* and never in. A cosine about zero spends half its
        // amplitude cutting inside the base ellipse, and the base ellipse is
        // only ~60 mm clear of the tunic's flared hem — so a trough put the
        // cloak inside the garment under it and the tunic came through as an
        // olive wedge in `probe/duel.png`. Cloth draped over a body is
        // displaced away from it by definition; there is nothing for a fold to
        // displace into. The depth is per cut now: the Sea-Wolf carries 64 mm in
        // three folds and the Traveller's 30 mm in five, because how coarsely a
        // garment gathers is one of the few things about cloth that survives to
        // fight distance.
        const fold = (0.5 - 0.5 * Math.cos(a * cut.foldN)) * cut.foldA * v * v
          + (0.5 - 0.5 * Math.cos(a * cut.foldN * 2)) * cut.foldA * 0.3 * v;
        const grow = v * v * cut.grow + v * (1 - cut.grow);
        const rx = mix(topX, hemX, grow) + fold - inset;
        const rz = mix(topZ, hemZ, grow) + fold - inset;
        // THE TOP EDGE IS A DIAGONAL, and this is the whole asymmetry. The cloth
        // is carried at the brooch on the pinned side; across the back there is
        // nothing holding it up, so the edge falls away toward the trailing
        // corner. `lead` pulls the front corner down onto the chest, which is
        // what a garment pinned at a shoulder actually does and what the old
        // horizontal top edge — a hard line standing ABOVE both shoulders with
        // daylight under it, in the audit's own frame — could not do.
        const t = u;
        const yTop = -cut.nape * Math.pow(t, cut.napePow)
          - cut.lead * Math.pow(1 - t, 3);
        const y = yTop - drop * cut.hem(t) * v;
        out.set(Math.sin(a) * rx, y, -Math.cos(a) * rz);
      };
      p.add(patch({
        nu: Math.max(11, lod.shellU + 2), nv: Math.max(6, lod.shellV + 2),
        outer: (u, v, out) => surf(u, v, 0, out),
        // The lining is cut short in v as well as inset, so the hem is a *fold*
        // rather than a 14 mm strip lying flat and facing straight down.
        //
        // That flat strip is the second of the sub-pixel rim defects the panel
        // logged. `patch` closes the v1 boundary by joining outer to inner, and
        // since both sat at the same height the join was a horizontal annulus —
        // one pixel deep at lineup distance, taking no key light at all, so the
        // hem drew a 1 px black line under a lit cloak and the post chain's
        // fringing painted it red. Pulling the lining 19 mm up turns the same
        // triangles into a 24 mm roll at about 55°, which is several pixels of
        // shaded curvature and is also what a hemmed edge of wool does.
        inner: (u, v, out) => surf(u, v * (1 - 0.018), 0.014, out),
      }), cloakMat);
      // Rolled border along the top edge, following the cloak's own diagonal
      // rather than ringing the chest — the flat disc this replaced read as a
      // plank laid across the shoulders. Its depth is per cut: the Gilded War
      // Cloak's is a 70 mm braided band and the Sea-Wolf's is a 38 mm rolled
      // selvedge, and on a diagonal edge that band is itself a line of outline.
      p.add(patch({
        nu: Math.max(11, lod.shellU + 2), nv: 1,
        outer: (u, v, out) => surf(u, v * cut.collar, -0.013, out),
        inner: (u, v, out) => surf(u, v * cut.collar, 0.015, out),
      }), cloakMat);
      if (lod.trim) {
        p.add(patch({
          nu: Math.max(11, lod.shellU + 2), nv: 1,
          outer: (u, v, out) => surf(u, mix(0.93, 1.0, v), -0.004, out),
          inner: (u, v, out) => surf(u, mix(0.93, 1.0, v), 0.018, out),
        }), ap.cloak === "gold" ? brass : hide);
      }
      return p;
    });
  }

  // ==========================================================
  // SEAMS — where this body comes apart
  // ==========================================================
  //
  // Measured off `S` like everything else, so the cuts move with the skeleton
  // instead of being written down twice. Two choices here are worth stating:
  //
  //   * A joint cut is taken a centimetre or two *inside* the joint rather than
  //     through it, so the kit over the joint stays on the body. An arm off at
  //     the shoulder leaves the pauldron's top lame sitting on the deltoid,
  //     which is what a real shoulder defence does when the arm under it goes,
  //     and it is far better than the alternative — a floating shell fragment
  //     riding an arm that is no longer there.
  //   * The waist is anchored to the torso mesh and not to the body root. The
  //     mesh's own frame *is* the space its stations were swept in, and it is
  //     the one node that keeps that space after `insertSpine` reparents the
  //     upper body and offsets it by a belt height.
  const seams: Record<SeamId, Seam> = {
    neck: {
      id: "neck", anchor: headPivot, y: S.neckRoot - S.neckTop,
      hw: S.neckHW * 0.94, hd: S.neckHD * 0.94, away: 1, bones: 1, mass: 5.0,
    },
    shoulderR: {
      id: "shoulderR", anchor: rightArm, y: -0.018,
      hw: S.armR[0] * 1.02, hd: S.armR[0] * 1.06, away: -1, bones: 1, mass: 4.3,
    },
    shoulderL: {
      id: "shoulderL", anchor: leftArm, y: -0.018,
      hw: S.armR[0] * 1.02, hd: S.armR[0] * 1.06, away: -1, bones: 1, mass: 4.3,
    },
    elbowR: {
      id: "elbowR", anchor: rightArm, y: -S.upperArm - 0.012,
      hw: S.armR[2] * 1.02, hd: S.armR[2] * 1.06, away: -1, bones: 2, mass: 2.2,
    },
    elbowL: {
      id: "elbowL", anchor: leftArm, y: -S.upperArm - 0.012,
      hw: S.armR[2] * 1.02, hd: S.armR[2] * 1.06, away: -1, bones: 2, mass: 2.2,
    },
    hipR: {
      id: "hipR", anchor: rightLeg, y: -0.026,
      hw: S.legR[0] * 0.98, hd: S.legR[0] * 1.02, away: -1, bones: 1, mass: 11.5,
    },
    hipL: {
      id: "hipL", anchor: leftLeg, y: -0.026,
      hw: S.legR[0] * 0.98, hd: S.legR[0] * 1.02, away: -1, bones: 1, mass: 11.5,
    },
    kneeR: {
      id: "kneeR", anchor: rightLeg, y: S.kneeY - S.hipY - 0.02,
      hw: S.legR[2] * 0.98, hd: S.legR[2] * 1.04, away: -1, bones: 2, mass: 4.6,
    },
    kneeL: {
      id: "kneeL", anchor: leftLeg, y: S.kneeY - S.hipY - 0.02,
      hw: S.legR[2] * 0.98, hd: S.legR[2] * 1.04, away: -1, bones: 2, mass: 4.6,
    },
    waist: {
      id: "waist", anchor: torsoMeshes[0], y: mix(S.waistY, S.beltY, 0.55),
      hw: S.waistHW * 0.96, hd: S.waistHD * 0.96, away: 1, bones: 1, mass: 33,
    },
  };
  const cutting: SeverContext = {
    root, seams, legs: legPivots, head: headPivot, torso: torsoMeshes,
    materials: M, detail, live: new Map<SeamId, Severance>(),
  };

  return {
    group: root,
    rightArm,
    leftArm,
    rightLeg,
    leftLeg,
    head: headPivot,
    cloak,
    torso: torsoMeshes[0],
    seams,
    sever: (zone, opts) => severBody(cutting, zone, opts),
    reassemble: () => {
      for (const s of [...cutting.live.values()]) s.release();
    },
  };
}
