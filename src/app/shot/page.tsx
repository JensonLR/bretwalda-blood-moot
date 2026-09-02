"use client";
// ============================================================
// PHOTO MODE — deterministic render harness for visual review.
//
// Renders the real GameCanvas against a synthetic room so the
// scene can be captured headlessly without running a match:
//
//   /shot?preset=duel&clean=1
//
// tools/shoot.mjs drives this route with Playwright and writes
// PNGs to art/shots/. Visual-critic agents read those PNGs.
//
// CONTRACT (renderer refactors must keep these working):
//   window.__photoCam    — camera yaw in radians, read by the renderer
//   window.__shotReady   — set true once N frames have been presented
//   window.__shotSubject — every appearance slot a parametric preset actually
//                          staged, so the tool can check it against what it
//                          asked for
//   window.__shotError   — set instead of __shotReady when the query string
//                          named something that does not exist
//   window.__shotRoster  — `?roster=1`: the shop's catalogue and this file's
//                          card sizes, so the capture tool builds its sheets
//                          from the armoury rather than from a copy of it
// ============================================================
import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import GameCanvas from "@/game/client/GameCanvas";
import type { GamePlayer, WarriorClass, PlayerState, AttackDirection, HitZone, MatchEndData } from "@/game/types";
import { WARRIOR_STATS } from "@/game/types";
import { ARMOURY, CARD_AIM, defaultAppearance, HELM_VALUES, type Appearance } from "@/game/client/characters";

/** Module-load stamp for staged kill-feed rows — see the killFeed note. */
const BOOT_TS = Date.now();
let searchCache: URLSearchParams | null = null;
const readSearchOnce = () => (searchCache ??= new URLSearchParams(window.location.search));
/** The viewport as an external store, invalidated by real resize events. */
let viewportCache: { w: number; h: number } | null = null;
const readViewport = () => {
  if (!viewportCache || viewportCache.w !== window.innerWidth || viewportCache.h !== window.innerHeight) {
    viewportCache = { w: window.innerWidth, h: window.innerHeight };
  }
  return viewportCache;
};
const subscribeResize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};

type Pose = {
  id: string;
  name: string;
  cls: WarriorClass;
  x: number;
  z: number;
  rot: number;
  state: PlayerState;
  dir?: AttackDirection;
  hp?: number;
  /** 0..1 through the attack animation; converted to attackTimer */
  swing?: number;
  /**
   * THE BOARD (SHIELD). Its integrity for the photograph — `?shield=0` stages a
   * burst board, `?shield=40` a cracked one — or undefined for the class's own
   * default (a whole board on a huscarl with one, null for everyone else).
   */
  shield?: number | null;
  /** A dead man's weapon in his hands (TAKE) — `?taken=cls:arms`. */
  taken?: { cls: WarriorClass; arms: string } | null;
  /** The killing blow, for staging a dismemberment. Only read when state is "dead". */
  zone?: HitZone;
  heavy?: boolean;
  /**
   * Id of the man who landed it. The fall and the throw both take their bearing
   * from the attacker's position, so without this a staged death topples
   * backwards along the renderer's default and the limb goes with it.
   */
  killer?: string;
  /**
   * The fire, staged. Three fields off the wire and nothing derived, because
   * that is exactly what the renderer is handed in a match — a preset that
   * worked out its own flame from a position would be photographing a code path
   * no player ever runs. `inside` is the difference between engulfed and
   * trailing; `timer` is seconds of `FIRE.linger` left.
   */
  burn?: { timer: number; inside?: boolean };
  /** A burn death carries no cut. Only read when state is "dead". */
  cause?: "blow" | "fire";
  /**
   * Overrides on top of the class default. Without this every pose in the file
   * wore `defaultAppearance(cls)`, so the shop could grow ten helmets and not
   * one of them could be looked at — the capture set could only ever review
   * what a warrior is issued, never what a player buys.
   */
  ap?: Partial<Appearance>;
};

/**
 * One camera for all three deaths, so the shots can be compared by flicking
 * between them. Wide and standing back: the first capture was framed like the
 * `stance` portrait and the head left the top of the picture, which reviewed as
 * "no head visible" when the truth was "no room". A death needs the air the
 * piece travels through in shot as much as it needs the body.
 */
const GORE_FRAMING: { position: [number, number, number]; target: [number, number, number]; fov: number } =
  { position: [-2.6, 2.6, 1.0], target: [-6.6, 1.1, 4.8], fov: 55 };

// ============================================================
// THE ARMOURY, STAGED
//
// Eight slots and 47 options, of which 37 had never been rendered for review
// once: every preset but the helmet rows dressed its men in
// `defaultAppearance(cls)`, so the capture set only ever reviewed what a warrior
// is ISSUED and never what a player BUYS.
//
// Three things are needed to close that, and all three are structural rather
// than a longer list of poses:
//
//   1. A preset has to be redressable in every slot from the query string, not
//      just in `helm`. That is `SLOT_FIELD` plus `resolveSlot` below.
//   2. The roster has to come from the shop. A capture tool holding its own copy
//      of the ladder is a tool that reviews last month's shop and says nothing
//      about it — which is how 37 options stayed unlooked-at while a helmet
//      sheet existed. `?roster=1` publishes `ARMOURY` itself.
//   3. Every panel has to be the same photograph but for the one thing under
//      test. That is the card marks below.
// ============================================================

/**
 * Query-string slot name -> the field it sets on `Appearance`. Keys are `ARMOURY`'s.
 *
 * `people` is deliberately excluded from the value type. It is a field of
 * `Appearance` but it is NOT an armoury slot — nobody buys a people, and
 * `resolveSlot` refuses anything that is not in the shop — so it is staged by
 * `?people=` further down and never through this table. Saying so in the type
 * is cheaper than a comment nobody reads: adding it here would not compile.
 */
const SLOT_FIELD: Record<string, Exclude<keyof Appearance, "people">> = {
  helm: "helm",
  hair: "hairStyle",
  hairColor: "hairColor",
  beard: "beardStyle",
  beardColor: "beardColor",
  cloak: "cloak",
  armor: "armorColor",
  warPaint: "warPaint",
  weapon: "weapon",
};

const slotOptions = (slot: string) => ARMOURY.find((s) => s.slot === slot)?.options ?? [];

/** A colour slot's value as the query string and the report both spell it. */
const hex = (v: number) => `0x${v.toString(16).padStart(6, "0")}`;
const spell = (v: string | number) => (typeof v === "number" ? hex(v) : v);

/**
 * One armoury option, from either its shop id (`hc_blond`) or its stored value
 * (`0xb8a14e`, `braids`). Null when the token is not in the shop at all — which
 * the caller turns into a refusal, because the alternative is what this whole
 * pass exists to stop: an unknown value builds a *default* warrior in silence,
 * and the sheet files that panel under the name the tool meant. "This rung adds
 * nothing" is the most expensive wrong answer this harness can produce.
 */
function resolveSlot(slot: string, token: string) {
  const opts = slotOptions(slot);
  return opts.find((o) => o.id === token) ?? opts.find((o) => spell(o.value) === token) ?? null;
}

/**
 * What every audit card wears in the seven slots it is not testing.
 *
 * Named by shop id rather than by value so it cannot drift from the catalogue:
 * Rough Iron has already been re-graded once, and a hard-coded 0x4a5568 here
 * would have quietly become "no finish selected" the day it moved.
 *
 * Bare-headed and cloakless on purpose. This is the neutral the slot under test
 * is added to — a helmet in the base dress would eat the hair sheet and the war
 * paint sheet both, which is exactly the failure the audit is looking for and
 * therefore has to be staged deliberately rather than inherited.
 */
const DRESS_IDS: Record<string, string> = {
  helm: "helm_none", hair: "hair_short", hairColor: "hc_brown",
  beard: "beard_short", beardColor: "bc_brown", cloak: "cloak_none",
  armor: "armor_iron", warPaint: "wp_none", weapon: "weapon_issued",
};

const AUDIT_DRESS: Partial<Appearance> = Object.fromEntries(
  Object.entries(DRESS_IDS).map(([slot, id]) => [SLOT_FIELD[slot], resolveSlot(slot, id)?.value]),
) as Partial<Appearance>;

