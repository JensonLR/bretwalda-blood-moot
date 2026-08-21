// Types for `grounds.mjs`, which is plain ESM so the server can load it
// without taking a browser dependency. Same arrangement as `engine.d.ts`, and
// for the same reason: the module is shared, so its declaration is separate.
declare module "@/game/grounds.mjs" {
  import type { Passable, RaisedStone, Rick, Solid } from "@/game/solidground.mjs";

  export function clamp01(x: number): number;
  /** Fixed-seed PRNG. Shared, because the sim now lays out props too. */
  export function seeded(seed: number): () => number;
  export function smoothstep(e0: number, e1: number, x: number): number;
  export function hash2(ix: number, iy: number): number;
  export function noise2(x: number, y: number): number;
  export function fbm(x: number, y: number, octaves: number): number;
  export function ridged(x: number, y: number, octaves: number): number;

  /** An ellipse of standing water, and the basin it carved to sit in. */
  export interface Puddle {
    x: number;
    z: number;
    /** Semi-axis along `rot`, in metres. */
    a: number;
    /** Semi-axis across it. */
    b: number;
    rot: number;
    /** Standing depth at the centre; the basin under it is depth / waterFill. */
    depth: number;
    cos: number;
    sin: number;
    /** Squared world distance past which this puddle contributes nothing. */
    reach2: number;
  }

  /** A circle on the floor. What a hazard is; obstacles are `Solid` instead. */
  export interface GroundCircle {
    id: string;
    x: number;
    z: number;
    radius: number;
  }

  /**
   * Something that can kill a man nobody swung at. `radius` is the outermost
   * geometry of the thing itself; the sim decides how far inside that a body
   * has to be before it counts.
   */
  export interface GroundHazard extends GroundCircle {
    kind: "fire";
  }

  /** How big the fighting floor is and what shape. Discs only, so far. */
  export interface GroundBounds {
    shape: "disc";
    radius: number;
  }

  /** What the spawn solver needs to place a round's worth of men. */
  export interface GroundSpawn {
    /** Straight-line room each man is owed from the neighbour beside him. */
    gap: number;
    minRadius: number;
    maxRadius: number;
  }

  /**
   * The half of a ground that has no opinion about pixels. Everything the
   * server needs and nothing it cannot load.
   */
  export interface GroundSpec {
    id: string;
    name: string;
    play: GroundBounds;
    spawn: GroundSpawn;
    hazards: readonly GroundHazard[];
    /**
     * Standing geometry a man cannot walk through. Plan-view shapes, because
     * the sim is 2-D; `solidground.mjs` is what turns them into walls, and
     * `resolveSolids` is the one call the movement step makes.
     */
    obstacles: readonly Solid[];
    /** Ground height under a world-space point. Pure arithmetic. */
    heightAt(x: number, z: number): number;
  }

  /** The village's own analytic fields, shared with whoever draws it. */
  export interface SaxonVillageField {
    reliefRadius: number;
    gateAngles: readonly number[];
    puddles: readonly Puddle[];
    waterFill: number;
    wetMargin: number;
    deepestWater: number;
    pathMask(x: number, z: number, r: number): number;
    churnMask(x: number, z: number, r: number): number;
    drainage(x: number, z: number): number;
    basinWet(x: number, z: number): number;
  }

  export const VILLAGE_WOODPILE: Rick;
  export const VILLAGE_RUNESTONE: RaisedStone;
  /** The props that deliberately do NOT block, each with its reason. */
  export const VILLAGE_PASSABLE: readonly Passable[];

  export const SAXON_VILLAGE: GroundSpec & { field: SaxonVillageField };
  export const GROUNDS: Record<string, GroundSpec>;
  export const DEFAULT_GROUND_ID: string;
  export function getGround(id: string): GroundSpec;

  /** The moor's own analytic fields, shared with whoever draws it. */
  export interface PictMoorField {
    reliefRadius: number;
    hollows: ReadonlyArray<{ x: number; z: number; depth: number; reach: number; reach2: number }>;
    stones: ReadonlyArray<import("@/game/solidground.mjs").RaisedStone>;
    wet(x: number, z: number): number;
    peat(x: number, z: number): number;
  }
  export const PICT_MOOR: GroundSpec & { field: PictMoorField };
  export const GROUND_BY_PEOPLE: Readonly<Record<string, string>>;
  export function groundForPeople(people: string): string;
}
