#!/usr/bin/env node
// MOOTTEST — the First Moot's spine, driven headless.
//
//   node tools/moottest.mjs
//
// Every claim feeds `createFirstMoot` synthetic snapshots of the local player
// — the same shape the wire delivers — and asserts the rite advances on
// DEMONSTRATION and on nothing else. No browser, no server, sub-second: the
// E3 rule (cheapest instrument that can see the defect), same as weightprobe.
import { createFirstMoot, MOOT_BEATS, BEAT_DWELL, FIRST_MOOT_KEY } from "../src/game/firstmoot.mjs";

let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

const still = (x = 0, z = 0) => ({ position: { x, y: 0, z }, state: "idle", abilityActive: false });
const at = (x, z, state = "idle", abilityActive = false) => ({ position: { x, y: 0, z }, state, abilityActive });
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

console.log("[moot] the rite, headless\n");

// ---- the shape of the rite ----
check("five beats, in the teaching order",
  MOOT_BEATS.map((b) => b.id).join(",") === "move,strike,guard,dodge,power",
  MOOT_BEATS.map((b) => b.id).join(" -> "));
check("every beat speaks to both platforms",
  MOOT_BEATS.every((b) => typeof b.touch === "string" && b.touch.length > 10
    && typeof b.desk === "string" && b.desk.length > 10));

// ---- a stranger arrives ----
{
  const saves = [];
  const m = createFirstMoot({ load: () => null, save: (v) => saves.push(v) });
  check("a fresh rite opens on MOVE", m.beat?.id === "move", `at ${m.at} of ${m.total}`);
  feed(m, still(), 5);
  check("standing still teaches nothing", m.beat?.id === "move" && !m.done, "5 s idle, still on MOVE");

  // Walk: successive snapshots 0.5 m apart. 3 m of travel is the bar.
  // A teleport is not a step: the same ground covered in "idle" counts nothing.
  for (let i = 1; i <= 8; i++) m.note(at(i * 0.5, 0), 0.1);
  check("ground covered without a moving state is not travel", m.beat?.id === "move");
  for (let i = 1; i <= 8; i++) m.note(walk(i * 0.5, 0), 0.1);
  feed(m, walk(4, 0), BEAT_DWELL + 0.3);
  check("three metres of real ground retires MOVE", m.beat?.id === "strike", `travelled 4 m, now ${m.beat?.id}`);
  check("progress is saved as the beat index", saves.includes("1"), `saves: ${saves.join(",")}`);
}

// ---- demonstration, not time; dwell, not strobe ----
{
  const idle = createFirstMoot({ load: () => "1", save: () => {} });
  check("a device mid-rite resumes where it stood", idle.beat?.id === "strike");
  feed(idle, still(), 10);
  check("ten idle seconds do not retire STRIKE", idle.beat?.id === "strike");
  // A line ALREADY READ retires the moment the act lands — the dwell is an
  // anti-strobe for a freshly risen line, not a delay bolted onto learning.
  const r0 = idle.note(at(0, 0, "attacking"), 0.1);
  check("on a long-displayed line the act retires it at once", r0?.id === "strike" && idle.beat?.id === "guard");

  const m = createFirstMoot({ load: () => "1", save: () => {} });
  const r1 = m.note(at(0, 0, "attacking"), 0.1);
  check("a freshly risen line holds through the dwell even against an instant act",
    r1 === null && m.beat?.id === "strike", `dwell ${BEAT_DWELL}s`);
  const retired = feed(m, at(0, 0, "attacking"), BEAT_DWELL + 0.3);
  check("a strike the sim honoured retires STRIKE after the dwell", retired.includes("strike"),
    `retired: ${retired.join(",")}`);
  check("GUARD is next", m.beat?.id === "guard");
  feed(m, at(0, 0, "blocking"), BEAT_DWELL + 0.3);
  check("a raised shield retires GUARD", m.beat?.id === "dodge");
  feed(m, at(0, 0, "rolling"), BEAT_DWELL + 0.3);
  check("a roll counts as the dodge it is", m.beat?.id === "power");
}

// ---- the power, the finish, the record ----
{
  const saves = [];
  const m = createFirstMoot({ load: () => "4", save: (v) => saves.push(v) });
  check("the last beat is the POWER", m.beat?.id === "power");
  feed(m, at(0, 0, "ability", true), BEAT_DWELL + 0.3);
  check("spending the power finishes the rite", m.done && m.beat === null);
  check("the finish is written once, as done", saves.filter((v) => v === "done").length === 1,
    `saves: ${saves.join(",")}`);
  const again = feed(m, at(9, 9, "attacking"), 2);
  check("a finished rite notes nothing", again.length === 0 && m.done);
}

// ---- the graduate's door ----
{
  const saves = [];
  const m = createFirstMoot({ load: () => null, save: (v) => saves.push(v) });
  m.skip();
  check("skip finishes and persists in one act", m.done && saves.includes("done"));
  const m2 = createFirstMoot({ load: () => "done", save: () => {} });
  check("a done device never sees a line again", m2.done && m2.beat === null);
}

// ---- hostile stores and absent players ----
{
  const m = createFirstMoot({ load: () => "banana", save: () => {} });
  check("a garbled store opens on MOVE rather than throwing", m.beat?.id === "move");
  const m2 = createFirstMoot({ load: () => "99", save: () => {} });
  check("an out-of-range index clamps to the last beat", m2.beat?.id === "power");
  const m3 = createFirstMoot();
  check("no store at all is a working, inert default", m3.note(null, 0.1) === null && m3.beat?.id === "move");
}

check("the storage key is the module's own", FIRST_MOOT_KEY === "bretwalda.firstmoot");

console.log(`\n[moot] ${passed}/${passed + failed} claims proven`);
process.exit(failed ? 1 : 0);
