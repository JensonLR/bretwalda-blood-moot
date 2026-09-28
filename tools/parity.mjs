#!/usr/bin/env node
// ============================================================
// PARITY — is the authored man driven by the pose in the frames the pose was written for?
//
//   node tools/parity.mjs                           gate: 4 classes x idle/walking/attacking/knocked/dead, 90 frames each, right-handed AND left-handed
//   node tools/parity.mjs --cls=huscarl --states=attacking
//   node tools/parity.mjs --wide                    the wider sweep: all twelve states the pose has a layer for
//   node tools/parity.mjs --lever=90                R1: turn the captured Rest of one pivot; the gate MUST go red
//   node tools/parity.mjs --naive                   control: absolute rotation.set() onto the GLB bones (today's drive). MUST fail
//   node tools/parity.mjs --no-mirror               control: the double mirror put back. MUST fail
//
// THE OWNER'S WORDS: the man "is built mirrored twice" — the recon's phrase for a
// default-build authored man whose weapon is in the wrong hand, and whose shield
// floats 0.66 m from the arm it should be strapped to. And what every default
// player sees: heads inside chests (that half is `headflip`).
//
// WHAT WAS WRONG, THREE DEFECTS OF ONE CLASS. The pose (`applyPose`) was written
// for a procedural skeleton whose every pivot rests at identity, in a body space
// that `handedness` then mirrors. The authored skeleton is not that skeleton:
//
//   1. its bones rest turned (`Head` and the four shoulder/hip parents at 180
//      about Z, `RightWrist` at -78 about X) because Blender orients a bone along
//      its child, so an absolute `rotation.set()` lands every joint in the wrong
//      frame. Elbow 0.45 m from where the procedural man has it, wrist 0.43-0.75,
//      knee 0.25, pitch inverted (a forward swing goes behind him);
//   2. the GLB is ALREADY right-handed (`exportrig.mjs` bakes the mirror) and the
//      `handedness` node reflects it again, so every default authored man carried
//      his weapon in the hand he should carry his shield in, and a left-hander
//      got the right-handed man;
//   3. the weapon hangs off the WRIST bone, which `applyPose` also turns, so the
//      blade took the wrist turn twice, and the huscarl's board — strapped to the
//      forearm and placed by an offset written in the PROCEDURAL forearm frame —
//      floated 0.657 m off.
//
// WHAT IS MEASURED, per class, per state, at every 15th of 90 frames of the REAL
// `poseWarrior`, procedural man A against authored man B, in world space:
//
//   joint    the world position of every one of the twelve pivots. Bar: 1 cm.
//   turn     the rotation each pivot has made from its own bind pose, A against
//            B, in degrees. Bar: 3. (Position cannot see a bone that turned on its
//            own axis; this can.)
//   hand     which side of his own body the weapon is on, in the warrior's own
//            frame — exactly what `reportHand` publishes for `cameratest`. Must
//            be the same SIGN as the procedural man's, and within 2 cm of it. Run
//            twice: default handedness and `setHandedness(true)`, because the
//            left-hander is the man who used to get the wrong one.
//   mounts   off-axis probe points carried by the weapon, the off hand's blade and
//            the board, world A against world B. Bar: 1.5 cm. Probes rather than
//            an origin, on purpose: a weapon reflected in its own x, or turned by
//            the wrist twice, has the right origin and the wrong blade.
//   cloak    the seven bones of the cloth (`CloakYoke`, `Drape1..6`), position and
//            turn, same bars. The drape had the same defect as the pivots: its
//            yoke rests 34 degrees about Z and `drapeCloak` wrote over it.
//   clips    the ARENA man, whom `clipDriver` poses instead of `applyPose`: his
//            weapon arm is on the procedural man's side, the carried blade is in
//            that hand, and the blade rides the fist.
//
// R1 IS BUILT IN: `--lever=90` turns the captured rest of the head, the weapon
// wrist and the board's elbow by 90 deg and requires all three quantities to move.
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

const JOINT_BAR = 0.01, TURN_BAR = 3, SIDE_BAR = 0.02, MOUNT_BAR = 0.015;

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); ok ? pass++ : fail++; };

const kit = await L.loadKit(ROOT, ".parity");
console.log(`PARITY — the authored man against the procedural one, same pose code${naive ? "  [CONTROL: naive absolute writes]" : ""}${noMirror ? "  [CONTROL: double mirror restored]" : ""}${lever ? `  [LEVER: rest turned ${lever} deg]` : ""}\n`);

