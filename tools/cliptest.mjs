#!/usr/bin/env node
// CLIPTEST — do the authored clips actually move a man, and does the server
// still own the clock while they do?
//
//   npm run cliptest
//
// WHY THIS EXISTS. Fifteen hand-authored clips have shipped inside every
// `warrior-<cls>.glb` since the rig was first exported. They were downloaded,
// parsed, checked by name — `warriorIsUsable` reduces them to a set and asserts
// twelve are present — and then discarded. `grep -rn "AnimationMixer" src/`
// returned nothing: there was no object in the client capable of evaluating an
// AnimationClip. `clips.py` gives every contact frame VECTOR interpolation
// handles so "a swing must not decelerate into its own contact", and that curve
// was authored, exported, shipped, validated and never sampled.
//
// `clipDriver.ts` plays them. This is the gate on it, and it runs against the
// REAL shipped GLBs through `GLTFLoader.parse` — no browser, no GPU, the same
// way `gltftest` reads them.
//
// THE CLAIM THAT MATTERS IS THE THIRD ONE. An attack clip is never *played*, it
// is SCRUBBED: its time is written every frame from `swingT / swingDuration`,
// both of which are on the wire. A free-running mixer would be a second clock,
// and a second clock is the defect `cliptime` exists to catch — "a swing that
// finishes on the client before it lands on the server". So the test is that
// the same `swingT` puts the blade in the SAME PLACE whatever the frame rate,
// and that a stroke driven at 30 fps and one at 240 agree at every instant.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { rmSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHIP = resolve(ROOT, "public/authored");
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

// ---- the real clipDriver.ts, transpiled ------------------------------------
function loadDriver() {
  const BUILD = resolve(ROOT, ".cliptest/mod");
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });
  const tsc = spawnSync("npx", ["tsc", "src/game/client/render/clipDriver.ts", "--outDir", ".cliptest/mod",
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
  const file = emitted.find((f) => f.endsWith("clipDriver.js"));
  if (!file) { console.error(`tsc emitted nothing:\n${tsc.stdout || ""}${tsc.stderr || ""}`); process.exit(2); }
  return file;
}

const mod = await import(pathToFileURL(loadDriver()).href);
const { createClipDriver, clipFor, isScrubbed, CLIP_NAMES } = mod;

const parse = (file) => new Promise((ok, no) => {
  const b = readFileSync(file);
  new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "", ok, no);
});

console.log("CLIPTEST — the authored motion, played at last\n");

// ---- 1. the decision table, before any geometry is involved ---------------
console.log("  WHICH CLIP A STATE WANTS");
const wants = [
  [{ group: "idle" }, "idle"],
  [{ group: "move", speed: 1.5 }, "walk"],
  [{ group: "move", speed: 5.0 }, "run"],
  [{ group: "attacking", dir: "right" }, "attack"],
  [{ group: "attacking", dir: "left" }, "attackLeft"],
  [{ group: "attacking", dir: "overhead" }, "attackOverhead"],
  [{ group: "attacking", dir: "stab" }, "attackStab"],
  [{ group: "attacking", dir: "right", heavy: true }, "heavy"],
  [{ group: "blocking" }, "block"],
  [{ group: "dodging" }, "dodge"],
  [{ group: "dead" }, "die"],
  [{ group: "staggered", dir: "overhead" }, "hitOverhead"],
];
const wrong = wants.filter(([i, want]) => clipFor(i) !== want);
check("every state the driver claims maps to the clip clips.py authors for it",
  wrong.length === 0,
  wrong.length ? wrong.map(([i, w]) => `${i.group}/${i.dir ?? "-"} wanted ${w} got ${clipFor(i)}`).join("; ")
    : `${wants.length} states`);

// The states it deliberately has nothing for. A driver that invented a
// substitute would be worse than the procedural pose that already handles them.
const none = ["down", "ability", "shoving"].filter((g) => clipFor({ group: g }) !== null);
check("and the states clips.py authors nothing for hand the body back",
  none.length === 0, none.length ? `claimed a clip for ${none.join(", ")}` : "down, ability, shoving -> null");

