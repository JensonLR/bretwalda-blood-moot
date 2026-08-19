#!/usr/bin/env node
// ============================================================
// SPECTATETEST — what the dead man's lens is pointed at, and how high it stands.
//
//   node tools/spectatetest.mjs                 both phases
//   node tools/spectatetest.mjs --phases=rig    headless, real createCameraRig, ~20 s
//   node tools/spectatetest.mjs --phases=moot   a real engine-driven moot, no browser, ~90 s
//   node tools/spectatetest.mjs --phases=match  a real browser client driven to a death, ~5 min
//   node tools/spectatetest.mjs --blind         the readback as it was, kept as the failure
//
// WHY THIS FILE EXISTS, and it is a failure of measurement rather than of code.
//
// A change landed that pointed the dead man's orbit at the fight instead of at
// the world origin. The camera behaviour was right. The EVIDENCE for it was a
// getter added to `camera.ts` for the purpose —
//
//     get focusAt() { return { x: focusX, z: focusZ }; }
//
// — and it could not work. `focusX`/`focusZ` were assigned in exactly one place,
// at the end of `follow()`, and `follow()` never runs in spectate mode. So the
// getter reported the last point the FOLLOW rig framed, which on a client that
// has been dead since before it ever followed anybody is (0, 0). The reported
// "the focus lands 0.61 m from the nearest living man" was a distance from the
// world origin. Driving the real rig here with the fight at (9, -6), the old
// getter reads (0.00, 0.00) on all 600 frames while the lens is correctly 10.98 m
// from the fight. `--blind` reproduces that arithmetic and is kept permanently
// as the proof of failure: under it all three of §1's claims ABOUT THE READBACK
// go red — 0.53 m off the view ray in follow, 10.82 m off it in spectate, and the
// reported aim 10.82 m from the fight. §1's two claims that are NOT about the
// readback (the module compiles; the dead lens stands no higher than the living
// one) still pass under `--blind`, as they should: a lever that turned every
// line red would say nothing about which claim rests on what.
//
// That is failure mode 1 in `docs/PROCESS.md` — the ruler measures the wrong
// quantity — with an aggravation the ten recorded instances did not have: NOTHING
// RAN IT. `grep -rn focusAt src tools` finds the getter and no reader. A number
// that no harness prints is a number nobody checks, so it was wrong from the
// hour it was written and stayed wrong.
//
// AND THE FIX IS NOT "ASSIGN IT IN ORBIT TOO". That would be an echo: the
// harness would read back the value the caller handed in and agree with itself
// by construction, which is how `faceseam` v1 reported 22-29% of every head
// inside-out and passed. The readback has to be checked against something the
// camera itself decides. So §1 verifies the reported aim against the direction
// the PerspectiveCamera is actually looking — `getWorldDirection`, off the
// camera's own world matrix, which no readback writes — and asks whether the
// reported point lies on that ray. A rig that reported the focus while pointing
// somewhere else, which is precisely what the shipped orbit used to do, fails.
//
// WHAT IS REAL HERE AND WHAT IS NOT:
//
//   REAL — `createCameraRig`. §1 compiles `src/game/client/render/camera.ts`
//          with tsc and imports it, so the rig under test is the rig the
//          renderer builds. Nothing in `src/` knows this file exists.
//   REAL — the match. §2 boots the built app against the real server, drives a
//          real fight until the local warrior dies, and reads the rig off
//          `window.__bretwaldaCamera` beside the SERVER's own player table.
//   MODELLED — §1's focus track. A dead man's focus is chosen in
//          `GameCanvas.tsx` from the live players; §1 hands the rig a focus
//          directly, because what §1 is about is whether the RIG aims where it
//          is told and reports where it aimed. §2 is where the choosing is
//          measured.
//
// WHAT EACH PHASE CAN AND CANNOT REACH, on this line rather than in a footnote:
//
//   §1 and §2 are exact and run anywhere. §2 is the one that measures the lens
//   over REAL fight geometry, and it is where the number the last report got
//   wrong is taken again.
//
//   §3 IS THE ONLY PHASE THAT EXERCISES `GameCanvas.tsx`'s OWN CHOOSING RULE,
//   and on a box with no GPU it may not reach the case at all. `GameCanvas.tsx:701`
//   clamps the frame delta to 0.05 s, so `DEATH_HOLD.total` costs 67 animation
//   frames whatever they cost in wall clock, and `spectate` is only set after
//   that hold releases. Rasterising a six-man moot through SwiftShader here, the
//   client's own animation frame runs at about two a second — 67 of them is over
//   half a minute, which outlasts the round the man died in, so the lens is still
//   on his own death camera when the round ends. That is correct behaviour and an
//   unreachable case, and §3 prints the measured frame rate and the arithmetic
//   beside its failure rather than being carved out of the run.
//
// Exits non-zero if any claim fails.
// ============================================================
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { spawn, spawnSync } from "child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const argOf = (n, d) => { const hit = argv.find((a) => a.startsWith(`--${n}=`)); return hit ? hit.slice(n.length + 3) : d; };
const PHASES = argOf("phases", "rig,moot,match").split(",").map((s) => s.trim());
const has = (p) => PHASES.includes(p);
const BLIND = argv.includes("--blind");

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const rule = (s) => console.log(`\n${"=".repeat(78)}\n${s}\n${"=".repeat(78)}\n`);
const f2 = (x) => (x === null || x === undefined || Number.isNaN(x) ? "  -  " : x.toFixed(2));

/** Deferrals collected here and printed on the verdict line, never below it (R4). */
const DEFERRALS = [];

// ---------------------------------------------------------------- §1 the rig
//
// The same compile-and-import seam `tools/freezetest.mjs` uses for `anim.ts`.
// tsc emits TypeScript's extensionless relative specifiers and node's ESM
// loader will not resolve them, so the emitted tree is rewritten once inside
// `.spectate`.
async function loadCamera() {
  const BUILD = resolve(ROOT, ".spectate");
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });
  const tsc = spawnSync("npx", ["tsc", "src/game/client/render/camera.ts", "--outDir", ".spectate",
    "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
    { cwd: ROOT, encoding: "utf8" });
  const emitted = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const f = resolve(d, e.name);
    if (e.isDirectory()) walk(f); else if (e.name.endsWith(".js")) emitted.push(f);
  } };
  if (existsSync(BUILD)) walk(BUILD);
  for (const f of emitted) {
    const src = readFileSync(f, "utf8");
    const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c));
    if (fixed !== src) writeFileSync(f, fixed);
  }
  const file = emitted.find((f) => f.endsWith("render/camera.js"));
  if (!file) { console.log(`  tsc emitted no camera.js:\n${tsc.stdout || ""}${tsc.stderr || ""}`); return null; }
  return import(pathToFileURL(file).href);
}

