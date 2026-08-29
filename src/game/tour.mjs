// THE TOUR — what a graduate is shown after he has sworn.
//
// The owner, 29 Aug 2026, on the end of the First Moot:
//
//   "...then it should take you to the WAR ROOM to choose your kingdom rather
//    than muster training, then a tour of the armoury, the sage, training, find
//    a fight, create a match."
//
// The rite teaches the FIGHT and the war room takes the OATH. Between those and
// actually playing sits a hall full of doors, and a new arrival who has just
// learned to shove a man has no reason to think any of them are for him. This
// is the third act: five doors, named, in the order he will want them.
//
// "THE SAGE" IS THE SAGA, and it is written down here rather than guessed at
// silently. There is no sage in this game and never has been; the mini-nav's
// third door is "Saga · profile", which is his record — the marks, the
// reckoning, the recovery code. That is what the tour points at.
//
// EVERY STOP IS A CONTROL THAT ALREADY EXISTS. `target` is a `data-tour`
// attribute on the real button, and the overlay MEASURES that element rather
// than being told where it is. A tour with its own idea of the layout is a tour
// that points at the wrong corner the first time a button moves, and this
// project has just spent a day on a rail that thought it knew where things
// were. If an element is missing the stop is skipped rather than drawn at the
// origin — a highlight around nothing is worse than no highlight.

/** Where the verdict lives on a device. `due` when the rite has finished and
 *  the tour has not run, an index while it is running, DONE after. */
export const TOUR_KEY = "bretwalda.tour";
const DUE = "due";
const DONE = "done";

/**
 * The doors, in the order the owner named them.
 *
 * `target` is the `data-tour` value on the element. `title` is the door's own
 * word — the same word printed on it, because a tour that renames things is a
 * tour you have to translate. `line` is what it is FOR, in one sentence, in the
 * parchment voice.
 */
export const TOUR_STOPS = Object.freeze([
  {
    id: "armoury", target: "armoury", title: "THE ARMOURY",
    line: "Helm, cloak, blade, paint. Gold buys the look; none of it buys the fight.",
  },
  {
    id: "saga", target: "saga", title: "YOUR SAGA",
    line: "Every kill, every match, and the marks you have earned. Your recovery code lives here — take it.",
  },
  {
    id: "training", target: "training", title: "THE TESTGROUNDS",
    line: "A private ring and as many men as you ask for. Nothing here counts against you.",
  },
  {
    id: "fight", target: "fight", title: "FIND A FIGHT",
    line: "The quickest road to a real moot. It puts you in the first ring with room.",
  },
  {
    id: "create", target: "create", title: "CREATE A BATTLE",
    line: "Your ring, your rules, your code to hand out. This is how a war band gets together.",
  },
]);

/**
 * The tour. `load`/`save` carry the device's progress, `has` answers whether a
 * stop's control is actually on the glass right now — injected for the same
 * reason storage is: this module must run headless, and `document` is not a
 * thing `tools/tourtest.mjs` has.
 */
export function createTour({ load = () => null, save = () => {}, has = () => true } = {}) {
  const stored = load();
  let done = stored === DONE;
  // A tour is only ever OFFERED once. `due` is written by the rite finishing;
  // anything else — no record at all, a stranger who never took the rite, a
  // garbled value — means this player is not owed a tour and must not be given
  // one uninvited. A tutorial that ambushes a veteran is a tutorial.
  let running = stored !== null && stored !== DONE && stored !== undefined && stored !== ""
    && (stored === DUE || /^\d+$/.test(stored));
  let at = /^\d+$/.test(String(stored)) ? Math.min(TOUR_STOPS.length - 1, parseInt(stored, 10)) : 0;
  if (!running) { at = 0; }

  const finish = () => {
    if (done) return;
    done = true;
    running = false;
    save(DONE);
  };
  /** Walk forward past any stop whose control is not on the glass. */
  const settle = () => {
    while (running && at < TOUR_STOPS.length && !has(TOUR_STOPS[at].target)) at += 1;
    if (running && at >= TOUR_STOPS.length) finish();
  };
  settle();

  return {
    /** The stop to draw, or null when the tour is not running. */
    get stop() { return running && !done ? TOUR_STOPS[at] ?? null : null; },
    get at() { return Math.min(at, TOUR_STOPS.length); },
    get total() { return TOUR_STOPS.length; },
    get done() { return done; },
    get running() { return running && !done; },

    /** Move to the next door, finishing when there are no more. */
    next() {
      if (!running || done) return null;
      at += 1;
      settle();
      if (!done && at < TOUR_STOPS.length) save(String(at));
      return this.stop;
    },

    /** "I will find them myself." Ends it for good, like the rite's own door. */
    skip() { finish(); },
  };
}

/** Mark this device as owed a tour. Called once, when the First Moot finishes. */
export function tourIsDue(save) {
  save(DUE);
}
