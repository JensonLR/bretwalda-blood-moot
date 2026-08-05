// The end-of-match tableau — the summary screen IS the game, staged.
//
// When the room reaches "finished" the sim stops feeding the renderer anything
// worth looking at: the wire freezes mid-carnage and the old client swapped to
// a menu two seconds later. This module keeps the arena on screen and restages
// the men who fought it: the victor centre frame, lit and facing the lens; the
// rest of the moot stood back up into a shield-wall line behind him; and in a
// duel the loser is NOT stood up — his corpse lies exactly where the gore
// system dropped it, and the victor is posed over it. The numbers are DOM and
// live in page.tsx; everything in here is scene.
//
// Nothing in this file invents match state. The verdict is the server's
// `match_end` payload passed down whole, and the bodies are the same rigs the
// fight drove — restaged by feeding `poseWarrior` a frozen copy of each man's
// record, which is exactly the late-joiner path the animator already owns
// (state change to "idle" is what reassembles a severed body; a record still
// "dead" keeps the corpse). No sound is made here: the victory and loss music
// already fire off `match_end` in page.tsx.
import * as THREE from "three";
import type { GamePlayer, MatchEndData } from "../../types";
import {
  stepWarriorTransform, poseWarrior, triggerEmote,
  type WarriorRig, type WarriorMotion, type AnimHooks,
} from "./anim";
import type { EmoteId } from "../../types";
import type { CameraRig, SummaryShot } from "./camera";
import type { FrameContext } from "./quality";

/** The one slice of a warrior slot the stage needs. */
export interface StagedBody {
  rig: WarriorRig;
  motion: WarriorMotion;
}

export interface SummaryRoomView {
  mode: string;
  players: Record<string, GamePlayer>;
}

export interface SummaryDeps {
  scene: THREE.Scene;
  rig: CameraRig;
  /** The arena's own height field — men and lens both stand on real ground. */
  groundAt(x: number, z: number): number;
  /**
   * Put out a warrior's flames before he joins the line. The burners are keyed
   * per id and the fight loop stops feeding them on this path, so a man who
   * died alight would otherwise stand in the wall still wearing fire that the
   * server has long since put out. The duel corpse is deliberately NOT doused —
   * a smouldering body is part of the picture.
   */
  douse(id: string): void;
}

export interface SummaryHandle {
  /** Stages on first call after a reset, then poses the cast every frame. */
  update(
    dt: number, ctx: FrameContext, room: SummaryRoomView,
    verdict: MatchEndData, warriors: Map<string, StagedBody>, localId: string,
  ): void;
  /** Tears the stage down so the next match can raise its own. */
  reset(): void;
}

interface CastMember {
  id: string;
  /**
   * The record the pose is driven from, frozen at stage time — the server
   * resets every player for the lobby ten seconds in, and a tableau read off
   * the live wire would watch its corpse stand up and walk to the spawn.
   */
  player: GamePlayer;
}

// The line staging is authored, not derived, and it borrows the `lineup`
// capture preset's proven geometry: men on open ground south of the bonfire,
// lens further south looking north over them, so the hearth burns in the far
// background as a backdrop instead of blowing out the frame. Everything stands
// inside the arena's prop-free ring (CLEAR_RADIUS 6.2 in world.ts), so the
// wall cannot be staged through a barrel however the match went.
// The victor's mark sits well proud of the line — at the lens's end mark he
// stands a third again the wall's height in frame, which is what makes him
// the victor before any text says so. 5.3 was authored first and the capture
// read as one more man stood slightly out of rank.
const VICTOR_MARK = { x: 0.35, z: 5.85 };
const LINE_Z = 3.55;
const LINE_SPACING = 1.12;
/** Metres between the duel corpse and the man stood over it. */
const DUEL_STANDOFF = 1.7;

