#!/usr/bin/env node
// ============================================================
// SHOOT — headless capture of the game's render output.
//
//   npm run shots                       # all presets, 1600x900
//   npm run shots -- duel closeup       # only these presets
//   npm run shots -- helmcards          # a contact sheet (see SHEETS)
//   npm run shots -- armoury            # the whole cosmetics audit
//   npm run shots -- --hud              # keep the HUD visible
//   npm run shots -- --out art/shots/v2 # write elsewhere
//   npm run shots -- --w 2560 --h 1440  # capture resolution
//   npm run shots -- --dev              # ignore any production build
//
// One card, for iterating on a single item without shooting its whole sheet:
//
//   npm run shots -- facecard --helm helm_wyrm --turn -90
//   npm run shots -- kitcard  --cloak cloak_gold --armor armor_gold --turn 180
//   npm run shots -- facecard --guides --turn 0     # the aiming ruler
//
// Boots the app itself (production build if present, else dev),
// drives /shot with Playwright, writes PNGs, and fails loudly on
// any WebGL/console error so a broken scene can't pass review.
//
// If another agent is running `npm run play` in this checkout, the dev
// fallback dies with "Another next dev server is already running" — the
// lock is per-directory (.next/dev/lock), not per-port. Capture from a
// worktree with its own .next rather than killing his server or building
// over it:
//
//   git worktree add --detach ../shots HEAD
//   cp -al node_modules ../shots/node_modules   # a symlink is refused by
//                                               # turbopack: outside the root
//   cd ../shots && npm run shots -- armoury --out <abs path>
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { mkdirSync, existsSync, writeFileSync, statSync, readdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// portrait/stance/lineup use an aimed camera; the rest follow the warrior.
const ALL_PRESETS = ["duel", "arena", "closeup", "brawl", "laststand", "portrait", "stance", "lineup"];
/** The three audit lenses. Shot on their own, they take slot flags — see the header. */
const CARD_PRESETS = ["facecard", "kitcard", "fightcard"];
// Deaths. Off the default run: they are a review of one feature rather than of
// the game's look, and each one costs a preset's worth of frames on a box with
// no GPU. Ask for them by name — `npm run shots -- gorehead --out art/shots/gore`.
// Helmets are the same: a review of the shop's ladder rather than of the game's
// look, asked for by name — `npm run shots -- helmcards helmturn`.
// `pyre` and `burnman` are the fire's two shots and are off the default run for
// the same reason the deaths are: they review one feature, and `burnman` in
// particular exists to be looked at rather than to be shipped in a gallery.
//
// `helms` and `helms2` are gone rather than merely off the default run. They were
// the row-of-five — men stood abreast with the bonfire in the middle of them, so
// the panels were separate exposures — and `docs/COSMETICS-AUDIT.md` records what
// that instrument cost: a reviewer read the strip, reported the helmets differed,
// and a helmet nobody could tell apart nearly shipped at 950 gold. An instrument
// that produces confident wrong answers is worse than none, so it does not stay
// in the drawer to be picked up again. The cards below answer the same question.
const EXTRA_PRESETS = ["gorehead", "gorearm", "goresplit", "gorehelm", "suttonhoo", "pyre", "burnman", "summaryduel", "summarymoot", "fortwide"];

// ============================================================
// CONTACT SHEETS
//
// A sheet is N captures of one parametric preset, laid out side by side into a
// single PNG. It exists because the thing it replaced — a row of five men
// photographed in one frame, then cropped into panels — could not answer the
// question it was built for. Men standing abreast in this arena are at five
// different bearings from the bonfire, so the row was five exposures: the
// middle panels were backlit by flame and blown to orange, the ends sat in
// shadow, and the crop that came out of it invited a reviewer to compare
// silhouettes across lighting he could not see changing. A helmet passed
// review on it.
//
// A sheet inverts that. The subject never moves, so every panel is the same
// photons; the camera never moves, so every panel is the same scale and the
// same background; only the slot under test changes. Each panel is its own
// full-frame capture, so the work gets the pixels the crop could not give it —
// ~400 px of head against ~200. The cards are kept on disk beside the sheet,
// because the sheet is for comparing and a card is for looking at.
//
// The cost is honest and worth stating: ten captures instead of one, which on
// a GPU-less box is minutes rather than seconds. That is the price of panels
// that can be compared at all.
//
// ------------------------------------------------------------
// THE ARMOURY AUDIT
//
// Eight slots, 47 options, 37 of which had never been rendered for review even
// once. The sheets below are that audit, and three things about how they are
// built are deliberate:
//
// 1. THE ROSTER COMES FROM THE SHOP. This file used to carry its own copy of the
//    helmet ladder with a comment saying it mirrored `characters.ts`. A tool that
//    holds its own copy of the catalogue audits the catalogue it was written
//    against — which is exactly how the shop grew to 47 options while the capture
//    set reviewed ten of them. `/shot?roster=1` publishes `ARMOURY` itself, and
//    the panels are generated from it, so a new item in the shop is in the audit
//    the first time anyone shoots it. Slot names are static (they are structure);
//    option lists are not (they are stock).
//
// 2. EVERY SHEET IS ONE LENS AND ONE MARK. A sheet whose panels differ in
//    framing or light is the row-of-five again. The man stands on `portrait`'s
//    mark in every panel of every sheet; what varies within a sheet is one slot
//    and, in the rows, the bearing.
//
// 3. EVERY SLOT IS SHOT TWICE — portrait and fight distance. "Does it read at
//    fight distance" is a different question from "is it good", and the tight
//    card cannot answer it: a brow is 400 px on a face card and 6 px on the
//    screen of the man you are actually fighting. A cosmetic nobody can see in
//    play is not a cosmetic, and the `*fight` sheets are where that gets said.
//
// 4. THE MAN HOLDS STILL. He did not before — see `installVirtualClock` below,
//    which is the reason any of the above can be believed.
//
// The whole audit is ~100 captures, which on a GPU-less box is about two hours.
// Each sheet is nameable on its own so it can be run a slot at a time, and that
// is the intended way to work through it.
//
// 5. THESE SHEETS DO NOT ASSERT ANYTHING, AND THAT IS NOT THEIR JOB. A sheet is
//    for a human to look at. Until `tools/cosmetictest.mjs` was written no
//    harness in this project had ever rendered a cosmetic and asserted anything
//    about it, so every defect the audit lists — seven helms sharing a bowl,
//    four war paints identical under the mask, two paid colours that were the
//    same colour — was found by eye, months late. Run
//
//        npm run cosmetictest
//
//    before you run these sheets. It measures all 47 options at both lenses in
//    about fifteen seconds of arithmetic plus a handful of captures, writes
//    docs/COSMETICS-SWEEP.md, and tells you which panels are worth your eyes.
//    The sheets are then for judging what it cannot: whether the thing is any
//    good.
// ============================================================

// -35°, not 0 and not +35. Three-quarter because head-on is precisely the
// bearing that hides a crest and a nape guard — the two fittings the last
// review missed — while still showing the brow, the mask and the nasal. The
// SIGN is not cosmetic: the mark's key light is the bonfire off his right
// shoulder, so a negative turn rotates his face into it and a positive turn
// photographs the same helmet's shadow side.
const QUARTER = -35;

/**
 * The audit, as a plan. `slot` sheets are filled in from the shop's roster at
 * run time; `shots` sheets name their panels outright.
 *
 * A row is a bearing plus whatever else has to be worn for the question to make
 * sense — a hair colour needs hair on the head to be a colour of anything, and
 * war paint needs a helmet on top of it before "does it survive the kit that
 * came after it" is being asked rather than assumed.
 */
const SHEETS = {
  // ---- helm (10) ----
  helmcards: {
    file: "helm-cards.png", card: "facecard", slot: "helm", cols: 5,
    title: "HELM LADDER · one huscarl, one mark, one camera, one light · three-quarter −35°",
    rows: [{ turn: QUARTER }],
  },
  helmfight: {
    file: "helm-fight.png", card: "fightcard", slot: "helm", cols: 5,
    title: "HELM LADDER · at fight distance",
    rows: [{ turn: QUARTER }],
  },
  // One helmet is a three-dimensional object and a single bearing is not a
  // review of it. The crest runs fore-and-aft over the crown and the guard hangs
  // off the nape, so head-on both of them are a line and a rumour. Same mark,
  // same camera, same light — the man turns, the rig does not.
  helmturn: {
    file: "suttonhoo-turn.png", card: "facecard", cols: 4,
    title: "SUTTON HOO · turntable · the rig is fixed and the man turns · crest and nape guard live at 90° and 180°",
    shots: [
      { label: "front 0°", turn: 0 },
      { label: "three-quarter −45°", turn: -45 },
      { label: "profile −90°", turn: -90 },
      { label: "back 180°", turn: 180 },
    ].map((s) => ({
      label: s.label,
      dress: { helm: "helm_suttonhoo" },
      turn: s.turn,
    })),
  },
  // The head with nothing on it, turned. Every other sheet here photographs a
  // *product* — a helm, a beard, a colour — and judges the head by implication,
  // which is how five passes in a row corrected a list of features on an object
  // nobody had looked at square. `docs/SUTTON-HOO.md` is about this exact
  // failure.
  //
  // Profile is the panel that earns it. A beak, a receding chin and a long skull
  // are all *silhouette* faults and all three are nearly invisible at the
  // three-quarter bearing every other sheet uses; the owner's five notes came off
  // a capture where the profile was the one thing on screen. Front-on is where
  // the breadth of the jaw against the cheekbone and the neck against both of
  // them can be read, and 180° is the only check on the cranial length now that
  // the occiput has moved.
  headturn: {
    file: "head-turn.png", card: "facecard", cols: 4,
    title: "THE HEAD ITSELF · bare · the rig is fixed and the man turns · profile is the honest panel",
    shots: [
      { label: "front 0°", turn: 0 },
      { label: "three-quarter −35°", turn: QUARTER },
      { label: "profile −90°", turn: -90 },
      { label: "back 180°", turn: 180 },
    ].map((s) => ({
      label: s.label,
      dress: { helm: "helm_none", hair: "hair_shaved", beard: "beard_none", warPaint: "wp_none" },
      turn: s.turn,
    })),
  },
  headturnfight: {
    file: "head-turn-fight.png", card: "fightcard", cols: 4,
    title: "THE HEAD ITSELF · at fight distance · the lens the player actually spends the match behind",
    shots: [
      { label: "front 0°", turn: 0 },
      { label: "three-quarter −35°", turn: QUARTER },
      { label: "profile −90°", turn: -90 },
      { label: "back 180°", turn: 180 },
    ].map((s) => ({
      label: s.label,
      dress: { helm: "helm_none", hair: "hair_shaved", beard: "beard_none", warPaint: "wp_none" },
      turn: s.turn,
    })),
  },
  // ---- hair (4) ----
  // Three rows because a hairstyle has three separate ways to fail: it can be
  // dull from the front, it can be nothing from behind (which is where a braid
  // actually hangs, and where nobody has ever looked at one), or it can be
  // swallowed whole by a helmet. The third row is the Sutton Hoo mask, which is
  // the hardest case in the shop and the newest — every hairstyle predates it.
  hair: {
    file: "hair.png", card: "facecard", slot: "hair", cols: 4,
    title: "HAIR · three-quarter, from behind, and under the face mask that came after it",
    rows: [
      { turn: QUARTER, tag: "3/4" },
      { turn: 180, tag: "back" },
      { turn: QUARTER, tag: "under mask", dress: { helm: "helm_suttonhoo" } },
      // AND UNDER AN OPEN HELM, WHICH IS NINE OF THE TEN RUNGS AND WAS NEVER SHOT.
      //
      // The sheet had a bare row, a back row and the mask — the hardest case —
      // and nothing at all between them. The owner reported the Long Mane under
      // a plain helmet as "2 side front long strands of hair" and every capture
      // this repository owns was of a head that was either bare or masked, so
      // there was no frame in `art/` that could have shown it. A row for the
      // ordinary case is worth more than a row for the extreme one.
      { turn: QUARTER, tag: "under an open helm", dress: { helm: "helm_iron" } },
    ],
  },
  hairfight: {
    file: "hair-fight.png", card: "fightcard", slot: "hair", cols: 4,
    title: "HAIR · at fight distance · three-quarter and from behind",
    rows: [{ turn: QUARTER, tag: "3/4" }, { turn: 180, tag: "back" }],
  },
  // ---- hairColor (6) ----
  // Six hex values. They cannot differ in silhouette by construction, so the
  // staging must not pretend they are shapes: same head, same light, same
  // hairstyle — the longest one in the shop, so the colour has some area to be a
  // colour over — and the six panels differ in nothing else. Whether three of
  // these are worth 30–40 gold is a design question the frames can inform and
  // cannot settle.
  hairtone: {
    file: "hair-colour.png", card: "facecard", slot: "hairColor", cols: 6,
    title: "HAIR COLOUR · pure colour, on the Long Mane, under the arena's own light",
    rows: [{ turn: QUARTER, dress: { hair: "hair_long" } }],
  },
  // ---- beard (5) ----
  beards: {
    file: "beards.png", card: "facecard", slot: "beard", cols: 5,
    title: "BEARDS · three-quarter and profile · a fork and a ringed braid are side-on shapes",
    rows: [{ turn: QUARTER, tag: "3/4" }, { turn: -90, tag: "profile" }],
  },
  beardfight: {
    file: "beards-fight.png", card: "fightcard", slot: "beard", cols: 5,
    title: "BEARDS · at fight distance · three-quarter",
    rows: [{ turn: QUARTER }],
  },
  // ---- beardColor (6) ----
  beardtone: {
    file: "beard-colour.png", card: "facecard", slot: "beardColor", cols: 6,
    title: "BEARD COLOUR · pure colour, on the Full Beard, under the arena's own light",
    rows: [{ turn: QUARTER, dress: { beard: "beard_full" } }],
  },
  // ---- cloak (5) ----
  // A cloak cannot be judged from the front — it hangs down the back and its
  // known defect (it gathers through the tunic) is at the waist — so the back
  // row is the real one and the front row is there to show what an opponent
  // actually sees. Whole body: this is the one slot in the shop that is not worn
  // on the head, and it is the largest silhouette change a player can buy.
  cloaks: {
    file: "cloaks.png", card: "kitcard", slot: "cloak", cols: 5,
    title: "CLOAKS · full body · from behind, where a cloak is, and from the front, where an opponent is",
    rows: [{ turn: 180, tag: "back" }, { turn: QUARTER, tag: "3/4" }],
  },
  cloakfight: {
    file: "cloaks-fight.png", card: "fightcard", slot: "cloak", cols: 5,
    title: "CLOAKS · at fight distance · from behind (a chase) and three-quarter (a fight)",
    rows: [{ turn: 180, tag: "back" }, { turn: QUARTER, tag: "3/4" }],
  },
  // ---- armor (7) ----
  // Seven tints on the largest surface a warrior carries, up to 510 gold, and two
  // of them are named for a material change — "Bronze Scales", "Crimson
  // Warplate" — that a tint cannot deliver. The full-body card is the honest
  // frame for that claim: it shows how much of the man the finish actually
  // covers once mail, wool and leather have taken their share.
  finishes: {
    file: "armour-finish.png", card: "kitcard", slot: "armor", cols: 7,
    title: "ARMOUR FINISH · pure colour on the largest surface in the game · full body, three-quarter",
    rows: [{ turn: QUARTER }],
  },
  finishfight: {
    file: "armour-finish-fight.png", card: "fightcard", slot: "armor", cols: 7,
    title: "ARMOUR FINISH · at fight distance · the reading that decides whether a 510-gold finish is visible at all",
    rows: [{ turn: QUARTER }],
  },
  // ---- armour finish, ACROSS THE ROSTER ----
  //
  // THE SHEET THE AUDIT NEEDED AND DID NOT HAVE, and the reason it did not is
  // that `panelsFor` could vary a slot and a bearing but not a man. Every sheet
  // above photographs the huscarl, and the huscarl is the one class the old
  // finish was visible on — he is covered in mail, and mail was the only thing
  // `ap.armorColor` touched.
  //
  // That is exactly how the shop got to a state where the owner could buy a
  // finish and see nothing: the instrument could not see the failure either. The
  // runekeeper's torso layer is leather and the berserker's is bare skin, so a
  // slot sold to all four classes had never been rendered on two of them.
  //
  // Four rows, one per class, seven finishes across. A finish that does not
  // change a row is a finish that class cannot buy, and now it says so in one
  // picture. Fight distance, because that is where the money has to be visible.
  finishroster: {
    file: "armour-finish-roster.png", card: "fightcard", slot: "armor", cols: 7,
    title: "ARMOUR FINISH × CLASS · does the money move on the men who wear no mail? · fight distance",
    rows: [
      { turn: QUARTER, tag: "huscarl", cls: "huscarl" },
      { turn: QUARTER, tag: "warden", cls: "warden" },
      { turn: QUARTER, tag: "runekeeper", cls: "runekeeper" },
      { turn: QUARTER, tag: "berserker", cls: "berserker" },
    ],
  },
  // ---- warPaint (4) ----
  // The smallest slot and the one most likely to vanish under a helmet — and the
  // shop now sells a helmet that is entirely face. Front on, because paint is
  // painted on the front of a face; second row under the mask, because that is
  // the question.
  warpaint: {
    file: "warpaint.png", card: "facecard", slot: "warPaint", cols: 4,
    title: "WAR PAINT · bare-headed and under the Sutton Hoo mask · front, 0°",
    rows: [
      { turn: 0, tag: "bare" },
      { turn: 0, tag: "under mask", dress: { helm: "helm_suttonhoo" } },
    ],
  },
  warpaintfight: {
    file: "warpaint-fight.png", card: "fightcard", slot: "warPaint", cols: 4,
    title: "WAR PAINT · at fight distance · front, 0°",
    rows: [{ turn: 0 }],
  },
  // ---- the four peoples, turned (4) ----
  //
  // ONE SHEET PER CLASS, AND THE MAN TURNS. `docs/PROCESS.md` R5, and the
  // reason is in this feature's own history rather than in the rule: three
  // rounds running, the thing that refuted the build was at a bearing nobody
  // had shot. Round one's entire "after" set was five front-on turn-0 huscarl
  // cards — one bearing, one class, one pose — and all three of the defects
  // that survived it lived outside that frame. The Saxon blow-out is at the
  // FRONT and the three-quarter; the Danelaw's rose was on the linen sleeves
  // and the leg wraps, which are what a PROFILE and a BACK show you.
  //
  // Front, profile and back, at the lens the player spends the whole match
  // behind, and the same three for every one of the four classes — because the
  // huscarl is the only man in the game with a shield, and the shield is the
  // largest flat field a people paints.
  ...Object.fromEntries(["huscarl", "warden", "runekeeper", "berserker"].map((cls) => [`faction${cls}`, {
    file: `faction-${cls}.png`, card: "fightcard", cols: 3,
    title: `THE FOUR PEOPLES · ${cls} · front, profile, back · fight distance, the arena's own light`,
    shots: ["saxon", "norse", "briton", "pict"].flatMap((people) =>
      [["front 0°", 0], ["profile 90°", 90], ["back 180°", 180]].map(([label, turn]) => ({
        label: `${people} · ${label}`, turn, cls, dress: { people },
      }))),
  }])),
  // ---- the four peoples, at PORTRAIT size (2) ----
  //
  // THE SAME MEN, CLOSE ENOUGH TO NAME THE COLOUR. `fightcard` above is the
  // honest scale and it is the scale the defect has to be judged at; it is NOT
  // a scale you can read a HUE off, because at 6.8 m a sleeve is nine pixels
  // wide and every one of them is part sleeve and part grass. The Danelaw's
  // rose was reported off a portrait and measured off a portrait, and the
  // before/after has to be shot at the size the report was made at or it is
  // answering a different question.
  //
  // TWO CLASSES AND NOT FOUR, and the choice is by SURFACE rather than by
  // preference — `kitcard` is 700x900 against `fightcard`'s 520x320, so each of
  // these frames costs about two and a half of those, and the four peoples at
  // three bearings on four classes would be an hour of wall clock for pictures
  // of the same six surfaces:
  //
  //   huscarl    the only man with a BYRNIE and the only man with a SHIELD —
  //              `metal` over the largest area on the roster, and the board.
  //   berserker   bare limbs and the most `wrap` and `linen` showing of the
  //              four — the two surfaces the rose was actually reported on.
  //
  // The warden's and the runekeeper's surfaces are the union of those two, and
  // all four classes are still shot at fight scale above.
  // ---- THE UNSWORN CONTROL (1) ----
  //
  // THE SAME MEN, SWORN TO NOBODY, ON THE SAME MARK UNDER THE SAME FIRE.
  //
  // This is here because the first after-set refuted the ruler rather than the
  // fix. `tools/lib/roseband.mjs` takes its chroma floor from `0xc2b69c`, the
  // undyed linen shirt, at C* 14.8 — and that is an ALBEDO number applied to a
  // LIT pixel. The arena's key is a bonfire. It puts about eleven points of
  // WARM chroma into any near-neutral surface it falls on, so bare iron in this
  // scene renders at C* 16 on the red arc whatever anybody swore to.
  //
  // The other three peoples cannot show that, and that is the trap: their kit
  // is weld, moss and woad, so the fire lands them at hue 81°, 150° and 200° —
  // OFF the arc — and they read the floor no matter how bright they get. Only a
  // man in plain iron and plain linen lands where a Dane in plain iron and plain
  // linen lands. He is the control, and without him the band cannot tell the
  // bonfire from the dye.
  //
  // `people=none` is byte-for-byte what `buildCharacter` did before the livery
  // existed — `factionWorn` returns the hex by identity — so this row is also
  // the pre-feature game, and it is a valid floor for the before set and the
  // after set both.
  ...Object.fromEntries(["huscarl", "berserker"].map((cls) => [`factionunsworn${cls}`, {
    file: `faction-unsworn-${cls}.png`, card: "fightcard", cols: 3,
    title: `THE UNSWORN · ${cls} · front, profile, back · fight distance, the arena's own light`,
    shots: [["front 0°", 0], ["profile 90°", 90], ["back 180°", 180]].map(([label, turn]) => ({
      label: `unsworn · ${label}`, turn, cls, dress: { people: "none" },
    })),
  }])),
  // ---- the shop, under a livery (5) ----
  //
  // THE SHEET THE LAST ROUND NEEDED AND DID NOT HAVE. Every faction sheet above
  // this one passes `dress: { people }` and NOTHING ELSE, so every one of them
  // photographs `defaultAppearance`'s issued Rough Iron. The livery is applied
  // to SEVEN finishes and the after-set had pictures of one of them — and the
  // defect that survived the round lived on Crimson Warplate, 130 gold: the
  // Danelaw's byrnie read 46.6% of the crop inside the rose band at the
  // profile, modal `#c76b68`, while `factionread` §7 was green about a man in
  // iron and this file had no frame that could contradict it.
  //
  // Seven finishes across, three bearings down, one people per sheet, and the
  // UNSWORN row is a sheet of its own for the reason `factionunsworn*` already
  // gives: the band's chroma floor is an albedo number in a lit scene, and only
  // a man in the SAME KIT sworn to nobody is a floor for it. Shoot
  // `factionshopunsworn` beside whichever people you are grading.
  ...Object.fromEntries([["saxon", "saxon"], ["norse", "norse"], ["briton", "briton"], ["pict", "pict"], ["unsworn", "none"]]
    .map(([tag, people]) => [`factionshop${tag}`, {
      file: `faction-shop-${tag}.png`, card: "fightcard", slot: "armor", cols: 7,
      title: `THE SHOP UNDER A LIVERY · ${tag} · seven finishes across, front/profile/back down · fight distance, the arena's own light`,
      rows: [
        { turn: 0, tag: "front", dress: { people } },
        { turn: 90, tag: "profile", dress: { people } },
        { turn: 180, tag: "back", dress: { people } },
      ],
    }])),
  ...Object.fromEntries(["huscarl", "berserker"].map((cls) => [`factionclose${cls}`, {
    file: `faction-close-${cls}.png`, card: "kitcard", cols: 3,
    title: `THE FOUR PEOPLES · ${cls} · front, profile, back · PORTRAIT scale, the arena's own light`,
    shots: ["saxon", "norse", "briton", "pict"].flatMap((people) =>
      [["front 0°", 0], ["profile 90°", 90], ["back 180°", 180]].map(([label, turn]) => ({
        label: `${people} · ${label}`, turn, cls, dress: { people },
      }))),
  }])),
};
const SHEET_NAMES = Object.keys(SHEETS);

/**
 * Named runs. `armoury` is the whole audit in the order the shop lists the
 * slots; `armouryfight` is only the fight-distance half, which is the cheap pass
 * and the one that answers whether any of this is visible in play at all.
 */
const GROUPS = {
  armoury: SHEET_NAMES,
  // The livery review, in ONE server boot: four classes x four peoples x
  // front/profile/back at fight scale, and the huscarl and the berserker again
  // at portrait scale. `node tools/shoot.mjs factionturn`. Both scales are in
  // the one group on purpose — the 8.4 s first frame and the texture bake are
  // paid once, and a before/after whose two halves were shot in two sessions is
  // two exposures of one light rather than one measurement.
  // `factionshop*` is deliberately NOT in here: it is 105 panels against this
  // group's 60, and it varies the other axis. Shoot `factionshop` when the
  // question is what a vat did to a PURCHASE, `factionturn` when it is what a
  // vat did to a MAN.
  factionturn: SHEET_NAMES.filter((n) => n.startsWith("faction") && !n.startsWith("factionshop")),
  // The control on its own, for when only the floor needs re-measuring.
  factionfloor: SHEET_NAMES.filter((n) => n.startsWith("factionunsworn") || n === "factionshopunsworn"),
  // The SHOP under every livery, plus its own unsworn floor. `node tools/shoot.mjs
  // factionshop`. This is the axis `factionturn` does not have: it varies the
  // finish and holds the class, where `factionturn` varies the class and holds
  // the finish at whatever a man is issued.
  factionshop: SHEET_NAMES.filter((n) => n.startsWith("factionshop")),
  armouryfight: SHEET_NAMES.filter((n) => SHEETS[n].card === "fightcard"),
};
const GROUP_NAMES = Object.keys(GROUPS);

/**
 * Fills a sheet's plan out of the shop's own roster.
 *
 * Every panel is a query the page can refuse: options go over as shop IDs, and
 * what comes back is checked against the VALUE the page says it built the
 * warrior from. A sheet cannot quietly photograph the wrong thing, and — more to
 * the point — it cannot quietly photograph nine of ten things when the shop has
 * eleven.
 */
function panelsFor(name, spec, roster) {
  const valueOf = (slot, id) => {
    // `people` is not a purchase and has no armoury row — nobody buys a people.
    // It still rides in `dress` because `dress` is "what the page is asked to
    // restage this panel with", and it is still CHECKED, because the page
    // publishes it on `__shotSubject` like everything else. A sheet that
    // silently photographed the wrong livery is exactly the failure the
    // `expect` machinery exists to prevent.
    if (slot === "people") return id;
    const opt = roster.slots.find((s) => s.slot === slot)?.options.find((o) => o.id === id);
    if (!opt) throw new Error(`[shoot] sheet "${name}" dresses ${slot} in "${id}", which is not in the armoury`);
    return opt.value;
  };
  const dressOf = (dress) => Object.entries(dress ?? {});
  // `cls` is not a slot and is deliberately kept out of `dress`: it is not
  // something a player buys, and `expect` checks purchases against what the page
  // says it built. It rides on the query only, and the card presets have read
  // `?cls=` since they were written.
  const panel = (label, turn, dress, extra, cls) => ({
    label,
    query: [`preset=${spec.card}`, `turn=${turn}`, ...(cls ? [`cls=${cls}`] : []),
      ...dressOf(dress).map(([s, id]) => `${s}=${id}`),
      ...(extra ? [`${extra.slot}=${extra.id}`] : [])].join("&"),
    expect: {
      turn,
      ...Object.fromEntries(dressOf(dress).map(([s, id]) => [s, valueOf(s, id)])),
      ...(extra ? { [extra.slot]: valueOf(extra.slot, extra.id) } : {}),
    },
  });

  if (spec.shots) return spec.shots.map((s) => panel(s.label, s.turn, s.dress, undefined, s.cls));

  const slot = roster.slots.find((s) => s.slot === spec.slot);
  if (!slot) throw new Error(`[shoot] sheet "${name}" wants slot "${spec.slot}", which the armoury does not have`);
  return spec.rows.flatMap((row) =>
    slot.options.map((o, i) =>
      // The price rides on the panel. "Is it worth the gold" is one of the five
      // questions the audit has to answer per option, and it cannot be answered
      // by flicking between pictures if the numbers are in another file.
      panel(`${i + 1}. ${o.label} · ${o.cost}g${row.tag ? ` · ${row.tag}` : ""}`, row.turn, row.dress, { slot: spec.slot, id: o.id }, row.cls),
    ),
  );
}

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const OUT = resolve(ROOT, flag("out", "art/shots"));
const WIDTH = parseInt(flag("w", "1600"), 10);
const HEIGHT = parseInt(flag("h", "900"), 10);
// Derive a per-process port so concurrent captures don't fight over one.
const PORT = parseInt(flag("port", String(3100 + (process.pid % 700))), 10);
const CLEAN = has("hud") ? "0" : "1";
// `localhost`, not `127.0.0.1`, and this is not cosmetic. Next 16 refuses to
// serve dev resources to an origin it does not recognise, and the loopback
// literal is not one of them: `/_next/webpack-hmr` comes back blocked, the HMR
// socket handshake fails, and Next's dev client answers a dead socket by
// full-reloading the page — forever. The renderer never gets far enough to
// mount a canvas, so every dev-mode capture is a blank frame, and the tool
// dutifully reports BLANK FRAME without ever saying why. It stayed hidden
// because a production build was always lying around and the fallback was
// never the path anyone took; the first time it was, it cost a capture run.
// Change this back and the dev fallback is decoration.
const ORIGIN = `http://localhost:${PORT}`;
// What a single card may be dressed in from the command line. Same names the
// page reads off the query string, so there is one vocabulary for the shop and
// not a translation layer to get wrong.
// `people` is in this list and is NOT an armoury slot — nobody buys a people.
// It rides here because everything in this list is "a thing the card can be
// restaged with from the command line", which is what the flag machinery below
// actually does with it, and because `npm run shots -- fightcard --people norse`
// is the whole of how the four peoples get photographed.
const SLOT_FLAGS = ["helm", "hair", "hairColor", "beard", "beardColor", "cloak", "armor", "warPaint", "people", "cls", "turn"];
// A misspelled preset used to fall through to "no presets named" and quietly
// shoot the whole default set — twenty minutes of the wrong pictures. Name
// which words are flag values so anything left over can be called out.
const VALUE_FLAGS = new Set(["out", "w", "h", "port", "settle", "quality", "ground", ...SLOT_FLAGS]);
const eaten = new Set();
argv.forEach((a, i) => {
  if (!a.startsWith("--")) return;
  eaten.add(i);
  // `--turn -90` reads as a flag with a missing value unless the negative number
  // is claimed here; without this the run dies on "not a preset: -90".
  if (VALUE_FLAGS.has(a.slice(2)) && argv[i + 1] !== undefined) eaten.add(i + 1);
});
const words = argv.filter((a, i) => !eaten.has(i));
const known = (a) => ALL_PRESETS.includes(a) || EXTRA_PRESETS.includes(a)
  || CARD_PRESETS.includes(a) || SHEET_NAMES.includes(a) || GROUP_NAMES.includes(a);
const stray = words.filter((a) => !known(a));
if (stray.length) {
  console.error(`[shoot] not a preset, sheet or group: ${stray.join(", ")}`);
  console.error(`[shoot] presets: ${[...ALL_PRESETS, ...EXTRA_PRESETS, ...CARD_PRESETS].join(" ")}`);
  console.error(`[shoot] sheets:  ${SHEET_NAMES.join(" ")}`);
  console.error(`[shoot] groups:  ${GROUP_NAMES.join(" ")}`);
  process.exit(2);
}
// Groups expand in place, and a name asked for twice is only shot once — an
// audit run of two hours must not spend twenty minutes of it on a duplicate.
const TARGETS = [...new Set((words.length ? words : ALL_PRESETS).flatMap((w) => GROUPS[w] ?? [w]))];

mkdirSync(OUT, { recursive: true });

function waitForServer(url, timeoutMs = 180000) {
  const started = Date.now();
  return new Promise((ok, fail) => {
    const poll = async () => {
      try {
        const r = await fetch(url);
        if (r.ok || r.status === 404) return ok();
      } catch { /* not up yet */ }
      if (Date.now() - started > timeoutMs) return fail(new Error(`server never came up at ${url}`));
      setTimeout(poll, 700);
    };
    poll();
  });
}

/**
 * Newest mtime under the directories a rendered frame depends on.
 *
 * A production build is a photograph of the source at the moment it was made,
 * and this tool prefers one whenever it finds a BUILD_ID — so a capture run
 * after an edit and before a rebuild reviews the *previous* commit's art and
 * says nothing about it. That is not a hypothetical: it is the same class of
 * silent-wrong-answer as the lineup this file's sheets replaced.
 */
function newestSourceMtime() {
  let newest = 0;
  for (const dir of ["src", "public"]) {
    const root = resolve(ROOT, dir);
    if (!existsSync(root)) continue;
    for (const e of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!e.isFile()) continue;
      const m = statSync(join(e.parentPath ?? e.path, e.name)).mtimeMs;
      if (m > newest) newest = m;
    }
  }
  return newest;
}

