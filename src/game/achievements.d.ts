// Types for `achievements.mjs` — plain ESM because it derives from
// `marks.mjs` and must be loadable by the same two readers: the future
// wrapper's sync loop and the headless harness that proves the derivation.
declare module "@/game/achievements.mjs" {
  import type { Mark, MarkFacts } from "@/game/marks.mjs";
  export interface Achievement {
    /** Steamworks API name: MARK_VALKNUT, MARK_RAVENBANNER. */
    apiName: string;
    markId: string;
    name: string;
    description: string;
    hidden: boolean;
  }
  export function apiNameOf(mark: Mark): string;
  export function achievements(): Achievement[];
  export function earnedAchievements(facts?: MarkFacts): string[];
}