export function createSummary(deps: SummaryDeps): SummaryHandle {
  let cast: CastMember[] | null = null;
  let lights: THREE.Group | null = null;
  const hooks: AnimHooks = { groundAt: deps.groundAt };
  // The victor performs his CHOSEN emote on the stage, on a loop slow enough
  // to read as pride rather than a glitch. The id is the one the server kept
  // on his record — the flourish he actually used — and a victor who never
  // emoted stands still, which is its own kind of statement.
  let victorId: string | null = null;
  let victorEmote: EmoteId | null = null;
  let emoteClock = 0;

  /** A copy deep enough that the sim's lobby reset cannot reach into it. */
  const freeze = (p: GamePlayer): GamePlayer => ({
    ...p,
    position: { ...p.position },
    velocity: { ...p.velocity },
  });

  /** A dead man handed back his feet, on a mark, facing `rot`. */
  const stand = (p: GamePlayer, x: number, z: number, rot: number): GamePlayer => ({
    ...freeze(p),
    position: { x, y: 0, z },
    rotation: rot,
    velocity: { x: 0, y: 0, z: 0 },
    state: "idle",
    health: p.maxHealth,
    attackPhase: null, attackTimer: 0, blockTimer: 0, staggerTimer: 0,
    hitstop: 0, invincible: false, abilityActive: false,
    burning: false, burnTimer: 0, burnInside: false,
    deathZone: null, deathDir: null, deathHeavy: false, deathCause: null,
  });

  /** Teleport is a cut: no glide to the mark, no cloth yank from the jump. */
  const snap = (m: WarriorMotion, x: number, z: number, rot: number): void => {
    m.rx = x; m.rz = z; m.yaw = rot;
    m.pxPrev = x; m.pzPrev = z; m.yawPrev = rot;
    m.vx = 0; m.vz = 0; m.ax = 0; m.az = 0; m.yawRate = 0;
    m.recoil = 0; m.flinch = 0;
  };

  /**
   * A warm key and a cool rim on the victor, over the arena's own dusk rig.
   * Sized against the hearth's own lights (31–60): with decay 2 the key lands
   * on the man at about a fifth of what standing beside the fire reads as —
   * enough to pick him out of the dusk, or out of open moonlight when a duel
   * ended far from the hearth. The first pass authored these at 26/11 and the
   * capture showed NOTHING — both sat entirely under the grade's ambience, and
   * a stage light that cannot be seen in the frame is a comment, not a light.
   */
  function raiseLights(at: THREE.Vector3, camDir: THREE.Vector3): void {
    const g = new THREE.Group();
    const leftX = -camDir.z, leftZ = camDir.x;
    const key = new THREE.SpotLight(0xffd9a0, 80, 15, 0.55, 0.55, 2);
    key.position.set(at.x + leftX * 2.4 - camDir.x * 1.4, at.y + 3.1, at.z + leftZ * 2.4 - camDir.z * 1.4);
    key.target.position.copy(at);
    g.add(key, key.target);
    const rim = new THREE.PointLight(0x8fb4ff, 30, 9, 2);
    rim.position.set(at.x + camDir.x * 1.9, at.y + 2.1, at.z + camDir.z * 1.9);
    g.add(rim);
    deps.scene.add(g);
    lights = g;
  }

  function buildStage(
    room: SummaryRoomView, verdict: MatchEndData, warriors: Map<string, StagedBody>,
  ): CastMember[] {
    const staged: CastMember[] = [];
    // Who remains: disconnected men have no record and no rig, and the stage
    // holds who is actually here rather than who the results table remembers.
    const here = Object.values(room.players).filter((p) => warriors.has(p.id));
    // The results arrive in the room's JOIN order — the server never sorts
    // them (page.tsx sorts its own copy for the ledger). Rank here has to
    // mean merit, or "the side's best leads the wall" quietly becomes "the
    // host leads the wall".
    const rank = new Map(
      [...verdict.results].sort((a, b) => b.score - a.score).map((r, i) => [r.id, i]));
    here.sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));

    let victor: GamePlayer | null = null;
    if (verdict.winnerKind === "player" && verdict.winnerId) {
      victor = here.find((p) => p.id === verdict.winnerId) ?? null;
    } else if (verdict.winnerKind === "team" && verdict.winnerTeam) {
      // A war band's round is won by a side; its portrait is led by the side's
      // best, with his shield-brothers nearest him in the wall.
      victor = here.find((p) => p.team === verdict.winnerTeam) ?? null;
    }
    victorId = victor?.id ?? null;
    victorEmote = victor?.emote ?? null;
    // First performance shortly after the cut, once the lens has settled.
    emoteClock = 1.1;

    // THE OWNER'S FAVOURITE: in a duel the loser lies where he fell. The gore
    // system already left the body — severed, smouldering, whatever the last
    // blow made of it — so the corpse is frozen as-is and never re-marked.
    const loser = here.find((p) => victor && p.id !== victor.id) ?? null;
    const duel = here.length === 2 && victor !== null
      && loser !== null && loser.state === "dead";

    if (duel && victor && loser) {
      // The corpse anchor is the renderer's own idea of where the body lies —
      // motion.rx/rz, NOT rig.group.position. The group is only moved by
      // stepWarriorTransform, and a canvas mounted straight into a finished
      // room (a /shot capture, a refresh mid-summary) builds the rig and
      // stages in the same frame, before any step has run — its group is at
      // the origin, and a shot aimed off it framed the bonfire with the whole
      // tableau hidden inside the flames. motion is seeded from the wire
      // position at creation and tracks the smoothed body ever after, so it is
      // right on both the warm path and the cold one.
      const body = warriors.get(loser.id);
      const cx = body ? body.motion.rx : loser.position.x;
      const cz = body ? body.motion.rz : loser.position.z;
      const r = Math.hypot(cx, cz);
      // The lens axis, chosen so the shot can be taken anywhere the man fell:
      // far out, shoot from the middle of the arena looking outward (the
      // village is his backdrop); close in, shoot along the tangent so the
      // bonfire stays off-axis instead of framing the camera inside it.
      const ux = r > 0.3 ? cx / r : 1, uz = r > 0.3 ? cz / r : 0;
      let nx: number, nz: number, dist: number;
      if (r >= 5.2) {
        nx = -ux; nz = -uz;
        dist = Math.min(4.6, Math.max(2.6, r - 2.8));
      } else {
        nx = -uz; nz = ux;
        dist = 4.3;
      }
      const vx = cx - nx * DUEL_STANDOFF;
      const vz = cz - nz * DUEL_STANDOFF;
      const facing = Math.atan2(nx, nz);
      staged.push({ id: loser.id, player: freeze(loser) });
      staged.push({ id: victor.id, player: stand(victor, vx, vz, facing + 0.18) });
      const w = warriors.get(victor.id);
      if (w) snap(w.motion, vx, vz, facing + 0.18);
      deps.douse(victor.id);

      const gy = deps.groundAt(cx, cz);
      // The aim point leans toward the CORPSE, not the midpoint: on a phone
      // the portrait crop is savage sideways, and the dead man — the owner's
      // favourite part of this — was the thing it cropped first. The victor
      // stands close enough behind him that he rides up-frame instead of out.
      const midX = cx - nx * 0.55, midZ = cz - nz * 0.55;
      deps.rig.setSummaryShot({
        from: [cx + nx * (dist + 1.9), gy + 1.75, cz + nz * (dist + 1.9)],
        to: [cx + nx * dist, gy + 1.35, cz + nz * dist],
        target: [midX, gy + 0.95, midZ],
        fov: 50, seconds: 8,
      });
      raiseLights(new THREE.Vector3(vx, gy + 1.1, vz), new THREE.Vector3(nx, 0, nz));
      return staged;
    }

    // Everyone else: the wall. Ranked men take the middle of the line, and in
    // a war band the winning side stands nearest its champion. A draw stages
    // the whole moot as the wall with nobody out front — the match said no man
    // was above the rest, and the picture says the same.
    const others = here.filter((p) => p.id !== victor?.id);
    if (verdict.winnerKind === "team" && verdict.winnerTeam) {
      others.sort((a, b) =>
        (a.team === verdict.winnerTeam ? 0 : 1) - (b.team === verdict.winnerTeam ? 0 : 1)
        || (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
    }
    // A draw's wall steps forward to meet the lens, but not onto the victor's
    // own mark — eight abreast that close would crop at both edges.
    const lineZ = victor ? LINE_Z : 5.0;
    // Symmetric offsets, filled centre-out so rank reads left-to-right-ish
    // from the middle of the wall.
    const offs = others.map((_, i) => (i - (others.length - 1) / 2) * LINE_SPACING)
      .sort((a, b) => Math.abs(a) - Math.abs(b));
    const camEnd = new THREE.Vector3(1.55, 0, 9.3);
    others.forEach((p, i) => {
      const x = VICTOR_MARK.x + offs[i];
      const z = lineZ - Math.abs(offs[i]) * 0.12;
      const rot = Math.atan2(camEnd.x - x, camEnd.z - z);
      staged.push({ id: p.id, player: stand(p, x, z, rot) });
      const w = warriors.get(p.id);
      if (w) snap(w.motion, x, z, rot);
      deps.douse(p.id);
    });
    if (victor) {
      staged.push({ id: victor.id, player: stand(victor, VICTOR_MARK.x, VICTOR_MARK.z, 0.18) });
      const w = warriors.get(victor.id);
      if (w) snap(w.motion, VICTOR_MARK.x, VICTOR_MARK.z, 0.18);
      deps.douse(victor.id);
    }

    const focusZ = victor ? VICTOR_MARK.z : lineZ;
    const gy = deps.groundAt(VICTOR_MARK.x, focusZ);
    deps.rig.setSummaryShot({
      from: [2.3, gy + 2.1, 11.1],
      to: [camEnd.x, gy + 1.7, camEnd.z],
      target: [VICTOR_MARK.x, gy + 1.12, focusZ],
      fov: 50, seconds: 8,
    });
    raiseLights(
      new THREE.Vector3(VICTOR_MARK.x, gy + 1.1, focusZ),
      new THREE.Vector3(camEnd.x - VICTOR_MARK.x, 0, camEnd.z - focusZ).normalize(),
    );
    return staged;
  }

  return {
    update(dt, ctx, room, verdict, warriors, localId) {
      void localId;
      if (!cast) cast = buildStage(room, verdict, warriors);
      // The orchestrator normally stamps the mode per frame; on this path the
      // stage does, so nothing else has to know the summary exists.
      deps.rig.setMode("summary");
      for (const member of cast) {
        const body = warriors.get(member.id);
        if (!body) continue;
        stepWarriorTransform(body.rig, body.motion, member.player, dt, ctx);
        poseWarrior(body.rig, body.motion, member.player, dt, ctx, hooks);
      }
      // The victor's flourish, looping. Silent on purpose — this module makes
      // no sound (see the header); a deliberate press still voices through the
      // orchestrator's relay path.
      if (victorId && victorEmote) {
        emoteClock -= dt;
        if (emoteClock <= 0) {
          emoteClock = 4.6;
          const body = warriors.get(victorId);
          if (body) triggerEmote(body.motion, victorEmote);
        }
      }
    },

    reset() {
      if (!cast && !lights) return;
      cast = null;
      victorId = null;
      victorEmote = null;
      if (lights) {
        deps.scene.remove(lights);
        lights.traverse((o) => {
          const l = o as THREE.Light;
          if (l.isLight) l.dispose();
        });
        lights = null;
      }
    },
  };
}
