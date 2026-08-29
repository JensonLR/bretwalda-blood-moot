// THE FIRST MOOT — the teaching half of the rite that replaced the campaign.
//
// The owner, 26 Aug 2026, ruling the campaign row closed:
//
//   "do we really need a campaign? I feel like a cool starter tutorial for new
//    arrivals would be better? we could maybe even have them pick their kingdom
//    in this part while also showing how to play? could make it cinematic &
//    cool?"
//
// And again, 29 Aug, on what the first cut of it was missing:
//
//   "the tutorial should be a full phased cinematic journey, with pause points,
//    teaching all the controls, and they must complete each task before
//    advancing. We don't want them just dying constantly while trying to figure
//    it out."
//
// SO IT IS PHASES NOW, NOT A LIST. The first cut was five beats in a row —
// move, strike, guard, dodge, power — with no shape to them, no rest between,
// and five of the eleven things a man actually has to do left untaught: where
// to look, how to run, how to name a cut, how to throw a heavy, how to shove.
// Four phases, ten beats, and a card at the head of each: the card IS the pause
// point, and it is where the rite says what the next stretch is for before
// anything is asked of him.
//
// WHAT COUNTS AS DEMONSTRATED IS READ OFF THE SIM, NOT OFF THE GLASS. A beat
// advances when the SERVER's snapshot of the local player shows the act —
// `state === "attacking"` is a strike the sim honoured, three metres of covered
// ground is movement that actually happened. Keying off raw input would pass a
// tap the server refused (mid-stagger, out of stamina), teach the player a lie,
// and split into a touch path and a keyboard path; the snapshot is one truth
// for both. It is also what makes this module drivable headless: hand `note()`
// a sequence of player states and the whole rite runs without a browser, which
// is what `tools/moottest.mjs` does on every edit.
//
// AND NOBODY SWINGS AT HIM UNTIL HE HAS A GUARD. `armed` is false for the first
// two phases and true from THE SHIELD on, which is the phase whose whole
// subject is a blow arriving. The ring already opened empty and the foe already
// walked in at STRIKE (backlog 8.5); now he walks in and STANDS THERE — a pell
// with a pulse — until the rite says the man he is facing knows how to stop
// one. That is the owner's "not dying constantly while trying to figure it out"
// and it is one boolean, read by the client and enforced by the engine.
//
// Like `tuition.mjs`, storage is injected: this file is imported by a server
// render where `window` does not exist, and the harness has to play both a
// stranger and a graduate without clearing anybody's browser.

/** Where the verdict lives on a device. One key, three shapes: a flat beat
 *  index from before there were phases ("2"), a phase-and-beat ("1.2"), or
 *  DONE. The first is migrated on load and never written again. */
export const FIRST_MOOT_KEY = "bretwalda.firstmoot";
const DONE = "done";

/**
 * A beat holds its line for at least this many seconds of eligible time even
 * after its act lands, so a player who was already sprinting when the line rose
 * still reads the words that named what he did. Without the dwell the whole
 * rite can strobe past in four frames for a player mashing every control at
 * once — which is most of them.
 */
export const BEAT_DWELL = 1.4;

/**
 * How far a man must swing his view before LOOK is learned, in radians. 1.6 is
 * a bit over a right angle: enough that a drifting mouse or a thumb resting on
 * the glass cannot spend it, short enough that one honest look around the ring
 * does.
 */
export const LOOK_ARC = 1.6;

/**
 * The beats, by phase. `did` reads one snapshot of the local player plus the
 * LEDGER — the running totals a single snapshot cannot know, kept by `note`.
 *
 * Copy is the parchment voice, and each line names the CONTROL in the words the
 * platform uses — `touch` for thumbs, `desk` for the keyboard the desktop glass
 * documents. The HUD picks which half to print; this module does not know what
 * a screen is.
 */