let server;
async function startServer() {
  const buildId = resolve(ROOT, ".next/BUILD_ID");
  let useProd = existsSync(buildId) && !has("dev");
  if (useProd) {
    const built = statSync(buildId).mtimeMs;
    const edited = newestSourceMtime();
    if (edited > built) {
      const mins = ((edited - built) / 60000).toFixed(1);
      console.log(`[shoot] .next is ${mins} min older than src/ — falling back to dev so the shots are of the code on disk`);
      console.log("[shoot] (run `npm run build` first for a faster, production-accurate capture)");
      useProd = false;
    }
  }
  const script = useProd ? "custom-server.mjs" : "dev-server.mjs";
  console.log(`[shoot] starting ${script} on :${PORT}`);
  server = spawn("node", [script], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.env.SHOOT_VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.SHOOT_VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer(`${ORIGIN}/api/health`);
  console.log("[shoot] server up");
}

function stopServer() {
  if (server && !server.killed) server.kill("SIGTERM");
}

const report = [];

/**
 * A virtual clock, installed before a line of app code runs.
 *
 * The renderer takes its time from `performance.now()` and its dt from the
 * rAF timestamp, so on this box every capture was photographed at a wall-clock
 * instant — and `idleLayer` in anim.ts puts a standing man on a 15-second weight
 * shift: the pelvis translates 35 mm, the chest rolls 0.075 rad and yaws 0.05,
 * which swings the HEAD through something like 180 mm side to side. A card takes
 * 80–100 s to settle on a GPU-less box and that varies by tens of seconds
 * between panels, so every panel of every sheet caught the man at a different
 * point in that shift.
 *
 * That is not a framing nit. It means two panels of the SAME helmet differ in
 * lean by more than two different helmets do at the same lean — the sheet's one
 * promise, that only the thing under test changes, was not being kept. It also
 * means no constant can aim a card at the head, which is why the last turntable
 * was corrected by eye, corrected the wrong way, and shipped with the front
 * panel's head half off the left edge.
 *
 * So the clock is ours. Every presented frame advances time by exactly one
 * 50 ms step — the same cap the renderer already applies to dt — and the pose is
 * then a function of the frame count alone. Two consequences worth knowing:
 *
 *   - a preset's `settle` is now exactly `frames × 0.05 s` of simulation rather
 *     than approximately so, which is what the gore presets have always claimed;
 *   - `--settle` changes the POSE, not just how long the lerps have had. Panels
 *     shot at different settles are not comparable, and sheets never mix them.
 *
 * What this does NOT buy is a byte-reproducible frame: `vfx.ts` rolls its embers
 * and sparks off `Math.random`, so two captures of one subject differ in the
 * background by a few thousandths of a code value. Measured on a Sutton Hoo
 * fight card shot twice: mean luma 67.6705 against 67.6679. The pose is the
 * claim, and the pose is exact.
 */
const FRAME_MS = 50;
function installVirtualClock(stepMs) {
  const realRaf = window.requestAnimationFrame.bind(window);
  let vnow = 0;
  let queue = [];
  let scheduled = false;
  let nextId = 1;
  const cancelled = new Set();
  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    queue.push({ id, cb });
    if (!scheduled) {
      scheduled = true;
      realRaf(() => {
        scheduled = false;
        // One virtual step per REAL presented frame, so the clock cannot run
        // ahead of the pictures: everything scheduled for this frame sees the
        // same timestamp, which is what rAF itself promises.
        vnow += stepMs;
        const batch = queue;
        queue = [];
        for (const item of batch) if (!cancelled.has(item.id)) item.cb(vnow);
      });
    }
    return id;
  };
  window.cancelAnimationFrame = (id) => { cancelled.add(id); };
  performance.now = () => vnow;
}

