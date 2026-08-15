// Types for `names.mjs`, which is plain ESM so the engine (Node) and the menu
// (Next) can share ONE definition of how an Anglo-Saxon name is built. Only the
// members either reader actually uses are declared.
declare module "@/game/names.mjs" {
  /** A forged name and what its two elements mean, e.g. "wolf-stone". */
  export interface ForgedName {
    name: string;
    gloss: string;
    proto: string;
    deutero: string;
  }
  export type BotTier = "recruit" | "warrior" | "jarl";

  export const PROTOTHEMES: ReadonlyArray<readonly [string, string]>;
  export const DEUTEROTHEMES: ReadonlyArray<readonly [string, string]>;
  export const BYNAMES: Readonly<Record<BotTier, ReadonlyArray<string>>>;

  export function joinElements(proto: string, deutero: string): string;
  export function isTautology(proto: string, deutero: string): boolean;
  /** `rand` is injected so a caller can seed it; defaults to Math.random. */
  export function forgeName(rand?: () => number): ForgedName;
  export function botName(seed: number, difficulty: string, forename: string): string;
  export function forgeSize(): number;
}
