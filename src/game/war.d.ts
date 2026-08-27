declare module "@/game/war.mjs" {
  export type PeopleId = "saxon" | "norse" | "briton" | "pict";

  export const PEOPLES: readonly PeopleId[];

  /** A ring of [lat, lon] in degrees. Clipped to the real coast when drawn. */
  export type Ring = readonly (readonly [number, number])[];

  export interface Territory {
    readonly id: string;
    readonly name: string;
    /** What its own people called it. */
    readonly native: string;
    readonly people: PeopleId;
    readonly blurb: string;
    /** Lead in contested points needed to take it. The ONLY number here. */
    readonly threshold: number;
    /** [lat, lon] of the label and the marker. */
    readonly anchor: readonly [number, number];
    readonly bounds: readonly Ring[];
    /** Set on the four seats of docs/FACTIONS.md §2. */
    readonly seat?: string;
  }

  export const TERRITORIES: readonly Territory[];
  export function territory(id: string): Territory | null;

  export const POINTS: {
    readonly turnout: number;
    readonly perKill: number;
    readonly victory: number;
    readonly cap: number;
  };
  export const SEASON_DAYS: number;
  /** The season's name in the fixed twelve-name cycle. Deterministic, index ≥ 1. */
  export function seasonName(index: number): string;
  export const FRONT_WINDOW: number;

  /** Degrees to britain.ts's 639 x 1000 frame. Web Mercator, same fit. */
  export function project(lat: number, lon: number): { x: number; y: number };

  export function pointsFor(result: { kills?: number; isWinner?: boolean }): number;

  export function dealTerritory(
    seed: string,
    front: { contested?: string[] } | null,
  ): string;

  /** One territory as the war holds it. Mutated in place by `contestGround`. */
  export interface Ground {
    holder: string;
    threshold: number;
    epoch: number;
    contest: Record<string, number>;
  }

  export interface Flip {
    territoryId: string;
    from: string;
    to: string;
    at: number;
    seasonIndex: number;
    epoch: number;
  }

  export interface Contribution {
    profileId: number | string;
    people: string;
    points: number;
    matches: number;
    firstAt: number;
  }

  export interface WarState {
    seasonIndex: number;
    startedAt: number;
    endsAt: number;
    state: "running" | "ended";
    territories: Record<string, Ground>;
    contributions: Record<string, Contribution>;
    flips: Flip[];
    seen: Record<string, number>;
    bankedTotal: number;
    clearedTotal: number;
    verdict: SeasonVerdict | null;
    endedAt: number;
  }

  export interface StandingsRow {
    people: PeopleId;
    held: number;
    points: number;
    contesting: number;
  }

  export interface SeasonVerdict {
    seasonIndex: number;
    people: PeopleId;
    standings: StandingsRow[];
    bretwalda: { profileId: number | string; people: PeopleId; points: number; matches: number } | null;
    endedAt: number;
  }

  export function newWar(opts?: {
    seasonIndex?: number;
    startedAt?: number;
    holdings?: Record<string, string> | null;
    thresholds?: Record<string, number> | null;
  }): WarState;

  export function bank(state: WarState, entry: {
    matchKey: string;
    playerId: string;
    profileId: number | string;
    people: string;
    territoryId: string;
    points: number;
    at?: number;
  }): { applied: boolean; reason: string; flip: Flip | null };

  /**
   * THE FLIP RULE, written once and used by both the in-memory season and the
   * Postgres one. Mutates `ground`; returns the flip it caused and the points
   * that flip consumed.
   */
  export function contestGround(ground: Ground, entry: {
    people: string;
    points: number;
    at?: number;
    seasonIndex?: number;
    territoryId?: string;
  }): { flip: Flip | null; cleared: number };

  export function conservation(state: WarState): {
    banked: number; held: number; cleared: number; ok: boolean;
  };
  export function standings(state: WarState): StandingsRow[];
  export function endSeason(state: WarState, now?: number): SeasonVerdict;
  export function openingHoldings(previousWinner: string | null): {
    holdings: Record<string, PeopleId>;
    thresholds: Record<string, number>;
  };
  export function front(state: WarState): {
    contested: string[];
    holdings: Record<string, string>;
  };
}