/** Enough of a browser for `camera.ts`'s module scope and `input.ts`'s store. */
function shimBrowser() {
  const store = new Map();
  const noop = () => {};
  const el = () => ({ style: { setProperty: noop, removeProperty: noop }, classList: { add: noop, remove: noop, contains: () => false },
    appendChild: noop, removeChild: noop, remove: noop, setAttribute: noop, getContext: () => null });
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.document = { documentElement: el(), createElement: el, body: el(),
    addEventListener: noop, removeEventListener: noop, getElementById: () => null, querySelector: () => null };
  globalThis.addEventListener = noop;
  globalThis.removeEventListener = noop;
  globalThis.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop });
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  for (const [k, v] of [["navigator", { userAgent: "node", maxTouchPoints: 0 }], ["performance", { now: () => Date.now() }]]) {
    if (!globalThis[k]) Object.defineProperty(globalThis, k, { value: v, configurable: true });
  }
}

const DT = 1 / 60;
/** A frame context with only the fields the rig reads. */
const frameCtx = (focus, time, localState) => ({
  focus: { x: focus.x, y: 0, z: focus.z }, time, dt: DT, localState,
  quality: { tier: "high" },
});

/**
 * Drive the rig for `n` frames and record, per frame, where the lens IS, where
 * it says it is aimed, and where it is ACTUALLY looking.
 *
 * The third of those is the one that makes this a measurement. `getWorldDirection`
 * reads the camera's own world matrix — the matrix `lookAt` wrote — and no
 * readback in `camera.ts` touches it. The reported aim is then scored by how far
 * it sits off that ray, which is a question the rig cannot answer by agreeing
 * with its own input.
 */
function drive(THREE, rig, hook, focusOf, n, localState, blindFollowOnly) {
  const dir = new THREE.Vector3();
  const rows = [];
  let blindX = 0, blindZ = 0;
  for (let i = 0; i < n; i++) {
    const focus = focusOf(i);
    rig.update(DT, frameCtx(focus, i * DT, localState));
    if (blindFollowOnly && localState !== "dead") { blindX = focus.x; blindZ = focus.z; }
    rig.camera.updateMatrixWorld(true);
    rig.camera.getWorldDirection(dir);
    const p = hook.position;
    const aim = BLIND ? { x: blindX, y: null, z: blindZ } : (hook.aim ?? { x: null, y: null, z: null });
    // Distance from the reported aim point to the ray the camera looks down.
    let off = null;
    if (aim.x !== null && aim.x !== undefined) {
      const vx = aim.x - p.x, vy = (aim.y ?? 1.35) - p.y, vz = aim.z - p.z;
      const along = vx * dir.x + vy * dir.y + vz * dir.z;
      const cx = vx - dir.x * along, cy = vy - dir.y * along, cz = vz - dir.z * along;
      off = along <= 0 ? Infinity : Math.hypot(cx, cy, cz);
    }
    rows.push({ i, focus, pos: { ...p }, aim, off,
      dist: Math.hypot(p.x - focus.x, p.z - focus.z) });
  }
  return rows;
}