// ---- The card marks -----------------------------------------------------
//
// One patch of grass, three lenses. Every card in the audit photographs the same
// warrior standing on the same spot, so the light on him is identical in every
// panel of every sheet by construction — not by a reviewer trusting that it is.
// The old ten-helmet strip stood the men in a ROW, which put each of them at a
// different bearing from the bonfire; comparing those panels was comparing ten
// exposures, and it produced a confident wrong verdict.
//
// What changes between cards is the lens and the back-off, because the three
// questions the rubric asks need three different distances:
//
//   face  — a brow, a braid, a paint stripe. ~400 px of head.
//   kit   — the whole man, for the slots worn on the body: cloak and finish.
//   fight — what a player actually sees, at the size he actually sees it.
//
// One caveat worth writing down: the grade meters each frame and stretches
// contrast about that frame's own pivot (see `adaptBand` in postfx.ts), so a
// framing change is a small exposure change. Within a sheet every panel is the
// same framing and the meter sees the same picture, so panels stay comparable.
// Across sheets — face against fight — they are two exposures of one light, and
// should be read as such.
const MARK = { x: -7.0, z: 4.6 };

/**
 * Where a card's subject actually is, in the WARRIOR's own frame: `right` is
 * screen-right when he faces the lens, `fwd` is toward it.
 *
 * The head is not on the body's axis. It has to be corrected for, and the
 * correction has to be carried in his frame rather than the world's, because
 * `?turn=` turns HIM: a fixed world offset is right at one bearing, wrong at the
 * next and backwards at 180°.
 *
 * The last attempt at this correction went in with the wrong sign and put the
 * front panel's head half off the left edge, and that is worth more than a note
 * about arithmetic — it was measured off a photograph of a man who was swaying.
 * Nothing here was measurable until the capture tool took the clock away from
 * the idle animation (`installVirtualClock` in tools/shoot.mjs). `right` is then
 * a straight read off a calibration frame — `--guides` draws a 50 mm grid at the
 * subject's own plane — and `fwd`, which does nothing head-on, is checked at
 * −90° where it becomes the lateral term.
 */
const AIM = CARD_AIM;

/**
 * A player's screen, as the reference the fight card is scaled against: 55° of
 * vertical field over 900 px, which is this capture set's own play frame and
 * close to a phone held upright.
 */
const PLAY = { fovDeg: 55, screenH: 900 };

/**
 * The lens that puts a subject on a card at the same pixels-per-metre a player
 * gets in a match.
 *
 * px/m at distance d is H / (2·d·tan(fov/2)), so matching H/tan(fov/2) matches
 * the scale at EVERY distance — the card is a 1:1 crop of the play frame rather
 * than a picture that merely looks about right. Getting this from a linear
 * fov·(h/H) would be 7% too big at these angles, and 7% is the difference
 * between an honest reading and a flattering one.
 */
const playScaleFov = (h: number) =>
  (2 * Math.atan((h / PLAY.screenH) * Math.tan((PLAY.fovDeg * Math.PI) / 360)) * 180) / Math.PI;

interface CardSpec {
  /** Panel size. The tool takes this from `?roster=1` so a card cannot be shot at the wrong scale. */
  w: number;
  h: number;
  /** Metres from the aim point to the lens, straight back along −z. */
  dist: number;
  /** Height of the aim point, and of the lens. */
  targetY: number;
  eyeY: number;
  fov: number;
  aim: keyof typeof AIM;
  note: string;
}

// Every card is framed to top out BELOW y ≈ 2.20 m, and that is a constraint
// rather than a coincidence. `hud3d` hangs a nameplate and health bar 260 mm
// over each warrior's crown, in the scene — it is geometry, not DOM, so
// `clean=1` does not touch it. The first fight card put "Raedwald" and a green
// bar squarely across the head, which is the one part of the frame a hair, a
// helm or a paint stripe is judged in. A card that reaches over the crown is
// photographing the HUD.
const CARDS: Record<string, CardSpec> = {
  // Crown to sternum: 0.70 m over 860 px. The helmet card this replaces was
  // 0.60 m and framed the helm alone, which is too tight for the slots that hang
  // BELOW a helmet — a ringed braid and a forked beard both leave that frame,
  // and a cosmetic photographed with its ends cropped off cannot be judged.
  facecard: { w: 700, h: 860, dist: 2.05, targetY: 1.76, eyeY: 1.94, fov: 19.5, aim: "head",
    note: "head and shoulders, ~400 px of head" },
  // The whole man with air around him. Cloak and finish are worn on the body and
  // the cloak's known defect (gathering through the tunic) is at the waist, so
  // this card is framed to the boots and not to the belt.
  kitcard: { w: 700, h: 900, dist: 5.2, targetY: 0.99, eyeY: 1.13, fov: 23.4, aim: "body",
    note: "full body, boots to a hand over the crown" },
  // Fight distance, honestly. The follow rig sits 4.4 m behind the local warrior
  // and 1.0 m to his sword side at 2.05 m of height, and a huscarl's blade bites
  // at 2.26 m centre to centre — so the man you are actually hitting is 6.8 m
  // from the lens. At that range he is ~230 px tall and his head is ~43 of them,
  // which is the pixel budget every cosmetic in the shop is really sold into.
  //
  // The lens sits at the follow rig's own height but aims lower than it does, to
  // get under the nameplate. That costs a little: a true crop of a play frame
  // would be off-axis and this is a small swing instead, and in play there IS a
  // plate over that head — reading a hairstyle at fight distance means reading it
  // around one. Scale is what this card exists to be honest about, and scale is
  // untouched by where it points.
  fightcard: { w: 520, h: 320, dist: 6.8, targetY: 0.88, eyeY: 2.05, fov: playScaleFov(320), aim: "body",
    note: "play scale: 1:1 with a 55° / 900 px game frame at 6.8 m" },
  // THE WEAPON LENS, and until now there was not one.
  //
  // `COSMETICS-AUDIT.md` §6: a sword on the kit card is about 200 px of a 700 px
  // frame, most of it blade, and the fittings a player is actually buying — the
  // pommel, the guard, the grip wrap, the hilt's inlay — are a dozen pixels
  // each. Six weapon finishes were on sale and NONE of them could be judged,
  // which is why the audit calls this a blocker on the weapon review rather
  // than a nice-to-have: there was no picture to argue about.
  //
  // 0.35 m of frame at the fist, which is the audit's own number. At 700 px
  // that is 2000 px/m — a 20 mm pommel gets 40 px, where the kit card gave it
  // three. The lens is long (12°, 1.66 m back) rather than close and wide: a
  // hilt photographed from a foot away is a fisheye of a hilt, and the thing
  // being judged is a silhouette and an inlay, both of which a wide angle
  // bends. 2 * 1.66 * tan(6°) = 0.349 m.
  //
  // Square, because a weapon has no long axis the frame can agree with: the
  // huscarl carries point-down, the warden's spear is upright, the berserker's
  // axe lies over his shoulder. A 700x900 card would waste a third of itself on
  // three of the four.
  weaponcard: { w: 700, h: 700, dist: 1.66, targetY: 0.86, eyeY: 0.86, fov: 12, aim: "fist",
    note: "the grip and its fittings, 0.35 m of frame, ~2000 px/m" },
};

function cardFraming(card: CardSpec, turnDeg: number) {
  const a = AIM[card.aim];
  const rot = Math.PI + (turnDeg * Math.PI) / 180;
  const s = Math.sin(rot);
  const c = Math.cos(rot);
  // Forward is (sin, cos) — the convention `makePlayer` builds velocity on — and
  // screen-right at turn 0 is (cos, −sin), which is −x with him facing the lens.
  const x = MARK.x + a.right * c + a.fwd * s;
  const z = MARK.z - a.right * s + a.fwd * c;
  return {
    // The lens tracks the aim point instead of swinging to face it: a turntable
    // is only a turntable if the bearing between lens and subject is the same in
    // every panel.
    position: [x, card.eyeY, z - card.dist] as [number, number, number],
    target: [x, card.targetY, z] as [number, number, number],
    fov: card.fov,
  };
}

/** One warrior, on the mark, in the audit's base dress. Every card stages this. */
const cardPose = (cls: WarriorClass = "huscarl"): Pose => ({
  // The id stays "me" in every panel so the face under the helmet is one face
  // and not one per shot — a mask fitted to a different skull each time proves
  // nothing about the helmet.
  id: "me", name: "Raedwald", cls, x: MARK.x, z: MARK.z, rot: Math.PI,
  state: "idle", ap: AUDIT_DRESS,
});

