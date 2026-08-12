// The end-of-match tableau — the summary screen IS the game, staged.
//
// When the room reaches "finished" the sim stops feeding the renderer anything
// worth looking at: the wire freezes mid-carnage and the old client swapped to
// a menu two seconds later. This module keeps the arena on screen and restages
// the men who fought it: the honoured few on their feet, lit and facing the
// lens, and EVERY OTHER MAN LEFT DEAD ON THE GROUND. The numbers are DOM and
// live in page.tsx; everything in here is scene.
//
// The shield-wall line this replaced stood the whole moot back up, which is a
// picture of attendance rather than of a result — the owner's word for it was
// that only the winners' circle should be on its feet.
//
// The duel tableau is composed AGAINST THE BONFIRE — see the block of
// constants below. That is not decoration: the first version of this file was
// signed off on a staged capture whose corpse happened to lie 8.7 m out, and
// shipped a real-match frame that was aimed straight into the fire.
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
  stepWarriorTransform, poseWarrior, triggerEmote, carryGore, cutNetHistory,
  type WarriorRig, type WarriorMotion, type AnimHooks,
} from "./anim";
import type { EmoteId } from "../../types";
import type { CameraRig, SummaryShot } from "./camera";
import type { FrameContext, QualitySettings } from "./quality";

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
  /**
   * May this man perform a flourish on the stage? ONLY THE STANDING MAY EMOTE:
   * a podium tableau lays most of the moot out dead, and a corpse that raises
   * its axe because its owner tapped a button is the one thing that would make
   * the whole picture read as a bug. The verdict is the stage's, because the
   * stage is the only thing that knows who it stood up — the wire says a man
   * is "dead" until the server rolls the room back to the lobby ten seconds
   * in, and after that it says every corpse on screen is idle.
   */
  canPerform(id: string): boolean;
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
  /** True for the honoured few. The dead take no requests — see `canPerform`. */
  standing: boolean;
}

// ---- THE PODIUM RULE, stated once. ---------------------------------------
//
// ONLY THE HONOURED STAND. Everyone else lies dead where the tableau puts him,
// as a real corpse: the same frozen record the fight left, so his pose, his
// severance and — the point — his kit, his helm and his cloak are the ones he
// was killed in. A corpse is the last frame anyone sees of what a player spent
// his gold on, so nothing here swaps a man for a prop.
//
//   solo / training   no tableau at all — page.tsx never raises the summary
//                     for it, and this module returns an empty cast.
//   duel (2 men)      one stands, one lies. That is already the shape the
//                     hearth-radial branch below composes, and it is left
//                     exactly as it was.
//   free-for-all      the top `podiumSize(n)` men by the SAME ranking the DOM
//                     ledger prints, so the picture and the numbers agree.
//   war band          ranks SIDES, not men: the winning side stands whole and
//                     the losing side lies whole, however many that is.
//   draw              nobody is honoured, so nobody stands. The screen already
//                     says BLOOD SPILT — A DRAW; the ground says it too.
//
/** Never a fourth man in the circle, however big the moot. */
const PODIUM_MAX = 3;
/**
 * How many men a free-for-all honours, from the headcount alone: half the
 * moot, capped at three and never fewer than one. 4 men give a two-man
 * podium, 6 and 8 give three, and a duel gives the one man left standing.
 */
export function podiumSize(headcount: number): number {
  return Math.max(1, Math.min(PODIUM_MAX, Math.floor(headcount / 2)));
}

// ---- The podium's marks, in the arena's own coordinates. ------------------
//
// Same ground the shield wall was composed on and for the same reasons: open
// ground south of the bonfire with the lens further south still, so the hearth
// burns in the far background as a backdrop instead of blowing out the frame,
// and every man inside the arena's prop-free ring (CLEAR_RADIUS 6.2 in
// world.ts) so nobody is staged inside a barrel however the match went.
const STAGE_X = 0.15;
/** The victor's mark: the closest man to the lens, and centre of the circle. */
const STAGE_FRONT_Z = 6.0;
/**
 * How far off the stage's axis the lens stands. Two jobs, and the second is
 * the one that sets the number: dead-on is a passport photograph, and — more
 * importantly — the bonfire burns at the world origin directly BEHIND this
 * tableau. Square on, the hearth sits in the middle of the frame and every
 * corpse laid between the podium and it is a silhouette inside a blown-out
 * orange hole; measured on the real eight-man flow at 390x844, that is what
 * the first podium capture did with the fallen. Swung this far round, the fire
 * lands out at the edge of the frame where it is a warm backdrop, and the men
 * are read against the dark village instead.
 */