async function phaseRig() {
  rule("§1  THE INSTRUMENT   (real createCameraRig, no browser)");
  shimBrowser();
  const THREE = await import("three");
  const mod = await loadCamera();
  if (!mod) { check("camera.ts compiles and can be driven headless", false, "tsc emitted nothing"); return; }
  const rig = mod.createCameraRig({ tier: "high" }, { aspect: 16 / 9 });
  const hook = globalThis.__bretwaldaCamera;
  check("camera.ts compiles, `createCameraRig` runs and hangs its readback on the window",
    !!rig && !!hook, `readback keys: ${hook ? Object.keys(hook).join(", ") : "none"}`);
  if (!rig || !hook) return;

  const FIGHT = { x: 9, z: -6 };
  const ALIVE = { x: -3, z: 4 };

  // A LIVING man first, so the follow rig has framed somebody. This is what
  // makes `--blind` a fair reproduction rather than a straw man: the old getter
  // is at its BEST here, with a real follow focus behind it, and it still cannot
  // see the spectate aim.
  rig.setMode("follow");
  const live = drive(THREE, rig, hook, () => ALIVE, 240, "idle", true);
  const liveYs = live.slice(60).map((r) => r.pos.y);
  const liveYHi = Math.max(...liveYs);
  const liveYLo = Math.min(...liveYs);
  const liveYMean = liveYs.reduce((a, b) => a + b, 0) / liveYs.length;
  const liveOff = live.slice(60).reduce((m, r) => Math.max(m, r.off ?? Infinity), 0);

  // Then he dies, and the lens goes to the fight at the far side of the ring.
  rig.setMode("spectate");
  const dead = drive(THREE, rig, hook, () => FIGHT, 600, "dead", true);
  const settled = dead.slice(420);
  const deadOff = settled.reduce((m, r) => Math.max(m, r.off ?? Infinity), 0);
  const deadPos = settled[settled.length - 1].pos;
  const deadDist = settled.reduce((s, r) => s + r.dist, 0) / settled.length;
  const aimMiss = settled.reduce((m, r) => Math.max(m,
    r.aim.x === null || r.aim.x === undefined ? Infinity : Math.hypot(r.aim.x - FIGHT.x, r.aim.z - FIGHT.z)), 0);

  console.log(`\n  WHERE THE LENS WENT, and what the readback said about it.`);
  console.log(`    mode        lens (x, y, z)              says it aims at      off the ray it looks down`);
  for (const [label, r] of [["follow", live[live.length - 1]], ["spectate", settled[settled.length - 1]]]) {
    const a = r.aim;
    console.log(`    ${label.padEnd(11)} (${f2(r.pos.x)}, ${f2(r.pos.y)}, ${f2(r.pos.z)})`
      + `${"".padEnd(9)}(${a.x === null || a.x === undefined ? " none" : f2(a.x)}, ${a.z === null || a.z === undefined ? " none" : f2(a.z)})`
      + `${"".padEnd(8)}${r.off === null ? "  -  " : r.off === Infinity ? " BEHIND THE LENS" : `${r.off.toFixed(3)} m`}`);
  }
  console.log();

  check("THE READBACK MEASURES THE LENS AND NOT ITS INPUT: the point it reports lies on the ray the camera is actually looking down, in FOLLOW",
    liveOff < 0.01, `worst ${liveOff === Infinity ? "the reported point is BEHIND the lens" : `${liveOff.toFixed(4)} m off the view ray`} over 180 settled frames`);
  check("AND IN SPECTATE, which is the mode a dead man is in and the mode the old readback could not see at all",
    deadOff < 0.01, `worst ${deadOff === Infinity ? "the reported point is BEHIND the lens" : `${deadOff.toFixed(4)} m off the view ray`} over 180 settled frames`
      + (BLIND ? " — this is `--blind`, the readback as it shipped" : ""));
  check("and it reports the FIGHT, not the middle of the arena: a dead man at the far side of the ring is looking at the men who are still up",
    aimMiss < 0.05, `the reported aim sits ${aimMiss === Infinity ? "nowhere" : `${aimMiss.toFixed(3)} m`} from the fight at `
      + `(${FIGHT.x}, ${FIGHT.z}), with the lens ${deadDist.toFixed(2)} m out from it`);

  // ---- §1b THE SAFETY CLAIM, and it is one number ------------------------
  //
  // "A dead man may be shown what a living man could already see" is a claim
  // about ELEVATION and about nothing else. Bearing is not a leak: a living man
  // can walk to any bearing. Distance is not a leak either, and in the direction
  // that matters it is the opposite of one — at a fixed height, a lens FURTHER
  // from a man behind cover has a SHALLOWER sightline over that cover, not a
  // steeper one. Height is the one axis a spectator camera can cheat on, and it
  // is the axis a camera that "flies over the roofs" cheats on.
  //
  // So the claim reduces to: the dead man's lens must stand no higher than a
  // living player's own lens. That is not argued here, it is read back off the
  // same running rig in both modes — which is why this claim survives somebody
  // editing either constant.
  //
  // The bar is the living lens at its HIGHEST, not its mean: the follow rig bobs
  // (+/-0.016 m at idle, +/-0.032 m moving) and the claim is about instants, not
  // averages — "at no moment does the dead man's lens stand above where a living
  // player's own lens stands". Both numbers are read off the same running rig in
  // the two modes, so the claim survives an edit to either constant.
  const deadYs = settled.map((r) => r.pos.y);
  const deadYHi = Math.max(...deadYs);
  // THE FRAME SEQUENCE, printed rather than summarised. R5 asks for the render
  // watched moving; for a lens the equivalent is where it stood and what it was
  // pointed at, frame after frame, with the off-ray column beside it so a reader
  // can see the readback being CHECKED rather than quoted.
  console.log(`  A SPECTATING DEAD MAN, one row per half second of his first ten seconds:\n`);
  console.log(`      t       lens (x, y, z)                aims at (x, z)     off the view ray   lens to fight`);
  for (let i = 0; i < dead.length && i < 600; i += 30) {
    const r = dead[i];
    console.log(`    ${(i / 60).toFixed(2)}s   (${f2(r.pos.x)}, ${f2(r.pos.y)}, ${f2(r.pos.z)})`.padEnd(38)
      + `(${f2(r.aim.x)}, ${f2(r.aim.z)})`.padEnd(19)
      + `${r.off === Infinity ? "BEHIND THE LENS" : `${r.off.toFixed(4)} m`}`.padEnd(19)
      + `${r.dist.toFixed(2)} m`);
  }
  console.log();

  check("A DEAD MAN'S LENS STANDS NO HIGHER THAN A LIVING MAN'S OWN: the one axis on which a spectator camera can see past cover",
    deadYHi <= liveYHi + 1e-9,
    `the living player's follow lens rides at ${liveYLo.toFixed(3)}-${liveYHi.toFixed(3)} m (mean ${liveYMean.toFixed(3)}, it bobs) `
    + `and the dead man's ringside lens at ${deadYHi.toFixed(3)} m — `
    + `${(deadYHi - liveYHi).toFixed(3)} m against the living lens at its highest`);

  // The radius sweep, printed because it is the thing this claim does NOT cover.
  // A WHOLE TURN, not ten seconds of one. The orbit spins at 0.16 rad/s, so a
  // full circuit is 39.3 s and a 600-frame sample covers 92 degrees of it — the
  // first cut of this sweep reported a maximum of 15.70 m at the disc edge
  // because it never went round the far side. 2600 frames is 43.3 s.
  const radii = [0, 5, 10, 14, 18];
  const sweep = [];
  for (const r0 of radii) {
    rig.setMode("spectate");
    const rows = drive(THREE, rig, hook, () => ({ x: r0, z: 0 }), 2600, "dead", false);
    const tail = rows.slice(240);
    let lo = Infinity, hi = -Infinity;
    for (const r of tail) { const d = Math.hypot(r.pos.x, r.pos.z); if (d < lo) lo = d; if (d > hi) hi = d; }
    sweep.push({ r0, lo, hi });
  }
  const PALISADE = 19.6;
  const outside = sweep.filter((s) => s.hi > PALISADE);
  console.log(`\n  HOW FAR OUT THE ORBIT GOES, against the palisade at ${PALISADE} m (world.ts:991).`);
  console.log(`    focus at r     dead lens sits between       a living man's own lens can reach`);
  for (const s of sweep) {
    console.log(`      ${String(s.r0).padStart(2)} m           ${s.lo.toFixed(2)} - ${s.hi.toFixed(2)} m`
      + `${"".padEnd(15)}${(s.r0 + 4.4).toFixed(2)} m   (4.4 m behind a man standing there)`);
  }
  DEFERRALS.push(
    `The ringside orbit is UNBOUNDED in radius. With the fight at the play disc's edge the lens`,
    `  reaches ${sweep[sweep.length - 1].hi.toFixed(2)} m from the middle, outside the palisade at ${PALISADE} m — ${outside.length} of ${sweep.length} swept focus`,
    `  radii do it. NOT ASSERTED EITHER WAY. It is not an elevation leak (the height claim above`,
    `  holds at every radius) and a living man's own lens leaves the palisade too at ${(18 + 4.4).toFixed(1)} m, but a`,
    `  lens on the wrong side of a wall is a shot looking through it. §2 measures whether real play`,
    `  reaches those radii; nothing here bounds what a human could do at the edge.`);
}

