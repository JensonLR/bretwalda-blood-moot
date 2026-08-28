#!/usr/bin/env node
// ============================================================
// DEATHCAMTEST — when you die, does anybody watch?
//
//   node tools/deathcamtest.mjs
//   node tools/deathcamtest.mjs --blind    # the client this change replaces
//
// The owner, verbatim:
//
//   "When you die you should be able to see long enough for you body to be
//    stumbling to the floor spraying blood everything before the view moving or
//    changing away from the map, it could move to show best angle of the the
//    severing of the body part / death at point of death."
//
// What shipped is two lines of `GameCanvas.tsx`:
//
//     if (localPlayer && localPlayer.state !== "dead") { focus = him; "follow" }
//     else { focus = (0,0,0); "spectate" }
//
// so on the frame you die the lens is already somewhere else — focus snaps to
// the middle of the arena and `camera.ts`'s spectate orbit lerps a 15 m ring at
// 7.5 m and looks at (0, 1.4, 0). `--blind` is that camera, arithmetic for
// arithmetic off `camera.ts:486` and `:603`, and it is kept permanently as the
// proof of failure: every claim below about the hold fails against it.
//
// WHAT IS REAL HERE AND WHAT IS NOT, said plainly, because a harness that
// oversells its fixtures is how this repository has been wrong eleven times:
//
//   REAL — the engine. `getEngine()` is the same singleton `custom-server.mjs`
//          hands a socket to, driving a real honour duel; the death, its
//          `deathZone`, the killer's position and the round's phases are the
//          server's own and not a mock.
//   REAL — `src/game/deathcam.mjs`. The module under test is the module the
//          renderer imports. There is one definition of where the lens goes.
//   MODELLED — the wound point and the spray axis. In the game they come off
//          `Severance` in `characters.ts` (`cut.wound`, `cut.spray`), which
//          needs a built rig and therefore a browser. Here they are placed at
//          the anatomy of the zone the SERVER reported, along the line the
//          SERVER says the blow came from. That is honest because what is under
//          test is what the camera does GIVEN a wound — not where anim.ts puts
//          one. Claim 9 is the line that stops this from being a fix no player
//          receives.
//   MODELLED — the terrain. A deliberately lumpy height field, because "the
//          lens never goes under the turf" is unfalsifiable on a flat floor.
//
// Every angle below is computed HERE, from `position`, `target` and `fov`.
// Nothing scores itself: `deathcam.mjs` exports no measurement, so a harness
// that agreed with it by construction was never possible.
//
// Exits non-zero if any claim fails.
// ============================================================
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { getEngine } from "../src/game/engine.mjs";
import {
  createDeathCamera, createRoundCamera, frameDeathShot, roundOpening,
  DEATH_HOLD, DEATH_FOV, ROUND_HOLD, ROUND_FOV,
} from "../src/game/deathcam.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const BLIND = has("blind");

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// ---------------------------------------------------------------- geometry
//
// The harness's own trigonometry. A view is a position, a point it is aimed at
// and a vertical field of view; a world point is "in frame" when it falls inside
// the frustum that describes, and "centred" when it falls inside the middle
// fifth of it.
//
// CENTRED IS NOT ENOUGH ON ITS OWN, and the first run of this file proved it.
// The shipped spectate orbit looks at (0, 1.4, 0) from fifteen metres, so a man
// who happens to fall near the middle of the ring is inside the middle fifth of
// that frame for four seconds — and the claim that the shipped client abandons
// you PASSED, against a camera that had run to ten metres and was looking at the
// arena rather than at him. A wound thirty pixels tall is in the picture; it is
// not the subject of it.
//
// So "the subject" is two conditions and the second one is about SIZE: the
// corpse has to fill at least a fifth of the frame's height. A 1.8 m man at
// distance d subtends 2·atan(0.9/d); over the vertical field of view that is the
// fraction of the frame he occupies. At the end of the hold — 2.1 m on a 44°
// lens — he fills the frame. On the shipped orbit at 10.4 m on a 55° lens he
// fills 18% of it, and that is the difference the owner is describing.
const ASPECT = 16 / 9;
const CENTRED = 0.4;
const SUBJECT_SPAN = 0.22;
const BODY_HALF = 0.9;

function frameAngles(pos, target, fovDeg, w) {
  const f = norm(sub(target, pos));
  let right = cross(f, { x: 0, y: 1, z: 0 });
  if (Math.hypot(right.x, right.y, right.z) < 1e-5) right = { x: 1, y: 0, z: 0 };
  right = norm(right);
  const up = cross(right, f);
  const v = sub(w, pos);
  const d = dot(v, f);
  const halfV = (fovDeg * Math.PI) / 360;
  const halfH = Math.atan(Math.tan(halfV) * ASPECT);
  if (d <= 1e-4) return { behind: true, vert: Math.PI, horiz: Math.PI, halfV, halfH, dist: len(v) };
  return {
    behind: false,
    vert: Math.atan2(Math.abs(dot(v, up)), d),
    horiz: Math.atan2(Math.abs(dot(v, right)), d),
    halfV, halfH, dist: len(v),
  };
}
const inFrame = (a) => !a.behind && a.vert < a.halfV && a.horiz < a.halfH;
const isCentred = (a) => !a.behind && a.vert < a.halfV * CENTRED && a.horiz < a.halfH * CENTRED;
/** How much of the frame's height a body at this distance fills, 0..1+. */
const span = (a) => Math.atan(BODY_HALF / Math.max(0.05, a.dist)) / a.halfV;
/** Centred AND big enough to be looked at. The whole definition of "watched". */
const isSubject = (a) => isCentred(a) && span(a) >= SUBJECT_SPAN;

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
const P = (p) => ({ x: p[0], y: p[1], z: p[2] });

// A bank, so "never under the turf" is about something. Peak-to-peak about
// 1.3 m across the ring, which is the shape `grounds.mjs` gives the real one.
const groundAt = (x, z) => 0.34 * Math.sin(x * 0.42) + 0.31 * Math.cos(z * 0.37) - 0.22 * Math.sin((x + z) * 0.19);

// Anatomy of the zones the server can report, as a height above the feet and a
// section radius. Straight out of `docs/GORE-DESIGN.md`'s list.
const ZONE_Y = { head: 1.62, neck: 1.46, armL: 1.30, armR: 1.30, legL: 0.68, legR: 0.68, torso: 1.12, waist: 1.00 };
const SEVERS = new Set(["head", "neck", "armL", "armR", "legL", "legR", "waist"]);

/**
 * One man's modelled wound: his feet on the bank, the cut at the anatomy of the
 * zone the SERVER reported, and the spray leaving along the blade's own line,
 * lifted — `vfx.ts:woundBlood` adds the same +0.4 of up for the same reason.
 *
 * ONE definition, used by both replays below. The round beat's replay is a
 * different viewer watching the same arithmetic; a second copy of it here is
 * exactly the mirrored-definition fault `docs/PROCESS.md` has recorded five
 * times, and it would let the two legs disagree about where a man was opened.
 */
function anatomy(p, killerP, zone) {
  const feet = { x: p.position.x, y: groundAt(p.position.x, p.position.z), z: p.position.z };
  const from = killerP
    ? norm(sub(feet, { x: killerP.position.x, y: feet.y, z: killerP.position.z }))
    : { x: 0, y: 0, z: 1 };
  const wound = {
    x: feet.x + from.x * 0.18,
    y: feet.y + (ZONE_Y[zone] ?? 1.12),
    z: feet.z + from.z * 0.18,
  };
  return { feet, wound, spray: norm({ x: from.x, y: 0.4, z: from.z }) };
}

/**
 * The shipped follow camera, arithmetic for arithmetic off `camera.ts:330-336`
 * — CAM_DIST 4.4, CAM_HEIGHT 2.05, CAM_SIDE 1.0, LOOK_AHEAD 3.6, LOOK_HEIGHT
 * 1.3, FOV_BASE 55. This is what a LIVING man's lens does, and it is the whole
 * of what the winner of a round gets today.
 */
function followShot(feet, yaw) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  return {
    position: [feet.x - fx * 4.4 - fz * 1.0, 2.05, feet.z - fz * 4.4 + fx * 1.0],
    target: [feet.x + fx * 3.6, 1.3, feet.z + fz * 3.6],
    fov: 55, beat: "follow", moved: 0,
  };
}

// ---------------------------------------------------------------- recording
//
// A real honour duel. The harness never sends input, so the bot kills it — which
// is the case under test: the LOCAL player's death.
const engine = getEngine();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function record({ mode = "honour_duel", bots = 1, bestOf = 3 } = {}) {
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
    log.push({ t: Date.now() - t0, type: m.type, room });
    // Far enough past the death to have seen the whole break: the hold is
    // ~3.1 s and ROUND_BREAK is 5 s, so a claim about the hold releasing at the
    // round boundary needs both sides of that boundary in the recording.
    if (room && room.state === "fighting" && (room.roundIndex || 0) >= 2 && done) { done(); done = null; }
  });
  engine.message(sid, { type: "create", data: { name: "Moot", mode, bestOf } });
  for (let i = 0; i < bots; i++) engine.message(sid, { type: "add_bot", data: { difficulty: "jarl" } });
  engine.message(sid, { type: "start", data: {} });
  await Promise.race([settled, sleep(95000)]);
  await sleep(900);
  return { log, sid };
}