const LENS_OFFSET_X = 3.4;
/** Eye height at the end of the push: a man's, not a drone's. */
const LENS_HEIGHT = 2.0;
/**
 * How often the stage re-measures the DOM band, in seconds. The overlay is
 * React's and it mounts on its own schedule — the first summary frame can be
 * drawn before the ledger exists, and the ledger's height depends on how many
 * men are in it — so a lens solved once, on frame one, is solved against a
 * screen that is not the one the player ends up looking at.
 */
const REFRAME_EVERY = 0.75;

/**
 * Where the i-th honoured man stands. The victor takes the front mark alone;
 * the rest fall in behind him left and right, each pair a step wider and a
 * step further back, so the group reads as a wedge with one man at its point
 * rather than as a row that happens to have someone in it.
 */
function podiumMark(i: number): { x: number; z: number } {
  if (i === 0) return { x: STAGE_X, z: STAGE_FRONT_Z };
  const side = i % 2 === 1 ? -1 : 1;
  const tier = Math.ceil(i / 2) - 1;
  return { x: STAGE_X + side * (0.98 + 0.74 * tier), z: STAGE_FRONT_Z - 1.0 - 0.44 * tier };
}

/**
 * Where the k-th fallen man lies. They fan away from the lens BEHIND the
 * podium rather than in front of it, alternating sides and receding: in front
 * they would land in the bottom of the frame, which on a phone is the ledger
 * panel, and this is the fan the framing solver can actually fit into the
 * narrow band of glass the DOM leaves free.
 */
function fallenMark(k: number): { x: number; z: number } {
  const side = k % 2 === 0 ? -1 : 1;
  const tier = Math.floor(k / 2);
  return {
    x: STAGE_X + side * (0.72 + 0.46 * tier),
    z: 4.15 - 0.52 * tier - (k % 2) * 0.26,
  };
}

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

// ---- The key light's shadow, in the units three wants it in. -------------
/** The key's reach. Also the far plane three forces on its shadow camera. */
const KEY_RANGE = 17;
const KEY_SHADOW_NEAR = 0.6;
/** Light-to-subject distance the bias is tuned at: the key's own offset. */
const KEY_SHADOW_REF = 3.4;
/** Depth bias at that range, in metres, before normalisation. */
const KEY_BIAS_METRES = 0.012;

// ---- The glass the DOM leaves free, and the lens that fits the tableau into
// ---- it. ------------------------------------------------------------------
//
// On a phone the summary overlay is not a garnish, it is most of the screen:
// the verdict band across the top and, under the thumb, the emote row, a
// ledger that grows with the headcount to a 34vh cap and two buttons. An
// eight-man moot at 390x844 leaves a horizontal slot of glass in between, and
// a tableau composed without knowing where that slot is has half its cast
// behind a panel — which is exactly the bug the duel lens was fixed for once
// already, by hand, with a magic aim height.
//
// So it is measured instead of guessed, and measured GENERICALLY: this module
// does not know page.tsx's markup and must not, so it asks the document which
// wide, visible boxes are sitting over the canvas and takes the gap between
// them. Full-screen containers are skipped (they are layout, not panels) and
// so is anything too narrow to matter to a centred composition.
const BAND_FALLBACK = { lo: -0.55, hi: 0.66 };
/** A panel narrower than this fraction of the viewport is not in the way. */
const BAND_MIN_WIDTH = 0.24;
/** A box taller than this fraction of the viewport is a container, not a panel. */
const BAND_MAX_HEIGHT = 0.62;
/** Breathing room between the outermost man and the panel edge, in ndc. */
const BAND_INSET = 0.05;

interface SafeBand { lo: number; hi: number; measured: boolean }

function measureSafeBand(): SafeBand {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return { ...BAND_FALLBACK, measured: false };
  }
  const vw = window.innerWidth, vh = window.innerHeight;
  if (!vw || !vh) return { ...BAND_FALLBACK, measured: false };
  const canvas = document.querySelector("canvas");
  let topPx = 0, bottomPx = vh, found = false;
  for (const el of document.querySelectorAll("body *")) {
    if (el === canvas || (canvas && el.contains(canvas))) continue;
    const r = el.getBoundingClientRect();
    if (r.width < vw * BAND_MIN_WIDTH || r.height < 10) continue;
    if (r.height > vh * BAND_MAX_HEIGHT) continue;
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") continue;
    const mid = (r.top + r.bottom) / 2;
    if (mid < vh * 0.5) { topPx = Math.max(topPx, Math.min(r.bottom, vh * 0.5)); found = true; }
    else { bottomPx = Math.min(bottomPx, Math.max(r.top, vh * 0.5)); found = true; }
  }
  if (!found || bottomPx - topPx < vh * 0.16) return { ...BAND_FALLBACK, measured: false };
  // Pixels down from the top become ndc up from the middle.
  return {
    lo: 1 - (2 * bottomPx) / vh + BAND_INSET,
    hi: 1 - (2 * topPx) / vh - BAND_INSET,
    measured: true,
  };
}