// -------------------------------------------------------------- §2 the moot
//
// A REAL FOUR-MAN BLOOD MOOT, driven headless through the engine singleton
// `custom-server.mjs` hands sockets to — the same seam `tools/deathcamtest.mjs`
// uses. The harness never sends input, so the bots kill it, which is the case
// under test: the LOCAL player is dead and the fight is still running.
//
// WHAT IS REAL AND WHAT IS NOT, because this phase is the one most able to
// flatter itself:
//
//   REAL — the fight. The men, their positions, who is down and when, are the
//          server's own and not a fixture.
//   REAL — the camera. The rig is the compiled `createCameraRig` from §1.
//   MIRRORED, AND IT IS A GAP — the choosing rule. `GameCanvas.tsx` picks the
//          focus (a living teammate, else the closest pair's midpoint, else the
//          lone survivor, else the middle) and that code is inside a React
//          component this cannot import. `focusByRule` below is a SECOND COPY
//          of it, which is failure mode 3 in `docs/PROCESS.md` by construction.
//          So this phase can prove the RIG aims where it is told and stands at a
//          man's height over real fight geometry; it CANNOT prove `GameCanvas`
//          hands it the right point. That is what §3 is for, and it is the
//          reason §3 exists at all rather than this being the whole file.
//
// The rule, copied here, with the same order of preference GameCanvas states.
function focusByRule(players, meId) {
  const me = players[meId];
  const live = [];
  let mate = null;
  for (const id in players) {
    const q = players[id];
    if (q.state === "dead" || id === meId) continue;
    const at = { x: q.position.x, z: q.position.z };
    if (!mate && me && me.team && me.team !== "none" && q.team === me.team) mate = at;
    live.push(at);
  }
  if (mate) return { x: mate.x, z: mate.z, how: "a living teammate", live: live.length };
  if (live.length > 1) {
    let bx = live[0].x, bz = live[0].z, best = Infinity;
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const d = (live[i].x - live[j].x) ** 2 + (live[i].z - live[j].z) ** 2;
        if (d < best) { best = d; bx = (live[i].x + live[j].x) / 2; bz = (live[i].z + live[j].z) / 2; }
      }
    }
    return { x: bx, z: bz, how: "the closest pair's midpoint", live: live.length };
  }
  if (live.length === 1) return { x: live[0].x, z: live[0].z, how: "the lone survivor", live: 1 };
  return { x: 0, z: 0, how: "nobody left standing", live: 0 };
}