check("only the blows the wire clocks are scrubbed",
  CLIP_NAMES.filter(isScrubbed).join(",") === "attack,attackLeft,attackOverhead,attackStab,heavy",
  CLIP_NAMES.filter(isScrubbed).join(", "));

// ---- 2. against the real shipped assets -----------------------------------
console.log("\n  AGAINST THE SHIPPED GLBs");
let moved = 0, built = 0;
const report = [];
for (const cls of CLASSES) {
  const file = resolve(SHIP, `warrior-${cls}.glb`);
  if (!existsSync(file)) { check(`${cls}: the shipped GLB exists`, false, file); continue; }
  const g = await parse(file);
  const driver = createClipDriver(g.scene, g.animations);
  if (!driver) { check(`${cls}: a driver binds to the shipped body`, false, "createClipDriver returned null"); continue; }
  built++;

  // A bone the idle clip is known to move, sampled before and after.
  const bone = g.scene.getObjectByName("Spine") ?? g.scene.getObjectByName("Hips");
  const before = bone.quaternion.clone();
  for (let i = 0; i < 30; i++) driver.update(1 / 30, { group: "idle" });
  const after = bone.quaternion.clone();
  const delta = before.angleTo(after);
  if (delta > 1e-4) moved++;
  report.push(`${cls} ${driver.have.size} clips, idle moved Spine ${(delta * 180 / Math.PI).toFixed(2)}deg`);
  driver.dispose();
}
for (const r of report) console.log(`    ${r}`);
check("a driver binds to every shipped warrior", built === CLASSES.length, `${built}/${CLASSES.length}`);
check("and playing idle actually moves the skeleton — the clips are not inert",
  moved === CLASSES.length, `${moved}/${CLASSES.length} bodies moved`);

// ---- 3. THE ONE THAT MATTERS: the server owns the clock --------------------
console.log("\n  THE SERVER'S CLOCK, NOT THE MIXER'S");
{
  const g = await parse(resolve(SHIP, "warrior-huscarl.glb"));
  const bone = g.scene.getObjectByName("RightUpperArm") ?? g.scene.getObjectByName("Spine");
  const DUR = 1.02;                       // a huscarl light, off the engine's table

  /** Drive one stroke at `fps` and record the bone at each sampled swingT. */
  const runAt = (fps) => {
    const d = createClipDriver(g.scene, g.animations);
    const out = new Map();
    const n = Math.round(DUR * fps);
    for (let i = 0; i <= n; i++) {
      const t = Math.min(DUR, i / fps);
      d.update(1 / fps, { group: "attacking", dir: "right", swingT: t, swingDuration: DUR });
      out.set(Number((t / DUR).toFixed(3)), bone.quaternion.clone());
    }
    d.dispose();
    return out;
  };
  const slow = runAt(30), fast = runAt(240);
  // Compare at the fractions BOTH rates actually sampled.
  let worst = 0, comparedAt = 0;
  for (const [f, q] of slow) {
    const other = fast.get(f);
    if (!other) continue;
    comparedAt++;
    worst = Math.max(worst, q.angleTo(other));
  }
  console.log(`    compared ${comparedAt} shared instants of the stroke, 30 fps against 240 fps`);
  check("the same swingT puts the arm in the same place whatever the frame rate",
    comparedAt > 5 && worst < 1e-3,
    `worst ${(worst * 180 / Math.PI).toFixed(4)}deg across ${comparedAt} instants`);

  // ...and it is a stroke, not a still: the pose must actually travel.
  const d2 = createClipDriver(g.scene, g.animations);
  d2.update(1 / 60, { group: "attacking", dir: "right", swingT: 0, swingDuration: DUR });
  const atStart = bone.quaternion.clone();
  d2.update(1 / 60, { group: "attacking", dir: "right", swingT: DUR * 0.5, swingDuration: DUR });
  const atMid = bone.quaternion.clone();
  d2.dispose();
  check("...and scrubbing it moves the arm, so the clock is driving a real stroke",
    atStart.angleTo(atMid) > 0.02,
    `${(atStart.angleTo(atMid) * 180 / Math.PI).toFixed(2)}deg from the start of the stroke to its middle`);
}

