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
//   window.__photoCam   — camera yaw in radians, read by the renderer
//   window.__shotReady  — set true once N frames have been presented
// ============================================================
import React, { useEffect, useMemo, useState } from "react";
import GameCanvas from "@/game/client/GameCanvas";
import type { GamePlayer, WarriorClass, PlayerState, AttackDirection, HitZone } from "@/game/types";
import { WARRIOR_STATS } from "@/game/types";
import { defaultAppearance } from "@/game/client/characters";

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
    deathZone: p.state === "dead" ? (p.zone ?? "torso") : null,
    deathDir: p.state === "dead" ? (p.dir ?? "right") : null,
    deathHeavy: p.state === "dead" ? (p.heavy ?? false) : false,
    ...(isLocal ? {} : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appearance: defaultAppearance(p.cls) as any,
  } as GamePlayer;
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
    if (chosen.framing) globals.__photoFraming = chosen.framing;
    else delete globals.__photoFraming;
    setParams(search);
  }, []);

  // 0 is the preset as authored. 1 is the same room after `?revive=1` has put
  // every dead warrior back on his feet, so a capture can show what the body
  // looks like once the renderer has been asked to reassemble it.
  const [phase, setPhase] = useState<0 | 1>(0);
  const presetName = params?.get("preset") ?? "duel";
  const clean = params?.get("clean") === "1";
  const preset = PRESETS[presetName] ?? PRESETS.duel;

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
        g.__shotReady = true;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [params, preset, phase]);

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
