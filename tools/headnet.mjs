#!/usr/bin/env node
// ============================================================
// HEADNET — would the head net have caught the headless man, and does it leave a headed one alone?
//
//   node tools/headnet.mjs                     gate: 4 classes x 12 states, healthy AND defective
//   node tools/headnet.mjs --cls=warden        one class
//   node tools/headnet.mjs --lever             R1: pull every bar and require the verdict to follow it
//
// THE OWNER'S WORDS, the acceptance criteria (PROCESS R6): "a torso ending in a
// neck stump with hair strands floating over the collar", and, in the arena,
// "inverted heads with the beard on top".
//
// WHAT THIS IS FOR. `src/game/client/render/authoredHead.ts` is the net that runs
// in the player's browser and throws an authored man out, in favour of a
// procedural one, when his head is not where it must be ("wrong body beats no
// head"). `tools/headflip.mjs` says the shipped pose puts the head right. This
// says the NET would have noticed if it did not, and would not have cried wolf
// when it did: a safety net that has never been shown to catch anything is a
// comment (PROCESS R2), and one that fires on a healthy man throws away the
// authored body for nothing, which is a regression a player can see.
//
// THE CASES, all through the REAL swap and the REAL `poseWarrior`, no browser:
//
//   HEALTHY    the shipped man, 4 classes x the 12 states the pose has a layer for,
//              8 loadouts on the default class, and the CLIP-DRIVEN man the arena
//              draws by default: the net must PASS every one. The
//              worst drift and turn are printed against their bars so the margin
//              is a number and not a feeling.
//   DEFECTIVE  the man the shipped tree drew before the fix: `applyPose` writing
//              absolute rotations onto the GLB's bones (the rest frames removed
//              after the swap, which is exactly what the inherited code did). The
//              net must REFUSE every one of them, in every state, on the first
//              frame it can judge — including the states the owner never
//              photographed.
//   STRUCTURAL each of the five facts the brief lists, broken on purpose on an
//              otherwise healthy man: nothing drawn above the shoulders, a
//              collapsed matrix, a collapsed scale, no skull, and a head that owns
//              no vertex. Each must trip on its own (a net whose five checks are
//              one check with five names is a net with one check).
//   ARMING     the net armed and never posed does not decide; it is not fooled
//              into calling a bind-pose man "passed" on frame 0 when the pose is
//              yet to run, and it lets an unposed man through after its patience.
//   LEVER      (--lever, R1) each bar in `HEAD_NET` is moved by a lot and the
//              verdict on the defective man must follow: with the reach and turn
//              bars opened to infinity the defective man PASSES, which is the proof
//              that those two numbers, and not some other, are what refuses him.
// ============================================================
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import * as L from "./lib/authoredrig.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).slice(k.length + 3);
const flag = (k) => process.argv.includes(`--${k}`);
const classes = arg("cls", L.CLASSES.join(",")).split(",");
const lever = flag("lever");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); ok ? pass++ : fail++; };

const kit = await L.loadKit(ROOT, ".headnet");
const { HEAD_NET, judgeHead, armHeadNet } = kit.net;
console.log(`HEADNET — the head net, against the man the tree shipped and the man it ships now`);
console.log(`  bars: reach ${HEAD_NET.maxReach} m, turn ${HEAD_NET.maxTurn} deg, det ${HEAD_NET.minDet}, scale ${HEAD_NET.minScale}, skull >= ${HEAD_NET.minSkullVerts} verts\n`);

const asNet = (B) => ({ body: B.rig.body, group: B.rig.group, pivots: B.rig.pivots });
const pose = (B, state, f) => {
  L.setState(B, state, f); B.ctx.dt = B.ctx.rawDt = 1 / 60; B.ctx.time += 1 / 60;
  kit.anim.poseWarrior(B.rig, B.motion, B.p, 1 / 60, B.ctx);
};

/** One man, one state: the verdicts at the first posed frame and at every 15th to 90. */
function runMan(cls, gltf, arms, state, { defective = false, mutate = null, bars = HEAD_NET } = {}) {
  const B = L.buildMan(kit, cls, gltf, true, arms);
  if (defective) delete B.rig.pivots.rest;
  if (mutate) mutate(B);
  const net = armHeadNet(asNet(B));
  const out = { first: null, worstReach: 0, worstTurn: 0, allOk: true, anyRefused: false, problems: new Set(), last: null };
  for (let f = 0; f < 90; f++) {
    pose(B, state, f);
    if (f === 0 || f % 15 === 14) {
      const v = judgeHead(net.check().now, net.bind, bars);
      if (f === 0) out.first = v;
      out.worstReach = Math.max(out.worstReach, v.reachDrift ?? 0);
      out.worstTurn = Math.max(out.worstTurn, v.turnDeg ?? 0);
      out.allOk &&= v.ok; out.anyRefused ||= !v.ok;
      v.problems.forEach((p) => out.problems.add(p.replace(/[0-9.]+/g, "#")));
      out.last = v;
    }
  }
  return { ...out, net, B };
}

