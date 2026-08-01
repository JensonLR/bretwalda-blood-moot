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
//   window.__shotSubject — what a parametric preset actually staged, so the
//                          tool can check it against what it asked for
//   window.__shotError   — set instead of __shotReady when the query string
//                          named something that does not exist
// ============================================================
import React, { useEffect, useMemo, useState } from "react";
import GameCanvas from "@/game/client/GameCanvas";
import type { GamePlayer, WarriorClass, PlayerState, AttackDirection, HitZone } from "@/game/types";
import { WARRIOR_STATS } from "@/game/types";
import { defaultAppearance, HELM_VALUES, type Appearance } from "@/game/client/characters";

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

/**
 * A row of the same warrior in different helmets, evenly spaced about the
 * arena's z=6 line. 1.15 m apart: wide enough that no shoulder occludes the
 * next man's head, tight enough that five fit a frame the heads are still
 * readable in.
 */
function helmRow(helms: string[]): Pose[] {
  return helms.map((helm, i) => ({
    id: i === 0 ? "me" : `h${i}`,
    name: helm,
    cls: "huscarl" as WarriorClass,
    x: (i - (helms.length - 1) / 2) * 1.15,
    z: 6.0,
    rot: 0,
    state: "idle" as PlayerState,
    ap: { helm },
  }));
}

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
   * The preset is a stage, not a photograph: `?helm=` and `?turn=` redress and
   * rotate it, and the capture tool takes a series. Only a preset that opts in
   * reads them, so a stray query param can never quietly restage a shot that
   * was authored to be fixed.
   */
  parametric?: boolean;
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
      name: ["Huscarl", "Warden", "Runekeeper", "Berserker"][i],
      cls,
      x: -2.55 + i * 1.7,
      z: 6.0,
      rot: 0,
      state: "idle" as PlayerState,
    })),
  },
  // ---- Helmets. The shop's whole ladder, and the piece at the top of it. ----
  //
  // Five to a row and not ten: the row has to fit the frame, and fitting ten
  // across at this aspect puts the camera 11 m back, which is 25 px of head —
  // enough to count helmets and not enough to tell a crest from a rivet. The
  // question these shots exist to answer is whether the rungs differ in
  // SILHOUETTE, and that is a question about heads, so the camera sits at eye
  // level and lets the bodies crop.
  //
  // All huscarls, deliberately. The huscarl wears a mail coif, which is the one
  // head in the game that can swallow a nape flange — casting the row in the
  // class most likely to hide the new work is the honest test, not the kind one.
  // Ids stay distinct so each man draws a different face seed: a mask fitted to
  // one skull proves nothing about the next.
  helms: {
    cam: Math.PI,
    matchTimer: 40,
    // 5.6 m back, not 3.85: the first capture fitted five heads and clipped the
    // outer two men off at the shoulder, which reads as a botched photograph
    // rather than a row of warriors. A silhouette is a whole shape or it is not
    // a silhouette.
    framing: { position: [0, 1.85, 11.6], target: [0, 1.40, 6.0], fov: 44 },
    poses: helmRow(["none", "hood", "iron", "nasal", "ridge"]),
  },
  helms2: {
    cam: Math.PI,
    matchTimer: 40,
    // 5.6 m back, not 3.85: the first capture fitted five heads and clipped the
    // outer two men off at the shoulder, which reads as a botched photograph
    // rather than a row of warriors. A silhouette is a whole shape or it is not
    // a silhouette.
    framing: { position: [0, 1.85, 11.6], target: [0, 1.40, 6.0], fov: 44 },
    poses: helmRow(["spectacle", "boar", "crowned", "wyrm", "suttonhoo"]),
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
  // ---- The helmet card. One mark, one camera, one light. ------------------
  //
  // This replaces the row-of-five as the instrument for judging a helmet, and
  // it exists because the row could not answer the question it was built to
  // ask. Five men standing abreast at z=6 are five different distances and five
  // different bearings from the bonfire, which is the arena's largest source:
  // the middle of the row was backlit by flame and blown to orange while the
  // ends sat in shadow, so a strip cropped out of it compared ten silhouettes
  // across ten exposures. Panels that are not comparable are worse than no
  // panels, because a reviewer will compare them anyway and be confident.
  //
  // A card fixes every variable but the helmet. The man never moves, so the
  // photons are the same in every panel by construction rather than by
  // intention; the camera never moves, so scale and background are the same;
  // and the id stays "me" in all of them, so the face under the helmet is one
  // face and not ten seeds. `?turn=` puts him on a turntable instead of moving
  // the lens, which is the whole point — orbiting the camera would swing the
  // bonfire through the background and put the flame behind panel four again.
  //
  // The mark is `portrait`'s, at 8.4 m from the fire: far enough out that the
  // hearth is a fill rather than the key, which is what lets silver read as
  // silver and gold read as gold instead of both reading as orange. It is not
  // a neutral studio — there isn't one in this arena, the rig is a dusk rig —
  // but it is the most neutral standing room the world has, and every card
  // shares it.
  //
  // Negative `turn` rotates him *toward* the fire. At -35° his face still takes
  // the hearth square on; at +35° the same three-quarter puts it in shadow and
  // photographs the helmet's dark side. The sign is not cosmetic.
  //
  // 17.5° of vertical field over 2.05 m frames y 1.52–2.15: crest tip to collar
  // and nothing else. That is ~450 px of head against the ~200 px the cropped
  // row gave, which is the difference between seeing a garnet and inferring one.
  // It also crops the floating health bar, which sits above the head and was in
  // frame at the portrait's wider field.
  helmcard: {
    cam: Math.PI,
    matchTimer: 40,
    parametric: true,
    // 16, not the default 26. There is no camera lerp in photo mode (the
    // framing is set outright) and an idle pose has no swing to settle, so the
    // remaining frames are procedural texture generation. At ~3.5 s a frame on
    // a GPU-less box, ten frames saved is two minutes off a ten-card sheet.
    settle: 16,
    // x is -7.07 and not the mark's -7.0: the idle pose carries the head a
    // little off the body's own axis, and at this field that is 16% of the
    // frame width thrown away on one side. Measured off a front card, not
    // guessed. The camera is 4.4° above the target so the crown is in shot —
    // level, a crest that runs fore-and-aft is a line at the top of the skull.
    // Left at −7.07, and the record of why matters more than the number. A
    // turntable came back with the FRONT panel's head 145 mm left of the axis
    // while the other three sat square, so this mark was moved by that amount —
    // and every panel moved with it, because `camera.lookAt` is fed the target
    // outright and translating the pair re-aims nothing about their relationship
    // to each other. The front panel's shift is not in the mark; it is in the
    // pose, and correcting it needs a lateral term between position and target
    // rather than a new mark. Reverted rather than left half-applied: the
    // rotational correction below is what the 180° panel needed and it works.
    framing: { position: [-7.07, 2.0, 2.55], target: [-7.07, 1.81, 4.6], fov: 16.5 },
    poses: [
      { id: "me", name: "Raedwald", cls: "huscarl", x: -7.0, z: 4.6, rot: Math.PI, state: "idle", ap: { helm: "suttonhoo" } },
    ],
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
function makePlayer(p: Pose, isLocal: boolean, revived = false): GamePlayer {
  const stats = WARRIOR_STATS[p.cls];
  if (revived && p.state === "dead") p = { ...p, state: "idle", hp: 1, zone: undefined };
  const moving = p.state === "walking" || p.state === "running" || p.state === "sprinting";
  const speed = p.state === "sprinting" ? stats.sprintSpeed : stats.moveSpeed;
  return {
    id: p.id,
    name: p.name,
    warriorClass: p.cls,
    team: "none",
    ready: true,
    position: { x: p.x, y: 0, z: p.z },
    rotation: p.rot,
    velocity: moving ? { x: Math.sin(p.rot) * speed, y: 0, z: Math.cos(p.rot) * speed } : { x: 0, y: 0, z: 0 },
    health: stats.maxHealth * (p.hp ?? 1),
    maxHealth: stats.maxHealth,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appearance: { ...defaultAppearance(p.cls), ...(p.ap ?? {}) } as any,
  } as GamePlayer;
}

/**
 * The head is not on the body's axis, and `?turn=` turns the body.
 *
 * The card framing carries a fixed 70 mm lateral correction because at this
 * field that offset is 16% of the frame width — but the offset is fixed in the
 * MAN's frame, not the world's, so turning him swings it round a small circle
 * and the correction goes from right to wrong to backwards. At 180° it is
 * applied with the wrong sign on both axes, which is 150 mm of lateral error on
 * a 485 mm frame: the panel whose whole job is the crest and the nape guard put
 * the head half off the left edge and spent the rest of the frame on grass.
 *
 * So the correction is rotated with him. `right` is the measured offset off a
 * front card — the same number the framing used to hard-code — and `fwd` is the
 * depth half of it, which the fixed framing had no way to express at all: at
 * 180° the head comes forward and the panel was also a different scale from the
 * other three, which is the one thing a turntable must not be.
 */
const HEAD_OFF = { right: 0.070, fwd: 0.055 };

function aimAtHead(
  f: { position: [number, number, number]; target: [number, number, number]; fov?: number },
  turnDeg: number,
): { position: [number, number, number]; target: [number, number, number]; fov?: number } {
  if (!Number.isFinite(turnDeg)) return f;
  // The pose's own yaw. Forward is (sin, cos) and right is (cos, −sin), which is
  // the convention `makePlayer` builds velocity on.
  const rot = Math.PI + (turnDeg * Math.PI) / 180;
  const s = Math.sin(rot);
  const c = Math.cos(rot);
  // The authored framing already contains the offset at turn 0, so what is
  // applied is the DIFFERENCE from there. That keeps the front card pixel-identical
  // to the one that was measured and moves only the panels that were wrong.
  const dx = (HEAD_OFF.right * c + HEAD_OFF.fwd * s) - -HEAD_OFF.right;
  const dz = (-HEAD_OFF.right * s + HEAD_OFF.fwd * c) - -HEAD_OFF.fwd;
  return {
    // The camera moves with the target rather than swinging to face it: a
    // turntable is only a turntable if the bearing between lens and subject is
    // the same in every panel.
    position: [f.position[0] + dx, f.position[1], f.position[2] + dz],
    target: [f.target[0] + dx, f.target[1], f.target[2] + dz],
    fov: f.fov,
  };
}

export default function ShotPage() {
  const [params, setParams] = useState<URLSearchParams | null>(null);

  // The yaw is published here, in the same effect that unblocks the render,
  // rather than in an effect of its own. GameCanvas reads __photoCam from its
  // mount effect and React runs a child's effects before its parent's, so a
  // separate effect would always write the yaw one frame too late — `?cam=` was
  // silently ignored, and only appeared to work because every preset happens to
  // ask for the rig's default yaw of PI.
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const chosen = PRESETS[search.get("preset") ?? "duel"] ?? PRESETS.duel;
    const camOverride = search.get("cam");
    const globals = window as unknown as Record<string, unknown>;
    globals.__photoCam = camOverride !== null ? parseFloat(camOverride) : chosen.cam;
    // Deleted rather than left stale: these globals outlive a client-side
    // navigation, and a framing carried over from the previous preset would
    // silently pin the camera in a shot that meant to follow the warrior.
    if (chosen.framing) globals.__photoFraming = aimAtHead(chosen.framing, chosen.parametric ? parseFloat(search.get("turn") ?? "0") : 0);
    else delete globals.__photoFraming;
    setParams(search);
  }, []);

  // 0 is the preset as authored. 1 is the same room after `?revive=1` has put
  // every dead warrior back on his feet, so a capture can show what the body
  // looks like once the renderer has been asked to reassemble it.
  const [phase, setPhase] = useState<0 | 1>(0);
  const presetName = params?.get("preset") ?? "duel";
  const clean = params?.get("clean") === "1";

  /**
   * Restages a `parametric` preset from the query string, and refuses rather
   * than improvises when it cannot. An unknown helm value builds a bare head
   * and says nothing about it (see `HELM` in characters.ts), so a typo in the
   * capture tool would file a hatless man under "wyrm" and the sheet would read
   * as a helmet that does not differ from the one beside it. That is the exact
   * failure this whole pass exists to stop, so the harness proves what it
   * photographed: the applied subject is published for the tool to check
   * against what it asked for, and a value off the roster never renders at all.
   */
  const { preset, subject, subjectError } = useMemo(() => {
    const base = PRESETS[presetName] ?? PRESETS.duel;
    if (!params || !base.parametric) return { preset: base, subject: null, subjectError: null };
    const helm = params.get("helm");
    const turn = params.get("turn");
    if (helm !== null && !HELM_VALUES.includes(helm)) {
      return { preset: base, subject: null, subjectError: `unknown helm "${helm}"` };
    }
    const deg = turn !== null ? parseFloat(turn) : 0;
    if (!Number.isFinite(deg)) {
      return { preset: base, subject: null, subjectError: `unreadable turn "${turn}"` };
    }
    return {
      preset: {
        ...base,
        poses: base.poses.map((p) => ({
          ...p,
          rot: Math.PI + (deg * Math.PI) / 180,
          ap: { ...(p.ap ?? {}), ...(helm !== null ? { helm } : {}) },
        })),
      },
      subject: { helm: helm ?? base.poses[0]?.ap?.helm ?? "none", turn: deg },
      subjectError: null,
    };
  }, [presetName, params]);

  const roomState = useMemo(() => {
    const players: Record<string, GamePlayer> = {};
    preset.poses.forEach((p) => { players[p.id] = makePlayer(p, p.id === "me", phase === 1); });
    return {
      code: "PHOTO01",
      mode: "blood_moot",
      state: "fighting",
      arena: "saxon_village",
      players,
      hostId: "me",
      countdown: 0,
      matchTimer: preset.matchTimer,
      killFeed: [
        { killerName: "Aethelred", victimName: "Wulfred", timestamp: Date.now() },
        { killerName: "Beorn", victimName: "Aelric", timestamp: Date.now() },
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
    let frames = 0;
    let raf = 0;
    const override = params.get("settle");
    const authored = override !== null ? parseInt(override, 10) : (preset.settle ?? 26);
    // The second phase is short on purpose. Reassembly is one frame's work, so a
    // long hold would only prove that a standing warrior stays standing; what is
    // worth capturing is the frame right after the limbs go back on.
    const limit = phase === 1 ? 12 : authored;
    const t0 = performance.now();
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
        g.__shotMsPerFrame = (performance.now() - t0) / frames;
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

  return (
    <div className={`w-screen h-screen bg-black overflow-hidden ${clean ? "photo-clean" : ""}`}>
      {/* In clean mode every HUD/DOM overlay is hidden so the critic
          judges the rendered image alone, not the interface. */}
      {clean && (
        <style>{`
          .photo-clean canvas ~ * { display: none !important; }
        `}</style>
      )}
      <GameCanvas playerId="me" roomState={roomState as never} onSendInput={() => {}} />
    </div>
  );
}
