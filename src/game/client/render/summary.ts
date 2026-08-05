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
  stepWarriorTransform, poseWarrior, triggerEmote, carryGore,
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

// ---- The duel tableau's ground rules, all of them about the hearth. -------
//
// The bonfire burns at the world origin, its geometry reaches 2 m and its light
// and its bloom reach a great deal further. The first version of this stage
// took the corpse where it lay and pointed the lens at it, and a duel decided
// AT the fire — a shove into the flames, which is a headline play of this game
// and the way every bot and every harness kills — put the hearth square between
// the lens and the tableau at four metres. The result is the frame the owner
// rejected: an orange wash over every surface, and a body invisible inside a
// burning log pile. Nothing about the lights or the grade caused it; the camera
// was aimed into a fire.
//
// So the tableau is given a radius from the hearth that leaves room to stand
// the lens BETWEEN the fire and the men, looking outward, with the flames
// behind the camera. That is the composition the staged `summaryduel` capture
// has always had (its corpse lies at 8.7 m) and it is why that frame is cool
// blue-and-green while the real one was amber.
/** No lens, and no man, closer to the hearth than this. */
const HEARTH_CLEAR = 3.2;
/** The nearest the tableau may stand: HEARTH_CLEAR + a lens's working room. */
const DUEL_MIN_R = 7.6;
/** The furthest. Past this the palisade crowds the backdrop. */
const DUEL_MAX_R = 12.0;
/** Fallback bearing when a duel ends dead on the hearth: the portrait quarter. */
const STAGE_BEARING = { x: 0.06, z: 0.998 };
/**
 * Seconds of death clock at which the collapse is done arguing. `deathLayer`
 * has its last beat (`rest`) complete at 1.1; past that the pose is static.
 */
const DEATH_SETTLED = 1.6;

/**
 * What the stage decided, published for a capture harness. A summary frame is
 * aimed by code from wherever the fight happened to end, so "why does this
 * frame look like that" is otherwise unanswerable from outside — the first
 * version of this stage shipped aiming its lens straight through the bonfire
 * and every review of it argued about the colour grade instead. Written on
 * stage build only; nothing reads it in the game.
 */
function publishDiag(d: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>).__summaryStage = d;
}

const _box = new THREE.Box3();

/**
 * Where the staged bodies ACTUALLY ended up, per frame, for a harness that has
 * asked for it (`window.__summaryDiag = true`). Off by default and free when
 * off: a world bounding box per man per frame is not something the game pays
 * for so that a screenshot can be argued about. It exists because "the corpse
 * is floating" and "the corpse is further away than it should be" produce the
 * same pixels, and only one of them is a bug in this file.
 */
