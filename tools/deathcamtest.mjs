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
import { fileURLToPath } from "url";
import { getEngine } from "../src/game/engine.mjs";
import { createDeathCamera, frameDeathShot, DEATH_HOLD, DEATH_FOV } from "../src/game/deathcam.mjs";

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

// ---------------------------------------------------------------- recording
//
// A real honour duel. The harness never sends input, so the bot kills it — which
// is the case under test: the LOCAL player's death.
const engine = getEngine();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function record() {
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
  engine.message(sid, { type: "create", data: { name: "Moot", mode: "honour_duel", bestOf: 3 } });
  engine.message(sid, { type: "add_bot", data: { difficulty: "jarl" } });
  engine.message(sid, { type: "start", data: {} });
  await Promise.race([settled, sleep(95000)]);
  await sleep(900);
  return { log, sid };
}

const { log } = await record();
// The harness's own player is the one who is not a bot — the connection above.
const anyRoom = log.find((r) => r.room && r.room.players);
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

    const feet = { x: me.position.x, y: groundAt(me.position.x, me.position.z), z: me.position.z };
    // The wound, at the anatomy of the zone the SERVER reported, on the side the
    // blow came from. The spray leaves along the blade's own line, lifted —
    // `vfx.ts:woundBlood` adds the same +0.4 of up for the same reason.
    const from = killer ? norm(sub(feet, { x: killer.position.x, y: feet.y, z: killer.position.z })) : { x: 0, y: 0, z: 1 };
    const wound = {
      x: feet.x + from.x * 0.18,
      y: feet.y + (ZONE_Y[zone] ?? 1.12),
      z: feet.z + from.z * 0.18,
    };
    const spray = norm({ x: from.x, y: 0.4, z: from.z });
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
  `the death is the subject of the frame for ${blindHeld.toFixed(2)}s after death `
  + `(the collapse alone takes 1.10s, the stump runs 1.80s)`);
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
  `${held.toFixed(2)}s held against ${DEATH_HOLD.total.toFixed(2)}s asked for; `
  + `the collapse settles at 1.10s and the stump stops at 1.80s`);

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
const slow = replay({ blind: BLIND, fps: 12 });
const slowHeld = heldFor(slow);
check("the same hold at 12 fps as at 60",
  slowHeld >= DEATH_HOLD.total - 1 / 6 && slow.reduce((m, f) => (f.shot ? f.since : m), 0) <= DEATH_HOLD.total + 1 / 6,
  `${slowHeld.toFixed(2)}s held at 12 fps against ${held.toFixed(2)}s at 60`);

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

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`
  + `  —  hold ${DEATH_HOLD.fall}s still + ${DEATH_HOLD.move}s move + ${DEATH_HOLD.linger}s linger = ${DEATH_HOLD.total.toFixed(2)}s,`
  + ` IDENTICAL ON EVERY TIER, which is a deliberate choice and not an oversight:`
  + ` the death is the one moment a phone has nothing else to draw.`);
process.exit(failed.length ? 1 : 0);