// ---- HEALTHY -------------------------------------------------------------
const healthy = [];
for (const cls of classes) {
  const gltf = await L.parseGlb(ROOT, cls);
  for (const state of L.WIDE_STATES) {
    const r = runMan(cls, gltf, L.DEFAULT_ARMS[cls], state);
    healthy.push({ cls, state, r });
    if (!lever) check(`${cls}/${state}: the healthy man is NOT refused`, r.allOk, `worst reach drift ${r.worstReach.toFixed(3)} m (bar ${HEAD_NET.maxReach}), worst turn ${r.worstTurn.toFixed(1)} deg (bar ${HEAD_NET.maxTurn})${r.allOk ? "" : " — " + [...r.problems].join(" | ")}`);
  }
  // Every loadout the engine offers, in the two states the mannequin and the
  // arena spend their lives in — the two-handed branch of the pose included.
  for (const arms of L.armsFor(cls, "all")) {
    for (const state of ["idle", "attacking"]) {
      const r = runMan(cls, gltf, arms, state);
      if (!lever) check(`${cls}/${arms}/${state}: the healthy man is NOT refused`, r.allOk, `reach ${r.worstReach.toFixed(3)} m, turn ${r.worstTurn.toFixed(1)} deg`);
    }
  }
}
// THE ARENA'S MAN IS CLIP-DRIVEN by default (`clipsWanted()` is on whenever the authored warriors ship),
// and the clips are Blender's own animation of the same bones: a net calibrated on the procedural pose
// alone could refuse every man in the arena on the first frame and nobody would know until a capture.
let clipReach = 0, clipTurn = 0;
if (!lever) {
  for (const cls of classes) {
    const gltf = await L.parseGlb(ROOT, cls);
    let worstR = 0, worstT = 0, refused = 0, samples = 0;
    for (const state of L.WIDE_STATES) {
      const pair = L.buildPair(kit, cls, gltf);
      L.giveClips(kit, pair);
      const net = armHeadNet(asNet(pair.B));
      for (let f = 0; f < 90; f++) {
        pose(pair.B, state, f);
        if (f === 0 || f % 10 === 9) {
          const v = net.check(); samples++;
          if (!v.ok) refused++;
          worstR = Math.max(worstR, v.reachDrift ?? 0); worstT = Math.max(worstT, v.turnDeg ?? 0);
        }
      }
    }
    clipReach = Math.max(clipReach, worstR); clipTurn = Math.max(clipTurn, worstT);
    check(`${cls}: the CLIP-DRIVEN healthy man (12 states) is NOT refused in any of ${samples} samples`, refused === 0, `worst reach drift ${worstR.toFixed(3)} m, worst turn ${worstT.toFixed(1)} deg`);
  }
}
const hReach = Math.max(clipReach, ...healthy.map((h) => h.r.worstReach)), hTurn = Math.max(clipTurn, ...healthy.map((h) => h.r.worstTurn));
console.log(`\n  HEALTHY worst: reach drift ${hReach.toFixed(3)} m (bar ${HEAD_NET.maxReach}, ${(HEAD_NET.maxReach / hReach).toFixed(1)}x headroom), turn ${hTurn.toFixed(1)} deg (bar ${HEAD_NET.maxTurn}, ${(HEAD_NET.maxTurn / hTurn).toFixed(1)}x headroom)`);

// ---- DEFECTIVE -----------------------------------------------------------
const broken = [];
for (const cls of classes) {
  const gltf = await L.parseGlb(ROOT, cls);
  for (const state of L.WIDE_STATES) {
    const r = runMan(cls, gltf, L.DEFAULT_ARMS[cls], state, { defective: true });
    broken.push({ cls, state, r });
    if (!lever) check(`${cls}/${state}: the man the tree shipped before the fix IS refused, on the first posed frame`, !r.first.ok, `drift ${(r.first.reachDrift ?? 0).toFixed(3)} m, turn ${(r.first.turnDeg ?? 0).toFixed(0)} deg — ${[...r.problems].join(" | ")}`);
  }
}
const bReach = Math.min(...broken.map((h) => h.r.first.reachDrift ?? 0)), bTurn = Math.min(...broken.map((h) => h.r.first.turnDeg ?? 0));
console.log(`\n  DEFECTIVE smallest on the first frame: reach drift ${bReach.toFixed(3)} m (bar ${HEAD_NET.maxReach}, ${(bReach / HEAD_NET.maxReach).toFixed(1)}x over), turn ${bTurn.toFixed(0)} deg (bar ${HEAD_NET.maxTurn}, ${(bTurn / HEAD_NET.maxTurn).toFixed(1)}x over)`);