function reportBodies(
  cast: CastMember[] | null, warriors: Map<string, StagedBody>, cam: THREE.PerspectiveCamera,
): void {
  if (typeof window === "undefined" || !cast) return;
  const w = window as unknown as Record<string, unknown>;
  if (!w.__summaryDiag) return;
  // Where the lens ACTUALLY is when the shutter goes, which is not where the
  // push was aimed: `summaryT` accumulates rendered dt, so a slow renderer is
  // still travelling long after the wall clock says the move is over.
  w.__summaryCam = [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)];
  w.__summaryBodies = cast.map((m) => {
    const b = warriors.get(m.id);
    if (!b) return { id: m.id, missing: true };
    // The BODY, not the group: the HUD hangs its name plates off the group and
    // a box round that measures a floating label, not a man.
    _box.setFromObject(b.rig.body);
    return {
      id: m.id, state: m.player.state,
      at: [b.rig.group.position.x, b.rig.group.position.y, b.rig.group.position.z],
      lo: +_box.min.y.toFixed(3), hi: +_box.max.y.toFixed(3),
      actT: +b.motion.actT.toFixed(2), fall: b.motion.fall,
    };
  });
}

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

  /**
   * The fallen man carried onto the stage's mark, still exactly as he died.
   * State, health, severance, burn and facing are untouched — this moves the
   * ground under a corpse and nothing else.
   */
  const lay = (p: GamePlayer, x: number, z: number): GamePlayer => ({
    ...freeze(p),
    position: { x, y: 0, z },
    velocity: { x: 0, y: 0, z: 0 },
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
   * Three lights on the tableau, over the arena's own dusk rig.
   *
   * `camDir` points from the subject TOWARD the lens, so the three marks are a
   * portrait rig read straight off it: key on the lens's left shoulder, rim
   * opposite the lens, fill down the lens axis.
   *
   * The previous pass named its two lights key and rim and then stood them the
   * wrong way round — the warm "key" sat 1.4 m BEHIND the man and the cool
   * "rim" 1.9 m in FRONT of him, which is a warm hair light and a cold frontal
   * fill. Its author scored the result 7.5 and wrote down what was missing:
   * nothing separated the victor from the background, because the only light
   * that could have drawn his edge was pointed at his face.
   *
   * Sized against the hearth's own lights (31–60): with decay 2 the key lands
   * on the man at about a fifth of what standing beside the fire reads as. The
   * rim runs hotter than the key on purpose — it is grazing an edge, not
   * lighting a face — but it is a SPOT with a tight cone aimed at his chest, so
   * what it actually reaches is one man's shoulders and a metre of ground, not
   * the field behind him. A phone crops in hard on this man; the numbers were
   * settled against the 390-wide frame, not the desktop one.
   */
  function raiseLights(at: THREE.Vector3, camDir: THREE.Vector3, spill?: THREE.Vector3): void {
    const g = new THREE.Group();
    const leftX = -camDir.z, leftZ = camDir.x;
    // KEY — warm, three-quarter front left, high. Aimed between the victor and
    // the body at his feet when there is one, so the same light that models his
    // face is the light the corpse is read by: the fallen man is the point of
    // the picture and a stage that lit only the standing one would be lying.
    const key = new THREE.SpotLight(0xffd2a0, 86, 17, 0.7, 0.62, 2);
    key.position.set(
      at.x + leftX * 2.2 + camDir.x * 1.7, at.y + 3.0, at.z + leftZ * 2.2 + camDir.z * 1.7);
    key.target.position.copy(spill ? spill.clone().add(at).multiplyScalar(0.5) : at);
    g.add(key, key.target);
    // RIM — cool, behind him and off the other shoulder, just above head height
    // so the edge it draws runs down helm, shoulder and axe rather than lighting
    // his heels.
    // Nearly LEVEL with his chest, not above him. A rim hung high enough to
    // look like a rim throws its cone onto the turf behind the men, and at the
    // intensity an edge needs that lands as a blue spotlight puddle on the
    // grass — which is worse than no rim at all, and is what the first two
    // attempts at this produced. Level, the cone grazes the ground at a glancing
    // angle and dies; what it lights is a man.
    // And OFF THE OTHER SHOULDER from the key, three-quarters behind rather
    // than square behind: a light directly at his back wraps the same thin
    // edge onto both sides of him and reads as nothing at all on a 390-wide
    // frame. From the far side it draws one long lit edge down the side of the
    // man the key is not reaching, which is what separation actually is.
    const rim = new THREE.SpotLight(0x9ec6ff, 270, 9, 0.34, 0.5, 2);
    rim.position.set(
      at.x - camDir.x * 1.5 - leftX * 2.8, at.y + 1.05, at.z - camDir.z * 1.5 - leftZ * 2.8);
    rim.target.position.set(at.x, at.y + 0.3, at.z);
    g.add(rim, rim.target);
    // FILL — cool, weak, down the lens axis. Keeps the shadow side off black
    // without flattening what the other two just built.
    const fill = new THREE.PointLight(0x8fb4ff, 16, 9, 2);
    fill.position.set(at.x + camDir.x * 2.6, at.y + 1.5, at.z + camDir.z * 2.6);
    g.add(fill);
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
      // WHERE HE FELL is the server's word for it, not the renderer's.
      //
      // The first version anchored on motion.rx/rz — the smoothed, extrapolated
      // body — read on the frame the stage is built. A man killed at a sprint
      // is nowhere near his own corpse in that value: measured on the real
      // flow it sat 2.4–3.8 m from the wire position and drifted back over the
      // seconds that followed, so the lens settled on a patch of mud while the
      // body slid out of a phone's narrow crop. `loser.position` is where the
      // sim stopped him and it is the same number on the cold /shot path,
      // where motion was seeded from it and no step has run.
      const fellX = loser.position.x, fellZ = loser.position.z;
      const r0 = Math.hypot(fellX, fellZ);
      // The bearing he lies on. A duel decided IN the hearth has no useful
      // bearing of its own, so it borrows the victor's, and failing that the
      // quarter every framed shot in this game is composed into.
      const vr = Math.hypot(victor.position.x, victor.position.z);
      let ux: number, uz: number;
      if (r0 > 0.9) { ux = fellX / r0; uz = fellZ / r0; }
      else if (vr > 0.9) { ux = victor.position.x / vr; uz = victor.position.z / vr; }
      else { ux = STAGE_BEARING.x; uz = STAGE_BEARING.z; }
      // The tableau's mark: his own place if there is room to shoot it, else
      // carried out along his own bearing until there is. A body that fell in
      // the fire is carried clear — the alternative is the shipped frame, where
      // the owner's favourite part of this feature was inside a burning log
      // pile and could not be seen at all. He keeps his pose, his severance and
      // his smoke; only the ground under him changes.
      const R = Math.min(DUEL_MAX_R, Math.max(DUEL_MIN_R, r0));
      const cx = ux * R, cz = uz * R;
      const carriedX = cx - fellX, carriedZ = cz - fellZ;
      const carried = Math.hypot(carriedX, carriedZ);
      // The lens stands INSIDE the tableau, between hearth and men, looking
      // outward with the fire behind it and the village behind them. There is
      // no second branch any more: the tangential shot the near case used to
      // take is what aimed the camera through the bonfire.
      const nx = -ux, nz = -uz;
      const endR = Math.max(HEARTH_CLEAR, R - 4.4);
      const startR = Math.max(HEARTH_CLEAR - 0.4, endR - 1.7);
      const vx = cx + ux * DUEL_STANDOFF;
      const vz = cz + uz * DUEL_STANDOFF;
      const facing = Math.atan2(nx, nz);
      staged.push({ id: loser.id, player: lay(loser, cx, cz) });
      staged.push({ id: victor.id, player: stand(victor, vx, vz, facing + 0.18) });
      const dead = warriors.get(loser.id);
      if (dead) {
        // Snapped even when the mark is his own: the smoothing is mid-flight at
        // the moment a match ends and a corpse that is still catching up with
        // itself walks across the frame under a lens that has stopped moving.
        snap(dead.motion, cx, cz, dead.motion.yaw);
        // THE COLLAPSE IS OVER BEFORE THE PORTRAIT BEGINS.
        //
        // `motion.actT` is the death clock the animator eases the collapse on,
        // and it counts rendered frames, not wall clock. A match can end on the
        // frame the killing blow lands, and on a phone that has just spent a
        // fight at 30 fps and is now compositing a stage, the body arrives at
        // the tableau still toppling — pivoted about the hips, arms out, a
        // metre off the turf. That is the "oddly stiff corpse" this feature
        // shipped with: not a pose bug, a pose caught mid-fall and then
        // photographed. The stage runs the clock out so the first frame of the
        // portrait is a body that has already landed, whatever the frame rate.
        dead.motion.actT = Math.max(dead.motion.actT, DEATH_SETTLED);
        // His arm goes with him. A severed piece is integrated in world space
        // off the arena root, so a corpse carried out of the fire would
        // otherwise leave its own head behind in the flames.
        if (carried > 0.001) carryGore(dead.rig, carriedX, carriedZ);
      }
      const w = warriors.get(victor.id);
      if (w) snap(w.motion, vx, vz, facing + 0.18);
      deps.douse(victor.id);

      const gy = deps.groundAt(cx, cz);
      // The aim point leans toward the CORPSE, not the midpoint: on a phone
      // the portrait crop is savage sideways, and the dead man — the owner's
      // favourite part of this — was the thing it cropped first. The victor
      // stands close enough behind him that he rides up-frame instead of out.
      const midX = cx + ux * 0.55, midZ = cz + uz * 0.55;
      // The push is short at the near mark, so most of the move is the drop in
      // height: the lens settles onto the pair rather than crawling at them.
      const shot = {
        from: [ux * startR, gy + 2.3, uz * startR] as [number, number, number],
        to: [ux * endR, gy + 1.68, uz * endR] as [number, number, number],
        target: [midX, gy + 0.95, midZ] as [number, number, number],
        fov: 50, seconds: 8,
      };
      deps.rig.setSummaryShot(shot);
      raiseLights(
        new THREE.Vector3(vx, gy + 1.1, vz), new THREE.Vector3(nx, 0, nz),
        new THREE.Vector3(cx, gy + 0.3, cz));
      publishDiag({
        kind: "duel", fell: [fellX, fellZ], fellR: r0, carried,
        corpse: [cx, cz], corpseR: R, victor: [vx, vz],
        lensR: endR, ...shot, cause: loser.deathCause ?? null,
      });
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
    publishDiag({
      kind: victor ? "wall" : "draw", cast: staged.length,
      from: [2.3, gy + 2.1, 11.1], to: [camEnd.x, gy + 1.7, camEnd.z],
      target: [VICTOR_MARK.x, gy + 1.12, focusZ],
    });
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
      reportBodies(cast, warriors, deps.rig.camera);
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
