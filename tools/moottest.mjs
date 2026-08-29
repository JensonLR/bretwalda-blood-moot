#!/usr/bin/env node
// MOOTTEST — the First Moot's spine, driven headless.
//
//   node tools/moottest.mjs
//
// Every claim feeds `createFirstMoot` synthetic snapshots of the local player
// — the same shape the wire delivers — and asserts the rite advances on
// DEMONSTRATION and on nothing else. No browser, no server, sub-second: the
// E3 rule (cheapest instrument that can see the defect), same as weightprobe.
//
// REWRITTEN 29 Aug 2026 for phases. The owner: "the tutorial should be a full
// phased cinematic journey, with pause points, teaching all the controls, and
// they must complete each task before advancing." Half these claims are the old
// ones with a new address; the new ones are about the three things phases added
// — the card that holds the rite between stretches, the ledgers that let LOOK
// and AIM be demonstrated at all, and `armed`, which is what keeps a recruit's
// hands down until the player has a guard.
import { createFirstMoot, MOOT_PHASES, MOOT_BEATS, BEAT_DWELL, LOOK_ARC, FIRST_MOOT_KEY } from "../src/game/firstmoot.mjs";

let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

const at = (x, z, state = "idle", extra = {}) =>
  ({ position: { x, y: 0, z }, rotation: 0, state, abilityActive: false, ...extra });
const still = (x = 0, z = 0) => at(x, z);
const walk = (x, z) => at(x, z, "walking");

/** Feed one snapshot for `secs` of sim time in 0.1 s frames; collect retirements. */
const feed = (moot, snap, secs) => {
  const out = [];
  for (let t = 0; t < secs; t += 0.1) {
    const r = moot.note(snap, 0.1);
    if (r) out.push(r.id);
  }
  return out;
};
/** Dismiss the card if one is up, and hand back the rite. Most claims below are
 *  about beats, and a card in front of every phase would otherwise be four
 *  lines of ceremony in each of them. */
const begun = (m) => { if (m.card) m.open(); return m; };
/** Walk a rite to the head of a phase by id, learning everything on the way. */
const reach = (m, id) => {
  for (let guard = 0; guard < 40 && !m.done; guard++) {
    if (m.phase?.id === id) return m;
    if (m.card) { m.open(); continue; }
    const b = m.beat;
    if (!b) break;
    const snap = { look: at(0, 0), move: walk(0, 0), sprint: at(0, 0, "sprinting"),
      strike: at(0, 0, "attacking"), aim: at(0, 0, "attacking"), heavy: at(0, 0, "attacking", { swingHeavy: true }),
      guard: at(0, 0, "blocking"), dodge: at(0, 0, "rolling"), shove: at(0, 0, "shoving"),
      power: at(0, 0, "ability", { abilityActive: true }) }[b.id];
    if (b.id === "look") { for (let i = 0; i < 20; i++) m.note(at(0, 0, "idle", { rotation: i * 0.2 }), 0.1); }
    if (b.id === "move") { for (let i = 1; i <= 12; i++) m.note(walk(i * 0.5, 0), 0.1); }
    if (b.id === "aim") {
      for (const d of ["left", "right"]) feed(m, at(0, 0, "attacking", { attackDir: d }), 0.4);
    }
    feed(m, snap, BEAT_DWELL + 0.4);
  }
  return m;
};

console.log("[moot] the rite, headless\n");

// ---- the shape of the rite ----
check("four phases, in the teaching order",
  MOOT_PHASES.map((p) => p.id).join(",") === "field,blade,shield,deed",
  MOOT_PHASES.map((p) => p.id).join(" -> "));
check("ten beats, and every control the glass has is one of them",
  MOOT_BEATS.map((b) => b.id).join(",") === "look,move,sprint,strike,aim,heavy,guard,dodge,shove,power",
  MOOT_BEATS.map((b) => b.id).join(" -> "));
check("every beat speaks to both platforms",
  MOOT_BEATS.every((b) => typeof b.touch === "string" && b.touch.length > 10
    && typeof b.desk === "string" && b.desk.length > 10));
check("every phase carries a card with something on it",
  MOOT_PHASES.every((p) => p.title.length > 2 && p.card.length >= 2
    && p.card.every((l) => typeof l === "string" && l.length > 20)));
check("no beat id is used twice",
  new Set(MOOT_BEATS.map((b) => b.id)).size === MOOT_BEATS.length);