// ---- 4. handing the body back ---------------------------------------------
console.log("\n  HANDING THE BODY BACK");
{
  const g = await parse(resolve(SHIP, "warrior-huscarl.glb"));
  const d = createClipDriver(g.scene, g.animations);
  check("a state with no clip returns null so the procedural pose can take over",
    d.update(1 / 60, { group: "ability" }) === null, "ability -> null");
  check("...and a state with one returns its name",
    d.update(1 / 60, { group: "idle" }) === "idle", "idle -> idle");
  d.dispose();
}

// ---- DOES THE WEAPON STAY IN THE FIST THROUGH A SWING? ---------------------
//
// The one thing clip mode was NOT sure about. `applyPose` writes
// `rig.weapon.rotation`, `rig.offhand.rotation` and the shield's position every
// frame, and clip mode skips it — so held things keep the local transform they
// had when the driver took the body.
//
// For the BODY that was a defect and is fixed: the clip's own Hips track moves
// the root too, so a stale offset double-counted, and `rig.body` is reset to
// identity. For a WEAPON it is the opposite, and `authored.ts` says why in its
// own words — "anim.ts places a board relative to the elbow it is strapped to
// and a blade relative to the fist that holds it, and those offsets are the
// carry, not slack to be zeroed", recorded after clearing them was tried and
// was wrong. The clip does not animate the weapon; it is not in the skeleton.
// The mount is, so the blade rides the fist.
//
// That is an argument. This is the measurement: hang something on HandR, play a
// whole attack, and watch the gap between it and the bone. A weapon that came
// loose would drift; one riding the fist holds its offset to the millimetre
// while the hand itself travels.
{
  const g = await parse(resolve(SHIP, "warrior-huscarl.glb"));
  g.scene.updateMatrixWorld(true);
  let sk = null; g.scene.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o; });
  const hand = sk.skeleton.bones.find((b) => b.name === "HandR")
    ?? sk.skeleton.bones.find((b) => b.name === "RightWrist");
  const sword = new THREE.Object3D();
  sword.position.set(0.01, 0.18, 0.02);          // a carry offset, as anim.ts leaves one
  hand.add(sword);

  const d = createClipDriver(g.scene, g.animations);
  const DUR = 1.02;
  const hw = new THREE.Vector3(), sw2 = new THREE.Vector3();
  let minGap = Infinity, maxGap = -Infinity, handTravel = 0;
  const prevHand = new THREE.Vector3();
  let first = true;
  for (let t = 0; t <= DUR; t += DUR / 40) {
    d.update(1 / 40, { group: "attacking", dir: "right", swingT: t, swingDuration: DUR });
    g.scene.updateMatrixWorld(true);
    hand.getWorldPosition(hw);
    sword.getWorldPosition(sw2);
    const gap = hw.distanceTo(sw2);
    minGap = Math.min(minGap, gap); maxGap = Math.max(maxGap, gap);
    if (!first) handTravel += prevHand.distanceTo(hw);
    prevHand.copy(hw); first = false;
  }
  const drift = maxGap - minGap;
  console.log(`\n  THE WEAPON THROUGH A WHOLE STROKE`);
  console.log(`    hand travelled ${handTravel.toFixed(3)} m; the carry gap held ${minGap.toFixed(4)}-${maxGap.toFixed(4)} m`);
  check("the weapon rides the fist through a whole swing — the carry is not lost in clip mode",
    drift < 1e-4 && handTravel > 0.15,
    `gap drifted ${(drift * 1000).toFixed(3)} mm while the hand moved ${handTravel.toFixed(2)} m`);
}

console.log(`\n[cliptest] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
