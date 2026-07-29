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
import type { GamePlayer, WarriorClass, PlayerState, AttackDirection } from "@/game/types";
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
};

/** Camera yaw is chosen per preset so framing is reproducible. */
const PRESETS: Record<string, { cam: number; poses: Pose[]; matchTimer: number; lastStand?: boolean }> = {
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
      const a = (i / 8) * Math.PI * 2;
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

function makePlayer(p: Pose, isLocal: boolean): GamePlayer {
  const stats = WARRIOR_STATS[p.cls];
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
    lastHitBy: "",
    comboCount: 0,
    comboTimer: 0,
    invincible: false,
    invincibleTimer: 0,
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
    (window as unknown as Record<string, unknown>).__photoCam =
      camOverride !== null ? parseFloat(camOverride) : chosen.cam;
    setParams(search);
  }, []);

  const presetName = params?.get("preset") ?? "duel";
  const clean = params?.get("clean") === "1";
  const preset = PRESETS[presetName] ?? PRESETS.duel;

  const roomState = useMemo(() => {
    const players: Record<string, GamePlayer> = {};
    preset.poses.forEach((p) => { players[p.id] = makePlayer(p, p.id === "me"); });
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
  }, [preset]);

  // Signal readiness only after the renderer has presented enough frames
  // for lerped camera/pose state to settle. Every lerp in the rig and the poses
  // runs at min(1, dt * k) with dt capped at 0.05, so the slowest of them is
  // within a thousandth of its target inside 40 frames. 140 was free when a
  // frame was 300 ms; with the post chain on a software rasteriser it is two
  // and a half minutes, and the capture times out before the scene is ever
  // photographed.
  useEffect(() => {
    if (!params) return;
    let frames = 0;
    let raf = 0;
    const tick = () => {
      frames++;
      if (frames > 60) {
        (window as unknown as Record<string, unknown>).__shotReady = true;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [params]);

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
