// ============================================================
// SOLID GROUND — what on a map you cannot walk through, and the one function
// that stops you.
//
// The owner, 13 Aug 2026:
//
//   > "Is there a way to make some of the map objects solid too (the wooden
//   > stick pile on current map for example) instead of walking through them?
//   > Bare this in mind for creating other maps but i guess the sticking out
//   > items like the spikes & bones etc, obviously you'd be able to walk around
//   > / through them no problem so they don't need to but any 'larger' objects
//   > (wood pile, wood fire structure, fence, larger rocks or boulders,
//   > buildings or structures, castles or formations, that are deemed as more
//   > of an obstacle decoration rather than a 'decoration decoration' (sword in
//   > ground, helmet on floor, blood on floor etc.)"
//
// He drew the line himself and it is the right one, so it is the line this
// module encodes: an OBSTACLE decoration blocks, a DECORATION decoration does
// not. The distinction is DECLARED, never inferred — `solid()` throws if you do
// not say which a prop is and why, so a new prop's solidity is a decision
// somebody made rather than whatever the constructor happened to default to.
//
// ---------------------------------------------------------------------------
// THE INTEGRATION POINT — ONE CALL, AND ANOTHER AGENT OWNS THE FILE IT GOES IN
// ---------------------------------------------------------------------------
//
// `engine.mjs` is not ours. The wiring below is the whole of what it has to do,
// in the movement step, immediately after `integrateMovement` — and it REPLACES
// the palisade block that follows it today (see "The play bound" below):
//
//     import { resolveSolids } from "./solidground.mjs";
//     // ... in the per-player movement step:
//     const wasX = player.position.x, wasZ = player.position.z;   // before the stride
//     integrateMovement(player, dt);
//     const s = resolveSolids(ground, wasX, wasZ, player.position.x, player.position.z, BODY_MIN_SEP / 2);
//     player.position.x = s.x;
//     player.position.z = s.z;
//     if (s.hit) killComponent(player, s.blockedX, s.blockedZ);
//
// Exact signature:
//
//     resolveSolids(ground, fromX, fromZ, toX, toZ, bodyRadius) -> {
//       x, z,                  // where the body may actually stand
//       hit,                   // did anything stop it this step
//       blockedX, blockedZ,    // UNIT direction it may not travel — feed killComponent
//       contacts, frozen, rescued,
//       outside,               // metres past the play bound, normally 0
//     }
//
// `blockedX/blockedZ` is deliberately the same quantity `killComponent` already
// takes at the palisade: *the direction that has just turned solid*, so the
// stride keeps every bit of its tangential travel and only loses the part
// pointed into the timber. Match that and a warrior slides; miss it and he
// stops dead, and the client — which extrapolates the server's velocity with no
// collision of its own — walks him through the prop and snaps him back on every
// packet.
//
// THE PLAY BOUND IS PART OF THIS CALL. It has to be. The runestone stands at
// r = 17.7 with the fighting floor at r = 18, so its far corner is OUTSIDE the
// ring: a man clamped to the ring by one rule and pushed off the stone by
// another is a man the two rules can pass back and forth forever. They are one
// constraint set and they are solved together, iterated, and verified. Which
// means the engine's existing eight-line palisade block becomes redundant — it
// is harmless if left in place (this call already returns a point inside the
// ring, so a second clamp is a no-op) but it is dead code and should go.
//
// Secondary hooks, both optional, neither on the movement path:
//   * `steerAroundSolids(ground, x, z, dx, dz, bodyRadius, memory)` — bot
//     navigation. Without it a bot walking dead-on into a flat face slides
//     nowhere and presses there for the rest of the round, which is the "bots
//     must not walk into things forever" clause. `memory` is one waypoint of
//     commitment and the CALLER owns it: give each bot its own `{}` off its
//     player record and hand back the same one every tick.
//   * `clearanceAt` — for the spawn solver. The village's spawn ring is
//     6–12 m and the woodpile is at r = 6.8, so a round can currently open with
//     a man standing in it. `resolveSolids` ejects him on the first tick
//     (see `rescued`), but not opening the round inside a rick is better.
//
// ---------------------------------------------------------------------------
// THE WORLD IS 2-D HERE, AND THAT IS A SIMPLIFICATION WORTH SAYING OUT LOUD
// ---------------------------------------------------------------------------
//
// The server sim has no y. Boots are planted at y = 0 and the village's height
// field is held within ~5 cm of that inside the palisade precisely so that
// stays honest. So a solid is a PLAN-VIEW shape and nothing else: a man cannot
// climb, so a knee-high rick of firewood stops him exactly as a four-metre
// standing stone does. `height` is carried on every solid for the renderer and
// for whoever eventually gives the sim a third axis; NOTHING IN THIS FILE READS
// IT. If that ever changes, this paragraph is the thing to come back to.
//
// One consequence to keep in mind when placing props: the footprint is the
// union over height of everything the prop is made of, because a man in a 2-D
// sim occupies every height at once. The woodpile's crib stakes lean outward at
// the top, so its collision footprint is 0.599 m across the axis against the
// billets' own 0.448 — 15 cm of obstacle that is only there above knee height,
// and in a 2-D sim that is 15 cm of obstacle. Derived from the parts by
// `fitFootprint`, not guessed.
//
// ---------------------------------------------------------------------------
// ONE DEFINITION, NOT TWO
// ---------------------------------------------------------------------------
//
// This repository has recorded the mirrored-definition fault five times: the
// same constant written twice, so editing one does nothing. A prop that is
// drawn in one file and collided in another is that fault with a longer fuse,
// because the disagreement shows up as men clipping through timber rather than
// as a wrong number.
//
// So the collision shape is not written down at all. It is FITTED to the prop's
// own parts by `fitFootprint`, and the parts are generated here, from the
// declaration, by the same functions `render/world.ts` calls to place the
// meshes. There is one list of billets in this repository and both the picture
// and the physics are built from it. Move the woodpile and both move.
//
// Nothing here may import three.js — the server has to be able to load it.
//
// It imports NOTHING AT ALL, which is not tidiness. `grounds.mjs` declares the
// props, so it has to import this; if this imported `grounds.mjs` back for its
// noise and its seeded rng, the two would form a cycle, and a cycle between a
// module that RUNS code at load (`grounds.mjs` builds the woodpile the moment
// it is imported) and one that supplies the functions that code calls is a
// load-order trap waiting for whichever file the server happens to import
// first. So the arithmetic a prop kind needs — a seeded stream, a noise field —
// is handed IN with the declaration. See `rick` and `raisedStone`.
// ============================================================