// ---- THE PAUSE POINT ----
{
  const m = createFirstMoot({ load: () => null, save: () => {} });
  check("a fresh rite opens on a CARD and not on a task",
    m.card?.id === "field" && m.beat === null, `card: ${m.card?.title}`);
  // Fed the very act the phase's FIRST beat is waiting for, because a pause
  // claim fed something the beat would refuse anyway proves nothing — it goes
  // green whether the hold exists or not.
  const nothing = [];
  for (let i = 0; i < 40; i++) {
    const r = m.note(at(0, 0, "walking", { rotation: i * 0.3 }), 0.1);
    if (r) nothing.push(r.id);
  }
  check("nothing is asked or retired while the card is up",
    nothing.length === 0 && m.card?.id === "field" && m.at === 0,
    "four seconds of the exact act LOOK is waiting for, spent against a pause point");
  m.open();
  check("dismissing the card begins the phase", m.beat?.id === "look" && m.card === null);
}

// ---- the ledgers: what a single snapshot cannot know ----
{
  const m = begun(createFirstMoot({ load: () => null, save: () => {} }));
  feed(m, still(), 5);
  check("standing still teaches nothing", m.beat?.id === "look", "5 s idle, still on LOOK");
  // A view swung through north hands back a rotation that jumped 2π, and an
  // unwrapped difference would spend the whole arc on one frame of arithmetic.
  // Ten crossings: 0.83 rad wrapped, 62 rad if the wrap is dropped.
  const wrap = begun(createFirstMoot({ load: () => null, save: () => {} }));
  for (let i = 0; i < 10; i++) {
    wrap.note(at(0, 0, "idle", { rotation: 3.10 }), 0.1);
    wrap.note(at(0, 0, "idle", { rotation: -3.10 }), 0.1);
  }
  check("a view crossing north ten times is not a look around",
    wrap.beat?.id === "look",
    `ten crossings are 0.83 rad wrapped and 62 rad unwrapped; the bar is ${LOOK_ARC}`);
  for (let i = 0; i < 20; i++) m.note(at(0, 0, "idle", { rotation: i * 0.2 }), 0.1);
  feed(m, still(), BEAT_DWELL + 0.3);
  check("a real look around retires LOOK", m.beat?.id === "move", `${LOOK_ARC} rad swung`);

  for (let i = 1; i <= 8; i++) m.note(at(i * 0.5, 0), 0.1);
  check("ground covered without a moving state is not travel", m.beat?.id === "move");
  for (let i = 1; i <= 8; i++) m.note(walk(i * 0.5, 0), 0.1);
  feed(m, walk(4, 0), BEAT_DWELL + 0.3);
  check("three metres of real ground retires MOVE", m.beat?.id === "sprint", `travelled 4 m`);
  feed(m, at(4, 0, "sprinting"), BEAT_DWELL + 0.3);
  check("a sprint the sim honoured retires SPRINT and ends the phase",
    m.card?.id === "blade" && m.beat === null, "the next card is up, which is the pause");
}

// ---- naming the cut ----
{
  const m = begun(reach(createFirstMoot({ load: () => null, save: () => {} }), "blade"));
  feed(m, at(0, 0, "attacking", { attackDir: "left" }), BEAT_DWELL + 0.3);
  check("a strike the sim honoured retires STRIKE", m.beat?.id === "aim");
  feed(m, at(0, 0, "attacking", { attackDir: "left" }), 4);
  check("one direction, however often, is not naming the cut",
    m.beat?.id === "aim", "four seconds of the same cut");
  feed(m, at(0, 0, "attacking", { attackDir: "overhead" }), BEAT_DWELL + 0.3);
  check("a second direction retires AIM", m.beat?.id === "heavy", "left then overhead");
  feed(m, at(0, 0, "attacking"), 3);
  check("a light blow is not a heavy one", m.beat?.id === "heavy");
  feed(m, at(0, 0, "attacking", { swingHeavy: true }), BEAT_DWELL + 0.3);
  check("the wire's own heavy flag retires HEAVY", m.card?.id === "shield");
}

// ---- NOBODY SWINGS AT HIM UNTIL HE HAS A GUARD ----
{
  const m = createFirstMoot({ load: () => null, save: () => {} });
  check("a rite that has just begun is not armed", !m.armed, "THE FIELD: nothing raises a hand");
  reach(m, "blade");
  check("the blade is learned on a pell, not on a fighter", !m.armed, "THE BLADE: still not armed");
  reach(m, "shield");
  check("the foe is armed exactly when the guard is the lesson", m.armed, "THE SHIELD");
  const done = createFirstMoot({ load: () => "done", save: () => {} });
  check("a graduate is owed a real fight", done.armed && done.done);
}