const rows = [];
for (const lefty of [false, true]) {
  if (lever && lefty) break;
  kit.input.setHandedness(lefty);
  for (const cls of classes) {
    const gltf = await L.parseGlb(ROOT, cls);
    for (const state of states) {
      const pair = L.buildPair(kit, cls, gltf);
      const rest = pair.B.rig.pivots.rest;
      if (naive) delete pair.B.rig.pivots.rest;
      if (noMirror) pair.B.scene.scale.x = 1;
      if (lever) {
        if (!rest?.slots) { check(`${cls}: the lever has a captured rest to pull`, false, "rig.pivots.rest.slots is absent"); continue; }
        const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (lever * Math.PI) / 180);
        for (const s of ["head", "wristR", "elbowL"]) rest.slots[s]?.q.premultiply(turn);
      }
      const s = L.run(kit, pair, state, frames, 15);
      const joint = {}, turn = {};
      for (const k of L.SLOTS) { joint[k] = L.worst(s, (x) => x.joints[k].d); turn[k] = L.worst(s, (x) => x.joints[k].deg); }
      const wj = Object.entries(joint).sort((a, b) => b[1] - a[1])[0];
      const wt = Object.entries(turn).sort((a, b) => b[1] - a[1])[0];
      const side = L.worst(s, (x) => Math.abs(x.weaponSide.b - x.weaponSide.a));
      const last = s[s.length - 1];
      // The same side at every sample where the procedural blade is clearly on
      // one (a blade crosses the midline in a swing, and there "which side" is
      // not a question), and the same ARM on the same side at every sample.
      const sameSign = s.every((x) => Math.abs(x.weaponSide.a) < 0.05 || Math.sign(x.weaponSide.a) === Math.sign(x.weaponSide.b))
        && s.every((x) => Math.abs(x.armSide.a) < 0.05 || Math.sign(x.armSide.a) === Math.sign(x.armSide.b));
      const r = {
        lefty, cls, state, joint, turn, wj, wt, side, sameSign,
        tip: L.worst(s, (x) => x.weapon.tip), probe: L.worst(s, (x) => x.weapon.probe),
        off: pair.A.rig.offhand ? L.worst(s, (x) => x.offhand) : null,
        shield: pair.A.rig.shield ? L.worst(s, (x) => x.shield) : null,
        cloak: last.drape.length ? { d: L.worst(s, (x) => Math.max(...x.drape.map((v) => v.d))), deg: L.worst(s, (x) => Math.max(...x.drape.map((v) => v.deg))) } : null,
        hand: { a: last.weaponSide.a, b: last.weaponSide.b },
      };
      rows.push(r);
      console.log(`  ${lefty ? "LEFT " : "right"} ${cls.padEnd(10)} ${state.padEnd(9)} worst joint ${wj[0]} ${L.mm(wj[1])}   worst turn ${wt[0]} ${wt[1].toFixed(2)} deg   ` +
        `weapon x A ${last.weaponSide.a.toFixed(3)} B ${last.weaponSide.b.toFixed(3)}   tip ${L.mm(r.tip)}  blade probes ${L.mm(r.probe)}` +
        `${r.off !== null ? `  off ${L.mm(r.off)}` : ""}${r.shield !== null ? `  board ${L.mm(r.shield)}` : ""}${r.cloak ? `  cloak ${L.mm(r.cloak.d)}/${r.cloak.deg.toFixed(2)}deg` : ""}`);
    }
  }
}
kit.input.setHandedness(false);
console.log("");

// ---- the arena man: driven by the clips, not by applyPose -------------------
const clipRows = [];
if (!lever && !naive && !noMirror && !flag("no-clips")) {
  console.log("  THE ARENA MAN (clipDriver owns the body)");
  for (const lefty of [false, true]) {
    kit.input.setHandedness(lefty);
    for (const cls of classes) {
      const gltf = await L.parseGlb(ROOT, cls);
      for (const state of ["idle", "walking", "running", "blocking", "attacking"]) {
        const pair = L.buildPair(kit, cls, gltf);
        L.giveClips(kit, pair);
        const s = L.run(kit, pair, state, 60, 20);
        const last = s[s.length - 1];
        // The weapon rides the fist: its origin sits on the HandR mount bone.
        const hand = pair.B.scene.getObjectByName("HandR");
        const ride = L.worst(s, () => L.worldPos(pair.B.rig.weapon).distanceTo(L.worldPos(hand)));
        // The clips are not the procedural pose, so the blade is not compared to A's
        // blade in a swing. What is asked is where his WEAPON ARM is (the same side
        // as the procedural man's, at every sample), which side the carried blade
        // is on when it is CARRIED (idle), and that the blade rides the fist.
        // A swing is not compared: the clip's stroke and the procedural stroke are
        // different strokes, and both cross the midline. It still has to ride the fist.
        const swing = state === "attacking";
        const armOk = swing || s.every((x) => Math.abs(x.armSide.a) < 0.05 || Math.sign(x.armSide.a) === Math.sign(x.armSide.b));
        const carriedOk = state !== "idle" || s.every((x) => Math.sign(x.weaponSide.a) === Math.sign(x.weaponSide.b) && Math.abs(x.weaponSide.b) > 0.05);
        clipRows.push({ lefty, cls, state, swing, sameSign: armOk && carriedOk, ride, a: last.armSide.a, b: last.armSide.b, wa: last.weaponSide.a, wb: last.weaponSide.b });
        console.log(`  ${lefty ? "LEFT " : "right"} ${cls.padEnd(10)} ${state.padEnd(9)} weapon-arm x A ${last.armSide.a.toFixed(3)} B ${last.armSide.b.toFixed(3)}   weapon x A ${last.weaponSide.a.toFixed(3)} B ${last.weaponSide.b.toFixed(3)}   weapon origin to fist ${L.mm(ride)}`);
      }
    }
  }
  kit.input.setHandedness(false);
  console.log("");
}