/** One point of the tableau the lens has to keep in frame. */
interface StagePoint { x: number; z: number; y: number; pad: number }

/** What the last solve settled on, kept so the next one can compare. */
interface AimState {
  shot: SummaryShot;
  lensZ: number; dirX: number; dirZ: number;
  band: SafeBand; aspect: number; fitted: boolean;
}

/** The widest and the longest lens the stage will accept, in degrees. */
const FOV_MIN = 34;
const FOV_MAX = 62;
/** Slack on the horizontal fit — a shoulder is wider than the mark it stands on. */
const H_MARGIN = 1.06;

/**
 * THE FRAMING IS SOLVED, NOT AUTHORED.
 *
 * Given where the lens stands and which points of the tableau must be in the
 * picture, this returns the tilt and the focal length that put ALL of them
 * inside `band` — the slot of glass the DOM is not using. It is a solver
 * rather than a constant because none of its inputs are constant: the free
 * slot depends on the headcount (the ledger grows), the aspect ratio decides
 * how much world a vertical FOV covers sideways (a 390x844 phone sees a 24°
 * horizontal cone through the same lens a desktop sees 74° through), and the
 * cast is 2 to 8 men deep.
 *
 * Both are found by scanning the tilt: for each candidate the two extreme
 * elevations pin the tightest FOV that keeps them inside the band, and the
 * winner is the longest lens of the lot — the least distortion that still
 * shows everybody. Returns null when even FOV_MAX cannot hold the cast, which
 * is the caller's cue to stand further back.
 */