/**
 * Camera yaw is chosen per preset so framing is reproducible. A preset may
 * instead supply `framing`, which aims the camera outright — necessary for any
 * shot of a warrior's front, since every play mode sits behind his shoulder and
 * his own back hides whatever he faces.
 */
const PRESETS: Record<string, {
  cam: number;
  poses: Pose[];
  matchTimer: number;
  lastStand?: boolean;
  framing?: { position: [number, number, number]; target: [number, number, number]; fov?: number };
  /**
   * Frames to run before the capture is taken. The default settles the lerps and
   * then stops; a death is the one thing in the set that is not a settled pose
   * but a second of motion, so a gore preset names the instant it wants. Every
   * frame on a GPU-less box is a full 0.05 s step of sim, so the count is
   * seconds × 20 and the same on any machine slower than 20 fps.
   */
  settle?: number;
  /**
   * The preset is a stage, not a photograph: any armoury slot plus `?turn=` and
   * `?cls=` redress and rotate it, and the capture tool takes a series. Only a
   * preset that opts in reads them, so a stray query param can never quietly
   * restage a shot that was authored to be fixed.
   */
  parametric?: boolean;
  /**
   * Framing computed from a card mark and the turn, instead of authored. A card
   * has to re-aim as the man turns — the head is off his body's axis — so its
   * framing is not a constant and cannot be written as one.
   */
  card?: keyof typeof CARDS;
  /**
   * The room's state, for the two summary presets. "finished" plus a
   * `matchEnd` puts the canvas on the end-of-match tableau path —
   * render/summary.ts restages the men and aims its own camera, so a preset
   * `framing` would be overridden and is not authored.
   */
  state?: "fighting" | "finished";
  matchEnd?: MatchEndData;
}> = {
  // Over-shoulder gameplay view, mid-swing against a blocking foe.
  // Offset from the origin because the bonfire stands there — framing a duel
  // at (0,0) puts the camera inside the woodpile.
  duel: {
    cam: Math.PI,
    matchTimer: 74,
    poses: [
      { id: "me", name: "Aethelred", cls: "warden", x: 6.5, z: 5.5, rot: Math.PI, state: "attacking", dir: "overhead", swing: 0.55 },
      { id: "foe", name: "Uhtred", cls: "huscarl", x: 6.9, z: 2.9, rot: 0, state: "blocking", hp: 0.62 },
    ],
  },
  // Wide arena establishing shot — judges world build, sky, lighting.
  arena: {
    cam: Math.PI,
    matchTimer: 12,
    poses: [
      { id: "me", name: "Aethelred", cls: "warden", x: 0, z: 11, rot: Math.PI, state: "idle" },
      { id: "a", name: "Beorn", cls: "berserker", x: -5, z: 2, rot: 0.4, state: "walking" },
      { id: "b", name: "Cynric", cls: "huscarl", x: 5.5, z: 1, rot: -0.6, state: "idle" },
      { id: "c", name: "Leofric", cls: "runekeeper", x: -1, z: -4, rot: 0.2, state: "idle" },
    ],
  },
  // The fort's establishing shot. `arena` follows the warrior at (0, 11), and
  // on `roman_fort` that puts the lens INSIDE curtain wall three — the first
  // ground with standing geometry at the follow camera's own radius, so the
  // first whose wide review needs an aimed lens. A crane over the south-east
  // breach: court, walls, piers and the low country in one frame.
  fortwide: {
    cam: Math.PI,
    matchTimer: 12,
    framing: { position: [11.5, 8.0, -15.5], target: [-2.0, 0.4, 3.0], fov: 50 },
    poses: [
      { id: "me", name: "Aethelred", cls: "warden", x: 0, z: 11, rot: Math.PI, state: "idle" },
      { id: "a", name: "Beorn", cls: "berserker", x: -5, z: 2, rot: 0.4, state: "walking" },
      { id: "b", name: "Cynric", cls: "huscarl", x: 5.5, z: 1, rot: -0.6, state: "idle" },
      { id: "c", name: "Leofric", cls: "runekeeper", x: -1, z: -4, rot: 0.2, state: "idle" },
    ],
  },
  // The camp's establishing shot, `fortwide`'s argument at the fourth ground:
  // a crane from the land side, over the fire and the tents, with the ship
  // and the frozen river reach beyond — the D-shape read in one frame.
  campwide: {
    cam: Math.PI,
    matchTimer: 12,
    framing: { position: [6.1, 5.2, 5.5], target: [-7.5, 0.9, -6.3], fov: 48 },
    poses: [
      { id: "me", name: "Halfdan", cls: "warden", x: 0, z: 11, rot: Math.PI, state: "idle" },
      { id: "a", name: "Ubba", cls: "berserker", x: -5, z: 2, rot: 0.4, state: "walking" },
      { id: "b", name: "Ivar", cls: "huscarl", x: 5.5, z: 1, rot: -0.6, state: "idle" },
      { id: "c", name: "Guthrum", cls: "runekeeper", x: -1, z: -4, rot: 0.2, state: "idle" },
    ],
  },
  // Tight character study — judges armour, cloth, faces, materials.
  closeup: {
    cam: Math.PI,
    matchTimer: 30,
    poses: [
      { id: "me", name: "Aethelred", cls: "huscarl", x: -7.0, z: 6.0, rot: Math.PI, state: "idle" },
      { id: "foe", name: "Osric", cls: "berserker", x: -6.2, z: 4.1, rot: 0.4, state: "idle" },
    ],
  },
  // Eight-warrior melee — judges crowd readability and silhouettes.
  brawl: {
    cam: Math.PI,
    matchTimer: 120,
    poses: Array.from({ length: 8 }, (_, i) => {
      // Half a step off the cardinals. On the whole steps, i=4 lands at
      // (0, -4.2) — dead on the follow rig's axis through the bonfire — so the
      // far warrior was permanently inside the flame column and read as legs
      // growing out of the fire. That is a framing coincidence, not a fire bug,
      // and it would recur on any future flame silhouette.
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const cls: WarriorClass = (["huscarl", "warden", "runekeeper", "berserker"] as WarriorClass[])[i % 4];
      return {
        id: i === 0 ? "me" : `p${i}`,
        name: ["Aethelred", "Uhtred", "Beorn", "Cynric", "Leofric", "Osric", "Grim", "Eadwig"][i],
        cls,
        x: i === 0 ? 0 : Math.sin(a) * 4.2,
        z: i === 0 ? 4.5 : Math.cos(a) * 4.2,
        rot: i === 0 ? Math.PI : a + Math.PI,
        state: (i % 3 === 0 ? "attacking" : i % 3 === 1 ? "blocking" : "walking") as PlayerState,
        dir: (["left", "right", "overhead", "stab"] as AttackDirection[])[i % 4],
        swing: 0.5,
        hp: 1 - i * 0.09,
      };
    }),
  },
  // Face-on portrait at conversational distance. The single most important
  // shot in the set: proportion, face, hands, and how the armour layers read.
  portrait: {
    cam: Math.PI,
    matchTimer: 40,
    framing: { position: [-7.0, 1.62, 2.1], target: [-7.0, 1.35, 4.6], fov: 40 },
    poses: [
      { id: "me", name: "Aethelred", cls: "huscarl", x: -7.0, z: 4.6, rot: Math.PI, state: "idle" },
    ],
  },
  // Three-quarter full body, so silhouette and stance can be judged together.
  stance: {
    cam: Math.PI,
    matchTimer: 40,
    framing: { position: [-4.4, 1.9, 1.6], target: [-7.0, 1.0, 4.6], fov: 46 },
    poses: [
      // 1.53, not 2.42. The camera sits on bearing 2.428 from this mark, so 2.42
      // framed the warrior dead head-on — every sagittal channel a swing authors
      // (blade arc, hip/shoulder separation, weight over the front foot) projects
      // to nothing on that axis, and the one shot in the set that exists to prove
      // a loaded swing was the one that could not show it. 0.9 rad off, taken
      // toward his sword side so the arm and the blade stay in front of the body.
      { id: "me", name: "Aethelred", cls: "berserker", x: -7.0, z: 4.6, rot: 1.53, state: "attacking", dir: "overhead", swing: 0.45 },
      { id: "foe", name: "Osric", cls: "warden", x: -8.6, z: 6.6, rot: -0.72, state: "blocking", hp: 0.5 },
    ],
  },
  // All four classes side by side, front on, for silhouette differentiation.
  lineup: {
    cam: Math.PI,
    matchTimer: 40,
    framing: { position: [0, 2.0, 10.5], target: [0, 1.1, 6.0], fov: 44 },
    poses: (["huscarl", "warden", "runekeeper", "berserker"] as WarriorClass[]).map((cls, i) => ({
      id: i === 0 ? "me" : `p${i}`,
      name: ["Huscarl", "Weard", "Wrecca", "Berserker"][i],
      cls,
      x: -2.55 + i * 1.7,
      z: 6.0,
      rot: 0,
      state: "idle" as PlayerState,
    })),
  },
  // The face mask at conversational distance, on `portrait`'s framing, because
  // the four features that make this helm the artefact rather than a bucket —
  // mask, brows, the nose-and-moustache bird, the crest — are all inside 300 mm
  // of the face, and the eye openings only answer at this range.
  suttonhoo: {
    cam: Math.PI,
    matchTimer: 40,
    // Aimed at the head and nothing else. `portrait`'s framing was the first
    // try and it is the wrong instrument: it frames a man, so the head lands
    // near 200 px and the raised shield takes half the picture — every question
    // this shot exists to answer is inside 300 mm of the face. Measured off that
    // capture, a huscarl's head runs y 1.67 to 2.00, so the frame is 0.9 m tall
    // about y 1.84 and the head fills a third of it.
    framing: { position: [-7.0, 1.86, 2.6], target: [-7.0, 1.84, 4.6], fov: 26 },
    poses: [
      { id: "me", name: "Raedwald", cls: "huscarl", x: -7.0, z: 4.6, rot: Math.PI, state: "idle", ap: { helm: "suttonhoo" } },
    ],
  },
  // ---- The audit cards. One mark, one camera, one light. ------------------
  //
  // These replace the row-of-five as the instrument for judging anything a
  // player buys, and they exist because the row could not answer the question it
  // was built to ask. Five men standing abreast at z=6 are five different
  // distances and five different bearings from the bonfire, which is the arena's
  // largest source: the middle of the row was backlit by flame and blown to
  // orange while the ends sat in shadow, so a strip cropped out of it compared
  // ten silhouettes across ten exposures. Panels that are not comparable are
  // worse than no panels, because a reviewer will compare them anyway and be
  // confident. (He was, and he was wrong.)
  //
  // A card fixes every variable but the one under test. The man never moves, so
  // the photons are the same in every panel by construction rather than by
  // intention; the lens never changes within a sheet, so scale and background
  // are the same; and the id stays "me" in all of them, so the face is one face
  // and not one per panel. `?turn=` puts him on a turntable instead of moving
  // the lens, which is the whole point — orbiting the camera would swing the
  // bonfire through the background and put the flame behind panel four again.
  //
  // The mark is `portrait`'s, at 8.4 m from the fire: far enough out that the
  // hearth is a fill rather than the key, which is what lets silver read as
  // silver and gold read as gold instead of both reading as orange. It is not
  // a neutral studio — there isn't one in this arena, the rig is a dusk rig —
  // but it is the most neutral standing room the world has, and every card
  // shares it. That matters most for the 18 options that are pure colour: a
  // hair tone or a shield-wall finish can only be judged against the light it
  // will be worn in, and it is the same light in all six panels.
  //
  // Negative `turn` rotates him *toward* the fire. At -35° his face still takes
  // the hearth square on; at +35° the same three-quarter puts it in shadow and
  // photographs the dark side. The sign is not cosmetic.
  facecard: {
    cam: Math.PI,
    matchTimer: 40,
    parametric: true,
    card: "facecard",
    // 16, not the default 26. There is no camera lerp in photo mode (the
    // framing is set outright) and an idle pose has no swing to settle, so the
    // remaining frames are procedural texture generation. At ~5 s a frame on a
    // GPU-less box, ten frames saved is two minutes off a ten-card sheet — and
    // this audit is eighty cards, not ten.
    settle: 16,
    poses: [cardPose()],
  },
  // The same man, same mark, same light, from far enough back to see his boots.
  // Cloak and finish are the two slots that cannot be reviewed on a head card,
  // and the cloak has a known defect (it gathers through the tunic) that lives
  // at the waist.
  kitcard: {
    cam: Math.PI,
    matchTimer: 40,
    parametric: true,
    card: "kitcard",
    settle: 16,
    poses: [cardPose()],
  },
  // The same man again, at the distance a player fights him.
  //
  // This is the second reading every slot needs and the one the portrait cannot
  // give: a cosmetic nobody can see in play is not a cosmetic, however well it
  // photographs at 2 m. The lens is chosen so the panel is a 1:1 crop of a play
  // frame rather than a smaller picture of the same thing — same pixels on the
  // man, just no wasted grass around him.
  fightcard: {
    cam: Math.PI,
    matchTimer: 40,
    parametric: true,
    card: "fightcard",
    settle: 16,
    poses: [cardPose()],
  },
  // The fittings, close enough to argue about. See `CARDS.weaponcard`.
  weaponcard: {
    cam: Math.PI,
    matchTimer: 40,
    parametric: true,
    card: "weaponcard",
    settle: 16,
    poses: [cardPose()],
  },
  // ---- Gore. Three deaths, caught in the second they happen. -------------
  //
  // All three share a mark and a camera so the four questions the owner will
  // ask can be answered by flicking between the images: the killer stands off
  // the victim's weapon side, so the push carries the piece left-to-right
  // across the frame instead of away from the lens, and the camera is lifted
  // and pulled back from `stance`'s framing to leave air above the body for
  // whatever is still in it.
  //
  // The victim faces the camera. That costs a little of the wound — the cut
  // faces the killer, not us — but it is the only way to see the helm on a
  // head that has left, and a back is not a death.
  //
  // Beheading. `settle: 20` is ~0.95 s: the head is past its apex and coming
  // down, the burst has arced and landed, and the stump is still running.
  gorehead: {
    cam: Math.PI,
    matchTimer: 88,
    settle: 20,
    framing: GORE_FRAMING,
    poses: [
      { id: "me", name: "Aethelred", cls: "huscarl", x: -7.0, z: 4.6, rot: Math.PI, state: "dead", hp: 0, zone: "neck", dir: "overhead", heavy: true, killer: "foe" },
      { id: "foe", name: "Grim", cls: "berserker", x: -9.0, z: 3.4, rot: 1.03, state: "attacking", dir: "overhead", swing: 0.86, hp: 0.74 },
    ],
  },
  // Sword arm off at the elbow. The zone is the one the design doc singles out:
  // the fist stays closed on the weapon and the whole forearm leaves holding it.
  //
  // A huscarl and not a warden, which was the first casting. The warden fights
  // with a spear held down the body in both hands, so his forearm leaving with
  // it is indistinguishable in a still from a spear simply lying on the grass —
  // the shot could not answer the question it exists to ask. The huscarl's
  // sword stands clear of him in one fist and the answer is unambiguous.
  gorearm: {
    cam: Math.PI,
    matchTimer: 88,
    settle: 22,
    framing: GORE_FRAMING,
    poses: [
      { id: "me", name: "Aethelred", cls: "huscarl", x: -7.0, z: 4.6, rot: Math.PI, state: "dead", hp: 0, zone: "armR", dir: "right", heavy: false, killer: "foe" },
      { id: "foe", name: "Grim", cls: "warden", x: -9.0, z: 3.4, rot: 1.03, state: "attacking", dir: "right", swing: 0.9, hp: 0.66 },
    ],
  },
  // The samurai case. Held a beat longer than the other two — the halves are
  // slower than a head and the shot has to show both of them on the ground,
  // separately, or it has not shown the thing that was asked for.
  goresplit: {
    cam: Math.PI,
    matchTimer: 88,
    settle: 30,
    framing: GORE_FRAMING,
    poses: [
      { id: "me", name: "Aethelred", cls: "huscarl", x: -7.0, z: 4.6, rot: Math.PI, state: "dead", hp: 0, zone: "waist", dir: "right", heavy: true, killer: "foe" },
      { id: "foe", name: "Grim", cls: "berserker", x: -9.1, z: 3.6, rot: 1.0, state: "attacking", dir: "right", swing: 0.95, hp: 0.7 },
    ],
  },
  // `gorehead` again, wearing the helm. The neck seam runs where this helm's
  // neck guard sits and no other helmet in the set has one, so this is the only
  // capture that can answer whether a head that leaves takes its mask, its
  // cheeks and its crest with it — and whether the cut goes through the guard.
  gorehelm: {
    cam: Math.PI,
    matchTimer: 88,
    settle: 20,
    framing: GORE_FRAMING,
    poses: [
      { id: "me", name: "Raedwald", cls: "huscarl", x: -7.0, z: 4.6, rot: Math.PI, state: "dead", hp: 0, zone: "neck", dir: "overhead", heavy: true, killer: "foe", ap: { helm: "suttonhoo" } },
      { id: "foe", name: "Grim", cls: "berserker", x: -9.0, z: 3.4, rot: 1.03, state: "attacking", dir: "overhead", swing: 0.86, hp: 0.74 },
    ],
  },
  // ---- The fire. Two shots, because there are two questions. -------------
  //
  // `pyre` is the wide one: a man standing in the bonfire, a man who has run
  // clear of it and is still alight, and a corpse still smouldering — all in one
  // frame with the bonfire itself, so the flames on a warrior can be compared
  // against the flames they came from. If a burning man only reads as burning
  // while he is next to the hearth, this is the frame that shows it.
  pyre: {
    cam: Math.PI,
    matchTimer: 96,
    // 12, not 34. Three warriors, a bonfire and eight flame lights put this
    // scene past 9 s a frame on a GPU-less box, and 34 of those overruns the
    // harness's own 300 s settle budget — the first run of this preset captured
    // an unsettled frame and reported `frames=0`. 12 is ~0.6 s of simulation:
    // enough for the flame ring to have turned and for the smoke to have left
    // the shoulder, not enough for a long tail. The tail is a claim `firetest`
    // settles anyway; this frame's job is whether he reads as alight.
    settle: 12,
    framing: { position: [8.6, 3.0, 7.4], target: [1.6, 1.15, 0.2], fov: 40 },
    poses: [
      // r = 1.11 m against a 1.475 m hazard: in it, not beside it.
      { id: "me", name: "Aethelred", cls: "huscarl", x: 1.05, z: 0.35, rot: 2.4, state: "walking", hp: 0.44, burn: { timer: 3.0, inside: true } },
      { id: "foe", name: "Osric", cls: "berserker", x: 4.3, z: 2.4, rot: 0.95, state: "sprinting", hp: 0.51, burn: { timer: 1.9 } },
      { id: "grim", name: "Grim", cls: "runekeeper", x: 3.1, z: -2.7, rot: 1.2, state: "dead", hp: 0, cause: "fire", killer: "", burn: { timer: 0.9 } },
    ],
  },
  // `burnman` is the honest one. The portrait mark is 8.4 m from the hearth and
  // the bonfire is behind the lens, so there is nothing orange in the frame but
  // the man. Either he is on fire here or the feature does not work.
  burnman: {
    cam: Math.PI,
    matchTimer: 96,
    settle: 12,
    framing: { position: [-4.6, 2.0, 1.5], target: [-7.0, 1.15, 4.6], fov: 44 },
    poses: [
      { id: "me", name: "Aethelred", cls: "huscarl", x: -7.0, z: 4.6, rot: 1.6, state: "running", hp: 0.38, burn: { timer: 2.3 } },
    ],
  },
  // ---- The end-of-match summary, staged. ---------------------------------
  //
  // Both presets exist because the tableau is aimed by code, not by a framing
  // constant: render/summary.ts reads the verdict, restages the men and hands
  // the camera its push, and the only way to review any of that is to hand it
  // a finished room. The corpse dies on the torso deliberately — a summary
  // inherits the fight's gore rather than authoring any, so a staged
  // severance here would photograph a blood path no match produces.
  //
  // The duel: the loser lies where he fell, the victor stood over him.
  summaryduel: {
    cam: Math.PI,
    matchTimer: 141,
    state: "finished",
    settle: 40,
    poses: [
      { id: "me", name: "Aethelred", cls: "huscarl", x: -5.9, z: 6.4, rot: Math.PI, state: "dead", hp: 0, zone: "torso", dir: "overhead", heavy: true, killer: "foe" },
      { id: "foe", name: "Uhtred", cls: "berserker", x: -7.6, z: 4.8, rot: 1.0, state: "idle", hp: 0.62 },
    ],
    matchEnd: {
      winnerKind: "player", winnerId: "foe", winnerTeam: null, winnerName: "Uhtred",
      bestOf: 3, roundsPlayed: 3, roundTarget: 2, roundWins: { foe: 2, me: 1 }, roundScoreBy: "player",
      results: [
        { id: "foe", name: "Uhtred", kills: 2, deaths: 1, damage: 341, score: 260, isWinner: true, xpEarned: 320, goldEarned: 90 },
        { id: "me", name: "Aethelred", kills: 1, deaths: 2, damage: 264, score: 140, isWinner: false, xpEarned: 212, goldEarned: 25 },
      ],
    },
  },
  // The moot: victor centre, the fallen stood back up into the wall behind
  // him — five dead men here, so the line is also the reassembly proof.
  summarymoot: {
    cam: Math.PI,
    matchTimer: 200,
    state: "finished",
    settle: 40,
    poses: [
      { id: "b1", name: "Uhtred", cls: "huscarl", x: 4.1, z: 1.2, rot: 2.4, state: "idle", hp: 0.45 },
      { id: "me", name: "Aethelred", cls: "warden", x: 2.5, z: -3.5, rot: 0.4, state: "dead", hp: 0, zone: "torso", dir: "right", killer: "b1" },
      { id: "b2", name: "Beorn", cls: "berserker", x: -4.0, z: -1.0, rot: 1.0, state: "dead", hp: 0, zone: "torso", dir: "left", killer: "b1" },
      { id: "b3", name: "Cynric", cls: "runekeeper", x: -2.0, z: 5.0, rot: 2.0, state: "dead", hp: 0, zone: "torso", dir: "right", killer: "b1" },
      { id: "b4", name: "Leofric", cls: "warden", x: 6.0, z: 3.0, rot: 3.0, state: "dead", hp: 0, zone: "torso", dir: "stab", killer: "b1" },
      { id: "b5", name: "Osric", cls: "huscarl", x: 0.5, z: -6.0, rot: 0.2, state: "dead", hp: 0, zone: "torso", dir: "right", killer: "b1" },
    ],
    matchEnd: {
      winnerKind: "player", winnerId: "b1", winnerTeam: null, winnerName: "Uhtred",
      bestOf: 3, roundsPlayed: 3, roundTarget: 2, roundWins: { b1: 2, me: 1 }, roundScoreBy: "player",
      results: [
        { id: "b1", name: "Uhtred", kills: 4, deaths: 1, damage: 512, score: 470, isWinner: true, xpEarned: 426, goldEarned: 120 },
        { id: "me", name: "Aethelred", kills: 3, deaths: 2, damage: 388, score: 340, isWinner: false, xpEarned: 334, goldEarned: 55 },
        { id: "b2", name: "Beorn", kills: 2, deaths: 2, damage: 301, score: 230, isWinner: false, xpEarned: 260, goldEarned: 40 },
        { id: "b3", name: "Cynric", kills: 1, deaths: 2, damage: 204, score: 120, isWinner: false, xpEarned: 182, goldEarned: 25 },
        { id: "b4", name: "Leofric", kills: 1, deaths: 3, damage: 166, score: 100, isWinner: false, xpEarned: 163, goldEarned: 25 },
        { id: "b5", name: "Osric", kills: 0, deaths: 3, damage: 98, score: 40, isWinner: false, xpEarned: 99, goldEarned: 10 },
      ],
    },
  },
  // Last-stand mood — judges the dramatic colour grade.
  laststand: {
    cam: Math.PI,
    matchTimer: 210,
    lastStand: true,
    poses: [
      { id: "me", name: "Aethelred", cls: "berserker", x: 4.0, z: -7.5, rot: Math.PI, state: "idle", hp: 0.22 },
      { id: "foe", name: "Grim the Grim", cls: "huscarl", x: 3.2, z: -10.9, rot: 0.2, state: "attacking", dir: "left", swing: 0.4 },
    ],
  },
};

