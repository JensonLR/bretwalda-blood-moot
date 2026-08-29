// Types for `marks.mjs` — plain ESM for the same reason every shared rule
// module is: the UI and the headless harness must load one definition of
// what a mark is and when it is earned.
declare module "@/game/marks.mjs" {
  export interface Mark {
    id: string;
    name: string;
    how: "free" | "level" | "wins" | "matches" | "sworn" | "crowned";
    need: number;
    /** The find it is drawn from, or the label calling it an invention. */
    source: string;
    /** One SVG path on a 24 x 24 grid, stroked in currentColor. */
    d: string;
  }
  export interface MarkFacts {
    level?: number;
    wins?: number;
    matches?: number;
    sworn?: boolean;
    /** Ever crowned Bretwalda. Stamped by `settleSeason` and nowhere else. */
    crowned?: boolean;
  }
  export const MARKS: readonly Mark[];
  export const MARK_FACTS: readonly string[];
  export function markOf(id: string | undefined | null): Mark;
  export function markEarned(mark: Mark, facts?: MarkFacts): boolean;
  export function earnedMark(id: string | undefined | null, facts?: MarkFacts): Mark;
  export function markHint(mark: Mark): string;
  export function markWon(mark: Mark): string;
  export function heraldMarks(
    seen: readonly string[] | undefined | null,
    facts?: MarkFacts,
  ): { fresh: string[]; seen: string[] };
}
