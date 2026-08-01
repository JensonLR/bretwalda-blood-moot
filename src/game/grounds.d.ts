// Types for `grounds.mjs`, which is plain ESM so the server can load it
// without taking a browser dependency. Same arrangement as `engine.d.ts`, and
// for the same reason: the module is shared, so its declaration is separate.
declare module "@/game/grounds.mjs" {
  export function clamp01(x: number): number;
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

  /** A circle on the floor. Hazards and obstacles are both this shape today. */
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
    obstacles: readonly GroundCircle[];
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

  export const SAXON_VILLAGE: GroundSpec & { field: SaxonVillageField };
  export const GROUNDS: Record<string, GroundSpec>;
  export const DEFAULT_GROUND_ID: string;
  export function getGround(id: string): GroundSpec;
}
