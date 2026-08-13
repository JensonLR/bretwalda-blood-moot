// Types for `statshape.mjs`, which is plain ESM so the class card, the server
// and a toolchain-free `.mjs` harness can all read one definition of the four
// axes. Same arrangement as `engine.d.ts` and `grounds.d.ts`.
declare module "@/game/statshape.mjs" {
  import type { WarriorStats } from "@/game/types";

  export type StatAxis = "HEALTH" | "SPEED" | "DAMAGE" | "DEFENCE";

  /** The four axes, in the order the card draws them. */
  export const AXES: StatAxis[];
  /** What the card calls each one, in the three letters that fit the bar. */
  export const AXIS_LABEL: Record<StatAxis, string>;

  /** Damage a second off the light chain: `attackDamage / attackSpeed`. */
  export function damageRate(stats: WarriorStats): number;

  /** One class on one axis, in raw units, as the card draws it. */
  export function cardValue(stats: WarriorStats, axis: StatAxis): number;

  /** One class on one axis as the shape gate ranks it (damage is composite). */
  export function sheetValue<T extends string>(
    table: Record<T, WarriorStats>, cls: T, axis: StatAxis,
  ): number;

  /** Every class's value on an axis, under either reading. */
  export function valuesOn<T extends string>(
    table: Record<T, WarriorStats>, axis: StatAxis, reading?: "card" | "sheet",
  ): Record<T, number>;

  /** The two classes in the top half of an axis. */
  export function topTwo<T extends string>(values: Record<T, number>): T[];

  /** Each class's high axes, under either reading. */
  export function strengthsOf<T extends string>(
    table: Record<T, WarriorStats>, reading?: "card" | "sheet",
  ): Record<T, StatAxis[]>;

  export interface CardBar {
    axis: StatAxis;
    /** Three-letter label on the bar. */
    label: string;
    /** The class's own value, in raw units. */
    value: number;
    /** The largest value any class in `table` has on this axis. */
    max: number;
    /** `value / max`, in [0, 1] by construction — nothing to clamp. */
    frac: number;
    /** The number in the units a player would say it in. */
    text: string;
  }

  /** The four bars for one class, with maxima taken off the roster. */
  export function cardBars<T extends string>(
    table: Record<T, WarriorStats>, cls: T,
  ): CardBar[];
}