/**
 * Contact skin, in metres. A resolved body is left this far off the surface
 * rather than exactly on it, so the next tick's distance test does not land on
 * a float tie and flicker `hit` on and off while a man leans on a wall.
 */
export const SOLID_SKIN = 0.002;

/** The most a body may overlap a solid before the harness calls it inside. */
export const SOLID_TOLERANCE = 0.004;

/**
 * Depenetration passes per substep. Eight, and the number is measured rather
 * than picked: the worst case in the village is the wedge between the runestone
 * and the play bound, where the stone pushes a body out of the ring and the
 * ring pushes it back at the stone, and `tools/solidtest.mjs` reports the
 * passes that wedge actually needs. Raise this if a map ever reports a frozen
 * step that is not a genuine dead end.
 */
const SOLVE_ITERS = 8;

/** Ceiling on path subdivision, so a teleport cannot cost unbounded work. */
const MAX_SUBSTEPS = 12;

const EMPTY = Object.freeze([]);

// ---------------------------------------------------------------------------
// The primitive
//
// One shape: an ORIENTED ROUNDED RECTANGLE in plan. It is the only one, because
// one shape means one distance function, one normal, one set of edge cases and
// one thing to get wrong. It covers everything a map has wanted so far —
//
//   a disc      halfX = halfZ = 0        (a boulder, a post)
//   a capsule   halfZ = 0                (a felled trunk, a fence rail)
//   a slab      pad small                (a wall, a rick, a standing stone)
//
// — and it is the shape a swept-body test is cheapest against.
//
// THE LOCAL FRAME MATCHES THREE.JS'S Y ROTATION, which is not the frame you
// would write down from first principles: rotating +X by `ry` about Y gives
// (cos ry, −sin ry) in (x, z), not (cos, +sin). Get that wrong and every
// collision box in the game lies across its own prop, at an angle that looks
// almost right from most bearings. `render/world.ts` builds the woodpile from
// `ux = cos(AX), uz = −sin(AX)`; so does this.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Footprint
 * @property {number} halfX Half-extent along the shape's own long axis.
 * @property {number} halfZ Half-extent across it.
 * @property {number} pad   Corner radius. The shape is the rectangle grown by this.
 */

/**
 * @typedef {object} Solid
 * @property {string} id
 * @property {"solid"} kind
 * @property {number} x
 * @property {number} z
 * @property {number} rot     Yaw, three.js convention (see above).
 * @property {number} halfX
 * @property {number} halfZ
 * @property {number} pad
 * @property {number} height  Carried for the renderer. THE SIM DOES NOT READ IT.
 * @property {string} why     Why this one blocks. Required.
 * @property {number} cos
 * @property {number} sin
 * @property {number} bound   Distance from centre past which nothing can touch it.
 * @property {number} thick   Half the shape's narrowest waist — sets substep size.
 */

/**
 * A prop that blocks. Every field that is not derived must be given, INCLUDING
 * `why`: a solid with no stated reason is how a map ends up with invisible
 * walls nobody can account for.
 *
 * @returns {Solid}
 */
export function solid({ id, x, z, rot = 0, halfX, halfZ, pad, height, why }) {
  if (typeof id !== "string" || !id) throw new Error("solid: id is required");
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error(`solid ${id}: x/z must be finite`);
  if (!(halfX >= 0) || !(halfZ >= 0) || !(pad > 0)) {
    throw new Error(`solid ${id}: halfX/halfZ must be >= 0 and pad > 0 (a shape with no corner radius has no normal at its corner)`);
  }
  if (!(height > 0)) throw new Error(`solid ${id}: height is required — the sim ignores it, the renderer does not`);
  if (typeof why !== "string" || why.length < 12) {
    throw new Error(`solid ${id}: 'why' is required and must say something. The owner's rule is that an obstacle decoration blocks and a decoration decoration does not; which one this is, and why, is not something the next person should have to infer from the geometry.`);
  }
  return Object.freeze({
    id, kind: "solid", x, z, rot, halfX, halfZ, pad, height, why,
    cos: Math.cos(rot), sin: Math.sin(rot),
    bound: Math.hypot(halfX, halfZ) + pad,
    thick: Math.min(halfX, halfZ) + pad,
  });
}

/**
 * A prop that does NOT block, and why. It carries no geometry on purpose: a
 * decoration has no collision shape, so there is nothing here that can drift
 * out of step with what the renderer draws. It exists so that the decision is
 * written down — the owner's distinction is only worth anything if the answer
 * for each prop is recorded rather than implied by absence.
 *
 * @returns {{ id: string, kind: "passable", why: string }}
 */
export function passable(id, why) {
  if (typeof id !== "string" || !id) throw new Error("passable: id is required");
  if (typeof why !== "string" || why.length < 12) {
    throw new Error(`passable ${id}: 'why' is required. "It is small" is a reason; nothing is not.`);
  }
  return Object.freeze({ id, kind: "passable", why });
}

// ---------------------------------------------------------------------------
// Distance, normal, and the fit
// ---------------------------------------------------------------------------

/** Signed distance from a plan-view point to a solid's surface. Negative inside. */
export function solidDistance(s, x, z) {
  const dx = x - s.x, dz = z - s.z;
  const lx = dx * s.cos - dz * s.sin;
  const lz = dx * s.sin + dz * s.cos;
  return rectDistance(s.halfX, s.halfZ, s.pad, lx, lz);
}