function solveFraming(
  pts: StagePoint[], lens: THREE.Vector3, dirX: number, dirZ: number,
  aspect: number, band: SafeBand,
): { fov: number; pitch: number } | null {
  let tanH = 0, amin = Infinity, amax = -Infinity;
  for (const p of pts) {
    const dx = p.x - lens.x, dz = p.z - lens.z;
    const d = dx * dirX + dz * dirZ;
    if (d < 0.8) return null;              // a man beside or behind the lens
    tanH = Math.max(tanH, (Math.abs(dx * -dirZ + dz * dirX) + p.pad) / d);
    const a = Math.atan2(p.y - lens.y, d);
    if (a < amin) amin = a;
    if (a > amax) amax = a;
  }
  // The vertical half-tangent the WIDTH already forces, through the aspect.
  const tWide = (tanH * H_MARGIN) / aspect;
  const lo = amin - 1.2, hi = amax + 0.25;
  const STEPS = 320;
  let best: { T: number; pitch: number } | null = null;
  for (let i = 0; i <= STEPS; i++) {
    const pitch = lo + ((hi - lo) * i) / STEPS;
    const th = Math.tan(amax - pitch) / band.hi;
    const tl = Math.tan(amin - pitch) / band.lo;
    if (!(th > 0) || !(tl > 0)) continue;  // an edge on the wrong side of the axis
    const T = Math.max(th, tl, tWide);
    if (!best || T < best.T) best = { T, pitch };
  }
  if (!best) return null;
  const T = Math.min(Math.max(best.T, Math.tan((FOV_MIN * Math.PI) / 360)),
    Math.tan((FOV_MAX * Math.PI) / 360));
  if (best.T > T + 1e-6) return null;      // needs a wider lens than the stage allows
  // With the focal length settled — it may have come from the width, or from
  // the FOV floor, in which case the cast is smaller than the band — sit the
  // whole tableau in the MIDDLE of the free slot rather than jammed to an edge.
  const mid = (band.hi + band.lo) / 2;
  let pitch = best.pitch, err = Infinity;
  for (let i = 0; i <= STEPS; i++) {
    const p = lo + ((hi - lo) * i) / STEPS;
    const nHi = Math.tan(amax - p) / T, nLo = Math.tan(amin - p) / T;
    if (nHi > band.hi + 1e-3 || nLo < band.lo - 1e-3) continue;
    const e = Math.abs((nHi + nLo) / 2 - mid);
    if (e < err) { err = e; pitch = p; }
  }
  return { fov: (Math.atan(T) * 360) / Math.PI, pitch };
}

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
const _v = new THREE.Vector3();

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
    // NOT a bounding box round the rig: measured, `setFromObject(rig.body)` on
    // a man who died alight returns a box 11 m tall, because his flame and his
    // smoke are parented into the same subtree and the plume is what gets
    // measured. The silhouette below is the man's MARK plus the space a body
    // of his posture occupies — which is the thing the framing solver reasons
    // about too, so the harness and the stage are arguing about the same box.
    const half = m.standing ? 0.55 : 1.15;
    const high = m.standing ? 1.88 : 0.62;
    const at = b.rig.group.position;
    _box.min.set(at.x - half, 0.02, at.z - half);
    _box.max.set(at.x + half, high, at.z + half);
    // WHERE HE LANDS ON THE GLASS, in normalised screen units: -1 is the left
    // or bottom edge, +1 the right or top. Geometry that is provably correct
    // still puts a body behind the ledger band, and this is the only number
    // that answers whether the man is in the picture.
    _v.set(b.rig.group.position.x, 0.15, b.rig.group.position.z).project(cam);
    const foot: [number, number] = [+_v.x.toFixed(3), +_v.y.toFixed(3)];
    _v.set(b.rig.group.position.x, 1.75, b.rig.group.position.z).project(cam);
    const head: [number, number] = [+_v.x.toFixed(3), +_v.y.toFixed(3)];
    // The WHOLE man on the glass, not two sample points: a body lying flat
    // reaches two metres away from the mark it is pinned to, and only the box
    // says whether that end of him is under the ledger panel.
    let nx0 = Infinity, nx1 = -Infinity, ny0 = Infinity, ny1 = -Infinity;
    for (let c = 0; c < 8; c++) {
      _v.set(c & 1 ? _box.max.x : _box.min.x, c & 2 ? _box.max.y : _box.min.y,
        c & 4 ? _box.max.z : _box.min.z).project(cam);
      nx0 = Math.min(nx0, _v.x); nx1 = Math.max(nx1, _v.x);
      ny0 = Math.min(ny0, _v.y); ny1 = Math.max(ny1, _v.y);
    }
    return {
      id: m.id, state: m.player.state, standing: m.standing,
      at: [b.rig.group.position.x, b.rig.group.position.y, b.rig.group.position.z],
      lo: +_box.min.y.toFixed(3), hi: +_box.max.y.toFixed(3),
      foot, head,
      ndc: [+nx0.toFixed(3), +ny0.toFixed(3), +nx1.toFixed(3), +ny1.toFixed(3)],
      actT: +b.motion.actT.toFixed(2), fall: b.motion.fall,
      // What he is PERFORMING, if anything. A corpse mid-flourish is the exact
      // failure the standing rule exists to prevent, and it is a field rather
      // than a screenshot argument.
      emote: b.motion.emote ?? null,
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
  /** Who the stage put on his feet. Nobody else performs — see `canPerform`. */
  let onFeet = new Set<string>();
  /** Re-solves the lens against a freshly measured band; null for a duel. */
  let compose: ((band: SafeBand, from?: THREE.Vector3, seconds?: number) => AimState) | null = null;
  let aim: AimState | null = null;
  let reframeClock = REFRAME_EVERY;
  /** Flourishes turned away because the man asking for one is lying dead. */
  let refused = 0;

  /** A copy deep enough that the sim's lobby reset cannot reach into it. */
  const freeze = (p: GamePlayer): GamePlayer => ({
    ...p,
    position: { ...p.position },
    velocity: { ...p.velocity },
  });

  /**
   * The fallen man laid out on the stage's mark. State, health, severance,
   * burn and the pose he collapsed into are all untouched — what this sets is
   * the ground under him and the compass bearing he lies on.
   *
   * HEAD UP-FRAME, ALWAYS. The lens is pinned to the radial line by the
   * bonfire and it looks slightly down, so on a phone the aim point sits at
   * about 70% of the frame height — measured, `foot` ndc.y -0.41 — and the
   * emote row and the ledger band start just under it. Which way a body lies
   * from that point is therefore the whole difference between reading and not:
   *
   *   head AWAY from the lens — the body climbs up-frame from its own mark,
   *     boots nearest the camera, and lies full length under the victor. This
   *     is what the one frame everybody liked was doing, by luck of the bearing
   *     the man happened to die on.
   *   head TOWARD the lens — it falls down-frame into the DOM panels. Captured
   *     at 390x844 that is a boot and a shoulder either side of the ledger.
   *   broadside — it straddles the aim point and the buttons cut it in half.
   *     Tried, captured, and worse than the accident it replaced.
   *
   * `fall` is which way the collapse took him: -1 put his head behind his own
   * facing, +1 in front of it. 0.35 rad off the axis keeps the pose diagonal
   * rather than a plan view of a man.
   */
  const lay = (p: GamePlayer, x: number, z: number, rot: number): GamePlayer => ({
    ...freeze(p),
    position: { x, y: 0, z },
    rotation: rot,
    velocity: { x: 0, y: 0, z: 0 },
  });

  /**
   * A man who is off the podium but was still on his feet when the bell went —
   * a war band's round can be won without wiping the other side, and a match
   * can be decided on rounds rather than on the last man breathing. The
   * tableau owes the result a corpse, so he is given the death he did not
   * quite have. Everything that says WHO he is survives it: kit, helm, cloak,
   * class and colours are his own, and only the state and the pose change.
   */
  const felled = (p: GamePlayer, x: number, z: number, rot: number): GamePlayer => ({
    ...lay(p, x, z, rot),
    state: "dead",
    health: 0,
    attackPhase: null, attackTimer: 0, blockTimer: 0, staggerTimer: 0,
    hitstop: 0, invincible: false, abilityActive: false,
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

  /** Teleport is a cut: no glide to the mark, no cloth yank from the jump.
   *
   *  And no memory of the wire either — see `cutNetHistory`. Setting the render
   *  position alone is not a teleport as far as the interpolator is concerned:
   *  it still holds the man's death position, still treats the mark as one more
   *  packet, and still draws the line between them at the speed that would have
   *  covered it in a packet interval. The stage is a frozen world with exactly
   *  one snapshot in it, so that guess is never corrected by a later packet. */
  const snap = (m: WarriorMotion, x: number, z: number, rot: number): void => {
    cutNetHistory(m);
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
  function raiseLights(
    at: THREE.Vector3, camDir: THREE.Vector3, q: QualitySettings, spill?: THREE.Vector3,
  ): void {
    const g = new THREE.Group();
    const leftX = -camDir.z, leftZ = camDir.x;
    // KEY — warm, three-quarter front left, high. Aimed between the victor and
    // the body at his feet when there is one, so the same light that models his
    // face is the light the corpse is read by: the fallen man is the point of
    // the picture and a stage that lit only the standing one would be lying.
    const key = new THREE.SpotLight(0xffd2a0, 86, KEY_RANGE, 0.7, 0.62, 2);
    key.position.set(
      at.x + leftX * 2.2 + camDir.x * 1.7, at.y + 3.0, at.z + leftZ * 2.2 + camDir.z * 1.7);
    key.target.position.copy(spill ? spill.clone().add(at).multiplyScalar(0.5) : at);
    // AND IT CASTS. The frame this stage replaced had no contact shadow under
    // either man and nothing grounding them: captured at 1280x720 the victor's
    // boots read as hovering a hand's width over the turf, because the arena's
    // own dusk key throws nothing this soft light could stand in for. The rig
    // was already a portrait rig in every other respect and this is the one
    // thing that makes a portrait sit on the ground.
    //
    // Cheap where it is spent: the summary screen is not the fight, so this is
    // one extra shadow pass over a 40° cone containing two men and a patch of
    // turf, drawn on a screen with no gameplay behind it. Gated on the tier's
    // own shadow switch, so a device that has refused shadows keeps refusing.
    if (q.shadows) {
      key.castShadow = true;
      // Half the arena cascade and far finer per texel: a 40° frustum whose far
      // plane is the light's own reach covers about 12 m at the men, so 1024
      // lands near a centimetre per texel where the boots meet the ground.
      const map = Math.max(512, Math.min(1024, q.shadowMapSize));
      key.shadow.mapSize.set(map, map);
      key.shadow.camera.near = KEY_SHADOW_NEAR;
      // three overwrites a spot's shadow-camera far with `light.distance`, so
      // the normalised bias is derived against that rather than baked — same
      // derivation as the hearth beam's in lighting.ts.
      const near = KEY_SHADOW_NEAR, far = KEY_RANGE, z = KEY_SHADOW_REF;
      key.shadow.bias = -(KEY_BIAS_METRES * far * near) / ((far - near) * z * z);
      key.shadow.normalBias = 0.03;
      key.shadow.radius = q.softShadows ? 3 : 1;
    }
    g.add(key, key.target);
    // RIM — cool, off the shoulder the key is not on, three-quarters behind
    // him and LEVEL with his chest. Both halves of that were paid for in
    // captures:
    //   - Square behind him, the edge wraps equally onto both sides and reads
    //     as nothing at all on a 390-wide frame. From the far side it draws one
    //     long lit edge down the side the key never reaches, which is what
    //     separation actually is.
    //   - Hung above him — where a rim belongs on paper — its cone lands on the
    //     turf behind the men, and at the intensity an edge needs that is a
    //     blue spotlight puddle on the grass. Level, the cone grazes the ground
    //     at a glancing angle and dies; what it lights is a man.
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
    q: QualitySettings,
  ): CastMember[] {
    const staged: CastMember[] = [];
    // Who remains: disconnected men have no record and no rig, and the stage
    // holds who is actually here rather than who the results table remembers.
    const here = Object.values(room.players).filter((p) => warriors.has(p.id));
    // THE RESULTS ARRIVE RANKED. `buildLedger` in engine.mjs places, pays and
    // SORTS them on the server, and the row order it sends is the row order
    // page.tsx prints. Rank here has to mean merit, or "the side's best leads
    // the wall" quietly becomes "the host leads the wall" — and it has to mean
    // the SAME merit the table beside the picture is printing, or the wall and
    // the numbers name different men.
    //
    // BOTH CLAUSES OF THE COMMENT THAT STOOD HERE WERE FALSE (PROCESS.md R7):
    // it said the server never sorts and that page.tsx sorts its own copy.
    // Neither had been true since the ledger moved onto the server, and the
    // line it justified — `[...results].sort((a, b) => b.score - a.score)` —
    // was the second opinion it warned about. It was also actively wrong for a
    // war band: `score` carried each MAN's kills while `place` carried his
    // BAND's, so on a match where the bands finished level on rounds this sort
    // seated a losing-band man above a winning-band man while the table beside
    // him printed the opposite. Taking the order as delivered is the fix, and
    // it is also one less place for the two to ever disagree again.
    const rank = new Map(verdict.results.map((r, i) => [r.id, i]));
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

    // THE OWNER'S FAVOURITE: in a duel the loser is not stood up, he is left
    // dead in the picture. The gore system already made him what he is —
    // severed, smouldering, whatever the last blow left — and none of that is
    // touched here; the only thing this stage will move is the ground he lies
    // on, and only when where he fell cannot be photographed at all.
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
      // Head up-frame, away from the lens. See `lay`.
      const dead = warriors.get(loser.id);
      const lie = ((dead?.motion.fall ?? -1) >= 0
        ? Math.atan2(ux, uz) : Math.atan2(-ux, -uz)) + 0.35;
      staged.push({ id: loser.id, player: lay(loser, cx, cz, lie), standing: false });
      staged.push({ id: victor.id, player: stand(victor, vx, vz, facing + 0.18), standing: true });
      if (dead) {
        // Snapped even when the mark is his own: the smoothing is mid-flight at
        // the moment a match ends and a corpse that is still catching up with
        // itself walks across the frame under a lens that has stopped moving.
        snap(dead.motion, cx, cz, lie);
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
        // 0.62, not 0.95. The aim height is the tilt, and the tilt is where in
        // the frame the tableau sits: measured, the corpse's own mark projects
        // at ndc.y -0.41 with a 0.95 aim, which is 594 px down a 390x844 phone
        // and 507 px down a 1280x720 desktop — both of them inside the emote
        // row and the ledger band. Dropping the aim 0.33 m pitches the lens
        // about five degrees further down and carries the whole tableau up out
        // of the DOM, at the cost of foreground mud nobody was looking at.
        target: [midX, gy + 0.62, midZ] as [number, number, number],
        fov: 50, seconds: 8,
      };
      deps.rig.setSummaryShot(shot);
      raiseLights(
        new THREE.Vector3(vx, gy + 1.1, vz), new THREE.Vector3(nx, 0, nz), q,
        new THREE.Vector3(cx, gy + 0.3, cz));
      publishDiag({
        kind: "duel", fell: [fellX, fellZ], fellR: r0, carried,
        corpse: [cx, cz], corpseR: R, victor: [vx, vz],
        lensR: endR, lie, ...shot, cause: loser.deathCause ?? null,
      });
      return staged;
    }

    // ---- everything that is not a duel: the podium. ----
    // Who is honoured, by the rule at the top of this file. `here` is already
    // in the ledger's own order, so "the top three" here and "#1 #2 #3" in the
    // DOM are the same three men.
    const risen: GamePlayer[] = [];
    const laid: GamePlayer[] = [];
    if (verdict.winnerKind === "team" && verdict.winnerTeam) {
      for (const p of here) (p.team === verdict.winnerTeam ? risen : laid).push(p);
    } else if (victor) {
      const seats = podiumSize(here.length);
      // The victor leads whoever else is honoured: a match can be won on round
      // wins by a man who is not top of the score table, and the winners'
      // circle is led by the winner either way.
      [victor, ...here.filter((p) => p.id !== victor.id)]
        .forEach((p, i) => (i < seats ? risen : laid).push(p));
    } else {
      laid.push(...here);
    }

    const gy = deps.groundAt(STAGE_X, STAGE_FRONT_Z);
    const lensX = STAGE_X + LENS_OFFSET_X;
    const risenMarks = risen.map((_, i) => podiumMark(i));
    const laidMarks = laid.map((_, k) => fallenMark(k));

    // What the lens must hold: a standing man from his boots to the top of his
    // helm, and a fallen one from his mark to the far end of him. The pads are
    // half-widths — a shoulder, a shield, an outflung arm.
    const pts: StagePoint[] = [];
    for (const m of risenMarks) {
      pts.push({ x: m.x, z: m.z, y: gy + 0.02, pad: 0.62 });
      pts.push({ x: m.x, z: m.z, y: gy + 1.88, pad: 0.62 });
    }
    for (const m of laidMarks) {
      pts.push({ x: m.x, z: m.z, y: gy + 0.32, pad: 0.85 });
      pts.push({ x: m.x, z: m.z - 1.15, y: gy + 0.28, pad: 0.85 });
    }

    // THE LENS STANDS BACK UNTIL THE CAST FITS. On a 390-wide phone the same
    // 50° lens that shows a desktop 74° of world sideways shows 24°, so a
    // stand-off that frames three men and five bodies on a laptop crops half
    // of them off a phone. The stage walks the lens backwards a step at a time
    // and takes the first mark that can hold everybody inside the free glass.
    const centreZ = 4.6;
    compose = (band, from, seconds = 8) => {
      const aspect = deps.rig.camera.aspect || 16 / 9;
      let lensZ = 10.4;
      let framing: { fov: number; pitch: number } | null = null;
      let dirX = 0, dirZ = -1;
      for (; lensZ <= 16.4; lensZ += 0.4) {
        const dx = STAGE_X - lensX, dz = centreZ - lensZ;
        const len = Math.hypot(dx, dz) || 1;
        dirX = dx / len; dirZ = dz / len;
        framing = solveFraming(
          pts, new THREE.Vector3(lensX, gy + LENS_HEIGHT, lensZ), dirX, dirZ, aspect, band);
        if (framing) break;
      }
      // A cast that will not fit at any stand-off still has to be photographed:
      // the widest lens, aimed at the middle of the ground the men are on.
      const fov = framing?.fov ?? FOV_MAX;
      const pitch = framing?.pitch
        ?? Math.atan2(-0.9 - LENS_HEIGHT + 0.9, Math.hypot(STAGE_X - lensX, centreZ - lensZ));
      const shot: SummaryShot = {
        from: from
          ? [from.x, from.y, from.z]
          : [lensX - dirX * 1.6, gy + LENS_HEIGHT + 0.38, lensZ - dirZ * 1.6],
        to: [lensX, gy + LENS_HEIGHT, lensZ],
        target: [lensX + dirX * 8, gy + LENS_HEIGHT + Math.tan(pitch) * 8, lensZ + dirZ * 8],
        fov, seconds,
      };
      deps.rig.setSummaryShot(shot);
      aim = { shot, lensZ, dirX, dirZ, band, aspect, fitted: framing !== null };
      return aim;
    };
    const { lensZ, dirX, dirZ, band, aspect, fitted } = compose(measureSafeBand());

    // Now the men, facing a lens that has stopped moving about.
    const lens = new THREE.Vector3(lensX, gy + LENS_HEIGHT, lensZ);
    risen.forEach((p, i) => {
      const m = risenMarks[i];
      const rot = Math.atan2(lens.x - m.x, lens.z - m.z);
      staged.push({ id: p.id, player: stand(p, m.x, m.z, rot), standing: true });
      const w = warriors.get(p.id);
      if (w) snap(w.motion, m.x, m.z, rot);
      deps.douse(p.id);
    });
    laid.forEach((p, k) => {
      const m = laidMarks[k];
      // Head up-frame, away from the lens, exactly as the duel corpse lies —
      // see `lay`. The per-man skew keeps eight bodies from reading as a row
      // of planks: they died at different moments in different fights.
      const body = warriors.get(p.id);
      const away = Math.atan2(m.x - lens.x, m.z - lens.z);
      const skew = 0.35 + ((k % 3) - 1) * 0.22;
      const lie = ((body?.motion.fall ?? -1) >= 0 ? away : away + Math.PI) + skew;
      const player = p.state === "dead" ? lay(p, m.x, m.z, lie) : felled(p, m.x, m.z, lie);
      staged.push({ id: p.id, player, standing: false });
      // EVERY MAN IS PUT OUT HERE, the fallen included — which is the one thing
      // the duel tableau deliberately does not do, and it is the headcount that
      // makes the difference. One smouldering body is the best part of a duel's
      // portrait. Five of them are five plumes of smoke standing up through a
      // phone frame: captured at 390x844 the dead men's fires reached eleven
      // metres and read as dark rubbish floating in the sky over the podium.
      deps.douse(p.id);
      if (body) {
        snap(body.motion, m.x, m.z, lie);
        // A man given his death here has no collapse behind him, so `fall` is
        // chosen rather than remembered — see poseWarrior, which only sets it
        // on the first frame of a death this stage has already run past.
        if (p.state !== "dead") body.motion.fall = k % 2 === 0 ? 1 : -1;
        body.motion.actT = Math.max(body.motion.actT, DEATH_SETTLED);
        // Carried to his mark with his own severed pieces: they are integrated
        // in world space off the arena root, so a body moved without them
        // leaves an arm lying where he died.
        const cdx = m.x - p.position.x, cdz = m.z - p.position.z;
        if (Math.hypot(cdx, cdz) > 0.001) carryGore(body.rig, cdx, cdz);
      }
    });

    // The key is aimed between the man at the point of the wedge and the
    // middle of the fallen, so the same light models the victor's face and
    // reads the bodies. A tableau that lit only the standing would be lying
    // about what the picture is of.
    const spill = laidMarks.length
      ? new THREE.Vector3(
        laidMarks.reduce((s, m) => s + m.x, 0) / laidMarks.length, gy + 0.3,
        laidMarks.reduce((s, m) => s + m.z, 0) / laidMarks.length)
      : undefined;
    const lead = risenMarks[0] ?? { x: STAGE_X, z: centreZ };
    raiseLights(
      new THREE.Vector3(lead.x, gy + 1.1, lead.z),
      new THREE.Vector3(-dirX, 0, -dirZ), q, spill);
    publishDiag({
      kind: verdict.winnerKind === "team" ? "warband" : victor ? "podium" : "draw",
      cast: staged.length, standing: risen.length, dead: laid.length,
      seats: risen.length, headcount: here.length,
      band: [+band.lo.toFixed(3), +band.hi.toFixed(3)], bandMeasured: band.measured,
      aspect: +aspect.toFixed(3), lensZ, fitted,
      ...aim!.shot,
    });
    return staged;
  }

  return {
    update(dt, ctx, room, verdict, warriors, localId) {
      void localId;
      if (!cast) {
        cast = buildStage(room, verdict, warriors, ctx.quality);
        onFeet = new Set(cast.filter((m) => m.standing).map((m) => m.id));
      }
      // The orchestrator normally stamps the mode per frame; on this path the
      // stage does, so nothing else has to know the summary exists.
      deps.rig.setMode("summary");
      // The lens follows the DOM. The overlay mounts after the first summary
      // frame, its ledger is as tall as the moot was big, and a phone can be
      // turned on its side — all three move the glass this picture has to fit
      // inside, and none of them are known when the stage is built. Re-aimed
      // from where the lens actually IS, so the push carries on rather than
      // jumping back to its start mark.
      if (compose && aim) {
        reframeClock -= dt;
        if (reframeClock <= 0) {
          reframeClock = REFRAME_EVERY;
          const band = measureSafeBand();
          const aspect = deps.rig.camera.aspect || aim.aspect;
          if (Math.abs(band.lo - aim.band.lo) > 0.03 || Math.abs(band.hi - aim.band.hi) > 0.03
            || Math.abs(aspect - aim.aspect) > aim.aspect * 0.02) {
            compose(band, deps.rig.camera.position.clone(), 1.6);
          }
        }
      }
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

    canPerform(id) {
      // Before the stage exists nobody has been judged yet, and the fight's own
      // rule — the server refuses a dead man's emote — is the right one to fall
      // back to. After it, standing IS the permission.
      if (cast === null) return true;
      if (onFeet.has(id)) return true;
      // Counted, because a refusal is invisible: nothing happens, which is also
      // what a broken relay looks like. `summaryflow` presses the row as a
      // corpse and reads this to tell "vetoed" from "never arrived".
      refused++;
      if (typeof window !== "undefined") {
        (window as unknown as Record<string, unknown>).__summaryEmoteRefused = refused;
      }
      return false;
    },

    reset() {
      if (!cast && !lights) return;
      cast = null;
      victorId = null;
      victorEmote = null;
      onFeet = new Set();
      compose = null;
      aim = null;
      reframeClock = REFRAME_EVERY;
      if (lights) {
        deps.scene.remove(lights);
        lights.traverse((o) => {
          const l = o as THREE.Light;
          if (!l.isLight) return;
          // The key owns a shadow map on any tier that allows one; a stage torn
          // down between matches that only disposed the light would leak a
          // depth target per match for as long as the tab is open.
          (l as THREE.SpotLight).shadow?.dispose();
          l.dispose();
        });
        lights = null;
      }
    },
  };
}
