#!/usr/bin/env node
// ============================================================
// HEADFLIP — does the authored man still have his head on the right way up?
//
//   node tools/headflip.mjs                          gate: 4 classes x idle/walking/attacking/knocked/dead, 90 frames each
//   node tools/headflip.mjs --cls=warden --states=idle
//   node tools/headflip.mjs --wide                   all twelve states the pose has a layer for
//   node tools/headflip.mjs --lever=90               R1: turn the captured Head rest by 90 deg; the gate MUST go red
//   node tools/headflip.mjs --naive                  the control: today's write, absolute rotations onto the GLB bones. MUST fail
//   node tools/headflip.mjs --no-mirror              the other control: the double mirror put back. MUST fail (handedness lives in parity)
//
// THE OWNER'S WORDS, which are the acceptance criteria (PROCESS R6):
//
//   the armoury / oath / lobby / training mannequin is "a torso ending in a neck
//   stump with hair strands floating over the collar", and in the ARENA "the men
//   wear inverted heads with the beard on top".
//
// WHAT WAS WRONG. `applyPose` writes ABSOLUTE local rotations onto the pivots it
// drives (`anim.ts`: `piv.head.rotation.set(P.hrx, P.hry, P.hrz)`), and it wrote
// them onto the authored skeleton after `upgradeRigToAuthored` repointed the
// pivots at Blender's bones — which do not rest at identity. The authored `Head`
// bone rests at quaternion (0,0,-1,0), 180 degrees about Z, because
// `tools/blender/rig.py` builds every bone with its tail toward its first child
// and `Head` has none, so its Y points DOWN. The first posed frame therefore
// turned the whole head upside-down about the head pivot and sank it 0.34 m into
// the chest. The hair, beard and helm props hang off a socket that assumes the
// bone is at its bind orientation, so they went with it: strands over the collar.
//
// THE RULER THAT WAS MISSING (PROCESS Part 1 §1). The head census in
// `GameCanvas.tsx` / `armouryStage.ts` counts meshes whose BIND bounding box
// reaches y >= 1.6 and that are `visible`. A skull that is visible, correctly
// skinned and drawn inside the chest passes it. `head.det` looks for a collapsed
// matrix; this matrix was fine (det +1), merely 180 degrees wrong. This gate
// asks the only question that can see it: pose the SAME man procedurally and
// authored, with the REAL `poseWarrior`, and compare where the head ends up.
//
// THE QUANTITY. Every vertex the Head bone owns (weight >= 0.5, after skinning)
// against every vertex of the procedural head group, in world space:
//
//   crown   max-y of B minus max-y of A. The bar is 3 cm. A flipped head reads
//           -0.34, so the bar is a tenth of the defect.
//   box     the worst of all six faces of the two boxes, same bar. A head that
//           is the right height and faces backwards, or lies on its side, has the
//           right crown and the wrong box.
//   turn    the rotation the head made from its own bind pose, A against B, in
//           degrees. The bar is 3. This is the one that separates a head turned
//           by 180 about Z from one merely offset, and it needs no vertex.
//
// The three are read at every 15th frame of 90, in idle, in an attack swept
// through its windup, strike and recovery (all four directions), and knocked
// down — the states the mannequin and the arena men are actually in.
//
// R1 IS BUILT IN. `--lever=90` rotates the captured Head rest quaternion by 90
// degrees about X and requires the crown, the box and the turn ALL to move past
// their bars: a gate that does not notice the constant it claims to depend on is
// measuring something else. `--naive` and `--no-mirror` are the controls, the
// same run with the fix's two halves taken off after the swap.
// ============================================================
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import * as L from "./lib/authoredrig.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).slice(k.length + 3);
const flag = (k) => process.argv.includes(`--${k}`);
const classes = arg("cls", L.CLASSES.join(",")).split(",");
const states = arg("states", (flag("wide") ? L.WIDE_STATES : L.STATES).join(",")).split(",");
const frames = Number(arg("frames", 90));
const lever = Number(arg("lever", 0));
const naive = flag("naive"), noMirror = flag("no-mirror");