// ---- demonstration, not time; dwell, not strobe ----
{
  const idle = begun(createFirstMoot({ load: () => "1.0", save: () => {} }));
  check("a device mid-rite resumes where it stood", idle.beat?.id === "strike",
    `phase ${idle.phase?.id}, beat ${idle.beat?.id}`);
  feed(idle, still(), 10);
  check("ten idle seconds do not retire STRIKE", idle.beat?.id === "strike");
  // A line ALREADY READ retires the moment the act lands — the dwell is an
  // anti-strobe for a freshly risen line, not a delay bolted onto learning.
  const r0 = idle.note(at(0, 0, "attacking"), 0.1);
  check("on a long-displayed line the act retires it at once",
    r0?.id === "strike" && idle.beat?.id === "aim");

  const m = begun(createFirstMoot({ load: () => "1.0", save: () => {} }));
  const r1 = m.note(at(0, 0, "attacking"), 0.1);
  check("a freshly risen line holds through the dwell even against an instant act",
    r1 === null && m.beat?.id === "strike", `dwell ${BEAT_DWELL}s`);
}

// ---- the power, the finish, the record ----
{
  const saves = [];
  const m = begun(createFirstMoot({ load: () => "3.0", save: (v) => saves.push(v) }));
  check("the last beat is the POWER", m.beat?.id === "power" && m.phase?.id === "deed");
  feed(m, at(0, 0, "ability", { abilityActive: true }), BEAT_DWELL + 0.3);
  check("spending the power finishes the rite", m.done && m.beat === null && m.card === null);
  check("the finish is written once, as done", saves.filter((v) => v === "done").length === 1,
    `saves: ${saves.join(",")}`);
  const again = feed(m, at(9, 9, "attacking"), 2);
  check("a finished rite notes nothing", again.length === 0 && m.done);
}

// ---- the record, and what an old device carries ----
{
  const saves = [];
  const m = begun(createFirstMoot({ load: () => null, save: (v) => saves.push(v) }));
  for (let i = 0; i < 20; i++) m.note(at(0, 0, "idle", { rotation: i * 0.2 }), 0.1);
  feed(m, still(), BEAT_DWELL + 0.3);
  check("progress is saved as phase and beat", saves.includes("0.1"), `saves: ${saves.join(",")}`);
  // A SAVE FROM BEFORE THERE WERE PHASES is a flat index into a five-beat list
  // that no longer exists. It is placed by the beat it named, so nobody is sent
  // backwards and nobody is skipped past a phase he never saw.
  const old = createFirstMoot({ load: () => "2", save: () => {} });
  check("a save from before there were phases lands on the beat it named",
    old.card?.id === "shield" || old.beat?.id === "guard",
    "old index 2 was GUARD, which is now the head of THE SHIELD");
  const old0 = createFirstMoot({ load: () => "0", save: () => {} });
  check("an old save at the very start is not pushed forward",
    old0.card?.id === "field", "old index 0 was MOVE, which is in THE FIELD");
}

// ---- the graduate's door ----
{
  const saves = [];
  const m = createFirstMoot({ load: () => null, save: (v) => saves.push(v) });
  m.skip();
  check("skip finishes and persists in one act",
    m.done && saves.includes("done") && m.card === null,
    "and it takes the card down with it — a door behind a card is not a door");
  const m2 = createFirstMoot({ load: () => "done", save: () => {} });
  check("a done device never sees a line again", m2.done && m2.beat === null && m2.card === null);
}

// ---- hostile stores and absent players ----
{
  const m = createFirstMoot({ load: () => "banana", save: () => {} });
  check("a garbled store opens at the beginning rather than throwing", m.card?.id === "field");
  const m2 = begun(createFirstMoot({ load: () => "99.99", save: () => {} }));
  check("an out-of-range phase clamps to the last beat", m2.beat?.id === "power");
  const m3 = createFirstMoot();
  check("no store at all is a working, inert default",
    m3.note(null, 0.1) === null && m3.card?.id === "field");
  const m4 = begun(createFirstMoot({ load: () => "0.0", save: () => {} }));
  check("a snapshot with no rotation does not poison the view ledger",
    m4.note({ position: { x: 0, y: 0, z: 0 }, state: "idle", abilityActive: false, rotation: 0 }, 0.1) === null
      && m4.beat?.id === "look");
}

check("the storage key is the module's own", FIRST_MOOT_KEY === "bretwalda.firstmoot");

console.log(`\n[moot] ${passed}/${passed + failed} claims proven`);
process.exit(failed ? 1 : 0);
