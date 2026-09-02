// Types for `standards.mjs` — plain ESM for the same reason `marks.mjs` is:
// the UI, the engine and the headless gate must load one table of what a
// Hearth may fly.
declare module "@/game/standards.mjs" {
  export type StandardTier = "find" | "text" | "invention";
  export interface Standard {
    id: string;
    name: string;
    /** How the device is known: FIND, TEXT or INVENTION (docs/FACTIONS.md §9.0). */
    tier: StandardTier;
    /** The object, text or admission it is drawn from. */
    source: string;
    /** One SVG path on a 24 x 24 grid, stroked in currentColor. */
    d: string;
  }
  export const TIERS: Readonly<Record<StandardTier, { label: string; blurb: string }>>;
  export const STANDARDS: Readonly<Record<string, readonly Standard[]>>;
  export const STANDARD_PEOPLES: readonly string[];
  export const REFUSED: readonly string[];
  export function standardsFor(people: string | null | undefined): readonly Standard[];
  export function standardOf(people: string | null | undefined, id: string | null | undefined): Standard | null;
  export function narrowStandard(people: string | null | undefined, id: string | null | undefined): string;
}