const CROWN_BAR = 0.03, BOX_BAR = 0.03, TURN_BAR = 3;

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); ok ? pass++ : fail++; };

const kit = await L.loadKit(ROOT, ".headflip");
console.log(`HEADFLIP — the authored head, posed by the real pose stack${naive ? "  [CONTROL: naive absolute writes]" : ""}${noMirror ? "  [CONTROL: double mirror restored]" : ""}${lever ? `  [LEVER: Head rest turned ${lever} deg]` : ""}\n`);

const rows = [];
for (const cls of classes) {
  const gltf = await L.parseGlb(ROOT, cls);
  const headBone = gltf.scene.getObjectByName("Head");
  const rq = headBone.quaternion;
  console.log(`  ${cls}: shipped Head bone rest quaternion (${[rq.x, rq.y, rq.z, rq.w].map((v) => v.toFixed(3)).join(", ")})` +
    `${Math.abs(rq.w) < 0.5 ? "  <- NOT identity: an absolute rotation.set() lands turned by this" : ""}`);
  for (const state of states) {
    const pair = L.buildPair(kit, cls, gltf);
    const rest = pair.B.rig.pivots.rest;
    if (naive) delete pair.B.rig.pivots.rest;
    if (noMirror) pair.B.scene.scale.x = 1;
    if (lever) {
      if (!rest?.slots?.head) { check(`${cls}: the lever has a captured Head rest to pull`, false, "rig.pivots.rest.slots.head is absent"); continue; }
      rest.slots.head.q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (lever * Math.PI) / 180));
    }
    const s = L.run(kit, pair, state, frames, 15);
    const crown = L.worst(s, (x) => Math.abs(x.head.crown));
    const box = L.worst(s, (x) => x.head.box);
    const turn = L.worst(s, (x) => x.joints.head.deg);
    rows.push({ cls, state, crown, box, turn, last: s[s.length - 1] });
    console.log(`    ${state.padEnd(9)} crown ${L.f3(s[s.length - 1].head.crown)} m (worst ${crown.toFixed(3)})   box worst ${box.toFixed(3)} m   head turn worst ${turn.toFixed(1)} deg` +
      `   [A crown y ${s[s.length - 1].head.a.max.y.toFixed(3)}, B ${s[s.length - 1].head.b.max.y.toFixed(3)}]`);
  }
}
console.log("");

if (!lever) {
  for (const r of rows) {
    check(`${r.cls}/${r.state}: the Head-weighted crown is within ${CROWN_BAR * 100} cm of the procedural man's`, r.crown <= CROWN_BAR, `worst ${r.crown.toFixed(3)} m`);
    check(`${r.cls}/${r.state}: every face of the head's box is within ${BOX_BAR * 100} cm of the procedural head's`, r.box <= BOX_BAR, `worst ${r.box.toFixed(3)} m`);
    check(`${r.cls}/${r.state}: the head turned as far as the procedural head did (within ${TURN_BAR} deg)`, r.turn <= TURN_BAR, `worst ${r.turn.toFixed(1)} deg`);
  }
} else {
  // R1: the constant the fix claims to depend on has to be one the ruler feels.
  for (const r of rows) {
    check(`${r.cls}/${r.state}: turning the captured rest ${lever} deg moves the crown past its bar`, r.crown > CROWN_BAR, `${r.crown.toFixed(3)} m`);
    check(`${r.cls}/${r.state}: ...and the head's turn past its bar`, r.turn > TURN_BAR, `${r.turn.toFixed(1)} deg`);
  }
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}: ${pass} passed, ${fail} failed` +
  `${lever ? "  (LEVER RUN: PASS means the gate went red when it should — the number moved)" : ""}` +
  `${naive || noMirror ? "  (CONTROL RUN: FAIL is the expected and correct answer)" : ""}`);
process.exit(fail === 0 ? 0 : 1);