/** The same, for a footprint not yet wrapped in a `Solid`. Local coordinates. */
export function rectDistance(halfX, halfZ, pad, lx, lz) {
  const qx = Math.abs(lx) - halfX;
  const qz = Math.abs(lz) - halfZ;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
  const inside = Math.min(Math.max(qx, qz), 0);
  return outside + inside - pad;
}

/**
 * Outward unit normal at a point, written into `out`. Two cases and both matter:
 * outside the rectangle's core it is the direction to the nearest edge, inside
 * it is the axis of least penetration — which is what pushes a body that has
 * somehow ended up in the middle of a solid out of the NEAREST face rather than
 * across the whole prop.
 *
 * `hintX/hintZ` breaks the tie at the exact centre of a symmetric shape, where
 * there is no nearest face. Pass the reverse of travel and a body is spat back
 * out the way it came in.
 */
export function solidNormal(s, x, z, out, hintX = 0, hintZ = 0) {
  const dx = x - s.x, dz = z - s.z;
  const lx = dx * s.cos - dz * s.sin;
  const lz = dx * s.sin + dz * s.cos;
  const qx = Math.abs(lx) - s.halfX;
  const qz = Math.abs(lz) - s.halfZ;
  let nlx, nlz;
  if (qx > 0 || qz > 0) {
    nlx = Math.max(qx, 0) * Math.sign(lx);
    nlz = Math.max(qz, 0) * Math.sign(lz);
  } else if (qx > qz) {
    nlx = Math.sign(lx) || 1; nlz = 0;
  } else {
    nlx = 0; nlz = Math.sign(lz) || 1;
  }
  let len = Math.hypot(nlx, nlz);
  if (len < 1e-9) {
    // Dead centre of a disc. Use the hint if there is one, and a fixed axis if
    // there is not — anything but NaN, which is how a body leaves the map.
    const hl = Math.hypot(hintX, hintZ);
    if (hl > 1e-9) { out.x = hintX / hl; out.z = hintZ / hl; return out; }
    out.x = s.cos; out.z = -s.sin;
    return out;
  }
  nlx /= len; nlz /= len;
  // Local -> world. The inverse of the frame above.
  out.x = nlx * s.cos + nlz * s.sin;
  out.z = -nlx * s.sin + nlz * s.cos;
  return out;
}

/**
 * The tightest oriented rounded rectangle enclosing a set of discs given in the
 * shape's OWN frame. This is the whole anti-mirror mechanism: a prop declares
 * its parts, the parts are generated once, the picture is built from them and
 * the collision shape is *measured* off them. Nobody writes the box down, so
 * nobody can write it down twice.
 *
 * Axis extents first, then a few passes widening whatever a corner part still
 * pokes out of — a disc at a corner can sit outside a rectangle that contains
 * it on both axes, and a "bounding" box that does not bound is worse than none.
 *
 * @param {Array<{x:number,z:number,r:number}>} parts local-frame discs
 * @param {number} pad corner radius to fit around
 * @returns {Footprint}
 */
export function fitFootprint(parts, pad) {
  if (!parts.length) throw new Error("fitFootprint: nothing to fit");
  let halfX = 0, halfZ = 0;
  for (const p of parts) {
    halfX = Math.max(halfX, Math.abs(p.x) + p.r - pad);
    halfZ = Math.max(halfZ, Math.abs(p.z) + p.r - pad);
  }
  halfX = Math.max(halfX, 0);
  halfZ = Math.max(halfZ, 0);
  for (let guard = 0; guard < 64; guard++) {
    let worst = 0, wx = 0, wz = 0;
    for (const p of parts) {
      const over = rectDistance(halfX, halfZ, pad, p.x, p.z) + p.r;
      if (over > worst) {
        worst = over;
        wx = Math.max(Math.abs(p.x) - halfX, 0);
        wz = Math.max(Math.abs(p.z) - halfZ, 0);
      }
    }
    if (worst <= 1e-9) break;
    const s = wx + wz;
    if (s <= 1e-9) { halfX += worst * 0.5; halfZ += worst * 0.5; continue; }
    halfX += worst * (wx / s);
    halfZ += worst * (wz / s);
  }
  return { halfX, halfZ, pad };
}

/** Every part a solid was fitted around, still outside it? A gate uses this. */
export function footprintEncloses(s, parts) {
  let worst = -Infinity;
  for (const p of parts) {
    const over = rectDistance(s.halfX, s.halfZ, s.pad, p.x, p.z) + p.r;
    if (over > worst) worst = over;
  }
  return worst;
}

// ---------------------------------------------------------------------------
// The play bound
//
// A disc the body's CENTRE may not leave, which is exactly what `engine.mjs`
// enforces today at ARENA_RADIUS — centre, not surface, so a man's shoulder
// already overhangs the line and the palisade at 19.6 m is what stops it
// looking wrong. Reproduced rather than improved: this call has to be a drop-in
// for the block it replaces, and moving the wall in by half a body is a
// gameplay change, not a collision fix.
// ---------------------------------------------------------------------------

export function playBound(ground) {
  const play = ground && ground.play;
  if (!play || play.shape !== "disc" || !(play.radius > 0)) return Infinity;
  return play.radius;
}

export function solidsOf(ground) {
  return (ground && ground.obstacles) || EMPTY;
}

/**
 * How much room a body of `bodyRadius` has at a point, in metres — negative if
 * it is inside something. The play bound counts: a spawn 30 cm from the ring is
 * a man with his back through the palisade.
 *
 * For the spawn solver, and for any bot that wants to know before it commits.
 */
export function clearanceAt(ground, x, z, bodyRadius = 0) {
  let best = Infinity;
  for (const s of solidsOf(ground)) {
    const d = solidDistance(s, x, z) - bodyRadius;
    if (d < best) best = d;
  }
  const bound = playBound(ground);
  if (Number.isFinite(bound)) best = Math.min(best, bound - Math.hypot(x, z));
  return best;
}

/** Is this a place a body may legally stand? */
export function isClear(ground, x, z, bodyRadius, tolerance = SOLID_TOLERANCE) {
  return clearanceAt(ground, x, z, bodyRadius) > -tolerance;
}

// ---------------------------------------------------------------------------
// THE INTEGRATION POINT
// ---------------------------------------------------------------------------

