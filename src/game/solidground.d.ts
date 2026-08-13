// Types for `solidground.mjs`, which is plain ESM so the server can load it
// without taking a browser dependency. Same arrangement as `grounds.mjs` and
// `engine.mjs`, and for the same reason: the module is shared, so its
// declaration is separate.
declare module "@/game/solidground.mjs" {
  /** A plan-view disc, in some shape's own frame. What a footprint is fitted to. */
  export interface SolidDisc {
    x: number;
    z: number;
    r: number;
  }

  /** An oriented rounded rectangle: the only collision shape the game has. */
  export interface Solid {
    readonly id: string;
    readonly kind: "solid";
    readonly x: number;
    readonly z: number;
    /** Yaw, three.js convention: +X maps to (cos, -sin) in (x, z). */
    readonly rot: number;
    readonly halfX: number;
    readonly halfZ: number;
    readonly pad: number;
    /** Carried for the renderer. THE SIM DOES NOT READ IT — the world is 2-D. */
    readonly height: number;
    readonly why: string;
    readonly cos: number;
    readonly sin: number;
    /** Past this distance from the centre nothing can be touching it. */
    readonly bound: number;
    /** Half the narrowest waist. Sets how finely a path has to be substepped. */
    readonly thick: number;
  }

  /** A prop that does NOT block, and the reason. Carries no geometry on purpose. */
  export interface Passable {
    readonly id: string;
    readonly kind: "passable";
    readonly why: string;
  }

  export interface Footprint {
    halfX: number;
    halfZ: number;
    pad: number;
  }

  /** What `resolveSolids` hands back. See the module header for the wiring. */
  export interface SolidHit {
    /** Where the body may actually stand. */
    x: number;
    z: number;
    /** Did anything stop it this step. */
    hit: boolean;
    /** UNIT direction the body may not travel. Feed to `killComponent`. */
    blockedX: number;
    blockedZ: number;
    contacts: number;
    /** No legal point for this step; the body stayed where it was. */
    frozen: boolean;
    /** The body STARTED inside something and had to be pushed out. */
    rescued: boolean;
    /**
     * Metres past the play bound, normally 0. Solids are hard and the ring is
     * soft: where the two cannot both hold, the body is left outside the disc
     * rather than inside a prop, and this says by how much.
     */
    outside: number;
  }

  /** Anything with the two fields the resolver reads off a ground. */
  export interface SolidGround {
    readonly obstacles: readonly Solid[];
    readonly play?: { shape: string; radius: number };
  }

  export const SOLID_SKIN: number;
  export const SOLID_TOLERANCE: number;

  export function solid(plan: {
    id: string; x: number; z: number; rot?: number;
    halfX: number; halfZ: number; pad: number; height: number; why: string;
  }): Solid;
  export function passable(id: string, why: string): Passable;

  export function solidDistance(s: Solid, x: number, z: number): number;
  export function rectDistance(halfX: number, halfZ: number, pad: number, lx: number, lz: number): number;
  export function solidNormal(
    s: Solid, x: number, z: number,
    out: { x: number; z: number }, hintX?: number, hintZ?: number,
  ): { x: number; z: number };
  export function fitFootprint(parts: readonly SolidDisc[], pad: number): Footprint;
  export function footprintEncloses(s: Solid, parts: readonly SolidDisc[]): number;

  export function playBound(ground: SolidGround): number;
  export function solidsOf(ground: SolidGround): readonly Solid[];
  export function clearanceAt(ground: SolidGround, x: number, z: number, bodyRadius?: number): number;
  export function isClear(ground: SolidGround, x: number, z: number, bodyRadius: number, tolerance?: number): boolean;

  /**
   * THE INTEGRATION POINT. Call it in the movement step, right after
   * `integrateMovement`, with where the body was and where the stride wants it.
   */
  export function resolveSolids(
    ground: SolidGround,
    fromX: number, fromZ: number,
    toX: number, toZ: number,
    bodyRadius: number,
  ): SolidHit;

  /** One waypoint of commitment. The CALLER owns one of these per bot. */
  export interface SteerMemory {
    wx?: number;
    wz?: number;
    gx?: number;
    gz?: number;
  }

  /**
   * Bot navigation, optional and not on the movement path. `dirX/dirZ` is the
   * OFFSET to the goal, not a unit heading — the length is used.
   */
  export function steerAroundSolids(
    ground: SolidGround,
    x: number, z: number,
    dirX: number, dirZ: number,
    bodyRadius: number, memory?: SteerMemory,
  ): { x: number; z: number };

  // ---- prop kinds -------------------------------------------------------
  // Each lays a prop out and fits its own collision shape around what it laid
  // out. The renderer instances the meshes from `parts`; the sim collides
  // against the `Solid` the same call returned. One definition.

  export interface RickSpill {
    along: number;
    across: number;
    yaw: number;
    len: number;
    r: number;
  }

  export interface RickPlan {
    id: string; x: number; z: number; rot: number; why: string;
    seeded: (seed: number) => () => number;
    seed?: number;
    billet?: number; billetR?: number; billetTopR?: number;
    courses?: number; perCourse?: number; gap?: number; rise?: number;
    sit?: number; shuffle?: number; yawJitter?: number;
    stakeOut?: number; stakeSide?: number; stakeR?: number; stakeTopR?: number;
    stakeH?: number; stakeLean?: number; stakeLeanVary?: number;
    spill?: readonly RickSpill[];
  }
  export interface RickParts {
    readonly billets: ReadonlyArray<{ x: number; z: number; lift: number; yaw: number; row: number }>;
    readonly stakes: ReadonlyArray<{ x: number; z: number; yaw: number; lean: number }>;
    readonly spill: ReadonlyArray<{ x: number; z: number; yaw: number; len: number; r: number }>;
  }
  export type Rick = Solid & {
    readonly plan: Required<RickPlan>;
    readonly parts: RickParts;
    readonly discs: readonly SolidDisc[];
  };
  export function rick(plan: RickPlan): Rick;
  export function rickLayout(plan: Required<RickPlan>): RickParts;

  export interface StonePlan {
    id: string; x: number; z: number; rot: number; why: string;
    noise: (x: number, y: number) => number;
    points?: number; radiusX?: number; wobbleX?: number; radiusY?: number; wobbleY?: number;
    depth?: number; bevel?: number; surfaceWobble?: number;
    taper?: number; span?: number; base?: number; lean?: number; lift?: number;
  }
  export type RaisedStone = Solid & {
    readonly plan: Required<StonePlan>;
    readonly outline: ReadonlyArray<{ x: number; y: number }>;
    readonly discs: readonly SolidDisc[];
  };
  export function raisedStone(plan: StonePlan): RaisedStone;
  export function stoneOutline(plan: Required<StonePlan>): ReadonlyArray<{ x: number; y: number }>;
}