async function phaseMoot() {
  rule("§2  A REAL MOOT       (real engine, real deaths, real createCameraRig)");
  shimBrowser();
  const THREE = await import("three");
  const mod = await loadCamera();
  const { getEngine } = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);
  if (!mod) { check("camera.ts compiles for the moot phase", false, "tsc emitted nothing"); return; }
  const engine = getEngine();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const t0 = Date.now();
  const log = [];
  let room = null;
  let done = null;
  const settled = new Promise((r) => { done = r; });
  const sid = engine.connect((str) => {
    const m = JSON.parse(str);
    const d = m.data || {};
    if (d.players) room = { ...d };
    else if (room) room = { ...room, ...d };
    if (m.type === "countdown") room = { ...(room || {}), state: "countdown", countdown: d.countdown };
    if (room && room.players) log.push({ t: Date.now() - t0, room });
    if (room && room.state === "fighting" && (room.roundIndex || 0) >= 2 && done) { done(); done = null; }
  });
  // FIVE RECRUITS, NOT THREE JARLS, and the reason is the window this phase
  // needs. The harness sends no input, so its man is defenceless and dies early —
  // which is what is wanted — but three jarls then finish each other within a
  // couple of seconds and the fight is over before the death hold has released
  // the lens. Measured on a browser run with three jarls: 48 samples of him down
  // with the fight still live, and the round ended inside them. Five recruits
  // take longer over it, so the spectate window is a fight rather than a
  // flicker. Nothing here depends on WHO wins.
  engine.message(sid, { type: "create", data: { name: "Moot", mode: "blood_moot", bestOf: 3 } });
  for (let i = 0; i < 5; i++) engine.message(sid, { type: "add_bot", data: { difficulty: "recruit" } });
  engine.message(sid, { type: "start", data: {} });
  await Promise.race([settled, sleep(95000)]);
  await sleep(900);

  const fullest = log.reduce((best, r) => (
    !best || Object.keys(r.room.players).length > Object.keys(best.room.players).length ? r : best), null);
  const ids = fullest ? Object.keys(fullest.room.players) : [];
  const meId = ids.find((id) => !fullest.room.players[id].isBot) ?? ids[0];

  // THE WINDOW UNDER TEST, and it is named rather than assumed: snapshots where
  // the harness's man is DOWN, the room is still FIGHTING, and somebody else is
  // still up. That is exactly when `GameCanvas` hands the rig `spectate`.
  const window_ = log.filter((r) => {
    const p = r.room.players;
    if (!p || !p[meId] || p[meId].state !== "dead") return false;
    if (r.room.state !== "fighting" && r.room.state !== "last_stand") return false;
    return Object.keys(p).some((id) => id !== meId && p[id].state !== "dead");
  });
  check("a real blood moot was driven, the local warrior was killed, and the fight ran on without him",
    !!meId && window_.length > 20,
    `${ids.length} men, ${log.length} snapshots, ${window_.length} of them with him down and the fight still live`);
  if (window_.length <= 20) return;

  // Drive the real rig over that window. `dt` is the snapshot spacing, so the
  // orbit advances at the rate the wire actually delivered.
  const rig = mod.createCameraRig({ tier: "high" }, { aspect: 16 / 9 });
  const hook = globalThis.__bretwaldaCamera;
  // A living stretch first, so the follow lens's own height is measured on the
  // same rig rather than read off a constant.
  rig.setMode("follow");
  const liveRows = drive(THREE, rig, hook, () => ({ x: 2, z: -3 }), 240, "idle", false);
  const liveYHi = Math.max(...liveRows.slice(60).map((r) => r.pos.y));

  rig.setMode("spectate");
  const dir = new THREE.Vector3();
  const rows = [];
  for (let i = 0; i < window_.length; i++) {
    const snap = window_[i];
    const want = focusByRule(snap.room.players, meId);
    const dt = i === 0 ? 1 / 20 : Math.min(0.2, Math.max(1 / 60, (snap.t - window_[i - 1].t) / 1000));
    rig.update(dt, { focus: { x: want.x, y: 0, z: want.z }, time: snap.t / 1000, dt,
      localState: "dead", quality: { tier: "high" } });
    rig.camera.updateMatrixWorld(true);
    rig.camera.getWorldDirection(dir);
    const p = hook.position;
    const aim = hook.aim;
    const vx = aim.x - p.x, vy = aim.y - p.y, vz = aim.z - p.z;
    const along = vx * dir.x + vy * dir.y + vz * dir.z;
    const off = along <= 0 ? Infinity
      : Math.hypot(vx - dir.x * along, vy - dir.y * along, vz - dir.z * along);
    const men = Object.values(snap.room.players);
    const alive = men.filter((m) => m.state !== "dead");
    let near = Infinity;
    for (const m of alive) near = Math.min(near, Math.hypot(aim.x - m.position.x, aim.z - m.position.z));
    rows.push({ t: snap.t / 1000, want, off, aim, pos: { ...p }, near,
      fromOrigin: Math.hypot(aim.x, aim.z), lensR: Math.hypot(p.x, p.z), alive: alive.length,
      miss: Math.hypot(aim.x - want.x, aim.z - want.z) });
  }
  const tail = rows.slice(Math.floor(rows.length / 3));
  const pct = (arr, q) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * q))]; };
  const offWorst = Math.max(...rows.map((r) => r.off));
  const missWorst = Math.max(...rows.map((r) => r.miss));
  const yHi = Math.max(...rows.map((r) => r.pos.y));
  const rHi = Math.max(...rows.map((r) => r.lensR));
  const originWin = tail.filter((r) => r.fromOrigin <= r.near).length;

  console.log(`\n  ${rows.length} snapshots of a dead man watching a live fight.`);
  console.log(`    aim off the ray the lens looks down   worst ${offWorst === Infinity ? "BEHIND THE LENS" : `${offWorst.toFixed(4)} m`}`);
  console.log(`    aim against the rule                  worst ${missWorst.toFixed(4)} m`);
  console.log(`    aim to the nearest LIVING man         p50 ${pct(tail.map((r) => r.near), 0.5).toFixed(2)} m   p90 ${pct(tail.map((r) => r.near), 0.9).toFixed(2)} m`);
  console.log(`    lens height                           up to ${yHi.toFixed(3)} m`);
  console.log(`    lens radius from the middle           up to ${rHi.toFixed(2)} m, palisade at 19.6 m`);
  console.log(`    branches the rule took                ${[...new Set(rows.map((r) => r.want.how))].join(", ")}\n`);

  console.log(`  A SPECTATING DEAD MAN, over a real fight:\n`);
  console.log(`      t        lens (x, y, z)                aims at (x, z)     off ray    nearest living   men up`);
  const step = Math.max(1, Math.floor(rows.length / 14));
  for (let i = 0; i < rows.length; i += step) {
    const r = rows[i];
    console.log(`    ${r.t.toFixed(2)}s   (${f2(r.pos.x)}, ${f2(r.pos.y)}, ${f2(r.pos.z)})`.padEnd(40)
      + `(${f2(r.aim.x)}, ${f2(r.aim.z)})`.padEnd(19)
      + `${r.off === Infinity ? "BEHIND" : r.off.toFixed(4)}`.padEnd(11)
      + `${r.near.toFixed(2)} m`.padEnd(17) + `${r.alive}`);
  }
  console.log();

  check("OVER A REAL FIGHT: the reported aim lies on the ray the lens is actually looking down, on every snapshot",
    offWorst < 0.01, `worst ${offWorst === Infinity ? "the point is BEHIND the lens" : `${offWorst.toFixed(4)} m`} over ${rows.length} snapshots`);
  check("and the lens is aimed where the rule says, over positions the server chose and this harness did not",
    missWorst < 1e-6, `worst ${missWorst.toFixed(6)} m from the point the rule picks; branches: ${[...new Set(rows.map((r) => r.want.how))].join(", ")}`);
  check("AND IT IS NOT THE MIDDLE OF THE RING, which is what a dead man used to watch",
    originWin === 0,
    `once the orbit has settled the aim sits ${pct(tail.map((r) => r.near), 0.5).toFixed(2)} m from the nearest living man `
    + `and ${pct(tail.map((r) => r.fromOrigin), 0.5).toFixed(2)} m from (0,0); ${originWin} of ${tail.length} snapshots where the origin `
    + `would have been no worse`);
  check("and over a real fight the dead lens still stands no higher than the living one",
    yHi <= liveYHi + 1e-9, `${yHi.toFixed(3)} m against the follow lens's ${liveYHi.toFixed(3)} m on the same rig`);
  check("and it never leaves the fighting ground on the geometry a real moot produced",
    rHi < 19.6, `worst ${rHi.toFixed(2)} m from the middle against the palisade at 19.6 m (world.ts:991)`);
  DEFERRALS.push(
    `§2's focus rule is a SECOND COPY of GameCanvas.tsx's — that file is a React component and`,
    `  cannot be imported here. This phase proves the RIG, not the CHOOSING. §3 is the only`,
    `  place the shipped rule itself is exercised.`);
}

// ------------------------------------------------------------- §3 the match
function waitForServer(url, timeoutMs = 180000) {
  const started = Date.now();
  return new Promise((ok, fail) => {
    const poll = async () => {
      try { const r = await fetch(url); if (r.ok || r.status === 404) return ok(); } catch { /* wait */ }
      if (Date.now() - started > timeoutMs) return fail(new Error(`server never came up at ${url}`));
      setTimeout(poll, 700);
    };
    poll();
  });
}