if (!lever) {
  for (const r of rows) {
    const tag = `${r.lefty ? "LEFT" : "right"} ${r.cls}/${r.state}`;
    check(`${tag}: every one of the twelve pivots is within ${JOINT_BAR * 100} cm of the procedural man's`, r.wj[1] <= JOINT_BAR, `worst ${r.wj[0]} ${r.wj[1].toFixed(3)} m`);
    check(`${tag}: and has turned as far as the procedural pivot did (within ${TURN_BAR} deg)`, r.wt[1] <= TURN_BAR, `worst ${r.wt[0]} ${r.wt[1].toFixed(1)} deg`);
    check(`${tag}: the weapon is in the same hand as the procedural man's, within ${SIDE_BAR * 100} cm`, r.sameSign && r.side <= SIDE_BAR, `A ${r.hand.a.toFixed(3)} B ${r.hand.b.toFixed(3)}`);
    check(`${tag}: the weapon's probe points are within ${MOUNT_BAR * 100} cm (tip ${r.tip.toFixed(3)})`, r.probe <= MOUNT_BAR && r.tip <= MOUNT_BAR, `worst ${r.probe.toFixed(3)} m`);
    if (r.off !== null) check(`${tag}: the off-hand blade's probe points are within ${MOUNT_BAR * 100} cm`, r.off <= MOUNT_BAR, `worst ${r.off.toFixed(3)} m`);
    if (r.shield !== null) check(`${tag}: the board's probe points are within ${MOUNT_BAR * 100} cm`, r.shield <= MOUNT_BAR, `worst ${r.shield.toFixed(3)} m`);
    if (r.cloak) check(`${tag}: the cloak's seven bones are within ${JOINT_BAR * 100} cm and ${TURN_BAR} deg of the procedural cloak's`, r.cloak.d <= JOINT_BAR && r.cloak.deg <= TURN_BAR, `worst ${r.cloak.d.toFixed(3)} m / ${r.cloak.deg.toFixed(1)} deg`);
  }
  for (const r of clipRows) {
    const tag = `${r.lefty ? "LEFT" : "right"} ${r.cls}/${r.state} (clips)`;
    if (!r.swing) check(`${tag}: his weapon arm is on the procedural man's side${r.state === "idle" ? " and the carried blade is in that hand" : ""}`, r.sameSign, `arm A ${r.a.toFixed(3)} B ${r.b.toFixed(3)}; blade A ${r.wa.toFixed(3)} B ${r.wb.toFixed(3)}`);
    check(`${tag}: and rides the fist (origin within 2 cm of HandR)`, r.ride <= 0.02, `${r.ride.toFixed(3)} m`);
  }
} else {
  for (const r of rows) {
    const tag = `${r.cls}/${r.state}`;
    check(`${tag}: turning the captured rests ${lever} deg moves a joint past its bar`, r.wj[1] > JOINT_BAR, `${r.wj[0]} ${r.wj[1].toFixed(3)} m`);
    check(`${tag}: ...and a pivot's turn past its bar`, r.wt[1] > TURN_BAR, `${r.wt[0]} ${r.wt[1].toFixed(1)} deg`);
  }
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}: ${pass} passed, ${fail} failed` +
  `${lever ? "  (LEVER RUN: PASS means the gate went red when it should — the number moved)" : ""}` +
  `${naive || noMirror ? "  (CONTROL RUN: FAIL is the expected and correct answer)" : ""}`);
process.exit(fail === 0 ? 0 : 1);