/**
 * `revived` is the respawn half of a gore preset: the same synthetic room, with
 * the corpse handed back its health and its state and — as the server does on
 * every road back to standing — its death mark cleared. It exists because "a
 * dismembered body cleans up on respawn" is a claim about the client that only
 * a frame can settle, and the renderer reaches that path from a state change on
 * the player record and from nothing else.
 */
function makePlayer(p: Pose, isLocal: boolean, revived = false, team: "red" | "blue" | "none" = "none"): GamePlayer {
  const stats = WARRIOR_STATS[p.cls];
  if (revived && p.state === "dead") p = { ...p, state: "idle", hp: 1, zone: undefined };
  const moving = p.state === "walking" || p.state === "running" || p.state === "sprinting";
  const speed = p.state === "sprinting" ? stats.sprintSpeed : stats.moveSpeed;
  return {
    id: p.id,
    name: p.name,
    warriorClass: p.cls,
    team,
    ready: true,
    position: { x: p.x, y: 0, z: p.z },
    rotation: p.rot,
    velocity: moving ? { x: Math.sin(p.rot) * speed, y: 0, z: Math.cos(p.rot) * speed } : { x: 0, y: 0, z: 0 },
    health: stats.maxHealth * (p.hp ?? 1),
    maxHealth: stats.maxHealth,
    // The same law `engine.mjs`'s `carriesBoard` keeps: a huscarl has boards,
    // nobody else does, and the wire says null not zero. A photograph never
    // stages the Dane axe (arms ride the player, not the appearance), so the
    // class alone decides here.
    shield: p.shield !== undefined ? p.shield : (p.cls === "huscarl" ? 100 : null),
    taken: p.taken ?? null,
    stamina: stats.staminaMax * 0.7,
    maxStamina: stats.staminaMax,
    state: p.state,
    attackDir: p.dir ?? "right",
    blockDir: p.dir ?? "right",
    // swing=0 -> full timer (windup), swing=1 -> timer 0 (finished)
    attackTimer: p.state === "attacking" ? stats.attackSpeed * (1 - (p.swing ?? 0.5)) : 0,
    blockTimer: p.state === "blocking" ? 0.5 : 0,
    dodgeTimer: 0,
    staggerTimer: 0,
    abilityCooldown: 4,
    abilityActive: false,
    abilityTimer: 0,
    kills: 2,
    deaths: 0,
    damage: 140,
    score: 200,
    lastHitBy: p.killer ?? "",
    comboCount: 0,
    comboTimer: 0,
    invincible: false,
    invincibleTimer: 0,
    // A burn death has no cut and therefore no zone: `anim.ts` early-returns on
    // a null zone, which is the whole of "fire does not sever a limb".
    deathZone: p.state === "dead" && p.cause !== "fire" ? (p.zone ?? "torso") : null,
    deathDir: p.state === "dead" ? (p.dir ?? "right") : null,
    deathHeavy: p.state === "dead" ? (p.heavy ?? false) : false,
    deathCause: p.state === "dead" ? (p.cause ?? "blow") : null,
    burning: !!p.burn,
    burnTimer: p.burn?.timer ?? 0,
    burnInside: p.burn?.inside ?? false,
    ...(isLocal ? {} : {}),
    appearance: { ...defaultAppearance(p.cls), ...(p.ap ?? {}) } as Appearance,
  } as GamePlayer;
}

