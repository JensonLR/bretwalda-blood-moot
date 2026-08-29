// Types for `tour.mjs`, plain ESM for the same reason `firstmoot.mjs` is: the
// landing screen and `tools/tourtest.mjs` must load ONE definition of which
// doors there are and when a device is owed the walk.
declare module "@/game/tour.mjs" {
  export interface TourStop {
    id: string;
    /** The `data-tour` value on the real control. */
    target: string;
    title: string;
    line: string;
  }
  export const TOUR_STOPS: readonly TourStop[];
  export const TOUR_KEY: string;
  export interface Tour {
    readonly stop: TourStop | null;
    readonly at: number;
    readonly total: number;
    readonly done: boolean;
    readonly running: boolean;
    next(): TourStop | null;
    skip(): void;
  }
  export function createTour(opts?: {
    load?: () => string | null;
    save?: (v: string) => void;
    /** Is this stop's control on the glass right now? */
    has?: (target: string) => boolean;
  }): Tour;
  export function tourIsDue(save: (v: string) => void): void;
}