const N1 = { x: 0, z: 0 };

/**
 * Stop a body that has just been moved through a map.
 *
 * Called with where the body WAS and where `integrateMovement` has just put it,
 * this returns where it may actually stand and the direction it may not travel.
 * It is pure: it reads the ground and four numbers, touches nothing, and two
 * calls with the same arguments give the same answer.
 *
 * Three things it guarantees, and all three are gated in `tools/solidtest.mjs`:
 *
 *  1. NEVER INSIDE. The returned point clears every solid and sits inside the
 *     play bound, or it is the point the body came from — which was legal,
 *     because this function returned it last tick. A body that starts inside
 *     something (a spawn in a woodpile, a solid declared under a standing man)
 *     is ejected rather than trapped, and says so with `rescued`.
 *
 *  2. NEVER THROUGH. The path is subdivided so no substep is longer than the
 *     narrowest solid's waist plus the body's radius. Warriors move up to
 *     0.41 m in a tick under their own legs and a runekeeper's dodge adds
 *     0.77 m on top of that, which is more than twice a fence rail's thickness;
 *     resolving only the endpoint would let a roll pass clean through one.
 *
 *  3. NEVER STUCK. Only the component of the stride pointed into the surface is
 *     removed (`blockedX/blockedZ` -> `killComponent`), so contact costs a
 *     warrior the part of his step that was going into the timber and not one
 *     centimetre of the part that was going along it. Meet a wall 10° off
 *     parallel and you keep cos(10°) — 98% — of your speed, and go on keeping
 *     it; the harness measures the worst case across every flat face on two
 *     grounds at better than 99% of what the geometry owes.
 *
 * @param {object} ground A GroundSpec: `obstacles` and `play` are read.
 * @param {number} fromX Where the body was at the top of the step.
 * @param {number} fromZ
 * @param {number} toX Where the stride wants it.
 * @param {number} toZ
 * @param {number} bodyRadius Half a body's width. The engine's is BODY_MIN_SEP / 2.
 * @returns {{x:number,z:number,hit:boolean,blockedX:number,blockedZ:number,contacts:number,frozen:boolean,rescued:boolean,outside:number}}
 */
export function resolveSolids(ground, fromX, fromZ, toX, toZ, bodyRadius) {
  const solids = solidsOf(ground);
  const bound = playBound(ground);
  const res = {
    x: toX, z: toZ, hit: false, blockedX: 0, blockedZ: 0,
    contacts: 0, frozen: false, rescued: false, outside: 0,
  };
  if (!solids.length && !Number.isFinite(bound)) return res;

  // Accumulated push, so `blocked` can be the direction of everything that
  // turned solid this step rather than of whichever contact happened to be last
  // in the list. In a corner that is the bisector, which is correct: it is the
  // direction the body may not go.
  let pushX = 0, pushZ = 0;

  const contact = (nx, nz, depth) => {
    pushX += nx * depth; pushZ += nz * depth;
    res.contacts++;
    res.hit = true;
  };

  // The base of the step has to be legal or the fallback has nowhere to fall
  // back to. It normally is — it is last tick's output — so this is the case
  // where something else put a body inside a solid: a spawn solved without
  // asking, a prop declared under a man's feet, a shove.
  let baseX = fromX, baseZ = fromZ;
  if (!isClear(ground, baseX, baseZ, bodyRadius)) {
    const rescue = settle(solids, bound, baseX, baseZ, bodyRadius, toX - fromX, toZ - fromZ, null);
    baseX = rescue.x; baseZ = rescue.z;
    res.outside = rescue.outside;
    res.rescued = true;
  }

  let dx = toX - baseX, dz = toZ - baseZ;
  const dist = Math.hypot(dx, dz);

  // Substep short enough that nothing can be crossed without being sampled
  // inside. The narrowest waist in the set sets the pace; a map with a fence in
  // it costs more substeps than a map with boulders, which is the honest
  // trade.
  let waist = Infinity;
  for (const s of solids) if (s.thick < waist) waist = s.thick;
  const stride = Math.max(0.05, (Number.isFinite(waist) ? waist : 1) + bodyRadius);
  const steps = dist > stride ? Math.min(MAX_SUBSTEPS, Math.ceil(dist / stride)) : 1;

  let px = baseX, pz = baseZ;
  const stepX = dx / steps, stepZ = dz / steps;
  for (let i = 0; i < steps; i++) {
    const out = settle(solids, bound, px + stepX, pz + stepZ, bodyRadius, stepX, stepZ, contact);
    if (!out.clear) {
      // No legal point for this substep — a wedge the solver could not open.
      // Stop at the last place that was legal and kill everything pointed the
      // way we were going. He is not trapped: only the into-component goes, so
      // the moment he leans anywhere else he moves.
      res.frozen = true;
      if (dist > 1e-9) contact(-dx / dist, -dz / dist, 1);
      break;
    }
    px = out.x; pz = out.z;
    res.outside = out.outside;
  }

  res.x = px; res.z = pz;
  const pl = Math.hypot(pushX, pushZ);
  if (pl > 1e-9) {
    // Blocked is the direction the body may NOT travel, which is the opposite
    // of the direction it was pushed. Same convention as the palisade's radial.
    res.blockedX = -pushX / pl;
    res.blockedZ = -pushZ / pl;
  } else {
    res.hit = false;
    res.contacts = 0;
  }
  return res;
}

/**
 * Push a point out of everything it is inside, alternating with the play bound
 * until both hold. Alternating projection: the solids push out, the ring pushes
 * in, and where the two disagree — the corner between the runestone and the
 * palisade — the iteration walks the point along until it finds the gap.
 *
 * Returns `clear: false` if it could not, which is the caller's cue to stay
 * where it was rather than to accept a point inside a prop.
 */