/**
 * What a parametric preset was actually asked to wear, resolved against the
 * shop, or the reason it refused.
 *
 * Refusing is the point. An unknown value does not fail — `characters.ts` builds
 * a bare head for an unknown helm and the class default for everything else — so
 * a typo in the capture tool renders a plausible warrior in silence and the
 * sheet files that panel under the name the tool meant. A reviewer then reads
 * "this rung adds nothing", which is the most expensive wrong answer this
 * harness can produce and the one it has already produced once.
 */
function restage(params: URLSearchParams, base: Partial<Appearance>) {
  const ap: Partial<Appearance> = { ...base };
  const asked: Record<string, string> = {};
  for (const [slot, field] of Object.entries(SLOT_FIELD)) {
    const token = params.get(slot);
    if (token === null) continue;
    const opt = resolveSlot(slot, token);
    if (!opt) return { error: `${slot} "${token}" is not in the armoury` };
    // The shop selling something the renderer cannot build is a real defect and
    // this is the only place both lists are in scope, so it is checked here
    // rather than assumed. Every other slot degrades to a visible default; an
    // unlisted helm silently builds a bare head.
    if (slot === "helm" && !HELM_VALUES.includes(String(opt.value))) {
      return { error: `shop sells helm "${opt.value}" but the renderer has no such style` };
    }
    (ap as Record<string, string | number>)[field] = opt.value;
    asked[slot] = spell(opt.value);
  }
  // ---- `?people=` — the livery, which is not an armoury slot -------------
  //
  // Nobody buys a people, so it does not go through `resolveSlot` and there is
  // no shop row to check it against. The four ids are `war.mjs`'s and the fifth
  // token is the unsworn, which is a look and not an absence — see
  // `defaultAppearance`.
  //
  // WRITTEN THROUGH A CAST, AND THAT IS DELIBERATE RATHER THAN LAZY. This page
  // is the instrument for the before/after of `BACKLOG.md` 4.3, and the "before"
  // has to be shot against a tree where `Appearance` HAS NO SUCH FIELD. A cast
  // compiles on both, so the same harness photographs both trees and the only
  // thing that differs between the two sets of pictures is the renderer. A
  // typed field here would have forced the baseline to be shot with a different
  // instrument, which is not a baseline.
  //
  // It still REFUSES an unknown token, for the reason the rest of this function
  // refuses one: a typo that renders a plausible warrior in silence is the most
  // expensive wrong answer this harness can produce.
  const people = params.get("people");
  if (people !== null) {
    if (!["saxon", "norse", "briton", "pict", "none"].includes(people)) {
      return { error: `people "${people}" is not one of the four, nor "none"` };
    }
    (ap as Record<string, string>).people = people;
    asked.people = people;
  }
  return { ap, asked };
}