const { log } = await record();
/**
 * The FULLEST snapshot, not the first one.
 *
 * This used to be `log.find(r => r.room && r.room.players)`, and the first
 * snapshot a room ever sends is the one taken the instant it is created — before
 * `add_bot` has run. So `ids` was `[the human]`, `killerId` was `undefined`, and
 * every claim below that mentions the killer has been measured with no killer in
 * the scene since the day this file was written: `KILLER_CLEAR`, the whole reason
 * the arc is pushed round, was never once exercised off the recording. It went
 * unnoticed because a missing killer is not an error — `frameDeathShot` simply
 * skips that rotation — so the harness kept printing PASS for a shot nobody was
 * standing in. Twelfth instance of the ruler measuring the wrong quantity, found
 * by needing the same id for something else.
 */
const anyRoom = log.reduce((best, r) => (
  r.room && r.room.players
  && (!best || Object.keys(r.room.players).length > Object.keys(best.room.players).length) ? r : best
), null);
const ids = anyRoom ? Object.keys(anyRoom.room.players) : [];
const localId = ids.find((id) => !anyRoom.room.players[id].isBot) ?? ids[0];
const killerId = ids.find((id) => id !== localId);
const deathAt = log.findIndex((r) => r.room && r.room.players && r.room.players[localId]
  && r.room.players[localId].state === "dead");
check("a real duel was driven and the local warrior was actually killed on it",
  !!localId && deathAt > 0,
  deathAt > 0 ? `he goes down at ${log[deathAt].t}ms, zone "${log[deathAt].room.players[localId].deathZone ?? "torso"}"` : "nobody died");
if (deathAt < 0) { console.log("\nno death to watch; nothing below can be judged"); process.exit(2); }

const deathRoom = log[deathAt].room;
const deathZone = deathRoom.players[localId].deathZone ?? "torso";

// ---------------------------------------------------------------- the replay
//
// One client's frame loop over the recording, from a second before the death to
// well past the round boundary. `blind` runs `camera.ts`'s spectate orbit —
// which is what a dead player gets on main — and everything else is identical.
function replay({ blind = false, zone = deathZone, skipAt = null, fps = 60 } = {}) {
  const dt = 1 / fps;
  const cam = createDeathCamera();
  const frames = [];
  let heldIdx = 0;
  let held = null;
  // Where the follow camera is on the frame he dies. Over-shoulder: 4.4 m back,
  // 2.05 m up — `camera.ts`'s CAM_DIST/CAM_HEIGHT — behind whichever way he was
  // facing when it landed.
  let camPos = { x: 0, y: 2.05, z: 4.4 };
  // The shipped orbit's own state. Copied from `camera.ts:486`.
  let orbitYaw = 0;
  let seeded = false;
  let sever = null;
  let sinceDeath = -1;

  for (let ms = 0; ms <= log[log.length - 1].t + 1; ms += dt * 1000) {
    while (heldIdx < log.length && log[heldIdx].t <= ms) held = log[heldIdx++];
    if (!held || !held.room || !held.room.players) continue;
    const room = held.room;
    const me = room.players[localId];
    const killer = killerId ? room.players[killerId] : null;
    if (!me) continue;
    const dead = me.state === "dead";
    // The round this death belongs to: the fight, the last stand and the break
    // that follows. NOT the countdown — a new round is being dealt there and he
    // is standing up again — and not the match summary.
    const live = room.state === "fighting" || room.state === "last_stand" || room.state === "intermission";

    const { feet, wound, spray } = anatomy(me, killer, zone);
    // The severed piece, thrown along the spray and falling. Only for the zones
    // that take something off; a torso kill has no part and must still hold.
    if (dead && SEVERS.has(zone) && !sever) sever = { t: 0, x: wound.x, y: wound.y, z: wound.z, vx: spray.x * 2.4, vy: 2.2, vz: spray.z * 2.4 };
    if (sever) {
      sever.t += dt;
      sever.vy -= 18.5 * dt;
      sever.x += sever.vx * dt; sever.y += sever.vy * dt; sever.z += sever.vz * dt;
      const g = groundAt(sever.x, sever.z) + 0.12;
      if (sever.y < g) { sever.y = g; sever.vx *= 0.4; sever.vz *= 0.4; sever.vy = 0; }
    }

    if (dead) sinceDeath = sinceDeath < 0 ? 0 : sinceDeath + dt;
    if (!seeded && !dead) {
      // Follow: over the shoulder, behind his facing.
      const yaw = me.rotation || 0;
      camPos = { x: feet.x - Math.sin(yaw) * 4.4, y: feet.y + 2.05, z: feet.z - Math.cos(yaw) * 4.4 };
      orbitYaw = Math.atan2(camPos.x, camPos.z);
    }

    if (skipAt !== null && sinceDeath >= skipAt) cam.skip();

    let shot = null;
    if (blind) {
      // ================= what shipped =================
      // `camera.ts` `orbit(dt, 15, 7.5, 0.22, 0.04, 1.4)` with focus (0,0,0).
      if (dead) {
        orbitYaw += dt * 0.22;
        const tx = Math.sin(orbitYaw) * 15;
        const ty = 7.5;
        const tz = Math.cos(orbitYaw) * 15;
        camPos = { x: camPos.x + (tx - camPos.x) * 0.04, y: camPos.y + (ty - camPos.y) * 0.04, z: camPos.z + (tz - camPos.z) * 0.04 };
        shot = { position: [camPos.x, camPos.y, camPos.z], target: [0, 1.4, 0], fov: 55, beat: "spectate", moved: 0 };
      }
    } else {
      shot = cam.update(dt, {
        dead, live, camera: camPos, body: feet,
        wound: dead ? wound : null,
        spray: dead ? spray : null,
        part: dead && sever ? { x: sever.x, y: sever.y, z: sever.z } : null,
        killer: killer ? { x: killer.position.x, y: killer.position.y, z: killer.position.z } : null,
        groundAt,
      });
      if (shot) camPos = P(shot.position);
    }
    if (!seeded && dead) seeded = true;

    if (dead) {
      frames.push({
        ms, since: sinceDeath, shot, live, state: room.state,
        wound, feet, spray,
        part: sever ? { x: sever.x, y: sever.y, z: sever.z } : null,
      });
    }
  }
  return frames;
}

/** Seconds after death the WOUND stays the subject of the frame, unbroken. */
function heldFor(frames) {
  let last = 0;
  for (const f of frames) {
    if (!f.shot) break;
    const a = frameAngles(P(f.shot.position), P(f.shot.target), f.shot.fov, f.wound);
    if (!isSubject(a)) break;
    last = f.since;
  }
  return last;
}

// ============================================================
// 1. THE DEFECT, on the client this change replaces.
//    Run first and asserted first: a harness that cannot see the bug is not
//    evidence the bug is gone.
// ============================================================
const blindFrames = replay({ blind: true });
const blindHeld = heldFor(blindFrames);
check("THE DEFECT REPRODUCES: on the shipped client the lens leaves the body at once",
  blindHeld < 0.35,
  `the death is the subject of the frame for ${blindHeld.toFixed(2)}s after death, against the `
  + `${DEATH_HOLD.total.toFixed(2)}s this camera asks for. HOW LONG THE COLLAPSE AND THE STUMP RUN IS NOT `
  + `MEASURED IN THIS FILE and no figure for either is quoted here: `
  + `\`node tools/freezetest.mjs --phases=collapse\` is the instrument for the first and vfx.ts's JET_LIFE `
  + `sizes the second. Two figures that used to sit in this sentence — 1.10s and 0.88-1.45s — were both `
  + `numbers the named harness never printed`);
const blindEnd = blindFrames.find((f) => f.since >= 1.0);
check("THE DEFECT IS A RETREAT: the shipped lens is running for the middle of the arena",
  !!blindEnd && frameAngles(P(blindEnd.shot.position), P(blindEnd.shot.target), blindEnd.shot.fov, blindEnd.wound).dist
    > frameAngles(P(blindFrames[0].shot.position), P(blindFrames[0].shot.target), blindFrames[0].shot.fov, blindFrames[0].wound).dist,
  blindEnd
    ? `${frameAngles(P(blindFrames[0].shot.position), P(blindFrames[0].shot.target), 55, blindFrames[0].wound).dist.toFixed(1)}m at death `
      + `→ ${frameAngles(P(blindEnd.shot.position), P(blindEnd.shot.target), 55, blindEnd.wound).dist.toFixed(1)}m a second later`
    : "no frame a second in");

// ============================================================
// 2. THE HOLD. Long enough to watch yourself go down.
// ============================================================
const frames = replay({ blind: BLIND });
const held = heldFor(frames);
check("THE HOLD IS LONG ENOUGH: the wound is the subject for the whole collapse and past it",
  held >= DEATH_HOLD.total - 0.05,
  `${held.toFixed(2)}s held against ${DEATH_HOLD.total.toFixed(2)}s asked for, both measured on this `
  + `recording. WHETHER THAT COVERS THE COLLAPSE IS A DIFFERENT MEASUREMENT AND IT IS NOT TAKEN HERE: `
  + `\`node tools/freezetest.mjs --phases=collapse\` drives the real \`poseWarrior\` over seven kinds of `
  + `death and prints the range, and \`src/game/deathcam.mjs\` records that range beside DEATH_HOLD.fall `
  + `where the constant is set. This file measures the CAMERA`);