function settle(solids, bound, x, z, bodyRadius, travelX, travelZ, contact) {
  let cx = x, cz = z;
  for (let it = 0; it < SOLVE_ITERS; it++) {
    let moved = 0;
    // THE RING GOES FIRST AND THE SOLIDS GO LAST, AND THE ORDER IS THE POLICY.
    // Where the two cannot both be satisfied — a body somehow behind the
    // runestone and outside the play disc — the last word has to be the solid's,
    // because the two failures are not equally bad: a warrior 40 cm outside an
    // invisible disc is standing on turf 1.2 m short of the palisade and nobody
    // can see it, and a warrior 40 cm inside the runestone is standing in a rock
    // on everybody's screen. Solids are hard, the ring is soft.
    if (Number.isFinite(bound)) {
      const r = Math.hypot(cx, cz);
      if (r > bound) {
        const nx = cx / r, nz = cz / r;
        const push = r - bound;
        cx = nx * bound; cz = nz * bound;
        // The ring's push is inward; the direction blocked is outward, which is
        // the sign `killComponent` has always been given here.
        if (contact) contact(-nx, -nz, push);
        if (push > moved) moved = push;
      }
    }
    for (const s of solids) {
      const d = solidDistance(s, cx, cz);
      const want = bodyRadius + SOLID_SKIN;
      if (d >= want) continue;
      solidNormal(s, cx, cz, N1, -travelX, -travelZ);
      const push = want - d;
      cx += N1.x * push; cz += N1.z * push;
      // Every pass, not only the first. A body the ring has just pushed INTO a
      // solid contacts that solid on iteration two, and a `blocked` direction
      // assembled from the first pass alone would not know the stone was there.
      if (contact) contact(N1.x, N1.z, push);
      if (push > moved) moved = push;
    }
    if (moved <= 1e-7) break;
  }
  let clear = true;
  for (const s of solids) {
    if (solidDistance(s, cx, cz) < bodyRadius - SOLID_TOLERANCE) { clear = false; break; }
  }
  const outside = Number.isFinite(bound) ? Math.max(0, Math.hypot(cx, cz) - bound) : 0;
  return { x: cx, z: cz, clear, outside };
}

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

/** How far along the line to the goal a bot bothers to look. */
const STEER_SIGHT = 14;
/** Sample spacing along a sight line, in metres. */
const STEER_STEP = 0.4;
/** How much slimmer a probe body is than a real one. See `clearLine`. */
const PROBE_SLACK = 0.06;
/** How far outside a corner a bot aims when it goes round one. */
const CORNER_STANDOFF = 0.25;

/**
 * Is the straight line from (ax, az) to (bx, bz) walkable by a body of this
 * radius? Returns the solid that stops it, or null.
 *
 * The probe body is PROBE_SLACK slimmer than the real one, and that is not a
 * fudge — it is the difference between a working probe and a useless one. A bot
 * with his shoulder against a wall has about two millimetres of clearance, so a
 * line running ALONG that wall reads as blocked at every sample and he never
 * learns that the way past is beside him. Slim the probe and grazing reads as
 * passable, which is what grazing is.
 */
function lineBlocker(ground, ax, az, bx, bz, bodyRadius) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return null;
  const n = Math.min(STEER_SIGHT, len);
  const steps = Math.max(1, Math.ceil(n / STEER_STEP));
  const r = bodyRadius - PROBE_SLACK;

  // Cull first, sample second. A line is checked dozens of times per routing
  // bot per tick and sampling every solid at every step is most of the cost of
  // this module; one point-to-segment test per solid throws out everything the
  // line is nowhere near, and on the village that is both of them almost
  // always.
  const candidates = [];
  for (const s of solidsOf(ground)) {
    let t = ((s.x - ax) * dx + (s.z - az) * dz) / (len * len);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t - s.x, qz = az + dz * t - s.z;
    if (Math.hypot(qx, qz) <= s.bound + r) candidates.push(s);
  }
  const bound = playBound(ground);
  const ringPossible = Number.isFinite(bound)
    && Math.max(Math.hypot(ax, az), Math.hypot(bx, bz)) > bound - 1e-9;
  if (!candidates.length && !ringPossible) return null;

  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * (n / len);
    const px = ax + dx * t, pz = az + dz * t;
    for (const s of candidates) {
      if (solidDistance(s, px, pz) - r <= 0) return s;
    }
    if (ringPossible && Math.hypot(px, pz) > bound) return RING;
  }
  return null;
}

/** Sentinel: the play bound blocked the line, and it has no corners to round. */
const RING = Object.freeze({ id: "play-bound", ring: true });

/**
 * The places a body could stand just outside a solid and see round it: its four
 * corners, each pushed out along its own diagonal far enough for a body, plus
 * the two points square to the bot's line of approach.
 *
 * NO FACE MIDDLES. The first version added those four as well, on the theory
 * that more candidates is more choice, and it was strictly worse: a
 * point off the middle of a face is not somewhere you can see round anything
 * from, and it is CHEAP — it is the nearest point on the whole silhouette — so
 * the straight-line cost picks it every time and the bot walks to the middle of
 * the woodpile's flank and stops there, because the onward line from it is
 * still through the woodpile. Measured: a bot committed to the flank waypoint
 * at (-4.86, -2.83) and shuttled around it for the rest of the run. A waypoint
 * has to be a place the geometry changes at, and on a convex shape those are
 * exactly the corners.
 */
function silhouette(s, bodyRadius, fromX, fromZ) {
  const out = [];
  const off = s.pad + bodyRadius + CORNER_STANDOFF;
  for (const ex of [-1, 1]) {
    for (const ez of [-1, 1]) {
      const l = Math.SQRT1_2;
      const px = s.halfX * ex + ex * l * off;
      const pz = s.halfZ * ez + ez * l * off;
      out.push({ x: s.x + px * s.cos + pz * s.sin, z: s.z - px * s.sin + pz * s.cos });
    }
  }
  // ...and the two beside it, square to the bot's own line of approach. A
  // BOULDER HAS NO CORNERS: a disc's four "corners" collapse onto four fixed
  // diagonal bearings, and a bot approaching one along a diagonal is offered
  // two waypoints at right angles to his path and two behind the rock. He goes
  // nowhere. These two are the real silhouette of a round thing — where its
  // edge appears to be from where you are standing — and they follow the bot
  // round instead of standing still.
  const dx = s.x - fromX, dz = s.z - fromZ;
  const l = Math.hypot(dx, dz);
  if (l > 1e-6) {
    const px = -dz / l, pz = dx / l;
    const reach = s.bound + bodyRadius + CORNER_STANDOFF;
    out.push({ x: s.x + px * reach, z: s.z + pz * reach });
    out.push({ x: s.x - px * reach, z: s.z - pz * reach });
  }
  return out;
}