/** Every slot of a staged appearance, spelled the way the query string spells it. */
const subjectOf = (ap: Appearance, cls: WarriorClass, turn: number) => ({
  cls, turn,
  ...Object.fromEntries(Object.entries(SLOT_FIELD).map(([slot, field]) => [slot, spell(ap[field] ?? "none")])),
  // Read off the merged appearance like everything else, and through the same
  // cast, so a baseline tree that has no such field publishes `"none"` and says
  // so out loud instead of publishing nothing.
  people: String((ap as unknown as Record<string, unknown>).people ?? "none"),
});

/**
 * THE QUERY, RESOLVED ONCE — and the page's globals published with it.
 *
 * Module scope so the object identity is stable for `useSyncExternalStore`
 * (see the note at its call site), and so the globals below are set exactly
 * once per load however many times React asks for a snapshot.
 */
let shotParamsMemo: URLSearchParams | null = null;
let shotParamsDone = false;
const SHOT_SUBSCRIBE = () => () => {};
const shotServerParams = (): URLSearchParams | null => null;
function shotParams(): URLSearchParams | null {
  if (shotParamsDone) return shotParamsMemo;
  shotParamsDone = true;
  if (typeof window === "undefined") return null;
  const search = readSearchOnce();

  const chosen = PRESETS[search.get("preset") ?? "duel"] ?? PRESETS.duel;
  const camOverride = search.get("cam");
  const globals = window as unknown as Record<string, unknown>;
  globals.__photoCam = camOverride !== null ? parseFloat(camOverride) : chosen.cam;
  // Deleted rather than left stale: a framing carried over would silently
  // pin the camera in a shot that meant to follow the warrior.
  const turn = chosen.parametric ? parseFloat(search.get("turn") ?? "0") : 0;
  const framing = chosen.card && Number.isFinite(turn)
    ? cardFraming(CARDS[chosen.card], turn)
    : chosen.framing;
  if (framing) globals.__photoFraming = framing;
  else delete globals.__photoFraming;
  // The shop, published for the capture tool — see `__shotRoster` in the
  // header contract. A tool holding its own copy of the ladder audits the
  // shop it was written against.
  if (search.get("roster") === "1") {
    globals.__shotRoster = {
      slots: ARMOURY.map((s) => ({
        slot: s.slot, label: s.label,
        options: s.options.map((o) => ({ id: o.id, label: o.label, cost: o.cost, value: spell(o.value) })),
      })),
      cards: Object.fromEntries(Object.entries(CARDS).map(([k, c]) => [k, { w: c.w, h: c.h, note: c.note }])),
      dress: DRESS_IDS,
      unmapped: ARMOURY.filter((s) => !(s.slot in SLOT_FIELD)).map((s) => s.slot),
    };
  }
  shotParamsMemo = search;
  return shotParamsMemo;
}

