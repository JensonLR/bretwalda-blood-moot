// ============================================================
// ROSEBAND — is this pixel PINK, and is that a thing this game may be?
//
// ONE DEFINITION, TWO CALLERS. `tools/factionread.mjs` §7 grades the frames it
// captures itself; `tools/roselook.mjs` grades a directory of frames somebody
// else already shot. The band lives here because `docs/PROCESS.md` failure mode
// 3 is mirrored definitions — four instances in `characters.ts` alone — and a
// colour band written out twice is a band that will be edited once.
//
// ------------------------------------------------------------
// THE OWNER'S WORDS, WHICH ARE THE ACCEPTANCE CRITERIA
//
//   "THE DANELAW READS ROSE AT THE SLEEVES AND THE BYRNIE."
//   "A Viking in dusty pink is not the Danelaw at any delta-E."
//
// The second sentence is the whole design of this file. ΔE — and ΔC, which is
// what `factionread` §1 gates — measures how far one man is from another man.
// Rose is a long way from weld, from moss and from woad, so a pink Dane clears
// §1 comfortably, and did, through a green 15/15 and then a green 21/21. The
// question those numbers cannot ask is whether the Dane is the RIGHT colour,
// and "the right colour" is not a distance from anybody else. It is a place on
// the wheel, and it needs a ruler that names places.
//
// ------------------------------------------------------------
// AND IT IS MEASURED ON A GRADED FRAME, WHICH IS THE POINT
//
// `factionread`'s own verdict line carried this sentence while the defect was
// on screen: "§0-§5 have no light and no grade — albedo only". Everything below
// takes 8-bit sRGB straight off a capture — after the key light, after the
// bonfire, after `postfx.ts`'s adaptive grade — because that is the only place
// the defect exists as anything a person can point at.
//
// ------------------------------------------------------------
// THE FOUR BOUNDS, AND NOT ONE OF THEM WAS CHOSEN BY THE PERSON WHO WROTE THE
// FIX IT WAS WRITTEN TO GRADE
//
//   the arc      within 25° of the dyestuff's own CIELAB hue angle. Passed in
//                as a hex — `FACTION_FIELD.norse`, which is `--garnet` in
//                globals.css and the colour the map paints the Danelaw with.
//                Repaint the kingdom and this moves with it.
//   the value    L* 41 and up. BELOW that the red arc still has its dark names
//                — oxblood, maroon, garnet — and the shipped Danelaw tunic at
//                L* 25.2 and its dark-finish leg wraps at L* 40.3 are those
//                names. A band that flagged them would be asking the Danelaw
//                not to be red, which is not the complaint.
//   the floor    the chroma of the UNDYED linen shirt, `0xc2b69c`, which this
//                game has shipped since before liveries existed: C* 14.8.
//                Under it a surface is greige — cloth with no dye in it — and
//                greige is not pink, it is undyed.
//   the ceiling  half the dyestuff's own ratio of colour to light. Garnet is
//                C* 48.7 at L* 26.4, which is 1.84 points of chroma for every
//                point of value; half of it is 0.92. ABOVE that line a red
//                surface still has the stone in it and reads as rust, brick or
//                blood. Below it the light is in and the colour is out, and
//                that is what pink IS.
//
// Only 25° and the one-half are free, and both are gated: `calibrate()` runs
// on every use and must flag every colour the owner reported as rose across
// three rounds while clearing every shipped surface that is correct. A band
// that stops separating those two lists is red before it grades anything.
// docs/PROCESS.md R2 and R3, carried by the instrument rather than promised.
//
// ------------------------------------------------------------
// WHAT THIS DOES NOT MEASURE — docs/PROCESS.md R4
//
//   * IT IS NOT A JUDGE OF ROSE ANYWHERE ELSE. Skin is on the red arc and so
//     is firelight, so no frame of any people reads zero. This band counts;
//     the CALLER supplies the control. `factionread` §7 uses the peoples whose
//     fields are off the arc, shot in the same scene at the same bearings, and
//     `roselook` prints every frame side by side so the floor is visible.
//   * IT IS A PIXEL COUNT AND NOT A PERCEPTUAL MODEL. Two frames with the same
//     count can look different. It is a screen for one named defect, and the
//     render is still opened — R5 is not discharged by this file.
// ============================================================