// ---- STRUCTURAL ----------------------------------------------------------
if (!lever) {
  console.log("");
  const cls = classes[0];
  const gltf = await L.parseGlb(ROOT, cls);
  const headMeshes = (B, fn) => B.rig.body.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    o.geometry.computeBoundingBox();
    if (o.geometry.boundingBox.max.y >= 1.6) fn(o);
  });
  const cases = [
    ["nothing is drawn above the shoulders", "nothing is drawn above the shoulders", (B) => headMeshes(B, (o) => { o.visible = false; })],
    ["the head bone's matrix has collapsed", "matrix has collapsed", (B) => { B.rig.pivots.head.scale.set(0, 0, 0); }],
    ["the head bone's scale has collapsed on one axis", "scale has collapsed", (B) => { B.rig.pivots.head.scale.set(1, 0.2, 1); }],
    ["there is no skull mesh", "no skull mesh", (B) => {
      const c = kit.net.censusHead(asNet(B));
      B.rig.body.traverse((o) => { if (o.isMesh && o.name === c.skullName) o.visible = false; });
    }],
  ];
  for (const [what, needle, mutate] of cases) {
    const r = runMan(cls, gltf, L.DEFAULT_ARMS[cls], "idle", { mutate });
    const hit = [...r.problems].some((p) => p.includes(needle));
    check(`${cls}: "${what}" is caught, by name`, hit && r.anyRefused, [...r.problems].join(" | ") || "no problem raised");
  }
  // A head that owns no vertex: every head-weighted mesh re-pointed at the hips.
  {
    const r = runMan(cls, gltf, L.DEFAULT_ARMS[cls], "idle", {
      mutate: (B) => B.rig.body.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        // A CLONE: the clone of a skinned scene shares its geometry with the cached parse, and
        // the first cut of this test re-pointed the shared weights and refused every man after it.
        o.geometry = o.geometry.clone();
        const hi = o.skeleton.bones.indexOf(B.rig.pivots.head);
        const ji = o.geometry.getAttribute("skinIndex");
        const spine = o.skeleton.bones.indexOf(B.rig.pivots.chest);
        for (let i = 0; i < ji.count; i++) for (let k = 0; k < 4; k++) if (ji.getComponent(i, k) === hi) ji.setComponent(i, k, spine);
      }),
    });
    check(`${cls}: "the head bone owns no drawn vertex" is caught`, [...r.problems].some((p) => p.includes("owns no drawn vertex")) && r.anyRefused, [...r.problems].join(" | ") || "no problem raised");
  }

  // ---- ARMING ------------------------------------------------------------
  const B = L.buildMan(kit, cls, gltf, true);
  const net = armHeadNet(asNet(B));
  const s0 = net.step();
  check("armed and never posed: the net WAITS rather than passing a bind-pose man on frame 0", s0.outcome === "waiting", s0.outcome);
  let out = s0.outcome, n = 0;
  while (out === "waiting" && n < 100) { out = net.step().outcome; n++; }
  check(`...and lets a man nobody poses through after its patience (${kit.net.HEAD_NET_PATIENCE} frames)`, out === "pass" && n === kit.net.HEAD_NET_PATIENCE, `${out} after ${n} more`);
  const B2 = L.buildMan(kit, cls, gltf, true);
  delete B2.rig.pivots.rest;
  const net2 = armHeadNet(asNet(B2));
  pose(B2, "idle", 0);
  check("armed, posed wrongly: the net REFUSES on the first step, without waiting", net2.step().outcome === "refused");
  const B3 = L.buildMan(kit, cls, gltf, true);
  const net3 = armHeadNet(asNet(B3));
  pose(B3, "idle", 0);
  check("armed, posed rightly: the net PASSES on the first step", net3.step().outcome === "pass");
}

// ---- LEVER (R1) ----------------------------------------------------------
if (lever) {
  console.log("");
  const open = { ...HEAD_NET, maxReach: 9, maxTurn: 400 };
  const shut = { ...HEAD_NET, maxReach: 0.0005, maxTurn: 0.05 };
  for (const cls of classes) {
    const gltf = await L.parseGlb(ROOT, cls);
    const dOpen = runMan(cls, gltf, L.DEFAULT_ARMS[cls], "idle", { defective: true, bars: open });
    check(`${cls}: with reach and turn opened wide the DEFECTIVE man passes — those two numbers are what refuse him`, dOpen.allOk, `${[...dOpen.problems].join(" | ") || "clean"}`);
    const hShut = runMan(cls, gltf, L.DEFAULT_ARMS[cls], "idle", { bars: shut });
    check(`${cls}: with them closed to nothing the HEALTHY man is refused — the bars move the verdict both ways`, hShut.anyRefused, `${[...hShut.problems].join(" | ") || "clean"}`);
    // The bars sit BETWEEN the two populations, which is what makes them bars.
    const between = HEAD_NET.maxReach > hReach && HEAD_NET.maxReach < bReach && HEAD_NET.maxTurn > hTurn && HEAD_NET.maxTurn < bTurn;
    check(`${cls}: the shipped bars sit between the healthy worst and the defective smallest`, between,
      `reach ${hReach.toFixed(3)} < ${HEAD_NET.maxReach} < ${bReach.toFixed(3)}; turn ${hTurn.toFixed(1)} < ${HEAD_NET.maxTurn} < ${bTurn.toFixed(0)}`);
  }
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}: ${pass} passed, ${fail} failed${lever ? "  (LEVER RUN)" : ""}`);
process.exit(fail === 0 ? 0 : 1);