export default function ShotPage() {
  // The query string, resolved in a LAZY INITIALIZER so the very first client
  // render is already the staged one — the same ruling the `arena` field
  // below carries, applied to the whole page, and the second time this page
  // has had to learn it: params that arrive a render late (a state mirror
  // before the doctor pass, a store re-render after it) RACE the canvas's
  // one-time world build, and the loser photographs the BASE pose under a
  // caption claiming the staged one. cosmetictest caught the store variant
  // as war-paint pairs reading pixel-identical on some loads and not others.
  // The world is built in a mount effect and never in server HTML, so the
  // null-on-server initializer cannot corrupt a capture; the state cell
  // keeps the object's identity stable for the memos below.
  // Params AND the camera globals resolve in one lazy initializer, and the
  // ordering is the entire point — this page has now mislaid it three ways:
  //
  //   1. The original state-mirror set params in a mount effect, which kept
  //      the canvas UNMOUNTED (the `!params` gate below) until the same
  //      effect had written `__photoCam`/`__photoFraming` — correct, but the
  //      set-state-in-effect shape react-doctor rightly flags.
  //   2. The doctor pass read params through a store: the canvas then
  //      mounted on a render that RACED the globals effect, and the loser
  //      photographed an unframed scene (war-paint pairs pixel-identical on
  //      some runs, not others).
  //   3. A lazy initializer for params alone made the race a certainty: the
  //      canvas mounts on the first commit, a CHILD's effects run before its
  //      parent's, and the globals effect always lost. Every facecard in the
  //      run photographed the duel scene at distance — the harness's own
  //      kept captures are what finally showed it.
  //
  // So the globals are written HERE, inside the initializer: it runs once,
  // on the client, during the parent's first render — strictly before any
  // child exists, with no second render to race and no state mirror. An
  // impure-looking write in an initializer is the honest price of a child
  // that reads window state from its mount effect; the alternative shapes
  // are the two bugs above.
  //
  // HYDRATION: `useSyncExternalStore`, NOT a lazy `useState` initialiser.
  //
  // The initialiser returned `null` on the server and the real params in the
  // browser, so the server sent `<div class="w-screen h-screen bg-black">` and
  // the client's FIRST render returned the whole canvas tree. React compared
  // the two and logged **Minified React error #418** on every production load
  // of this page (ledgered 27 Aug 2026). Captures were unaffected — the page
  // still forged and `__shotReady` still landed — but a hydration mismatch is
  // React being told the server lied, and it is one behaviour change away from
  // costing a capture run.
  //
  // This hook exists for exactly this shape: React renders `getServerSnapshot`
  // during hydration, so the HTML matches, then re-renders with the client
  // snapshot. The canvas mounts one render later, which costs nothing here —
  // every consumer already gates on `params`, and the harness waits on
  // `__shotReady` rather than on a frame count from mount.
  //
  // The snapshot is MEMOISED AT MODULE SCOPE and returns the same object every
  // call: `useSyncExternalStore` compares snapshots by identity, and a fresh
  // `URLSearchParams` per call would re-render forever. That memo is also
  // where the page's globals are published, so they are still set exactly once
  // and still before anything reads them.
  const params = useSyncExternalStore(SHOT_SUBSCRIBE, shotParams, shotServerParams);

  // 0 is the preset as authored. 1 is the same room after `?revive=1` has put
  // every dead warrior back on his feet, so a capture can show what the body
  // looks like once the renderer has been asked to reassemble it.
  const [phase, setPhase] = useState<0 | 1>(0);
  const presetName = params?.get("preset") ?? "duel";
  const clean = params?.get("clean") === "1";

  /**
   * Restages a `parametric` preset from the query string: any of the eight
   * armoury slots, the warrior class, and the turntable bearing. The harness
   * proves what it photographed — the applied appearance is published in full
   * for the tool to check against what it asked for, and a value off the roster
   * never renders at all.
   */
  const { preset, subject, subjectError } = useMemo(() => {
    const base = PRESETS[presetName] ?? PRESETS.duel;
    if (!params || !base.parametric) return { preset: base, subject: null, subjectError: null };

    const turn = params.get("turn");
    const deg = turn !== null ? parseFloat(turn) : 0;
    if (!Number.isFinite(deg)) {
      return { preset: base, subject: null, subjectError: `unreadable turn "${turn}"` };
    }
    const clsToken = params.get("cls");
    if (clsToken !== null && !(clsToken in WARRIOR_STATS)) {
      return { preset: base, subject: null, subjectError: `unknown class "${clsToken}"` };
    }
    const cls = (clsToken ?? base.poses[0]?.cls ?? "huscarl") as WarriorClass;

    const staged = restage(params, base.poses[0]?.ap ?? {});
    if ("error" in staged) return { preset: base, subject: null, subjectError: staged.error };

    // `?shield=` and `?state=` — so a cracked board, a burst one and the guard
    // it is held in can be photographed rather than asserted (SHIELD).
    const shieldToken = params.get("shield");
    const shield = shieldToken === null ? undefined : shieldToken === "null" ? null : parseFloat(shieldToken);
    if (shield !== undefined && shield !== null && !Number.isFinite(shield)) {
      return { preset: base, subject: null, subjectError: `unreadable shield "${shieldToken}"` };
    }
    // `?taken=cls:arms` — the staged man fights with a dead man's weapon (TAKE).
    const takenToken = params.get("taken");
    let taken: { cls: WarriorClass; arms: string } | null | undefined;
    if (takenToken !== null) {
      const [tc, ta] = takenToken.split(":");
      if (!(tc in WARRIOR_STATS) || !ta) return { preset: base, subject: null, subjectError: `unreadable taken "${takenToken}"` };
      taken = { cls: tc as WarriorClass, arms: ta };
    }
    const stateToken = params.get("state");
    const STAGEABLE: PlayerState[] = ["idle", "blocking", "attacking", "walking"];
    if (stateToken !== null && !STAGEABLE.includes(stateToken as PlayerState)) {
      return { preset: base, subject: null, subjectError: `unstageable state "${stateToken}"` };
    }

    return {
      preset: {
        ...base,
        poses: base.poses.map((p) => ({
          ...p, cls, rot: Math.PI + (deg * Math.PI) / 180, ap: staged.ap,
          ...(shield !== undefined ? { shield } : {}),
          ...(taken !== undefined ? { taken } : {}),
          ...(stateToken ? { state: stateToken as PlayerState } : {}),
        })),
      },
      // Off the merged appearance rather than off the query string, so what is
      // published is what the warrior is built from and not what was requested.
      subject: subjectOf({ ...defaultAppearance(cls), ...staged.ap }, cls, deg),
      subjectError: null,
    };
  }, [presetName, params]);

  const roomState = useMemo(() => {
    const players: Record<string, GamePlayer> = {};
    // THE LIVERY, FROM THE QUERY, read imperatively for the reason `ground`
    // is (see below). `?teams=1` dresses the cast red/blue by alternation —
    // pose order, "me" first — which is the only way to photograph the team
    // palettes at all: every authored preset is unsworn, and the colour-blind
    // door (THE FEEL's TEAM COLOURS switch) is a claim about a picture.
    const teams = (typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("teams")) === "1";
    preset.poses.forEach((p, i) => {
      players[p.id] = makePlayer(p, p.id === "me", phase === 1, teams ? (i % 2 === 0 ? "red" : "blue") : "none");
    });
    return {
      code: "PHOTO01",
      mode: "blood_moot",
      state: preset.state ?? "fighting",
      // THE GROUND, FROM THE QUERY. Hard-coded to the village until there was a
      // second one, at which point a harness that can only photograph the
      // village is a harness that cannot show you the new ground — and a ground
      // nobody can photograph is a ground nobody can judge.
      // READ IMPERATIVELY, NOT FROM `params`. The `params` state fills in an
      // effect, one render AFTER the canvas has already built its world from
      // this object — so the duel preset photographed the village whatever
      // ground was asked for, and only presets that force a remount (the
      // fightcard's staging phase) ever honoured `?ground=`. The world is
      // built in a mount effect and never in server HTML, so reading the URL
      // here directly cannot mismatch hydration — a state initialiser that
      // fixed the same race page-wide did, on every prerendered string. The
      // fort's first look pass was spent finding both halves of this.
      arena: (typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("ground")) ?? "saxon_village",
      players,
      hostId: "me",
      countdown: 0,
      matchTimer: preset.matchTimer,
      // Stamped from module load, not from render time: `Date.now()` in a
      // memo is an impure render read (react-doctor), and a capture harness
      // settles within seconds of load anyway, so feed age is indistinguishable.
      // `?drops=cls:arms` — a dead man's weapon on the floor (TAKE), a step in
      // front of the staged man, so the prop and the prompt can be photographed.
      drops: (() => {
        const tok = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("drops");
        if (!tok) return [];
        const me = preset.poses[0];
        if (!me) return [];
        const [dc, da] = tok.split(":");
        if (!dc || !da) return [];
        return [{ id: "staged", x: me.x + Math.sin(me.rot) * 0.9, z: me.z + Math.cos(me.rot) * 0.9,
          cls: dc as WarriorClass, arms: da, weapon: null, at: 0 }];
      })(),
      killFeed: [
        { killerName: "Aethelred", victimName: "Wulfred", timestamp: BOOT_TS },
        { killerName: "Beorn", victimName: "Aelric", timestamp: BOOT_TS },
      ],
      lastStandTriggered: !!preset.lastStand,
    };
  }, [preset, phase]);

  // Signal readiness once the renderer has presented enough frames for the
  // lerped camera and poses to settle. Every lerp in the rig runs at
  // min(1, dt * k) with dt capped at 0.05, so the slowest is within a
  // thousandth of its target inside ~25 frames. The count matters: a GPU-less
  // CI box renders this scene at about 1 fps, so each extra settle frame is
  // another second per preset and 60 of them made a full 8-preset capture take
  // most of an hour — long enough that review kept getting cut short.

  useEffect(() => {
    if (!params) return;
    if (subjectError) {
      (window as unknown as Record<string, unknown>).__shotError = subjectError;
      return;
    }
    // The roster is a text answer, not a picture: there is no scene to settle and
    // no reason to spend a minute of SwiftShader on one.
    if (params.get("roster") === "1") {
      (window as unknown as Record<string, unknown>).__shotReady = true;
      return;
    }
    let frames = 0;
    let raf = 0;
    const override = params.get("settle");
    const authored = override !== null ? parseInt(override, 10) : (preset.settle ?? 26);
    // The second phase is short on purpose. Reassembly is one frame's work, so a
    // long hold would only prove that a standing warrior stays standing; what is
    // worth capturing is the frame right after the limbs go back on.
    const limit = phase === 1 ? 12 : authored;
    // `Date.now`, not `performance.now`. The capture tool installs a virtual
    // clock so a settled pose is a function of the frame count rather than of
    // how slow the box is (see `installVirtualClock` in tools/shoot.mjs), which
    // means `performance.now` here would report the simulation's own 50 ms step
    // back as if it were the wall clock — and this number's whole job is to say
    // how slow the box actually is.
    const t0 = Date.now();
    const tick = () => {
      frames++;
      if (frames > limit) {
        if (phase === 0 && params.get("revive") === "1") { setPhase(1); return; }
        const g = window as unknown as Record<string, unknown>;
        // Published, not just counted. A settle is quoted in this file as
        // seconds of simulation, and that conversion is only true while a frame
        // is slower than the renderer's 0.05 s dt cap — which is a property of
        // the capture box, not of the code. Anything reading a timed pose out of
        // a shot has to be able to check the assumption rather than inherit it.
        g.__shotFrames = frames;
        g.__shotMsPerFrame = (Date.now() - t0) / frames;
        if (subject) g.__shotSubject = subject;
        g.__shotReady = true;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [params, preset, phase, subject, subjectError]);

  if (!params) return <div className="w-screen h-screen bg-black" />;
  // Roster mode renders no scene at all — see the settle effect.
  if (params.get("roster") === "1") return <div className="w-screen h-screen bg-black" />;

  return (
    <div className={`w-screen h-screen bg-black overflow-hidden ${clean ? "photo-clean" : ""}`}>
      {/* In clean mode every HUD/DOM overlay is hidden so the critic
          judges the rendered image alone, not the interface. */}
      {clean && (
        <style>{`
          .photo-clean canvas ~ * { display: none !important; }
          /* Next's dev-mode badge, which is neither HUD nor scene and is not a
             sibling of the canvas. The capture tool falls back to dev whenever
             src/ is newer than the last build — which is most of the time during
             an art pass — so this had been sitting in the corner of review
             frames, including the ones the last helm review was signed off on. */
          nextjs-portal { display: none !important; }
        `}</style>
      )}
      <GameCanvas playerId="me" roomState={roomState as never} onSendInput={() => {}} matchEnd={preset.matchEnd ?? null} />
      {preset.card && params.get("guides") === "1" && <Guides card={CARDS[preset.card]} />}
    </div>
  );
}

/**
 * A ruler over the frame, in millimetres at the subject's own plane.
 *
 * This is the instrument for aiming a card, and it exists because the previous
 * attempt to aim one was done by eye off a finished panel: the correction went
 * in with the wrong sign, the front panel put the head half off the left edge,
 * and three reviews looked past it. A grid in pixels would not have helped —
 * the number that has to be measured is an offset in metres in the warrior's
 * frame, so the grid is drawn in the units the constant is written in.
 *
 *   npm run shots -- facecard --guides --turn 0
 *
 * Never part of a review capture: `?guides=1` is opt-in and the sheets do not
 * pass it.
 */
function Guides({ card }: { card: CardSpec }) {
  // THE VIEWPORT IS READ IN AN EFFECT, so there is no browser global in the
  // render path at all and no branch for the server and the client to disagree
  // about — `react-doctor/no-hydration-branch-on-browser-global`, an error
  // because a hydration mismatch is silent.
  //
  // The first cut of this kept the lazy `typeof window` initialiser and added
  // the effect only as a fallback, on the reasoning that a guides overlay
  // needing a second commit is one a first-frame screenshot does not have. That
  // reasoning was not checked, and it is wrong: `tools/shoot.mjs` settles a
  // capture over about seventeen frames and two seconds ("frames=17@2081ms" on
  // every line it prints), so one extra tick is invisible to it. The clean
  // shape costs nothing and removes the branch instead of arguing with it.
  // …and the effect-set mirror is now a real external-store read, which is
  // strictly better again: same server-null/client-value hydration shape, no
  // state cascade, and the guides follow a live resize for free.
  const size = useSyncExternalStore(subscribeResize, readViewport, () => null);
  if (!size) return null;
  const span = 2 * card.dist * Math.tan((card.fov * Math.PI) / 360);
  const pxPerM = size.h / span;
  const step = pxPerM * 0.05;
  const n = Math.ceil(size.w / 2 / step);
  const ticks = Array.from({ length: 2 * n + 1 }, (_, i) => i - n);
  return (
    <svg className="absolute inset-0 z-50 pointer-events-none" width={size.w} height={size.h}>
      {ticks.map((k) => (
        <g key={k}>
          <line x1={size.w / 2 + k * step} y1={0} x2={size.w / 2 + k * step} y2={size.h}
            stroke={k === 0 ? "#ff3b6b" : "#25e0ff"} strokeWidth={k === 0 ? 1.5 : k % 2 ? 0.4 : 0.8} />
          {k !== 0 && k % 2 === 0 && (
            <text x={size.w / 2 + k * step + 3} y={16} fill="#25e0ff" fontSize={11} fontFamily="ui-monospace, monospace">
              {k * 50}
            </text>
          )}
        </g>
      ))}
      <line x1={0} y1={size.h / 2} x2={size.w} y2={size.h / 2} stroke="#ff3b6b" strokeWidth={1.5} />
      <text x={6} y={size.h - 10} fill="#ffe9a8" fontSize={13} fontFamily="ui-monospace, monospace">
        {`${card.note} · fov ${card.fov.toFixed(2)}° · dist ${card.dist} m · ${(pxPerM / 1000).toFixed(3)} px/mm · grid 50 mm`}
      </text>
    </svg>
  );
}