/** 8-bit sRGB -> CIELAB (D65). The space the bounds above are quoted in. */
export function rgb2lab(r8, g8, b8) {
  const f0 = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const r = f0(r8 / 255), g = f0(g8 / 255), b = f0(b8 / 255);
  let X = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let Z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  X /= 0.95047; Z /= 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export const labOf = (hex) => rgb2lab((hex >> 16) & 255, (hex >> 8) & 255, hex & 255);
export const chromaOf = (L) => Math.hypot(L[1], L[2]);
export const hueOfLab = (L) => (Math.atan2(L[2], L[1]) * 180) / Math.PI;
/** Shortest angular distance in degrees. */
export const arcTo = (a, b) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

/** How far either side of the dyestuff's hue the arc runs. */
export const ARC = 25;
/** The value at and above which the red arc has no dark name left. */
export const ROSE_L = 41;
/** The share of the dyestuff's own colour-to-light ratio that still reads as it. */
export const ROSE_RATIO = 0.5;

/**
 * REPORTED AS ROSE, off real captures, across three rounds of this defect.
 * These are the acceptance criteria as hexes. `#8a5359` is round one's byrnie
 * and is quoted in `characters.ts`'s `norse` livery comment; `#b9746a` is this
 * round's sleeve and is the hex the owner measured.
 */
export const MUST_FLAG = [
  [0xb9746a, "the sleeve, this round — H8 S36 L57, the hex the owner reported"],
  [0x8a5359, "the byrnie, round one, sampled off the capture"],
  [0xa75569, "seablue-finish mail, this round"],
  [0xb46f64, "steel-finish leg wraps, this round"],
  [0x9b6f78, "seablue-finish leg wraps, this round"],
];
/**
 * SHIPPED AND CORRECT. Danelaw surfaces that are russet, brick, oxblood, bare
 * iron or the stone itself, plus the undyed shirt and the map's brightest
 * token. A band that flags any of these is asking the Danelaw not to be red.
 */
export const MUST_CLEAR = [
  [0x7c1420, "the garnet field itself"],
  [0x6f2100, "the Danelaw tunic — oxblood"],
  [0x8c4e43, "dark-finish leg wraps — brick"],
  [0x94402c, "iron-finish leg wraps — russet"],
  [0xb54525, "gold-finish mail — rust"],
  [0xc74c27, "gold-finish leg wraps — rust"],
  [0xb23c34, "crimson-finish mail — blood"],
  [0xc2b69c, "the undyed linen shirt"],
  [0x868686, "a neutral grey at the same value"],
  [0xd9a441, "gilt, the brightest token on the map"],
];

/**
 * A band, off one dyestuff and one undyed cloth.
 * `field` is the people's flat colour; `undyed` is the cloth with no dye in it.
 */
export function makeBand(field, undyed = 0xc2b69c) {
  const G = labOf(field), U = labOf(undyed);
  const fieldL = G[0], fieldC = chromaOf(G), fieldH = hueOfLab(G);
  const floor = chromaOf(U);
  const ratio = ROSE_RATIO * (fieldC / fieldL);
  const test = (r, g, b) => {
    const L = rgb2lab(r, g, b), C = chromaOf(L);
    return arcTo(hueOfLab(L), fieldH) <= ARC && L[0] >= ROSE_L && C >= floor && C <= ratio * L[0];
  };
  return {
    test, fieldL, fieldC, fieldH, floor, ratio,
    /** True when a people's own field sits on this band's arc at all. */
    onArc: (hex) => arcTo(hueOfLab(labOf(hex)), fieldH) <= ARC,
    describe: () => `within ${ARC}° of hue ${fieldH.toFixed(0)}°, L* >= ${ROSE_L}, C* between the undyed shirt's ${floor.toFixed(1)} and ${ratio.toFixed(2)} x L*`,
  };
}

/**
 * The band's own proof of failure, run before it is allowed to grade anything.
 * Returns `{ missed, overreach }` — both empty is the only acceptable answer.
 */
export function calibrate(band) {
  const hit = ([h]) => band.test((h >> 16) & 255, (h >> 8) & 255, h & 255);
  return { missed: MUST_FLAG.filter((e) => !hit(e)), overreach: MUST_CLEAR.filter((e) => hit(e)) };
}

/** Share of the pixels under `mask` (or all of them) that land in the band. */
export function roseShare(band, data, mask, stride = 4) {
  let n = 0, rose = 0;
  const hist = new Map();
  for (let i = 0, p = 0; i < data.length; i += stride, p++) {
    if (mask && !mask[p]) continue;
    n++;
    if (!band.test(data[i], data[i + 1], data[i + 2])) continue;
    rose++;
    const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1])[0];
  const c = (v) => (v << 3).toString(16).padStart(2, "0");
  return {
    n, rose, pct: n ? (100 * rose) / n : 0,
    modal: top ? `#${c((top[0] >> 10) & 31)}${c((top[0] >> 5) & 31)}${c(top[0] & 31)}` : "—",
  };
}