export const MOOT_PHASES = Object.freeze([
  {
    id: "field",
    title: "THE FIELD",
    // The card is the pause point. Two lines: what this stretch is, and the
    // promise that nothing is coming yet — which is the half a frightened new
    // player most needs to hear and the half no tutorial ever says out loud.
    card: [
      "A ring of stakes, a fire, and no one in it but you.",
      "Nothing here will raise a hand. Learn to stand first.",
    ],
    beats: [
      {
        id: "look",
        touch: "Drag the right of the glass — that is your head. Look about you.",
        desk: "Move the mouse — that is your head. Look about you.",
        did: (p, led) => led.turned >= LOOK_ARC,
      },
      {
        id: "move",
        touch: "Your left thumb is your feet — walk the ring.",
        desk: "WASD is your feet — walk the ring.",
        did: (p, led) => led.travelled >= 3,
      },
      {
        id: "sprint",
        touch: "RUN, and watch your wind go. A blown man is a dead man.",
        desk: "Run (SHIFT), and watch your wind go. A blown man is a dead man.",
        did: (p) => p.state === "sprinting",
      },
    ],
  },
  {
    id: "blade",
    title: "THE BLADE",
    card: [
      "A man walks in to stand for you. He will not strike back.",
      "Cut him four ways and learn what each one costs.",
    ],
    beats: [
      {
        id: "strike",
        touch: "Strike — tap the crossed blades.",
        desk: "Strike — click.",
        did: (p) => p.state === "attacking",
      },
      {
        id: "aim",
        touch: "Now NAME the cut: flick as you tap. Two different ways.",
        desk: "Now NAME the cut: move as you click. Two different ways.",
        // Two, not four: four is a drill, two is the lesson — that the
        // direction is yours to choose and the blow follows the hand.
        did: (p, led) => led.dirs.size >= 2,
      },
      {
        id: "heavy",
        touch: "Hold the blades for a HEAVY. Slower, and it breaks a guard.",
        desk: "Hold the button for a HEAVY. Slower, and it breaks a guard.",
        did: (p) => p.swingHeavy === true,
      },
    ],
  },
  {
    id: "shield",
    title: "THE SHIELD",
    card: [
      "He has been told to fight now. He is a recruit; you have a shield.",
      "A guard held at the blow's own beat turns it. Early is a wasted arm.",
    ],
    beats: [
      {
        id: "guard",
        touch: "Hold your shield up.",
        desk: "Hold right-click.",
        did: (p) => p.state === "blocking",
      },
      {
        id: "dodge",
        touch: "Dodge — a step taken early is a blow that never lands.",
        desk: "Dodge (SPACE) — a step taken early is a blow that never lands.",
        did: (p) => p.state === "dodging" || p.state === "rolling",
      },
      {
        id: "shove",
        touch: "SHOVE him. Two hands break a guard and drive a man back.",
        desk: "Shove (F). Two hands break a guard and drive a man back.",
        did: (p) => p.state === "shoving",
      },
    ],
  },
  {
    id: "deed",
    title: "THE DEED",
    card: [
      "Every man on this island carries one trick that is his alone.",
      "Spend yours. Then the moot is yours to take.",
    ],
    beats: [
      {
        id: "power",
        touch: "Your power — spend it and see.",
        desk: "Your power (Q) — spend it and see.",
        did: (p) => p.abilityActive === true || p.state === "ability",
      },
    ],
  },
]);

/** Every beat in order, flattened — the shape the first cut of this module
 *  exported, kept because a beat index is still how a device remembers where it
 *  stood and because the HUD's pips count the whole rite and not one phase. */
export const MOOT_BEATS = Object.freeze(MOOT_PHASES.flatMap((p) => p.beats));

/** The phase a foe may first raise his hand in. Everything before it is a pell
 *  standing still: see the head of this file. */
const ARMED_FROM = MOOT_PHASES.findIndex((p) => p.id === "shield");

/** Where a flat beat index falls in the phase list. Used for old saves and by
 *  nothing else. */
function locate(flat) {
  let n = Math.max(0, flat);
  for (let i = 0; i < MOOT_PHASES.length; i++) {
    if (n < MOOT_PHASES[i].beats.length) return [i, n];
    n -= MOOT_PHASES[i].beats.length;
  }
  return [MOOT_PHASES.length, 0];
}

/**
 * The rite. `load`/`save` carry the device's progress; both optional so a
 * server render can construct one inert.
 */
