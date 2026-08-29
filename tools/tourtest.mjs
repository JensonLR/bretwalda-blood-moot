#!/usr/bin/env node
// TOURTEST — the graduate's walk round the hall, driven headless.
//
//   node tools/tourtest.mjs
//
// Sibling of moottest: same posture, same reason. `src/game/tour.mjs` owns
// which doors there are, who is owed the walk and what happens when a door is
// not on the glass; this proves it without a browser.
import { createTour, tourIsDue, TOUR_STOPS, TOUR_KEY } from "../src/game/tour.mjs";
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

console.log("[tour] the walk round the hall, headless\n");

// ---- the shape ----
check("five doors, in the order the owner named them",
  TOUR_STOPS.map((s) => s.id).join(",") === "armoury,saga,training,fight,create",
  TOUR_STOPS.map((s) => s.title).join(" -> "));
check("every door says what it is for",
  TOUR_STOPS.every((s) => s.title.length > 3 && s.line.length > 30 && s.target.length > 0));
check("no door is listed twice",
  new Set(TOUR_STOPS.map((s) => s.target)).size === TOUR_STOPS.length);

// ---- who is owed a walk ----
{
  const cold = createTour({ load: () => null });
  check("a device with no record is not toured",
    !cold.running && cold.stop === null,
    "a tour that ambushes a veteran is a tutorial");
  const junk = createTour({ load: () => "banana" });
  check("a garbled record is not a tour either", !junk.running && junk.stop === null);
  const grad = createTour({ load: () => "due" });
  check("a device the rite marked DUE gets the walk",
    grad.running && grad.stop?.id === "armoury");
  const over = createTour({ load: () => "done" });
  check("a device that has walked it never walks it again",
    over.done && !over.running && over.stop === null);
  const saves = [];
  tourIsDue((v) => saves.push(v));
  check("the rite marks a device due in one call", saves.length === 1 && saves[0] === "due");
}

// ---- walking it ----
{
  const saves = [];
  const t = createTour({ load: () => "due", save: (v) => saves.push(v) });
  const seen = [t.stop?.id];
  for (let i = 0; i < 4; i++) seen.push(t.next()?.id);
  check("the walk visits every door once, in order",
    seen.join(",") === "armoury,saga,training,fight,create", seen.join(" -> "));
  check("progress is written as it goes", saves.includes("1") && saves.includes("4"),
    `saves: ${saves.join(",")}`);
  check("one more step ends it", t.next() === null && t.done && t.stop === null);
  check("the finish is written once", saves.filter((v) => v === "done").length === 1,
    `saves: ${saves.join(",")}`);
  check("a finished walk cannot be restarted by stepping", t.next() === null && t.done);
}

// ---- resuming ----
{
  const t = createTour({ load: () => "2" });
  check("a device mid-walk resumes where it stood", t.stop?.id === "training", `at ${t.at}`);
  const wild = createTour({ load: () => "99" });
  check("an out-of-range index clamps to the last door", wild.stop?.id === "create");
}

// ---- A DOOR THAT IS NOT ON THE GLASS ----
// The only reason `has` is injected. A highlight drawn around an element that
// is not there is a ring around the origin, which is worse than no ring.
{
  const t = createTour({ load: () => "due", has: (id) => id !== "armoury" });
  check("a missing door is stepped over rather than pointed at",
    t.stop?.id === "saga", "the armoury is not on this glass");
  const none = createTour({ load: () => "due", has: () => false });
  check("a hall with no doors at all finishes rather than pointing at nothing",
    none.done && none.stop === null);
  const late = createTour({ load: () => "due", has: (id) => id === "armoury" });
  check("the walk ends when the doors run out mid-way",
    late.stop?.id === "armoury" && late.next() === null && late.done);
}

// ---- THE WIRING. A stop names a `data-tour` value; the page must carry it. ----
// Same posture as marktest's server claims: the maths above is proven, this is
// the half that says the source actually calls it. A tour whose targets match
// nothing in the tree is five stops that all silently skip.
{
  const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  const missing = TOUR_STOPS.filter((s) => !page.includes(`data-tour="${s.target}"`));
  check("every door in the list is a control on the landing screen",
    missing.length === 0,
    missing.length ? `no data-tour for: ${missing.map((s) => s.target).join(", ")}` : "all five carry data-tour");
  check("the landing screen actually runs the tour",
    /createTour\(/.test(page) && /TOUR_KEY/.test(page));
  check("the rite marks the device due", /tourIsDue\(/.test(page));
}

check("the storage key is the module's own", TOUR_KEY === "bretwalda.tour");

console.log(`\n[tour] ${passed}/${passed + failed} claims proven`);
process.exit(failed ? 1 : 0);