/**
 * The client's own copy of every packet, plus a per-animation-frame sample of
 * the rig taken BESIDE it. The two have to be read on the same frame or the
 * claim "the lens is on a living man" is a claim about two different instants —
 * `roundbeatshot` records that fault costing an afternoon.
 */
const PROBE = () => {
  const w = window;
  w.__spec = { room: null, samples: [], me: null, raf: 0, t0: performance.now() };
  // The CLIENT's own animation-frame count, which is NOT the sampler's rate and
  // is the number §3 turns out to live or die by. See the note at `holdFrames`.
  const raf = () => { w.__spec.raf++; requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  const Real = w.WebSocket;
  function Tapped(url, protocols) {
    const ws = protocols === undefined ? new Real(url) : new Real(url, protocols);
    ws.addEventListener("message", (e) => {
      try {
        const m = JSON.parse(e.data);
        const d = m.data || {};
        if (d.players) w.__spec.room = { ...d };
        else if (w.__spec.room) w.__spec.room = { ...w.__spec.room, ...d };
      } catch { /* ignore */ }
    });
    return ws;
  }
  Tapped.prototype = Real.prototype;
  Object.assign(Tapped, Real);
  w.WebSocket = Tapped;
  // SAMPLED ON A TIMER, NOT ON THE RENDER FRAME, and the reason is measured.
  // This box has no GPU and rasterises through SwiftShader; an animation frame
  // in a real four-man moot runs about twice a second here. The first cut of
  // this phase sampled inside `requestAnimationFrame` and collected 125 rows in
  // four minutes, never once catching the rig in `spectate` — not because the
  // client never spectated but because a three-second window between a death
  // hold and a round end falls between two render frames at that rate.
  //
  // MODE AND POSITION PERSIST BETWEEN RENDER FRAMES. `mode` changes only when
  // `setMode` is called and then stays; `camera.position` likewise. So a 20 Hz
  // timer sees every state the rig HELD, which is what a claim about where the
  // lens stood is about. What it does NOT see is anything about frame RATE, and
  // this file prints no such number.
  const tick = () => {
    const c = w.__bretwaldaCamera;
    const room = w.__spec.room;
    if (!c || !room || !room.players) return;
    const mine = Object.values(room.players).find((p) => !String(p.id).startsWith("bot_"));
    w.__spec.me = mine ? mine.id : null;
    w.__spec.samples.push({
      t: performance.now(),
      mode: c.mode,
      pos: c.position,
      aim: c.aim ?? null,
      roomState: room.state,
      meDead: mine ? mine.state === "dead" : null,
      men: Object.values(room.players).map((p) => ({
        id: p.id, x: p.position.x, z: p.position.z, dead: p.state === "dead", mine: p.id === (mine && mine.id),
      })),
    });
    // Kept whole: the spectate stretch can be a minute of samples and trimming
    // the front would silently drop the run this phase exists to read.
    if (w.__spec.samples.length > 60000) w.__spec.samples.splice(0, 20000);
  };
  setInterval(tick, 50);
};

async function phaseMatch() {
  rule("§3  A REAL CLIENT     (built app, real server, real fight, real browser)");
  const { chromium } = await import("playwright");
  const PORT = parseInt(process.env.PORT || String(3890 + (process.pid % 60)), 10);
  const SEED_DIE = pathToFileURL(resolve(ROOT, "tools/seeddie.mjs")).href;
  if (!existsSync(resolve(ROOT, ".next"))) {
    check("the app is built", false, "no .next — run `npm run build` first");
    return;
  }
  const server = spawn("node", ["--import", SEED_DIE, "custom-server.mjs"],
    { cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" }, stdio: "ignore" });
  let browser;
  try {
    await waitForServer(`http://127.0.0.1:${PORT}/api/health`);
    // THE SAME BROWSER AND THE SAME GL PATH the rest of the battery uses —
    // `cameratest`, `freezetest --phases=freeze` and `roundbeatshot` all launch
    // through this preinstalled binary with these four flags, and the first cut
    // of this phase did not: it asked for `--use-gl=swiftshader` off
    // playwright's own build, got a page whose animation frame ran 35 times in
    // four minutes, and concluded the client never entered spectate. It had
    // entered nothing; the loop was not running. Which binary is used is
    // reported on the verdict line either way.
    const preinstalled = "/opt/pw-browsers/chromium";
    const usedBinary = existsSync(preinstalled) ? preinstalled : "playwright's own";
    browser = await chromium.launch({
      ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
    });
    DEFERRALS.push(`§2 ran against the chromium at ${usedBinary}, on SwiftShader through ANGLE.`);
    const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
    await ctx.addInitScript(PROBE);
    const page = await ctx.newPage();
    page.setDefaultTimeout(120000);
    await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });

    // A BLOOD MOOT WITH FIVE BOTS, which is the only shape that produces the
    // case under test. Training is solo and has no other men; an honour duel
    // leaves two, so the moment the harness's man dies there is nobody left
    // fighting and the spectate lens has nothing to point at but the tally. Six
    // men means he can die with a fight still running, which is the whole
    // question. The entry sequence is `roundbeatshot`'s, including the name —
    // `handleCreate` refuses without one and refuses quietly, into a toast.
    await page.getByPlaceholder("Enter warrior name", { exact: false }).first().fill("Beadohild");
    await page.getByText("CREATE BATTLE", { exact: false }).first().click();
    await page.getByText("BLOOD MOOT", { exact: false }).first().click();
    await page.getByText("5", { exact: true }).first().click().catch(() => {});
    await page.getByText("CREATE ROOM", { exact: false }).first().click();
    const addAi = page.getByText("ADD AI", { exact: false }).first();
    await addAi.waitFor({ state: "visible", timeout: 60000 });
    // Five, for the reason §2 gives at its own `add_bot` loop: with three the
    // fight is over before the death hold has released the lens.
    for (let i = 0; i < 5; i++) { await addAi.click(); await page.waitForTimeout(400); }
    await page.getByText("START", { exact: true }).first().click();
    let entered = true;
    try {
      await page.waitForFunction(() => window.__spec?.room?.state === "fighting", null, { timeout: 120000 });
    } catch { entered = false; }
    check("a real six-man blood moot was entered and reached `fighting`", entered,
      entered ? "the client's own room state, off the wire" : "the room never reached `fighting`");
    if (!entered) return;

    // Stand still and let the bots kill him. A death is what this phase is for;
    // fighting back only makes it take longer. Then keep waiting, because the
    // frames worth measuring are the ones AFTER his own death hold has run out —
    // that is when `setMode("spectate")` happens.
    const deadline = Date.now() + 240000;
    let sawSpectate = false;
    while (Date.now() < deadline) {
      await page.waitForTimeout(2000);
      const s = await page.evaluate(() => {
        const a = window.__spec?.samples || [];
        const withMen = a.filter((x) => x.mode === "spectate" && x.men.some((m) => !m.dead));
        const last = a[a.length - 1];
        return { n: a.length, spectateWithMen: withMen.length, mode: last?.mode, roomState: last?.roomState };
      });
      // 200 samples at 20 Hz is ten seconds of a dead man watching a fight,
      // which is more than one round's worth of the window under test.
      if (s.spectateWithMen > 200) { sawSpectate = true; break; }
    }
    void sawSpectate;
    const fps = await page.evaluate(() => {
      const r = window.__spec;
      return r ? r.raf / ((performance.now() - r.t0) / 1000) : 0;
    });
    const data = await page.evaluate(() => window.__spec?.samples || []);
    // WHAT THE RUN ACTUALLY CONTAINED, printed whether it passed or failed. A
    // harness that says only "not found" sends the next reader back to run it
    // again to learn the same thing; the cross-tabulation below is what tells
    // "he never died" from "he died and the lens never handed over".
    const tab = new Map();
    for (const x of data) {
      const k = `${String(x.roomState).padEnd(12)} mine ${x.meDead === null ? "?" : x.meDead ? "DEAD " : "alive"}  mode ${x.mode}`;
      tab.set(k, (tab.get(k) ?? 0) + 1);
    }
    console.log(`\n  ${data.length} samples at 20 Hz, by room state, whether the harness's man was down, and the rig's mode:`);
    for (const [k, n] of [...tab.entries()].sort((x, y) => y[1] - x[1])) {
      console.log(`    ${String(n).padStart(5)}  ${k}`);
    }
    console.log();
    // WHY THIS PHASE CAN FAIL WITHOUT THE CAMERA BEING WRONG, and the arithmetic
    // is printed rather than asserted about.
    //
    // `GameCanvas.tsx:701` clamps the frame delta: `Math.min(elapsed, 0.05)`.
    // That is right — a hitch must not teleport the sim — but it means the death
    // hold advances by at most 0.05 s per ANIMATION FRAME, so `DEATH_HOLD.total`
    // of 3.35 s costs 67 frames however long each frame takes. `spectate` is set
    // only AFTER that hold releases. On a box with a GPU 67 frames is a second;
    // here, rasterising a six-man moot through SwiftShader, the client's own
    // animation frame runs at the rate printed below and 67 of them outlast the
    // round the man died in. The lens is then still on his own death camera when
    // the round ends — correct behaviour, unreachable case.
    //
    // It stays RED rather than being carved out: a claim nobody has to look at
    // is failure mode 2 in `docs/PROCESS.md`. What is added is the number that
    // says WHICH of the two it is.
    const holdSeconds = 3.35;
    const holdFrames = Math.round(holdSeconds / 0.05);
    const holdWall = fps > 0 ? holdFrames / fps : Infinity;
    const deathCamSamples = data.filter((s) => s.meDead && s.mode === "summary").length;
    console.log(`  THE CLIENT'S OWN ANIMATION FRAME ran at ${fps.toFixed(2)}/s here. The death hold is`);
    console.log(`  ${holdFrames} frames (${holdSeconds}s at the 0.05s clamp in GameCanvas.tsx:701), so it takes`);
    console.log(`  ${holdWall === Infinity ? "for ever" : `${holdWall.toFixed(1)}s of wall clock`} before the rig can hand over to "spectate".\n`);
    check("the local warrior died and the rig went to the spectate lens",
      data.some((s) => s.mode === "spectate"),
      `${data.length} rig samples; modes seen: ${[...new Set(data.map((s) => s.mode))].join(", ") || "none"}; `
      + `samples with the harness's man down: ${data.filter((s) => s.meDead).length}`
      + (deathCamSamples > 0
        ? `. He DID die and the lens DID take him — ${deathCamSamples} samples of his own death camera `
          + `("summary" is how GameCanvas puts a deathcam shot on the rig). It never released inside a round `
          + `because ${holdFrames} frames at ${fps.toFixed(2)}/s is ${holdWall.toFixed(1)}s. That is this box, `
          + `not the camera — §2 measures the same lens on the same rig over a real fight`
        : ". He never went down"));

    const spec = data.filter((s) => s.mode === "spectate" && s.aim && s.men.some((m) => !m.dead));
    if (!spec.length) {
      check("there are spectate frames with a living man on the field to measure against", false,
        "none — nothing below is measured");
      return;
    }
    // WHERE THE LENS SHOULD BE POINTED, computed HERE from the SERVER's own
    // player table, and compared with where the rig says it IS pointed.
    //
    // Not "is it near a living man" — that is a bar somebody picks. `GameCanvas`
    // states the rule: a living teammate if there is one, else the MIDPOINT OF
    // THE CLOSEST PAIR of men still standing, else the lone survivor, else the
    // middle of the ring. A blood moot is free-for-all, so every frame here
    // takes the closest-pair branch and the expected point is arithmetic. This
    // harness computes it independently and scores the miss.
    //
    // THE SLACK IS EXPLAINED, NOT CHOSEN. The client aims at its own SMOOTHED
    // rig positions (`slot.motion.rx/rz`) while this compares against the raw
    // 20 Hz snapshot, so the two disagree by however far a man moves between
    // ticks — up to about 0.3 m at a sprint. 0.75 m is that with room, and the
    // measured distribution is printed beside it so the bar is checkable.
    const expected = (men) => {
      const alive = men.filter((m) => !m.dead);
      if (alive.length === 0) return { x: 0, z: 0, how: "middle of the ring" };
      if (alive.length === 1) return { x: alive[0].x, z: alive[0].z, how: "the lone survivor" };
      let bx = alive[0].x, bz = alive[0].z, best = Infinity;
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const d = (alive[i].x - alive[j].x) ** 2 + (alive[i].z - alive[j].z) ** 2;
          if (d < best) { best = d; bx = (alive[i].x + alive[j].x) / 2; bz = (alive[i].z + alive[j].z) / 2; }
        }
      }
      return { x: bx, z: bz, how: "the closest pair's midpoint" };
    };
    const rows = spec.map((s) => {
      const alive = s.men.filter((m) => !m.dead);
      const want = expected(s.men);
      let near = Infinity;
      for (const m of alive) near = Math.min(near, Math.hypot(s.aim.x - m.x, s.aim.z - m.z));
      return {
        near, want, how: want.how,
        miss: Math.hypot(s.aim.x - want.x, s.aim.z - want.z),
        fromOrigin: Math.hypot(s.aim.x, s.aim.z),
        lensR: Math.hypot(s.pos.x, s.pos.z),
        y: s.pos.y, alive: alive.length, aim: s.aim, pos: s.pos,
      };
    });
    const pct = (arr, q) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * q))]; };
    const miss = rows.map((r) => r.miss);
    const near = rows.map((r) => r.near);
    const yLo = Math.min(...rows.map((r) => r.y)), yHi = Math.max(...rows.map((r) => r.y));
    const rHi = Math.max(...rows.map((r) => r.lensR));
    const originWin = rows.filter((r) => r.fromOrigin <= r.near).length;

    console.log(`\n  ${rows.length} spectate samples with the fight still running.`);
    console.log(`    aim vs the rule, computed here   p50 ${pct(miss, 0.5).toFixed(2)} m   p90 ${pct(miss, 0.9).toFixed(2)} m   worst ${Math.max(...miss).toFixed(2)} m`);
    console.log(`    aim to the nearest LIVING man    p50 ${pct(near, 0.5).toFixed(2)} m   p90 ${pct(near, 0.9).toFixed(2)} m   worst ${Math.max(...near).toFixed(2)} m`);
    console.log(`    lens height                      ${yLo.toFixed(3)} - ${yHi.toFixed(3)} m`);
    console.log(`    lens radius from the middle      up to ${rHi.toFixed(2)} m, against the palisade at 19.6 m\n`);

    check("THE DEAD MAN IS LOOKING WHERE THE RULE SAYS: the aim matches the closest-pair midpoint this harness computes from the server's own table",
      pct(miss, 0.9) < 0.75,
      `miss p50 ${pct(miss, 0.5).toFixed(2)} m, p90 ${pct(miss, 0.9).toFixed(2)} m, worst ${Math.max(...miss).toFixed(2)} m over `
        + `${rows.length} samples; branches taken: ${[...new Set(rows.map((r) => r.how))].join(", ")}`);
    check("AND IT IS NOT THE MIDDLE OF THE RING, which is what it was: the aim is nearer a living man than the world origin is, on every sample",
      originWin === 0,
      `the aim sits ${pct(near, 0.5).toFixed(2)} m from the nearest living man and ${pct(rows.map((r) => r.fromOrigin), 0.5).toFixed(2)} m from (0,0); `
        + `${originWin} of ${rows.length} samples where the origin would have been no worse. The reading this replaces — `
        + `"0.61 m from the nearest living man" — was taken from an instrument that reported the origin on every frame`);
    check("and the lens is standing, not flying — at a living player's own camera height, in a real match",
      yHi <= 2.05 + 1e-6, `${yLo.toFixed(3)} - ${yHi.toFixed(3)} m against CAM_HEIGHT 2.05 m`);
    check("and it never leaves the fighting ground in real play",
      rHi < 19.6, `worst ${rHi.toFixed(2)} m from the middle against the palisade at 19.6 m`);

    // The frame sequence, printed rather than summarised — R5 for a lens is
    // where it was, frame by frame, with the men it was looking at.
    const step = Math.max(1, Math.floor(rows.length / 14));
    console.log(`  A SPECTATING DEAD MAN, one row per ${(step / 20).toFixed(2)}s of his spectate:\n`);
    console.log(`      lens (x, y, z)            aims at (x, z)    the rule says     miss     nearest  men up`);
    for (let i = 0; i < rows.length; i += step) {
      const r = rows[i];
      console.log(`      (${f2(r.pos.x)}, ${f2(r.pos.y)}, ${f2(r.pos.z)})`.padEnd(32)
        + `(${f2(r.aim.x)}, ${f2(r.aim.z)})`.padEnd(20)
        + `(${f2(r.want.x)}, ${f2(r.want.z)})`.padEnd(20)
        + `${r.miss.toFixed(2)} m`.padEnd(9) + `${r.near.toFixed(2)} m`.padEnd(9) + `${r.alive}`);
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
  }
}