/**
 * Steer a heading around whatever is in front of it.
 *
 * `resolveSolids` alone makes a bot walking dead-on into a flat face STOP —
 * correctly, because that is what solid means — and a bot that goes on holding
 * forward stops there for the rest of the round. That is the owner's "bots must
 * not walk into things forever", and it is not a collision bug, it is a
 * navigation one, so it is fixed here rather than by softening the wall.
 *
 * WHAT THIS IS: if the line to the goal is clear, the heading is the goal, and
 * that is one loop and the answer for most bots most of the time. If it is not,
 * the first solid across that line is asked for the eight places a body could
 * stand just outside it, and the bot aims at whichever of them makes the
 * shortest there-and-on-to-the-goal detour. Tangent-bug navigation, one
 * waypoint deep.
 *
 * WHAT IT IS NOT, AND WHY — because two cheaper things were built first and
 * both are recorded here rather than deleted, so nobody rebuilds them.
 *
 *  1. A SUM OF TANGENTS, one per nearby solid, weighted by how squarely the
 *     heading ran into it. The textbook steering behaviour. On the proving
 *     ground's ruin corner it failed: a bot sliding east along the south wall
 *     reaches the junction, the south wall's tangent says "east, round the near
 *     end", the east wall's says "west, you are walking into me", the two very
 *     nearly cancel and their sum points NORTH — into the south wall. The
 *     resolver killed all of it and the bot stood at (2.61, -9.88) with a
 *     velocity of 0.00 for the remaining 170 ticks. 13 of 182 runs.
 *  2. THE SAME, with the summed heading projected out of every surface the body
 *     was touching. That unstuck him and gave a LIMIT CYCLE instead: east, west,
 *     east, west between x = 2.48 and x = 2.73 for ever.
 *  3. A FAN OF PROBES scored by ground gained toward the goal. This one is the
 *     instructive failure. It solves the ruin corner and it CANNOT solve a long
 *     wall: standing at the middle of a 6.2 m wall with the goal on the far
 *     side, every heading that gains anything toward the goal is blocked and
 *     every heading that is open gains nothing, so the score is flat and he
 *     dithers 0.75 m off the face for ever. 16 of 182 runs. Going round a wall
 *     REQUIRES walking away from the goal for several metres, and no score that
 *     is greedy in distance-to-goal will ever choose that.
 *
 * A corner is the thing a greedy score is missing: it is a point that is worth
 * walking away from the goal to reach, and the solid knows where its own
 * corners are.
 *
 * IT IS STILL NOT A PATH-FINDER. One waypoint, one obstacle at a time, and it
 * can be held by a genuine pocket — a courtyard with one door, say. A map that
 * builds one needs a planner and should say so rather than tuning this.
 *
 * @param {object} ground
 * @param {number} x @param {number} z Where the bot is.
 * @param {number} dirX @param {number} dirZ WHERE IT WANTS TO GO, as an offset
 *   from where it is — not a unit heading. The length is used: the detour cost
 *   is measured against the real goal, and a normalised direction would put the
 *   goal one metre away and route round nothing.
 * @param {number} bodyRadius
 * @param {object} [memory] One waypoint of commitment, owned by the CALLER —
 *   give each bot its own `{}` and hand back the same one every tick. Without
 *   it the choice of corner is recomputed from scratch each tick, and two
 *   corners of nearly equal cost then swap the lead as the bot walks: measured
 *   on the woodpile, a bot re-choosing every tick reversed his heading every
 *   four ticks and shuttled between (-4.94, -2.88) and (-4.81, -2.80) for the
 *   rest of the run. Going round a corner takes longer than one tick, so the
 *   decision has to last longer than one tick. This is the whole of the state
 *   this module keeps and it is the caller's.
 * @returns {{x:number,z:number}} A unit heading, or {0,0} if it was given one.
 */