const first = frames.find((f) => f.shot);
const preDeath = blindFrames.length ? null : null;
check("NO CUT INTO IT: the first frame of the hold is where the lens already was",
  !!first && first.since <= 1 / 30,
  first ? `hold opens ${(first.since * 1000).toFixed(0)}ms after the death packet` : "no held frame at all");

// ============================================================
// 3. IT FINDS THE ANGLE. Not "near the body" — LOOKING AT THE WOUND, from the
//    side the wound faces. Two independent properties, because a lens buried in
//    the corpse's back satisfies the first and none of the point.
// ============================================================
const endMove = frames.find((f) => f.shot && f.since >= DEATH_HOLD.fall + DEATH_HOLD.move - 0.02);
const aEnd = endMove ? frameAngles(P(endMove.shot.position), P(endMove.shot.target), endMove.shot.fov, endMove.wound) : null;
check("THE WOUND IS THE SUBJECT at the end of the move, not merely in shot",
  !!aEnd && isSubject(aEnd),
  aEnd ? `wound sits ${(aEnd.vert * 57.3).toFixed(1)}° / ${(aEnd.horiz * 57.3).toFixed(1)}° off axis, `
    + `against a middle-fifth budget of ${(aEnd.halfV * CENTRED * 57.3).toFixed(1)}° / ${(aEnd.halfH * CENTRED * 57.3).toFixed(1)}°`
    : "the move never finished");
const sideDot = endMove ? dot(norm(sub(P(endMove.shot.position), endMove.wound)), endMove.spray) : -1;
check("AND IT IS ON THE SIDE THE WOUND FACES, so the severing is toward the lens",
  sideDot > 0.3,
  `cos(lens, spray axis) = ${sideDot.toFixed(2)}; below zero is a shot of his back`);
check("the lens closed in rather than merely swivelling",
  !!endMove && !!first && aEnd.dist < frameAngles(P(first.shot.position), P(first.shot.target), first.shot.fov, first.wound).dist - 0.6,
  endMove && first
    ? `${frameAngles(P(first.shot.position), P(first.shot.target), first.shot.fov, first.wound).dist.toFixed(2)}m → ${aEnd.dist.toFixed(2)}m, `
      + `fov ${DEATH_FOV.from}° → ${endMove.shot.fov.toFixed(0)}°`
    : "no move to measure");

// ============================================================
// 4. THE SEVERED PART. If something came off, it is in the picture while it is
//    still worth looking at. Run over EVERY zone the server can report, because
//    a gate pointed at the one zone this duel happened to produce is a gate that
//    is green because the case is absent.
// ============================================================
const zoneRows = [];
for (const zone of ["head", "neck", "armL", "armR", "legL", "legR", "waist", "torso"]) {
  const fs = replay({ blind: BLIND, zone });
  const h = heldFor(fs);
  const em = fs.find((f) => f.shot && f.since >= DEATH_HOLD.fall + DEATH_HOLD.move - 0.02);
  const a = em ? frameAngles(P(em.shot.position), P(em.shot.target), em.shot.fov, em.wound) : null;
  // The part, half a second in — while it is still near the wound and is the
  // thing the owner asked to be looked at.
  const early = fs.find((f) => f.shot && f.since >= 0.5);
  const pa = early && early.part ? frameAngles(P(early.shot.position), P(early.shot.target), early.shot.fov, early.part) : null;
  const under = fs.filter((f) => f.shot && f.shot.position[1] < groundAt(f.shot.position[0], f.shot.position[2]) + 0.4).length;
  zoneRows.push({ zone, held: h, centred: a ? isCentred(a) : false, part: pa ? inFrame(pa) : null, under });
}
check("EVERY zone the server can report gets the hold, the angle and clear turf",
  zoneRows.every((r) => r.held >= DEATH_HOLD.total - 0.05 && r.centred && r.under === 0),
  zoneRows.map((r) => `${r.zone} ${r.held.toFixed(2)}s${r.centred ? "" : " OFF-AXIS"}${r.under ? ` ${r.under} UNDER TURF` : ""}`).join(", "));
check("the severed part is in frame while it is still near the wound",
  zoneRows.filter((r) => r.part !== null).every((r) => r.part === true),
  zoneRows.map((r) => `${r.zone} ${r.part === null ? "nothing came off" : r.part ? "in frame" : "OUT OF FRAME"}`).join(", "));

// ============================================================
// 5. IT IS INTERRUPTIBLE. "Press anything to skip."
// ============================================================
for (const at of [0.2, 1.0, 2.0]) {
  const fs = replay({ blind: BLIND, skipAt: at });
  const lastHeld = fs.reduce((m, f) => (f.shot ? f.since : m), -1);
  check(`a press at ${at.toFixed(1)}s ends the hold on the next frame`,
    lastHeld >= 0 && lastHeld < at + 2 / 60 + 1e-6,
    `last held frame at ${lastHeld.toFixed(3)}s`);
}

// ============================================================
// 6. IT COSTS THE LIVING NOTHING.
//
//    Three halves, and the third is the one that is about arithmetic rather
//    than intent. The hold must never run once the next round is being dealt;
//    it must end on its own clock; and it must FIT INSIDE THE BREAK THE SERVER
//    ALREADY TAKES. That last number is measured off this recording — the gap
//    between the `round_end` packet and the countdown that follows it — and not
//    read out of `engine.mjs`, because a constant copied into a harness is a
//    constant that stops tracking the thing it was copied from.
// ============================================================
const afterRound = frames.filter((f) => !f.live && f.shot);
check("not one held frame once the next round is being dealt",
  afterRound.length === 0,
  afterRound.length ? `${afterRound.length} frames held into "${afterRound[0].state}"` : "the lens is handed back before the countdown");
const lastHeldFrame = frames.reduce((m, f) => (f.shot ? f : m), null);
check("and it ends on its own clock, never open-ended",
  !!lastHeldFrame && lastHeldFrame.since <= DEATH_HOLD.total + 1 / 30,
  lastHeldFrame ? `longest hold ${lastHeldFrame.since.toFixed(2)}s against a ceiling of ${DEATH_HOLD.total.toFixed(2)}s` : "never held");

const endIdx = log.findIndex((r, i) => i >= deathAt && r.type === "round_end");
const cdIdx = log.findIndex((r, i) => i > (endIdx < 0 ? deathAt : endIdx) && r.room && r.room.state === "countdown");
const breakSec = endIdx >= 0 && cdIdx > endIdx ? (log[cdIdx].t - log[endIdx].t) / 1000 : -1;
check("THE HOLD FITS INSIDE THE BREAK THE SERVER ALREADY TAKES",
  breakSec > 0 && DEATH_HOLD.total < breakSec,
  breakSec > 0
    ? `${DEATH_HOLD.total.toFixed(2)}s of hold inside a ${breakSec.toFixed(2)}s break measured on this run — `
      + `${(breakSec - DEATH_HOLD.total).toFixed(2)}s of slack, so nothing waits on it`
    : "no round break in the recording to measure against");

// ============================================================
// 7. A PUNISHING FRAME RATE. The hold is seconds, not frames: a phone running
//    at 12 fps must get the same hold and must not overshoot it.
// ============================================================
/** The punishing frame rate, and the one the rest of the file replays at. Named so the sentences below cannot drift from the call. */
const SLOW_FPS = 12, FAST_FPS = 60;
const slow = replay({ blind: BLIND, fps: SLOW_FPS });
const slowHeld = heldFor(slow);
check(`the same hold at ${SLOW_FPS} fps as at ${FAST_FPS}`,
  slowHeld >= DEATH_HOLD.total - 1 / 6 && slow.reduce((m, f) => (f.shot ? f.since : m), 0) <= DEATH_HOLD.total + 1 / 6,
  `${slowHeld.toFixed(2)}s held at ${SLOW_FPS} fps against ${held.toFixed(2)}s at ${FAST_FPS}`);

// ============================================================
// 8. THE TURF. `frameDeathShot` hammered directly on the lumpy bank, over a
//    full circle of approach bearings and the whole hold, because a bank the
//    duel never walked onto is a case the replay above cannot reach.
// ============================================================
let worstClear = Infinity;
let offAxis = 0;
let samples = 0;
for (let b = 0; b < 24; b++) {
  const ang = (b / 24) * Math.PI * 2;
  const body = { x: Math.cos(ang) * 7.5, y: 0, z: Math.sin(ang) * 7.5 };
  body.y = groundAt(body.x, body.z);
  const spray = norm({ x: Math.cos(ang * 2.3), y: 0.4, z: Math.sin(ang * 2.3) });
  const wound = { x: body.x, y: body.y + 1.46, z: body.z };
  const from = { x: body.x - Math.cos(ang) * 4.4, y: body.y + 2.05, z: body.z - Math.sin(ang) * 4.4 };
  for (let t = 0; t <= DEATH_HOLD.total; t += 1 / 60) {
    const shot = frameDeathShot({ t, from, body, wound, spray, part: null, killer: null, groundAt });
    const clear = shot.position[1] - groundAt(shot.position[0], shot.position[2]);
    worstClear = Math.min(worstClear, clear);
    const a = frameAngles(P(shot.position), P(shot.target), shot.fov, wound);
    if (!isSubject(a)) offAxis++;
    samples++;
  }
}
check("the lens never goes under the turf, on any bearing, at any point in the hold",
  worstClear >= 0.4,
  `worst clearance ${worstClear.toFixed(2)}m over ${samples} sampled frames`);