async function main() {
  console.log(`[spectatetest] phases: ${PHASES.join(", ")}${BLIND ? "  --blind (the readback as it shipped)" : ""}`);
  if (has("rig")) await phaseRig();
  if (has("moot")) await phaseMoot();
  if (has("match")) await phaseMatch();
  rule("VERDICT");
  const failed = results.filter((r) => !r.pass);
  console.log(`  ${results.length - failed.length}/${results.length} passed`);
  if (DEFERRALS.length) {
    console.log(`\n  DEFERRALS, on the verdict line and not below it (R4):`);
    for (const d of DEFERRALS) console.log(`    - ${d}`.replace(/^ {4}- {2}/, "      "));
  }
  console.log(`\n  WHAT THIS FILE DOES NOT CLAIM: that a dead man sees the same SET of points a`);
  console.log(`  living man sees. He stands somewhere else, so he does not. The claim is about`);
  console.log(`  the one axis a spectator lens can cheat on — elevation — and it is measured`);
  console.log(`  off the running rig in both modes rather than argued from a constant.`);
  // EXIT RATHER THAN RETURN. `getEngine()` is a live singleton with a tick timer
  // on it, so a run that has printed its verdict will otherwise sit at the prompt
  // for ever — the same trap `tools/deathcamtest.mjs` ends with `process.exit`
  // for. Nothing above is asynchronous past this point.
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error("[spectatetest] failed:", e); process.exitCode = 1; });