export function steerAroundSolids(ground, x, z, dirX, dirZ, bodyRadius, memory) {
  const dl = Math.hypot(dirX, dirZ);
  if (dl < 1e-9) return { x: 0, z: 0 };
  const ux = dirX / dl, uz = dirZ / dl;

  const gx = x + dirX, gz = z + dirZ;
  const blocker = lineBlocker(ground, x, z, gx, gz, bodyRadius);
  if (!blocker) { if (memory) memory.wx = undefined; return { x: ux, z: uz }; }
  // The play bound has no corner to round; a bot pressed on it is already
  // inside the arena and the goal is outside it, so the intent is the answer.
  if (blocker.ring) { if (memory) memory.wx = undefined; return { x: ux, z: uz }; }

  // Still going where he was going, if that is still a sane place to go: the
  // waypoint has to be one he has not reached, on the solid he is still routing
  // around, for a goal that has not moved out from under him.
  // NOT "still the same blocker". At the ruin's outside corner the first solid
  // across the line to the goal alternates between the two walls tick by tick,
  // and a commitment keyed on the blocker's identity is therefore thrown away
  // every other tick: measured, a bot sat at (3.62, -9.87) swapping heading
  // between north and south for 170 ticks. What makes a commitment stale is
  // reaching it, or the goal moving out from under it, or the corner ceasing to
  // be a place a body can stand — not which wall happens to be nearer.
  if (memory && memory.wx !== undefined
      && Math.hypot(gx - memory.gx, gz - memory.gz) < 1.5
      && clearanceAt(ground, memory.wx, memory.wz, bodyRadius) > 0.05) {
    const leg = Math.hypot(memory.wx - x, memory.wz - z);
    if (leg > 0.4) return { x: (memory.wx - x) / leg, z: (memory.wz - z) / leg };
  }

  let bestX = ux, bestZ = uz, bestCost = Infinity, bestBlocked = true;
  let bestW = null;
  const corners = silhouette(blocker, bodyRadius, x, z);
  for (const w of corners) {
    const leg = Math.hypot(w.x - x, w.z - z);
    if (leg < 1e-6) continue;
    // A waypoint has to be a place a body can stand. At the proving ground's
    // ruin corner the south wall's eastern corners are INSIDE the east wall, so
    // a bot routing round the near end was aiming at a point in the masonry; he
    // pressed into the junction and never arrived. Rejecting them sends him the
    // long way round the far end, which is the answer a man would give.
    if (clearanceAt(ground, w.x, w.z, bodyRadius) <= 0.05) continue;
    // There-and-on: the detour this corner costs. The corner that gets him
    // round with the least walking is the one he commits to, and because the
    // cost is a smooth function of where he is standing it does not change
    // hands underneath him as he walks toward it.
    // ...and what the corner is WORTH is the rest of the journey from it, not
    // the crow-flight distance from it. Those differ exactly when the corner
    // does not get him round, which is the case that matters: standing at the
    // outside of the ruin's corner, the near corner of the south wall is 0.2 m
    // away and 7.2 m from the goal, and the far corner is 7.2 m away and 3.9 m
    // from the goal — so a crow-flight heuristic picks the near one, from which
    // the goal is still through the wall, and the bot shuttles there for ever.
    // A flat penalty for "onward blocked" does not fix it either: both corners
    // are blocked onward, so both are penalised and the near one still wins.
    //
    // One more corner of lookahead does fix it, and it is the smallest thing
    // that can: if the way on from a corner is blocked, the cost of getting on
    // is measured through the best NEXT corner rather than through the wall.
    // 11.3 for the far corner against 11.4 for the near one — a narrow win, and
    // it is the right one, and it only costs anything on the ticks a bot is
    // actually up against something.
    const onward = lineBlocker(ground, w.x, w.z, gx, gz, bodyRadius);
    const useless = onward !== null && onward.id === blocker.id;
    const cost = leg + Math.hypot(gx - w.x, gz - w.z) + (useless ? 100 : 0);
    const blocked = lineBlocker(ground, x, z, w.x, w.z, bodyRadius) !== null;
    // A corner he can see beats one he cannot, whatever the cost.
    if (blocked && !bestBlocked) continue;
    if (!blocked && bestBlocked) { bestCost = Infinity; }
    if (cost < bestCost) {
      bestCost = cost; bestBlocked = blocked; bestW = w;
      bestX = (w.x - x) / leg; bestZ = (w.z - z) / leg;
    }
  }
  if (memory) {
    if (bestW) { memory.wx = bestW.x; memory.wz = bestW.z; memory.gx = gx; memory.gz = gz; }
    else memory.wx = undefined;
  }
  return { x: bestX, z: bestZ };
}

// ===========================================================================
// PROP KINDS
//
// A kind is one function that lays a prop out — every billet, every stake, in
// world space — and one call to `fitFootprint` around what it laid out. The
// renderer instances the meshes from the layout; the sim collides against the
// fitted shape. Neither writes the other's numbers down.
//
// This is what stops the fifth recorded instance of the mirrored-definition
// fault becoming the sixth. A prop kind is a little more machinery than a
// literal `{x, z, radius}` would be, and the machinery is the point: there is
// no second place to edit, so there is no second place to forget.
// ===========================================================================

/** Local frame of a placement: along the yaw, and across it. three.js signs. */
function frame(rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return { ux: c, uz: -s, wx: s, wz: c };
}

/** World point -> the shape's own frame. */
function toLocal(rot, cx, cz, x, z) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const dx = x - cx, dz = z - cz;
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

/**
 * A RICK — split billets coursed between driven crib stakes. The village's
 * woodpile, and the owner's own example of a thing that should stop a man.
 *
 * The layout is the one `render/world.ts` used to hold as literals, moved here
 * whole, RNG STREAM AND ALL: the jig draws exactly twenty-two numbers in
 * exactly the order it drew them before, so the pile stands billet-for-billet
 * where it stood and an A/B against `art/shots/baseline` is still measuring the
 * same rick. Two of those numbers per billet (its shuffle along its own length
 * and its yaw jitter) and one per stake (its lean).
 *
 * `spill` — the couple of billets rolled off the end and lying where they fell
 * — is generated with the rick and is deliberately NOT part of the footprint.
 * A log lying flat in the mud is the owner's "decoration decoration"; the stack
 * it fell off is the obstacle. The distinction lives inside one prop.
 */
export function rick(plan) {
  if (typeof plan.seeded !== "function") {
    throw new Error(`rick ${plan.id}: pass the seeded-rng factory in. This module imports nothing; see the header.`);
  }
  const p = {
    // A split billet tapers: `billetR` is the butt and the only one collision
    // cares about, `billetTopR` is what the renderer's cylinder narrows to.
    billet: 1.5, billetR: 0.11, billetTopR: 0.1,
    courses: 3, perCourse: 4, gap: 0.225, rise: 0.195, sit: 0.055, shuffle: 0.16,
    yawJitter: 0.05,
    stakeOut: 0.09, stakeSide: 0.42, stakeR: 0.055, stakeTopR: 0.045, stakeH: 0.98,
    stakeLean: 0.1, stakeLeanVary: 0.07,
    spill: [
      { along: 1.15, across: -0.28, yaw: -1.3, len: 1.05, r: 0.095 },
      { along: 1.51, across: 0.34, yaw: 0.9, len: 1.05, r: 0.095 },
    ],
    seed: 0x1f0a3c7d,
    ...plan,
  };
  const parts = rickLayout(p);
  const discs = [];
  for (const b of parts.billets) {
    // A billet is a cylinder lying along its own yaw: in plan it is a capsule,
    // and its two end caps are what set the extent.
    const f = frame(b.yaw);
    for (const e of [-1, 1]) {
      const wx = b.x + f.ux * (p.billet / 2) * e;
      const wz = b.z + f.uz * (p.billet / 2) * e;
      const l = toLocal(p.rot, p.x, p.z, wx, wz);
      discs.push({ x: l.x, z: l.z, r: p.billetR });
    }
  }
  for (const s of parts.stakes) {
    // Foot and top. The top is displaced across the courses by the lean, and
    // the sim is 2-D, so the splay is part of the footprint whether or not a
    // man's shins ever reach that high. See the header.
    const f = frame(p.rot);
    const foot = toLocal(p.rot, p.x, p.z, s.x, s.z);
    discs.push({ x: foot.x, z: foot.z, r: p.stakeR });
    const reach = Math.sin(s.lean) * p.stakeH;
    const top = toLocal(p.rot, p.x, p.z, s.x + f.wx * reach, s.z + f.wz * reach);
    discs.push({ x: top.x, z: top.z, r: p.stakeTopR });
  }
  const fit = fitFootprint(discs, p.billetR);
  const s = solid({
    id: p.id, x: p.x, z: p.z, rot: p.rot,
    halfX: fit.halfX, halfZ: fit.halfZ, pad: fit.pad,
    height: p.sit + p.courses * p.rise + p.billetR,
    why: p.why,
  });
  return Object.freeze({ ...s, plan: Object.freeze(p), parts, discs: Object.freeze(discs) });
}