check("and the wound stays the subject through the whole swing, on every bearing",
  offAxis === 0,
  `${offAxis} of ${samples} frames put the wound outside the middle fifth`);

// ============================================================
// 9. SOURCE LOCK. Claims 1–8 measure a harness's client. This is the one line
//    that says the GAME's client is wired to the same module — said plainly,
//    because the house rule is not to reason from source and this is the
//    exception that admits it. Without it every claim above could pass against
//    a fix no player ever receives.
// ============================================================
const canvas = readFileSync(resolve(ROOT, "src/game/client/GameCanvas.tsx"), "utf8");
const wired = /@\/game\/deathcam\.mjs/.test(canvas)
  && /createDeathCamera\(\)/.test(canvas)
  && /setSummaryShot\(/.test(canvas)
  && /\.skip\(\)/.test(canvas);
check("GameCanvas.tsx imports this module, runs it, aims the rig with it and binds the skip", wired,
  wired ? "wired" : "the renderer is not on the seam this harness tests");

// ============================================================
// 10. THE ROUND'S FINAL DEATH — the beat NOBODY but the corpse ever saw.
//
// The owner, verbatim, 13 Aug 2026:
//
//   "death camera only shows when you die last, everyone should see death
//    camera for final death winner & all losers."
//
// Everything above measures the lens of the man who DIED. That is the whole of
// what `deathcam.mjs` was asked for and it is why this hole survived a fix, a
// harness and an adversary: the adversary confirmed that `update()` can never
// take a living player's lens and called it correct, which it is, for the
// defect it was built for. Nobody sat in the WINNER'S chair. These claims are
// that chair, and every one of them is measured on the same recording, from a
// different man's eyes.
//
// `blind` here is not a model of an old build — it is the follow camera the
// winner is running RIGHT NOW, `followShot` above, arithmetic for arithmetic off
// camera.ts. It stays permanently as the proof of failure.
// ============================================================

/** The man whose death ended the round, taken off the recording rather than assumed. */
function finalDeathOf(rec) {
  const was = new Map();
  let last = null;
  for (const r of rec.log) {
    if (!r.room || !r.room.players) continue;
    for (const [id, p] of Object.entries(r.room.players)) {
      const dead = p.state === "dead";
      if (dead && was.get(id) === false) last = { id, at: r.t, killer: p.lastHitBy || null, zone: p.deathZone ?? "torso" };
      was.set(id, dead);
    }
    // The tick the round ends IS the tick the last man falls — `checkRoundEnd`
    // runs inside the same step — so the death and the break arrive together and
    // whatever `last` holds when the break opens is the death that ended it.
    if (r.room.state === "intermission" || r.room.state === "finished") return last;
  }
  return last;
}

/**
 * One client's frame loop over a recording, FROM ANY MAN'S CHAIR.
 *
 * `replay` above is the local warrior's, because that is whose death it is. The
 * round beat is everybody's, so the viewer is an argument here — and the winner
 * is the argument that was never passed.
 *
 * Both cameras run, every frame, exactly as `GameCanvas.tsx` runs them, so the
 * precedence rule is measured rather than assumed: whichever one is asked first
 * in the source cannot decide the answer, because `own` is handed to the beat as
 * an input and the beat refuses on it.
 */
function replayBeat(rec, {
  viewerId, victimId, killerId = null, blind = false, zone = "torso",
  skipAt = null, fps = 60, viewerZone = "torso",
} = {}) {
  const { log: rlog } = rec;
  const dt = 1 / fps;
  const beatCam = createRoundCamera();
  const ownCam = createDeathCamera();
  const frames = [];
  let heldIdx = 0;
  let held = null;
  let camPos = { x: 0, y: 2.05, z: 4.4 };
  let orbitYaw = 0;
  let sever = null;
  let sinceEnd = -1;

  for (let ms = 0; ms <= rlog[rlog.length - 1].t + 1; ms += dt * 1000) {
    while (heldIdx < rlog.length && rlog[heldIdx].t <= ms) held = rlog[heldIdx++];
    if (!held || !held.room || !held.room.players) continue;
    const room = held.room;
    const viewer = room.players[viewerId];
    const victim = room.players[victimId];
    if (!viewer || !victim) continue;
    const killer = killerId ? room.players[killerId] : null;

    // The break this death opened. NOT the countdown — the next round is being
    // dealt there — and not the match summary, which stages its own tableau.
    const ended = room.state === "intermission";
    const live = ended;
    // Started by the break and NEVER STOPPED BY IT. The first cut of this only
    // recorded frames while `ended` was true, so "not one frame of the beat runs
    // once the next round is being dealt" was asking a question about frames it
    // had thrown away — green because the case was absent, which is the fault
    // this repository has recorded thirteen times. The recording runs on into
    // the countdown and the next round, and so does this.
    if (ended || sinceEnd >= 0) sinceEnd = sinceEnd < 0 ? 0 : sinceEnd + dt;

    const vic = anatomy(victim, killer, zone);
    const you = anatomy(viewer, viewer.lastHitBy ? room.players[viewer.lastHitBy] : null, viewerZone);

    if (victim.state === "dead" && SEVERS.has(zone) && !sever) {
      sever = { x: vic.wound.x, y: vic.wound.y, z: vic.wound.z, vx: vic.spray.x * 2.4, vy: 2.2, vz: vic.spray.z * 2.4 };
    }
    if (sever) {
      sever.vy -= 18.5 * dt;
      sever.x += sever.vx * dt; sever.y += sever.vy * dt; sever.z += sever.vz * dt;
      const g = groundAt(sever.x, sever.z) + 0.12;
      if (sever.y < g) { sever.y = g; sever.vx *= 0.4; sever.vz *= 0.4; sever.vy = 0; }
    }

    const viewerDead = viewer.state === "dead";
    // Where the lens sits with no camera holding it: the follow rig on his own
    // shoulders while he is up, and the shipped spectate orbit once he is not.
    let natural;
    if (!viewerDead) {
      natural = followShot(you.feet, viewer.rotation || 0);
      camPos = P(natural.position);
      orbitYaw = Math.atan2(camPos.x, camPos.z);
    } else {
      orbitYaw += dt * 0.22;
      const tx = Math.sin(orbitYaw) * 15;
      const tz = Math.cos(orbitYaw) * 15;
      camPos = { x: camPos.x + (tx - camPos.x) * 0.04, y: camPos.y + (7.5 - camPos.y) * 0.04, z: camPos.z + (tz - camPos.z) * 0.04 };
      natural = { position: [camPos.x, camPos.y, camPos.z], target: [0, 1.4, 0], fov: 55, beat: "spectate", moved: 0 };
    }

    if (skipAt !== null && sinceEnd >= skipAt) { beatCam.skip(); ownCam.skip(); }

    // The viewer's OWN death hold, which is what the beat has to give way to.
    const ownShot = ownCam.update(dt, {
      dead: viewerDead,
      live: room.state === "fighting" || room.state === "last_stand" || room.state === "intermission",
      camera: camPos, body: you.feet,
      wound: viewerDead ? you.wound : null,
      spray: viewerDead ? you.spray : null,
      part: null,
      killer: viewer.lastHitBy && room.players[viewer.lastHitBy] ? room.players[viewer.lastHitBy].position : null,
      groundAt,
    });

    const beatShot = blind ? null : beatCam.update(dt, {
      ended, live, own: !!ownShot,
      body: victim.state === "dead" ? vic.feet : null,
      wound: victim.state === "dead" ? vic.wound : null,
      spray: victim.state === "dead" ? vic.spray : null,
      part: sever ? { x: sever.x, y: sever.y, z: sever.z } : null,
      killer: killer ? killer.position : null,
      camera: camPos,
      groundAt,
    });

    const shot = ownShot ?? beatShot ?? natural;
    camPos = P(shot.position);

    if (sinceEnd >= 0) {
      frames.push({
        ms, since: sinceEnd, state: room.state,
        shot, beat: beatShot, own: ownShot,
        wound: vic.wound, feet: vic.feet, spray: vic.spray,
      });
    }
  }
  return frames;
}

/** Seconds after the round ended that the FINAL DEATH is the subject of this man's frame. */
function watchedFor(frames) {
  let last = 0;
  for (const f of frames) {
    const a = frameAngles(P(f.shot.position), P(f.shot.target), f.shot.fov, f.wound);
    if (!isSubject(a)) break;
    last = f.since;
  }
  return last;
}

const duel = { log };
const fell = finalDeathOf(duel);
check("the recording contains a round that ENDED, and the man who ended it is known",
  !!fell && !!log.find((r) => r.room && r.room.state === "intermission"),
  fell ? `${fell.id === localId ? "the local warrior" : "the bot"} fell last at ${fell.at}ms, zone "${fell.zone}"` : "no round end in the recording");

const winnerId = fell && fell.id === localId ? killerId : localId;

/** Which side of the wound the lens is on. Positive is the side the blood leaves by. */
const sideOf = (f) => dot(norm(sub(P(f.shot.position), f.wound)), f.spray);
/** Metres from the lens to the wound. */
const distOf = (f) => frameAngles(P(f.shot.position), P(f.shot.target), f.shot.fov, f.wound).dist;
const atSince = (fs, s) => fs.find((f) => f.since >= s) ?? fs[fs.length - 1] ?? null;

const blindWin = replayBeat(duel, { viewerId: winnerId, victimId: fell.id, killerId: fell.killer, blind: true, zone: fell.zone });
const blindWatched = watchedFor(blindWin);
const blindStart = blindWin.length ? blindWin[0] : null;
const blindWinEnd = atSince(blindWin, ROUND_HOLD.total - 0.02);

// THE FIRST CUT OF THIS CLAIM WAS THE REPOSITORY'S OWN FAULT AGAIN, and it is
// left recorded here rather than quietly fixed. It asserted that on the shipped
// client the dying man is not the SUBJECT of the winner's frame — and it went
// green-side-up, because in an honour duel the winner has just killed a man at
// arm's length and his follow camera looks 3.6 m past his own shoulder, so the
// corpse sits dead centre at 5.8 m and fills a third of the frame. "In shot" was
// never the question. The comment at the head of this file already said so about
// the SPECTATE orbit and the lesson did not carry across ten metres of code.
//
// What the winner is actually denied is the thing this module exists for: the
// camera that GOES TO THE WOUND. Two properties the follow camera cannot have,
// neither of them a threshold anybody can slide:
//
//   IT IS ON THE WRONG SIDE. The spray leaves along the blade's line, AWAY from
//   the man who swung — so the winner, standing where he swung from, is looking
//   at the victim's back by construction. `cos(lens, spray)` is about -1 for him
//   and `KILLER_CLEAR` exists in `frameDeathShot` precisely to get the lens off
//   that line.
//   IT NEVER CLOSES. A death camera goes in. The follow camera stays 4.4 m
//   behind the man holding it, whatever is happening in front of him.
check("THE DEFECT REPRODUCES: the winner is left standing where he swung from, looking at the victim's BACK",
  !!blindWinEnd && sideOf(blindWinEnd) < 0,
  blindWinEnd
    ? `cos(lens, spray axis) = ${sideOf(blindWinEnd).toFixed(2)} on the shipped client — below zero is a shot of his back. `
      + `Reported and not hidden: the corpse is incidentally inside his frame for ${blindWatched.toFixed(2)}s of the break `
      + `because a duel ends at arm's length, which is exactly why "is it in shot" was the wrong question`
    : "no frame of the break to measure");
check("AND THE DEFECT IS A LENS THAT NEVER MOVES: the shipped winner's camera does not close on the death",
  !!blindStart && !!blindWinEnd && distOf(blindWinEnd) > distOf(blindStart) - 1.0,
  blindStart && blindWinEnd
    ? `${distOf(blindStart).toFixed(2)}m at the killing blow → ${distOf(blindWinEnd).toFixed(2)}m ${ROUND_HOLD.total.toFixed(2)}s later; `
      + `it is over his own shoulder the whole way`
    : "no frames to measure");

const win = replayBeat(duel, { viewerId: winnerId, victimId: fell.id, killerId: fell.killer, zone: fell.zone });
const watched = watchedFor(win);
const beatEnd = atSince(win, ROUND_HOLD.fall + ROUND_HOLD.move - 0.02);
check("THE WINNER WATCHES IT: the final death is the subject of his frame for the whole beat",
  watched >= ROUND_HOLD.total - 0.05,
  `${watched.toFixed(2)}s watched against ${ROUND_HOLD.total.toFixed(2)}s asked for`);
check("AND HE IS PUT ON THE SIDE THE WOUND FACES, which is the side he was NOT standing on",
  !!beatEnd && sideOf(beatEnd) > 0.3,
  beatEnd
    ? `cos(lens, spray axis) = ${sideOf(beatEnd).toFixed(2)} at the end of the move, against `
      + `${blindWinEnd ? sideOf(blindWinEnd).toFixed(2) : "?"} on his own shoulder`
    : "the move never finished");

// ============================================================
// 11. IT CUTS, and that is the difference between the two cameras.
//     Your own death opens where your lens already was, because a cut there
//     throws away the thing you are trying to read. This one opens ON THE BODY,
//     because the viewer was fighting somebody else twenty metres away and a
//     two-second dolly across the arena arrives after it is over.
// ============================================================
const firstBeat = win.find((f) => f.beat);
const aFirst = firstBeat ? frameAngles(P(firstBeat.shot.position), P(firstBeat.shot.target), firstBeat.shot.fov, firstBeat.wound) : null;
check("THE CUT LANDS ON THE BODY: the beat's FIRST frame already has the death as its subject",
  !!aFirst && isSubject(aFirst),
  aFirst
    ? `opening frame sits ${aFirst.dist.toFixed(2)}m out with the wound `
      + `${(aFirst.vert * 57.3).toFixed(1)}°/${(aFirst.horiz * 57.3).toFixed(1)}° off axis, against the `
      + `${blindWin.length ? frameAngles(P(blindWin[0].shot.position), P(blindWin[0].shot.target), blindWin[0].shot.fov, blindWin[0].wound).dist.toFixed(1) : "?"}m `
      + `the winner's own lens was at`
    : "the beat never opened");
const aLastBeat = (() => {
  const f = win.filter((x) => x.beat).pop();
  return f ? frameAngles(P(f.shot.position), P(f.shot.target), f.shot.fov, f.wound) : null;
})();
check("and it closes in from there rather than sitting at the cut",
  !!aFirst && !!aLastBeat && aLastBeat.dist < aFirst.dist - 1.5,
  aFirst && aLastBeat ? `${aFirst.dist.toFixed(2)}m → ${aLastBeat.dist.toFixed(2)}m, fov ${ROUND_FOV.from}° → ${ROUND_FOV.to}°` : "no move to measure");

// ============================================================
// 12. THE CLOCK IS A PARAMETER, NOT A COPY. `frameDeathShot` is one definition
//     of the geometry and both cameras drive it; the levers that make them
//     different cameras are `hold` and `fov`, and this is R1 on both of them —
//     move the lever, watch the number move. A second copy of the arithmetic
//     that had drifted would show up here as two identical answers.
//
//     THIS CLAIM WAS REWRITTEN, AND THE REASON IS WORTH MORE THAN THE CLAIM.
//
//     The first cut of it probed ONE instant, `t = 1.6 s`, and asserted a
//     consequence of the constants that happened to hold there: the death hold
//     in "move" while the round beat was already in "linger", with the round's
//     `moved` more than 0.2 ahead. That was true when `ROUND_HOLD.fall` was
//     0.45 s against `DEATH_HOLD.fall` 1.25 s — a whole beat apart — and it is
//     true at no time at all now that they are 1.45 and 1.50.
//
//     THE CONVERGENCE IS NOT THE DEFECT. Both `fall` beats are the beat during
//     which the lens does not move, and both are sized against ONE physical
//     fact: how long the man takes to land. `tools/freezetest.mjs --phases=collapse`
//     drives the real `poseWarrior` over seven kinds of death and prints that
//     range; NO FIGURE FOR IT IS QUOTED HERE, because this file has now been
//     caught quoting two different wrong ones — "0.88-1.45 s" on this line and
//     "the collapse settles at 1.10s" at claim 2 — against a harness that prints
//     neither. The range that sized the constants is recorded where the
//     constants are, in `src/game/deathcam.mjs` beside `DEATH_HOLD.fall`, and it
//     is a QUOTATION there too and says so.
//     Two beats measured against one collapse are supposed to land in the same
//     place, and it would be the defect if they did not — the shorter of them
//     would be starting its dolly over a body still falling, which is precisely
//     the 7/7 failure that moved `ROUND_HOLD.fall` off 0.45 in the first place.
//     What makes these two different cameras was never the length of the still:
//     it is where the shot OPENS (claims 9 and 11 — your own death opens where
//     your lens already was, the round beat CUTS to 5.4 m and 2.5 m up), the
//     lens (55->44 against 50->42, two bands that never touch), the length of
//     the move (1.15 s against 0.90 s) and the total (3.35 s against 2.95 s,
//     because the round beat lives inside a window `page.tsx` already holds and
//     your own death does not).
//
//     SO THE DEFECT WAS THE INSTANT, and picking a better instant would be the
//     same defect with a different literal in it — the discriminating instant is
//     a function of the constants, so a harness that hard-codes one is a harness
//     that has to be re-tuned every time the camera is. That is the fault
//     `freezetest.mjs` was caught printing 15 s / 20 s / 27 s for.
//
//     What replaces it does not pick an instant and does not carry a bar under a
//     measured number. It SWEEPS each clock and reads that clock's own
//     boundaries back out of the geometry — the frame the lens starts moving on,
//     the frame it stops, the field of view at each end — and requires each
//     measurement to land on what the clock handed in PREDICTS. Ignore `hold`
//     and the round's still would measure 1.50 s instead of its own 1.45 and its
//     move would end 0.30 s late; ignore `fov` and the round would open at 55
//     degrees instead of its own 50. Either is red, and neither needs a taste.
//     The 4x lever is kept as it was, because a clock stretched a long way is
//     the cheap guard `beardvolume` did not have.
// ============================================================
const leverBody = { x: 0, y: 0, z: 0 };
const leverArgs = { body: leverBody, wound: { x: 0, y: 1.46, z: 0 }, spray: { x: 1, y: 0.4, z: 0 }, from: { x: 0, y: 2.05, z: 4.4 } };
const LEVER_T = 1.6;
// A stretched clock, to prove the parameter is READ rather than merely accepted.
// `beardvolume` gated on a p10 that doubling `cut.thick` left untouched; the
// cheap guard against that is to move the lever a long way and watch.
const STRETCH = 4;
const stretched = { fall: ROUND_HOLD.fall * STRETCH, move: ROUND_HOLD.move * STRETCH, linger: ROUND_HOLD.linger * STRETCH };
stretched.total = stretched.fall + stretched.move + stretched.linger;
const atStretched = frameDeathShot({ ...leverArgs, t: LEVER_T, hold: stretched, fov: ROUND_FOV });

/**
 * Sweep one clock and read ITS OWN boundaries back out of the returned frames.
 * Nothing here is told what to expect; the caller compares against the clock.
 * `STEP` is the grid, and it is also the tolerance — the only slack in this
 * claim is "which sample did the transition land between", not a margin.
 */
const LEVER_STEP = 0.005;
const sweepClock = (hold, fov) => {
  const out = { moveStarts: null, moveEnds: null, fovFrom: null, fovAtEnd: null, frames: [] };
  const last = Math.round((hold.total + 0.5) / LEVER_STEP);
  for (let i = 0; i <= last; i++) {
    const t = i * LEVER_STEP;
    const f = frameDeathShot({ ...leverArgs, t, hold, fov });
    out.frames.push({ t, beat: f.beat, moved: f.moved, fov: f.fov });
    if (i === 0) out.fovFrom = f.fov;
    if (out.moveStarts === null && f.moved > 0) out.moveStarts = t;
    if (out.moveEnds === null && f.moved >= 1) { out.moveEnds = t; out.fovAtEnd = f.fov; }
  }
  return out;
};
const swDeath = sweepClock(DEATH_HOLD, DEATH_FOV);
const swRound = sweepClock(ROUND_HOLD, ROUND_FOV);
const swStretch = sweepClock(stretched, ROUND_FOV);
/** How far a swept boundary sits from the boundary its own clock declares. */
const boundaryErr = (sw, hold) => Math.max(
  Math.abs((sw.moveStarts ?? Infinity) - hold.fall),
  Math.abs((sw.moveEnds ?? Infinity) - (hold.fall + hold.move)),
);
const errDeath = boundaryErr(swDeath, DEATH_HOLD);
const errRound = boundaryErr(swRound, ROUND_HOLD);
const errStretch = boundaryErr(swStretch, stretched);
const readsHold = Math.max(errDeath, errRound, errStretch) <= LEVER_STEP * 1.5;
const readsFov = Math.abs(swDeath.fovFrom - DEATH_FOV.from) < 1e-9
  && Math.abs(swDeath.fovAtEnd - DEATH_FOV.to) < 1e-9
  && Math.abs(swRound.fovFrom - ROUND_FOV.from) < 1e-9
  && Math.abs(swRound.fovAtEnd - ROUND_FOV.to) < 1e-9;
check("BOTH LEVERS ARE READ: each clock's own boundaries fall out of the geometry, and each lens's own band does",
  readsHold && readsFov,
  `the still ends at ${swDeath.moveStarts.toFixed(3)}s / ${swRound.moveStarts.toFixed(3)}s / ${swStretch.moveStarts.toFixed(3)}s `
  + `against the ${DEATH_HOLD.fall} / ${ROUND_HOLD.fall} / ${stretched.fall.toFixed(2)} handed in, and the move ends at `
  + `${swDeath.moveEnds.toFixed(3)}s / ${swRound.moveEnds.toFixed(3)}s / ${swStretch.moveEnds.toFixed(3)}s against `
  + `${(DEATH_HOLD.fall + DEATH_HOLD.move).toFixed(2)} / ${(ROUND_HOLD.fall + ROUND_HOLD.move).toFixed(2)} / `
  + `${(stretched.fall + stretched.move).toFixed(2)} — worst miss ${Math.max(errDeath, errRound, errStretch).toFixed(4)}s on a `
  + `${LEVER_STEP}s grid; the lens opens at ${swDeath.fovFrom.toFixed(1)}°/${swRound.fovFrom.toFixed(1)}° and closes to `
  + `${swDeath.fovAtEnd.toFixed(1)}°/${swRound.fovAtEnd.toFixed(1)}°`);

// The two shipped clocks, held against each other rather than against an
// instant. The round beat is the shorter shot and must be AHEAD of the death
// hold everywhere and strictly ahead somewhere; the two lenses must not overlap.
const pairs = swRound.frames.map((r, i) => ({ t: r.t, r, d: swDeath.frames[i] })).filter((p) => p.d);
const everAhead = pairs.filter((p) => p.r.moved > p.d.moved + 1e-9);
const everBehind = pairs.filter((p) => p.r.moved < p.d.moved - 1e-9);
const beatsDiffer = pairs.filter((p) => p.r.beat !== p.d.beat);
const fovOverlap = pairs.filter((p) => p.r.fov >= p.d.fov);
const gapMax = pairs.reduce((m, p) => Math.max(m, p.r.moved - p.d.moved), 0);
const gapAt = pairs.reduce((b, p) => (p.r.moved - p.d.moved > b.r.moved - b.d.moved ? p : b), pairs[0]);
check("AND THEY ARE STILL TWO CAMERAS: the round beat runs ahead of the death hold throughout and finishes first, on two lenses that never meet",
  everAhead.length > 0 && everBehind.length === 0 && beatsDiffer.length > 0
  && fovOverlap.length === 0
  && swRound.moveEnds < swDeath.moveEnds - 0.2
  && ROUND_HOLD.total < DEATH_HOLD.total - 0.2
  && atStretched.beat === "fall" && atStretched.moved === 0,
  `the round beat is ahead on ${everAhead.length} of ${pairs.length} swept frames and behind on ${everBehind.length}, `
  + `by at most ${gapMax.toFixed(3)} of the move at t=${gapAt.t.toFixed(3)}s; they sit in different beats for `
  + `${(beatsDiffer.length * LEVER_STEP).toFixed(2)}s (${beatsDiffer[0] ? beatsDiffer[0].t.toFixed(2) : "?"}-`
  + `${beatsDiffer.length ? beatsDiffer[beatsDiffer.length - 1].t.toFixed(2) : "?"}s); the round's move is done at `
  + `${swRound.moveEnds.toFixed(2)}s against ${swDeath.moveEnds.toFixed(2)}s and the whole beat at `
  + `${ROUND_HOLD.total.toFixed(2)}s against ${DEATH_HOLD.total.toFixed(2)}s; the round lens is tighter on `
  + `${pairs.length - fovOverlap.length} of ${pairs.length} frames; and a clock stretched ${STRETCH}x is still in "${atStretched.beat}" (moved `
  + `${atStretched.moved.toFixed(2)}) at t=${LEVER_T.toFixed(2)}s. `
  + `NOT ASSERTED, AND SAID SO: the two 'moved' curves are only ${gapMax.toFixed(2)} apart at their widest, because `
  + `the two stills are now within ${Math.abs(DEATH_HOLD.fall - ROUND_HOLD.fall).toFixed(2)}s of each other by measurement and not by accident — the old form of this `
  + `claim asked for 0.2 at a hard-coded t=${LEVER_T.toFixed(2)}s and that is why it went red`);

// ============================================================
// 13. EVERY LOSER WATCHES IT TOO — and the man who was inside his OWN death
//     camera when the round ended keeps it.
//
//     This needs a moot rather than a duel: in an honour duel there are two men,
//     so "a loser who is not the final death" does not exist and a claim about
//     him would be GREEN BECAUSE THE CASE IS ABSENT. So a second real recording,
//     four men in a blood moot, where somebody falls early and somebody falls
//     last.
// ============================================================
const mootRec = await record({ mode: "blood_moot", bots: 3, bestOf: 3 });
const mootLog = mootRec.log;
// The fullest snapshot, for the reason recorded above `anyRoom`.
const mootAny = mootLog.reduce((best, r) => (
  r.room && r.room.players
  && (!best || Object.keys(r.room.players).length > Object.keys(best.room.players).length) ? r : best
), null);
const mootIds = mootAny ? Object.keys(mootAny.room.players) : [];
const mootFell = finalDeathOf({ log: mootLog });
/** Everyone who was already down BEFORE the man who fell last. */
const earlyDead = (() => {
  const endIdx = mootLog.findIndex((r) => r.room && r.room.state === "intermission");
  if (endIdx < 0 || !mootFell) return [];
  const at = mootLog[endIdx].room.players;
  return mootIds.filter((id) => id !== mootFell.id && at[id] && at[id].state === "dead");
})();
const mootWinner = (() => {
  const endIdx = mootLog.findIndex((r) => r.room && r.room.state === "intermission");
  if (endIdx < 0) return null;
  const at = mootLog[endIdx].room.players;
  return mootIds.find((id) => at[id] && at[id].state !== "dead") ?? null;
})();
check("a real four-man moot was driven, with a round that ended on somebody and men already down",
  !!mootFell && earlyDead.length >= 1 && !!mootWinner,
  mootFell
    ? `${mootIds.length} men; ${earlyDead.length} already down when ${mootFell.id.slice(0, 10)} fell last, `
      + `${mootWinner ? mootWinner.slice(0, 10) : "nobody"} left standing`
    : "no round end in the moot recording");

if (mootFell && mootWinner) {
  const mootDuel = { log: mootLog };
  // The winner of the moot, on the shipped client and on this one. The duel
  // flatters the shipped camera — the corpse is at arm's length — and the moot
  // is the honest general case, so both numbers are printed side by side.
  const mBlind = replayBeat(mootDuel, { viewerId: mootWinner, victimId: mootFell.id, killerId: mootFell.killer, zone: mootFell.zone, blind: true });
  const mBlindEnd = atSince(mBlind, ROUND_HOLD.total - 0.02);
  const mWin = replayBeat(mootDuel, { viewerId: mootWinner, victimId: mootFell.id, killerId: mootFell.killer, zone: mootFell.zone });
  const mEnd = atSince(mWin, ROUND_HOLD.total - 0.02);
  check("in a four-man moot the WINNER watches the final death as well",
    watchedFor(mWin) >= ROUND_HOLD.total - 0.05,
    `${watchedFor(mWin).toFixed(2)}s watched against ${ROUND_HOLD.total.toFixed(2)}s; his lens ends `
    + `${mEnd ? distOf(mEnd).toFixed(2) : "?"}m from the wound where the shipped client leaves it `
    + `${mBlindEnd ? distOf(mBlindEnd).toFixed(2) : "?"}m away at cos(lens, spray) `
    + `${mBlindEnd ? sideOf(mBlindEnd).toFixed(2) : "?"}`);

  // Every loser who is not the final death and whose own hold is long over.
  const loserRows = earlyDead.map((id) => {
    const fs = replayBeat(mootDuel, { viewerId: id, victimId: mootFell.id, killerId: mootFell.killer, zone: mootFell.zone });
    return { id, watched: watchedFor(fs), own: fs.some((f) => f.own) };
  });
  check("and so does EVERY loser who is not himself the final death",
    loserRows.length > 0 && loserRows.every((r) => r.own || r.watched >= ROUND_HOLD.total - 0.05),
    loserRows.map((r) => `${r.id.slice(0, 10)} ${r.watched.toFixed(2)}s${r.own ? " (still inside his own hold — see precedence)" : ""}`).join(", "));

  // PRECEDENCE, driven rather than argued: the man who IS the final death was
  // inside his own hold the instant the round ended, by construction.
  const victimSelf = replayBeat(mootDuel, { viewerId: mootFell.id, victimId: mootFell.id, killerId: mootFell.killer, zone: mootFell.zone, viewerZone: mootFell.zone });
  const bothAtOnce = victimSelf.filter((f) => f.own && f.beat).length;
  const ownRan = victimSelf.filter((f) => f.own).length;
  const beatRan = victimSelf.filter((f) => f.beat).length;
  check("PRECEDENCE: the man already inside his own death camera keeps it, and the beat never arms for him — not then, and not after",
    ownRan > 0 && beatRan === 0 && bothAtOnce === 0,
    `his own hold ran for ${ownRan} frames of the break; the round beat took ${beatRan} of them, `
    + `and no frame had two cameras on the lens`);
}

// ============================================================
// 14. IT IS INTERRUPTIBLE, AND IT COSTS THE LIVING NOTHING.
//     Three halves again, and the third is arithmetic rather than intent: the
//     beat has to FIT INSIDE THE BREAK THE SERVER ALREADY TAKES, measured off
//     this recording rather than read out of engine.mjs.
// ============================================================
for (const at of [0.2, 1.0]) {
  const fs = replayBeat(duel, { viewerId: winnerId, victimId: fell.id, killerId: fell.killer, zone: fell.zone, skipAt: at });
  const lastHeld = fs.reduce((m, f) => (f.beat ? f.since : m), -1);
  check(`a press at ${at.toFixed(1)}s into the beat ends it on the next frame`,
    lastHeld >= 0 && lastHeld < at + 2 / 60 + 1e-6,
    `last held frame at ${lastHeld.toFixed(3)}s`);
}
const afterBreak = win.filter((f) => f.state !== "intermission" && f.beat);
check("not one frame of the beat runs once the next round is being dealt",
  afterBreak.length === 0,
  afterBreak.length ? `${afterBreak.length} frames held into "${afterBreak[0].state}"` : "the lens is handed back before the countdown");
const lastBeatFrame = win.reduce((m, f) => (f.beat ? f : m), null);
check("and the beat ends on its own clock, never open-ended",
  !!lastBeatFrame && lastBeatFrame.since <= ROUND_HOLD.total + 1 / 30,
  lastBeatFrame ? `longest beat ${lastBeatFrame.since.toFixed(2)}s against a ceiling of ${ROUND_HOLD.total.toFixed(2)}s` : "never held");
check("THE BEAT FITS INSIDE THE BREAK THE SERVER ALREADY TAKES, so the next round waits on nothing",
  breakSec > 0 && ROUND_HOLD.total < breakSec,
  breakSec > 0
    ? `${ROUND_HOLD.total.toFixed(2)}s of beat inside the ${breakSec.toFixed(2)}s break measured on this run — `
      + `${(breakSec - ROUND_HOLD.total).toFixed(2)}s of slack. The server set nextRoundAt before this armed and the beat sends nothing.`
    : "no round break in the recording to measure against");
const slowBeat = replayBeat(duel, { viewerId: winnerId, victimId: fell.id, killerId: fell.killer, zone: fell.zone, fps: SLOW_FPS });
check(`the same beat at ${SLOW_FPS} fps as at ${FAST_FPS}`,
  watchedFor(slowBeat) >= ROUND_HOLD.total - 1 / 6
  && slowBeat.reduce((m, f) => (f.beat ? f.since : m), 0) <= ROUND_HOLD.total + 1 / 6,
  `${watchedFor(slowBeat).toFixed(2)}s watched at ${SLOW_FPS} fps against ${watched.toFixed(2)}s at ${FAST_FPS}`);

// ============================================================
// 15. THE CUT, HAMMERED. `roundOpening` over a full circle of spray bearings,
//     over the lumpy bank, and over the three cases its fallback chain exists
//     for — a spray with a horizontal opinion, a vertical spray with a killer,
//     and a man the ARENA killed, who has neither. A gate that only ever saw a
//     sword kill would be green because two thirds of the cases are absent.
// ============================================================
let openUnder = 0;
let openOff = 0;
/** `KILLER_CLEAR` in deathcam.mjs. Quoted, because the module does not export it. */
const KILLER_CLEAR_BAR = 0.62;
let openThroughWinner = 0;
let openKillerSamples = 0;
let openWorstK = null;
let openWorstCase = "";
let openSamples = 0;
const openCases = [];
for (let b = 0; b < 24; b++) {
  const ang = (b / 24) * Math.PI * 2;
  const body = { x: Math.cos(ang) * 7.5, y: 0, z: Math.sin(ang) * 7.5 };
  body.y = groundAt(body.x, body.z);
  const wound = { x: body.x, y: body.y + 1.46, z: body.z };
  const killer = { x: body.x + Math.cos(ang * 1.7) * 1.6, y: body.y, z: body.z + Math.sin(ang * 1.7) * 1.6 };
  const viewer = { x: Math.cos(ang * 3.1) * 14, y: 2.05, z: Math.sin(ang * 3.1) * 14 };
  for (const kind of ["spray", "vertical", "arena"]) {
    const spray = kind === "spray" ? norm({ x: Math.cos(ang * 2.3), y: 0.4, z: Math.sin(ang * 2.3) })
      : kind === "vertical" ? { x: 0, y: 1, z: 0 } : null;
    const from = roundOpening({
      wound, spray,
      killer: kind === "arena" ? null : killer,
      from: viewer, groundAt,
    });
    const openDist = Math.hypot(from.x - wound.x, from.z - wound.z);
    for (let t = 0; t <= ROUND_HOLD.total; t += 1 / 60) {
      const shot = frameDeathShot({ t, from, body, wound, spray, part: null, killer: kind === "arena" ? null : killer, groundAt, hold: ROUND_HOLD, fov: ROUND_FOV });
      if (shot.position[1] < groundAt(shot.position[0], shot.position[2]) + 0.4) openUnder++;
      const a = frameAngles(P(shot.position), P(shot.target), shot.fov, wound);
      if (!isSubject(a)) openOff++;
      openSamples++;
    }
    // THE WINNER IS NOT IN THE WAY — the owner's third report: "Camera angles
    // for final kill cams are sometimes blocked by back of the winner of
    // round." The opening eye sits at `wound + bearing * radius`, so a bearing
    // pointing at the killer composes the shot straight through him — and after
    // a killing blow he is always nearer than that radius. Measured as the
    // angle between the opening bearing and the killer's own: inside
    // KILLER_CLEAR is the lens looking down his back.
    if (kind !== "arena") {
      const obx = (from.x - wound.x) / (openDist || 1);
      const obz = (from.z - wound.z) / (openDist || 1);
      const kdx = killer.x - wound.x;
      const kdz = killer.z - wound.z;
      const klen = Math.hypot(kdx, kdz) || 1;
      const dotK = Math.max(-1, Math.min(1, obx * (kdx / klen) + obz * (kdz / klen)));
      const offK = Math.acos(dotK);
      openKillerSamples++;
      // Epsilon: a swung bearing lands EXACTLY on the bar, and acos of a
      // dot product does not return exactly the angle that produced it.
      if (offK < KILLER_CLEAR_BAR - 1e-6) {
        openThroughWinner++;
        if (openWorstK === null || offK < openWorstK) { openWorstK = offK; openWorstCase = `${kind}@${b}`; }
      }
    }
    if (b === 0) openCases.push(`${kind} opens ${openDist.toFixed(2)}m out`);
  }
}
check("the beat's lens never goes under the turf, on any bearing, in any of the three cases the cut has",
  openUnder === 0,
  `${openUnder} of ${openSamples} sampled frames under the bank (${openCases.join(", ")})`);
check("and the final death is the subject from the cut to the end, on every bearing and in every case",
  openOff === 0,
  `${openOff} of ${openSamples} frames put the wound outside the middle fifth`);
check("and the beat never opens down the winner's back — the owner's third report",
  openThroughWinner === 0,
  openThroughWinner === 0
    ? `${openKillerSamples} openings, every one clear of the killer by at least ${(KILLER_CLEAR_BAR * 180 / Math.PI).toFixed(0)} deg`
    : `${openThroughWinner} of ${openKillerSamples} openings look through him — worst `
      + `${((openWorstK ?? 0) * 180 / Math.PI).toFixed(1)} deg off his bearing at ${openWorstCase}`);

// ============================================================
// 16. SOURCE LOCK for the beat, same argument as claim 9.
// ============================================================
const beatWired = /createRoundCamera/.test(canvas)
  && /roundCamRef/.test(canvas)
  && /roundCamRef\.current\.skip\(\)/.test(canvas);
check("GameCanvas.tsx imports the round camera, runs it and binds the same skip", beatWired,
  beatWired ? "wired" : "the renderer is not on the seam these claims test");

// ============================================================
// 17. THE ONE MIRRORED CONSTANT, GATED RATHER THAN TRUSTED.
//
//     `src/app/page.tsx` holds the round-end screen for `ROUND_HOLD_MS` — for
//     that long after a round ends, `RoundBreak` draws a verdict line and the
//     victor's flourish row over the LIVE ARENA, and only then does the opaque
//     break card come down. That window was already open and pointed at
//     nothing: the presentation half of BACKLOG 2.6 shipped showing you the
//     arena while the arena showed you the lobby orbit. The beat is the length
//     of that window, on purpose.
//
//     The two constants are NOT wired together, because `page.tsx` belongs to
//     another unit. That makes them the mirrored-definition fault this
//     repository has recorded five times in one file, sitting one edit away —
//     so it is not left to a comment. This reads the number out of that file.
// ============================================================
const pageSrc = readFileSync(resolve(ROOT, "src/app/page.tsx"), "utf8");
const canvasSrc = readFileSync(resolve(ROOT, "src/game/client/GameCanvas.tsx"), "utf8");
const { REPLAY } = await import(pathToFileURL(resolve(ROOT, "src/game/replay.mjs")).href);

// THE CLAIM THIS REPLACES ASKED FOR EQUALITY WITH THE WRONG CONSTANT, and it
// went red the moment the window it guards stopped being the round beat's.
//
// It was: `ROUND_HOLD_MS / 1000 === ROUND_HOLD.total`, both 2.95, "two
// declarations of one number and nothing in the code makes them agree". That
// was right while the beat WAS the window. The round break now carries the
// slow-motion replay (`src/game/replay.mjs`), the window is `REPLAY.wall`, and
// the beat plays inside it rather than filling it.
//
// So the equality does not go away, it MOVES to the constant that now governs —
// and it is asked of the SOURCE rather than of the value, because `page.tsx`
// now derives the number instead of typing it. A declaration that reads
// `REPLAY.wall * 1000` cannot drift from `REPLAY.wall` at all, which is a
// stronger answer to the mirrored-definition fault than any numeric compare.
// The containment is then asked separately.
const holdExpr = /const ROUND_HOLD_MS\s*=\s*([^;]+);/.exec(pageSrc);
const derived = !!holdExpr && /REPLAY\.wall\s*\*\s*1000/.test(holdExpr[1]);
check("the window page.tsx holds the arena open for is DERIVED from the replay's, not typed beside it",
  derived,
  holdExpr
    ? `page.tsx declares ROUND_HOLD_MS = ${holdExpr[1].trim()}. It must be REPLAY.wall * 1000, or it is a `
      + `second declaration of the replay's length sitting one edit away from disagreeing with it`
    : "page.tsx no longer declares ROUND_HOLD_MS; the window this beat plays inside has moved or gone");

check("and the round beat still fits inside that window",
  ROUND_HOLD.total <= REPLAY.wall + 1e-9,
  `ROUND_HOLD.total = ${ROUND_HOLD.total.toFixed(2)}s inside a window of REPLAY.wall = ${REPLAY.wall.toFixed(2)}s `
    + `(${(REPLAY.wall - ROUND_HOLD.total).toFixed(2)}s spare). The beat is the lens over the corpse and the replay is `
    + `what it is pointed at; a beat that outlived the window would be a camera holding on a body the replay had stopped drawing`);

// AND THE MODULE IS ACTUALLY IN THE GAME.
//
// THIS CHECK EXISTS BECAUSE ITS ABSENCE IS THE WHOLE OF THE LAST ROUND'S
// FAILURE. `src/game/replay.mjs` shipped with a green unit test of 830 lines
// and ZERO importers anywhere in `src/`, `tools/`, `custom-server.mjs` or
// `dev-server.mjs`. A player saw no replay and had no skip, and the green test
// read as coverage. `docs/PROCESS.md` failure mode 3 is a copy a test can never
// fail on; an unimported module with a passing test is the same fault with the
// copy count set to zero.
//
// A grep is a crude gate and it is the right crude gate: what it asserts is
// exactly what was false — that the shipped renderer references the module at
// all. tsc would not have caught it and neither would any harness that drives
// `replay.mjs` directly, which is every harness that drives it.
check("the replay module is imported by the renderer that has to play it",
  /from\s+["']@\/game\/replay\.mjs["']/.test(canvasSrc)
    && /createReplayBuffer\s*\(/.test(canvasSrc)
    && /createKillReplay\s*\(/.test(canvasSrc),
  `GameCanvas.tsx: imports replay.mjs = ${/from\s+["']@\/game\/replay\.mjs["']/.test(canvasSrc)}, `
    + `builds a ring = ${/createReplayBuffer\s*\(/.test(canvasSrc)}, `
    + `builds a clock = ${/createKillReplay\s*\(/.test(canvasSrc)}. `
    + `All three must be true or the replay is a module with a green test and no player`);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`
  + `\n  YOUR OWN DEATH   ${DEATH_HOLD.fall}s still + ${DEATH_HOLD.move}s move + ${DEATH_HOLD.linger}s linger = ${DEATH_HOLD.total.toFixed(2)}s,`
  + ` no cut, IDENTICAL ON EVERY TIER — the death is the one moment a phone has nothing else to draw.`
  + `\n  THE ROUND'S      ${ROUND_HOLD.fall}s cut + ${ROUND_HOLD.move}s in + ${ROUND_HOLD.linger}s linger = ${ROUND_HOLD.total.toFixed(2)}s,`
  + ` everybody watches, and your own death outranks it.`
  + `\n  THE DEFERRAL THAT USED TO BE ON THIS LINE IS CLOSED. It read: "the death that ends the LAST`
  + ` round of a match is not measured here, because the server goes straight from 'fighting' to`
  + ` 'finished' and render/summary.ts takes the lens for the victor's portrait. That is a screen the`
  + ` beat is not allowed to hold up from a file this unit owns." The screen IS held up now, by`
  + ` src/game/replay.mjs and not by this unit: GameCanvas withholds the tableau while a match-ending`
  + ` replay runs, and the round beat takes the lens over it. What this file still does not measure is`
  + ` the PICTURE — see tools/replaytest.mjs for the clock and the record, and the shot harnesses for`
  + ` the render.`);
process.exit(failed.length ? 1 : 0);