async function main() {
  await startServer();

  // Use the pre-installed full Chromium (it has the GL stack the
  // headless shell lacks) rather than letting Playwright download one.
  const preinstalled = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: [
      // Software GL so WebGL works on a headless box with no GPU.
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-gpu-sandbox",
      "--no-sandbox",
      "--ignore-gpu-blocklist",
    ],
  });

  const newContext = async (w, h) => {
    const c = await browser.newContext({
      viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: "no-preference",
    });
    await c.addInitScript(installVirtualClock, FRAME_MS);
    return c;
  };

  // One context per viewport size, reused. A card is not 1600×900 — it is a
  // tall crop of a head — and the panels have to come out of the renderer at
  // the size the sheet lays them down at, because resampling a 3D frame is
  // exactly how a crest ridge turns back into three grey pixels.
  const contexts = new Map([[`${WIDTH}x${HEIGHT}`, await newContext(WIDTH, HEIGHT)]]);
  const ctxFor = async (w, h) => {
    const key = `${w}x${h}`;
    if (!contexts.has(key)) contexts.set(key, await newContext(w, h));
    return contexts.get(key);
  };

  /**
   * One capture: drive /shot with `query`, wait for the settle, write a PNG,
   * and measure it. Returns the report row plus the raw buffer, because a sheet
   * needs the pixels and does not want to read them back off disk.
   */
  async function capture({ key, query, file, w, h, expect }) {
    const page = await (await ctxFor(w, h)).newPage();
    // Photo mode has no live match, so the game transport failing to connect
    // is expected. Only surface errors that indicate a broken scene.
    const IGNORE = [
      /ERR_CONNECTION_RESET/, /favicon/, /404 \(Not Found\)/,
      /webpack-hmr/, /EventSource/, /\/api\/game\//,
    ];
    const errors = [];
    const note = (text) => { if (!IGNORE.some((r) => r.test(text))) errors.push(text); };
    page.on("console", (m) => { if (m.type() === "error") note(m.text()); });
    page.on("pageerror", (e) => note(String(e)));

    const settle = flag("settle", null);
    // `--revive` runs the preset, then puts the dead back on their feet and
    // captures that instead. On a gore preset it is the respawn check: a body
    // that came apart has to go back together, and this is the only way to look
    // at the result rather than argue about it.
    // `--quality low|medium|high` pins the tier the page resolves, so one head
    // can be photographed at the tier a phone actually gets AND at the tier a
    // desktop gets. Without it a capture is always whatever `detectTier` makes
    // of a headless box, and docs/PLATFORMS.md wants a frame from each.
    const quality = flag("quality", null);
    const url = `${ORIGIN}/shot?${query}&clean=${CLEAN}`
      + (settle ? `&settle=${settle}` : "")
      + (quality ? `&quality=${quality}` : "")
      // `--ground pict_moor`. Every preset can be shot on any ground now that
      // there is more than one; without it the only place anybody can
      // photograph is the village, and a ground nobody can photograph is a
      // ground nobody can judge.
      + (flag("ground", null) ? `&ground=${flag("ground", null)}` : "")
      + (has("revive") ? "&revive=1" : "");
    console.log(`[shoot] ${key} -> ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300000 });

    // Wait for the renderer to signal it has settled. The budget is generous
    // because this box has no GPU: the full post chain through SwiftShader is
    // ~1 s a frame, and the settle is 60 of them plus procedural texture
    // generation on top. `__shotError` is the other way out: the page refusing
    // a stage it was asked for, which must not cost a five-minute timeout.
    let ready = true;
    try {
      await page.waitForFunction(
        () => window.__shotReady === true || typeof window.__shotError === "string",
        null, { timeout: 300000 },
      );
    } catch {
      ready = false;
      errors.push("renderer never signalled __shotReady (scene may have failed to build)");
    }

    // What the page says it actually staged, checked against what was asked
    // for. Without this a mistyped helm renders a bare head in silence and the
    // sheet files it under the name the tool meant — a panel that reads as "this
    // rung adds nothing", which is the most expensive wrong answer this harness
    // can produce, and the one it has already produced once.
    const staged = await page.evaluate(() => ({
      subject: window.__shotSubject ?? null,
      refused: window.__shotError ?? null,
    }));
    if (staged.refused) { ready = false; errors.push(`page refused the stage: ${staged.refused}`); }
    if (expect) {
      if (!staged.subject) errors.push("preset published no __shotSubject — is it `parametric`?");
      else {
        // Checked slot by slot against what the page says it built the warrior
        // from — not against the query string it was handed. An option resolved
        // to the wrong value, or a slot the sheet forgot to pin, both show up
        // here as a named mismatch rather than as a panel nobody can explain.
        for (const [k, v] of Object.entries(expect)) {
          if (String(staged.subject[k]) !== String(v)) {
            errors.push(`asked for ${k}=${v}, got ${k}=${staged.subject[k]}`);
          }
        }
      }
    }

    // How long the settle actually took. A gore preset names an instant in a
    // death in frames and converts at the renderer's 0.05 s dt cap; if a frame
    // here is faster than that, the shot is of an earlier instant than the
    // preset asked for and the pose review is measuring the wrong moment.
    const clock = await page.evaluate(() => ({
      frames: window.__shotFrames ?? 0,
      msPerFrame: window.__shotMsPerFrame ?? 0,
    }));

    // Playwright's screenshot budget defaults to 30 s, which was never a
    // deliberate choice here and is the one budget in this file that was not
    // sized against a GPU-less box. It forces a fresh paint, so it costs a whole
    // frame — and `brawl` is now well past 30 s a frame, because the bonfire
    // beam became a second shadow-casting light and eight warriors are rendered
    // into its map as well as the key's. That failed the entire capture at the
    // fourth preset with three good PNGs already on disk. Same budget as the
    // settle wait above; it is a ceiling, not a delay.
    const buf = await page.screenshot({ path: file, timeout: 300000 });

    // A dead-black frame means the scene never rendered — catch it here
    // rather than letting a critic agent review an empty image. Measure the
    // captured PNG, not the live canvas: a WebGL canvas without
    // preserveDrawingBuffer reads back black outside its own frame.
    const stats = await page.evaluate(async (b64) => {
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = "data:image/png;base64," + b64; });
      const g = document.createElement("canvas");
      g.width = 160; g.height = 90;
      const cx = g.getContext("2d");
      cx.drawImage(img, 0, 0, 160, 90);
      const d = cx.getImageData(0, 0, 160, 90).data;
      let sum = 0, max = 0;
      // Spread of luma tells us the frame has actual content, not one flat fill.
      const hist = new Array(16).fill(0);
      for (let i = 0; i < d.length; i += 4) {
        const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
        sum += l; if (l > max) max = l;
        hist[Math.min(15, (l / 16) | 0)]++;
      }
      const n = d.length / 4;
      const occupied = hist.filter((h) => h > n * 0.002).length;
      return { ok: true, meanLuma: sum / n, maxLuma: max, tonalBuckets: occupied };
    }, buf.toString("base64"));

    const blank = stats.ok && stats.maxLuma < 8;
    // `subject` in the report, not only in the check: the report is the audit's
    // index, and a row that names every slot the warrior was wearing is what lets
    // a finding be traced back to an option rather than to a filename.
    const row = { preset: key, file, ready, blank, subject: staged.subject ?? undefined, ...clock, ...stats, errors: errors.slice(0, 8) };
    report.push(row);
    console.log(
      `[shoot] ${key}: ${blank ? "BLANK FRAME" : "ok"} ` +
      `meanLuma=${stats.meanLuma?.toFixed(1)} ` +
      `frames=${clock.frames}@${clock.msPerFrame.toFixed(0)}ms errors=${errors.length}`
    );
    await page.close();
    return { row, buf };
  }

  /**
   * Lays captured cards into one PNG, in a browser canvas so the tool stays on
   * the dependencies it already has — no image library, nothing to install, and
   * the same Chromium that drew the panels draws the sheet.
   *
   * Panels go down at 1:1. The sheet is large because the cards are, and that is
   * the point of it: a contact sheet that has to be resampled to be looked at is
   * the old cropped strip with extra steps. Every panel is also left on disk as
   * its own file, so the sheet is for the comparison and the card is for the
   * fitting.
   */
  async function buildSheet(name, spec, roster) {
    const size = roster.cards[spec.card];
    if (!size) throw new Error(`[shoot] sheet "${name}" wants card "${spec.card}", which /shot does not have`);
    const shots = panelsFor(name, spec, roster);
    const cards = [];
    for (const shot of shots) {
      const key = `${name}:${shot.label.replace(/[^\w.-]+/g, "_")}`;
      const file = resolve(cardDir, `${key.replace(":", "-")}.png`);
      const { row, buf } = await capture({ key, query: shot.query, file, w: size.w, h: size.h, expect: shot.expect });
      cards.push({ label: shot.label, b64: buf.toString("base64"), bad: row.blank || !row.ready || row.errors.length > 0 });
    }

    const page = await (await ctxFor(400, 300)).newPage();
    const dataUrl = await page.evaluate(async (arg) => {
      const { cards, cols, cardW, cardH, title } = arg;
      const GUT = 10, LABEL = 42, HEAD = 56;
      const rows = Math.ceil(cards.length / cols);
      const W = cols * cardW + (cols + 1) * GUT;
      const H = HEAD + rows * (cardH + LABEL) + (rows + 1) * GUT;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const x = c.getContext("2d");
      x.fillStyle = "#0e0f13"; x.fillRect(0, 0, W, H);
      x.textBaseline = "middle";
      x.fillStyle = "#c8cede";
      x.font = "600 26px ui-sans-serif, system-ui, sans-serif";
      x.fillText(title, GUT + 2, HEAD / 2);
      for (let i = 0; i < cards.length; i++) {
        const px = GUT + (i % cols) * (cardW + GUT);
        const py = HEAD + GUT + Math.floor(i / cols) * (cardH + LABEL + GUT);
        const img = new Image();
        await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = "data:image/png;base64," + cards[i].b64; });
        x.drawImage(img, px, py);
        x.strokeStyle = cards[i].bad ? "#c0392b" : "#2b3140";
        x.lineWidth = 2;
        x.strokeRect(px + 1, py + 1, cardW - 2, cardH - 2);
        x.fillStyle = cards[i].bad ? "#ff8a7a" : "#e7ebf2";
        x.font = "600 23px ui-sans-serif, system-ui, sans-serif";
        x.fillText(cards[i].label, px + 4, py + cardH + LABEL / 2);
      }
      return c.toDataURL("image/png");
    }, {
      cards, cols: spec.cols, cardW: size.w, cardH: size.h,
      // The lens is on the sheet, not only in this file. A reviewer looking at a
      // panel six months from now has to be able to tell whether he is looking at
      // a portrait or at fight distance without going and reading the harness.
      title: `${spec.title} · ${size.w}×${size.h} · ${size.note}`,
    });
    await page.close();

    const file = resolve(OUT, spec.file);
    writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
    console.log(`[shoot] sheet ${name} -> ${file} (${cards.length} panels)`);
    report.push({ preset: name, file, ready: true, blank: false, panels: cards.length, errors: [] });
  }

  /**
   * The shop, read off the page rather than kept here. See the note on the sheet
   * plan: a capture tool with its own copy of the catalogue reviews the
   * catalogue it was written against, which is how 37 of 47 purchasable options
   * went unlooked-at while a helmet sheet sat in this file.
   */
  async function loadRoster() {
    const page = await (await ctxFor(400, 300)).newPage();
    await page.goto(`${ORIGIN}/shot?roster=1`, { waitUntil: "domcontentloaded", timeout: 300000 });
    await page.waitForFunction(() => window.__shotRoster, null, { timeout: 300000 });
    const roster = await page.evaluate(() => window.__shotRoster);
    await page.close();
    const total = roster.slots.reduce((n, s) => n + s.options.length, 0);
    console.log(`[shoot] armoury: ${roster.slots.length} slots, ${total} options, cards ${Object.keys(roster.cards).join("/")}`);
    // Two ways the audit can fall behind the shop, both said out loud. A slot
    // with no sheet is 4-10 more things nobody has looked at, which is the exact
    // hole this pass was opened to fill; a slot /shot cannot dress is worse,
    // because no sheet CAN be written for it until the page is taught the field.
    const covered = new Set(SHEET_NAMES.map((n) => SHEETS[n].slot).filter(Boolean));
    const uncovered = roster.slots.filter((s) => !covered.has(s.slot)).map((s) => `${s.slot} (${s.options.length})`);
    if (uncovered.length) console.log(`[shoot] WARNING: armoury slots with no sheet: ${uncovered.join(", ")}`);
    if (roster.unmapped?.length) console.log(`[shoot] WARNING: /shot cannot dress: ${roster.unmapped.join(", ")}`);
    return roster;
  }

  /** One card, dressed from the command line. For iterating without a sheet. */
  function cardShot(name) {
    const dressed = SLOT_FLAGS.filter((f) => flag(f, null) !== null);
    const query = [`preset=${name}`, ...dressed.map((f) => `${f}=${flag(f, "")}`), ...(has("guides") ? ["guides=1"] : [])].join("&");
    const stem = [name, ...dressed.map((f) => `${f}${flag(f, "")}`)].join("-").replace(/[^\w.-]+/g, "_");
    return { query, file: resolve(OUT, `${stem}.png`) };
  }

  const cardDir = resolve(OUT, "cards");
  if (TARGETS.some((t) => SHEETS[t])) mkdirSync(cardDir, { recursive: true });
  const needsRoster = TARGETS.some((t) => SHEETS[t] || CARD_PRESETS.includes(t));
  const roster = needsRoster ? await loadRoster() : null;

  for (const target of TARGETS) {
    if (SHEETS[target]) await buildSheet(target, SHEETS[target], roster);
    else if (CARD_PRESETS.includes(target)) {
      const size = roster.cards[target];
      const { query, file } = cardShot(target);
      await capture({ key: target, query, file, w: size.w, h: size.h });
    } else await capture({ key: target, query: `preset=${target}`, file: resolve(OUT, `${target}.png`), w: WIDTH, h: HEIGHT });
  }

  await browser.close();
  writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));

  const bad = report.filter((r) => r.blank || !r.ready || r.errors.length);
  console.log(`\n[shoot] wrote ${report.length} shots to ${OUT}`);
  if (bad.length) {
    console.log("[shoot] PROBLEMS:");
    for (const b of bad) console.log(`  - ${b.preset}: ready=${b.ready} blank=${b.blank} ${b.errors.join(" | ")}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error("[shoot] failed:", e); process.exitCode = 1; })
  .finally(stopServer);

process.on("SIGINT", () => { stopServer(); process.exit(130); });