/** Every piece of a rick, in world space, in the order the renderer places them. */
export function rickLayout(p) {
  const f = frame(p.rot);
  const jig = p.seeded(p.seed);
  const billets = [];
  for (let row = 0; row < p.courses; row++) {
    const n = p.perCourse - row;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * p.gap;
      const slide = (jig() - 0.5) * p.shuffle;
      billets.push({
        x: p.x + f.wx * off + f.ux * slide,
        z: p.z + f.wz * off + f.uz * slide,
        lift: p.sit + row * p.rise,
        yaw: p.rot + (jig() - 0.5) * p.yawJitter,
        row,
      });
    }
  }
  const stakes = [];
  const axis = p.billet / 2 + p.stakeOut;
  for (let e = 0; e < 2; e++) {
    const bx = p.x + f.ux * (e ? axis : -axis);
    const bz = p.z + f.uz * (e ? axis : -axis);
    for (let s = 0; s < 2; s++) {
      const side = s ? p.stakeSide : -p.stakeSide;
      stakes.push({
        x: bx + f.wx * side,
        z: bz + f.wz * side,
        yaw: p.rot + Math.PI / 2,
        lean: (p.stakeLean + jig() * p.stakeLeanVary) * (s ? 1 : -1),
      });
    }
  }
  const spill = p.spill.map((sp) => ({
    x: p.x + f.ux * sp.along + f.wx * sp.across,
    z: p.z + f.uz * sp.along + f.wz * sp.across,
    yaw: p.rot + sp.yaw,
    len: sp.len,
    r: sp.r,
  }));
  return Object.freeze({ billets: Object.freeze(billets), stakes: Object.freeze(stakes), spill: Object.freeze(spill) });
}

/**
 * A RAISED STONE — an irregular slab set upright, extruded from a noisy
 * outline. The village's runestone.
 *
 * The outline is generated here because BOTH sides need it: the renderer
 * extrudes it and measures its width at each height to cut the interlace band
 * to the rock, and the sim needs the widest the thing ever is in plan. It is
 * the same fourteen points either way.
 *
 * The plan-view footprint is the union over HEIGHT — the slab leans 0.05 rad,
 * so its top overhangs its foot by about 10 cm, and in a 2-D sim a man walks
 * into the overhang as surely as into the base.
 */
export function raisedStone(plan) {
  if (typeof plan.noise !== "function") {
    throw new Error(`raisedStone ${plan.id}: pass the noise field in. This module imports nothing; see the header.`);
  }
  const p = {
    points: 14, radiusX: 0.62, wobbleX: 0.3, radiusY: 1.85, wobbleY: 0.22,
    depth: 0.42, bevel: 0.05, surfaceWobble: 0.04,
    taper: 0.22, span: 3.8, base: 1.9, lean: 0.05, lift: 1.95,
    ...plan,
  };
  const outline = stoneOutline(p);
  const cos = Math.cos(p.lean), sin = Math.sin(p.lean);
  const halfDepth = p.depth / 2 + p.bevel;
  const discs = [];
  let top = 0;
  for (const v of outline) {
    const t = Math.min(1, Math.max(0, (v.y + p.base) / p.span));
    const pinch = 1 - t * p.taper;
    // The slab's own x carried through the lean, and the extrusion's depth.
    const lx = v.x * pinch * cos - v.y * sin;
    for (const e of [-1, 1]) {
      discs.push({ x: lx, z: halfDepth * pinch * e, r: p.surfaceWobble + p.bevel });
    }
    const h = v.x * pinch * sin + v.y * cos;
    if (h > top) top = h;
  }
  const fit = fitFootprint(discs, p.surfaceWobble + p.bevel);
  const s = solid({
    id: p.id, x: p.x, z: p.z, rot: p.rot,
    halfX: fit.halfX, halfZ: fit.halfZ, pad: fit.pad,
    height: p.lift + top,
    why: p.why,
  });
  return Object.freeze({ ...s, plan: Object.freeze(p), outline, discs: Object.freeze(discs) });
}

/**
 * The fourteen-point outline, in the slab's own XY. Deterministic: it is value
 * noise off a fixed lattice, so it is the same shape on the server, in the
 * renderer and in a harness, with no seed to keep in step.
 */
export function stoneOutline(p) {
  const out = [];
  const TAU = Math.PI * 2;
  for (let i = 0; i <= p.points; i++) {
    const a = (i / p.points) * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    const rx = p.radiusX * (1 + p.noise(ca * 2 + 3, sa * 2 - 1) * p.wobbleX);
    const ry = p.radiusY * (1 + p.noise(ca * 2 - 7, sa * 2 + 4) * p.wobbleY);
    out.push({ x: ca * rx, y: sa * ry * (sa > 0 ? 0.95 : 0.7) });
  }
  return Object.freeze(out);
}
