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
//      the skin, wool over it, mail over that, then belts, then the
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
export function defaultAppearance(cls) {
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
const RETIRED_ARMOUR = {
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
const RETIRED_HAIR = {
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
export function migrateAppearance(ap) {
    const armorColor = RETIRED_ARMOUR[ap.armorColor] ?? ap.armorColor;
    const hairColor = RETIRED_HAIR[ap.hairColor] ?? ap.hairColor;
    const beardColor = RETIRED_HAIR[ap.beardColor] ?? ap.beardColor;
    if (armorColor === ap.armorColor && hairColor === ap.hairColor && beardColor === ap.beardColor)
        return ap;
    return { ...ap, armorColor, hairColor, beardColor };
}
/**
 * The seven, keyed by the hex the option already stores so no id, cost or saved
 * profile has to move. Each row is a dye lot and a metal, chosen together.
 */
const FINISH_KIT = {
    // Rough Iron — what a man is issued. Undyed wool in the fleece's own colours,
    // oiled harness leather, cast bronze. This row is the old constants, so the
    // free finish looks exactly as it did and the ladder starts where it started.
    0x5f6b7a: { mail: 0x5f6b7a, tunic: 0x6a5b42, trouser: 0x504a3e, wrap: 0x8b7c5c, hide: 0x4a3524, buff: 0x7a5b38, fitting: 0xbfa25c },
    // Polished Steel — everything on him goes cool and a shade brighter. Slate
    // wool, bleached wraps, tinned-bronze fittings that match the shirt.
    0x8a97a5: { mail: 0x8a97a5, tunic: 0x5c6068, trouser: 0x434b56, wrap: 0xb6b2a4, hide: 0x453c33, buff: 0x8b7c5e, fitting: 0xc3c9d0 },
    // Blackened Steel — fire-blued metal, soot-dyed wool, black harness. The
    // fittings go to dark iron; brass buttons would undo the whole finish.
    0x2a2f38: { mail: 0x2a2f38, tunic: 0x3a3733, trouser: 0x2f2d2c, wrap: 0x6d665a, hide: 0x241f1b, buff: 0x4e4438, fitting: 0x7f838a },
    // Bronze Scales — the warm end. Walnut-dyed trousers, oat wraps, tan harness
    // and true cast bronze, so the whole man reads as one metal's worth of warmth.
    0x8a6a3a: { mail: 0x8a6a3a, tunic: 0x7a5a2e, trouser: 0x5b4527, wrap: 0xc2aa7c, hide: 0x513418, buff: 0x8f6a34, fitting: 0xc79a4a },
    // Crimson Warplate — madder. The dyestuff that actually made a Dark Age man
    // look rich, on the trousers and pulled through the leather; wraps stay a
    // pale rose-grey so the legs still break into two values at fight distance.
    0x7a2f2a: { mail: 0x7a2f2a, tunic: 0x8a3730, trouser: 0x5d2d29, wrap: 0xbc9c8c, hide: 0x46201a, buff: 0x8a5241, fitting: 0xbfa25c },
    // Sea Queen's Gift — woad, the other expensive vat, and the only cold blue on
    // the roster. Fittings go pewter rather than gold for the same reason.
    0x2f4a6a: { mail: 0x2f4a6a, tunic: 0x35506b, trouser: 0x333f52, wrap: 0x93a0aa, hide: 0x2b3138, buff: 0x627083, fitting: 0xaab8c0 },
    // Bretwalda Gold — weld yellow over everything and fire-gilt fittings. The top
    // of the ladder, and now the only finish where the trousers, the wraps, the
    // belt and the brooch are all saying the same thing.
    0x9a7a2a: { mail: 0x9a7a2a, tunic: 0x8a6f2c, trouser: 0x6b5726, wrap: 0xd2bd7c, hide: 0x4d3a14, buff: 0x9c7c34, fitting: 0xdcc164 },
};
/**
 * The kit for a stored finish. Anything not in the table — a retired hex that
 * `migrateAppearance` did not catch, a value off the wire from an older client —
 * derives a coherent kit from the hue rather than falling back to the issued one,
 * so an unknown finish still dresses the man instead of silently un-dressing him.
 */
export function finishKit(armorColor) {
    const known = FINISH_KIT[armorColor];
    if (known)
        return known;
    const c = new THREE.Color(armorColor);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    const at = (s, l, hShift = 0) => new THREE.Color().setHSL((hsl.h + hShift + 1) % 1, Math.min(0.55, s), l).getHex();
    return {
        mail: armorColor,
        tunic: at(hsl.s * 0.62, Math.max(0.16, Math.min(0.36, hsl.l * 0.9))),
        trouser: at(hsl.s * 0.75, Math.max(0.13, Math.min(0.3, hsl.l * 0.72))),
        wrap: at(hsl.s * 0.35, Math.max(0.42, Math.min(0.72, hsl.l * 1.55 + 0.22))),
        hide: at(hsl.s * 0.55, Math.max(0.09, hsl.l * 0.45), 0.02),
        buff: at(hsl.s * 0.5, Math.max(0.24, Math.min(0.45, hsl.l * 0.95)), 0.02),
        fitting: at(hsl.s * 0.4, Math.max(0.5, Math.min(0.74, hsl.l * 1.3 + 0.24))),
    };
}
/**
 * The tunic's final colour: the finish's dye lot, shifted by the class's own
 * accent. The finish says what vat the wool went in; the class says how it wears
 * it, and keeps the four apart at fight distance.
 *
 * The weights are chosen so no class can leave its finish's family. HUE moves a
 * fifth of the way towards the accent's — enough that the warden stays the
 * coolest of the four and the berserker the warmest, not enough that Crimson
 * ever renders anything but red. SATURATION and VALUE are scaled rather than
 * mixed, because those are the two channels a silhouette actually separates on
 * under this arena's fire key, and a class that only differed in hue would
 * collapse to one shape the moment the sun went behind the hall.
 *
 * Hue is interpolated the short way round the circle. Doing it the naive way
 * sends a red accent over an orange dye through the entire spectrum to get
 * there, which is how a warrior ends up green in a bronze finish.
 */
function tunicDye(lot, accent) {
    const a = { h: 0, s: 0, l: 0 };
    const b = { h: 0, s: 0, l: 0 };
    new THREE.Color(lot).getHSL(a);
    new THREE.Color(accent).getHSL(b);
    let dh = b.h - a.h;
    if (dh > 0.5)
        dh -= 1;
    if (dh < -0.5)
        dh += 1;
    const h = (a.h + dh * 0.2 + 1) % 1;
    const s = Math.min(0.6, a.s * (0.72 + b.s * 1.0));
    const l = Math.min(0.55, Math.max(0.09, a.l * (0.74 + b.l * 1.1)));
    return new THREE.Color().setHSL(h, s, l).getHex();
}
export const ARMOURY = [
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
            // REPRICED UPWARD, ON THE CONDITION THE LAST REPRICING WROTE DOWN.
            //
            // Read the block below first — it is the previous owner's, it is correct
            // about the shop it was looking at, and it ends with an explicit condition:
            // "If somebody later gives these real substance ... and puts it on a
            // surface every class actually has, then the ladder can be re-argued upward
            // with a frame behind it."
            //
            // That is what this wave did. `ap.armorColor` no longer feeds one material.
            // It selects a coordinated kit — mail, tunic dye, trousers, leg wraps, strap
            // leather, buff leather and every cast fitting on the man (see `FINISH_KIT`)
            // — so all three of the measurements below have been answered rather than
            // argued with:
            //
            //   * "the tint lands on two shoulders and a sliver of chest" — it now lands
            //     on the largest cloth surfaces on the body, which are the ones the
            //     shield never covers.
            //   * "two of the four classes cannot wear it" — the runekeeper's leather
            //     body layer, his new mantle, the berserker's jerkin, his torc and his
            //     arm rings are all on the palette. `art/shots/armour-finish-roster.png`
            //     is the frame: four classes down, seven finishes across.
            //   * "0.00% silhouette and 0.00% form on all six adjacent rungs" — STILL
            //     TRUE, AND DELIBERATELY SO. A finish moves no geometry. `cosmetictest`
            //     asserts that and the assertion is untouched, because a colour slot
            //     that quietly grew geometry would break the one thing that instrument
            //     is for. What changed is how much of the man the colour reaches, which
            //     is a coverage claim and needs the sheet above, not the silhouette
            //     measure.
            //
            // SO: 20–60 becomes 60–160. That is a rise and it should be called one. The
            // anchor is the measured 90–135 gold a winning best-of-3 pays, so the entry
            // rung is most of one match and the top is a little over one — priced beside
            // the 90-gold cloaks, which is the other slot that changes the whole
            // outline, and nowhere near the 510 this slot used to charge for a hex.
            //
            // NOBODY IS STRANDED AND NOBODY IS BILLED AGAIN. Ownership is by id, the ids
            // are unchanged, and a player who bought Bretwalda Gold at 60 owns Bretwalda
            // Gold. The server reads this same array (`src/db/catalogue.ts` imports
            // `ARMOURY` rather than keeping its own price list), so there is one number
            // and it cannot drift.
            //
            // ---- the previous owner's note, which is why the prices were 20–60 ----
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
            { id: "armor_steel", label: "Polished Steel", cost: 60, slot: "armor", value: 0x8a97a5 },
            { id: "armor_dark", label: "Blackened Steel", cost: 110, slot: "armor", value: 0x2a2f38 },
            { id: "armor_bronze", label: "Bronze Scales", cost: 110, slot: "armor", value: 0x8a6a3a },
            { id: "armor_crimson", label: "Crimson Warplate", cost: 130, slot: "armor", value: 0x7a2f2a },
            { id: "armor_seablue", label: "Sea Queen's Gift", cost: 130, slot: "armor", value: 0x2f4a6a },
            { id: "armor_gold", label: "Bretwalda Gold", cost: 160, slot: "armor", value: 0x9a7a2a },
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
export function freeCosmeticIds() {
    const ids = [];
    ARMOURY.forEach((s) => s.options.forEach((o) => { if (o.cost === 0)
        ids.push(o.id); }));
    return ids;
}
const BARE_HEAD = {
    cap: false, bowl: "round", nasal: false, brows: false,
    cheek: "none", nape: "none", crown: "none", mask: false, noble: false,
};
/**
 * Keyed by `Appearance.helm`. Order is the shop's order, which is also the order
 * the lineup capture wants them in.
 */
export const HELM = {
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
export const HELM_VALUES = Object.keys(HELM);
const helmStyle = (value) => HELM[value] ?? BARE_HEAD;
/**
 * Untextured stand-in for callers with no texture library — the armoury preview
 * renders into its own canvas and cannot afford to generate half a megabyte of
 * PBR maps to show one hauberk. Every call allocates, and the caller is expected
 * to dispose what it built.
 */
const RAW = {
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
// Four complexions, quantised on purpose: the material library caches by colour,
// so a field of eight warriors costs at most sixteen flesh programs instead of
// thirty-two. Ordered pale → weathered → tanned → dark. Every `base` came down
// about 8% this pass as well — at 0xe0b590 the face was the brightest large
// surface on the warrior and it blew flat against the helm.
const SKIN_TONES = [
    { base: 0xd4a884, shade: 0x9b7456, warm: 0xc4816a, sclera: 0xa89b88 },
    { base: 0xc99d75, shade: 0x917050, warm: 0xb87256, sclera: 0x9a8e7c },
    { base: 0xb08157, shade: 0x7f5c3c, warm: 0xa25f47, sclera: 0x847a6a },
    { base: 0x8d6444, shade: 0x65472e, warm: 0x7c4936, sclera: 0x655d50 },
];
const CLOAK_COLORS = {
    brown: 0x5a4030, red: 0x7a2020, blue: 0x24386a, gold: 0xa8842a, none: 0x5a4030,
};
const CLOAK_CUTS = {
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
function clothRepeat(girth) {
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
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (edge0, edge1, x) => {
    const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
    return t * t * (3 - 2 * t);
};
/** Anisotropic gaussian, evaluated on a unit direction. The face is all of these. */
const bump = (dx, dy, dz, sx, sy, sz) => Math.exp(-((dx * dx) / (sx * sx) + (dy * dy) / (sy * sy) + (dz * dz) / (sz * sz)));
/**
 * Deterministic per-warrior noise. Integer in, unit float out — no state, so the
 * same seed builds the same man on the capture box and on a phone, which is the
 * only reason an A/B against `art/shots/baseline` means anything.
 */
function hash(seed, salt) {
    let h = (seed * 374761393 + salt * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Symmetric jitter: `span(seed, salt, 0.4)` lands in ±0.4. */
const span = (seed, salt, amount) => (hash(seed, salt) * 2 - 1) * amount;
/**
 * Latin-square pick over `n` choices: every run of `n` consecutive seeds covers
 * all `n` values, and the run's starting point is hashed so consecutive blocks do
 * not repeat the same order. Uniform sampling is only uniform in the limit, and
 * the sample that matters here is eight warriors on one field — where a fair coin
 * happily hands four of them the same complexion, which is the exact "one man
 * cloned" read this variation exists to break.
 */
const stratify = (seed, salt, n) => (Math.floor(hash(Math.floor(seed / n), salt) * n) + (seed % n)) % n;
function xf(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
/**
 * A ring seam duplicates its first vertex so the UV can wrap, which leaves
 * `computeVertexNormals` averaging half a neighbourhood on each copy — a hard
 * crease straight down every limb and garment. Averaging the pair back together
 * costs nothing and is the difference between a tapered arm and a folded one.
 */
function weldRingNormals(geo, rings, seg) {
    const nrm = geo.getAttribute("normal");
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
function finish(pos, uv, idx) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}
/**
 * Sweeps a superelliptical section through a list of stations. Torsos, mail,
 * tunics, thighs, forearms, necks, blades and axe hafts are all this function.
 */
function shell(stations, seg, opts = {}) {
    const k = 2 / (opts.power ?? 2);
    const pos = [];
    const uv = [];
    const idx = [];
    const rings = [];
    const n = stations.length;
    const yTop = stations[0].y;
    const yBot = stations[n - 1].y;
    const span = Math.abs(yTop - yBot) || 1;
    const phase = opts.phase ?? 0;
    const arc = opts.arc ?? Math.PI * 2;
    const start = opts.start ?? 0;
    // A closed sweep's last vertex is the first one again, so the strip that joins
    // them must wrap; an open one ends where it ends and must not. Everything below
    // steps `i < seg` over `seg + 1` vertices either way — the difference is only
    // whether the two longitudinal edges get rims, which is `open`.
    const open = arc < Math.PI * 2 - 1e-6;
    const ring = (st, inset) => {
        const base = pos.length / 3;
        const hw = Math.max(2e-4, st.hw - inset);
        const hd = Math.max(2e-4, st.hd - inset);
        const v = 1 - (yTop - st.y) / span;
        for (let i = 0; i <= seg; i++) {
            const a = start + ((i + phase) / seg) * arc;
            const c = Math.cos(a);
            const s = Math.sin(a);
            pos.push(hw * Math.sign(c) * Math.pow(Math.abs(c), k), st.y, (st.z ?? 0) + hd * Math.sign(s) * Math.pow(Math.abs(s), k));
            uv.push(i / seg, v);
        }
        rings.push(base);
        return base;
    };
    const outer = stations.map((st) => ring(st, 0));
    for (let r = 0; r < n - 1; r++) {
        const t = outer[r];
        const b = outer[r + 1];
        for (let i = 0; i < seg; i++) {
            idx.push(t + i, b + i + 1, b + i, t + i, t + i + 1, b + i + 1);
        }
    }
    if (opts.wall) {
        const inner = stations.map((st) => ring(st, opts.wall));
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
        if (open) {
            // The two cut edges of a partial sweep, outer skin stitched to inner across
            // the wall so a slit hem is cloth with a thickness. Windings are derived
            // rather than guessed: the outer surface's own strip proves that increasing
            // `i` runs anticlockwise seen from +y, so the start edge's outward normal is
            // the −tangent and the end edge's is the +tangent, and these are the two
            // orders that produce them.
            for (let r = 0; r < n - 1; r++) {
                const oT = outer[r], oB = outer[r + 1], iT = inner[r], iB = inner[r + 1];
                idx.push(oT, iB, iT, oT, oB, iB);
                idx.push(oT + seg, iT + seg, iB + seg, oT + seg, iB + seg, oB + seg);
            }
        }
    }
    if (opts.capTop) {
        const c = pos.length / 3;
        pos.push(0, yTop, stations[0].z ?? 0);
        uv.push(0.5, 1);
        const t = outer[0];
        for (let i = 0; i < seg; i++)
            idx.push(c, t + i + 1, t + i);
    }
    if (opts.capBottom) {
        const c = pos.length / 3;
        pos.push(0, yBot, stations[n - 1].z ?? 0);
        uv.push(0.5, 0);
        const b = outer[n - 1];
        for (let i = 0; i < seg; i++)
            idx.push(c, b + i, b + i + 1);
    }
    const g = finish(pos, uv, idx);
    // Welding averages the first and last vertex of each ring, which is right when
    // they are the same point on a closed tube and wrong when they are the two
    // sides of a slit: it would round the panel's cut edges into each other and
    // put a soft gradient where the garment's hardest line is.
    if (!open)
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
function patch(opts) {
    const { nu, nv } = opts;
    const pos = [];
    const uv = [];
    const idx = [];
    const tmp = new THREE.Vector3();
    const stride = nu + 1;
    const count = stride * (nv + 1);
    const grid = (fn) => {
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
    const O = (i, j) => j * stride + i;
    const I = (i, j) => count + j * stride + i;
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
function lensPrism(outline, thickness, inset) {
    const n = outline.length;
    let cx = 0;
    let cy = 0;
    for (const [x, y] of outline) {
        cx += x;
        cy += y;
    }
    cx /= n;
    cy /= n;
    const pos = [];
    const uv = [];
    const idx = [];
    const ringAt = (z, k) => {
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
    const band = (a, b) => {
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            idx.push(a + i, b + j, b + i, a + i, a + j, b + j);
        }
    };
    band(back, mid);
    band(mid, front);
    const fan = (base, z, flip) => {
        const c = pos.length / 3;
        pos.push(cx, cy, z);
        uv.push(0.5, 0.5);
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            if (flip)
                idx.push(c, base + j, base + i);
            else
                idx.push(c, base + i, base + j);
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
function retile(geo, du, dv, sv = 1) {
    const uv = geo.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) + du, uv.getY(i) * sv + dv);
    }
    uv.needsUpdate = true;
    return geo;
}
// ---- primitive shorthands, so the build code reads as anatomy ----
const ball = (r, s = 10) => new THREE.SphereGeometry(r, s, Math.max(4, Math.round(s * 0.6)));
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const rod = (rTop, rBot, h, s = 8) => new THREE.CylinderGeometry(rTop, rBot, h, s);
const ring = (r, tube, s = 6, t = 16) => new THREE.TorusGeometry(r, tube, s, t);
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
let glowField = null;
function glowCarving() {
    if (glowField)
        return glowField;
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
const SHAPED_GLOW = new WeakMap();
/** Nothing emits inside a warrior without a field to shape it. See above. */
function shapedGlow(mat) {
    if (!(mat instanceof THREE.MeshStandardMaterial))
        return mat;
    if (mat.emissiveMap || mat.alphaMap)
        return mat;
    if (mat.emissiveIntensity <= 0 || mat.emissive.equals(UNLIT))
        return mat;
    let safe = SHAPED_GLOW.get(mat);
    if (!safe) {
        const clone = mat.clone();
        clone.emissiveMap = glowCarving();
        if (!clone.map)
            clone.map = glowCarving();
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
const VERTEX_TINTED = new WeakSet();
class Part {
    slots = new Map();
    add(geo, mat, transform) {
        if (transform)
            geo.applyMatrix4(transform);
        // The emissive invariant is enforced here, and not at the call sites, because
        // the call sites are where it keeps being lost.
        const wear = shapedGlow(mat);
        if (VERTEX_TINTED.has(wear) && !geo.getAttribute("color")) {
            const n = geo.getAttribute("position").count;
            geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
        }
        const list = this.slots.get(wear);
        if (list)
            list.push(geo);
        else
            this.slots.set(wear, [geo]);
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
    paint(mats, f) {
        const c = new THREE.Color();
        for (const mat of mats) {
            const list = this.slots.get(shapedGlow(mat));
            if (!list)
                continue;
            for (const geo of list) {
                const pos = geo.getAttribute("position");
                const col = geo.getAttribute("color");
                if (!col)
                    continue;
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
    addMirrored(make, mat, place) {
        for (const side of [-1, 1])
            this.add(make(side), mat, place(side));
        return this;
    }
    merge() {
        const out = [];
        for (const [mat, list] of this.slots) {
            if (list.length === 1) {
                out.push({ geo: list[0], mat });
                continue;
            }
            const merged = mergeGeometries(list, false);
            if (merged) {
                for (const g of list)
                    g.dispose();
                out.push({ geo: merged, mat });
            }
            else {
                // Only reachable if a primitive turns up with a stray attribute; a few
                // extra draw calls beat a warrior that fails to build.
                for (const g of list)
                    out.push({ geo: g, mat });
            }
        }
        return out;
    }
}
/**
 * Identical loadouts share their merged geometry. The count is per *mesh*, which
 * is exactly the granularity anim.ts disposes at — it walks a dead warrior and
 * calls `geometry.dispose()` once per mesh — so the release below lands when the
 * last body wearing this kit leaves the field and not a moment before.
 */
const RIG_CACHE = new Map();
const USES = new WeakMap();
const LIB_IDS = new WeakMap();
let libSeq = 0;
function libraryId(m) {
    let id = LIB_IDS.get(m);
    if (!id) {
        id = `L${++libSeq}`;
        LIB_IDS.set(m, id);
    }
    return id;
}
function guard(geo, signature) {
    const real = THREE.BufferGeometry.prototype.dispose;
    geo.dispose = function () {
        const n = (USES.get(geo) ?? 1) - 1;
        USES.set(geo, n);
        if (n > 0)
            return;
        RIG_CACHE.delete(signature);
        real.call(this);
    };
}
const BUILD = {
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
function skeleton(b) {
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
const LOD = {
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
const lat = (y) => Math.asin(clamp01((y + 1) * 0.5) * 2 - 1);
/**
 * `seed` is a warrior identity. An integer is the intended form — consecutive
 * integers are what the stratified picks below rely on — but a `hash01`-style
 * fraction is accepted and folded up to one, because that is the number `anim.ts`
 * already has to hand and a crash on a float would be a nasty surprise later.
 */
function faceTraits(raw) {
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
        brow: 1 + span(seed, 4, 0.20),
        deepSet: 1 + span(seed, 5, 0.18),
        nose: 1 + span(seed, 6, 0.10),
        bridge: 1 + span(seed, 7, 0.25),
        nostril: 1 + span(seed, 8, 0.22),
        cheek: 1 + span(seed, 9, 0.28),
        gaunt: 1 + span(seed, 10, 0.32),
        jaw: 1 + span(seed, 11, 0.20),
        chin: 1 + span(seed, 12, 0.15),
        eyeU: 1 + span(seed, 13, 0.09),
        eyeV: span(seed, 14, 0.035),
        eyeOpen: 1 + span(seed, 15, 0.2),
        mouth: 1 + span(seed, 16, 0.16),
        lip: 1 + span(seed, 17, 0.20),
        asym: span(seed, 18, 0.0022),
        pNose: span(seed, 21, 1.5),
        pLip: span(seed, 22, 0.8),
        pChin: span(seed, 23, 1.2),
        tone: stratify(seed, 19, SKIN_TONES.length),
        iris: stratify(seed, 20, IRIS_COLORS.length),
    };
}
/**
 * A C1 curve through control points, crown-first. Smoothstep between rows rather
 * than linear, because a linear join is a crease in the surface and a crease
 * across the face reads as the hard-edged plate this rewrite exists to delete.
 */
function curve(c, y) {
    if (y >= c[0][0])
        return c[0][1];
    for (let i = 1; i < c.length; i++) {
        if (y < c[i][0])
            continue;
        const t = smooth(c[i - 1][0], c[i][0], y);
        return mix(c[i - 1][1], c[i][1], t);
    }
    return c[c.length - 1][1];
}
// ============================================================
// THE HEAD, AUTHORED AS GEOMETRY
//
// Eight passes have failed on this face and every one of them built the same
// object: an ellipsoid displaced by a field of gaussians, then tuned. They
// produced, in order, a mannequin, a beak, a muzzle, a pug and a puppet. The
// method is the failure, not the coefficients, and this file has already proved
// that twice — the ear stopped being a torus with daylight through it when it
// was authored as a shell, and the helm stopped shearing through the skull when
// it was swept off a form instead of summed. Both were fixed by writing the
// geometry down.
//
// So the head is written down. There is no displacement field here at all.
//
//   A HEAD IS A STACK OF SECTIONS. `C_W` is its half-breadth at every height,
//   `C_MASK` is the front of the face plane, `C_OCC` is the back of the skull,
//   and `C_NF`/`C_NB` say how FLAT each section is between them. Those curves
//   ARE the silhouette: the front view is `C_W` plotted against height, the
//   profile is `C_MASK` and `C_OCC` plotted against the same, and neither is an
//   emergent property of anything. The outline can be read off the table.
//
//   A FACE IS A RELIEF ON IT. `RELIEF` is one explicit table — rows at the
//   landmark latitudes, columns at bearings off dead ahead — giving how far the
//   skin stands off that section, in millimetres, along the section's own
//   outward normal. Each row is a cross-section of the face drawn as a single
//   outline: the brow row carries the whole brow, the tip row carries the whole
//   nose, and no two rows are ever added together.
//
// The consequences are the point:
//
//   * NOTHING CANCELS. The old field had forty terms and a dozen of them landed
//     on the mid-face; changing one moved three others, which is why every
//     note-by-note pass in this project's history fixed its notes and broke the
//     object.
//   * THE PROFILE CANNOT DRIFT. The midline is column 0 of the relief on top of
//     `C_MASK`, and both are authored, so S1, S2 and S3 are properties of two
//     printable tables rather than of a residual left over by a correction.
//   * THE FACE CANNOT BECOME A KEEL. How much of its projection the mid-face
//     spends in the first fifth of a radian is `C_NF` — one number per row — and
//     S7 measures precisely that number.
//   * A SEED CANNOT MAKE A SPECIES. The traits scale the relief inside a band
//     and nudge the section, and a scaled relief is still the row it was written
//     on.
//
// It is also, deliberately, a STYLISED head rather than an attempt at a
// photograph. There are about thirty forms on it and they are all large: the
// cranial mass, the brow shelf, the temporal plane, the orbit, the nose as one
// wedge, the mouth as two bands, the chin as a box, the jaw. Detail is carried
// by the silhouette and by which way a plane faces, which is what survives being
// 35 px tall on a phone and being seen through the eye slot of a face mask —
// where a face made of small correct wrinkles turns to mush.
//
// Read crown-first. `y` is the field's own latitude sine, +1 at the crown.
// ============================================================
/** The canonical head the tables below are authored against, in metres. Every
 *  class scales off it, so the numbers can be read as millimetres of a real head
 *  rather than as fractions of a radius. */
const RX0 = 0.0955;
const MM = 0.001;
function spl(c) {
    // Authored crown-first, so `x` descends. Reversed into ascending order once.
    const n = c.length;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        x[i] = c[n - 1 - i][0];
        y[i] = c[n - 1 - i][1];
    }
    const d = new Float64Array(n - 1);
    for (let i = 0; i < n - 1; i++)
        d[i] = (y[i + 1] - y[i]) / (x[i + 1] - x[i]);
    const m = new Float64Array(n);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++)
        m[i] = (d[i - 1] + d[i]) * 0.5;
    for (let i = 0; i < n - 1; i++) {
        if (d[i] === 0) {
            m[i] = 0;
            m[i + 1] = 0;
            continue;
        }
        const a = m[i] / d[i];
        const b = m[i + 1] / d[i];
        const s = a * a + b * b;
        if (s > 9) {
            const t = 3 / Math.sqrt(s);
            m[i] = t * a * d[i];
            m[i + 1] = t * b * d[i];
        }
    }
    return { x, y, m };
}
function ev(s, q) {
    const x = s.x;
    const n = x.length;
    if (q <= x[0])
        return s.y[0];
    if (q >= x[n - 1])
        return s.y[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (x[mid] <= q)
            lo = mid;
        else
            hi = mid;
    }
    const h = x[hi] - x[lo];
    const t = (q - x[lo]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * s.y[lo] + (t3 - 2 * t2 + t) * h * s.m[lo]
        + (-2 * t3 + 3 * t2) * s.y[hi] + (t3 - t2) * h * s.m[hi];
}
// ------------------------------------------------------------
// THE SECTION STACK
// ------------------------------------------------------------
/**
 * Half-breadth, in millimetres, at every height. This curve IS the front
 * silhouette of the head — read it top to bottom and the outline is drawn.
 *
 * REWRITTEN AGAINST THE FRAME, and the frame is `art/shots/base0`: what the old
 * numbers drew was a pointed egg. Two properties did it, and neither is visible
 * in any ratio the gate owns.
 *
 * FIRST, THE VAULT OPENED TOO SLOWLY. 17 mm at y = 0.985 and 44 at 0.920 is a
 * dome, and a dome that then holds 96–98 for the whole of the middle of the head
 * is an egg standing on its narrow end. A human vault opens FAST off the crown
 * and then goes nearly vertical — the parietal wall is a wall — so the rows near
 * the top are 30–50% wider than they were and the middle of the head is 5 mm
 * narrower. 93 at the parietal is 186 mm across, 0.69 of head height, against a
 * life 0.67 and the old build's 0.73.
 *
 * SECOND, THE WIDEST LINE WAS AT THE TEMPLE. The old table peaked at y = 0.000
 * to 0.120, which is the temporal fossa — the one place on a skull that is
 * hollow. Everything below it then narrowed monotonically, so the cheekbone was
 * 6 mm narrower than the temple above it and there was no cheekbone in the
 * outline at all. Now the maximum is at 0.30 (the parietal eminence, where a
 * skull's really is), the temple gives up 5 mm to it, and the zygomatic HOLDS at
 * 90 through two rows instead of tapering. The eye reads that hold as a
 * cheekbone; it read the old taper as the side of an egg.
 *
 * The BREADTHS themselves are unchanged — 98 at the parietal, 90 at the cheek,
 * 74 at the gonion — and that is deliberate. Four of the gate's ratios are a
 * coupled system around them (`breadthOverHeight` wants a broad vault,
 * `neckOverHead` wants one at least as broad as the neck, `jawOverCheek` fixes
 * the jaw against the cheek and `neckOverJaw` fixes the neck against the jaw),
 * and a first cut of this pass narrowed the whole head by 5% and put four of
 * them out at once for no gain the frame could see. The defect was never the
 * width. It was the ORDER of the widths down the head.
 *
 * Below the gonion it falls away fast, and that is what gives the mandible a
 * corner instead of a curve: a jaw that runs from the ear to the chin as one arc
 * is an egg however hard it is flared sideways. The break is sharper than it was
 * and it starts LOWER — 69.5 held to −0.596 and then 21 mm gone in a tenth of
 * the field.
 */
const C_W = [
    [1.000, 0],
    [0.988, 24],
    [0.965, 39],
    [0.930, 56],
    [0.880, 70],
    [0.810, 82],
    [0.720, 90],
    [0.600, 94.5],
    [0.450, 97],
    [0.300, 98], //    PARIETAL — the widest line on the head, 196 mm across
    [0.150, 96.5],
    [0.020, 93], //    temple, 5 mm inboard of the parietal
    [-0.116, 91.5], // eye line
    [-0.216, 90], //   ZYGOMATIC — held, not tapered: this is the cheekbone
    [-0.290, 87],
    [-0.360, 82],
    [-0.440, 77],
    [-0.520, 74.5],
    [-0.596, 74], //   GONION
    [-0.650, 70],
    [-0.700, 62],
    [-0.760, 50],
    [-0.796, 43],
    [-0.860, 30],
    [-0.920, 17],
    [-0.970, 8],
    [-1.000, 0],
];
/**
 * THE FACE PLANE, in millimetres of z from the head's own origin — the front of
 * the head as it would be if the man had no nose, no lips and no brow.
 *
 * This is the most important table in the file and it is deliberately
 * FEATURELESS. Every previous pass carried the profile and the features in the
 * same quantity, so the nose's 20 mm of projection had to be clawed back over
 * the cheek by something, and whatever did the clawing drew the hard plane break
 * from the inner brow to the jaw that the owner has now reported three times.
 * Here the plane runs nearly vertical from the glabella to the chin — a man's
 * does — and the features sit ON it as relief that dies inside its own width.
 * There is no residual to deliver, so there is no envelope, so there is no
 * crease.
 *
 * The chin is a BOX: the plane carries forward to pogonion, holds through
 * `-0.840`, and only then turns under. A smooth run from the lip to the gnathion
 * is a rounded pebble with no bottom edge and nothing to cast onto the throat.
 */
const C_MASK = [
    [1.000, 0],
    [0.988, 20],
    [0.965, 34],
    [0.930, 50],
    [0.880, 66],
    [0.810, 80],
    [0.720, 91],
    [0.600, 98.5],
    [0.450, 102.4],
    [0.360, 104.0],
    [0.290, 105.0],
    [0.219, 105.6], // GLABELLA — the datum, and now the MAXIMUM of the vault run
    [0.144, 105.1], // nasal root
    [0.050, 104.6],
    [-0.116, 104.2], // eye line
    [-0.231, 103.8], // the nose tip's row: the PLANE, not the nose
    [-0.323, 103.2], // subnasale
    [-0.420, 102.4],
    [-0.536, 102.4], // lip line
    [-0.600, 102.0],
    [-0.660, 101.6], // mentolabial
    [-0.750, 102.0],
    [-0.796, 102.0], // POGONION
    [-0.840, 101.4],
    [-0.880, 95],
    [-0.920, 80],
    [-0.960, 54],
    [-1.000, 0],
];
/*
 * TWO THINGS MOVED IN THE TABLE ABOVE, and both of them came off the frame.
 *
 * THE FOREHEAD USED TO BULGE. The old maximum was 106 at y = 0.260 to 0.320 —
 * ABOVE the brow — with the glabella half a millimetre behind it. That is an
 * infant's forehead: it swells forward over the brow and then falls away, which
 * is the single clearest "not an adult male" signal a profile can carry, and it
 * is most of why the head in `art/shots/base0/cards/headturn-profile_90_.png`
 * reads as a bald dome with a face pinned to the front of it. A man's frontal
 * bone rakes BACK from the ridge: the maximum is at the glabella now and the
 * plane gives up 3 mm by 0.36 and 8 by 0.60, which is about 12 degrees of rake.
 *
 * THE LOWER FACE USED TO BE A WALL. Holding 104–104.5 from the eye line to
 * pogonion means the maxilla, the lip block and the chin all stand on the same
 * vertical plane, and the relief then has to build a mouth on top of a surface
 * that is already as far forward as the brow — which is a pouch. It now recedes
 * 4 mm from the eye line to the mentolabial and comes back 2 for the chin, so
 * the chin is a BOX standing proud of the plane above it rather than the bottom
 * of a barrel.
 */
/**
 * The back of the skull, same units. The knee between `-0.570` and `-0.680` is
 * the gonial angle: above it the posterior border of the ramus runs almost
 * straight up toward the ear, below it the inferior border of the mandible turns
 * forward under the throat, and the corner between those two directions is what
 * a profile reads as a jaw.
 *
 * It is authored here and nowhere else, which is the fix for the failure the
 * gate's S4 note records: for six passes the gonion was pushed LATERALLY, and a
 * lateral push does not move one point of a side-on outline.
 */
const C_OCC = [
    [1.000, 0],
    [0.988, -21],
    [0.965, -35],
    [0.930, -49],
    [0.880, -64],
    [0.810, -80],
    [0.720, -93],
    [0.600, -104],
    [0.450, -112],
    [0.300, -117],
    [0.120, -120],
    [0.020, -120],
    [-0.116, -116],
    [-0.250, -112],
    [-0.380, -107],
    [-0.500, -101],
    [-0.570, -96],
    [-0.625, -91],
    [-0.685, -77],
    [-0.750, -58],
    [-0.820, -42],
    [-0.880, -27],
    [-0.940, -14],
    [-1.000, 0],
];
/**
 * WHERE EACH LATITUDE SITS, as a fraction of head height below the crown.
 *
 * The last thing on this head that was still a formula rather than a table, and
 * the frame is what found it: the old map put the base of the nose at 0.598 of
 * head height and the mouth at 0.719, against a Farkas adult male's 0.69 and
 * 0.78 rescaled to this head. Twenty-three millimetres of nose and sixteen of
 * mouth, both too high — which does not read as "the features are high", it
 * reads as A LONG CHIN, because everything the eye has left to measure is the
 * gap underneath them. `art/shots/v3/cards/headturn-front_0_.png` is 79 mm from
 * the lip to the menton where life is 58.
 *
 * It is a table now, so the layout can be read rather than solved, and the
 * correction is taken as far as `midThird` and `lowerThird` will carry it: the
 * subnasale to 0.632 and the stomion to 0.758. Their tolerances are what stops
 * it going the rest of the way, and they are the next thing to argue with — the
 * arithmetic above is Farkas, and neither target agrees with it.
 *
 * Total head height is unchanged (`2 * R.y * F.tall + MANDIBLE`), so `headCount`,
 * every helm cut, every `lat()` and the whole neck solve are untouched.
 */
const C_H = [
    [1.000, 0],
    [0.700, 0.134],
    [0.420, 0.259],
    [0.219, 0.350], //  BROW — the helm datum, and the top of the forehead's rake
    [0.050, 0.428],
    [-0.116, 0.500], // EYE LINE — half way down the head, where a man's is
    [-0.231, 0.578], // PRONASALE
    [-0.323, 0.632], // SUBNASALE
    [-0.430, 0.696],
    [-0.536, 0.758], // STOMION
    [-0.660, 0.826],
    [-0.796, 0.893], // POGONION
    [-0.900, 0.944],
    [-1.000, 1.000], // MENTON
];
/** Where the widest point of each section sits in z. A skull's broadest line
 *  runs a little behind its middle, and the ear canal with it. Small on purpose:
 *  this is the one number that silently sets how DEEP the front half of the head
 *  is, and at -10 it put 10 mm onto the face's semi-depth, which is most of an
 *  extra centimetre of fall between the cheek and the ear — S7's `cheekPlane`,
 *  and the wedge the owner is looking at. */
const C_ZC = [
    [1.000, 0],
    [0.600, 2],
    [0.200, 4],
    [-0.116, 4],
    [-0.400, 3],
    [-0.700, 1],
    [-1.000, 0],
];
/**
 * How FLAT each section is across the front — the exponent of the superellipse
 * the section is drawn as. 2.0 is an ellipse; a face is not an ellipse.
 *
 * This one number per row is the whole of S7 and most of the "small face on a
 * large dome" that three separate judgements have logged. On an ellipse a
 * mid-face has given up 13 mm of its projection by 0.6 radians off the midline,
 * so the front of the head is a curve and the only part of it facing the camera
 * is a strip down the middle — which is exactly the wedge in the owner's
 * capture, and no amount of relief fixes it because the relief is not where the
 * fault is. A maxilla is a PLATE: at 3.3 the same section gives up 5 mm, the
 * cheek presents a plane to the key, and the face fills the front of the skull.
 *
 * It comes back down over the vault, because a cranium really is a dome, and
 * over the chin, because a chin really is round.
 */
const C_NF = [
    [1.000, 2.05],
    [0.700, 2.10],
    [0.500, 2.18],
    [0.320, 2.32],
    [0.219, 2.38],
    [0.000, 2.44],
    [-0.323, 2.62],
    [-0.536, 3.18],
    [-0.700, 2.66],
    [-0.850, 2.20],
    [-1.000, 2.00],
];
/*
 * AND IT CAME DOWN, because at 2.75-3.30 this number was drawing the hard
 * vertical line down each side of the face that the owner has reported three
 * times and that three passes have gone looking for in the wrong place.
 *
 * A superellipse does not have a corner — it is smooth at every point — but its
 * CURVATURE is not spread evenly, and past about 2.6 it is nearly all in one
 * band. Measured on this head's own sections: at n = 2.98 the surface normal
 * turns 2.0 radians per radian of bearing at 0.71 rad off the midline and 0.1 at
 * the midline, so the front of the face is a flat plate, the side of the head is
 * a flat plate, and between them is a chamfer 15 mm wide that runs from the
 * crown to the jaw without ever touching a piece of anatomy. Under a specular
 * skin that chamfer is a line. At 2.38 the same figure is 1.34 against a
 * sphere's 1.0, which the eye reads as a cheek rather than as an edge.
 *
 * The plane the face needs is still there. It is in `RELIEF` now, where its
 * outer boundary can WANDER — out to 0.80 rad at the temple, 0.62 at the
 * cheekbone, 0.46 at the mouth — which is what the break does on a real head and
 * what one number per row could never say.
 *
 * The mouth's row is the exception at 3.18, and that is the gate rather than the
 * eye: `platePlane` measures the fall from 0.15 to 0.60 rad at the lip line and
 * its ceiling is 24 mm. A section 149 mm wide and 203 deep gives up 24.4 of its
 * own accord at n = 2.0 — the assertion is measuring the section's aspect as
 * much as its flatness — so the lower face keeps enough exponent to stay inside
 * it. It is also the one band where the chamfer costs least, because the jaw's
 * own shadow is already on it.
 */
/** The same for the back of the head. Blunter than a sphere at the occiput — the
 *  Suffolk cemetery skulls are — and round everywhere else. */
const C_NB = [
    [1.000, 2.10],
    [0.400, 2.25],
    [0.000, 2.40],
    [-0.500, 2.25],
    [-1.000, 2.00],
];
// ------------------------------------------------------------
// THE FACE, AS A RELIEF TABLE
// ------------------------------------------------------------
/**
 * The bearings the relief is authored at, in radians off dead ahead. Eleven
 * columns from the midline to the side of the head, close together at the front
 * because that is where a face is: at the eye line they land at roughly 0, 10,
 * 21, 33 and 46 mm off the centreline, which is the midline, the side of the
 * dorsum, the alar crease, and the inner and outer canthus.
 */
const REL_B = [0, 0.10, 0.20, 0.32, 0.46, 0.62, 0.80, 1.00, 1.22, 1.45, 1.5708];
/**
 * THE FACE. Each row is one horizontal cross-section of the head, drawn as a
 * single outline: how far the skin stands off the section at each of the eleven
 * bearings, in millimetres, along the section's own outward normal.
 *
 * Read a row and the section is drawn. `-0.231` is the nose tip's: 21.5 mm at the
 * midline, 16.5 down the side of the dorsum, 7 at the wing, back to the plane by
 * the alar crease, and a couple of millimetres of cheekbone out at 0.62. That is
 * a nose, drawn once, and nothing else on the head is added to it.
 *
 * Three properties, because they are the ones eight passes could not hold:
 *
 *   THE LAST COLUMN IS ZERO ON EVERY ROW. The relief dies at the side of the
 *   head by construction, so a facial feature can never widen the skull and can
 *   never leave a shoulder down the cheek.
 *
 *   COLUMN 0 IS THE PROFILE. Added to `C_MASK` it is the sagittal outline, so
 *   the nose leads the lip band by 17 mm and pogonion sits within a millimetre
 *   or two of the glabella because those numbers are written here — not because
 *   forty gaussians happened to sum that way.
 *
 *   ROWS DO NOT INTERACT. A brow that is too heavy is one row of eleven numbers.
 *   It used to be four terms whose gaussians reached the socket, the temple and
 *   the nasal root, which is why correcting it broke three other things.
 */
const RELIEF = [
    //   y        0    0.10   0.20   0.32   0.46   0.62   0.80   1.00   1.22  1.45  pi/2
    [0.620, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0.480, 0.2, 0.3, 0.5, 0.6, 0.5, 0.2, 0, 0, 0, 0, 0],
    [0.360, 1.0, 1.2, 1.8, 2.0, 1.6, 0.6, -0.5, -0.7, -0.3, 0, 0],
    [0.270, 2.2, 2.6, 3.4, 3.6, 2.8, 1.0, -1.3, -1.8, -0.8, -0.2, 0],
    [0.219, 3.8, 4.4, 5.6, 5.8, 4.4, 1.4, -1.7, -2.4, -1.1, -0.2, 0], // GLABELLA
    [0.170, 5.8, 6.4, 7.4, 7.4, 5.6, 1.8, -2.0, -2.8, -1.3, -0.3, 0], // BROW CREST
    [0.120, 3.8, 5.0, 7.2, 7.2, 5.2, 1.4, -2.2, -3.0, -1.4, -0.3, 0], // under the ridge
    [0.070, -2.6, -0.2, 5.2, 5.8, 3.8, 0.6, -2.2, -3.0, -1.4, -0.3, 0], // NASION notch
    [0.020, 0.2, 2.0, 3.8, 4.0, 2.2, -0.2, -2.0, -2.6, -1.2, -0.2, 0],
    [-0.030, 3.2, 3.8, 0.8, -3.2, -3.6, -1.6, -1.6, -2.0, -0.9, -0.2, 0], // orbital rim
    [-0.075, 6.6, 5.8, -1.2, -8.0, -7.8, -2.6, -1.4, -1.8, -0.8, -0.2, 0],
    [-0.116, 10.5, 8.6, -1.0, -8.6, -7.8, -1.6, -1.0, -1.4, -0.6, -0.1, 0], // EYE LINE + SOCKET
    [-0.180, 20.0, 16.4, 3.4, -3.6, 1.0, 8.0, 5.0, 0.2, 0, 0, 0], //      the ZYGOMATIC
    [-0.231, 30.0, 26.0, 9.0, -2.2, 2.2, 8.4, 4.6, 0.0, 0, 0, 0], //      PRONASALE
    [-0.270, 25.5, 22.0, 9.6, -2.0, 1.8, 7.4, 4.0, 0.0, 0, 0, 0], //      columella
    [-0.300, 13.5, 11.6, 8.6, -4.2, 0.8, 6.0, 3.4, 0.0, 0, 0, 0], //      the alar crease
    [-0.323, 2.6, 3.8, 5.6, -3.4, 0.4, 5.0, 3.0, 0.0, 0, 0, 0], //        SUBNASALE
    [-0.400, 2.8, 3.2, 3.2, -0.8, -3.0, 0.6, 1.6, 0.0, 0, 0, 0], //       philtrum, buccal begins
    [-0.470, 6.4, 5.8, 3.6, -2.6, -4.4, -1.2, 1.0, 0.0, 0, 0, 0], //      upper vermilion
    [-0.536, 3.2, 3.2, 2.4, -2.4, -4.6, -0.9, 0.8, 0.0, 0, 0, 0], //      STOMION
    [-0.600, 6.8, 6.4, 4.2, -1.8, -4.2, -1.4, 1.2, 0.0, 0, 0, 0], //      lower vermilion
    [-0.660, -1.6, -1.6, -2.2, -3.2, -3.4, -0.8, 1.8, 0.0, 0, 0, 0], //   mentolabial sulcus
    [-0.720, 4.2, 4.2, 3.2, 0.0, -2.2, -0.4, 1.6, 0.0, 0, 0, 0],
    [-0.796, 5.0, 4.8, 3.8, 0.8, -1.4, -0.2, 0.8, 0.0, 0, 0, 0], //       POGONION
    [-0.870, 2.2, 2.2, 1.6, 0.2, -0.8, 0, 0, 0, 0, 0, 0],
    [-0.940, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];
/*
 * WHAT CHANGED IN THE TABLE ABOVE, and it is four forms rather than forty
 * numbers. Read it against `art/shots/base0/cards/headturn-front_0_.png`, which
 * is the frame the owner called ugly and oddly shaped.
 *
 * 1. THERE IS A BROW. The ridge peaked at 5.8 mm over an orbit 8.5 mm deep, and
 *    on a 269 mm head under an ambient of 0.85 that is 14 mm of relief spread
 *    over 25 mm of height — a gradient, not a shelf, and it rendered as a
 *    perfectly smooth forehead with two dark chevrons drawn on it. The crest is
 *    7.4 now and it holds its height from 0.170 down to 0.120 before the notch,
 *    so the ridge has a FLAT UNDERSIDE that faces down. An overhang is a plane
 *    that faces down; a bump is not an overhang at any amplitude.
 *
 * 2. THERE IS A CHEEKBONE. The zygomatic column ran 5.0/6.5 at bearing 0.62 with
 *    NOTHING under it, so the malar was a soft swelling on a continuous cheek.
 *    It is 8.6/9.0 now and — the half that matters — the mouth rows carry a real
 *    HOLLOW at 0.46 (−4.4 against the old −2.4). A cheekbone is not a lump; it is
 *    a lump with a shadow under it, and the pair of them is the single form that
 *    separates a man in his twenties from a mannequin.
 *
 * 3. THERE IS A JAW. Every row below the subnasale used to be exactly zero from
 *    bearing 0.80 outward, so the mandible was whatever `C_W` happened to sweep.
 *    The masseter now stands 1.0–1.8 mm at 0.80 through the whole lip and chin
 *    block, which at those latitudes is 55–65 mm off the midline: the flat of the
 *    jaw, running back to the corner `C_W` breaks at.
 *
 * 4. THE DORSUM STARTS AT THE NOTCH. The midline used to go NEGATIVE from 0.070
 *    to 0.020 and only reach 8 mm by the eye line, so there was no nasal bridge
 *    between the eyes at all and the nose appeared out of a flat plain as a nub
 *    with two holes in it. It runs 0.2 → 3.2 → 6.6 → 10.5 → 18.5 → 29.0 now, one
 *    monotone ramp from the root to the tip.
 *
 * AND THE OUTER COLUMNS CAME IN. 0.80 through 1.45 used to carry −1.4 to −3.4 on
 * every row from the forehead to the base of the nose — a continuous trough down
 * the side of the head with a ridge outboard of it, which is one half of the
 * hard vertical line framing the face in that frame. (The other half was in
 * `faceComplexion`; see the note on `front` there.) They are now under 3 mm and
 * only in the temple band where a skull is actually hollow.
 */
/** One spline per relief column, built once at module load. */
const REL_COL = REL_B.map((_, k) => spl(RELIEF.map((r) => [r[0], r[k + 1]])));
const S_H = spl(C_H);
const S_W = spl(C_W);
const S_MASK = spl(C_MASK);
const S_OCC = spl(C_OCC);
const S_ZC = spl(C_ZC);
const S_NF = spl(C_NF);
const S_NB = spl(C_NB);
/** Bearings, in radians off dead ahead, that `headSilhouette` cuts sections at. */
const SECTION_BEARINGS = [0, 0.15, 0.30, 0.45, 0.60, 0.75, 0.90];
/** And the latitudes: brow, cheekbone, mouth, chin. */
const SECTION_LATITUDES = [Y_BROW, Y_EYE - 0.10, Y_LIP, Y_CHIN];
/** A raised-cosine window over a band: 1 in the middle, 0 outside, C1 at both
 *  ends. Used to say WHICH ROWS a trait owns. */
const bandOf = (y, a, b) => {
    const t = (y - a) / (b - a);
    if (t <= 0 || t >= 1)
        return 0;
    const c = Math.sin(Math.PI * t);
    return c * c;
};
/**
 * What the seed is allowed to do to the face: scale the relief, band by band.
 *
 * The whole of a warrior's anatomy variation is a multiplier on one row's
 * outline, and a multiplier on a bounded relief cannot compound into a species
 * the way five overlapping gaussian amplitudes did — the row is still the row. A
 * heavy brow is a heavier brow. It is not a heavier brow that has also moved the
 * nasal root, dug the socket and lengthened the temple, which is what `F.brow`
 * used to do because its gaussian reached all three.
 */
function reliefGain(F, y) {
    const b = bandOf(y, 0.36, 0.09);
    const s = bandOf(y, 0.12, -0.28);
    const n = bandOf(y, -0.05, -0.36);
    const l = bandOf(y, -0.38, -0.66);
    const c = bandOf(y, -0.62, -0.98);
    const k = 0.30;
    return (k + b * F.brow + s * F.deepSet + n * F.nose + l * F.lip + c * F.chin)
        / (k + b + s + n + l + c);
}
/** The seed's authority over the SECTION, which is deliberately far smaller than
 *  its authority over the relief: every helm in the shop is swept off this curve
 *  and a skull that moves ten per cent stops fitting them. */
function widthGain(F, y) {
    return 1
        + bandOf(y, -0.09, -0.34) * (F.cheek - 1) * 0.22
        + bandOf(y, -0.44, -0.74) * (F.jaw - 1) * 0.28
        - bandOf(y, -0.30, -0.62) * (F.gaunt - 1) * 0.10;
}
const _relV = new Float64Array(11);
const _relM = new Float64Array(11);
/**
 * The relief, read off the table: eleven column splines evaluated at this
 * latitude, then a monotone cubic across bearing between them.
 *
 * Monotone in both axes on purpose. An interpolant that can overshoot invents
 * relief between two authored rows, and a bump nobody wrote is exactly the class
 * of thing this rewrite exists to make impossible.
 */
function reliefAt(F, y, a) {
    const N = REL_B.length;
    if (a >= REL_B[N - 1])
        return 0;
    // The midline's own identity, in millimetres, on the three landmarks a profile
    // is judged by. Two millimetres cannot compound into anything, because the
    // table IS the outline and there is nothing underneath it to compound with.
    const jn = F.pNose * bandOf(y, -0.13, -0.34)
        + F.pLip * bandOf(y, -0.43, -0.65)
        + F.pChin * bandOf(y, -0.68, -0.92);
    let any = jn !== 0;
    for (let k = 0; k < N; k++) {
        const v = ev(REL_COL[k], y) + (k < 3 ? jn * (1 - k * 0.35) : 0);
        _relV[k] = v;
        if (v !== 0)
            any = true;
    }
    if (!any)
        return 0;
    for (let k = 0; k < N; k++) {
        const dPrev = k > 0 ? (_relV[k] - _relV[k - 1]) / (REL_B[k] - REL_B[k - 1]) : 0;
        const dNext = k < N - 1 ? (_relV[k + 1] - _relV[k]) / (REL_B[k + 1] - REL_B[k]) : 0;
        _relM[k] = k === 0 ? dNext : k === N - 1 ? dPrev : (dPrev + dNext) * 0.5;
    }
    for (let k = 0; k < N - 1; k++) {
        const dk = (_relV[k + 1] - _relV[k]) / (REL_B[k + 1] - REL_B[k]);
        if (dk === 0) {
            _relM[k] = 0;
            _relM[k + 1] = 0;
            continue;
        }
        const al = _relM[k] / dk;
        const be = _relM[k + 1] / dk;
        const s = al * al + be * be;
        if (s > 9) {
            const t = 3 / Math.sqrt(s);
            _relM[k] = t * al * dk;
            _relM[k + 1] = t * be * dk;
        }
    }
    let lo = 0;
    while (lo < N - 2 && REL_B[lo + 1] <= a)
        lo++;
    const h = REL_B[lo + 1] - REL_B[lo];
    const t = (a - REL_B[lo]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * _relV[lo] + (t3 - 2 * t2 + t) * h * _relM[lo]
        + (-2 * t3 + 3 * t2) * _relV[lo + 1] + (t3 - t2) * h * _relM[lo + 1];
}
/**
 * The head: a section at this latitude, drawn as a superellipse between the face
 * plane in front and the occiput behind, with the face's own relief standing off
 * it along the section's outward normal.
 *
 * `bearing` is the parameter and not an approximation of one: `dirOf(u, v)` puts
 * `atan2(|x|, z)` at exactly `|u|` whatever the latitude, so a column of the mesh
 * IS a bearing and the relief's columns land on the mesh's own rings.
 *
 * Everything worn on the head is sampled through this same function, so hair
 * sits on the skull it belongs to and war paint lies on the cheek rather than
 * hovering in front of it.
 */
function faceSurface(K, d, out) {
    const R = K.R;
    const F = K.F;
    const y = d.y;
    const sc = R.x / RX0; // class scale
    const sx = d.x < 0 ? -1 : 1;
    const a = Math.atan2(Math.abs(d.x), d.z); // 0 dead ahead, pi at the nape
    // The mandible hangs off the braincase, which is what turns a sphere into a
    // head. Unchanged from the field this replaces, because every landmark
    // constant, every helm cut and the whole `lat()` family are solved against it.
    const top = R.y * F.tall;
    const py = top - ev(S_H, y) * (2 * top + MANDIBLE);
    const hw = Math.max(1e-5, ev(S_W, y) * MM * sc * F.wide * widthGain(F, y));
    const zc = ev(S_ZC, y) * MM * sc;
    const fore = a < Math.PI * 0.5;
    const dep = Math.max(1e-5, fore
        ? (ev(S_MASK, y) * MM * sc - zc) * F.deep
        : (zc - ev(S_OCC, y) * MM * sc) * F.deep);
    const n = fore ? ev(S_NF, y) : ev(S_NB, y);
    // The RAY form of the superellipse: at bearing `b`, how far the outline stands
    // from the section's own centre. Solved rather than swept parametrically, and
    // that is not a matter of taste — the parametric form's `x` leaves the midline
    // with infinite slope whenever the section is flatter than an ellipse, so it
    // crowds every column of the nose into the first one and the nose is lost to
    // its own tessellation. This form keeps vertex spacing linear in x near the
    // midline, which is where a face needs its samples.
    const b = fore ? a : Math.PI - a;
    const si = Math.sin(b) / hw;
    const co = Math.cos(b) / dep;
    const P = Math.pow(si, n) + Math.pow(co, n);
    const r = Math.pow(P, -1 / n);
    let px = r * Math.sin(b) * sx;
    let pz = zc + (fore ? 1 : -1) * r * Math.cos(b);
    if (fore) {
        const rel = reliefAt(F, y, a) * MM * sc * reliefGain(F, y);
        if (rel !== 0) {
            // Along the SECTION's outward normal, not along z. A relief pushed down z
            // at the temple slides along the surface instead of off it — which is why
            // the temporal fossa used to need a term of its own in another axis, and
            // why every feature on the old field had to be given a `py` component by
            // hand before this rig's key could see it.
            const dP = n * Math.pow(si, n - 1) * (Math.cos(b) / hw)
                - n * Math.pow(co, n - 1) * (Math.sin(b) / dep);
            const dr = (-1 / n) * Math.pow(P, -1 / n - 1) * dP;
            const dx = dr * Math.sin(b) + r * Math.cos(b);
            const dz = dr * Math.cos(b) - r * Math.sin(b);
            const ln = Math.hypot(dx, dz) || 1;
            px += sx * (-dz / ln) * rel;
            pz += (dx / ln) * rel;
        }
        // A symmetric face is a mask. Two millimetres of drift on the midline
        // features, gone by the time the section reaches the ear.
        //
        // AND IT WAS SHEARING THE EYES, which is "theres wonky eyes".
        //
        // The term is a lateral push over the WHOLE front hemisphere whose weight
        // falls off with azimuth, so it is not a drift of the midline features: it
        // is a drift of everything in front, by an amount that changes as you go
        // round. Across one eye — 0.23 to 0.52 rad of azimuth — the weight runs
        // from 0.85 to 0.67, so the medial end of the socket moves 0.4 mm further
        // in +x than the lateral end does. On the +x eye that CLOSES the aperture
        // and on the −x eye it OPENS it, because +x is outboard on one side and
        // inboard on the other. Worse, `eyeFrame` takes the globe's centre from
        // one sample of this field and then `lidPatch` takes the lid's socket rim
        // from twenty more, so the globe gets a rigid offset while the lid it sits
        // in gets a graded one — and the lid is sheared off its own eye, one way
        // on the left and the other way on the right. That is the whole of "one
        // lid sits differently from the other", and it is why looking for it in
        // the eye code found nothing: it is not in the eye code.
        //
        // Real facial asymmetry is not a sideways slide of the orbits anyway. It
        // is a nose that leans, a mouth whose corners sit at different heights, a
        // chin off the midline — all of it BELOW the eyes. So the drift is now
        // windowed to the lower face: full from the nose base down, nothing at and
        // above the eye line, C1 across the join. The two orbits are built from
        // identical numbers again, and the face is still not a mask.
        px += F.asym * (1 - a / (Math.PI * 0.5)) * smooth(Y_EYE, Y_NOSE, y);
    }
    return out.set(px, py, pz);
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
function faceNormal(K, d, out) {
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
function faceNormalTrue(K, u, v, out) {
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
    if (out.lengthSq() < 1e-16)
        return faceNormal(K, dirOf(u, v, _tnd), out);
    out.normalize();
    // The cross product's sign follows the parameterisation, which flips across
    // the equator. Anchor it to the one direction that is unambiguously outward.
    if (out.dot(faceNormal(K, dirOf(u, v, _tnd), _tnu)) < 0)
        out.negate();
    return out;
}
export function headProbe(cls, seed) {
    const S = skeleton(BUILD[cls]);
    const K = { R: S.headR, F: faceTraits(seed) };
    const p = new THREE.Vector3();
    const d = new THREE.Vector3();
    const mm = 1000;
    // Front midline: the sagittal profile every one of the owner's five notes is
    // about. `y` is the surface field's own latitude sine.
    const front = (y) => {
        const c = Math.sqrt(Math.max(0, 1 - y * y));
        faceSurface(K, d.set(0, y, c), p);
        return { y: p.y, z: p.z };
    };
    const back = (y) => {
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
            if (p.y > top)
                top = p.y;
            if (p.y < bot)
                bot = p.y;
            if (p.z > fore)
                fore = p.z;
            if (p.z < aft)
                aft = p.z;
            const ax = Math.abs(p.x);
            if (ax > wide) {
                wide = ax;
                wideY = p.y;
            }
            // Bigonial and bizygomatic are *facial* breadths, so they are taken across
            // the front half only. Swept over the whole sphere they pick up the
            // parietal behind the ear instead and report a head that never narrows,
            // which is a measurement of nothing.
            if (d.z <= 0)
                continue;
            const fy = Math.sin(v);
            if (Math.abs(fy - Y_GONION) < 0.03 && ax > jawW)
                jawW = ax;
            if (Math.abs(fy - (Y_EYE - 0.10)) < 0.03 && ax > cheekW)
                cheekW = ax;
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
        if (f.z < nasion.z)
            nasion = f;
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
            if (p.z < tip.z - 0.003)
                continue;
            if (p.x < tipL)
                tipL = p.x;
            if (p.x > tipR)
                tipR = p.x;
        }
    }
    const tipWide = tipR > tipL ? tipR - tipL : 0;
    //
    // ---- THE MEASUREMENT THREE PASSES HAVE BEEN MISSING ----
    //
    // "The cranium dominates and the face is a small panel on its front-lower
    // quarter" has now been logged by three separate judgements while every ratio
    // above says the proportions are canon: `craniumShare` 0.338 against 0.35,
    // `breadthOverHeight` 0.703 against a life 0.67. Both are true and neither is
    // the thing being looked at, because both measure the HEAD and the complaint is
    // about the FACE — specifically about how much of the head's breadth the face
    // occupies before the surface turns away toward the ear.
    //
    // So: at the eye line, find the bearing at which the surface has fallen 15 mm
    // behind the CHEEK — where a viewer stops reading "face" and starts reading
    // "side of head". Against the head's full breadth at the same latitude, life is
    // about 0.72: a man's face fills most of the front of his skull.
    //
    // THE DATUM IS AT BEARING 0.30, NOT AT THE MIDLINE, and the first cut of this
    // took it at the midline and reported 0.116 — a face a ninth of the head's
    // breadth, which would have sent the next pass off to widen a face that is not
    // narrow. `headSilhouette`'s own S7 note says exactly why and this file made the
    // mistake anyway: at the eye line the midline is the NOSE, so a fall measured
    // from bearing zero is the nose's own falloff and says nothing about the cheek.
    // 0.30 rad is outside the alar crease, which is where `cheekPlane` starts for
    // the same reason.
    //
    // Reported rather than acted on this pass. It is the instrument the next one
    // needs; it is not a licence to tune against it without looking.
    let faceHalf = 0, headHalfAtEye = 0;
    {
        const fy = Y_EYE;
        const cv = Math.sqrt(Math.max(0, 1 - fy * fy));
        faceSurface(K, d.set(Math.sin(0.30) * cv, fy, Math.cos(0.30) * cv), p);
        const cheekZ = p.z;
        for (let i = 0; i <= 300; i++) {
            const t = (i / 300) * Math.PI;
            faceSurface(K, d.set(Math.sin(t) * cv, fy, Math.cos(t) * cv), p);
            headHalfAtEye = Math.max(headHalfAtEye, Math.abs(p.x));
            if (t >= 0.30 && t < Math.PI / 2 && p.z >= cheekZ - 0.015)
                faceHalf = Math.max(faceHalf, Math.abs(p.x));
        }
    }
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
        /** Breadth of the FACE PANEL at the eye line — where the surface has fallen
         *  15 mm behind the frontmost point — over the head's own breadth there. */
        facePanel: faceHalf / Math.max(1e-6, headHalfAtEye),
        facePanelBreadth: faceHalf * 2 * mm,
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
    0.0335, // up — the helix apex
    0.0300, // up-front
    0.0180, // front — the margin in front of the tragus, and an ear is narrow here
    0.0205, // front-down
    0.0260, // down — the lobe
    0.0255, // back-down
    0.0215, // back
    0.0305, // back-up, where the helix rolls over
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
const EAR_SECTION = [
    [1.00, -EAR_SEAT], // the rim, buried
    [0.93, 0.0026],
    [0.84, 0.0122], //   the helix climbing
    [0.74, 0.0150], //   HELIX CREST — and it is a ROLL, held over two rows
    [0.62, 0.0112], //   the inner wall of the rim, falling into the bowl
    [0.46, 0.0038], //   the concha floor
    [0.20, 0.0026], //   the deepest part of the bowl, over the canal
    [0.00, 0.0034], //   the pole. Closed, and that is the whole point
];
/*
 * THE CREST MOVED IN AND THE WALL GOT LONGER, and that is the difference between
 * an ear and the crumpled paper cup in
 * `art/shots/base0/cards/headturn-profile_90_.png`.
 *
 * The old section put a 16 mm crest at s = 0.78 and buried the rim 3 mm at
 * s = 1.00: 19 mm of fall across 22% of a 30 mm radius, which is an outer wall
 * raked at seventy degrees. A wall that steep takes the key square on all the way
 * round, so what the frame showed was a bright ring with a dark hole in it — the
 * exact read the five primitives before it were replaced for. A helix is a rolled
 * TUBE. It has a crest that holds over an arc and falls away on both sides, and
 * this one does.
 */
/** And the section a LOBE has, which is not a rim round a bowl at all — it is
 *  solid flesh, so it is one smooth bulge that lands on the skin like everything
 *  else does. The two sections are crossfaded round the ear by `earHollow`. */
const LOBE_SECTION = [
    [1.00, -EAR_SEAT],
    [0.86, 0.0030],
    [0.55, 0.0092],
    [0.22, 0.0086],
    [0.00, 0.0070],
];
/** How much of the rim-and-hollow the section keeps, per angle round the ear:
 *  1 at the top and back where the helix is, falling to nothing at the lobe. */
const earHollow = (phi) => 1 - 0.90 * Math.pow(0.5 - 0.5 * Math.cos(phi), 2.5);
/** Cosine interpolation round the outline table. Cosine and not linear because a
 *  linear join between control points is a corner, and eight corners round an ear
 *  is a stop sign. */
function earRadius(phi) {
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
function earRelief(phi, s) {
    const anti = bump(s - 0.50, 0, 0, 0.13, 1, 1)
        * clamp01(0.15 + 0.85 * (0.5 - 0.5 * Math.cos(phi - 0.6)));
    const tragus = bump(s - 0.42, 0, 0, 0.16, 1, 1)
        * bump(Math.sin(phi - Math.PI / 2), 0, 0, 0.34, 1, 1) * clamp01(Math.cos(phi - Math.PI / 2));
    return 0.0034 * anti + 0.0038 * tragus;
}
/** Half-breadth of the SKIN at a latitude — what an ear has to grow out of. */
function skullHalfWidth(K, fy) {
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
function skinAt(K, fy, tz) {
    const d = new THREE.Vector3();
    const p = new THREE.Vector3();
    const cv = Math.sqrt(Math.max(0, 1 - fy * fy));
    let best = 0, bestD = Infinity;
    for (let i = 0; i <= 72; i++) {
        const t = (i / 72) * Math.PI;
        faceSurface(K, d.set(Math.sin(t) * cv, fy, Math.cos(t) * cv), p);
        const e = Math.abs(p.z - tz);
        if (e < bestD) {
            bestD = e;
            best = Math.abs(p.x);
        }
    }
    return best;
}
/**
 * The auricle's whole geometry, as numbers, in the ear's own frame.
 *
 * `ex` is toward the face, `ey` is up the ear, `ez` is out of the skull measured
 * from the `earRootX` plane — which is exactly the head's own `|x|` offset,
 * because the ear frame's rotation carries local z onto head x untouched.
 */
function earPoint(K, earRootX, phi, s) {
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
// NINE radial steps, not seven, and the number is chosen to LAND ON the section's
// control points rather than to be smoother in general. At seven, `s` samples at
// 0.571 and 0.714 and the helix crest sits at 0.78 — between two rings — so the
// rim was reconstructed as a chord across its own peak and the facets read as a
// spider of radial creases in the bowl on the first capture of this shell. At
// nine the rings land at 0.222, 0.444 and 0.778 against control points at 0.20,
// 0.44 and 0.78: the crest, the floor and the canal each get a ring on them.
const EAR_NS = 9;
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
function auricle(K, earRootX, side) {
    const pos = [], uv = [];
    // Rings 1..NS, then ONE shared pole. Fanning EAR_NA coincident vertices at the
    // centre instead is what put a visible star in the middle of the concha on the
    // first capture: `computeVertexNormals` gives each copy the normal of its own
    // two triangles, and 28 disagreeing normals at one point is a pinch. One vertex
    // has one normal.
    for (let j = 1; j <= EAR_NS; j++) {
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
    const POLE = EAR_NS * EAR_NA;
    {
        const p = earPoint(K, earRootX, 0, 0);
        pos.push(0, 0, p.ez);
        uv.push(0.5, 0);
    }
    const at = (j, i) => (j === 0 ? POLE : (j - 1) * EAR_NA + i);
    const band = (lo, hi) => {
        const idx = [];
        for (let j = 0; j < EAR_NS; j++) {
            const s = (j + 0.5) / EAR_NS;
            if (s < lo || s >= hi)
                continue;
            for (let i = 0; i < EAR_NA; i++) {
                const i1 = (i + 1) % EAR_NA;
                const a = at(j, i), b = at(j, i1), c = at(j + 1, i), d = at(j + 1, i1);
                if (side > 0)
                    idx.push(a, c, d, a, d, b);
                else
                    idx.push(a, d, c, a, b, d);
            }
        }
        return idx;
    };
    const make = (idx) => finish(pos.slice(), uv.slice(), idx);
    return {
        // The bowl, in the shade tone: at 60 mm a hollow cannot out-shade its own rim
        // on geometry alone, and this is the one place on a head where the tone is
        // doing work the light cannot. It is a hollow now rather than a hole, so the
        // tone is agreeing with the form instead of standing in for it.
        shade: make(band(0, 0.50)),
        // And the rest is ONE material. The lobe used to be given the warm tone,
        // which is right on a 10 mm ball and wrong on a band of a shell: `warm` is
        // 0xc4816a against a 0xd4a884 base — redder AND relatively bluer — and over a
        // crescent that falls into the ear's own shadow it rendered as the magenta
        // fringe down the front of the first capture of this shell. A bruise is worse
        // than no translucency. The warmth belongs in `faceComplexion`, which already
        // runs over these vertices and has no boundary for a fringe to live on.
        skin: make(band(0.50, 1.01)),
    };
}
function earProbe(K, earRootX) {
    // Deliberately NOT `p.stand`, even though the two are equal on this build.
    // Reading the authored table back would make every assertion below a tautology
    // that passes whatever the mesh does — which is precisely how S6 came to pass at
    // 12.7 mm on an ear you could see the palisade through. So each vertex is taken
    // at the position it is BUILT at, `earRootX + ez`, and compared against a fresh
    // measurement of the skin at that vertex's own latitude and depth. Seat the ear
    // on a plane again, as the five primitives did, and this reports the gap.
    const clear = (p) => (earRootX + p.ez) - skinAt(K, p.fy, p.tz);
    let standoff = -Infinity, floor = Infinity, seat = -Infinity;
    for (let i = 0; i < EAR_NA * 2; i++) {
        const phi = (i / (EAR_NA * 2)) * Math.PI * 2;
        for (let j = 0; j <= EAR_NS * 2; j++) {
            const c = clear(earPoint(K, earRootX, phi, j / (EAR_NS * 2)));
            if (c > standoff)
                standoff = c;
            // The aperture: everything inside the helix crest, which is what a camera
            // looking down the ear's axis sees through the rim.
            if (j <= EAR_NS * 1.2 && c < floor)
                floor = c;
        }
        const rim = clear(earPoint(K, earRootX, phi, 1));
        if (rim > seat)
            seat = rim;
    }
    return {
        standoff: standoff * 1000,
        floor: floor * 1000,
        seat: seat * 1000,
        bowl: (standoff - floor) * 1000,
    };
}
export function headSilhouette(cls, seed) {
    const S = skeleton(BUILD[cls]);
    const K = { R: S.headR, F: faceTraits(seed) };
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
            sy[m] = p.y;
            sz[m] = p.z;
            m++;
            if (p.y > top)
                top = p.y;
            if (p.y < bot)
                bot = p.y;
            if (p.z > fore)
                fore = p.z;
            if (p.z < aft)
                aft = p.z;
            if (d.z > 0 && Math.abs(fy - Y_GONION) < 0.03)
                jawHW = Math.max(jawHW, Math.abs(p.x));
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
        if (t < 0)
            t += Math.PI * 2;
        const k = Math.round((t / (Math.PI * 2)) * N) % N;
        if (r > rad[k])
            rad[k] = r;
    }
    // A bin can come up empty at the poles where the sampling grid crowds; fill it
    // from its neighbours rather than leaving a spike the turn test would read as a
    // gonial angle.
    for (let k = 0; k < N; k++) {
        if (rad[k] >= 0)
            continue;
        let a = k, b = k;
        while (rad[(a + N - 1) % N] < 0)
            a--;
        while (rad[(b + 1) % N] < 0)
            b++;
        const ra = rad[((a - 1) % N + N) % N], rb = rad[(b + 1) % N];
        rad[k] = mix(ra, rb, (k - a + 1) / (b - a + 2));
    }
    const ys = [], zs = [];
    for (let k = 0; k < N; k++) {
        const t = (k / N) * Math.PI * 2;
        ys.push(cy + rad[k] * Math.cos(t));
        zs.push(cz + rad[k] * Math.sin(t));
    }
    const at = (fy) => {
        const c = Math.sqrt(Math.max(0, 1 - fy * fy));
        faceSurface(K, d.set(0, fy, c), p);
        return p.y;
    };
    // Transverse sections. Bearing is swept on the sphere at a fixed latitude, so
    // the three samples sit at the same height as the midline one they are
    // compared to — a section, not a diagonal.
    const sectionAt = (fy) => {
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
function dirOf(u, v, out) {
    const cv = Math.cos(v);
    return out.set(Math.sin(u) * cv, Math.sin(v), Math.cos(u) * cv);
}
export function wearNormalProbe(cls, seed) {
    const S = skeleton(BUILD[cls]);
    const K = { R: S.headR, F: faceTraits(seed) };
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
            if (nt.lengthSq() < 1e-18)
                continue;
            nt.normalize();
            faceNormal(K, dirOf(u, v, d), na);
            // The patch winding can hand back the inward normal; the angle we want is
            // between the two outward directions.
            if (nt.dot(na) < 0)
                nt.negate();
            const ang = Math.acos(Math.min(1, Math.max(-1, nt.dot(na)))) * deg;
            sumAll += ang;
            nAll++;
            if (ang > maxAll) {
                maxAll = ang;
                maxAllU = u;
                maxAllV = v;
            }
            const clear = Math.cos(ang / deg);
            if (clear < worstClear)
                worstClear = clear;
            // brow to crown-of-ear, all the way round: where a bowl or a hood lives.
            if (v > lat(-0.10) && v < lat(0.72)) {
                sumBand += ang;
                nBand++;
                if (ang > maxBand)
                    maxBand = ang;
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
/**
 * Tabulate the skin's radius from the skull centre over direction.
 *
 * Sampled twice as finely in (u, v) as the table is in (az, el) and reduced with
 * `max`, because a bin that took the *last* sample to land in it would step down
 * over the nose and report air as skin — and a clearance test that under-reads
 * the skin passes exactly the shells it exists to fail.
 */
function surfaceRadii(sample, na = 192, ne = 96) {
    const r = new Float64Array(na * ne);
    const p = new THREE.Vector3();
    const su = na * 2, sv = ne * 2;
    for (let j = 0; j <= sv; j++) {
        const v = -Math.PI / 2 + (j / sv) * Math.PI;
        for (let i = 0; i < su; i++) {
            const u = (i / su) * Math.PI * 2;
            sample(u, v, p);
            const len = p.length();
            if (len < 1e-6)
                continue;
            const az = Math.atan2(p.x, p.z);
            const el = Math.asin(Math.min(1, Math.max(-1, p.y / len)));
            const ai = Math.min(na - 1, Math.max(0, Math.floor(((az + Math.PI) / (Math.PI * 2)) * na)));
            const ei = Math.min(ne - 1, Math.max(0, Math.floor(((el + Math.PI / 2) / Math.PI) * ne)));
            const k = ei * na + ai;
            if (len > r[k])
                r[k] = len;
        }
    }
    // Any bin the sweep missed — they exist at the poles, where the (u, v) grid
    // crowds — borrows its neighbour rather than reading zero, which would call
    // the whole skull hollow and pass everything.
    for (let ei = 0; ei < ne; ei++) {
        for (let ai = 0; ai < na; ai++) {
            const k = ei * na + ai;
            if (r[k] > 0)
                continue;
            let best = 0;
            for (let dj = -1; dj <= 1; dj++) {
                for (let di = -1; di <= 1; di++) {
                    const e2 = ei + dj, a2 = (ai + di + na) % na;
                    if (e2 < 0 || e2 >= ne)
                        continue;
                    best = Math.max(best, r[e2 * na + a2]);
                }
            }
            r[k] = best;
        }
    }
    return { na, ne, r };
}
const _srD = new THREE.Vector3();
function skinRadii(K, na = 192, ne = 96) {
    return surfaceRadii((u, v, out) => faceSurface(K, dirOf(u, v, _srD), out), na, ne);
}
const _sgP = new THREE.Vector3();
/**
 * TRUE DAYLIGHT: how far it is from a point on the inside of a plate, straight
 * down the plate's own normal, to the flesh.
 *
 * `skinClearance` is RADIAL from the skull's centre, and radial is the wrong
 * ruler for this question anywhere the head undercuts. Beside the jaw the skin
 * radius falls away fast with elevation, so a cheek guard that follows the
 * mandible perfectly — constant lift along its own normal, metal lying on the
 * bone — reads 60 mm of "clearance" radially and 8 mm to the eye. Gating on the
 * radial number would fail every correctly-built guard in the shop and pass a
 * flat plate held out in front of the ear, which is the exact inversion of what
 * this is for.
 *
 * So: march inward along `n` until the clearance changes sign, then bisect.
 * `cap` is both the search limit and the answer when the ray never finds flesh,
 * which is itself the verdict — a plate with more than `cap` of air behind it is
 * not being worn.
 */
function skinGap(tab, p, n, cap = 0.075) {
    if (skinClearance(tab, p) <= 0)
        return 0;
    const STEPS = 24;
    let lo = 0, hi = cap, found = false;
    for (let i = 1; i <= STEPS; i++) {
        const d = (i / STEPS) * cap;
        _sgP.copy(p).addScaledVector(n, -d);
        if (skinClearance(tab, _sgP) <= 0) {
            hi = d;
            lo = ((i - 1) / STEPS) * cap;
            found = true;
            break;
        }
    }
    if (!found)
        return cap;
    for (let i = 0; i < 8; i++) {
        const m = (lo + hi) * 0.5;
        _sgP.copy(p).addScaledVector(n, -m);
        if (skinClearance(tab, _sgP) <= 0)
            hi = m;
        else
            lo = m;
    }
    return (lo + hi) * 0.5;
}
/** How far outside the skin a point is, in metres. Negative is inside it. */
function skinClearance(tab, p) {
    const len = p.length();
    if (len < 1e-6)
        return -len;
    const az = Math.atan2(p.x, p.z);
    const el = Math.asin(Math.min(1, Math.max(-1, p.y / len)));
    const ai = Math.min(tab.na - 1, Math.max(0, Math.floor(((az + Math.PI) / (Math.PI * 2)) * tab.na)));
    const ei = Math.min(tab.ne - 1, Math.max(0, Math.floor(((el + Math.PI / 2) / Math.PI) * tab.ne)));
    return len - tab.r[ei * tab.na + ai];
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
export function helmFitProbe(cls, seed, helm) {
    const spy = [];
    const rspy = [];
    const prev = _wearSpy;
    const prevR = _ringSpy;
    _wearSpy = spy;
    _ringSpy = rspy;
    try {
        const ap = { ...defaultAppearance(cls), helm };
        buildCharacter(cls, ap, 0x8a6b3f, undefined, "high", seed);
    }
    finally {
        _wearSpy = prev;
        _ringSpy = prevR;
    }
    // The same skull `buildCharacter` just used: `identity` is the seed it was
    // handed, and the stature step it quantises to scales the skeleton the head is
    // measured in, so the skull has to be rebuilt through the same two lines.
    const step = Math.round(hash(seed, 31) * 2) - 1;
    const B = BUILD[cls] ?? BUILD.warden;
    const S = skeleton({ ...B, stature: B.stature * (1 + step * 0.022) });
    const K = { R: S.headR, F: faceTraits(seed) };
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
    const gnrm = new THREE.Vector3();
    const dd = new THREE.Vector3();
    // Sampled the way the shell was built: on the low-passed form if it is a helm
    // piece, on the skin if it is hair or a beard. Measuring a form-swept shell
    // against the skin's own normals would report folds that are not in the metal
    // — and, worse, would miss the ones that are.
    const F = helmForm(K);
    // And the radial table of the FORM, for the flare measurement below. The
    // skin's own table is the wrong ruler for that one: the form is a 12 mm
    // low-pass with nothing on it under a 45 mm radius, but the SKIN has an ear on
    // it, and an ear standing 20 mm out under a plate makes the gap under that
    // plate collapse and reopen over 15 mm of travel. Differentiated, that is a
    // 60 deg flare reported on a bowl that has none — measured on the band, the
    // bowl and every brow plate in the shop before this table existed. Flare is a
    // property of the PLATE against the SKULL, so it is measured against the
    // block the plate was beaten over.
    const formTab = surfaceRadii((u, v, out) => formSurface(F, u, v, out));
    /**
     * The same table with a NECK under it, and it exists because the deep nape
     * guard's floor is 1.05 head-radii below the skull's centre — off the bottom
     * of the head mesh entirely. `skinRadii` tabulates the HEAD, so every ray cast
     * inward from the guard's lower rim ran to the end of its 75 mm search without
     * finding flesh, and the gate read a plate hanging 23 mm off a neck as a plate
     * hanging in space. That is the third time a bar in this file has been aimed at
     * the wrong object; it is cheaper to give the ruler a neck than to tune metal
     * to a number that is not measuring it.
     *
     * The neck is an infinite vertical cylinder of the skeleton's own half-width,
     * taken only where it lies below the skull's lower third so it cannot reach up
     * and fill in the jaw. Below the shoulder it under-reads, which errs toward
     * failing a plate rather than passing one.
     */
    const withNeck = (src) => {
        const out = { na: src.na, ne: src.ne, r: Float64Array.from(src.r) };
        const rn = S.neckHW;
        for (let ei = 0; ei < src.ne; ei++) {
            const el = -Math.PI / 2 + ((ei + 0.5) / src.ne) * Math.PI;
            const cy = Math.cos(el);
            if (cy < 1e-3)
                continue;
            const t = rn / cy;
            if (t * Math.sin(el) > -K.R.y * 0.35)
                continue;
            for (let ai = 0; ai < src.na; ai++) {
                const k = ei * src.na + ai;
                if (t > out.r[k])
                    out.r[k] = t;
            }
        }
        return out;
    };
    const at = (o, t, s, drop, out) => {
        const u = mix(o.u0, o.u1, t);
        const v = mix(o.v0(u), o.v1(u), s);
        if (o.form) {
            formSurface(F, u, v, out);
            if (drop !== 0)
                out.addScaledVector(formNormal(F, u, v, ntrue), drop);
            return out;
        }
        faceSurface(K, dirOf(u, v, dd), out);
        if (drop !== 0) {
            faceNormalTrue(K, u, v, ntrue);
            out.addScaledVector(ntrue, drop);
        }
        return out;
    };
    /** The direction this shell's lift was applied in, at (t, s). */
    const nrmAt = (o, t, s, out) => {
        const u = mix(o.u0, o.u1, t);
        const v = mix(o.v0(u), o.v1(u), s);
        return o.form ? formNormal(F, u, v, out) : faceNormalTrue(K, u, v, out);
    };
    const shells = [];
    for (const o of spy) {
        // Untagged shells are hair, beard and war paint — a different owner's
        // geometry and a different owner's gate. This one holds helmets.
        if (!o.tag)
            continue;
        // Denser than the shell is tessellated, because a fold can open between two
        // of its own spans and still be a hole in the metal on screen.
        const NU = Math.max(12, o.nu * 3);
        const NV = Math.max(8, o.nv * 3);
        const ht = 0.25 / NU, hs = 0.25 / NV;
        let punch = 0, through = 0, standoff = 0, minLift = Infinity;
        let tu2 = NaN, tv2 = NaN;
        let gap = 0, gu = NaN, gv = NaN, flare = 0, flu = NaN, flv = NaN;
        let e0 = 0, e1 = 0, e0y = Infinity, e1y = Infinity;
        // The fold verdict is deferred, because it needs a scale. Every patch on a
        // sphere has samples where its own parameterisation collapses — at a pole
        // the u-tangent goes to nothing — and there the cross product is the
        // direction of the rounding error, so it flips sign at random. Those samples
        // are not folded metal; they are a coordinate singularity, and counting them
        // put a permanent 0.1-1% on the bowl and the band that no helmet could ever
        // clear. So the skin's own area element is measured alongside, and anything
        // under 2% of this shell's largest is discarded before the tally.
        const dots = [];
        const areas = [];
        const uvs = [];
        let areaMax = 0;
        // How tall this shell's outline is at each u, and how tall its tallest
        // column is. The flare test needs it for the same reason the fold test needs
        // the area element: where the outline has tapered to a lip a few millimetres
        // deep, a 3 mm change of standoff across it is arithmetically a 23 deg slope
        // and visually nothing at all. A shaped outline necessarily has such ends —
        // that is what shaping it means — so a flare bar that counted them would
        // punish exactly the fix it exists to ask for. Columns under a fifth of the
        // shell's own depth are not measured for flare.
        const colArc = [];
        let colMax = 0;
        for (let i = 0; i <= NU; i++) {
            const t = i / NU;
            at(o, t, 0, 0, b1);
            at(o, t, 1, 0, b2);
            const d = b1.distanceTo(b2);
            colArc.push(d);
            if (d > colMax)
                colMax = d;
        }
        for (let i = 0; i <= NU; i++) {
            for (let j = 0; j <= NV; j++) {
                const t = i / NU, s = j / NV;
                const u = mix(o.u0, o.u1, t);
                const lift = o.lift(u, s);
                at(o, t, s, lift - o.thick, pIn);
                at(o, t, s, lift, pOut);
                const cIn = skinClearance(tab, pIn);
                const cOut = skinClearance(tab, pOut);
                if (-cIn > punch)
                    punch = -cIn;
                if (-cOut > through) {
                    through = -cOut;
                    tu2 = u;
                    tv2 = mix(o.v0(u), o.v1(u), s);
                }
                if (lift > standoff)
                    standoff = lift;
                if (lift < minLift)
                    minLift = lift;
                // GAP — daylight under the metal, measured square to the metal.
                const gHere = skinGap(tab, pIn, nrmAt(o, t, s, gnrm));
                if (gHere > gap) {
                    gap = gHere;
                    gu = u;
                    gv = mix(o.v0(u), o.v1(u), s);
                }
                // HEM — the standoff at the free edge. "Free" is not a parameter
                // convention: `v0` is the hem on a cheek guard and the top ring on a
                // nape fall, and hard-coding either would measure the hinge on half the
                // shop. It is the LOWER of the two edges in y, which is what hanging
                // means.
                if (s === 0) {
                    if (pOut.y < e0y)
                        e0y = pOut.y;
                    if (lift > e0)
                        e0 = lift;
                }
                if (s === 1) {
                    if (pOut.y < e1y)
                        e1y = pOut.y;
                    if (lift > e1)
                        e1 = lift;
                }
                // FLARE — how fast the metal leaves the head as it travels along its own
                // hang direction. `dGap / dArc` on the skin under it, as an angle. The
                // arc guard is the pole: where the parameterisation collapses the ratio
                // is the direction of the rounding error.
                {
                    // The plate's own standoff differentiated along the surface it is swept
                    // on — exact, because for a shell built by `headWear` the perpendicular
                    // distance to that surface IS the lift. No search, no table, no ear.
                    //
                    // OVER A CENTIMETRE OF TRAVEL, not between adjacent samples. A flare is
                    // a thing you can see, and what you see is the angle a plate holds over
                    // a run of it; a 2 mm change of standoff across 3 mm of metal is a
                    // fillet at the fold of a rim, and differentiating at the sample
                    // spacing reports it as 32 deg. The baseline is fixed in millimetres so
                    // it does not move when a shell's tessellation does.
                    const step = Math.min(0.5, Math.max(hs, 0.012 / Math.max(1e-4, colArc[i])));
                    const s3 = Math.min(1, s + step);
                    at(o, t, s3, 0, b2);
                    at(o, t, s, 0, b1);
                    const arc = b2.distanceTo(b1);
                    if (arc > 1e-4 && colArc[i] >= colMax * 0.2) {
                        const ang = Math.atan(Math.abs(o.lift(u, s3) - lift) / arc) * 180 / Math.PI;
                        if (ang > flare) {
                            flare = ang;
                            flu = u;
                            flv = mix(o.v0(u), o.v1(u), s);
                        }
                    }
                }
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
                if (area > areaMax)
                    areaMax = area;
                areas.push(area);
                uvs.push(u, mix(o.v0(u), o.v1(u), s));
                dots.push(nOff.dot(nSkin));
            }
        }
        let folds = 0, n = 0, worst = 0, fu = NaN, fv = NaN;
        for (let i = 0; i < dots.length; i++) {
            if (areas[i] < areaMax * 0.02)
                continue;
            n++;
            if (dots[i] >= 0)
                continue;
            folds++;
            // The deepest inversion, not the first: an edge sample that grazes zero is
            // a rounding call, and the middle of a folded region is where to look.
            const depth = -dots[i] / Math.max(1e-30, areas[i]);
            if (depth > worst) {
                worst = depth;
                fu = uvs[i * 2];
                fv = uvs[i * 2 + 1];
            }
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
            gapMm: gap * 1000,
            gapU: gu,
            gapV: gv,
            flareDeg: flare,
            flareU: flu,
            flareV: flv,
            hemMm: (e0y <= e1y ? e0 : e1) * 1000,
        });
    }
    // And the pieces swept on their own rings — the nape fall, which for four of
    // the ten rungs is the biggest sheet of metal on the helmet and was outside
    // this loop entirely until now. There is no `lift` to read here, so standoff
    // IS the radial clearance; fold and skin-through are meaningless on a shape
    // that is not an offset of the head and are reported as zero rather than
    // faked.
    const rOut = new THREE.Vector3();
    const rIn = new THREE.Vector3();
    const rNext = new THREE.Vector3();
    const rHere = new THREE.Vector3();
    const rNrm = new THREE.Vector3();
    const drop = new THREE.Vector3(0, 0, 0);
    const skinHull = rspy.length ? withNeck(tab) : tab;
    const formHull = rspy.length ? withNeck(formTab) : formTab;
    for (const o of rspy) {
        const sHull = skinHull, fHull = formHull;
        const NU = Math.max(12, o.nu * 3);
        const NV = Math.max(8, o.nv * 3);
        let gap = 0, gu = NaN, gv = NaN, flare = 0, flu = NaN, flv = NaN;
        let standoff = 0, minC = Infinity, punch = 0;
        let e0 = 0, e1 = 0, e0y = Infinity, e1y = Infinity;
        drop.set(0, o.originY, 0);
        for (let i = 0; i <= NU; i++) {
            // This column's own length, for the fixed-baseline flare step below.
            o.inner(i / NU, 0, rHere);
            o.inner(i / NU, 1, rNext);
            const colLen = Math.max(1e-4, rHere.distanceTo(rNext));
            const fstep = Math.min(0.5, Math.max(0.25 / NV, 0.012 / colLen));
            for (let j = 0; j <= NV; j++) {
                const t = i / NU, s = j / NV;
                o.outer(t, s, rOut);
                rOut.sub(drop);
                o.inner(t, s, rIn);
                rIn.sub(drop);
                const cIn = skinClearance(sHull, rIn);
                if (-cIn > punch)
                    punch = -cIn;
                // A ring has no lift function, so its own wall thickness is the normal:
                // outer minus inner is the direction the inset was taken along.
                rNrm.subVectors(rOut, rIn);
                if (rNrm.lengthSq() < 1e-12)
                    rNrm.copy(rOut).normalize();
                else
                    rNrm.normalize();
                const gHere = skinGap(sHull, rIn, rNrm);
                // Against the form for the flare, against the skin for the daylight —
                // same split as the shells above, same reason.
                const fHere = skinGap(fHull, rIn, rNrm);
                if (gHere > standoff)
                    standoff = gHere;
                if (gHere < minC)
                    minC = gHere;
                if (gHere > gap) {
                    gap = gHere;
                    gu = t;
                    gv = s;
                }
                if (s === 0) {
                    if (rOut.y < e0y)
                        e0y = rOut.y;
                    if (gHere > e0)
                        e0 = gHere;
                }
                if (s === 1) {
                    if (rOut.y < e1y)
                        e1y = rOut.y;
                    if (gHere > e1)
                        e1 = gHere;
                }
                const s3 = Math.min(1, s + fstep);
                o.inner(t, s3, rNext);
                rNext.sub(drop);
                rHere.copy(rIn);
                const arc = rNext.distanceTo(rHere);
                if (arc > 1e-4) {
                    const ang = Math.atan(Math.abs(skinGap(fHull, rNext, rNrm) - fHere) / arc) * 180 / Math.PI;
                    if (ang > flare) {
                        flare = ang;
                        flu = t;
                        flv = s;
                    }
                }
            }
        }
        shells.push({
            tag: o.tag,
            punchMm: punch * 1000,
            throughMm: 0,
            throughU: NaN,
            throughV: NaN,
            standoffMm: standoff * 1000,
            minLiftMm: (Number.isFinite(minC) ? Math.max(0, minC) : 0) * 1000,
            foldFrac: 0,
            foldU: NaN,
            foldV: NaN,
            gapMm: gap * 1000,
            gapU: gu,
            gapV: gv,
            flareDeg: flare,
            flareU: flu,
            flareV: flv,
            hemMm: (e0y <= e1y ? e0 : e1) * 1000,
        });
    }
    return { helm, cls, seed, shells };
}
// ============================================================
// WHERE THE HEAD'S VERTICES GO
//
// The head is 40 columns and 44 rows on every tier, and that row count is a
// *correctness* number rather than a quality one — see the LOD table. What
// nobody had asked is where those rows and columns are SPENT, and the answer was
// "uniformly", which on a head means most of them are on the back of a smooth
// dome.
//
// Uniform in azimuth puts a column every 0.157 rad. Near the midline that is
// 15 mm of face, so a nose 40 mm wide gets three vertices across it and a
// philtrum gets none — which is most of why five passes reported features the
// mesh could not resolve and widened them until they were coarse enough to see.
// Uniform in latitude spends 22 of 44 rows above the brow.
//
// Both warps below are C1, periodic where they have to be, and cost NOTHING:
// the triangle count, the draw call and the vertex count are all identical. They
// simply put the samples where the face is. Measured on the same tables, the
// bearing step across the dorsum falls from 0.157 to 0.086 rad and the face band
// goes from 22 rows to 31.
// ============================================================
/** How hard azimuth is pulled toward the front. 0 is uniform; 0.45 makes the
 *  columns across the nose 1.8x as dense as they were and the ones behind the
 *  ear 1.45x as sparse, which is a trade a bald patch of occiput cannot lose. */
const U_PULL = 0.45;
/** The latitude map: a density hump centred on the mid-face, integrated once and
 *  inverted by search. Written as a density rather than as a warp so it cannot
 *  fold — a cumulative distribution of a positive function is monotone however
 *  hard it is pushed. */
const V_MAP = (() => {
    const N = 512;
    const c = new Float64Array(N + 1);
    let acc = 0;
    for (let i = 0; i < N; i++) {
        const q = (i + 0.5) / N;
        const t = (q - 0.36) / 0.17;
        acc += 1 + 1.9 * Math.exp(-t * t);
        c[i + 1] = acc;
    }
    for (let i = 0; i <= N; i++)
        c[i] /= acc;
    return c;
})();
function vWarp(t) {
    const N = V_MAP.length - 1;
    if (t <= 0)
        return 0;
    if (t >= 1)
        return 1;
    let lo = 0, hi = N;
    while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (V_MAP[m] <= t)
            lo = m;
        else
            hi = m;
    }
    const d = V_MAP[hi] - V_MAP[lo];
    return (lo + (d > 0 ? (t - V_MAP[lo]) / d : 0)) / N;
}
function headGeometry(K, nu, nv) {
    const pos = [];
    const uv = [];
    const idx = [];
    const rings = [];
    const p = new THREE.Vector3();
    for (let j = 0; j <= nv; j++) {
        const v = -Math.PI / 2 + vWarp(j / nv) * Math.PI;
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
            //
            // `phi` runs -pi at the nape through 0 dead ahead; the pull is odd in it and
            // vanishes at both ends, so the seam stays exactly on the nape and the ring
            // still closes on itself.
            const phi = Math.PI * ((i / nu) * 2 - 1);
            const w = phi - U_PULL * Math.sin(phi);
            faceSurface(K, dirOf(w, v, _d), p);
            pos.push(p.x, p.y, p.z);
            // The texture coordinate follows the WARPED angle, not the column index,
            // so the skin map stays uniform across a face whose vertices are not.
            uv.push((w + Math.PI) / (Math.PI * 2), j / nv);
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
 * When non-null, every `headWear` call records its spec here. Set and cleared by
 * `helmFitProbe` and by nothing else — it is a measuring tap on the build, not a
 * feature of it, and the build behaves identically whether or not it is open.
 */
let _wearSpy = null;
let _ringSpy = null;
/** `patch`, with the fit probe watching. Same geometry, byte for byte. */
function wornRing(spec) {
    if (_ringSpy)
        _ringSpy.push(spec);
    return patch({ nu: spec.nu, nv: spec.nv, outer: spec.outer, inner: spec.inner });
}
/**
 * Anything worn on the head: hair, beard, war paint, a helm bowl, a hood. `lift`
 * is how far proud of the skin it stands, so a helm can sit over hair that sits
 * over the skull without any of the three intersecting.
 */
function headWear(K, opts) {
    if (_wearSpy)
        _wearSpy.push(opts);
    const surf = (t, s, offset, out) => {
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
const _formCache = new WeakMap();
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
function helmForm(K) {
    const hit = _formCache.get(K);
    if (hit)
        return hit;
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
            pos[k] = p.x;
            pos[k + 1] = p.y;
            pos[k + 2] = p.z;
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
            for (let c = 0; c < 3; c++)
                tmp[(j * w + nu) * 3 + c] = tmp[(j * w) * 3 + c];
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
    const get = (i, j, out) => {
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
            if (nn.lengthSq() < 1e-18)
                faceNormal(K, dirOf(u, v, rd), nn);
            else {
                nn.normalize();
                if (nn.dot(faceNormal(K, dirOf(u, v, rd), a)) < 0)
                    nn.negate();
            }
            const k = (j * w + i) * 3;
            nrm[k] = nn.x;
            nrm[k + 1] = nn.y;
            nrm[k + 2] = nn.z;
        }
    }
    const form = { nu, nv, pos, nrm };
    _formCache.set(K, form);
    return form;
}
/** Bilinear read of one of the form's two tables. */
function formRead(F, tab, u, v, out) {
    const w = F.nu + 1;
    let fu = (u / (Math.PI * 2)) * F.nu;
    fu = ((fu % F.nu) + F.nu) % F.nu;
    const fv = Math.min(F.nv, Math.max(0, ((v + Math.PI / 2) / Math.PI) * F.nv));
    const i = Math.min(F.nu - 1, Math.floor(fu));
    const j = Math.min(F.nv - 1, Math.floor(fv));
    const s = fu - i, t = fv - j;
    const k00 = (j * w + i) * 3, k10 = k00 + 3;
    const k01 = ((j + 1) * w + i) * 3, k11 = k01 + 3;
    out.set((tab[k00] * (1 - s) + tab[k10] * s) * (1 - t) + (tab[k01] * (1 - s) + tab[k11] * s) * t, (tab[k00 + 1] * (1 - s) + tab[k10 + 1] * s) * (1 - t) + (tab[k01 + 1] * (1 - s) + tab[k11 + 1] * s) * t, (tab[k00 + 2] * (1 - s) + tab[k10 + 2] * s) * (1 - t) + (tab[k01 + 2] * (1 - s) + tab[k11 + 2] * s) * t);
    return out;
}
/** A point on the form. */
function formSurface(F, u, v, out) {
    return formRead(F, F.pos, u, v, out);
}
/** The form's outward normal — interpolated, then renormalised. */
function formNormal(F, u, v, out) {
    formRead(F, F.nrm, u, v, out);
    return out.lengthSq() < 1e-12 ? out.set(0, 1, 0) : out.normalize();
}
/**
 * `headWear`, but swept on the form instead of on the skin — the sampler every
 * piece of a helmet uses. See the block above for why the two are different
 * functions and not a flag.
 */
function helmWear(K, opts) {
    if (_wearSpy)
        _wearSpy.push({ ...opts, form: true });
    const F = helmForm(K);
    const surf = (t, s, offset, out) => {
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
const GLOBE = 0.0152;
const UP_AXIS = new THREE.Vector3(0, 1, 0);
function eyeFrame(K, side) {
    // 0.375 rather than 0.395: at the eye line that bearing lands 37 mm off the
    // midline, so the pupils are 74 mm apart against a Farkas 63 rescaled to this
    // head's 73. At 0.395 they were 78 apart with a 21 mm nasal root between them,
    // and wide-set eyes on a broad vault is most of the "not quite a person" in
    // `art/shots/base0`.
    const uE = side * 0.375 * K.F.eyeU;
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
    // 13.8 mm, and it moved because the socket did: the orbit is 9.6 mm deep now
    // where it was 8.5, so at the old standoff the cornea would have gone back with
    // it and the eye would have been in a cave.
    const floor = faceSurface(K, dir, new THREE.Vector3());
    const c = floor.addScaledVector(fwd, 0.0138 - GLOBE);
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
    //
    // 27.6 x 13.6 mm. It is WIDER and no taller, and that ratio is the whole of
    // it: at 21.6 x 14.4 the aperture was 1.5 : 1, which is a round hole, and a
    // round hole full of sclera is the stare a warrior must not have. Life is
    // 2.4 : 1 at the skin. 2.0 : 1 is as far as the globe will carry the chord and
    // it is enough — the frame stops reading "startled" and starts reading "calm",
    // which is the expression the owner's reference has.
    return {
        c, lat: base, up, fwd,
        wA: 0.0150, hA: 0.0068 * K.F.eyeOpen, tilt: side * 0.0022,
        uE, vE,
    };
}
/**
 * A shell lying on the globe: sclera, iris, pupil. `extent` returns where in the
 * eye's tangent plane the sample sits and the sphere supplies the depth, so every
 * one of the three is curved with the eyeball rather than pasted flat across it.
 */
function globePatch(f, radius, thick, nu, nv, extent, wrapU) {
    const uv = new THREE.Vector2();
    const at = (t, s, r, out) => {
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
// The exponent is what makes it an almond rather than a lens. At 0.62 the
// aperture is still 62% of its full height a third of the way from the canthus,
// so both ends of the slit are blunt and the sclera runs right out to them —
// which is the ring of white that reads as a stare. At 0.80 it closes to a point
// the way a real fissure does, and the widest part of the white sits under the
// iris where it belongs.
const fissure = (f, tt) => f.hA * Math.pow(Math.max(0, 1 - tt * tt), 0.80);
/**
 * An eyelid, built as the bridge it actually is: it starts on the globe at the
 * lid margin and ends buried in the socket rim, with a fold of volume in between.
 * Modelling it as a bridge rather than as a cap is what stops the eye reading as
 * a marble dropped into a hole — and the `s0` band is the lash line, which at
 * this scale carries more of the read than the lid itself.
 */
function lidPatch(K, f, upper, nu, nv, s0, s1, thick) {
    const sign = upper ? 1 : -1;
    const rL = GLOBE + 0.0016;
    // How far into the socket the lid dies, in latitude. The lower one is shallower
    // than it was: at 0.115 its bridge was 13 mm of up-facing skin below the eye and,
    // with `skin` now carrying a tighter specular lobe, it took the key square on and
    // rendered as a pale crescent — an under-eye bag, which is the second-worst thing
    // you can give a warrior after a glowing sclera.
    // Both shallower. With the orbit dug to 9.6 mm the socket rim is where the lid
    // needs to die, and it is closer to the margin than it was: at 0.115 the upper
    // lid was 13 mm of skin bridging from the globe to a rim above the ridge's
    // underside, and it rendered as the fat pale almond sitting over each eye in
    // `art/shots/base0/cards/headturn-front_0_.png`.
    const rimDv = upper ? 0.096 : -0.062;
    const m = new THREE.Vector3();
    const rim = new THREE.Vector3();
    const n = new THREE.Vector3();
    const d = new THREE.Vector3();
    const at = (t, s, off, out) => {
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
        out.addScaledVector(n, (upper ? 0.0008 : 0.0003) * Math.sin(Math.PI * w) + off);
    };
    return patch({
        nu, nv,
        outer: (t, s, out) => at(t, s, 0, out),
        inner: (t, s, out) => at(t, s, -thick, out),
    });
}
/** Both eyes, their lids and their lashes, added into the head's part. */
function addEyes(p, K, lod, place, M) {
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
function addMouth(p, K, lod, place, M) {
    // 0.29 rad, not 0.25. At the lip line that bearing stands 29 mm off the
    // midline, so the mouth is 59 mm across against a Farkas 50 rescaled to this
    // head's 58. The old 50 mm was life-sized on a head that is not life-sized, and
    // a small mouth centred in a wide lower face is the other half of the pouch.
    const w = 0.29 * K.F.mouth;
    const nu = Math.max(6, lod.shellU - 2);
    // Pinched to nothing at both corners, so the line ends where the lips end
    // instead of stopping dead — the square lobe on each end of the old letterbox.
    const half = (u) => 0.0150 * Math.pow(1 - Math.pow(clamp01(Math.abs(u) / w), 1.7), 0.55);
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
function braid(path, opts) {
    const n = opts.strands ?? 3;
    const pos = [];
    const uv = [];
    const idx = [];
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
            if (tan.lengthSq() < 1e-10)
                tan.set(0, -1, 0);
            tan.normalize();
            side.set(1, 0, 0).cross(tan);
            if (side.lengthSq() < 1e-8)
                side.set(0, 0, 1).cross(tan);
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
const _hmA = new THREE.Vector3();
const _hmB = new THREE.Vector3();
/**
 * HAIR THAT HANGS OFF A HEAD, AS ONE SURFACE.
 *
 * Every beard and the Long Mane were a SUM OF PRIMITIVES — an ovoid belly with
 * a second leaning copy of itself inside it, two tines rotated about a point
 * 190 mm away so that they crossed through one another, four cylindrical rods
 * hung beside a slab — and the owner's words for the result are "big lumps
 * overlapped & clipped to another part of beard it looks blocky & ugly &
 * unnatural" and "hard cylindrical rods". Those are the same defect, and it is
 * the oldest one in this project: the ear was ball plus torus plus ball and had
 * daylight through it, the head was a sum of bumps and produced five different
 * monsters, and both were fixed by authoring ONE CONTINUOUS SURFACE.
 *
 * This is that surface, and it is shared so that a beard and a mane cannot
 * drift into being two different ideas of the same thing.
 *
 * It is swept off a curve ON THE SKIN — `root(u)` is a latitude, so the mass
 * starts exactly where the shell above it stops and there is no join to see.
 * The section then runs DOWN THE OUTSIDE of the hair, round the hem, and BACK
 * UP THE INSIDE to close on the root again: a closed tube with no cap anywhere,
 * so there is no open ring to see through and no second solid to clip against.
 *
 * A style is a handful of numbers on that one surface — how much mass at each
 * azimuth, how far it falls, how far forward it swings — which is the axis a
 * price ladder has to buy and the axis that survives 7.9 mm to a pixel.
 */
function hangingMass(K, 
/** Where the head's origin sits in the part's own space. */
y0, nu, 
/** The latitude the mass hangs from, per azimuth. */
root, opts) {
    const { prof, mass, lean } = opts;
    const reach = opts.reach ?? (() => 1);
    const hankOf = opts.hank ?? (() => 0);
    const ragOf = opts.rag ?? (() => 1);
    const clear = opts.clear ?? 0;
    const uA = opts.u0 ?? -1.24;
    const uB = opts.u1 ?? 1.24;
    const N = prof.length - 1;
    const at = (t, s, inset, out) => {
        // u DESCENDS through the sweep. `patch` faces ∂t × ∂s, and with u ascending
        // that cross product points into the head — the whole mass would be built
        // inside out, which is the trap the brows fell into for four passes.
        const u = mix(uB, uA, t);
        const v = root(u);
        dirOf(u, v, _hmA);
        faceSurface(K, _hmA, out);
        faceNormalTrue(K, u, v, _hmB);
        // A shade proud of the skin, which is where the shell above already sits,
        // so the two meet flush instead of stepping.
        out.addScaledVector(_hmB, 0.0018);
        out.y += y0;
        // Outward is taken from the head's AXIS at this azimuth, not from the root
        // point: under the chin the root sits where the section has converged to a
        // few millimetres, and a direction measured off a point that close to the
        // axis is noise.
        const rx = Math.sin(u), rz = Math.cos(u);
        const q = clamp01(s) * N;
        const i = Math.min(N - 1, Math.floor(q));
        const f = q - i;
        const a = prof[i], b = prof[i + 1];
        const m = mass(u);
        const oo = mix(a.o, b.o, f);
        const dd = mix(a.d, b.d, f);
        // Hanks. Hair is not one surface — it is ropes, each with a belly and a
        // valley beside it, so the key rakes across a row of ridges and the eye
        // gets a dozen highlights instead of one gradient. Keyed on how far DOWN
        // the section has come rather than on how far out it is, so the strands run
        // the length of the hair instead of dying wherever the profile is thin.
        const ridge = 1 + hankOf(u) * smooth(0, 0.35, clamp01(s)) * (oo > 0 ? 1 : 0.35);
        const d = dd * m * reach(u) * ragOf(u);
        const r0 = Math.hypot(out.x, out.z);
        const o = Math.max(oo * m * ridge, clear * smooth(0, 0.050, d) - r0) - inset;
        out.x += rx * o;
        // The forward swing is weighted toward the FRONT. A beard reaching the
        // chest rests on it, but hair beside the jaw hanging as far forward as hair
        // under the chin is a scarf — the side lobes come off the head and read as
        // flaps with daylight behind them.
        out.z += rz * o + lean * d * (0.32 + 0.68 * Math.max(0, rz));
        out.y -= d;
    };
    return patch({
        nu, nv: N,
        outer: (t, s, out) => at(t, s, 0, out),
        inner: (t, s, out) => at(t, s, opts.thick, out),
    });
}
const jag = (t, a, f) => a * (Math.cos(t * f) + 0.55 * Math.cos(t * f * 2.37 + 1.7));
// ---- WAR PAINT, AND WHY IT LOOKED PRINTED ----
//
// "I'd like better war paint too, its generic & low quality rendered."
//
// "Low quality rendered" is the accurate half, and it is a sampling fault
// rather than a taste one. These marks are written into the complexion field,
// which is evaluated PER VERTEX of the head — and the head's grid is about
// 13 mm across in u and 9 mm in v. Blood Stripes asked for a transition band of
// `half * 0.12`, which is 6.6 mm: less than one cell. A boundary finer than the
// mesh cannot be drawn by the mesh, so what the interpolator produces instead
// is the mesh: `art/look/w_stripes.png` shows the stripes as a staircase of
// hard red rectangles, one per triangle, which is exactly "low quality
// rendered". Every `jag` term on top of that was above Nyquist too, so the
// raggedness they were meant to add came out as more stairs.
//
// The answer is NOT to sharpen it. It is to author marks the mesh can carry,
// which is also what the owner is asking for on the taste side: "a stroke has a
// start, a direction and a taper; pigment sits in the skin." Pigment dragged
// into skin with a finger has NO hard edge — it has a dense core and a spread
// halo, it is heaviest where the finger landed and it dies out where the finger
// lifted. All three of those are low-frequency, and low-frequency is what 13 mm
// cells can draw.
//
// So every mark below is a STROKE: a segment with a start point, an end point,
// a width that tapers along it, and a two-lobe falloff across it — a core at
// 25% of the width and a halo out to 150% — rather than a box with a smoothstep
// on its side.
/**
 * How much pigment a stroke leaves at a point.
 *
 * `(a0, y0) -> (a1, y1)` in the paint's own space, which is |dx| across and
 * field latitude down. Those two axes have different scales — |dx| = 1 is 96 mm
 * at the side of the head, latitude 1 is about 135 mm — so the across-axis is
 * weighted by 1.4 and the metric is very nearly isotropic. Without that a
 * stroke's width means one thing when it runs down the face and another when it
 * runs across it, which is how the Raven Cross came to have a band four times
 * the weight of its own bar.
 */
const stroke = (ax, y, a0, y0, a1, y1, w0, w1) => {
    const dx = (a1 - a0) * 1.4, dy = y1 - y0;
    const L2 = dx * dx + dy * dy || 1e-6;
    const t = ((ax - a0) * 1.4 * dx + (y - y0) * dy) / L2;
    const te = clamp01(t);
    const px = a0 + (a1 - a0) * te, py = y0 + (y1 - y0) * te;
    const dist = Math.hypot((ax - px) * 1.4, y - py);
    const w = Math.max(1e-4, mix(w0, w1, te));
    // Along the stroke: full where the finger landed, dying over the last third
    // where it lifted, and with a short lead-in so the start is not a cut end.
    const along = smooth(-0.10, 0.06, t) * (1 - 0.85 * smooth(0.55, 1.02, t));
    // Across it: a dense core inside a spread halo. Both transitions are wider
    // than a mesh cell, which is the whole point.
    const core = 1 - smooth(w * 0.10, w * 1.00, dist);
    const halo = 1 - smooth(w * 0.70, w * 1.90, dist);
    return along * clamp01(0.66 * core + 0.44 * halo);
};
const WAR_PAINT = {
    // BLOOD STRIPES — three fingers dragged down through blood, starting at the
    // cheekbone and dying below the jaw. They fan as they fall the way a hand's
    // fingers do, the middle one is the heaviest because the middle finger
    // presses hardest, and each carries past the mandible onto the throat, which
    // is where they stay visible under a helmet with cheek guards and under the
    // mask.
    stripes: {
        color: 0x7c1d10,
        mark: (ax, x, y, z, front) => {
            let cover = 0;
            for (let i = 0; i < 3; i++) {
                // Fanning: the three start close together on the cheekbone and spread
                // as they fall, which is what a hand does and what a set of parallel
                // bars conspicuously does not.
                const a0 = 0.24 + i * 0.30;
                const a1 = a0 + 0.10 + i * 0.055;
                const w = 0.185 + 0.045 * (1 - Math.abs(i - 1));
                cover = Math.max(cover, stroke(ax, y, a0, Y_EYE + 0.055, a1, Y_CHIN - 0.30, w, w * 0.62));
            }
            return cover * front;
        },
    },
    // RAVEN CROSS — a band of pitch across the eyes and a bar down the midline.
    // Both were rectangles in (u, v) with 14% transition bands, so both came out
    // as staircases. Both are strokes now: the band is drawn from the far cheek
    // to the near one and lifts off the bridge of the nose, because paint does
    // not bridge a dorsum in one pass; the bar runs from the hairline over the
    // ridge of the nose and down over the chin onto the throat, which is the part
    // a mask leaves showing.
    cross: {
        color: 0x15192b,
        mark: (ax, x, y, z, front) => {
            // The band, as one stroke running outward and falling a little as it
            // goes — a hand drawing across a face does not hold a level line.
            const band = stroke(ax, y, 0.02, Y_EYE + 0.055, 1.06, Y_EYE - 0.030, 0.210, 0.150);
            // The notch over the bridge. Wide and soft: at the old 0.055-0.135 it was
            // half a mesh cell and drew a step rather than a lift.
            const notch = 1 - 0.62 * (1 - smooth(0.05, 0.42, ax)) * smooth(Y_NOSE, Y_EYE + 0.06, y);
            // The bar, down the midline, heaviest at the brow and dying on the
            // throat.
            const bar = stroke(ax, y, 0.0, Y_BROW + 0.34, 0.0, Y_CHIN - 0.34, 0.215, 0.140);
            return Math.max(band * notch, bar) * front;
        },
    },
    // HALF-FACE SHADOW — one side of the head in soot, and the most expensive of
    // the three, so it has to be the one that changes a man's read at fight
    // distance. It does: half a head at a different value is legible at 34 px when
    // nothing else on the face is.
    //
    // The boundary was a ±0.022 smoothstep, which on a 13 mm grid is a HARD CUT
    // with a stair in it — the "flat black smear with hard edges" exactly. It is
    // 0.10 wide now, about 10 mm, so the edge is a soft line where the hand
    // stopped rather than a mask boundary, and the two harmonics that wander it
    // are both well below the mesh's Nyquist.
    half: {
        color: 0x18140f,
        mark: (ax, x, y, z, front) => {
            const edge = -0.02 + 0.075 * (Math.cos(y * 5.5) + 0.55 * Math.cos(y * 9.1 + z * 3.1 + 1.7));
            const side = smooth(edge + 0.100, edge - 0.045, x);
            // Denser toward the outside of the face and thinning across the midline,
            // so the soot has a direction — a hand drags from the ear inward and runs
            // out of pigment.
            const load = 0.72 + 0.28 * smooth(0.10, 0.85, ax);
            // Behind the ear it wraps rather than ending: `front` would take the mark
            // off the side of the head entirely, which is where half of it lives.
            return side * load * clamp01(0.45 + 0.55 * front);
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
function faceComplexion(K, y0, tone, paint, whiskers) {
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
    // ---- WHERE ON THE HEAD A VERTEX IS ----
    //
    // The old answer was `position / R, normalised` — the sampling direction of an
    // ellipsoid. The head is not an ellipsoid any more and never really was, and
    // the error is not academic: normalising a point carrying 27 mm of nose rotates
    // its apparent latitude by several degrees, so every band in this field sat a
    // few millimetres off the feature it was named for, and the sum of them
    // rendered as a blur across the cheek.
    //
    // Now it is solved. `py` is a strictly increasing function of the field's own
    // `y` (see `faceSurface`), so it inverts by bisection — a build-time-only path
    // — and the vertex's TRUE latitude comes back. Lateral position comes back as
    // a fraction of the head's own half-breadth at that latitude, so `s = 0` is the
    // midline and `s = 1` is the side of the head at every height. Every term below
    // is written in those two numbers, which means it can be read straight against
    // the relief table.
    const sc = R.x / RX0;
    const top0 = R.y * F.tall;
    /** The menton, in the head's own space. Below this the field has no latitude. */
    const mentonY = -(top0 + MANDIBLE);
    const fieldY = (yy) => {
        let lo = -1, hi = 1;
        for (let i = 0; i < 24; i++) {
            const m = (lo + hi) * 0.5;
            const v = top0 - ev(S_H, m) * (2 * top0 + MANDIBLE);
            if (v < yy)
                lo = m;
            else
                hi = m;
        }
        return (lo + hi) * 0.5;
    };
    const gs = (d, w) => Math.exp(-(d * d) / (w * w));
    return (px, py, pz, out) => {
        const fy = fieldY(py - y0);
        const hw = Math.max(1e-4, ev(S_W, fy) * MM * sc * F.wide * widthGain(F, fy));
        const zc = ev(S_ZC, fy) * MM * sc;
        const s = Math.abs(px) / hw;
        const dep = Math.max(1e-4, (ev(S_MASK, fy) * MM * sc - zc) * F.deep);
        /**
         * How much of "the front of the head" this vertex is on. EVERY shadow term
         * below multiplies by it, and that is why its shape matters more than any of
         * them: it is one channel gating a dozen others, and a knee in it is a knee
         * in all of them at once.
         *
         * It used to be `clamp01(z/dep * 1.5)`, whose clamp puts a hard corner in the
         * derivative at two thirds of the head's depth — a line running from the
         * temple, past the outer canthus and the corner of the mouth, down to the
         * jaw, with every form shadow switched fully on inboard of it and fading
         * outboard. That line is the hard-edged FACE PLATE the owner has now reported
         * three times, and three passes have gone looking for it in the geometry. It
         * was never in the geometry. `art/shots/base0/cards/headturn-front_0_.png`
         * shows it plainly at portrait scale: a pale, faintly pink panel outboard of
         * a crease that no vertex of this head sits on.
         *
         * A smoothstep has zero slope at BOTH ends, so the field has no corner
         * anywhere and the shadow dies into the side of the head instead of stopping.
         */
        const front = smooth(-0.10, 0.72, (pz - zc) / dep);
        // The war paint marks are authored in the old direction space and there are
        // fourteen of them, so that space is still computed — for them and for the
        // mottle, and for nothing else.
        let dx = px / R.x;
        let dyDir = (py - y0) / R.y;
        let dz = pz / R.z;
        const len = Math.hypot(dx, dyDir, dz) || 1;
        dx /= len;
        dyDir /= len;
        dz /= len;
        const ax = Math.abs(dx);
        const dy = fy;
        // ---- the form shadow, and there is far less of it than there was ----
        //
        // This field used to carry fourteen terms summing to 0.52 over an area
        // running temple to temple and brow to mouth, which is a domino mask painted
        // onto a face, and three separate judgements have logged it as one. It was
        // that big because the geometry underneath it was not doing its job: an
        // orbit 3 mm deep has to be *drawn*.
        //
        // The orbit is 8.5 mm deep now, the brow overhangs it by 9, the alar crease
        // is cut, the mentolabial sulcus is a real shelf and the nose is 27 mm of
        // projection — all of it in the relief table, all of it lit by the rig rather
        // than painted under it. What is left here is only the places a head is dark
        // for a reason no displacement can express: the inside of a slot, the
        // underside of an overhang, and skin that is in shadow all day.
        let dim = 0;
        // The socket. Tight on the orbit itself — an orbit is 30 mm across, and the
        // term this replaces was 84.
        dim += 0.50 * gs(s - 0.38, 0.19) * gs(fy + 0.05, 0.115) * front;
        // The crease under the brow ridge: the one line that makes an overhang read
        // as an overhang rather than as a band of colour.
        dim += 0.36 * gs(s - 0.36, 0.24) * gs(fy - 0.050, 0.046) * front;
        // Under the tip and the columella — the only part of a nose that faces down.
        dim += 0.50 * gs(s, 0.13) * gs(fy - (Y_NOSE - 0.005), 0.040) * front;
        // The alar crease, where the wing meets the cheek.
        dim += 0.34 * gs(s - 0.22, 0.070) * gs(fy - (Y_NOSE + 0.032), 0.050) * front;
        // Beside the dorsum, and this is the single most valuable term on the nose
        // in this rig. A nose's own relief is a gradient in z, and a light rig with
        // ambient 0.85 cannot see a gradient in z; a narrow shadow down each side of
        // it is what makes the mass read as a nose from in front. Narrow — 0.07 of
        // the half-breadth is 7 mm — because the version of this that was 0.42 wide
        // WAS the painted wedge down the middle of the face.
        dim += 0.44 * gs(s - 0.185, 0.062) * gs(fy - (Y_EYE - 0.080), 0.125) * front;
        // The buccal hollow, under the zygomatic and over the jaw. Sited on the
        // relief's own hollow rather than washed down the whole cheek: this is the
        // term that used to be 0.22 x 0.185 of direction space and painted the face
        // narrow while the silhouette measured broad.
        dim += 0.40 * gs(s - 0.56, 0.16) * gs(fy - (Y_LIP + 0.075), 0.100) * front;
        // The oral fissure. A mouth is a slot, and a slot with no shadow in it is a
        // scratch — the term worth the most per unit of area on the whole face.
        dim += 0.72 * gs(s, 0.34) * gs(fy - Y_LIP, 0.030) * front;
        // The shelf under the lower lip, which is what divides the lower third.
        dim += 0.38 * gs(s, 0.26) * gs(fy - (Y_LIP - 0.120), 0.050) * front;
        // Under the mandible. Everything below the jawline goes down, and the jaw's
        // own border gets a line over the top of it so the edge is an edge.
        dim += 0.58 * smooth(Y_CHIN + 0.11, Y_CHIN - 0.17, fy);
        dim += 0.42 * gs(s - 0.52, 0.32) * gs(fy - (Y_CHIN + 0.105), 0.050) * front;
        // ---- AND THEN THE THROAT, WHICH THIS FIELD USED TO STOP AT ----
        //
        // `fieldY` bisects the height spline, which is only defined between the
        // vertex and the menton — so the instant a vertex is past the chin it
        // saturates at −1 and EVERY TERM ABOVE FREEZES. The line above then hands
        // the whole neck one flat 0.58 and nothing else varies at all: a smooth
        // tube at a single value, hard against a jaw that is fully modelled. That
        // is most of "the neck is very strange on the front & back", and it is why
        // the neck read as a separate solid rather than as the same man continuing
        // downward.
        //
        // A throat is not one value. It is dark right under the mandible, where the
        // jaw overhangs it, and it opens out to nearly full daylight by the collar.
        // Measured off the menton in METRES rather than in field latitude, because
        // field latitude is the thing that has run out.
        const drop = (y0 + mentonY) - py;
        if (drop > 0) {
            const t = clamp01(drop / 0.115);
            dim = mix(dim, 0.20, smooth(0.02, 0.95, t));
            // Deepest at the FRONT, under the chin, because that is where the
            // overhang is — the nape has a skull above it, not a jaw. Taken in metres
            // off the neck's own axis: `front` above is computed from a section that
            // has saturated too and cannot be trusted down here.
            dim += 0.26 * (1 - smooth(0, 0.62, t)) * smooth(-0.02, 0.055, pz);
        }
        // The nape and behind the ear: a head with tone only on its front reads as a
        // mask laid on a ball, and the three-quarter bearing needs somewhere to turn.
        dim += 0.34 * (1 - front) * smooth(0.30, -0.30, fy) * (1 - smooth(-0.78, -0.95, fy));
        dim += 0.20 * gs(s - 0.92, 0.20) * gs(fy - 0.10, 0.30) * clamp01(1 - front);
        // A knee rather than a cliff, as insurance against the next term somebody
        // adds: under 0.46 this is exactly what it was, and above it the sum
        // approaches its cap asymptotically instead of hitting it, so an overlap of
        // three justified shadows deepens a crease rather than painting a plateau.
        //
        // AND THE KNEE IS C1 NOW. The old form's slope fell from 1 to 0.384 across
        // the join, so wherever the summed shadow crossed 0.46 the field had a
        // corner in it — and the contour of a corner in a shading field is a LINE.
        // It is drawn in exactly the places three or four honest shadows overlap,
        // which is to say round the socket and along the buccal hollow, and it is
        // the same class of defect as the `front` clamp two hundred lines above.
        // Dividing by the headroom instead of multiplying by 1.6 makes the
        // derivative exactly 1 at the join, so there is no contour anywhere.
        dim = dim <= 0.46 ? dim : 0.46 + 0.26 * (1 - Math.exp(-(dim - 0.46) / 0.26));
        // ---- the flush ----
        //
        // Where blood sits close under the skin. Kept to half the strength of the
        // shadow and off the open planes: warmth on a cheek is rouge, warmth on a
        // nose tip and an earlobe is a man.
        let warm = 0;
        warm += 1.00 * gs(s, 0.16) * gs(fy - (Y_TIP - 0.040), 0.10) * front;
        warm += 0.55 * gs(s - 0.25, 0.09) * gs(fy - (Y_NOSE + 0.03), 0.075) * front;
        // The ear, and it is the EAR rather than the side of the face. At a width of
        // 0.17 in |dx| this reached 0.83 of the half-breadth — well onto the cheek —
        // and what it drew was a warm band running down the outside of the face,
        // which is the pink half of the plate the `front` note above is about. An ear
        // is 60 mm of a 190 mm head; 0.09 is that, and no more.
        warm += 0.80 * gs(ax - 1.00, 0.09) * gs(dyDir - (Y_EYE + Y_NOSE) * 0.5, 0.26) * gs(dz + 0.12, 0.50);
        warm += 0.40 * gs(s - 0.58, 0.24) * gs(fy - (Y_EYE - 0.13), 0.135) * front * F.cheek;
        warm += 0.32 * gs(s, 0.26) * gs(fy - Y_CHIN, 0.13) * front;
        warm = clamp01(warm);
        // The vermilion, on its own channel because it is the one place on a face
        // where the *hue* has to move much further than the value. It used to be two
        // lenses of a separate material sitting on the lip bands, which is what drew
        // the letterbox with a maroon lid over it and a pink one under; as a term in
        // the field it is a soft oval that the lip geometry's own roll then lights.
        // Bounded tightly in x by the mouth's own width so it cannot creep onto the
        // cheek, and pinched at both corners the way a lip is.
        // In the head's own lateral fraction, so it agrees with `addMouth`: that
        // slot is cut from azimuth -0.25 to +0.25 of `F.mouth`, which at the lip's
        // latitude lands at 0.34 of the half-breadth.
        const lipW = 0.44 * F.mouth;
        const lipHalf = 0.078 * (1 - Math.pow(clamp01(s / lipW), 2.2)) + 0.012;
        const lip = clamp01((1 - smooth(lipHalf * 0.42, lipHalf, Math.abs(fy - (Y_LIP - 0.012))))
            * (1 - smooth(lipW * 0.78, lipW, s))) * front;
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
        const mottle = 0.55 * Math.cos(dy * 6.1 + dx * 3.7)
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
            const rise = smooth(0.45, 1.00, s);
            const top = mix(Y_LIP - 0.075, -0.13, rise)
                + 0.055 * Math.cos(s * 6.0) + 0.028 * Math.cos(s * 10.4 + 1.9)
                + 0.016 * Math.cos(fy * 23 + s * 6.4);
            let jaw = (1 - smooth(top - 0.07, top + 0.07, fy)) * smooth(-1.04, -0.94, fy);
            // The moustache: above the lip, inside the philtrum's width, and parted at
            // the midline the way one grows.
            const mo = (1 - smooth(Y_LIP + 0.055, Y_LIP + 0.16, fy)) * smooth(Y_LIP + 0.02, Y_LIP + 0.09, fy)
                * (1 - smooth(0.36, 0.48, s)) * smooth(0.025, 0.09, s);
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
function mirrorZ(geo) {
    const pos = geo.getAttribute("position");
    const nrm = geo.getAttribute("normal");
    for (let i = 0; i < pos.count; i++)
        pos.setZ(i, -pos.getZ(i));
    pos.needsUpdate = true;
    if (nrm) {
        for (let i = 0; i < nrm.count; i++)
            nrm.setZ(i, -nrm.getZ(i));
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
/**
 * A tapered tube swept along a path, with the cross-section carried on a frame
 * built off the grip axis. Every finger and every thumb segment is one of these:
 * the path is the arc the digit takes around the shaft and the `a`/`b` pair is
 * where it swells at a joint and pinches at a crease. Beads on a string were the
 * old approach and they read as a caterpillar; a swept tube with two visible
 * creases reads as a finger, and costs the same triangles.
 */
function digit(path, ring) {
    const n = path.length;
    const pos = [];
    const uv = [];
    const idx = [];
    const rings = [];
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
        if (N.lengthSq() < 1e-8)
            N.set(0, 0, 1);
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
            pos.push(k.x + B.x * k.a * c + N.x * k.b * s, k.y + B.y * k.a * c + N.y * k.b * s, k.z + B.z * k.a * c + N.z * k.b * s);
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
    const cap = (base, k, flip) => {
        const c = pos.length / 3;
        pos.push(k.x, k.y, k.z);
        uv.push(0.5, 0.5);
        for (let j = 0; j < ring; j++) {
            if (flip)
                idx.push(c, base + j + 1, base + j);
            else
                idx.push(c, base + j, base + j + 1);
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
function fingerPath(fx, wrap, curl, phi0, arc, nodes, a0, b0, swell) {
    const path = [];
    let y = -wrap * Math.sin(phi0);
    let z = wrap * Math.cos(phi0);
    let ty = -Math.cos(phi0);
    let tz = -Math.sin(phi0);
    const ds = arc / (nodes - 1);
    for (let i = 0; i < nodes; i++) {
        const k = i / (nodes - 1);
        const w = swell[Math.min(swell.length - 1, Math.round(k * (swell.length - 1)))];
        path.push({ x: fx, y, z, a: a0 * w * (1 - 0.2 * k), b: b0 * w * (1 - 0.22 * k) });
        if (i === nodes - 1)
            break;
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
function fistGeometry(lod, scale, opts) {
    const s = scale;
    const body = [];
    const tips = [];
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
            const path = fingerPath(fx, wrap * (1 - f * 0.02), curl, phi0, arc, nodes, 0.0093 * s * (1 - f * 0.055), pad * (1 - f * 0.05), swell);
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
        const THUMB = [
            [-0.046, -0.588, -0.0056, 0.0125, 0.0125],
            [-0.038, 0.142, 0.0011, 0.0118, 0.0115],
            [-0.024, 0.574, 0.0133, 0.0107, 0.0104],
            [-0.006, 0.769, 0.0174, 0.0098, 0.0094],
            [0.014, 0.914, 0.0170, 0.0074, 0.0072],
        ];
        // Open, the thumb is abducted and roughly parallel to the index rather than
        // crossed over it, and it is authored directly: with no shaft there is no
        // circle for a polar form to be about.
        const OPEN_THUMB = [
            [-0.046, 0.012, 0.018, 0.0125, 0.0125],
            [-0.056, -0.008, 0.024, 0.0118, 0.0115],
            [-0.062, -0.030, 0.026, 0.0107, 0.0104],
            [-0.060, -0.050, 0.023, 0.0098, 0.0094],
            [-0.054, -0.066, 0.017, 0.0074, 0.0072],
        ];
        const thumb = (open ? OPEN_THUMB : THUMB).map(([x, u, v, a, b]) => {
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
    }
    else {
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
    const join = (list) => {
        if (list.length === 0)
            return null;
        if (list.length === 1)
            return opts.mirror ? mirrorZ(list[0]) : list[0];
        const merged = mergeGeometries(list, false);
        if (!merged)
            return opts.mirror ? mirrorZ(list[0]) : list[0];
        for (const g of list)
            g.dispose();
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
function fistPlacement(gripPitch, x, y, z) {
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
function bladeSection(stations, seg = 8) {
    const grow = 1 / Math.pow(Math.cos(Math.PI / seg), 2);
    return shell(stations.map((st) => ({ ...st, hw: st.hw * grow })), seg, { power: 1, phase: 0.5, capTop: true, capBottom: true });
}
/** Cord-wrapped grip: a core plus a helix of bindings, merged into the core. */
function boundGrip(part, mat, cordMat, y0, y1, r0, r1, turns, trim) {
    part.add(shell([{ y: y1, hw: r1, hd: r1 * 0.82 }, { y: (y0 + y1) / 2, hw: (r0 + r1) * 0.47, hd: (r0 + r1) * 0.4 }, { y: y0, hw: r0, hd: r0 * 0.82 }], 8, { capTop: true, capBottom: true }), mat);
    if (!trim)
        return;
    const n = Math.max(3, Math.round(turns));
    for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const y = mix(y0, y1, t);
        const r = mix(r0, r1, t) + 0.0022;
        part.add(ring(r, 0.0028, 4, 10), cordMat, xf(0, y, 0, Math.PI / 2, 0, 0.16, 1, 1, 0.85));
    }
}
export function buildSword(materials) {
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
    for (const { geo, mat } of part.merge())
        g.add(new THREE.Mesh(geo, mat));
    return g;
}
/**
 * The runekeeper's seax: single-edged with the broken-back spine that makes an
 * Anglo-Saxon knife unmistakable at a glance, and rune-etched down the flat.
 */
export function buildDagger(materials) {
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
    for (const { geo, mat } of part.merge())
        g.add(new THREE.Mesh(geo, mat));
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
function axeBlade(edge, root, eyeHalf) {
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
    const SECTION = [
        [0, 0.030], [0, 0.030], [0.12, 0.17], [0.12, 0.17], [0.34, 0.27], [0.62, 0.40], [1, 1],
    ];
    const n = edge.length - 1;
    const rows = SECTION.length - 1;
    const at = (t, s, sign, out) => {
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
export function buildAxe(materials) {
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
    const edge = [
        [0.163, 0.137], [0.181, 0.116], [0.192, 0.093], [0.199, 0.068],
        [0.203, 0.042], [0.204, 0.016], [0.203, -0.010], [0.200, -0.036],
        [0.194, -0.061], [0.186, -0.085], [0.176, -0.108], [0.161, -0.130],
        [0.143, -0.148], [0.122, -0.162], [0.098, -0.170],
    ];
    const root = [
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
    const langet = [
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
    for (const { geo, mat } of part.merge())
        g.add(new THREE.Mesh(geo, mat));
    return g;
}
/**
 * The warden's spear. Not a stylistic flourish — it is the only weapon in the
 * roster whose silhouette can be read from across the arena, which is what the
 * class needed to stop being "the huscarl without a shield".
 */
export function buildSpear(materials) {
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
    for (const { geo, mat } of part.merge())
        g.add(new THREE.Mesh(geo, mat));
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
export function buildShield(color = 0x6b4226, materials) {
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
        part.add(retile(box(halfW * 1.94, edge, 0.004), du, dv, edge / PLANK_V), paint, xf(cx, (cx >= 0 ? 1 : -1) * edge * 0.5, zf + dome + 0.0115));
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
    for (const { geo, mat } of part.merge())
        g.add(new THREE.Mesh(geo, mat));
    return g;
}
export function buildWeaponForClass(cls, materials) {
    if (cls === "runekeeper")
        return buildDagger(materials);
    if (cls === "berserker")
        return buildAxe(materials);
    if (cls === "warden")
        return buildSpear(materials);
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
const HAND_GRIP = {
    // Between the sword's 16 mm core and the 21 mm crest of its cord helix, which
    // is where a hand on a corded grip actually sits — proud of the wood, sunk into
    // the binding.
    huscarl: { main: 0.017, off: 0.017 },
    warden: { main: 0.024, off: null },
    runekeeper: { main: 0.014, off: 0.014 },
    berserker: { main: 0.021, off: null },
};
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
const ZONE_SEAM = {
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
const SEAM_NEEDS = {
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
const GORE_MATS = new WeakMap();
function goreMats(M) {
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
const WOUND_CACHE = new Map();
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
function unitWound(seg, rows, bones) {
    const key = `${seg}|${rows}|${bones}`;
    const hit = WOUND_CACHE.get(key);
    if (hit)
        return hit;
    const pos = [];
    const uv = [];
    const idx = [];
    // t → height, in units of the section's radius. Below the cut in the middle,
    // above it at the rim, folded back under at the very edge.
    const LIP = [[0, -0.22], [0.4, -0.15], [0.78, 0.11], [0.9, 0.05], [1, -0.2]];
    const lip = (t) => {
        let i = 0;
        while (i < LIP.length - 2 && t > LIP[i + 1][0])
            i++;
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
    const shafts = [];
    for (let k = 0; k < bones; k++) {
        const r = bones > 1 ? 0.19 : 0.28;
        const dx = bones > 1 ? (k === 0 ? -0.34 : 0.30) : 0;
        const dz = bones > 1 ? (k === 0 ? 0.08 : -0.1) : 0;
        const g = rod(r * 0.92, r, 0.46, Math.max(5, Math.round(seg * 0.5)));
        const p = g.getAttribute("position");
        for (let i = 0; i < p.count; i++) {
            if (p.getY(i) <= 0)
                continue;
            p.setY(i, p.getY(i) + hash(i, 17 + k * 7) * 0.16 - 0.04);
        }
        p.needsUpdate = true;
        g.computeVertexNormals();
        // Sunk so the shaft rises out of the hollow rather than floating over it.
        g.applyMatrix4(xf(dx, 0.06, dz));
        shafts.push(g);
    }
    const bone = shafts.length === 1 ? shafts[0] : (mergeGeometries(shafts, false) ?? shafts[0]);
    if (shafts.length > 1)
        for (const g of shafts)
            if (g !== bone)
                g.dispose();
    const made = { meat, bone };
    WOUND_CACHE.set(key, made);
    return made;
}
const WOUND_LOD = {
    high: { seg: 16, rows: 5 },
    medium: { seg: 12, rows: 4 },
    low: { seg: 8, rows: 3 },
};
/**
 * A wound sized onto one seam and pointed the way it opens. Two meshes, sharing
 * one geometry pair with every other wound in the match.
 */
function woundAt(seam, M, detail, facing) {
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
    if (facing < 0)
        g.rotation.x = Math.PI;
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
function project(mesh, worldToFrame) {
    const geo = mesh.geometry;
    const pos = geo.getAttribute("position");
    const n = pos.count;
    if (SCRATCH_P.length < n * 3)
        SCRATCH_P = new Float32Array(n * 3);
    const out = SCRATCH_P;
    const skin = geo.hasAttribute("skinIndex") ? asSkinned(mesh) : null;
    const m = _sm.multiplyMatrices(worldToFrame, mesh.matrixWorld);
    for (let i = 0; i < n; i++) {
        _sv.fromBufferAttribute(pos, i);
        if (skin)
            skin.applyBoneTransform(i, _sv);
        _sv.applyMatrix4(m);
        out[i * 3] = _sv.x;
        out[i * 3 + 1] = _sv.y;
        out[i * 3 + 2] = _sv.z;
    }
    return out;
}
const PIECES = [];
// A waist cut on a cloaked huscarl is the worst case at about twenty slots, so
// this holds two of them plus a scattering of limbs. Past it the oldest
// severance on the field is put back — a corpse losing its arm again after four
// other men have died is the correct thing to spend.
const PIECE_CAP = 48;
let pieceClock = 0;
const LIVE = [];
function newSlot() {
    const slot = {
        geo: new THREE.BufferGeometry(),
        pos: new THREE.BufferAttribute(new Float32Array(0), 3),
        uv: new THREE.BufferAttribute(new Float32Array(0), 2),
        idx: new THREE.BufferAttribute(new Uint32Array(0), 1),
        verts: 0, tris: 0, busy: false, stamp: 0, owner: null,
    };
    return slot;
}
function fitSlot(slot, verts, tris) {
    if (slot.verts >= verts && slot.tris >= tris)
        return;
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
function acquirePiece(verts, tris, owner) {
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
function harvest(mesh, p, side, into, owner) {
    const geo = mesh.geometry;
    const pos = geo.getAttribute("position");
    const uv = geo.getAttribute("uv");
    const index = geo.getIndex();
    const faces = index ? index.count / 3 : pos.count / 3;
    const vertOf = index ? (k) => index.getX(k) : (k) => k;
    let tris = 0;
    for (let f = 0; f < faces; f++) {
        const a = vertOf(f * 3);
        const b = vertOf(f * 3 + 1);
        const c = vertOf(f * 3 + 2);
        if ((p[a * 3 + 1] + p[b * 3 + 1] + p[c * 3 + 1]) * side > 0)
            tris++;
    }
    if (tris === 0)
        return null;
    const slot = acquirePiece(Math.min(pos.count, tris * 3), tris, owner);
    if (SCRATCH_R.length < pos.count)
        SCRATCH_R = new Int32Array(pos.count);
    const remap = SCRATCH_R;
    remap.fill(-1, 0, pos.count);
    const P = slot.pos.array;
    const U = slot.uv.array;
    const I = slot.idx.array;
    const box = new THREE.Box3();
    let vn = 0;
    let tn = 0;
    for (let f = 0; f < faces; f++) {
        const tri = [vertOf(f * 3), vertOf(f * 3 + 1), vertOf(f * 3 + 2)];
        if ((p[tri[0] * 3 + 1] + p[tri[1] * 3 + 1] + p[tri[2] * 3 + 1]) * side <= 0)
            continue;
        for (const v of tri) {
            let r = remap[v];
            if (r < 0) {
                r = vn++;
                remap[v] = r;
                _sv.set(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
                if (into)
                    _sv.applyMatrix4(into);
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
const asMesh = (o) => (o.isMesh ? o : null);
const asSkinned = (o) => (o.isSkinnedMesh ? o : null);
const isBone = (o) => o.isBone === true;
/** Walks a rig subtree, separating what this file built from what was hung on it. */
function collectRig(node, skip, meshes, carried) {
    for (const c of node.children) {
        if (skip && skip.includes(c))
            continue;
        const mesh = asMesh(c);
        if (mesh) {
            if (mesh.name.startsWith(RIG_TAG))
                meshes.push(mesh);
            else
                carried.push(mesh);
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
function retainRig(geo) {
    const n = USES.get(geo);
    if (n === undefined)
        return false;
    USES.set(geo, n + 1);
    return true;
}
const _sf = new THREE.Matrix4();
function severBody(ctx, zone, opts = {}) {
    const route = ZONE_SEAM[zone];
    if (!route)
        return null;
    const detail = opts.detail ?? ctx.detail;
    let id = route[opts.at ?? route.deep];
    if (id === "waist" && detail === "low")
        id = "neck";
    // Once already gone, or hanging off something already gone. A man cannot lose
    // the same forearm twice, and nothing comes off an upper body that has itself
    // left the field.
    if (ctx.live.has(id) || ctx.live.has("waist"))
        return null;
    const needs = SEAM_NEEDS[id];
    if (needs && ctx.live.has(needs))
        return null;
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
    const meshes = [];
    const carried = [];
    if (id === "waist") {
        collectRig(ctx.root, ctx.legs, meshes, carried);
    }
    else if (id === "neck") {
        collectRig(ctx.head, null, meshes, carried);
        // The throat is torso geometry — the neck shell, its two straps and the
        // larynx are swept with the body and merged into its skin slot — so a head
        // that came off without them would leave the collar's contents standing.
        meshes.push(...ctx.torso);
    }
    else {
        collectRig(seam.anchor, null, meshes, carried);
    }
    const owner = {};
    const away = seam.away;
    const part = new THREE.Group();
    part.name = `${RIG_TAG}severed:${id}`;
    frame.decompose(part.position, part.quaternion, part.scale);
    const slots = [];
    const hidden = [];
    const grafted = [];
    const retained = [];
    const moved = [];
    const carryWhole = (mesh) => {
        const clone = new THREE.Mesh(mesh.geometry, mesh.material);
        clone.name = mesh.name;
        clone.castShadow = mesh.castShadow;
        clone.receiveShadow = mesh.receiveShadow;
        _sf.multiplyMatrices(toFrame, mesh.matrixWorld).decompose(clone.position, clone.quaternion, clone.scale);
        part.add(clone);
        if (retainRig(mesh.geometry))
            retained.push(mesh.geometry);
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
            if (!mesh.geometry.boundingBox)
                mesh.geometry.computeBoundingBox();
            const bb = mesh.geometry.boundingBox;
            if (bb) {
                span.copy(bb).applyMatrix4(_sf.multiplyMatrices(toFrame, mesh.matrixWorld));
                const near = Math.min(span.min.y * away, span.max.y * away);
                const far = Math.max(span.min.y * away, span.max.y * away);
                if (far <= 0)
                    continue;
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
        if (!wholeWalk && _sv.setFromMatrixPosition(_sf).y * away <= 0)
            continue;
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
    const severance = {
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
            if (done)
                return;
            done = true;
            // The piece's geometry belongs to the pool the moment this returns, so the
            // piece itself has to leave the scene with it.
            part.removeFromParent();
            for (const m of grafted)
                m.removeFromParent();
            stump.removeFromParent();
            for (const s of slots) {
                s.busy = false;
                s.owner = null;
            }
            // Shared body geometry the piece was carrying rather than copying. This is
            // the refcount `emit` keeps, not a real free — the last body wearing this
            // kit is still the one that releases it.
            for (const g of retained)
                g.dispose();
            for (const r of moved) {
                r.parent?.add(r.obj);
                r.obj.position.copy(r.position);
                r.obj.quaternion.copy(r.quaternion);
                r.obj.scale.copy(r.scale);
            }
            for (const m of hidden)
                m.visible = true;
            ctx.live.delete(id);
            const i = LIVE.findIndex((e) => e.owner === owner);
            if (i >= 0)
                LIVE.splice(i, 1);
        },
    };
    ctx.live.set(id, severance);
    LIVE.push({ owner, release: severance.release });
    return severance;
}
function signatureOf(cls, ap, accents, detail, lib) {
    return [
        lib, detail, cls, accents,
        ap.helm, ap.hairStyle, ap.hairColor, ap.beardStyle, ap.beardColor,
        ap.cloak, ap.armorColor, ap.warPaint,
    ].join("|");
}
/** A tint no palette entry uses, so the hair's meshes can be told by colour. */
const HAIR_PROBE_TINT = 0x2fe07a;
/** Every mesh under the head pivot, as `hex -> world positions`. */
function headMeshesByTint(root) {
    const out = new Map();
    let pivot = null;
    root.traverse((o) => { if (!pivot && o.name === `${RIG_TAG}headPivot`)
        pivot = o; });
    const from = (pivot ?? root);
    from.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    from.traverse((o) => {
        const m = o;
        if (!m.isMesh)
            return;
        const mat = (Array.isArray(m.material) ? m.material[0] : m.material);
        const hex = mat?.color?.getHexString?.() ?? "??";
        const pos = m.geometry?.attributes?.position;
        if (!pos)
            return;
        const idx = m.geometry.index;
        let arr = out.get(hex);
        if (!arr) {
            arr = [];
            out.set(hex, arr);
        }
        const n = idx ? idx.count : pos.count;
        for (let i = 0; i < n; i++) {
            const j = idx ? idx.array[i] : i;
            v.fromBufferAttribute(pos, j).applyMatrix4(m.matrixWorld);
            arr.push(v.x, v.y, v.z);
        }
    });
    return out;
}
/**
 * Does the hair fit under what is worn over it?
 *
 * Three builds at one seed: bare-headed, helmed-and-shaved, and dressed. The
 * first two name the covering meshes by difference; the third supplies the hair.
 */
export function hairFitProbe(cls, seed, helm, hairStyle) {
    const base = { ...defaultAppearance(cls), beardStyle: "none", hairColor: HAIR_PROBE_TINT };
    const build = (a) => headMeshesByTint(buildCharacter(cls, { ...base, ...a }, 0x8a6b3f, undefined, "high", seed).group);
    const bare = build({ helm: "none", hairStyle: "shaved" });
    const capped = build({ helm, hairStyle: "shaved" });
    const full = build({ helm, hairStyle });
    const coverHex = [...capped.keys()].filter((h) => !bare.has(h));
    const hairHex = HAIR_PROBE_TINT.toString(16).padStart(6, "0");
    // The skull's centre, rebuilt through the same two lines `buildCharacter`
    // used, because the stature step it quantises to scales the skeleton.
    const step = Math.round(hash(seed, 31) * 2) - 1;
    const B = BUILD[cls] ?? BUILD.warden;
    const S = skeleton({ ...B, stature: B.stature * (1 + step * 0.022) });
    const cy = S.headY;
    // 2.5 degrees a bin: a rim is one bin wide, and a bin is about 4 mm on this
    // head — finer than any feature either layer has.
    const NU = 144, NV = 72;
    const inner = new Float64Array(NU * NV).fill(Infinity);
    const binOf = (x, y, z) => {
        const dy = y - cy;
        const r = Math.hypot(x, dy, z) || 1e-9;
        const az = Math.atan2(x, z);
        const el = Math.asin(Math.max(-1, Math.min(1, dy / r)));
        let iu = Math.floor(((az + Math.PI) / (Math.PI * 2)) * NU);
        let iv = Math.floor(((el + Math.PI / 2) / Math.PI) * NV);
        iu = Math.max(0, Math.min(NU - 1, iu));
        iv = Math.max(0, Math.min(NV - 1, iv));
        return [iu, iv, r];
    };
    const put = (x, y, z) => {
        const [iu, iv, r] = binOf(x, y, z);
        const k = iv * NU + iu;
        if (r < inner[k])
            inner[k] = r;
    };
    let coverTris = 0;
    for (const hex of coverHex) {
        const a = capped.get(hex);
        for (let t = 0; t + 8 < a.length; t += 9) {
            coverTris++;
            const px = [a[t], a[t + 3], a[t + 6]];
            const py = [a[t + 1], a[t + 4], a[t + 7]];
            const pz = [a[t + 2], a[t + 5], a[t + 8]];
            // Seven samples a triangle — the corners, the edge midpoints and the
            // centroid. A triangle sampled only at its corners leaves holes in the
            // table wherever it is larger than a bin, and a hole in this ruler reads
            // as "no cover here", which is the one answer it must never invent.
            for (const [wa, wb, wc] of [
                [1, 0, 0], [0, 1, 0], [0, 0, 1],
                [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3],
            ]) {
                put(px[0] * wa + px[1] * wb + px[2] * wc, py[0] * wa + py[1] * wb + py[2] * wc, pz[0] * wa + pz[1] * wb + pz[2] * wc);
            }
        }
    }
    // Only bins whose four neighbours are covered too. See the note on the rim.
    const solid = new Uint8Array(NU * NV);
    for (let iv = 1; iv < NV - 1; iv++) {
        for (let iu = 0; iu < NU; iu++) {
            const k = iv * NU + iu;
            if (!Number.isFinite(inner[k]))
                continue;
            const l = iv * NU + ((iu + NU - 1) % NU);
            const r = iv * NU + ((iu + 1) % NU);
            if (Number.isFinite(inner[l]) && Number.isFinite(inner[r])
                && Number.isFinite(inner[k - NU]) && Number.isFinite(inner[k + NU]))
                solid[k] = 1;
        }
    }
    const hairPts = full.get(hairHex) ?? [];
    let verts = 0, through = 0, worst = 0, shown = 0, all = 0;
    let worstAz = 0, worstEl = 0;
    for (let i = 0; i + 2 < hairPts.length; i += 3) {
        const [iu, iv, r] = binOf(hairPts[i], hairPts[i + 1], hairPts[i + 2]);
        const k = iv * NU + iu;
        all++;
        if (!Number.isFinite(inner[k])) {
            shown++;
            continue;
        }
        if (!solid[k])
            continue;
        verts++;
        const d = (r - inner[k]) * 1000;
        // 1.5 mm, which is one tessellation chord on the coarser of the two
        // surfaces. Counting anything past half a millimetre counts the mesh rather
        // than the fit, and a share that is mostly facets cannot be read as a hole.
        if (d > 1.5)
            through++;
        if (d > worst) {
            worst = d;
            worstAz = (iu + 0.5) / NU * 360 - 180;
            worstEl = (iv + 0.5) / NV * 180 - 90;
        }
    }
    return {
        cls, helm, hair: hairStyle,
        verts, coverTris,
        throughMm: worst,
        throughFrac: verts ? through / verts : 0,
        showFrac: all ? shown / all : 0,
        worstAzDeg: worstAz, worstElDeg: worstEl,
    };
}
/** The hair rungs, so `wearmeasure` can sweep every one of them. */
export const HAIR_VALUES = ["shaved", "short", "long", "braids"];
let FACE_SEQ = 0;
export function buildCharacter(cls, ap, accents, materials, detail = "high", seed) {
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
    // THE FINISH NOW DRESSES THE WHOLE MAN. `kit` is the coordinated palette off
    // `ap.armorColor` — see `FINISH_KIT` for the argument. Every colour below that
    // used to be a hard-coded constant reads out of it, which is what makes a
    // finish visible on a berserker who owns no mail and stops the warden being
    // green below the belt in all seven of them.
    const kit = finishKit(ap.armorColor);
    const mail = M.armour(kit.mail);
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
    const cloth = (color, girth) => M.tinted("wool", color, { repeat: clothRepeat(girth) });
    // Torso girth, for the layers that go round it: an ellipse's perimeter, near
    // enough, off the chest section the garments are actually swept on.
    const bodyGirth = Math.PI * (1.5 * (S.chestHW + S.chestHD) - Math.sqrt(S.chestHW * S.chestHD)) * 2;
    // The tunic. `accents` is the class's own constant from `render/anim.ts` and it
    // is no longer the whole answer — it shifts the finish's dye lot rather than
    // being it, which is what stops the warden being olive in all seven finishes.
    const wool = cloth(tunicDye(kit.tunic, accents), bodyGirth);
    const trouser = cloth(kit.trouser, 2 * Math.PI * S.legR[0]);
    const wrapWool = cloth(kit.wrap, 2 * Math.PI * S.legR[2]);
    // Tablet-woven braid, for the hem and the cuffs. Woven separately from the
    // garment and sewn on, so it is its own cloth at its own scale: 3 repeats round
    // a band 16 mm tall is a coarse pattern rather than a weave, which is what a
    // tablet loom actually makes. Takes the finish's wrap dye so a warrior's trim
    // agrees with his legs instead of being a third opinion.
    // Named `tablet` because `braid()` at module scope is the hair/beard curve
    // builder and belongs to another part of the file entirely.
    const tablet = M.tinted("wool", kit.wrap, { repeat: 3 });
    const hide = M.hide(kit.hide);
    const buff = thrifty ? hide : M.hide(kit.buff);
    // Linen is asked for by girth for the same reason wool is. A flat `repeat: 6`
    // put a ~200 mm tile on the shirt body and a ~75 mm one on the same shirt's
    // sleeve — one garment, two fabrics — and the coarse end is the finest cloth
    // in the set, where a visible tile costs most.
    const flax = (girth) => thrifty ? wool : M.tinted("linen", 0xc2b69c, { repeat: clothRepeat(girth) });
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
    //
    // AND THE COLOUR IS THE FINISH'S NOW, not a constant. This is the one material
    // on the list that every class carries several of — buckle frame, tongue, belt
    // studs, baldric boss, shoulder bosses, amulet bezel, cloak brooch, arm-cap
    // studs — so it is the surface that makes a finish visible on a berserker, who
    // owns no mail at all. Roughness and metalness are unchanged and stay argued
    // above: only the albedo moves.
    const brass = M.standard(kit.fitting, 0.46, 0.78);
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
    const faceTile = (color, roughness) => {
        if (thrifty)
            return skin;
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
    const reskin = new Map();
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
    if (tone !== canon)
        reskin.set(sclera, M.standard(tone.sclera, 0.34));
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
    const pelt = (girth) => M.tinted("wool", 0x8a7050, { repeat: Math.max(1, Math.round(girth / PELT_TILE)) });
    const ruffX = S.chestHW + 0.062;
    const ruffZ = S.chestHD + 0.062;
    const fur = pelt(Math.PI * (1.5 * (ruffX + ruffZ) - Math.sqrt(ruffX * ruffZ)));
    const furLock = pelt(2 * Math.PI * 0.024);
    const furPelt = pelt(0.3);
    const dark = M.standard(0x1a1310, 0.42);
    const rune = M.get("runeGlow");
    const cloakMat = cloth(CLOAK_COLORS[ap.cloak] ?? 0x5a4030, bodyGirth * 1.4);
    // THE SHADOW HOOD IS NOT A CLOAK, AND IT WAS BUILT OUT OF ONE.
    //
    // The hood, its mantle, its point and its shoulder drape were all raised on
    // `robed ? cloakMat : hide` — so on the runekeeper, who is the only `robed`
    // class and the only class issued the hood by default, the entire head
    // covering took `CLOAK_COLORS[ap.cloak]`. Buy the Blood Red Cloak and the
    // Shadow Hood turns red; and because the hood closes round the face with
    // nothing but an eye slot, a red hood is not a red hood — it is a RED
    // BALACLAVA, which is exactly what the owner is looking at and exactly what
    // he called it.
    //
    // Two separate faults in one expression. A helm-slot item must not be
    // coloured by the cloak slot: the shop sells them apart, a player who changes
    // one does not expect the other to move, and 120 gold of head furniture
    // taking its identity from a 90-gold garment is the same class of defect as
    // the armour finish tinting only mail. And an item NAMED the Shadow Hood has
    // to read as shadow at every price of cloak, which no bright dye can.
    //
    // So it is its own substance now: undyed dark wool, the same on every class,
    // at a tighter pitch than a cloak because a hood is a smaller garment and the
    // weave has to scale with the thing it is woven into. `hide` stops being the
    // unrobed fallback for the same reason — a hood is cloth on everybody.
    const hoodCloth = cloth(0x2a2521, bodyGirth * 0.62);
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
    function storeFor(signature) {
        let s = RIG_CACHE.get(signature);
        if (!s) {
            s = new Map();
            RIG_CACHE.set(signature, s);
        }
        return s;
    }
    function emit(name, parent, make, sig = base) {
        const store = sig ? storeFor(sig) : undefined;
        let merged = store?.get(name);
        if (!merged) {
            merged = make().merge();
            if (store && sig) {
                for (const { geo } of merged)
                    guard(geo, sig);
                store.set(name, merged);
            }
        }
        const meshes = [];
        for (const { geo, mat } of merged) {
            if (sig)
                USES.set(geo, (USES.get(geo) ?? 0) + 1);
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
    // The warden. Named for what he is rather than for what he used to wear: the
    // flag was `lamellar` until the banded plate came off him, and a boolean named
    // after armour that is no longer on the model is how a file starts lying.
    const wallman = cls === "warden";
    const bare = cls === "berserker";
    const robed = cls === "runekeeper";
    // ==========================================================
    // LEGS — pivot at the hip joint, everything below in leg space
    // ==========================================================
    const legPivots = [];
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
            // ---- leg wraps (winingas) ----
            //
            // THE SECOND HALF OF THE KILT FINDING. `docs/COSMETICS-AUDIT.md` §1 says the
            // hem reads as a kilt "over legs that read bare, because the leg wraps are
            // only `rCalf * 1.1` proud and vanish". Measured against the leg shell under
            // them, the old wraps stood 4 mm proud at the knee and 8 mm at the calf — a
            // wound wool binding is a rope of cloth eight or ten turns deep and stands a
            // centimetre and a half off the shin. At 4 mm it is a slightly different
            // colour of leg, which is why the eye reported a bare one.
            //
            // Two changes and they do different jobs. THE WRAP IS NOW 14 mm PROUD at the
            // calf and 12 at the ankle, which is the brief's number and is what makes a
            // silhouette rather than a tint. AND IT IS WOUND RATHER THAN SMOOTH: five
            // stacked turns, each a short shell with its own rolled lower edge, each
            // stepping in a millimetre and a half as it climbs. A smooth cone with five
            // cords painted on it — which is what was here — has one continuous outline
            // and reads as a gaiter; five lapped turns have five hard horizontals on the
            // shin and read as something a man wound on this morning.
            //
            // THE KNEE BREAKS because the wrap stops 42 mm below it. The old top was at
            // `knee - 0.05` but only 4 mm proud, so nothing marked where it ended and
            // the leg was one unbroken taper from hip to ankle. A wrap that stands out
            // and then stops leaves the knee as the narrowest thing between two wider
            // ones, which is the joint the whole leg reads from.
            const wrapTop = knee - 0.042;
            const wrapBot = ankle + 0.022;
            const turns = lod.trim ? 5 : 3;
            // Proud-ness in metres, lerped down the shin: the binding is thickest over
            // the calf belly where the most cloth is wound and thins onto the ankle.
            const proudAt = (t) => mix(0.0145, 0.012, t);
            const legAt = (y) => {
                // The trouser shell's own radius at this height, so "proud" is measured
                // against the leg rather than asserted against a constant.
                const stations = [
                    [knee - 0.03, rKnee * 1.02], [knee - 0.12, rCalf], [ankle + 0.1, rAnkle * 1.3], [ankle, rAnkle],
                ];
                let i = 0;
                while (i < stations.length - 2 && y < stations[i + 1][0])
                    i++;
                const t = clamp01((stations[i][0] - y) / (stations[i][0] - stations[i + 1][0] || 1));
                return mix(stations[i][1], stations[i + 1][1], t);
            };
            const wrapR = (y) => {
                const t = clamp01((wrapTop - y) / (wrapTop - wrapBot));
                return legAt(y) + proudAt(t);
            };
            for (let i = 0; i < turns; i++) {
                const y0 = mix(wrapTop, wrapBot, i / turns);
                // Each turn laps a fifth of its own height past its share, which is the
                // overlap that makes the horizontal visible from the side.
                const y1 = mix(wrapTop, wrapBot, (i + 1) / turns) - ((wrapTop - wrapBot) / turns) * 0.18;
                // A turn is fatter at its bottom edge than at its top — cloth lapping over
                // cloth — so the stack is scalloped rather than conical.
                const r0 = wrapR(y0) - 0.0016;
                const r1 = wrapR(y1) + 0.0012;
                p.add(shell([
                    { y: y0, hw: r0, hd: r0 * 1.06 },
                    { y: y1, hw: r1, hd: r1 * 1.07 },
                ], lod.limb, { wall: 0.007, capTop: i === 0 }), wrapWool);
                if (lod.trim) {
                    // The rolled edge of the turn. A rim is a specular line and a cone is
                    // not; this is the thing that actually resolves at fight distance.
                    p.add(ring(r1 * 1.02, 0.0042, 4, 10), wrapWool, xf(0, y1, 0, Math.PI / 2, 0, 0.1, 1, 1, 1.06));
                }
            }
            if (lod.trim) {
                // The tie that holds the top turn down.
                //
                // WHAT WAS HERE FIRST WAS A LITERAL X. Two 62 mm dark boxes leaned ±0.5 rad
                // and stood 6 mm off the wool, and `art/shots/stance.png` renders them as
                // exactly that — a crossed mark painted on the shin, the same read as the
                // brass diamond on the warden's chest and the belt plate before it. This
                // file has now produced that defect four times and the mechanism is always
                // the same: a fitting drawn as a *symbol* instead of as the object.
                //
                // A winingas is tied with a narrow band taken round the leg and knotted at
                // the outside of the calf. So: a band that goes round — a real ring, on the
                // leg's own axis, at the leg's own radius, which cannot read as a mark
                // because it has no ends — and a small knot with two short tails where a
                // man's hands would have left it.
                const tieY = wrapTop - 0.019;
                const tieR = wrapR(tieY);
                p.add(ring(tieR * 1.01, 0.0038, 4, 12), hide, xf(0, tieY, 0, Math.PI / 2, 0, 0, 1, 1, 1.06));
                p.add(ball(0.0088, 7), hide, xf(side * tieR * 0.97, tieY, 0, 0, 0, 0, 1, 0.8, 0.66));
                for (const t of [-1, 1]) {
                    p.add(rod(0.0034, 0.0022, 0.038, 5), hide, xf(side * tieR * 0.99, tieY - 0.016, t * tieR * 0.28, 0.3 * t, 0, side * 0.22));
                }
            }
            if (wallman && lod.trim) {
                // CROSS-GARTERING, WHICH IS WHAT WAS ACTUALLY WORN, replacing the iron
                // shin plate that stood here. The plate went for the same reason the six
                // banded courses above it went: it is Roman greave logic, and
                // `docs/COSMETICS-AUDIT.md` §1 lists it in the same breath as the cuirass.
                //
                // Anglo-Saxon manuscript figures bind the lower leg with a thong taken
                // round and round in crossing turns over the wraps, and that is a *better*
                // read for the warden than the plate ever was: it says disciplined, kitted
                // and drilled without claiming armour nobody in England wore, and it is
                // the one leg on the roster with a diagonal on it.
                //
                // Four bands, alternately raked, each a full ring on the leg's own axis.
                // Full rings on purpose — the crossed pair of straight thongs I tried on
                // the wrap tie rendered as a painted X and had to be torn out, and the
                // lesson is that a binding must be seen to go round.
                for (let i = 0; i < 4; i++) {
                    const t = (i + 0.5) / 4;
                    const y = mix(wrapTop - 0.012, wrapBot + 0.03, t);
                    const r = wrapR(y) + 0.0025;
                    p.add(ring(r, 0.0042, 4, 12), hide, xf(0, y, 0, Math.PI / 2, 0, (i % 2 ? 0.34 : -0.34), 1, 1, 1.06));
                }
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
            const lastAt = (fwd, hw, top, lift = 0) => ({ y: -fwd, hw, hd: (top - lift) * 0.5, z: (top + lift) * 0.5 });
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
        const spine = [
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
        const seat = [
            { y: S.crotchY + 0.034, hw: S.hipHW * 0.87, hd: S.hipHD * 0.93, z: -0.009 },
            { y: S.crotchY, hw: S.hipHW * 0.62, hd: S.hipHD * 0.75, z: -0.003 },
        ];
        const at = (y, pad, flare = 0) => {
            let i = 0;
            while (i < spine.length - 2 && y < spine[i + 1].y)
                i++;
            const a = spine[i];
            const b = spine[i + 1];
            const t = clamp01((a.y - y) / (a.y - b.y || 1));
            return { y, hw: mix(a.hw, b.hw, t) + pad + flare, hd: mix(a.hd, b.hd, t) + pad + flare };
        };
        const layer = (ys, pad, flares) => ys.map((y, i) => at(y, pad, flares?.[i] ?? 0));
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
        }
        else {
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
        // THE HEM THAT READ AS A KILT. `docs/COSMETICS-AUDIT.md` §1: "a straight
        // horizontal flare at mid-thigh over legs that read bare". Both halves of that
        // are true and this is the first of them — the garment was one closed cone
        // that ended in one unbroken horizontal all the way round, on all four
        // classes, which is a skirt and not a tunic.
        //
        // A tunic is slit at the centre front and the centre back. That is not
        // decoration: it is how a man walks, rides and fights in one, it is on every
        // reconstruction of the period, and it turns the single horizontal into two
        // hanging panels with two vertical edges between them — a shape that reads as
        // *cloth over legs* rather than as a bell the legs come out of. The slit is
        // also the one place the leg wraps below can be seen from the front, which is
        // what makes the second half of the audit's finding fixable at all.
        //
        // THE RUNEKEEPER IS EXEMPT AND THAT IS THE POINT. He is the only class whose
        // outer garment stays closed to the hem, because he is not a fighting man in a
        // fighting man's tunic — he is a wisdom figure in a long robe, and an unslit
        // hem is the cheapest true thing that says so. Coverage and cut, not invented
        // armour: three slit tunics at three lengths and one closed robe.
        const slitY = mix(S.hipY, tunicHem, 0.16);
        if (!bare) {
            if (robed) {
                p.add(shell(layer([collar, ramp, S.shoulderY + 0.01, S.chestY, S.waistY, S.hipY, tunicHem + 0.06, tunicHem], 0.021, [-0.003, 0, 0, 0, 0.003, 0.01, 0.03, 0.045]), seg, { power: 2.3, wall: 0.014 }), cloakMat);
            }
            else {
                // Closed from the collar to where the slits start, just below the hip.
                p.add(shell(layer([collar, ramp, S.shoulderY + 0.01, S.chestY, S.waistY, S.hipY, slitY], 0.021, [-0.003, 0, 0, 0, 0.003, 0.01, 0.022]), seg, { power: 2.3, wall: 0.014 }), wool);
                // Then two panels, one over each leg, lapping 14 mm over the closed part
                // and half a millimetre proud of it so the join is a lap and not a
                // z-fight. They hang 20 mm lower than the old single hem and flare wider,
                // so the outline gains a swing it never had.
                //
                // `gap` is the half-angle of each slit. 0.115 rad either side of centre
                // front and centre back opens roughly 35 mm at the hem, which is wide
                // enough to survive the 390 px column and narrow enough that the man is
                // not wearing two aprons.
                const gap = 0.115;
                const panelSeg = Math.max(5, Math.round(seg / 2));
                const panelBottom = tunicHem - 0.02;
                const panel = layer([slitY + 0.014, mix(slitY, panelBottom, 0.45), panelBottom + 0.055, panelBottom], 0.021, [0.0225, 0.036, 0.056, 0.072]);
                for (const startAngle of [-Math.PI / 2 + gap, Math.PI / 2 + gap]) {
                    p.add(shell(panel, panelSeg, {
                        power: 2.3, wall: 0.014, arc: Math.PI - gap * 2, start: startAngle,
                    }), wool);
                    if (lod.trim) {
                        // Tablet-woven braid at the hem. This is the period's own way of
                        // finishing an edge and it is the cheapest flare in the file: a 16 mm
                        // band in the finish's second wool, on the one horizontal the eye
                        // already goes to. It also does structural work — the panel's lower
                        // rim used to be the only thing marking the hem, and a rim strip two
                        // pixels wide is this file's most reliable source of crawl.
                        const [a, b] = [panel[2], panel[3]];
                        const bandTop = (t) => ({
                            y: mix(a.y, b.y, t),
                            hw: mix(a.hw, b.hw, t) + 0.0022,
                            hd: mix(a.hd, b.hd, t) + 0.0022,
                        });
                        p.add(shell([bandTop(0.71), bandTop(1)], panelSeg, {
                            power: 2.3, wall: 0.006, arc: Math.PI - gap * 2, start: startAngle,
                        }), tablet);
                    }
                }
            }
        }
        else {
            // A sleeveless hide jerkin, open at the chest, cut off at the hip — the
            // berserker's hem is the highest on the roster and the reason he reads as
            // all limb.
            // AND IT IS OPEN NOW. The audit's word for this class is HALF-STRIPPED, and
            // what was here was a closed hide tube from shoulder to hip with a flat
            // 140 × 340 mm slab laid on the front of it — a fully covered torso plus a
            // plank. `art/shots/lineup.png` reads him as the most clothed man on the
            // roster after the huscarl, which is the opposite of his whole idea.
            //
            // The jerkin runs round the back and both flanks and stops short of the
            // centre front, so a hand's width of bare chest shows from throat to belt
            // with the bone strings hanging on it. Same partial sweep the tunic panels
            // use. He is the only class whose skin is part of his silhouette, and that
            // is worth more to him than any amount of added kit.
            const openGap = 0.30;
            p.add(shell(layer([S.shoulderY + 0.02, S.chestY - 0.02, S.waistY, tunicHem], 0.024, [0, 0, 0.002, 0.008]), seg, {
                power: 2.3, wall: 0.016,
                arc: Math.PI * 2 - openGap * 2, start: Math.PI / 2 + openGap,
            }), buff);
            if (lod.trim) {
                // Laced across the opening. Four short thongs and eight eyelets — a lace
                // is a repeated rung between two edges, and the rungs are what make it
                // read as one; a single crossed pair is the painted X this file has now
                // drawn wrong twice, once on a chest and once on a shin.
                for (let i = 0; i < 4; i++) {
                    const y = mix(S.chestY + 0.055, S.waistY + 0.02, (i + 0.5) / 4);
                    const st = at(y, 0.024);
                    const z = st.hd * 0.985;
                    const x = Math.cos(Math.PI / 2 - openGap) * st.hw;
                    p.add(box(x * 2.05, 0.0075, 0.006), hide, xf(0, y, z + 0.004, 0, 0, (i % 2 ? 1 : -1) * 0.16));
                    for (const s of [-1, 1]) {
                        p.add(ring(0.0055, 0.0022, 4, 8), brass, xf(s * x, y, z + 0.003, Math.PI / 2, 0, 0, 1, 1, 0.6));
                    }
                }
            }
        }
        // THE METAL LAYER, AND THE WARDEN'S IS NOT WHAT IT WAS.
        //
        // What stood here was six rigid courses, each overhanging the one below, with
        // a plate yoke over the shoulders and an iron shin plate down on the leg.
        // `docs/COSMETICS-AUDIT.md` §1 names it: BANDED RIGID PLATE IS ROMAN AND
        // BYZANTINE AND IS NOT ATTESTED IN ANGLO-SAXON ENGLAND. It is lorica
        // segmentata with the serial numbers filed off, it was the single loudest
        // wrong note in the lineup, and the owner asking for "more flare and
        // uniqueness for the anglo saxon style" is asking for this to go first.
        //
        // WHAT REPLACES IT IS NOT LESS ARMOUR, IT IS A DIFFERENT CUT OF THE SAME
        // ARMOUR — which is the whole method here. He gets the byrnie every armoured
        // Anglo-Saxon fighting man wore, and he is told apart from the huscarl by
        // WHERE IT STOPS rather than by what it is made of:
        //
        //   huscarl  a lord's retainer in a long hauberk — mail hangs 30 mm BELOW the
        //            tunic, so the outermost line on him is metal, plus the mantle.
        //   warden   a shield-wall man in a short byrnie — mail stops at the HIP,
        //            well ABOVE his tunic hem, so he shows two horizontals: a metal
        //            edge high and a wool edge low, with slit panels below that.
        //
        // That is one silhouette cue the eye reads instantly and no reconstruction
        // has to be invented for it. Everything else on him is period fittings.
        if (wallman) {
            // The byrnie. Short — it ends at the hip, which is the cut a man wants when
            // he is braced shoulder to shoulder and needs his legs.
            const byrnieHem = S.hipY - 0.055;
            p.add(shell(layer([collar - 0.012, ramp, S.shoulderY + 0.02, S.chestY, S.waistY, S.hipY, byrnieHem + 0.04, byrnieHem], 0.034, [-0.004, 0, 0, 0, 0.004, 0.012, 0.026, 0.036]), seg, { power: 2.3, wall: 0.016 }), mail);
            // Leather edging on the byrnie's hem. Mail is knitted iron and it unravels
            // at a cut edge; every reconstruction binds it in hide, and here it does the
            // same job it does on a real one — it makes the edge an edge. This is the
            // high horizontal his read depends on.
            p.add(shell(layer([byrnieHem + 0.019, byrnieHem - 0.004], 0.034, [0.0295, 0.0375]), seg, { power: 2.3, wall: 0.007 }), hide);
            // The shield-shoulder doubling, on the LEFT ONLY, and the asymmetry is the
            // point. A shield-wall man takes every blow that gets past the boss on one
            // shoulder, and the kit that survives that has a second layer of mail sewn
            // over hide exactly there. It is the only asymmetric armour on the roster,
            // it is instantly legible from the front at fight distance, and unlike a
            // crest it survives every helmet in the shop.
            p.add(shell([
                { y: S.shoulderY + 0.052, hw: S.chestHW * 0.60, hd: S.chestHD * 0.92 },
                { y: S.shoulderY - 0.020, hw: S.chestHW * 0.74, hd: S.chestHD * 1.02 },
                { y: S.chestY + 0.010, hw: S.chestHW * 0.70, hd: S.chestHD * 1.00 },
            ], Math.max(6, Math.round(seg / 2)), {
                power: 2.2, wall: 0.013, arc: 2.35, start: Math.PI / 2 + 0.28,
            }), mail);
            if (lod.trim) {
                // Its own bound edge, and three rivets holding it to the shirt under it.
                p.add(shell([
                    { y: S.chestY + 0.028, hw: S.chestHW * 0.715, hd: S.chestHD * 1.015 },
                    { y: S.chestY + 0.008, hw: S.chestHW * 0.725, hd: S.chestHD * 1.025 },
                ], Math.max(6, Math.round(seg / 2)), {
                    power: 2.2, wall: 0.006, arc: 2.35, start: Math.PI / 2 + 0.28,
                }), hide);
                for (let i = 0; i < 3; i++) {
                    const a = Math.PI / 2 + 0.55 + i * 0.62;
                    p.add(ball(0.0075, 6), brass, xf(Math.cos(a) * (S.chestHW * 0.74), S.shoulderY - 0.012, Math.sin(a) * (S.chestHD * 1.05), 0, 0, 0, 1, 1, 0.6));
                }
            }
            // Standing mail collar. Kept exactly as it shipped and for the reason it was
            // built: without it the warden's topmost metal stopped at 1.552 and the only
            // thing above it was 60 mm of thin wool, which is why his neck read as the
            // longest of the four. It was already mail rather than plate, so the audit's
            // finding never touched it.
            p.add(shell(layer([collar - 0.012, ramp, S.shoulderY + 0.028], 0.03, [-0.004, 0, 0.008]), seg, { power: 2.3, wall: 0.013 }), mail);
        }
        else if (!bare) {
            // The huscarl's hauberk hangs 30 mm below his tunic — a mail hem is the
            // outermost line on him and it wants to be the one you see. Everyone else
            // wears a shirt of mail that stops well short of the garment under it, so
            // both edges read as edges.
            const mailHem = heavy ? tunicHem - 0.03 : tunicHem + 0.26;
            p.add(shell(layer([collar - 0.012, ramp, S.shoulderY + 0.02, S.chestY, S.waistY, S.hipY, mailHem + 0.05, mailHem], 0.036, [-0.004, 0, 0, 0, 0.004, 0.012, 0.036, 0.052]), seg, { power: 2.3, wall: 0.016 }), robed ? buff : mail);
            if (heavy) {
                // Bishop's mantle: a second cape of mail over the shoulders. This is the
                // huscarl's silhouette — heavy, round-shouldered, immovable.
                p.add(shell(layer([collar, ramp, S.shoulderY + 0.015, S.chestY + 0.005], 0.05, [-0.008, 0, 0, 0.018]), seg, { power: 2.2, wall: 0.014 }), mail);
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
                    p.add(box(0.046, ((yTop - yBot) / runs) * 1.75, 0.013), buff, xf(x, y, z, 0, Math.atan2(x, z), 0.4));
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
            p.add(shell(layer([collar - 0.006, ramp, S.shoulderY + 0.03, S.chestY + 0.02], 0.055, [-0.03, -0.012, 0.025, 0]), seg, { power: 2.0, wall: 0.02 }), fur);
            if (lod.trim) {
                // Locks hanging off the ruff, not boulders sitting on it. Each points
                // down and outward from the shoulder line, which is what makes fur read
                // as fur rather than as a shelf of eggs.
                for (let i = 0; i < 11; i++) {
                    const a = 0.55 + (i / 10) * (Math.PI * 1.85);
                    const rx = S.chestHW + 0.062;
                    const rz = S.chestHD + 0.062;
                    const len = 0.09 + Math.sin(i * 2.7) * 0.028;
                    p.add(rod(0.024, 0.005, len, 5), furLock, xf(Math.sin(a) * rx, S.shoulderY - 0.01 - len * 0.4, Math.cos(a) * rz, 0.55 * Math.cos(a), 0, -0.55 * Math.sin(a)));
                }
            }
            p.add(box(0.3, 0.6, 0.03), furPelt, xf(0, S.chestY - 0.12, -S.chestHD - 0.075, -0.12, 0, 0));
            for (let i = 0; i < 4; i++) {
                p.add(rod(0.008, 0.003, 0.06, 5), M.tinted("bone", 0xd8cfb4, { repeat: 1 }), xf(-0.06 + i * 0.04, S.chestY + 0.06, S.chestHD + 0.05, 2.6, 0, 0.2 - i * 0.13));
            }
            // THE TORC, and it goes on the one man with a bare throat to put it on.
            //
            // A neck ring and arm rings are how this culture wore its wealth — a lord
            // is a ring-giver and his men wear what he gave them — and it is the single
            // most period-legible ornament available that is not armour. It lands right
            // where the armoury's portrait lens is aimed, on skin, above an open
            // jerkin, so it is the berserker's answer to "basic and ugly" at the exact
            // framing where he was worst.
            //
            // It is `brass`, so it moves with the finish like every other fitting. That
            // matters more here than anywhere: he owns no mail, and before this pass the
            // finish had nothing on him to land on at all.
            const torcY = S.neckRoot - 0.030;
            const torcR = S.neckHW * 1.22;
            p.add(ring(torcR, 0.0072, 5, 14), brass, xf(0, torcY, -0.004, Math.PI / 2 + 0.16, 0, 0, 1, 1, 0.86));
            if (lod.trim) {
                // Terminals. A torc is not a closed hoop — it is a twisted bar bent round
                // with two knobbed ends meeting at the throat, and the two knobs are what
                // stop it reading as a hoop somebody dropped over his head.
                for (const s of [-1, 1]) {
                    p.add(ball(0.0125, 8), brass, xf(s * torcR * 0.30, torcY - 0.010, torcR * 0.80, 0, 0, 0, 1, 0.85, 0.85));
                }
            }
            // Arm rings on the other bicep, where a lord's gift is meant to be seen.
            for (let i = 0; i < (lod.trim ? 3 : 2); i++) {
                p.add(ring(S.armR[0] * 1.06, 0.0062, 4, 12), brass, xf(-S.shoulderX - 0.006, S.shoulderY - 0.10 - i * 0.028, 0, Math.PI / 2, 0, 0, 1, 1, 1.04));
            }
        }
        if (robed) {
            // LAYERED WOOL, which is the audit's own word for this class and the thing
            // he did not have. He was one robe and a belt: a single garment from collar
            // to hem in one value, which is why he reads as basic however much small
            // detail is hung on the belt. A wisdom figure's wealth is CLOTH — he owns
            // more of it than the fighting men and wears it in layers — so he gets a
            // short mantle over the shoulders, ending just below the chest, in the
            // finish's tunic dye rather than the robe's own.
            //
            // It does silhouette work as well as material work: the mantle's hem is a
            // second horizontal high on the body, and he was the only class on the
            // roster with exactly one.
            p.add(shell(layer([collar - 0.004, ramp, S.shoulderY + 0.018, S.chestY - 0.01, S.chestY - 0.055], 0.036, [-0.004, 0, 0.004, 0.016, 0.026]), seg, { power: 2.2, wall: 0.013 }), wool);
            if (lod.trim) {
                // Braid round the mantle's hem, and a pair of bone toggles at the throat
                // that explain how it stays on. Little metal on him, on purpose — that is
                // the line between a rune-carver and a warrior, and it is the reason his
                // finish has to reach his cloth or it does not reach him at all.
                p.add(shell(layer([S.chestY - 0.041, S.chestY - 0.058], 0.036, [0.0245, 0.0275]), seg, { power: 2.2, wall: 0.006 }), tablet);
                for (const s of [-1, 1]) {
                    p.add(rod(0.0055, 0.0042, 0.026, 6), M.tinted("bone", 0xd8cfb4, { repeat: 1 }), xf(s * 0.034, S.shoulderY + 0.008, S.chestHD + 0.042, 0.3, 0, s * 0.5));
                }
            }
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
                p.add(box(0.006, 0.062, 0.005), rune, slate.clone().multiply(xf(-0.019 + i * 0.019, 0.012, -0.0055, 0, 0, 0.08 - i * 0.08)));
            }
        }
        if (heavy && lod.trim) {
            for (let i = 0; i < 5; i++) {
                const a = -0.7 + i * 0.35;
                p.add(ball(0.014, 6), brass, xf(Math.sin(a) * (S.chestHW + 0.1), S.chestY + 0.012, Math.cos(a) * (S.chestHD + 0.092)));
            }
        }
        if (wallman) {
            // The cuirass lace is gone with the cuirass. Two iron loops and a thong
            // explaining how the front of a plate stays shut have nothing to hold shut
            // on a byrnie, and leaving them would be the same class of error as the
            // plate itself — a fitting for armour the man is not wearing.
        }
        // ---- THE SEAX, ON EVERY FREE MAN ----
        //
        // The single most Anglo-Saxon object it is possible to put on this roster, and
        // until now not one of the four carried one. The people are named for it. A
        // free man wore a seax at his belt the way he wore his shoes, whether he was a
        // lord's retainer, a shield-wall man, a berserker or a rune-carver, and it is
        // one of the places `docs/COSMETICS-AUDIT.md` explicitly points at when it
        // asks where to put period flare.
        //
        // WHY IT EARNS ITS TRIANGLES AT BOTH LENSES, which is the test everything on a
        // warrior has to pass. At fight distance it is a 210 mm hard diagonal across
        // the one part of the figure that was empty — the front of the hip, below the
        // belt and inside the tunic's new slit, where nothing else on the body lives.
        // At portrait range in the armoury it sits just under the frame's lower edge
        // on the figure lens and reads as the reason the belt is there.
        //
        // Hung on the right front, raked back and down, because the scabbard on the
        // left hip belongs to the sword and two things cannot hang in one place. Its
        // fittings are `brass`, so it moves with the finish like everything else.
        {
            const sxDrop = bare ? 0.02 : 0.0;
            const seaxAt = xf(S.hipHW * 0.66, S.beltY - 0.052 + sxDrop, S.waistHD * 0.86, 0.16, -0.62, -1.02);
            // The scabbard: a broken-back sheath, deeper at the throat than at the tip,
            // and wider than it is thick because a seax is a single-edged blade lying
            // flat against the hip.
            p.add(shell([
                { y: 0.008, hw: 0.0175, hd: 0.0092 },
                { y: -0.085, hw: 0.0165, hd: 0.0085 },
                { y: -0.178, hw: 0.0128, hd: 0.0070 },
                { y: -0.205, hw: 0.0052, hd: 0.0038 },
            ], 8, { power: 2.5, capTop: true, capBottom: true }), hide, seaxAt.clone());
            // Grip and pommel standing out of the throat. Horn, not wood: a seax grip is
            // the one place on a warrior where that substance appears, and `M.timber`
            // dark enough reads as it.
            p.add(shell([
                { y: 0.098, hw: 0.0118, hd: 0.0105 },
                { y: 0.060, hw: 0.0138, hd: 0.0118 },
                { y: 0.014, hw: 0.0122, hd: 0.0102 },
            ], 8, { power: 2.3, capTop: true, capBottom: true }), M.timber(0x3a2a1e), seaxAt.clone());
            if (lod.trim) {
                // Mouth ferrule, one suspension loop and a strap-end. Three small cast
                // fittings are what makes a sheath read as a sheath rather than as a dark
                // wedge, and they are the finish's metal.
                p.add(ring(0.0184, 0.0042, 4, 10), brass, seaxAt.clone().multiply(xf(0, 0.006, 0, Math.PI / 2, 0, 0, 1, 1, 0.55)));
                p.add(ring(0.0168, 0.0036, 4, 10), brass, seaxAt.clone().multiply(xf(0, -0.088, 0, Math.PI / 2, 0, 0, 1, 1, 0.55)));
                p.add(ball(0.0092, 7), brass, seaxAt.clone().multiply(xf(0, 0.104, 0, 0, 0, 0, 1, 0.72, 0.62)));
                // The thong from the loop up to the belt, which is the thing that stops a
                // knife looking stuck to a man's hip by nothing.
                p.add(rod(0.0028, 0.0028, 0.054, 5), hide, seaxAt.clone().multiply(xf(0.004, -0.062, 0.008, 0, 0, 0.34)));
            }
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
            }
            else if (clasp === "disc") {
                p.add(ball(0.021, 10), brass, xf(cx, cy, cz, 0, 0, 0, 1, 1, 0.55));
                p.add(ring(0.026, 0.006, 5, 12), brass, xf(cx, cy, cz - 0.005, 0.35, 0, 0));
            }
            else if (clasp === "ringpin") {
                // A penannular: an open ring with a long pin laid across it, which is a
                // taller, thinner object than a disc and reads as a different fastening
                // rather than as the same brooch in another metal.
                p.add(ring(0.030, 0.0055, 5, 14), brass, xf(cx, cy + 0.004, cz - 0.004, 0.35, 0, 0, 1, 1, 1));
                p.add(shell([
                    { y: -0.046, hw: 0.0028, hd: 0.0028 },
                    { y: 0.030, hw: 0.0052, hd: 0.0052 },
                ], 6, { capTop: true, capBottom: true }), brass, xf(cx, cy + 0.004, cz + 0.003, 0.3, 0, -0.62));
            }
            else {
                // 400 gold: a gilt disc, bossed, on a raised collet. The largest fitting
                // on the man's chest and the only one with a shadow under its rim.
                p.add(ring(0.036, 0.0075, 5, 16), gilt, xf(cx, cy, cz - 0.006, 0.35, 0, 0));
                p.add(ball(0.030, 12), gilt, xf(cx, cy, cz - 0.004, 0, 0, 0, 1, 1, 0.40));
                p.add(ball(0.011, 8), gilt, xf(cx, cy, cz + 0.008, 0, 0, 0, 1, 1, 0.8));
            }
        }
        // The neck used to be built here, and it is now its own part further down
        // the file — see `emit("neck", ...)` after the head. It moved because it
        // has to carry the head's complexion field, and this part is cached by
        // loadout and stature only while that field varies per seed.
        return p;
    });
    // ==========================================================
    // ARMS — pivot at the shoulder joint
    // ==========================================================
    const grips = HAND_GRIP[cls] ?? HAND_GRIP.warden;
    const armPivots = [];
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
                const CAP = [
                    [0.046, 0.44], [0.018, 0.86], [-0.026, 1.0], [-0.060, 0.96], [-0.092, 0.82],
                ];
                const capAt = (y) => {
                    let i = 0;
                    while (i < CAP.length - 2 && y < CAP[i + 1][0])
                        i++;
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
                    // The warden used to take `steel` here — polished plate lames on the
                    // shoulder to match the plate cuirass. The cuirass is gone, so the
                    // bright plate goes with it: his arm caps are mail like everybody
                    // else's, and what tells him apart is the doubling on his left
                    // shoulder, not a different metal on both.
                    lod.trim && i % 2 === 1 ? iron : mail);
                    if (lod.trim) {
                        // Rolled rim on each course's lower edge, which is what actually reads at
                        // twenty metres — a rim is a specular line and a plate is not.
                        p.add(ring(capAt(yB) * 1.02, 0.0062, 4, 12), iron, xf(0, yB, 0, Math.PI / 2, 0, 0, 1, 1, 1.03));
                    }
                }
                if (lod.trim) {
                    for (let i = 0; i < 4; i++) {
                        const a = -0.9 + i * 0.6;
                        p.add(ball(0.008, 6), brass, xf(Math.sin(a) * capR * 0.86, 0.022, Math.cos(a) * capR * 0.9));
                    }
                }
                if (heavy || wallman) {
                    p.add(shell([
                        { y: -0.035, hw: rSh * 1.3, hd: rSh * 1.32 },
                        { y: elbow + 0.09, hw: rEl * 1.36, hd: rEl * 1.38 },
                        { y: elbow + 0.04, hw: rEl * 1.42, hd: rEl * 1.44 },
                    ], lod.limb, { wall: 0.011 }), mail);
                }
            }
            else {
                // Bare arms: fur at the shoulder, iron rings on the biceps.
                p.add(shell([
                    { y: 0.075, hw: rSh * 1.1, hd: rSh * 1.14 },
                    { y: -0.02, hw: rSh * 1.5, hd: rSh * 1.55 },
                    { y: -0.075, hw: rSh * 1.3, hd: rSh * 1.34 },
                ], lod.limb, { power: 2.0, wall: 0.016, capTop: true }), pelt(2 * Math.PI * rSh * 1.45));
                p.add(ring(rSh * 1.02, 0.011, 5, 12), brass, xf(0, -0.14, 0, Math.PI / 2, 0, 0));
                if (lod.trim)
                    p.add(ring(rSh * 0.96, 0.009, 5, 12), brass, xf(0, -0.2, 0, Math.PI / 2, 0, 0));
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
            if (fist.warm)
                p.add(fist.warm, skinWarm, hand.clone());
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
    const K = { R, F: face };
    const faceMats = {
        skin: headSkin, shade: headShade, warm: headWarm, sclera, iris, dark, lash: hair,
    };
    const skullY = S.headY - S.neckTop;
    const style = helmStyle(ap.helm);
    const helmed = style.cap;
    // ============================================================
    // THE HEAD STACK — one owner for the order of things worn on a head
    // ============================================================
    //
    // Three complaints, one cause:
    //
    //   "the braided & long hair styles have a weird cutoff on the sides"
    //   "the Huscarl's chainmail at the rear of the head ... has some overlapping
    //    issues with helmets & hair styles"
    //   "shadow hood struggles with long hair with overlaps"
    //
    // NOTHING OWNED THE LAYERING ORDER. The scalp shell, the locks, the mane, the
    // war-locks, the coif, the bowl and the hood each placed themselves against
    // the skull independently, every one of them correct on its own and every
    // pair of them free to occupy the same cubic centimetre. The hair knew about
    // exactly one of the things that can be worn over it — `helmed` — and only as
    // a boolean, so a hood (which is not `cap`) got hair at FULL crown volume
    // under 6 mm of cloth, and the huscarl's aventail got 320 mm of falling mane
    // inside it. The `art/look/x_*` sheets show both: a brown slab standing
    // through the back of the hood, and a mane hanging in front of the mail.
    //
    // So the stack is declared here, once, ABOVE everything that obeys it:
    //
    //     skull -> hair -> coif/aventail -> helm/hood
    //
    // and every layer is offset outward from the one beneath it by a real
    // thickness rather than by a number chosen where it was typed. Three
    // functions say all of it, and they are the only things the hair below is
    // allowed to ask about what is worn over it:
    //
    //   `hairCeil(u, v)`  the largest standoff hair may have at this point, which
    //                     is the INNER WALL of whatever covers it less a gap.
    //                     Infinity where the head is open to the air. Hair is
    //                     COMPRESSED to it rather than culled by it, so a crop
    //                     under a helm is a liner and not an absence.
    //   `hairFall(u)`     how much FALLING mass survives at this azimuth. A hood
    //                     swallows hair by design and a coif is a bag of mail the
    //                     head goes into, so both take it to zero; an open helm
    //                     takes none of it, because hair has to come out from
    //                     under a helmet.
    //
    // The two definitions the hood and the coif are drawn from live here as well,
    // for the reason stated over `coifLevels` and burned into this file twice
    // already: a piece that keeps its own copy of where another piece is will
    // drift away from it. One definition, two readers.
    const hooded = ap.helm === "hood";
    const coifed = helmed && heavy;
    /** Angular distance from dead ahead, folded into 0..PI. */
    const awayFromFace = (u) => {
        const a = ((u % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        return a > Math.PI ? Math.PI * 2 - a : a;
    };
    /** Hair compressed under a shell that BEARS on the skull. A felt liner. */
    const HAIR_LINER = 0.005;
    // What one layer leaves clear under the inner wall of the layer above it.
    // 5 mm rather than 3: both surfaces are tessellated, and a garment's mesh
    // chord dips inside the analytic curve this reads by up to 3 mm on a 0.4 rad
    // row. A gap that only covers the mathematics is not a gap.
    const LAYER_GAP = 0.005;
    // ---- where the iron is ----
    // The band's lower rim, hoisted out of the helm branch so the hair can read
    // it. This is the latitude hair emerges from on every metal rung.
    const bandLo = lat(Y_BROW + mix(0.065, 0.005, clamp01((B.bowl - 0.76) / 0.36)))
        - (style.mask ? 0.050 : 0);
    // ---- where the mail is ----
    // Declared here rather than inside the coif that draws it, because THREE
    // pieces now have to agree about it: the nape fall, which lies outside the
    // mail; the coif, which draws it; and the hair, which has to lie inside it. A
    // piece carrying its own idea of the coif's radius is the mirrored-definition
    // fault this file has been bitten by twice.
    //
    // Started above the brow band rather than 20 mm below it. At R.y * 0.10 the
    // coif's top ring cleared the bottom of the band, so its `patch` rim strip —
    // 14 mm of surface facing straight up — stood out at each temple as a lit
    // grey tab. A coif's upper edge is riveted *inside* the bowl and is never
    // seen; 14 mm proud of the skull at this height is well within the band's
    // own 24 mm standoff, so it is covered.
    const coifLevels = [
        { y: skullY + R.y * 0.44, hw: R.x * 1.00 + 0.011, hd: R.z * 1.00 + 0.011, z: -0.008 },
        { y: skullY - R.y * 0.62, hw: R.x * 1.10 + 0.014, hd: R.z * 0.98 + 0.014, z: -0.020 },
        { y: skullY - R.y * 1.55, hw: R.x * 1.36 + 0.016, hd: R.z * 0.92 + 0.016, z: -0.028 },
        { y: skullY - R.y * 2.60, hw: R.x * 1.82 + 0.018, hd: R.z * 1.05 + 0.018, z: -0.032 },
    ];
    /** The coif's own half-breadth at a height, or 0 where no coif is worn. */
    const coifAt = (y, key) => {
        if (!heavy)
            return 0;
        if (y >= coifLevels[0].y)
            return coifLevels[0][key];
        for (let i = 0; i < coifLevels.length - 1; i++) {
            const a = coifLevels[i], b = coifLevels[i + 1];
            if (y <= a.y && y >= b.y)
                return mix(a[key], b[key], (a.y - y) / (a.y - b.y));
        }
        return coifLevels[coifLevels.length - 1][key];
    };
    /** Azimuth of the coif's front edge at a descent — the mail's own opening. */
    const coifRim = (v) => 1.46 + 0.34 * v * v;
    // ---- where the cloth is ----
    // The hood's rim and its lift, authored here and read twice: once by the hood
    // itself and once by the hair that has to fit under it. The hood is a `cap`
    // in every sense that matters to the layer beneath it — it bears on the skull
    // — and it was not one to the hair, which is the whole of the third fault.
    const hoodRim = (u) => -0.9 + 1.40 * Math.pow(clamp01((Math.cos(u) + 1) * 0.5), 2.2);
    const hoodCrown = Math.PI / 2 - 0.02;
    const hoodLift = (u, s) => 0.016 + 0.016 * s
        + 0.048 * (1 - s) * clamp01(-Math.cos(u))
        + 0.022 * Math.pow(1 - s, 1.5) * clamp01(Math.cos(u));
    const HOOD_THICK = 0.010;
    /**
     * THE CEILING. How far proud of the skin hair may stand at (u, v).
     *
     * Under a metal bowl it is a liner, because a helm flattens hair and the
     * bowl's own inner wall is 10 mm off a FORM that the skin can stand 16 mm
     * proud of. Under a hood it is the cloth's own inner wall less a gap, which
     * is generous at the nape where the cowl has a point and tight over the ear
     * where it does not — so hair FILLS a hood instead of being deleted by it.
     * Under mail it is the 8 mm a coif is padded for. In the open it is nothing
     * at all, and that is the point: a ceiling that is Infinity below the rim is
     * what makes hair come OUT from under a helmet.
     */
    //
    // AND EVERY LIFT OVER THE HAIR IS MEASURED FROM THE FORM, NOT FROM THE SKIN.
    // `helmWear` sweeps the bowl and the cowl on the low-passed head — that is
    // what stopped the helms folding — and the skin stands up to 16 mm PROUD of
    // that form over a brow ridge or an ear. So a cowl authored 25 mm off the
    // form has 9 mm of room over an ear and 25 over a temple, and a ceiling that
    // read the author's number would put hair through the cloth in exactly the
    // places the head is lumpiest. `hairFitProbe` measured that as 4.6 mm through
    // the hood and 8.0 mm through the Sutton Hoo before this term existed.
    const _hcForm = helmForm(K);
    const _hcA = new THREE.Vector3();
    const _hcB = new THREE.Vector3();
    /** How far the skin stands outside the form along this direction. */
    const skinProud = (u, v) => {
        dirOf(u, v, _hcA);
        faceSurface(K, _hcA, _hcA);
        formSurface(_hcForm, u, v, _hcB);
        return Math.max(0, _hcA.length() - _hcB.length());
    };
    const hairCeil = (u, v) => {
        let c = Infinity;
        if (hooded) {
            const a = hoodRim(u);
            // Capped at 22 mm however much room the cowl's point leaves. The hood is
            // three pieces — the cloth, the point behind the nape and the shoulder
            // drape — and only the first of them is in this formula; at the nape all
            // three overlap and the nearest of the three is the one the hair has to
            // clear. `hairFitProbe` found 4.6 mm of hair through them at 169 degrees
            // on two of the four classes. 22 mm is more volume than a head of hair
            // has under a cowl anyway, so this costs nothing that can be seen.
            c = Math.min(0.022, Math.max(0.002, hoodLift(u, clamp01((v - a) / (hoodCrown - a)))
                - HOOD_THICK - LAYER_GAP - skinProud(u, v)));
        }
        else if (helmed && v > bandLo - 0.02) {
            // THE WHOLE of the skin's proudness comes off, not the part of it past
            // 4 mm. A bowl raised on the low-passed form has its inner wall 10 mm off
            // THAT surface, and where the skin stands 9 mm proud of the form there is
            // 1 mm of room, not 5. `hairFitProbe` reads the difference as 2.6 mm of
            // Warrior Crop outside the Ridge-Helm's band on 3% of the shell.
            c = Math.max(0.001, HAIR_LINER - skinProud(u, v));
        }
        // AND THE BAND'S RIM IS NOT THE BOTTOM OF THE METAL. Eight of the ten rungs
        // hang cheek guards off it, down the sides of the face to the jaw, so a
        // hairline that has just been carried 26 mm further down the temple runs
        // straight into them — `hairFitProbe` found 15.4 mm of hair standing
        // through the Wyrm-Crest's deep guard at 39 degrees off dead ahead, on the
        // berserker as well as the huscarl, which is how it was known not to be the
        // coif. A guard is worn over a liner like everything else.
        if (helmed && style.cheek !== "none"
            && awayFromFace(u) > 0.45 && awayFromFace(u) < 1.60
            && v < bandLo && v > -0.95)
            c = Math.min(c, HAIR_LINER);
        // A nape fall or a neck guard hangs off the back of the band on five rungs,
        // so the back is metal below the rim as well as above it. 2 mm rather than
        // a liner's 5: a fall is swept on its own rings and the Jarl's Crowned's
        // flange passes about 3 mm INSIDE the skin at the top of the nape on every
        // seed — `hairFitProbe` reads the same fault with the hair shaved off, so
        // it is the plate rather than the hair — and hair under it is not visible
        // from any bearing whatever it does. This is as close to nothing as the
        // shell can be and still close its own rim strip inside the skin.
        if (helmed && style.nape !== "none" && awayFromFace(u) > 1.45 && v < bandLo + 0.28) {
            c = Math.min(c, -0.006);
        }
        // THE AVENTAIL, read off its own rings rather than guessed at. It is a bag
        // the head goes into and it laps the bowl at the temple, so it owns the
        // whole of the back and sides; but it is swept on horizontal rings, not on
        // the skull's field, so how much room it leaves is a function of where the
        // skull is inside it and that varies from 20 mm at the temple to 4 mm at
        // the top of the nape. A flat 8 mm was measured at 4-13 mm of hair through
        // the mail at 141-180 degrees on every huscarl rung that wears one. The z
        // offset of each ring is dropped on purpose: it carries the mail BACKWARDS,
        // which at the nape is further from the skull, so leaving it out can only
        // under-state the room.
        if (coifed && awayFromFace(u) > coifRim(0) - 0.16) {
            dirOf(u, v, _hcA);
            faceSurface(K, _hcA, _hcB);
            const y = _hcB.y + skullY;
            const mail = Math.hypot(Math.sin(u) * coifAt(y, "hw"), Math.cos(u) * coifAt(y, "hd"));
            c = Math.min(c, Math.max(0.002, mail - Math.hypot(_hcB.x, _hcB.z) - LAYER_GAP));
        }
        return c;
    };
    /**
     * THE FALL. How much of a hanging mass survives at this azimuth.
     *
     * A hood swallows hair; so does a coif, which is why a mailed man's hair is
     * never in the frame. A helm does not — it is a bowl on the crown with the
     * whole nape open under it — so an open rung keeps all of it. The ramp is
     * 0.34 rad wide so a mane dies INSIDE the garment rather than at its edge: a
     * mass that stops where the mail starts leaves a free `patch` boundary
     * standing on the mail, which is the same straight-edged rim strip the side
     * cutoff is made of.
     */
    const hairFall = (u) => {
        if (hooded)
            return 0;
        if (coifed)
            return 1 - smooth(coifRim(0) - 0.34, coifRim(0), awayFromFace(u));
        // A nape fall or a neck guard hangs off the back of the band and owns
        // everything behind 1.40 rad from the nape — see the fall's own note.
        if (helmed && style.nape !== "none") {
            return 1 - smooth(Math.PI - 1.74, Math.PI - 1.40, awayFromFace(u));
        }
        return 1;
    };
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
            // The bowl in the form-shadow tone. It shares its vertices with the helix,
            // so it is not a separate object with a rim of its own to catch the light.
            p.add(A.shade, headShade, place3);
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
            // `Y_NOSE - 0.020` was under the SUBNASALE, which on this head is the top
            // of the upper lip — 12 mm behind and 6 below the nose's own underside, so
            // both openings were inside the skull and the frame showed a nose with no
            // nostrils in it. The lobule's underside is the row at `Y_NOSE + 0.030`.
            const sub = faceSurface(K, dirOf(0, lat(Y_NOSE + 0.030), _d), new THREE.Vector3());
            for (const s of [-1, 1]) {
                // Ten segments, not six: at six a scaled sphere this small is a faceted
                // lozenge and renders as a dark rectangle, which on the underside of a
                // nose reads as a slot cut in it. Sunk far enough back that only the
                // opening clears the alar wall.
                p.add(ball(0.0062, 10), dark, xf(s * 0.0098 + K.F.asym, skullY + sub.y - 0.0012, sub.z - 0.0062, 0.52, s * 0.26, 0, 0.74, 0.42, 1.2));
            }
        }
        // Brows, conformed to the ridge. See the note inside the loop: the shape they
        // were authored with was the opposite of the shape the comment described, and
        // it is the loudest single defect in the frame this pass exists to answer.
        for (const s of [-1, 1]) {
            // ---- AND THE ARCH RAN THE WRONG WAY ----
            //
            // The comment three lines above this one said "the inner end sits lower
            // than the outer, which is what reads as a scowl rather than as surprise"
            // and the code did the exact opposite: `inner` was `Y_EYE + 0.245` and
            // `outer` was `Y_EYE + 0.175`, and a larger field `y` is HIGHER on the
            // head. So the inner ends were 8 mm above the outer ones and every warrior
            // in the game wore the pleading eyebrows of a man apologising. It is the
            // first thing the eye reads in
            // `art/shots/base0/cards/headturn-front_0_.png` and no amount of skull
            // underneath it was ever going to survive it.
            //
            // Authored as three heights now rather than as a lerp between two, because
            // a male brow is not a ramp: it leaves the nose LOW and heavy, runs almost
            // level to about two thirds, peaks there, and falls away toward the temple.
            // The whole excursion is 4 mm. It is the direction that carries the read.
            //
            // The pair has also come DOWN 12 mm. At `Y_EYE + 0.245` the inner end sat
            // 32 mm above the eye line, which on this head is the middle of the
            // forehead — hence two dark chevrons floating on a bald dome with nothing
            // between them and the eyes.
            const browAt = (t) => lat(Y_EYE + 0.170 + 0.030 * Math.sin(Math.PI * Math.pow(clamp01(t), 0.80)) - 0.010 * t * t);
            const along = (u) => clamp01((Math.abs(u) - 0.09) / 0.47);
            const arc = (u) => browAt(along(u));
            // Tapered at *both* ends, not just the temple one. Held full height at the
            // inner end, a brow is a bar with a squared-off inboard corner sitting 4 mm
            // proud of the forehead — two dark slabs, which is what the render showed —
            // and squared-off dark corners on a face read as injury. It also stands much
            // closer to the skin now: brow hair lies on a ridge, it does not perch on
            // one, and at 3.8 mm of lift with a 2.2 mm rim the patch was drawing its own
            // bright outline (see `patch`).
            // Heavier over the inner two thirds and gone by the temple. 0.044 rad of
            // latitude is 10 mm of brow, which is life on a head this size, and the
            // pair of them are the strongest dark shape on the face — worth having at
            // full weight where the ridge is and worth nothing at all past it.
            const half = (u) => {
                const t = along(u);
                return 0.044 * (1 - 0.74 * Math.pow(t, 1.5)) * smooth(0, 0.13, t);
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
            // ---- AND THE LEFT BROW WAS BUILT INSIDE OUT ----
            //
            // THIS is "eyebrows look like there are overlapped in parts so look
            // broken", and it is one sign.
            //
            // `patch` takes its winding from the grid: increasing t crossed with
            // increasing s faces outward, and every triangle it emits is wound on
            // that assumption. This call ran `u0: s * 0.09, u1: s * 0.56`, so on the
            // s = -1 side u ran from -0.09 DOWN to -0.56 — the parameter reversed,
            // the cross product flipped, and the whole shell came out with its outer
            // wall facing into the skull. Backface culling then throws that wall
            // away and draws the INNER one, which is sunk `thick` below the skin, so
            // what reaches the frame is whatever fragments of a 0.7 mm-buried
            // surface happen to clear the forehead: a brow with a rectangular bite
            // out of it, in a different tone from its partner, on one side only.
            // `art/look/brow.png` shows the pair side by side and they are not the
            // same object.
            //
            // `lidPatch` already knows this trap — its `tt = sign * (t * 2 - 1)` and
            // the note above it are about exactly this — and the brows and the
            // moustache halves below were written without it.
            //
            // So u ALWAYS ASCENDS. `arc` and `half` are functions of |u|, so the two
            // brows are now exact mirrors of one another by construction rather than
            // by hoping two sign flips cancel.
            const bIn = s > 0 ? 0.09 : -0.56;
            const bOut = s > 0 ? 0.56 : -0.09;
            p.add(headWear(K, {
                u0: bIn, u1: bOut,
                v0: (u) => arc(u) - half(u),
                v1: (u) => arc(u) + half(u),
                // Three rows, not two. The lift peaks on the middle row, so at nv = 2
                // the brow is a tent with one ridge line and two flat planes — and two
                // flat planes meeting along a crease is a fold, which is the second
                // thing reading as a seam down the middle of the stroke. At nv = 3 the
                // section is a rounded bead and the highlight runs along it instead of
                // breaking on it.
                //
                // FOUR, not three. The lift is a half-sine in `v` and `patch` samples
                // rows at j/nv, so an ODD row count never lands on v = 0.5 — the crest
                // is never evaluated and the whole bead comes out 13% thinner than it
                // is written to be. Every sine-lifted patch on this head wants an even
                // nv, and `cosmetictest --no-render` reads the difference: the same
                // change on the moustache below moved Clean Shaven -> Close Crop from
                // 1.07% to 0.61% at fight distance and took the ladder from 15/15 to
                // 14/15 on its own.
                nu: 16, nv: 4,
                // Heaviest at the head of the brow and thinning to the tail, which is
                // the way a brow actually grows: the old profile was symmetric in u,
                // so both ends tapered equally and the middle was the thickest part —
                // a leaf, not a brow.
                lift: (u, v) => {
                    const t = clamp01((Math.abs(u) - 0.09) / 0.47);
                    return 0.0004 + 0.0020
                        * Math.sin(Math.PI * clamp01(v))
                        * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.85);
                },
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
            //
            // AND IT SAT 30 mm ABOVE THE EAR, WHICH IS THE "WEIRD CUTOFF ON THE
            // SIDES". Every term above is even in `u` about the temple, so the line
            // ran at latitude 0.32 rad at u = +-pi/2 — the ear's own crown is at
            // about 0.05 — and the shell simply STOPPED there. `patch` closes a v0
            // boundary with a rim strip, so what the player sees on the profile and
            // three-quarter bearings is a hard edge with 26 mm of bare skull under it
            // running from the temple to behind the ear (`art/look/x_braids.png`
            // panels 2 and 3, before this). It is not a haircut. It is the boundary
            // of the patch, drawn.
            //
            // Hair does not stop above the ear; it comes DOWN past it, in front of it
            // to the sideburn and behind it to the nape. `sin^2` is maximal exactly
            // at the temple and zero at the brow and the nape, so this drops the two
            // sides and moves neither of the two places the hairline is supposed to
            // be a hairline. And the same at the nape, where a crop is cut up into
            // the hairline and a mane or a set of war-locks is not: 0.22 rad carries
            // the shell onto the top of the neck, which is where hair that is going
            // to be gathered into a plait has to come from. The paid styles take more
            // of both than the crop — a warrior crop IS cut close over the ear.
            const sideDrop = crop ? 0.17 : 0.26;
            const napeDrop = crop ? 0.05 : 0.22;
            const line = (u) => (crop ? 0.30 : 0.21)
                + 0.235 * Math.cos(u) - 0.080 * Math.cos(u * 2)
                + 0.080 * Math.cos(u * 5 + 1.1) + 0.042 * Math.cos(u * 9 - 0.7)
                + 0.020 * Math.cos(u * 17 + 2.3)
                - sideDrop * Math.pow(Math.sin(u), 2)
                - napeDrop * clamp01(-Math.cos(u))
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
            //
            // ONE CURVE, THEN THE CEILING. This used to branch on `helmed` and hold
            // the whole shell at a flat 2-5 mm the moment a cap went on, which is why
            // a helmed man's hair read as paint even 60 mm below the band where
            // nothing was touching it — and why a HOOD, which is not `cap`, got the
            // open curve under 6 mm of cloth. The open-air curve is now written once
            // and CLIPPED by the stack, so hair is a liner exactly where a shell
            // bears on it, keeps every millimetre of its volume below the rim, and
            // fills a hood's point at the nape instead of standing through it.
            const openMane = (u, v) => 0.0028 + 0.017 * Math.pow(clamp01((v - line(u)) / (Math.PI / 2 - line(u))), 0.7)
                // Flattened over the last 0.3 rad. Held at full height to the pole, 21 mm
                // of hair on top of a skull that is already domed comes to a point, and
                // the crop rendered as an acorn cap.
                * (1 - 0.34 * clamp01((v - 1.24) / 0.33))
                * (1 + 0.20 * Math.cos(u * 7 + 0.4) + 0.14 * Math.cos(u * 13 - 1.2)
                    + 0.10 * Math.cos(v * 9 + u * 3));
            const mane = (u, v) => Math.min(openMane(u, v), hairCeil(u, v));
            // The sheet's own thickness is part of the stack too: a 6 mm sheet whose
            // outer wall is on the ceiling has its INNER wall 6 mm inside the skin.
            // Under a liner it thins with the hair it is carrying.
            p.add(headWear(K, {
                u0: 0, u1: Math.PI * 2, wrapU: true,
                v0: line, v1: () => Math.PI / 2 - 0.02,
                nu: Math.max(16, lod.shellU + 6), nv: Math.max(5, lod.shellV),
                lift: (u, s) => mane(u, mix(line(u), Math.PI / 2 - 0.02, s)),
                thick: helmed || hooded ? 0.0035 : 0.006,
            }), hair, place.clone());
            // ---- THE LOCKS, and this is what the shell alone can never be ----
            //
            // Everything above is ONE parametric shell whose "fourteen locks" are
            // cosine harmonics multiplying its lift. That is a bumpy surface, and a
            // bumpy surface is not hair — its OUTLINE is still the skull's own curve
            // scaled up, because a harmonic on the lift moves the silhouette by the
            // amplitude of the harmonic and no further. The audit photographed the
            // result and called it a smooth egg; it was right, and no amount of extra
            // harmonics fixes it, because the defect is topological rather than
            // numerical. Hair breaks a head's outline because hair is MANY OBJECTS
            // with air between them.
            //
            // So there are real locks now: short coils sprung off the scalp, each one
            // a single strand orbiting its own axis — which is exactly what `braid`
            // draws at `strands: 1`, and the reason it is reused here rather than a
            // curl primitive being written. They fall as they spring, so the coil
            // droops instead of standing off like a bristle.
            //
            // This is the owner's reference read as a specification: short curly hair,
            // naturalistic, nothing that swallows the face. The crop gets the densest
            // course because the crop is the free default and the style the reference
            // actually shows; the two paid styles get fewer, because they are already
            // buying their outline from the fall and the plaits.
            if (lod.trim) {
                const lockRoot = new THREE.Vector3();
                const lockNrm = new THREE.Vector3();
                const lockDir = new THREE.Vector3();
                // Two courses: one along the hairline, where a lock is seen against the
                // face and against the sky, and one over the crown, which is the band
                // that has to break the dome. Under a helm the crown course is dropped
                // entirely — a bowl sits on that scalp — and the hairline course is kept
                // only where the band's rim has risen off the head, so what shows is
                // hair emerging from under iron rather than hair through it.
                //
                // THREE COURSES, NOT TWO, AND EVERY LOCK IS SMALLER. The first build of
                // this ran 22 locks a course at 40 mm long standing 26 mm out along the
                // normal, and the capture is unambiguous: at that spacing and that
                // standoff they are not hair, they are BARBS — a scatter of dark hooks
                // on a pale dome, each one read as its own object because there is bare
                // shell between it and its neighbour. Two numbers were wrong and they
                // compound. Spacing, because a curl is texture only when curls overlap;
                // and attitude, because a coil whose axis leaves along the normal is a
                // spike whatever is wrapped round it.
                //
                // A lock now travels along the scalp instead of away from it: 26% of its
                // length out and 85% of it ACROSS, down the surface's own fall line. The
                // coil orbits that axis, so half of every curl is inside the mass it
                // grows out of and what stands proud is the crest of the curl — which is
                // what you actually see on a head of short curly hair.
                //
                // THE HELMED COURSE RUNS BELOW THE HAIRLINE, NOT ABOVE IT. At +0.12 it
                // sat about level with the band's own lower rim, so every lock was under
                // the bowl and `cosmetictest` still read the Warrior Crop at 0.07-0.10%
                // under all eight metal helms — a free hairstyle that vanishes the moment
                // a helmet goes on, which is the audit's oldest open hair finding and the
                // other half of "a helmet must look WORN".
                //
                // `v` is a latitude climbing to the crown, so hair that shows under a rim
                // is at a latitude BELOW the hairline the shell starts at. The shell
                // cannot go there — it is bounded by `line` — but a lock is its own
                // geometry and can. Negative rise puts the coils in the band of scalp
                // between the dropped hairline and the iron, which is the one place hair
                // is visible on a helmed man.
                // Three courses under a helm as well, measured up rather than guessed.
                // `cosmetictest --no-render` reads the Warrior Crop against a bare head
                // under each helm in 56 s, so this was walked: one course 0.35%, two
                // 0.67%, three 0.79% against the 0.09% it started at. Four is not worth
                // its vertices — the curve has flattened by then, and the band of
                // exposed scalp is only as deep as the 0.12 rad the hairline drops.
                //
                // It does not clear the 1% bar and it is not gated to, because nobody
                // paid for the crop. The two deepest helms still take everything (Wyrm
                // 0.20%, Sutton Hoo 0.00%) and that is correct: those two close the head.
                //
                // AND A HOOD IS A CAP TOO. `helmed` is `style.cap`, and the Shadow Hood
                // is not `cap` — so a hooded man got the OPEN courses: three rings of
                // 30 mm coils springing off a crown with 6 mm of cloth over it. That is
                // the third of the owner's three faults, and it needed no new geometry
                // to fix, only somebody to ask what was overhead. Every lock now asks
                // the stack how much room it has and either fits itself into it or
                // stands down; the two rules are the ones the brief names, compress or
                // cull, and neither of them is a boolean about helmets.
                const courses = helmed ? [-0.03, -0.10, -0.17] : [0.10, 0.44, 0.80];
                for (const rise of courses) {
                    const N = crop ? 26 : 18;
                    for (let i = 0; i < N; i++) {
                        // Jittered in both axes off a strict ring: a course laid on an exact
                        // circle at an exact spacing is a wreath, and a wreath is the string
                        // of spheres the audit condemned in the war-locks under another name.
                        const u = (i / N) * Math.PI * 2 + 0.14 * Math.cos(i * 2.7 + rise * 9);
                        if (helmed && awayFromFace(u) < 0.50)
                            continue;
                        // A cowl is three overlapping pieces at the nape — the cloth, the
                        // point behind it and the shoulder drape — and the nearest of the
                        // three is the one a coil has to clear, which no single lift
                        // function knows. `hairFitProbe` measured 4.6 mm of curl standing
                        // out of the back of the Shadow Hood on two classes at one seed. A
                        // hood shows the FRINGE at its opening and nothing else; behind the
                        // temple there is no bearing from which a lock could be seen even
                        // if it fitted, so nothing is built there.
                        if (hooded && awayFromFace(u) > 0.95)
                            continue;
                        const v = line(u) + rise + 0.05 * Math.cos(i * 3.9 + rise);
                        if (v > Math.PI / 2 - 0.12)
                            continue;
                        // A coil's crest stands 0.38 of its length plus a strand radius off
                        // the root — that is where the `outward` term below tops out — so
                        // the room it needs is arithmetic rather than a judgement and it can
                        // be held to the ceiling exactly. Under a hood's point at the nape
                        // there is 33 mm and the lock is built full size; over the ear there
                        // is 9 mm and it is not built at all.
                        const room = hairCeil(u, v);
                        dirOf(u, v, lockDir);
                        faceSurface(K, lockDir, lockRoot);
                        faceNormalTrue(K, u, v, lockNrm);
                        // Sunk into the shell by nearly half its own lift, so the coil grows
                        // out of the mass rather than resting on it with a seam round the
                        // root.
                        lockRoot.addScaledVector(lockNrm, mane(u, v) * 0.45);
                        const nx = lockNrm.x, ny = lockNrm.y, nz = lockNrm.z;
                        // The fall line: straight down, with whatever the normal claims of it
                        // taken back out, so the axis lies IN the scalp's tangent plane. Near
                        // the crown the normal is nearly vertical and this degenerates, so it
                        // falls back to running rearward — which is the way a crown lock lies
                        // anyway.
                        let tx = -nx * ny, ty = -1 - ny * ny, tz = -nz * ny;
                        const tl = Math.hypot(tx, ty, tz);
                        if (tl < 0.18) {
                            tx = 0;
                            ty = 0;
                            tz = -1;
                        }
                        else {
                            tx /= tl;
                            ty /= tl;
                            tz /= tl;
                        }
                        let len = (crop ? 0.030 : 0.026) * (0.80 + 0.32 * hash(identity, i * 7 + Math.round(rise * 100)));
                        let rad = (crop ? 0.0092 : 0.0080) * (0.85 + 0.30 * hash(identity, i * 11 + 3));
                        // Compress, then cull. Squeezed past 45% a coil is not a smaller
                        // curl, it is a bristle — the barbs the note above spent a paragraph
                        // getting rid of — so below that it does not exist.
                        if (Number.isFinite(room)) {
                            // 0.82 of the room, not all of it. The crest estimate is exact on
                            // the analytic curve and the coil is a swept tube on a 6-row
                            // spine; the difference is a couple of millimetres and it was
                            // measurable — 4.6 mm through the Shadow Hood at the nape.
                            const k = Math.min(1, (room * 0.82) / (0.38 * len + rad));
                            if (k < 0.45)
                                continue;
                            len *= k;
                            rad *= k;
                        }
                        p.add(braid((t, out) => {
                            // Out a little, along a lot. The normal term rises and turns over
                            // inside the first third; the tangent term carries the whole way.
                            // 0.58, not 0.42. At 0.42 the coils sat so far into the shell that
                            // the capture reads as a snug brown cap with a few nicks in its
                            // edge — better than the barbs it replaced and still not curly.
                            // This is the whole span between a spike and a texture and it is
                            // worth being fussy about: the crest of the curl has to clear the
                            // mass by about its own strand radius, and no more.
                            const outward = len * (0.58 * t - 0.20 * t * t);
                            const along = len * 0.82 * t;
                            out.set(lockRoot.x + nx * outward + tx * along, lockRoot.y + ny * outward + ty * along, lockRoot.z + nz * outward + tz * along);
                        }, {
                            strands: 1,
                            // Just over one full turn. At three the coil closes into a tube
                            // and reads as a bead; at one the strand is a comma, which is what
                            // a short curl is at this size.
                            turns: 1.15 + 0.5 * hash(identity, i * 13 + 5),
                            rows: Math.max(6, lod.limb - 2),
                            ring: 4,
                            radius: (t) => rad * (1 - 0.34 * t * t),
                        }), hair, place.clone());
                    }
                }
            }
            if (ap.hairStyle === "long") {
                // ---- LONG MANE, 40 gold, AND IT WAS A SLAB WITH RODS ON IT ----
                //
                // "The hair options could be improved in quality, especially for the
                // long hair & braided locks."
                //
                // What was here was two superelliptical shells offset ±0.30 R.x with a
                // 0.05 rad lean, plus six two-strand `braid` runs at 0.35 turns. Three
                // separate faults, and they are the same three the beards had:
                //
                //   * 0.35 turns over 340 mm is not a plait. It is TWO PARALLEL
                //     CYLINDERS. `art/look/h_long.png` from three-quarter rear shows
                //     four straight-sided rods with hard edges hanging off a mass —
                //     which is exactly what the owner reported.
                //   * The rods were sized and sited by eye against a shell they could
                //     not read, so where they cleared it they read as separate objects
                //     and where they did not they vanished. The same fault as the
                //     beard's eleven hanks.
                //   * The shells themselves are two closed ellipsoids swept from the
                //     crown, so their top rings are inside the scalp shell and their
                //     outline is the skull's own curve scaled up: a flat curtain with a
                //     hard edge, which is the audit's phrase for it.
                //
                // It is one surface now, hung off the SAME hairline the scalp shell
                // ends at, so there is no join between the hair on the head and the
                // hair falling from it. The parting is a groove cut into that one
                // surface at the midline of the nape rather than a gap between two
                // objects, so it is a valley in a mass instead of daylight through one.
                // The strands are the mass's own ridges — `hank` — which cannot detach
                // from it because they ARE it.
                // WHERE IT HANGS FROM, and the first cut of this got it wrong in a way
                // worth writing down. Hung off `line(u)` — the hairline — the mane's
                // top edge inherits the hairline's shape, and that curve is a deep V:
                // −0.16 rad at the nape against +0.46 at the temple, because a hairline
                // is high at the temples and low at the neck. What falls from a V is
                // two horns standing above the crown with a notch between them
                // (`art/look/h2_longw.png`, first attempt). Hair does not hang from its
                // own hairline; it is COMBED BACK and hangs from the crown, and the
                // hairline is where it starts growing, not where it starts falling.
                //
                // So the root is a dome: highest at the nape, where it is buried inside
                // the scalp shell and cannot be seen, and falling away to ear level at
                // both temples, where `mass` has taken it to a sliver anyway.
                //
                // AND THE DOME LEFT THE SCALP SHELL BEHIND, WHICH IS THE OTHER HALF OF
                // "A WEIRD CUTOFF ON THE SIDES". The dome falls to latitude -0.12 at
                // the temple; the hairline the scalp shell ends at was +0.32 there. So
                // the two hair surfaces did not meet: the mane's top edge hung 0.44 rad
                // — 42 mm — BELOW the shell, over bare skin, and `patch` closed that
                // free boundary with a rim strip. What the profile card showed is a
                // wedge of hair standing off the side of the head with a razor-straight
                // leading edge and daylight under it, which is exactly the phrase the
                // owner used. No amount of shaping the hem or the mass could reach it,
                // because the defect is a JOIN and neither surface owned it.
                //
                // The stack owns it now: the fall roots on the dome where the dome is
                // inside the shell, and ON THE HAIRLINE ITSELF wherever the dome would
                // drop below it. There is no free edge left to draw — everywhere the
                // mane starts, hair is already growing.
                const maneDome = (u) => {
                    const a = Math.abs(u - Math.PI) / 2.18;
                    return 0.17 - 0.34 * a * a;
                };
                const maneRoot = (u) => Math.max(maneDome(u), line(u));
                // How much mane there is at an azimuth, once the taper and the stack
                // have both had their say. Held as its own function because the sweep
                // has to be able to ask whether there is ANY mane left before it builds
                // one: with `mass` at zero the `hangingMass` sweep degenerates to a
                // ribbon lying on the skin, and the skin has an EAR on it, which stands
                // 5 mm outside the inner wall of a cowl raised on the low-passed form.
                // `hairFitProbe` reported exactly that — 4.6 mm of hair through the
                // Shadow Hood on 57 vertices of a mane that was already invisible.
                // Nothing is the right amount of geometry for nothing.
                const maneMass = (u) => hairFall(u)
                    * Math.pow(1 - smooth(0.95, 1.99, Math.abs(u - Math.PI)), 0.95);
                let live = 0;
                for (let i = 0; i <= 48; i++)
                    live = Math.max(live, maneMass(mix(Math.PI - 2.02, Math.PI + 2.02, i / 48)));
                if (live >= 0.06)
                    p.add(hangingMass(K, skullY, Math.max(30, lod.shellU + 18), maneRoot, {
                        // Temple round to temple. Wider than the beard's arc by a long way:
                        // hair falls from the whole back half of the head, and stopping it at
                        // the ear is what made the old shells read as two curtains hung
                        // beside a face.
                        u0: Math.PI - 2.02, u1: Math.PI + 2.02,
                        prof: [
                            { o: 0.000, d: 0.000 },
                            { o: 0.014, d: 0.046 },
                            { o: 0.023, d: 0.126 },
                            { o: 0.021, d: 0.214 },
                            { o: 0.013, d: 0.284 },
                            { o: 0.003, d: 0.322 },
                            { o: -0.007, d: 0.300 },
                            { o: -0.013, d: 0.196 },
                            { o: -0.011, d: 0.068 },
                            { o: 0.000, d: 0.000 },
                        ],
                        // Full over the back and the sides, dying at the temple so the face
                        // is never framed by two vertical bars.
                        //
                        // TO NOTHING, not to 6%. A floor of 0.06 keeps 19 mm of fall alive at
                        // the arc's last column, so the sweep ended on a LIVE section and the
                        // patch drew an 8 mm rim across it: a second hard edge, at the temple,
                        // on top of the one the root fixes above. A mass that is meant to die
                        // has to reach zero before the parametrisation runs out.
                        //
                        // And the whole fall is scaled by the stack. Inside a coif or a hood
                        // there is no hair, because both are bags the head goes into — the
                        // huscarl's mail took 320 mm of mane straight through its side and the
                        // hood took it through the point at the back. An open helm takes none
                        // of it: the mane roots under the band and hangs clear, which is the
                        // "hair must come out from under them" the helm pass established.
                        mass: maneMass,
                        // THE PARTING. A centre part runs front to back over the crown, so
                        // what the back of the head shows is two masses meeting on the
                        // midline. A 34% trough 0.26 rad wide at the nape is that meeting,
                        // and it reads as a part from every bearing behind the ear because
                        // the surface really does dip there.
                        reach: (u) => 1 - 0.10 * Math.exp(-Math.pow((u - Math.PI) / 0.22, 2)),
                        hank: (u) => -0.30 * Math.exp(-Math.pow((u - Math.PI) / 0.22, 2))
                            + 0.18 * Math.cos(u * 6.1 + 0.7) + 0.11 * Math.cos(u * 10.3 - 1.4),
                        // A hem that is not a curve. Hair ends where it stops growing, and
                        // the one thing a 34-pixel silhouette can read about long hair is
                        // whether its bottom edge is a ruled arc.
                        rag: (u) => 1 + 0.15 * Math.cos(u * 4.3 + 1.1) + 0.085 * Math.cos(u * 8.9 - 0.4),
                        lean: 0.10,
                        thick: 0.008,
                    }), hair);
            }
            if (ap.hairStyle === "braids") {
                // BRAIDED WAR-LOCKS, 100 gold. The plait itself is real — three strands
                // on a helix, 3.4 turns, and the chevron reads — but it SPRANG FROM
                // NOTHING. Its first station was `R.x * 0.94` off the midline at a
                // fixed height, a number chosen by eye rather than sampled off the
                // head, so it started in open air beside the skull with daylight
                // between the rope and the hair it is supposed to be plaited out of.
                // `art/look/h_braids.png` shows the gap. That is the same fault as the
                // beard's hanks and the mane's rods: a piece sized against a surface it
                // cannot read.
                //
                // The root is now taken off the field — the same `faceSurface` and
                // `faceNormalTrue` the scalp shell is swept on — and sunk INTO the crop
                // by most of the shell's own lift, so the rope emerges from the mass
                // instead of resting beside it. It is gathered at the root as well: the
                // strand radius swells over the first fifth, which is what hair drawn
                // together into a plait actually does, and a leather tie sits on the
                // gather.
                //
                // AND IT OBEYS THE STACK LIKE EVERYTHING ELSE ON THIS HEAD. A plait is
                // 35 mm of rope hanging 350 mm; under a cowl that is 350 mm of rope
                // inside 6 mm of cloth. It roots at 1.28 rad, which is 0.18 rad IN
                // FRONT of the coif's own opening, so the mailed huscarl keeps both of
                // his — a war-lock hanging outside an aventail is the right picture, and
                // the stack says so rather than it being an accident of two numbers
                // that happened to agree.
                const bRoot = new THREE.Vector3();
                const bNrm = new THREE.Vector3();
                for (const s2 of [-1, 1]) {
                    // Above and a little behind the ear, which is where a war-lock is
                    // taken from — far enough back that it clears the temple and far
                    // enough forward that it swings past the jaw rather than down the
                    // neck.
                    const rootU = s2 * 1.28;
                    // A CHEEK GUARD OWNS THE SPACE A WAR-LOCK HANGS IN. The plait roots
                    // above the ear and falls 350 mm past the jaw, which on six of the
                    // ten rungs is straight down the outside of a hinged plate: the ruler
                    // read 18.8 mm of it through the Spectacle's guard, 111 mm through
                    // the Wyrm-Crest's deep pair and 200 mm through the Sutton Hoo's
                    // ventail, on the berserker, who wears no coif at all — so this is
                    // the plates rather than the mail and it needed its own rule. Where
                    // the sides of a helmet close, a plait is inside them.
                    if (style.cheek !== "none")
                        continue;
                    // 0.85, not 0.35, and the ruler is why. A plait is not a mass that
                    // thins out at the edge of a garment the way the mane does — it is one
                    // discrete 35 mm rope hanging 350 mm, so it is either wholly outside
                    // the mail or wholly inside it. At 0.35 the huscarl kept both of his
                    // and `hairFitProbe` measured 97 mm of plait standing through the
                    // Wyrm-Crest's coif and 186 mm through the Sutton Hoo's. You cannot
                    // wear an aventail over a war-lock; the coif goes on over the head and
                    // the hair is inside it, which is what every find and every ruler in
                    // this file agrees on.
                    if (hairFall(rootU) < 0.85)
                        continue;
                    const rootV = 0.16;
                    dirOf(rootU, rootV, bRoot);
                    faceNormalTrue(K, rootU, rootV, bNrm);
                    faceSurface(K, bRoot, bRoot);
                    bRoot.addScaledVector(bNrm, mane(rootU, rootV) * 0.55);
                    bRoot.y += skullY;
                    const bp = (t, out) => {
                        // Out and forward as it falls, so the plait hangs beside the jaw
                        // rather than down the neck — that swing is the whole silhouette,
                        // and it is what makes this rung read from in front as well as in
                        // profile.
                        const swing = Math.pow(t, 1.35);
                        out.set(bRoot.x + s2 * (0.030 * swing), bRoot.y - 0.352 * t, bRoot.z + 0.086 * swing);
                    };
                    p.add(braid(bp, {
                        // 5.6 turns, not 3.4, and this is the difference between a plait and
                        // a twisted rope. The chevron a three-strand braid draws reads as a
                        // plait when its PITCH is about two rope diameters; at 3.4 turns
                        // over 352 mm of a 35 mm rope the pitch was 103 mm — three diameters
                        // — so each strand ran nearly straight down the side of the rope
                        // with a lazy lean on it. At 5.6 the pitch is 63 mm, the strand
                        // boundaries cross the rope at 30 degrees, and the alternating
                        // chevron resolves at the fighting lens as well as the portrait one.
                        turns: 5.6, rows: Math.max(22, lod.limb * 3), ring: Math.max(5, lod.limb - 2),
                        // Gathered at the root, full through the middle, tapering to the
                        // tie. A rope of constant radius springing out of a scalp is a
                        // handle; a rope that is thin where it leaves the hair is a plait.
                        radius: (t) => 0.0175 * (0.46 + 0.54 * smooth(0, 0.17, t)) * (1 - 0.42 * t * t),
                    }), hair);
                    // Two bindings: one on the gather where the hair is drawn together,
                    // one at the tip. Both stand outside the rope's own half-width at the
                    // station they sit on, so the silhouette pinches at the binding — a
                    // ring inside a rope is invisible and the plait is a cone.
                    const at = new THREE.Vector3();
                    // The gather binding moved off 0.10 to 0.17. At 0.10 it sat level with
                    // the outer canthus, so the front view carried a brass tick beside
                    // each eye and the eye went to those instead of to the face.
                    for (const [t, r] of [[0.17, 0.0120], [0.965, 0.0118]]) {
                        bp(t, at);
                        p.add(ring(r, 0.0034, 4, 10), brass, xf(at.x, at.y, at.z, Math.PI / 2 - 0.24, 0, s2 * 0.14));
                    }
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
            //
            // THE TOP EDGE WAS ABOVE THE MOUTH, AND THAT IS THE WHOLE COMPLAINT.
            // `Y_LIP` is the lip line; this ran the patch's upper boundary at
            // `Y_LIP + 0.045`, i.e. 45 mm ABOVE it, so the very first thing the beard
            // did was cover the mouth. The moustache patches sit from `Y_NOSE − 0.035`
            // to `Y_LIP + 0.085` and the beard began 40 mm under that, which left one
            // thin band of skin above the lip and then wool over everything below —
            // and `addMouth` was drawing a mouth underneath it that nothing could see.
            // A face with no mouth is why the owner's frames read as "a dark smear with
            // two pale patches for cheeks": the pale patches are the last of the cheek
            // above the boundary, and there is no other feature left in the lower face.
            //
            // The midline now starts on the MENTOLABIAL SHELF — the crease under the
            // lower lip, `Y_LIP − 0.105` — which is where a beard's own upper edge is
            // on a face. Lip, philtrum and the fold beside it are skin, the mouth is
            // drawn and visible, and the moustache above is a separate mass with air
            // between the two, which is what a moustache is.
            //
            // AND IT STOPPED CLIMBING AT THE EYE. The outer end was `−0.20`, which is
            // above the ear's own centre (`EAR_Y` = −0.220) and level with the lower
            // lid; a boundary there takes the whole cheek including the cheekbone, and
            // that is the second half of "it swallows the lower face". It now tops out
            // along the line the masseter actually runs — under the zygomatic, not over
            // it — and a full beard is allowed 45 mm more of it than a close crop,
            // because carrying up the cheek is the thing a full beard buys.
            const cheekHi = full ? -0.268 : -0.313;
            const cheek = (u) => {
                const t = smooth(0.42, 1.18, Math.abs(u));
                const y = mix(Y_LIP - (full ? 0.088 : 0.105), cheekHi, t);
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
            //
            // AND IT MUST NOT EAT THE NECK. `Y_CHIN` is latitude −0.921; this floored at
            // −1.27 for every style, which is 0.35 rad past the menton and onto the
            // throat. On a Full Beard that is covered by the hanging belly below and
            // costs nothing, but the CLOSE CROP is the free default three of the four
            // classes wear, and it has no hanging mass at all — so its patch was the
            // whole beard, and it ran from above the mouth to below the jaw as one
            // unbroken surface. That is the mass the owner is looking at. The crop now
            // floors 0.20 rad under the menton: it wraps the underside of the jaw, which
            // is where a cropped beard goes, and stops before the throat.
            const hangLo = full ? -1.27 : -1.12;
            const hang = (u) => {
                const a = Math.abs(u);
                const arc = hangLo + (full ? 0.52 : 0.40) * Math.pow(smooth(0.1, 1.24, a), 1.35);
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
                    // 26 columns, not 20. The hank term below runs to cos(12.5u) over
                    // 2.48 rad; at 20 columns that is 0.124 rad a sample and 4.0 samples a
                    // cycle, which is where a ridge starts turning into a stair. At 26 it
                    // is 5.3, and the ridges resolve as ridges.
                    nu: Math.max(26, lod.shellU + 16), nv: Math.max(5, lod.shellV + 1),
                    // Thickness dies at *both* boundaries rather than being thickest at the
                    // one that is in silhouette. `patch` closes every boundary with a rim
                    // strip whose normal points along the surface, so a patch that ends at
                    // full lift draws its own outline as a bright band — the same defect
                    // `addFaceTones` records, except here the band was 10 mm and in the
                    // silhouette. Peaked at a third of the way up, which is where the mass of
                    // a beard actually is, and at 2 mm of lift on the boundary the rim strip
                    // is inside the skin and cannot be seen at all.
                    //
                    // A BEARD IS HAIR, AND THIS WAS A SOLID. The lift depended on `s`
                    // alone, so every column of the patch was the identical curve and the
                    // surface was a smooth swept mass with one tone across the whole of it
                    // — a lozenge of dark wool, which is what the frames show and what
                    // "an enormous black mass" is describing. Nothing about its colour is
                    // the fault: at this exposure ANY smooth unbroken surface that size
                    // reads as a blob, and darkening or lightening it only changes which
                    // blob.
                    //
                    // What makes hair read as hair on a lit surface is that it is not one
                    // surface — it is hanks, each with its own belly and its own valley
                    // beside it, so the key light rakes across a row of ridges and the
                    // eye gets a dozen highlights and a dozen shadows instead of one
                    // gradient. `hank` puts that in: two harmonics in `u` (the ridges
                    // running down the beard) and one that leans with `s` (so a ridge
                    // drifts as it falls rather than being a fluted column). It runs
                    // 0.44-1.00 of the mass, so the PEAK IS EXACTLY WHAT IT WAS — the
                    // valleys are cut, nothing is added, and no measurement of standoff or
                    // punch-through can be made worse by it.
                    //
                    // `jaw` is the other half. A beard is thickest at the chin and thins to
                    // nothing at the sideburn, and a constant mass to the ear is a large
                    // part of why this covered the face like a mask.
                    lift: (u, s) => {
                        const along = full
                            ? Math.pow(Math.sin(Math.PI * Math.pow(clamp01(s), 0.55)), 1.15)
                            : Math.pow(Math.sin(Math.PI * Math.pow(clamp01(s), 0.6)), 1.1);
                        const jaw = 1 - 0.40 * smooth(0.30, 1.20, Math.abs(u));
                        const hank = 0.72 + 0.28 * (0.55 * Math.cos(u * 7.5 + 0.4)
                            + 0.30 * Math.cos(u * 12.5 - 1.2)
                            + 0.15 * Math.cos(s * 8.0 + u * 5.0));
                        return (full ? 0.002 : 0.0014) + (full ? 0.016 : 0.0096) * along * jaw * hank;
                    },
                    thick: full ? 0.005 : 0.0032,
                }), beard, place.clone());
                // ---- THE MOUSTACHE, AND IT IS ONE SHAPE NOW ----
                //
                // It was two patches, one a side, meeting at zero height on the
                // philtrum with a 5 mm gap between their inner ends. What that draws is
                // TWO LUMPS with skin between them, which is what the owner sees; and
                // the left one was built inside out on top of that (see the winding
                // note above). A moustache parts under the nose — it does not come in
                // two pieces.
                //
                // One patch from corner to corner, with the philtrum cut into it as a
                // groove: `leaf` and `swell` both dip to 45% at the midline and are
                // back to full 13 mrad either side, so there is a valley under the nose
                // and one continuous mass through it. No inner boundary, no rim strip
                // in the middle of the face, and nothing for a second solid to clip
                // against.
                {
                    const mo = full ? 1 : 0.6;
                    const mTop = lat(Y_NOSE - 0.035);
                    const mBot = lat(Y_LIP + 0.035);
                    const mMid = (mTop + mBot) * 0.5;
                    const mHalf = (mTop - mBot) * 0.5;
                    /** The philtrum: a groove, not a gap. 1 at the lip, 0.45 on the midline. */
                    const part = (u) => 0.45 + 0.55 * smooth(0.015, 0.135, Math.abs(u));
                    const leaf = (u) => mHalf * Math.pow(Math.sin(Math.PI * clamp01((0.40 - Math.abs(u)) / 0.40)), 0.55) * part(u);
                    // Droops toward the corners of the mouth, which is the one thing that
                    // separates a moustache from a strip of tape laid across a lip.
                    const droop = (u) => mMid - 0.055 * smooth(0.06, 0.38, Math.abs(u));
                    p.add(headWear(K, {
                        u0: -0.40, u1: 0.40,
                        v0: (u) => droop(u) - leaf(u),
                        v1: (u) => droop(u) + leaf(u),
                        // 22 columns over 0.8 rad. The groove is 0.12 rad wide and a patch
                        // can only carry a feature the mesh can sample: at 12 columns the
                        // philtrum was three vertices wide and came out as a notch with
                        // straight sides.
                        nu: 22, nv: 4,
                        // Even nv — see the brow note above; at an odd row count no row
                        // lands on the crest of the swell and the mass loses an eighth of
                        // itself to the sampler.
                        lift: (u, v) => 0.0010 + 0.0060 * mo * part(u)
                            * Math.sin(Math.PI * clamp01(v))
                            * Math.pow(Math.sin(Math.PI * clamp01((0.405 - Math.abs(u)) / 0.405)), 0.7),
                        thick: 0.004,
                    }), beard, place.clone());
                }
            }
            // ---- THE HANGING MASS, AND IT IS ONE SURFACE NOW ----
            //
            // "all of the beards aren't right they are just big lumps overlapped &
            // clipped to another part of beard it looks blocky & ugly & unnatural."
            //
            // He is describing the construction, exactly. Every beard in the shop was
            // A SUM OF PRIMITIVES hung near a jaw and left to intersect, and two of
            // the intersections are arithmetic faults rather than matters of taste:
            //
            //   Full    a cheek patch on the face, plus an ovoid belly whose open top
            //           ring sits under it, plus THE SAME OVOID AGAIN at 0.94 scale
            //           with 0.075 rad of lean on it. That lean is taken about the
            //           part's origin, 190 mm above the beard, so the inner copy's
            //           17 mm tip comes out 8 mm sideways THROUGH the outer one. Two
            //           eggs crossing at the point of the beard, with eleven
            //           two-strand ropes laid over the pair of them.
            //   Forked  a root shell plus two tines, each `xf`-rotated by -s * 0.56
            //           rad — again ABOUT THE PART ORIGIN and not about its own root.
            //           At the tine's lowest station that is a 190 mm lever arm, so
            //           the s = +1 tine finishes at x = -73 mm and the s = -1 tine at
            //           +73. THE TWO TINES CROSS OVER AND PASS THROUGH EACH OTHER.
            //           The "fork" in every frame this shipped in is two solids
            //           intersecting in an X, which is why no amount of opening the
            //           angle ever made the notch read.
            //   Ringed  a root shell with a plait springing from its bottom ring, so
            //           the rope starts at a cut edge.
            //
            // This is the oldest failure shape in this project. The ear was ball plus
            // torus plus ball and had daylight through it; the head was a sum of
            // bumps and produced five different monsters. Both were fixed the same
            // way — by authoring ONE CONTINUOUS SURFACE — and this is that.
            //
            // The mass is swept off the cheek patch's OWN lower boundary, `hang(u)`,
            // sampled on the same skin at the same latitude, so there is no join
            // between the beard on the face and the beard under it: there is one
            // surface, and it starts where the face's beard stops. Its section runs
            // from the jawline down the outside of the hair, round the tip and back
            // up the inside to close on the jawline again — a closed tube with no cap
            // anywhere, so there is no open ring for a second object to be seen
            // through and nothing to clip against.
            //
            // The four styles are four numbers on that one surface: how much mass at
            // each azimuth, and how far it falls. That is the axis the audit says a
            // price ladder has to buy, and it is the axis that survives 7.9 mm to a
            // pixel.
            if (ap.beardStyle === "short") {
                // CLOSE CROP, free. It had no mass at all — the whole rung was a 9 mm
                // patch on the cheek — and `cosmetictest` put it against Clean Shaven
                // at 1.07% of a play frame, which is one pixel of a 520 x 320 panel and
                // the weakest pair in the shop. A cropped beard still has a little bulk
                // under the chin; this is that, 42 mm of it, and nothing more.
                p.add(hangingMass(K, skullY, Math.max(26, lod.shellU + 16), hang, {
                    prof: [
                        { o: 0.000, d: 0.000 },
                        { o: 0.018, d: 0.014 },
                        { o: 0.024, d: 0.036 },
                        { o: 0.016, d: 0.052 },
                        { o: 0.002, d: 0.046 },
                        { o: -0.006, d: 0.018 },
                        { o: 0.000, d: 0.000 },
                    ],
                    mass: (u) => 0.18 + 0.82 * Math.pow(1 - smooth(0.70, 1.20, Math.abs(u)), 0.80),
                    // Hanks down the fall and a ragged hem. Both are harmonics in u
                    // and both stay inside what 26 columns can carry: the third that
                    // used to live here was above Nyquist and drew four triangular bites
                    // out of the jaw instead of a broken edge.
                    hank: (u) => 0.17 * Math.cos(u * 7.3 + 0.4) + 0.10 * Math.cos(u * 12.9 - 1.1),
                    rag: (u) => 1 + 0.125 * Math.cos(u * 5.1 + 2.2) + 0.075 * Math.cos(u * 9.7 - 0.6),
                    clear: 0.074,
                    lean: 0.22,
                    thick: 0.0035,
                }), beard);
            }
            else if (ap.beardStyle === "full") {
                // FULL, 40 gold. Broadest and shortest — a bush. 46 mm of belly at the
                // chin and 158 mm of fall, spreading PAST the jaw rather than following
                // it down, which is what separates it from the two above it: both of
                // those are narrower than the jaw and both are longer.
                p.add(hangingMass(K, skullY, Math.max(26, lod.shellU + 16), hang, {
                    prof: [
                        { o: 0.000, d: 0.000 },
                        { o: 0.032, d: 0.026 },
                        { o: 0.058, d: 0.072 },
                        { o: 0.064, d: 0.120 },
                        { o: 0.050, d: 0.154 },
                        { o: 0.020, d: 0.170 },
                        { o: -0.002, d: 0.152 },
                        { o: -0.011, d: 0.102 },
                        { o: -0.013, d: 0.042 },
                        { o: 0.000, d: 0.000 },
                    ],
                    mass: (u) => 0.10 + 0.90 * Math.pow(1 - smooth(0.66, 1.235, Math.abs(u)), 0.80),
                    // Hanks down the fall and a ragged hem. Both are harmonics in u
                    // and both stay inside what 26 columns can carry: the third that
                    // used to live here was above Nyquist and drew four triangular bites
                    // out of the jaw instead of a broken edge.
                    hank: (u) => 0.17 * Math.cos(u * 7.3 + 0.4) + 0.10 * Math.cos(u * 12.9 - 1.1),
                    rag: (u) => 1 + 0.125 * Math.cos(u * 5.1 + 2.2) + 0.075 * Math.cos(u * 9.7 - 0.6),
                    clear: 0.074,
                    lean: 0.40,
                    thick: 0.006,
                }), beard);
            }
            else if (ap.beardStyle === "forked") {
                // FORKED, 80 gold, and the audit's instruction was to check it against
                // the profile card: "a fork that does not separate in profile is a
                // beard with a notch." It never separated, because the two tines were
                // crossing through one another (see the note above).
                //
                // The fork is now a property of the ONE mass rather than two solids
                // bolted to it: `reach` has two maxima 0.42 rad off the midline and a
                // trough between them, so the same surface falls 235 mm under each
                // tine and 118 in the middle. The notch is cut out of the outline by
                // the surface's own hem, it is open air from every bearing because
                // there is nothing there to occlude it, and no two parts of the beard
                // can intersect because there is only one part.
                p.add(hangingMass(K, skullY, Math.max(26, lod.shellU + 16), hang, {
                    prof: [
                        { o: 0.000, d: 0.000 },
                        { o: 0.026, d: 0.032 },
                        { o: 0.040, d: 0.088 },
                        { o: 0.038, d: 0.150 },
                        { o: 0.026, d: 0.206 },
                        { o: 0.009, d: 0.240 },
                        { o: -0.004, d: 0.216 },
                        { o: -0.011, d: 0.126 },
                        { o: -0.012, d: 0.034 },
                        { o: 0.000, d: 0.000 },
                    ],
                    mass: (u) => 0.09 + 0.91 * Math.pow(1 - smooth(0.58, 1.215, Math.abs(u)), 0.85),
                    // Hanks down the fall and a ragged hem. Both are harmonics in u
                    // and both stay inside what 26 columns can carry: the third that
                    // used to live here was above Nyquist and drew four triangular bites
                    // out of the jaw instead of a broken edge.
                    hank: (u) => 0.17 * Math.cos(u * 7.3 + 0.4) + 0.10 * Math.cos(u * 12.9 - 1.1),
                    rag: (u) => 1 + 0.125 * Math.cos(u * 5.1 + 2.2) + 0.075 * Math.cos(u * 9.7 - 0.6),
                    clear: 0.074,
                    reach: (u) => 0.50 + 0.72 * Math.exp(-Math.pow((Math.abs(u) - 0.42) / 0.25, 2)),
                    lean: 0.46,
                    thick: 0.005,
                }), beard);
            }
            else if (ap.beardStyle === "braided") {
                // RINGED BRAID, 120 gold — the narrowest and by far the longest, so in
                // outline it is a line where Full is a wedge and Forked is a wedge with
                // a notch bitten out of it.
                //
                // The gather is the same surface as every other beard, pulled in hard
                // by `mass`, and the plait springs from INSIDE it: the rope's first
                // station is 40 mm above the gather's tip rather than level with it, so
                // there is no cut edge where the two meet and the hair reads as being
                // drawn out of the mass instead of butted onto it.
                p.add(hangingMass(K, skullY, Math.max(26, lod.shellU + 16), hang, {
                    prof: [
                        { o: 0.000, d: 0.000 },
                        { o: 0.022, d: 0.028 },
                        { o: 0.031, d: 0.070 },
                        { o: 0.024, d: 0.106 },
                        { o: 0.009, d: 0.126 },
                        { o: -0.003, d: 0.110 },
                        { o: -0.010, d: 0.062 },
                        { o: -0.010, d: 0.020 },
                        { o: 0.000, d: 0.000 },
                    ],
                    mass: (u) => 0.06 + 0.94 * Math.pow(1 - smooth(0.30, 1.05, Math.abs(u)), 1.15),
                    // Hanks down the fall and a ragged hem. Both are harmonics in u
                    // and both stay inside what 26 columns can carry: the third that
                    // used to live here was above Nyquist and drew four triangular bites
                    // out of the jaw instead of a broken edge.
                    hank: (u) => 0.17 * Math.cos(u * 7.3 + 0.4) + 0.10 * Math.cos(u * 12.9 - 1.1),
                    rag: (u) => 1 + 0.125 * Math.cos(u * 5.1 + 2.2) + 0.075 * Math.cos(u * 9.7 - 0.6),
                    clear: 0.074,
                    lean: 0.30,
                    thick: 0.005,
                }), beard);
                // IT HAS TO LIE ON THE CHEST, NOT INSIDE IT. Lengthening this plait
                // bought nothing at all the first time it was tried, and the reason is
                // worth keeping: the path hung straight down at z = 0.036 in the head's
                // frame while the torso's front surface is at 0.104 and the mail over
                // it further out again, so everything below the collarbone was drawn
                // and then thrown away by the depth buffer.
                const bPath = (t, out) => out.set(0, skullY - 0.148 - 0.300 * t, 0.048 + 0.104 * Math.pow(t, 1.15));
                const bRad = (t) => 0.0206 * (1 - 0.40 * t * t);
                p.add(braid(bPath, {
                    turns: 3.4, rows: Math.max(14, lod.limb * 3), ring: Math.max(5, lod.limb - 2),
                    radius: bRad,
                }), beard);
                // THREE BINDINGS, AND THEY STAND PROUD. A ring reads as a ring when it
                // is WIDER THAN THE ROPE IT BINDS and cuts a step into the outline;
                // inside the rope they are invisible and the plait is a cone.
                {
                    const at = new THREE.Vector3();
                    for (const t of [0.12, 0.42, 0.71, 0.97]) {
                        bPath(t, at);
                        p.add(ring(bRad(t) + 0.0048, 0.0050, 4, 12), brass, xf(at.x, at.y, at.z, Math.PI / 2, 0, 0));
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
            // `bandLo` — the band's lower rim — is declared with the head stack, above
            // the hair, because the hair has to emerge from under it. See there.
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
            const sideArc = (s, a, b) => (s > 0 ? { u0: a, u1: b } : { u0: -b, u1: -a });
            // A point on the head with a standoff, for the fittings that are solids
            // rather than sheets — boar snouts, cabochons, the wyrm's head. Same three
            // calls `headWear` makes, so a fitting cannot drift off the sheet it is
            // supposed to be riveted to. The vector is reused; consume it before the
            // next call.
            const _fp = new THREE.Vector3();
            const _form = helmForm(K);
            const onForm = (u, v, off) => {
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
                cone: [0.017, 0.030 + 0.008 * B.bowl, 1.15],
                round: [0.017, 0.012 + 0.008 * B.bowl, 2.10],
                tall: [0.017, 0.030 + 0.008 * B.bowl, 2.70],
            }[style.bowl];
            const [bowlSeat, bowlRise, bowlTaper] = bowlProfile;
            const crest = bowlSeat + bowlRise;
            const bowlLift = (v) => bowlSeat + bowlRise * Math.pow(clamp01(v), bowlTaper);
            // AND THE SPANGENHELM IS FOUR PLATES, which until now was a claim made only
            // by four strips of trim lying on a perfectly smooth dome.
            //
            // "Spangenhelm, Nasal and Spectacle are three domes a judge could not tell
            // apart." Two of those three have something of their own in the outline —
            // the Nasal comes to a point with a finial on it, the Spectacle carries brow
            // arches and a pair of cheek plates — and the 30-gold rung had a shallower
            // version of the same sphere. Its whole product is its CONSTRUCTION: four
            // pieces of iron raised separately and held in a frame. A plate raised on
            // its own is not a quarter of a sphere; it bellies between the bands it is
            // riveted to. 6.5 mm of belly at the middle of each plate, dying to nothing at
            // the band and at the crown where the four meet, gives the bowl a squared
            // outline from above and four soft highlights instead of one — and it is
            // the same object the ribs have been claiming to hold together.
            //
            // Only on `shallow`, which is only this helmet. The raised cone and the
            // round bowls above it are single sheets and a belly on them would be a
            // dent. The ribs sit at pi/4 + i·pi/2, so `cos(4u)` peaks exactly between
            // them, and the frame still stands proud of the plates it holds.
            const lobe = style.bowl === "shallow" ? 0.0065 : 0;
            const bellyAt = (u, v) => lobe * (0.5 + 0.5 * Math.cos(4 * u))
                * Math.pow(clamp01(v), 0.9) * (1 - Math.pow(clamp01(v), 3.0));
            p.add(helmWear(K, {
                tag: "bowl",
                u0: 0, u1: Math.PI * 2, wrapU: true,
                v0: () => bandLo + 0.015, v1: () => Math.PI / 2 - 0.02,
                nu: Math.max(lobe ? 20 : 10, lod.shellU + 2),
                nv: Math.max(lod.shellV, style.bowl === "cone" ? 6 : 4),
                lift: (u, v) => bowlLift(v) + bellyAt(u, v),
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
            const combPath = (theta, out, nrm) => {
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
            const bowlUnder = (theta) => bowlLift(clamp01(((Math.PI / 2 - Math.abs(theta)) - bowlV0) / (bowlV1 - bowlV0)));
            const _cb = new THREE.Vector3();
            const _cn = new THREE.Vector3();
            const _cb2 = new THREE.Vector3();
            const _cn2 = new THREE.Vector3();
            const _ct = new THREE.Vector3();
            const _cx = new THREE.Vector3();
            const comb = (t0, t1, rise, half, gauge) => {
                const surf = (t, sec, shrink, out) => {
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
                if (lod.trim)
                    p.add(ball(0.0055, 6), trimMetal, xf(0, skullY + apex.y + 0.030, apex.z));
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
                        // 11 mm on the spangenhelm now that its plates belly out 6.5 mm between
                        // the frame: the audit's brief for the 30-gold rung is "four plates
                        // with the frame bands standing 8-10 mm proud", and it is proud of the
                        // PLATE, not of the sphere the plate used to be.
                        lift: (_u, s) => bowlLift(s) + (style.bowl === "shallow" ? 0.011 : 0.006)
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
                const nasal = [];
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
                const npT = (u) => clamp01(Math.abs(u) / 0.135);
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
                const bt = (u) => clamp01((Math.abs(u) - bIn) / (bOut - bIn));
                // The arch: the eye opening's top edge. `sin` rather than a smoothstep
                // because an arch is a single curve with no flat in it — a flat is what
                // makes a hem read as a shelf.
                const browLo = (u) => lat(Y_EYE + 0.055) + 0.150 * Math.pow(Math.sin(Math.PI * bt(u)), 0.85);
                const browHi = (u) => lat(Y_BROW + 0.085) - 0.075 * Math.pow(bt(u), 2.2);
                for (const s of [-1, 1]) {
                    p.add(helmWear(K, {
                        tag: "brow plate",
                        ...sideArc(s, bIn, bOut),
                        v0: browLo, v1: browHi,
                        nu: 7, nv: 3,
                        // Proud over the eye, feathered into the band and the nasal at both
                        // ends. The `v` term stands the top rim out further than the free
                        // edge, which is what a plate riveted along its top does.
                        lift: (u, v) => (0.010 + 0.007 * v) * mix(0.35, 1, Math.sin(Math.PI * bt(u)))
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
            const cheekTop = (t) => mix(lat(Y_EYE - 0.045), bandLo + 0.015, Math.pow(smooth(0, 0.62, t), 0.85));
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
                const st = (u) => clamp01((Math.abs(u) - shortIn) / (shortOut - shortIn));
                const hem = (u) => lat(Y_LIP + 0.02) + 0.20 * Math.pow(smooth(0.20, 1, st(u)), 1.5);
                const top = (u) => cheekTop(st(u));
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
            }
            else if (style.cheek === "deep") {
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
                const deepHem = (u) => {
                    const t = clamp01((Math.abs(u) - guardIn) / (guardOut - guardIn));
                    return lat(Y_CHIN + 0.05) + 0.34 * Math.pow(smooth(0.30, 1, t), 1.35);
                };
                // And the top edge dips forward of the hinge, so the plate does not
                // present a straight horizontal rim across the temple either.
                // Over a MASK there is no eye to clear — the mask has its own openings and
                // the guard is meant to lap it — so that case keeps the band-height rim it
                // was tuned with. Over an open helm the guard is cut for the socket.
                const deepTop = (u) => {
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
                        // 21 to 25 mm over an open helm, not 23 to 29. `wearmeasure` section 3
                        // holds a hanging plate's HEM to 26 mm, and the hem is the free edge
                        // down at the jaw: at 29 the plate's lowest, most visible corner was
                        // the furthest thing on it from the head, which is a flare and not a
                        // fall. 25 lands it on the mandible with a mail gap under it.
                        lift: (_u, v) => (style.mask ? 0.027 + 0.004 * (1 - v) : 0.021 + 0.004 * (1 - v)),
                        thick: 0.008,
                    }), capMetal, place.clone());
                }
            }
            // `coifLevels` and `coifAt` — WHERE THE MAIL IS — are declared with the
            // head stack above the hair, because three pieces now have to agree about
            // it: this fall, which lies outside the mail; the coif, which draws it;
            // and the hair, which has to lie inside it.
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
                // 1.12 head-radii, not 1.05, and the extra 5 mm is a fit fix rather than a
                // style one. The plate has to turn through the corner where the skull's
                // base becomes a neck, and the turn costs it a few degrees whatever it
                // does; what decides whether that reads is how much STRAIGHT plate there
                // is beside the neck under it. Ending at 1.05 put the corner in the last
                // third of the fall with nothing after it, and `wearmeasure` measured
                // 22 deg of flare against a 22 deg bar. Carrying it 5 mm further down
                // gives the corner something to land on and measures 18.6.
                const floorY = Math.max(cut + 0.025, skullY - R.y * (deep ? 1.12 : 0.45));
                // THE HULL, AND THIS IS THE OWNER'S DEFECT.
                //
                // "There's a lot of raised floating aspects" — pale curved flanges
                // flaring out and up from the sides of the head, with daylight between
                // them and the cheek. This is where four of the five he named come from,
                // and it is one line of arithmetic.
                //
                // The rings were CONSTANT MULTIPLES OF R.x: 1.16 at the top, 1.26 in the
                // middle, 1.30 to 1.38 at the floor. The thing they hang on is not a
                // cylinder. At the top ring's height — R.y · 0.47 above the skull's
                // centre — the ellipsoid has already narrowed to 0.88 R.x, so a ring at
                // 1.16 R.x stood 0.28 R.x proud, and it stood proudest exactly at its
                // LATERAL extreme, which is the side of the head beside the temple. Below
                // the skull it is worse: the floor ring sat at 1.38 R.x around a NECK.
                // `wearmeasure` section 3 measured 61.6 mm of daylight on the flange and
                // ran off the end of its 75 mm search on the guard. A cylinder over a
                // sphere is widest where the sphere is narrowest, and what that draws is
                // a wing.
                //
                // So the radius follows the hull: the skull's own half-breadth while
                // there is skull, the neck's below it, and the coif's on the one class
                // that wears one — because a plate over mail has to lie on the mail. The
                // fall still reads as a fall from behind. It was never the radius doing
                // that; it is the outline, the overhang at the rim and the fact that it
                // is a hard-edged plate over a soft head.
                const topY = skullY + R.y * 0.47;
                // SAMPLED OFF THE FORM, not guessed from the ellipsoid it started as.
                // The first draft of this used `R.x · sqrt(1 - t²)`, which is 12% wider
                // at the ear's height than at the top ring's — but the head is not an
                // ellipsoid there. Its own breadth table holds 98 mm at the parietal and
                // 90 mm at the cheekbone, so the real outline is close to a straight
                // side, and a ring following a barrel over a straight side leaves it at
                // 35 deg. Two columns off the block the helmet is beaten over — one at
                // the flank, one at the occiput — cost 26 field samples and are the
                // shape that is actually there.
                const sideP = [];
                const backP = [];
                {
                    const q = new THREE.Vector3();
                    // 24 stations, not 12. The columns are read by linear interpolation
                    // in y, and the form's half-breadth against y is nearly straight down
                    // the flank and then turns hard under the skull's base — which is where
                    // the deep guard's last third hangs. A coarse table cuts that corner,
                    // the plate follows the cut, and the metal leaves the head over the few
                    // centimetres the table could not see.
                    for (let i = 0; i <= 24; i++) {
                        const v = mix(Math.PI / 2 - 0.05, -Math.PI / 2 + 0.30, i / 24);
                        formSurface(_form, Math.PI / 2, v, q);
                        sideP.push([skullY + q.y, Math.abs(q.x)]);
                        formSurface(_form, Math.PI, v, q);
                        backP.push([skullY + q.y, Math.abs(q.z)]);
                    }
                }
                /** Read one of those columns at a height. Both descend in y. */
                const readP = (tab, y) => {
                    if (y >= tab[0][0])
                        return tab[0][1];
                    for (let i = 0; i < tab.length - 1; i++) {
                        if (y <= tab[i][0] && y >= tab[i + 1][0]) {
                            return mix(tab[i][1], tab[i + 1][1], (tab[i][0] - y) / (tab[i][0] - tab[i + 1][0]));
                        }
                    }
                    return tab[tab.length - 1][1];
                };
                // Below the skull there is no skull, and a neck is a neck in millimetres
                // rather than a fraction of a head — expressing it as 0.62 R.z stood the
                // deep guard's rim 34 mm behind a throat that is 45 mm through, which was
                // most of its 48 mm of daylight. And on the one class that wears mail the
                // plate lies on the mail, because that is what is under it.
                //
                // Softened at the crossover, because a hard `max` puts a KINK where the
                // skull's outline meets the neck's — and the fall's flare is a derivative,
                // so a kink in what it follows is a spike in what it measures. 12 mm of
                // rounding is a fillet, not a fudge: it is what a plate beaten over that
                // corner would do.
                const sm = (a, b, k = 0.004) => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + k * k)) - k * 0.5;
                const hullAt = (y) => {
                    let hw = sm(readP(sideP, y), S.neckHW);
                    let hd = sm(readP(backP, y), S.neckHW);
                    if (heavy) {
                        hw = sm(hw, coifAt(y, "hw"));
                        hd = sm(hd, coifAt(y, "hd"));
                    }
                    return { hw, hd };
                };
                // AND THE PLATE IS DRIVEN OFF THAT HULL AT EVERY HEIGHT, not off three
                // sampled rings with straight lines between them. Three rings is a plate
                // with two creases in it; a crease is a step in the angle the metal makes
                // with the head, which is what section 3 measures and what a specular
                // highlight finds first. Reading the hull continuously leaves the plate
                // with nothing in it but the clearance, and the clearance is the author's.
                //
                // 12 mm at the band opening to 16 at the rim: a liner, then a padded
                // collar, and the last few millimetres are the overhang that throws the
                // shadow line the fall is read by. The backward shift is a tenth of what
                // it was — at 40 mm the `z` term alone put the rim behind the neck with
                // nothing under it.
                // Nearly flat. Every millimetre the clearance opens on the way down is a
                // millimetre of flare on top of whatever the hull is doing under it, and
                // the hull already has a corner in it where the skull's base becomes a
                // neck. 13 mm holding to 15 at the rim is a liner and two millimetres of
                // overhang, which is all the rim needs to catch a light.
                const clearAt = (v) => 0.013 + 0.002 * smooth(0, 1, v);
                const zAt = (v) => -0.003 - 0.002 * smooth(0, 1, v);
                // AND THE ARC IS A FUNCTION OF THE DESCENT, which is the other half of
                // the wing. At a constant 1.74 rad the deep guard's front edge crossed the
                // TOP ring — the highest, tightest one — 80° off dead ahead, which is in
                // front of the ear and level with the temple. A plate edge there is the
                // pale curve standing off the side of the head in the armoury cards,
                // whatever its radius does. An aventail is riveted round the BACK of the
                // band and swings forward as it falls, so it is narrow at the rivets and
                // laps the cheek guard down at the jaw, where the two are meant to
                // overlap. The floor value is unchanged, so the lap the profile card
                // needed is still there.
                const half = (v) => (deep ? 1.30 : 1.08) + (deep ? 0.44 : 0.30) * v * v;
                const fall = (u, v, inset, out) => {
                    const y = mix(topY, floorY, v);
                    const h = hullAt(y);
                    const c = clearAt(v) - inset;
                    out.set(Math.sin(u) * (h.hw + c), y, zAt(v) + Math.cos(u) * (h.hd + c));
                };
                // u runs from the near edge round to the far one, the same direction the
                // coif is swept in and for the same reason: v descends here, so a patch
                // swept the other way round has ∂u × ∂v pointing into the skull and the
                // guard renders inside out — which reads as a hole in the back of the head.
                const sweep = (inset) => (t, v, out) => fall(mix(Math.PI + half(v), Math.PI - half(v), t), v, inset, out);
                // Five rows on the deep fall and four on the flange, not three. When the
                // plate was three straight rings its own tessellation was the shape; now
                // that it reads the hull continuously there is a real curve under it —
                // down the flank, round the base of the skull, then straight beside the
                // neck — and three spans cannot hold an S. This is the one shell on the
                // helmet whose row count is carrying geometry rather than smoothness.
                p.add(wornRing({
                    tag: deep ? "nape guard" : "nape flange",
                    originY: skullY,
                    nu: Math.max(8, lod.shellU - 2), nv: deep ? 5 : 4,
                    outer: sweep(0), inner: sweep(0.008),
                }), capMetal);
                if (style.noble) {
                    // Gilt edging along the rim. From behind — which is a third of the
                    // frames in a brawl — this strip is the only thing that says the helmet
                    // in front of you is the expensive one.
                    // A negative inset is 2.5 mm *outside* the guard, so the strip straddles
                    // the plate's own surface instead of sitting on it: no coplanar pair to
                    // fight for depth, and its two long rims are buried in silver.
                    const lip = (inset) => (t, v, out) => {
                        const vv = mix(0.86, 1, v);
                        fall(mix(Math.PI + half(vv) - 0.03, Math.PI - half(vv) + 0.03, t), vv, inset, out);
                    };
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
                    p.add(rod(0.0012, tall ? 0.0105 : 0.0080, len, 5), brass, xf(sx * cr * 0.96, cy + 0.008 + len * 0.5, sz * cr * cz * 0.96, 0.17 * sz, 0, -0.17 * sx));
                    // A stud at the foot of each tall point, where the leaf is riveted
                    // through the hoop. Three solids a crown, which is what the boar and
                    // the wyrm's head each cost, and this rung is dearer than both.
                    if (lod.trim && tall) {
                        p.add(ball(0.0042, 6), garnet, xf(sx * cr * 1.02, cy + 0.002, sz * cr * cz * 1.02));
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
                const flat = (t) => smooth(0, 0.11, t) * smooth(0, 0.11, 1 - t);
                p.add(comb(-1.30, 1.24, (t) => 0.040 * mix(0.18, 1, flat(t)), (t) => 0.012 * mix(0.45, 1, flat(t)), 0.006), trimMetal, place.clone());
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
                        p.add(rod(0.0007, 0.0032, 0.019, 4), trimMetal, xf(s * 0.0085, by - 0.012, 0.082, -1.05, 0, -s * 0.30));
                    }
                    for (const s of [-1, 1])
                        p.add(ball(0.0028, 5), dark, xf(s * 0.0092, by + 0.002, 0.055));
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
                (t) => 0.052 - 0.018 * Math.pow(Math.abs(mix(-1, 1, t)), 1.4), (t) => 0.010 + 0.005 * Math.pow(clamp01(t), 0.7), 0.007), trimMetal, place.clone());
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
                        p.add(rod(0.0009, 0.0038, 0.030, 4), brass, xf(hx + s * 0.011, hy + 0.016, hz - 0.010, -0.72, 0, -s * 0.42));
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
                const eu = 0.395 * K.F.eyeU;
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
                const slot = (u) => Math.pow(Math.sin(Math.PI * clamp01((Math.abs(u) - uIn) / (uOut - uIn))), 0.55);
                const openHi = (u) => ev + 0.118 * slot(u);
                const openLo = (u) => ev - 0.098 * slot(u);
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
                const maskBot = (u) => mix(chinV, jawV, Math.pow(clamp01(Math.abs(u) / 1.02), 1.55));
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
                const maskLift = (v) => mix(0.0205, 0.0150, smooth(chinV, maskTop, v));
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
                const BLUR = [
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
                const crownU = (u) => 0.014 * Math.cos(clamp01(Math.abs(u) / uEdge) * Math.PI * 0.5);
                const crownV = (v) => 0.0085 * Math.sin(Math.PI * Math.pow(clamp01((v - chinV) / (maskTop - chinV)), 1.35));
                /** The mask's own surface: the head's shape, none of its features. */
                const shell = (u, v, off, out) => {
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
                const onMask = (u, v, off) => {
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
                const onShell = (u0, u1, v0, v1, nu, nv, lift, thick, mat) => {
                    const gauge = typeof thick === "number" ? () => thick : thick;
                    const surf = (t, s, back, out) => {
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
                const lapped = (u) => {
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
                const tuck = (u) => 0.006 * smooth(0.72, uEdge, Math.abs(u));
                // The gauge falls off with it. A 7.5 mm cut edge is right at the eye
                // openings, where the thickness of the plate is one of the few places
                // this helmet says it is made of metal — and wrong at the outer edge,
                // where it draws a bright 7.5 mm rail down the side of the face that the
                // profile card reads as a fold. Under the guard there is nothing for it
                // to say anyway.
                const flank = (u) => 1 - 0.62 * smooth(0.86, uEdge, Math.abs(u));
                onShell(-uEdge, uEdge, openHi, () => maskTop, maskU, maskV, (u, v) => maskLift(v) - tuck(u), (u, s) => 0.0075 * flank(u) * mix(0.14, 1, Math.max(clamp01(slot(u) * 3), clamp01(s * 5))), silver);
                onShell(-uEdge, uEdge, maskBot, lapped, maskU, maskV + 2, (u, v, s) => maskLift(v) - tuck(u) - 0.0018 * s * (1 - clamp01(slot(u) * 3)), (u) => 0.0075 * flank(u), silver);
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
                    onShell(socket.u0, socket.u1, (u) => openLo(u) - 0.052, (u) => openHi(u) + 0.052, 16, 5, (u, v, q) => {
                        const t = clamp01((u - socket.u0) / (socket.u1 - socket.u0));
                        const bowlT = Math.sin(Math.PI * t) * Math.sin(Math.PI * q);
                        // Rim flush with the mask's inner face (its lift less its 7.5 mm of
                        // thickness, plus a shaving so the two do not z-fight), falling to
                        // the socket floor at the centre. The globe still stands 13 mm proud
                        // of that floor and still catches its own wet dot — void first,
                        // eye second, which is the call this helmet needs.
                        return mix(maskLift(v) - 0.0069, 0.0035, Math.pow(bowlT, 0.55));
                    }, 0.0012, dark);
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
                const along = (u) => clamp01((Math.abs(u) - browIn) / (browEnd - browIn));
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
                const browLo = (u) => ev + 0.052 + 0.094 * slot(u) + 0.072 * Math.pow(along(u), 1.6);
                // And it tapers. A band of constant height is a strap; the fitting on the
                // object is deepest where it leaves the nose and thins to nothing at the
                // boar, which is also what lets the boar read as a terminal rather than as
                // a bead stuck on the end of a rail. 10 mm down to 3.4.
                const browHi = (u) => browLo(u) + 0.094 * (1 - 0.66 * Math.pow(along(u), 1.25));
                // Relief on the fitting, taken to nothing on all four boundaries. Every
                // rim strip a `patch` closes with points its normal *along* the sheet, so
                // a fitting that ends at full lift draws its own outline in a different
                // value — the defect logged against the beard, the war paint and the cloak
                // hem, and the last thing this face needs is a bright wire round the one
                // shape that is supposed to be soft gold.
                const relief = (t, s, peak) => peak * Math.pow(Math.sin(Math.PI * clamp01(t)), 0.40)
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
                    onShell(b.u0, b.u1, browLo, browHi, Math.max(10, lod.shellU + 4), 3, (u, v, t) => maskLift(v) + relief(along(u), t, 0.0028), 0.0024, gilt);
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
                        p.add(ball(0.0046, 7), gilt, xf(q.x, skullY + q.y, q.z, 0, s * 0.55, 0, 1.35, 0.95, 0.90));
                        p.add(ball(0.0025, 6), gilt, xf(q.x + s * 0.0046, skullY + q.y - 0.0020, q.z - 0.0015, 0, s * 0.55, 0, 1.2, 0.85, 0.9));
                        // Tusks. 0.5 mm at the root over 10 mm of length is a hair, and the
                        // review found them as exactly that: "hair-thin whisker slivers off
                        // both eyebrow terminals". A sliver one pixel wide is not a small
                        // detail, it is an artifact — it aliases, it catches the key at full
                        // value, and it has no shape to lose. Shorter and three times as
                        // thick, so what is there reads as a tusk or is not there at all.
                        for (const t of [-1, 1]) {
                            p.add(rod(0.0009, 0.0017, 0.0042, 5), gilt, xf(q.x + s * 0.0056, skullY + q.y + t * 0.0015, q.z + 0.0021, 0, 0, s * 1.15));
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
                const mT = (u) => clamp01(Math.abs(u) / mSpan);
                // Keeps 28% of its depth at the tips rather than closing to a point. A
                // moustache that comes to nothing at both ends is a pair of horns; one
                // that keeps a hem is a tail, and the tail is what this shape is for.
                // Keeps 55% of its depth at the tips, up from 28. The old hem was 4 mm on
                // a sheet 4.5 mm thick — the tip was deeper than it was tall, which is a
                // ROD, and a rod that sweeps down is the horn the review found. A tail is
                // blunt: the fitting on the object ends in a squared terminal, not a point.
                const leaf = (u) => mHalf * (1 - 0.38 * Math.pow(mT(u), 1.9));
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
                const droop = (u) => mMid - 0.105 * Math.pow(mT(u), 1.7) - 0.014 * Math.pow(1 - smooth(0, 0.055, Math.abs(u)), 2);
                const mLip = (u) => droop(u) + leaf(u);
                onShell(-mSpan, mSpan, (u) => droop(u) - leaf(u), mLip, Math.max(14, lod.shellU + 12), 5, (u, v, t) => maskLift(v) + relief(0.5 + 0.5 * (u / mSpan), t, 0.0020), 0.0026, gilt);
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
                const noseFlare = (u) => Math.cbrt(clamp01((Math.abs(u) - 0.062) / (noseHalf - 0.062)));
                // 1.8 mm proud on a 2.4 mm sheet, down from 2.6 on 4.5. THIS IS THE FAULT
                // ALL THREE FITTINGS SHARE and it is worth stating once: the mask is a
                // dome standing ~40 mm off a blurred face, and anything riding the top of
                // that keel adds its own relief to the most forward point in the frame. On
                // the artefact the nose is a MODEST gilded strip lying on the plate — it is
                // read by its edges and by the shadow they cast, not by its height. Half
                // the standoff and the same outline is the whole of the fix.
                onShell(-noseHalf, noseHalf, () => noseBot, (u) => mix(noseTop, noseBot, noseFlare(u)), 12, 9, (u, v, t) => maskLift(v) + relief(0.5 + 0.5 * (u / noseHalf), t, 0.0018), 0.0024, gilt);
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
                    p.add(ball(0.0046, 8), gilt, xf(hq.x, skullY + hq.y, hq.z, -0.30, 0, 0, 0.82, 1.00, 0.78));
                    const bq = onMask(0, noseTop + 0.010, 0.0028);
                    p.add(ball(0.0026, 7), gilt, xf(bq.x, skullY + bq.y, bq.z, -0.55, 0, 0, 0.66, 1.25, 0.70));
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
                    const vAt = (u, v, inset, out) => {
                        const t = v * (vRings.length - 1);
                        const i = Math.min(vRings.length - 2, Math.floor(t));
                        const f = t - i;
                        const a = vRings[i];
                        const b = vRings[i + 1];
                        out.set(Math.sin(u) * (mix(a.hw, b.hw, f) - inset), mix(a.y, b.y, f), mix(a.z, b.z, f) + Math.cos(u) * (mix(a.hd, b.hd, f) - inset));
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
                    const vSweep = (inset) => (t, v, out) => vAt(mix(vHalf, -vHalf, t), v, inset, out);
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
                const bowlAt = (v) => bowlLift(clamp01((v - bowlLo) / (crownTop - bowlLo)));
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
                const ridgeAt = (v, front) => {
                    const run = front
                        ? mix(0.72, 1, smooth(bandLo, bandLo + 0.38, v))
                        : smooth(bandLo - 0.44, bandLo - 0.02, v);
                    return 0.0132 * run * (1 - 0.40 * smooth(crownTop - 0.34, crownTop, v));
                };
                /** `du` is the signed offset from the crest's own centreline, in radians. */
                const crestLift = (du, v, front) => {
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
                        p.add(ball(0.0102, 8), gilt, xf(q.x, skullY + q.y, q.z, end.tilt, 0, 0, 0.72, 0.80, 1.30));
                        const s2 = onForm(end.u, end.v - sgn * 0.052, base + 0.0018);
                        p.add(ball(0.0058, 7), gilt, xf(s2.x, skullY + s2.y, s2.z, end.tilt, 0, 0, 0.60, 0.62, 1.15));
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
            if (wallman && !ownCrest) {
                // Fore-and-aft comb, raised. The warden's one unmistakable outline cue,
                // and at 30 mm it was inside the bowl's own dome — a ridge on a helmet,
                // not a shape in a silhouette. 52 mm puts a hard vertical fin above the
                // skull that no other class on the roster has.
                //
                // BUILT AS A COMB, and this is the same needle the ridge helm's crest and
                // the wyrm's were both found to be. It was two `headWear` strips of fixed
                // AZIMUTHAL half-width meeting at the crown — and azimuthal width goes to
                // nothing at the pole, so a strip 11 mm across at the band was 0 mm across
                // at the crown while still carrying its full 74 mm of height. Giving the
                // piece a tag was enough to see it: `helmFitProbe` measured 1.1% of it
                // turned inside out, on the Iron Spangenhelm, the Nasal, the Spectacle and
                // the Jarl's Crowned. It had been shipping untagged and unmeasured since
                // the crests around it were fixed.
                //
                // `comb` sweeps a half-tube of stated WIDTH along the sagittal plane, so
                // the crown gets the same 11 mm of metal as the flank does. The height and
                // the run are unchanged; this is the same fin, with a section.
                p.add(comb(-1.16, 1.16, (t) => 0.052 * Math.pow(Math.sin(Math.PI * clamp01(t)), 0.75), () => 0.0055, 0.006), steel, place.clone());
            }
            // Neck flange off the back of the band. The warden is the one class with
            // no coif, and without something behind the helm his head ends in a hoop —
            // this is the fall a ridge helm actually carries, and from behind it is the
            // difference between him and the berserker at fifty metres. A helmet that
            // brings a fall of its own has already built one above, on rings, and two
            // would fight for the same air.
            //
            // IT WAS THE OTHER HALF OF THE OWNER'S WINGS, and it shipped untagged, so
            // `helmFitProbe` skipped it as if it were hair and no bar in this file had
            // ever been applied to it. It was a RECTANGLE IN (u, v) — a constant top, a
            // constant hem, 132° of arc — with a lift that grew from 17 mm at the band
            // to 37 mm at the hem. Both of those are the fault. The constant hem
            // carries the plate's full depth round to its own side edges at 1.99 rad,
            // which is past the head's widest point, and the growing lift stands that
            // edge 37 mm off the skull with 30 mm of daylight under it. From the front
            // three-quarters — which is the armoury card's bearing — that draws as a
            // pale curved flange flaring out and up from the side of the head, on the
            // Iron Spangenhelm, the Nasal and the Spectacle. It is on the two cheapest
            // helmets in the shop and on the class the armoury opens on.
            //
            // A neck flange hangs DOWN. So: the outline is a function of u, deepest on
            // the midline and dying to a lip at both ends, so what reaches the side of
            // the head is an edge and not a corner; and the standoff CLOSES as it
            // falls, 18 mm at the band to 21 at the rim, which is a liner plus the few
            // millimetres of overhang that make the rim a rim.
            if (wallman && style.nape === "none") {
                const flHalf = 1.15;
                /** 0 on the midline at the back, 1 at either end of the flange. */
                const fu = (u) => clamp01(Math.abs(u - Math.PI) / flHalf);
                p.add(headWear(K, {
                    tag: "warden flange",
                    u0: Math.PI - flHalf, u1: Math.PI + flHalf,
                    v0: (u) => bandLo - 0.30 * mix(1, 0.17, Math.pow(smooth(0.22, 1, fu(u)), 1.35)),
                    v1: () => bandLo + 0.01,
                    nu: Math.max(8, lod.shellU - 2), nv: 3,
                    // Flat, at a liner's thickness. The 3 mm of rim overhang this used to
                    // carry bought a shadow line the brow band already draws, and on a lip
                    // whose outline tapers to nothing at both ends 3 mm of rise across a
                    // short column is 21 deg of measured flare — most of a bar, spent on
                    // something nobody can see.
                    lift: () => 0.019, thick: 0.007,
                }), capMetal, place.clone());
            }
            if (bare && !ownCrest) {
                // Boar bristle over the crown. The berserker wears the lowest cap on the
                // roster and needs the height back somewhere that is unmistakably *his* —
                // and a ragged organic crest is the opposite read from the warden's
                // machined steel fin, which is the point of having both.
                p.add(headWear(K, {
                    tag: "bristle",
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
            // Gated to the huscarl this pass. It used to hang off `!wallman` (then
            // named `lamellar`), which
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
                // The mail's own opening, declared with the head stack because the hair
                // has to know where it is. See `coifRim`.
                const rim = coifRim;
                // The one table, read from two places — see where it is declared, above
                // the nape fall. A plate that has to lie OVER the mail cannot keep its
                // own copy of where the mail is; that is how the guard ended up 6 mm too
                // small and drew a band of ragged cut-out triangles above its own rim.
                const levels = coifLevels;
                const coif = (u, v, inset, out) => {
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
                    inner: (t, v, out) => coif(mix(Math.PI * 2 - rim(v), rim(v), t), v, 0.014 * smooth(0, 0.09, Math.min(t, 1 - t)), out),
                }), mail);
            }
        }
        else if (ap.helm === "hood") {
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
            }), hoodCloth, place.clone());
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
            ], 8, { capTop: true, capBottom: true }), hoodCloth);
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
            ], Math.max(10, lod.body - 4), { power: 2.2, wall: 0.014 }), hoodCloth);
        }
        // The complexion, written onto every piece of flesh on the head at once —
        // skull, lids, lips, ears, the throat — so all of them land on one
        // continuous map and no boundary between two of them can show as a step.
        // Last, because it has to see everything that was added.
        if (!thrifty) {
            p.paint([headSkin, headShade, headWarm], faceComplexion(K, skullY, tone, ap.warPaint, ap.beardStyle === "none" ? null
                : { color: ap.beardColor, full: ap.beardStyle !== "short" }));
        }
        return p;
    }, headSig);
    // ==========================================================
    // THE NECK
    // ==========================================================
    //
    // WHAT THE OWNER IS LOOKING AT — "the neck is very strange on the front &
    // back" — AND IT IS TWO FAULTS, BOTH STRUCTURAL.
    //
    // 1. IT WAS A DIFFERENT SUBSTANCE FROM THE HEAD. The neck was swept in the
    //    torso in `skinDark` — a plain flesh material with no vertex colour on it
    //    at all — while the head, the jaw mass, the lids, the lips and the ears
    //    are all one surface carrying `faceComplexion`. So the man's skin
    //    CHANGED MATERIAL at the jawline. The head above the seam is graded, the
    //    neck below it is one flat value, and the boundary between them is a
    //    silhouette curve rather than a straight line — which draws exactly the
    //    hard-edged pale wedge, with a straight diagonal seam on one side of the
    //    throat in front and a large pale panel over the whole back. It reads as
    //    two solids intersecting because it IS two solids intersecting: two
    //    surfaces, two materials, no shared grading.
    //
    //    The comment that used to sit over the sweep asserted the opposite —
    //    "the two surfaces share `skinDark`, so wherever a nod slides one through
    //    the other the seam does not exist to be seen". They have not shared a
    //    material since the head was rebuilt around `faceComplexion`, and the
    //    note went on saying they did.
    //
    // 2. AND `CLASS.gorget` IS DEAD. The strong lead was that the huscarl's
    //    `gorget: 1.0` was drawing a flat plate over the throat. It is not: the
    //    field is READ BY NOTHING. `grep gorget src/` finds the declaration, the
    //    four class rows and two mentions in docs, and no consumer anywhere. The
    //    huscarl's throat is bare skin, the same as the berserker's, and the
    //    number that says otherwise has never been true. Wired up below, because
    //    a value in a table that nothing reads is a lie the next reader inherits.
    //
    // So the neck is now ITS OWN PART, emitted on `headSig` rather than on the
    // body signature. That is the whole reason it moved out of the torso: the
    // body is cached by loadout and stature so a shieldwall shares one set of
    // limbs, and the complexion field varies per SEED — `F.tall`, `F.wide`,
    // `F.deep` and the tone all enter it. A neck painted with that field and
    // cached on the body signature would hand the second warrior the first one's
    // face tones. It hangs off `root` exactly as the torso does, so `insertSpine`
    // carries it with the chest and `severBody` leaves it alone, both unchanged.
    emit("neck", root, () => {
        const p = new Part();
        const nHW = S.neckHW;
        const nHD = S.neckHD;
        // Elliptical rather than round, tapered rather than extruded, set back in z
        // so the jaw hangs over it, and flared hard at the base into the trapezius.
        // All of that was right and none of it has moved.
        //
        // WHAT HAS MOVED IS THE TOP, AND IT IS THE OTHER HALF OF THE WEDGE. The top
        // ring was 0.95 x 0.94 of the full section — 77 x 81 mm — at a height where
        // the head's own submandibular mass measures 62 x 69. So the neck stood
        // 15 mm proud of the throat above it on every side and 19 mm proud at the
        // nape, capped, at a height that is INSIDE the head: a lit disc on a post,
        // wider than the thing it is supposed to be disappearing into. The comment
        // claimed those stations "climb into the mandible and are covered there by
        // the head's own throat mass". They climb into it and come straight back
        // out the other side.
        //
        // The two stations above the mandible's lower border now tuck INSIDE the
        // jaw mass they hand off to, and the first station the viewer can actually
        // see — below the menton — keeps the width it had, so the visible throat is
        // the same throat `headmeasure` signed off on.
        // AND THE TOP STATIONS REACH FURTHER BACK THAN THEY DID, which is the
        // nape half of the same defect. The skull's occiput carries further back
        // than its chin does, so a neck centred for the throat leaves the back of
        // the head standing over it on a shelf — a ragged horizontal lip across
        // the nape with daylight under it, which is the "large pale shape covers
        // the back of the neck and skull junction" seen from behind. The back of
        // each top station moves back 13 mm and the front does not move at all:
        // `z` down by half of it and `hd` up by half, which is the only way to
        // grow one side of an ellipse.
        const NECK = [
            { y: S.neckTop + 0.095, hw: nHW * 0.70, hd: nHD * 0.72 + 0.0065, z: -0.0275 },
            { y: S.neckTop + 0.042, hw: nHW * 0.82, hd: nHD * 0.84 + 0.0065, z: -0.0255 },
            { y: S.neckTop - 0.008, hw: nHW * 0.93, hd: nHD * 0.95 + 0.0045, z: -0.0175 },
            { y: S.neckRoot - 0.048, hw: nHW, hd: nHD, z: -0.007 },
            { y: S.neckBase + 0.070, hw: nHW * 1.13, hd: nHD * 1.04, z: 0 },
            { y: S.neckBase + 0.010, hw: nHW * 1.50, hd: nHD * 1.16, z: 0 },
            { y: S.neckBase - 0.055, hw: nHW * 1.93, hd: nHD * 1.23, z: 0 },
        ];
        p.add(shell(NECK, lod.limb, { capTop: true }), headSkin);
        /**
         * The neck's own section at a height, read off the stations above.
         *
         * The strap sampler used to carry a SECOND, hand-written copy of the top of
         * this profile as a two-point lerp, and the two disagreed the moment the
         * stations moved: a muscle sited on 0.82 of the section where the shell is
         * actually at 0.70 stands 3 mm outside the throat it is supposed to be
         * inside, and what that draws is a hard tab of skin floating under the ear.
         * One profile, read by everything that rides on it.
         */
        const neckAt = (y) => {
            if (y >= NECK[0].y)
                return NECK[0];
            for (let i = 0; i < NECK.length - 1; i++) {
                const a = NECK[i], b = NECK[i + 1];
                if (y > b.y) {
                    const f = (a.y - y) / (a.y - b.y);
                    return { y, hw: mix(a.hw, b.hw, f), hd: mix(a.hd, b.hd, f), z: mix(a.z ?? 0, b.z ?? 0, f) };
                }
            }
            return NECK[NECK.length - 1];
        };
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
        const strap = (y, th, r, sink = 0) => {
            const st = neckAt(y);
            // Sunk by 60% of its own radius, not laid on the surface. A tube whose
            // axis is exactly on the skin stands half proud, and half an 11 mm tube
            // meets the neck at 90° — a hard crease running from the ear to the
            // collar, which is the strap reading as a blade stuck on the throat
            // rather than as a muscle under it. At 0.4 r proud the ridge is a ridge.
            const k = 1 - (0.6 * r + sink) / Math.max(1e-4, st.hw);
            return { x: st.hw * k * Math.sin(th), y, z: (st.z ?? 0) + st.hd * k * Math.cos(th), a: r, b: r };
        };
        for (const s of [-1, 1]) {
            const at3 = (y, th, r, sink = 0) => {
                const k = strap(y, th, r, sink);
                k.x *= s;
                return k;
            };
            // Four knuckles, and the top one is 3 mm rather than 10. A `digit` ends
            // in a cap the size of its last radius, so a 10 mm knuckle at the mastoid
            // finished the muscle in a blunt disc standing off the jaw — the hard
            // little blade visible under each ear from three-quarter rear. A muscle
            // dies into its own attachment.
            // Both ENDS buried, and eight sides rather than six. `digit` closes a run
            // with a cap the size of its last knuckle, and a cap on a tube that is
            // riding the surface is a lit polygon standing in the open — the little
            // staircase of dark facets under each ear. Sinking the first and last
            // knuckles by 6 mm puts both caps inside the throat, so what emerges is
            // the belly of the muscle and nothing else; at six segments the hexagon's
            // own facets were reading as the steps of that staircase even where the
            // cap was gone.
            p.add(digit([
                at3(S.neckTop + 0.074, 1.34, 0.0060, 0.0075),
                at3(S.neckTop + 0.044, 1.20, 0.0088, 0.0012),
                at3(S.neckTop + 0.002, 0.92, 0.0105),
                at3(S.neckRoot - 0.036, 0.44, 0.0080, 0.0016),
                at3(S.neckRoot - 0.062, 0.34, 0.0052, 0.0070),
            ], lod.trim ? 8 : 5), headSkin);
        }
        // Laryngeal prominence. One flattened ball, and the single most recognisable
        // landmark on a man's throat — without it the front of the neck has no feature
        // between the jaw and the collar for the eye to measure the length against.
        if (lod.trim) {
            const ly = S.neckTop + 0.022;
            const k = strap(ly, 0, 0);
            p.add(ball(0.011, 8), headSkin, xf(0, ly, k.z - 0.003, 0, 0, 0, 1.35, 1.15, 0.62));
        }
        // And the same field the face wears, on the same material, sampled with the
        // head's origin where it actually is in this part's space — `S.headY`,
        // because this part hangs off the body root and not off the head pivot. One
        // continuous map from the crown to the collar, and no boundary in it.
        if (!thrifty) {
            p.paint([headSkin], faceComplexion(K, S.headY, tone, ap.warPaint, ap.beardStyle === "none" ? null
                : { color: ap.beardColor, full: ap.beardStyle !== "short" }));
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
    let cloak;
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
            const surf = (u, v, inset, out) => {
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
    const seams = {
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
    const cutting = {
        root, seams, legs: legPivots, head: headPivot, torso: torsoMeshes,
        materials: M, detail, live: new Map(),
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
            for (const s of [...cutting.live.values()])
                s.release();
        },
    };
}