export function createFirstMoot({ load = () => null, save = () => {} } = {}) {
  const stored = load();
  let done = stored === DONE;
  let ph = 0;
  let bi = 0;
  if (!done && typeof stored === "string" && stored.length) {
    if (stored.includes(".")) {
      const [a, b] = stored.split(".");
      ph = Math.min(MOOT_PHASES.length - 1, Math.max(0, parseInt(a, 10) || 0));
      bi = Math.min(MOOT_PHASES[ph].beats.length - 1, Math.max(0, parseInt(b, 10) || 0));
    } else {
      // A save from before there were phases. It is a flat beat index into a
      // FIVE-beat list that no longer exists, so it is placed by position in
      // the old order — move, strike, guard, dodge, power — which are still
      // beats and still in that relative order. Nobody is sent backwards and
      // nobody is skipped past a phase he never saw.
      const OLD = ["move", "strike", "guard", "dodge", "power"];
      const id = OLD[Math.max(0, Math.min(OLD.length - 1, parseInt(stored, 10) || 0))];
      const flat = MOOT_BEATS.findIndex((b) => b.id === id);
      [ph, bi] = locate(flat < 0 ? 0 : flat);
    }
  }
  /** The phase's card is up and nothing is being asked yet. THE PAUSE POINT. */
  let carded = !done;
  /** Seconds the current beat has been up. */
  let up = 0;
  /** True once the current beat's act has been seen (dwell may still hold it). */
  let landed = false;
  /** What a single snapshot cannot know. */
  const led = { travelled: 0, turned: 0, dirs: new Set() };
  let lastX = null;
  let lastZ = null;
  let lastRot = null;

  const finish = () => {
    if (!done) { done = true; carded = false; save(DONE); }
  };
  const mark = () => save(`${ph}.${bi}`);

  return {
    /** The current beat, or null when the rite is over or a card is up. */
    get beat() { return done || carded ? null : MOOT_PHASES[ph]?.beats[bi] ?? null; },
    /** The phase now running, or null when the rite is over. */
    get phase() { return done ? null : MOOT_PHASES[ph] ?? null; },
    /** The card to show, or null when there is none up. THE PAUSE POINT: while
     *  this is set the rite is holding and `note` advances nothing. */
    get card() { return done || !carded ? null : MOOT_PHASES[ph] ?? null; },
    get phaseAt() { return Math.min(ph, MOOT_PHASES.length); },
    get phaseTotal() { return MOOT_PHASES.length; },
    /** How many beats are behind him, over the whole rite, for a progress read. */
    get at() {
      let n = 0;
      for (let i = 0; i < ph && i < MOOT_PHASES.length; i++) n += MOOT_PHASES[i].beats.length;
      return Math.min(n + bi, MOOT_BEATS.length);
    },
    get total() { return MOOT_BEATS.length; },
    get done() { return done; },
    /**
     * May a foe raise his hand yet? False through THE FIELD and THE BLADE,
     * true from THE SHIELD on, and true once the rite is over — a graduate is
     * owed a real fight. The client sends this to the server once; the engine
     * holds the bots until it arrives.
     */
    get armed() { return done || ph >= ARMED_FROM; },

    /** Dismiss the phase's card and begin its beats. */
    open() { carded = false; },

    /**
     * One frame of the rite: the sim's snapshot of the local player and the
     * seconds since the last call. Returns the beat that just RETIRED when one
     * does — the HUD uses that edge for its chime — and null otherwise.
     */
    note(player, dt) {
      if (done || !player) return null;
      // The ledgers run whatever the beat — and whether or not a card is up —
      // so a player who walked or looked around before the line rose is not
      // asked to do it twice. Travel counts only ground covered in a MOVING
      // state: the spawn's own repositioning and the countdown settle covered
      // three metres for a player who never touched the stick, and MOVE retired
      // unearned. A teleport is not a step.
      const moving = player.state === "walking" || player.state === "running" || player.state === "sprinting";
      if (lastX !== null && moving) led.travelled += Math.hypot(player.position.x - lastX, player.position.z - lastZ);
      lastX = player.position.x; lastZ = player.position.z;
      // The view ledger is the same idea for the head. Wrapped, because a man
      // who turns through north hands back a rotation that jumped 2π and an
      // unwrapped difference would retire LOOK on one frame of arithmetic.
      if (lastRot !== null) {
        let d = player.rotation - lastRot;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        led.turned += Math.abs(d);
      }
      lastRot = player.rotation;
      // Which ways he has cut. Only while the sim says he is swinging, so a
      // direction held on the stick between blows is not a blow.
      if (player.state === "attacking" && player.attackDir) led.dirs.add(player.attackDir);

      if (carded) return null;
      const beat = MOOT_PHASES[ph]?.beats[bi];
      if (!beat) { finish(); return null; }
      up += dt;
      if (!landed && beat.did(player, led)) landed = true;
      if (landed && up >= BEAT_DWELL) {
        const retired = beat;
        up = 0;
        landed = false;
        bi += 1;
        if (bi >= MOOT_PHASES[ph].beats.length) {
          ph += 1;
          bi = 0;
          if (ph >= MOOT_PHASES.length) { finish(); return retired; }
          // The next phase opens on its card, which is the rest between two
          // stretches of being asked to do things.
          carded = true;
        }
        mark();
        return retired;
      }
      return null;
    },

    /**
     * The graduate's door. "I know the fight — take me to the war" is a real
     * need (a returning player on a fresh device), and a rite that traps him is
     * a tutorial, which is the word the owner did not use.
     */
    skip() { finish(); },
  };
}
