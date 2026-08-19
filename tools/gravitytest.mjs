#!/usr/bin/env node
/**
 * GRAVITYTEST — IS THERE ANY WEIGHT IN THESE BODIES?
 *
 *   node tools/gravitytest.mjs                    all three sections, ~60 s
 *   node tools/gravitytest.mjs --only=down        §1 the downed man
 *   node tools/gravitytest.mjs --only=corpse      §2 where the corpse stops
 *   node tools/gravitytest.mjs --only=spine       §3 how far the spine bends
 *   node tools/gravitytest.mjs --gate             exit non-zero on a red verdict
 *   node tools/gravitytest.mjs --strip            §1 as a picture: .gravity/strip.svg
 *   node tools/gravitytest.mjs --lever=park       R1 for §1
 *   node tools/gravitytest.mjs --lever=flat       R1 for §2
 *   node tools/gravitytest.mjs --lever=stops      R1 for §3
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS. The owner, 19 Aug 2026, having played the merged build.
 * R6 — his words become the named check, so here they are verbatim:
 *
 *   1. "I think the whole vote for mercy or kill thing is what's causing the
 *      bodies to freeze — it's always when low health. [...] the animation of
 *      them frozen STOOD UP STRAIGHT still runs out after a few seconds"
 *   3. "The bodies now also randomly LEAN BACK after certain actions but it's
 *      very dramatic — like back bending over backwards dramatic, or flopping
 *      quickly down and up."
 *   4. "Also the dead bodies are still sometimes freezing PARTIALLY RAISED,
 *      like there's no gravity to them."
 *
 * Three complaints, one sentence between them: a body in this game can be left
 * in a posture that a body under gravity cannot hold. §1 is a living man held
 * upright while the server calls him floored, §2 is a corpse held off the
 * ground for ever, §3 is a spine bent past where a spine bends. Hence the name.
 *
 * ---------------------------------------------------------------------------
 * WHY `tools/freezetest.mjs --phases=collapse` CANNOT SEE §2, AND THIS CAN
 *
 * This is the important paragraph in the file, because freezetest is a good
 * harness that has been green over this defect the whole time, and `docs/
 * PROCESS.md` failure mode 1 — the ruler that measures the wrong quantity — is
 * this repository's signature fault at ten recorded instances.
 *
 * freezetest measures WHEN THE BODY STOPS MOVING. Its verdict column is
 *
 *     const settle = (thr) => { let last = 0; for (const s of track) if (s.d > thr) last = s.t; return last; };
 *
 * — the last frame on which any joint moved by more than the threshold. And its
 * landing column is
 *
 *     for (const s of track) if (Math.abs(s.prx - finalPrx) <= Math.abs(finalPrx) * 0.01) { landed = s.t; break; }
 *
 * where `finalPrx` is THE BODY'S OWN LAST FRAME. Both quantities are measured
 * RELATIVE TO WHEREVER THE BODY ENDED UP. A corpse that stops 30° short of the
 * turf and stays there stops moving EARLY and reaches 99% of its own final
 * angle EARLY, so it scores as a fast, clean landing. The worse the defect, the
 * better the number. `finalPrx` is computed on line 336 and never printed in
 * the table — the one quantity that would have shown it is carried through the
 * function as a denominator and thrown away.
 *
 * So freezetest answers "did he stop?" and the owner is asking "did he land?".
 * §2 below measures the ABSOLUTE terminal topple against the ground: how far
 * from upright the trunk finished, in degrees, with no reference to the body's
 * own history. It is the same seam, the same compiled `anim.ts`, the same real
 * `poseWarrior` — only the question is different, which is the whole of R1's
 * lesson written as a second tool rather than as a threshold move.
 *
 * ---------------------------------------------------------------------------
 * HOW IT MEASURES. Two shipped seams, no debug hooks, nothing in `src/` edited.
 *
 *   THE SERVER   `makeEngine({ autoTick: false })` and `engine.step(dt)`, the
 *                driver `tools/mercytest.mjs` uses. This file owns the clock;
 *                nothing races the sim.
 *   THE CLIENT   `src/game/client/render/anim.ts` compiled by `tsc` into
 *                `.gravity/anim` and imported, the seam `tools/freezetest.mjs`
 *                and `tools/facelook.mjs` both use. `poseWarrior` is the exact
 *                function production calls.
 *
 * §1 runs BOTH AT ONCE and that is the point of it. The player object fed to
 * `poseWarrior` each frame is the one lifted off the `game_state` broadcast, so
 * what is drawn is what a client would actually have to draw. The server's
 * `state` string and the client's pelvis angle are printed on the same row, and
 * where they disagree is the defect.
 *
 * WHAT §1 DOES NOT DO: it does not run `stepWarriorTransform`, so there is no
 * jitter buffer and no interpolation between snapshots. That layer moves a body
 * through the world; it does not touch the pose channels, which is what is
 * being measured. Stated here rather than left for a reader to assume.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE GATES: nothing, unless asked. It exits non-zero only on
 * `--gate`, so the person who writes the fix has a red light to turn green and
 * does not get to move a threshold to buy it (R3).
 */
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import * as THREE from "three";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const argOf = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const ONLY = (argOf("only", "down,corpse,spine")).split(",").map((s) => s.trim());
const has = (s) => ONLY.includes(s);
const GATE = argv.includes("--gate");
const STRIP = argv.includes("--strip");
const LEVER = argOf("lever", "");
let LEVER_MISSED = false;

const DEG = 180 / Math.PI;
const f1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : "  -");
const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : "  -");
const say = (s) => console.log(s);
const rule = (t) => { say(""); say("=".repeat(78)); say(`  ${t}`); say("=".repeat(78)); };
const fails = [];
const bad = (m) => { fails.push(m); say(`    FAIL  ${m}`); };

// ===========================================================================
// THE BARS, STATED ONCE, IN DEGREES, WITH THE ANATOMY BEHIND THEM
// ===========================================================================
//
// R11 stage 5 is motion and weight, and a bar at this stage is a claim about a
// body rather than about a frame. Each of these is a real articular range, so
// the number can be argued with on its own terms rather than because a harness
// went red.
const BAR = {
  /**
   * How far from upright a DEAD trunk must finish. A corpse lies down. 70° is
   * generous — a body on its side or face-down is at 90° — and it is set below
   * a right angle on purpose, because `deathLayer` deliberately shortens the
   * topple for a man who crumples rather than topples and that is a good idea
   * that must not be allowed to run to a body left kneeling.
   *
   * `deathLayer`'s own comment names the failure this catches:
   *   "At 0.62 the trunk stopped 34° off vertical and the capture is a beheaded
   *    warrior still standing with his guard up — which is the one failure this
   *    whole feature cannot survive."
   * That was fixed for `crumple` alone. This bar is over the ASSEMBLED angle,
   * so it also covers the reducers that were added afterwards.
   */
  corpseDown: 70,
  /**
   * How far from upright a man the server calls `knocked` must be drawn. He is
   * on the floor. `knockLayer` itself calls flat `(π/2) * 0.82` = 47°... no:
   * 0.82 of a right angle is 74°, and this bar is set at half of that, because
   * §1 is not grading the shape of a knockdown, it is catching a man drawn
   * STANDING while the wire says he is down.
   */
  knockedDown: 37,
  /**
   * SPINE EXTENSION RELATIVE TO THE PELVIS, in degrees, on a LIVING man:
   * chest pitch plus neck pitch, which is the thoracolumbar spine plus the
   * cervical one. NOT the body's own pitch — see `spineArch` for why summing
   * that in produced a false positive on every knockdown in the game.
   *
   * The thoracolumbar spine extends about 30° and the cervical about 70°, and
   * a man in mail standing on his feet does not get to use both at once. 55°
   * over the two is already a generous fighting-game arch; past it he is doing
   * a backbend, which is the owner's "back bending over backwards dramatic".
   *
   * Measured as a SUM because that is what a viewer sees: `applyPose` hangs
   * `head` under `chest`, so the two pitches compose, and a clamp on one of
   * them alone bounds nothing. `stops()` clamps `crx` and does not clamp `hrx`.
   */
  spineBack: 55,
  /** The same two joints flexing FORWARD. A bow is about 60° of real spine. */
  spineFwd: 75,
  /**
   * The flop. How far the drawn pelvis pitch may move in ONE FRAME at 60 fps
   * on a LIVING body. 12°/frame is 720°/s, which is faster than any authored
   * beat in `anim.ts` and is only reachable by a discontinuity — a state whose
   * clock jumps, or a pose written straight over another one.
   */
  step: 12,
};

// ===========================================================================
// THE COMPILED CLIENT
// ===========================================================================
let ANIM = null;
async function loadAnim() {
  if (ANIM) return ANIM;
  const BUILD = resolve(ROOT, ".gravity/anim");
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });
  const tsc = spawnSync("npx", ["tsc", "src/game/client/render/anim.ts", "--outDir", ".gravity/anim",
    "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
    { cwd: ROOT, encoding: "utf8" });
  const emitted = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const f = resolve(d, e.name);
    if (e.isDirectory()) walk(f); else if (e.name.endsWith(".js")) emitted.push(f);
  } };
  if (existsSync(BUILD)) walk(BUILD);
  // tsc emits extensionless relative specifiers; node's ESM loader will not
  // resolve them. One rewrite over the emitted tree, inside .gravity.
  for (const f of emitted) {
    const src = readFileSync(f, "utf8");
    const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c));
    if (fixed !== src) writeFileSync(f, fixed);
  }
  const animFile = emitted.find((f) => f.endsWith("anim.js"));
  if (!animFile) { say(`  tsc emitted no anim.js:\n${tsc.stdout || ""}${tsc.stderr || ""}`); return null; }

  // -------------------------------------------------------------------------
  // R1 — PULL THE LEVER. Not fixes and not proposals: tests OF THE RULER. Each
  // one sabotages the exact expression this file blames for a defect, applied
  // to tsc's own unminified output. If a section's number does not MOVE when
  // its lever is pulled, this file is not measuring what it says it is and the
  // section says so and voids itself.
  // -------------------------------------------------------------------------
  const patch = (label, rx, to) => {
    const src = readFileSync(animFile, "utf8");
    if (!rx.test(src)) {
      say(`  LEVER MISSED (${label}): the anchor is not where this lever expects it. Result VOID.`);
      LEVER_MISSED = true;
      return;
    }
    writeFileSync(animFile, src.replace(rx, to));
    say(`  R1 LEVER ON (${label}).`);
  };
  if (LEVER === "park") {
    // Phase the floored pose off the CLIENT's own elapsed clock instead of off
    // the server's parked `downTimer`. §1 must move.
    patch("park", /const left = player\.downTimer \?\? 0;/, "const left = Math.max(0, total - motion.actT);");
  } else if (LEVER === "flat") {
    // Take the two topple reducers out. §2 must move.
    patch("flat", /const flat = \(Math\.PI \/ 2\) \* \(1 - shape\.crumple \* 0\.18 - c\.curl \* 0\.16\);/,
      "const flat = (Math.PI / 2);");
  } else if (LEVER === "stops") {
    // THIS LEVER IS KEPT BECAUSE IT MOVED NOTHING, AND THAT IS THE RESULT.
    //
    // It removes the ONE spine clamp `stops()` has. Run against the shipping
    // build every number in §3 came back BYTE-IDENTICAL. That is not a broken
    // ruler — §3's `arch` lever below moves it 3x on demand — it is the finding:
    // the peak chest pitch across every action and every transition this file
    // drives is 25.2°, and the clamp is at 28.6°. `P.crx = clamp(P.crx, -0.5,
    // 0.62)` is INERT on everything the game actually does, so the only stop
    // guarding the spine is not guarding anything.
    patch("stops", /P\.crx = clamp\(P\.crx, -0\.5, 0\.62\);/, "");
  } else if (LEVER === "arch") {
    // The ruler's own lever: treble the committed chest and neck. §3's `back`
    // and `fwd` columns must treble with it or `spineArch` is not reading the
    // pose that reaches the bones.
    patch("arch", /Object\.assign\(rig\.last, P\);/, "P.crx *= 3; P.hrx *= 3; Object.assign(rig.last, P);");
  }

  ANIM = await import(pathToFileURL(animFile).href);
  return ANIM;
}

/**
 * THE FRAME SEQUENCE, AS A PICTURE. R5 says open the render and watch it move,
 * and three of the four defects the owner reported were invisible to every
 * number in this repository and obvious in one image.
 *
 * THIS IS NOT A SCREENSHOT AND MUST NOT BE READ AS ONE. There is no GPU and no
 * browser on the box this was written on — `npm run shoot` and freezetest's own
 * `--phases=freeze` both need Chromium and neither can run here. What this draws
 * is the RIG'S OWN JOINT POSITIONS in world space, side elevation, straight off
 * `getWorldPosition` after the frame's pose has been committed to the bones. It
 * carries no mesh, no armour, no cloak and no ground. It is a stick figure of
 * where the skeleton actually is, and for "is this man standing up or lying
 * down" that is the whole question — but anything about silhouette, material or
 * light has to wait for a machine that can run the real renderer.
 *
 * Verified coherent before it was trusted: a standing warden's head pivot sits
 * at y 1.45 m and his hip at y -0.08; four seconds after a plain death the same
 * head is at y 0.18, z -1.72, and his knee at y 0.04. The skeleton lies down.
 */
const JOINTS = ["head", "chest", "rightArm", "elbowR", "rightLeg", "kneeR"];
function shootFrame(parent, rig) {
  parent.updateMatrixWorld(true);
  const V = new THREE.Vector3();
  const out = {};
  rig.body.getWorldPosition(V); out.hip = [V.z, V.y];
  for (const j of JOINTS) { rig.pivots[j].getWorldPosition(V); out[j] = [V.z, V.y]; }
  return out;
}
/** Side elevation, one panel per sample, ground line at y = 0. */
function writeStrip(frames, path, caption) {
  const W = 150, H = 190, PAD = 8;
  const SCALE = 52;                       // px per metre
  const ox = W / 2, oy = H - 40;          // origin: ground, mid-panel
  const X = (z) => ox - z * SCALE;        // -z is "away from the blow"
  const Y = (y) => oy - y * SCALE;
  const seg = (f, a, b) => `<line x1="${X(f[a][0]).toFixed(1)}" y1="${Y(f[a][1]).toFixed(1)}" `
    + `x2="${X(f[b][0]).toFixed(1)}" y2="${Y(f[b][1]).toFixed(1)}"/>`;
  const panels = frames.map((f, i) => {
    const x0 = PAD + i * (W + PAD);
    const bones = [["hip", "chest"], ["chest", "head"], ["chest", "rightArm"],
      ["rightArm", "elbowR"], ["hip", "rightLeg"], ["rightLeg", "kneeR"]]
      .map(([a, b]) => seg(f.j, a, b)).join("");
    const dots = ["head", "chest", "hip", "kneeR"].map((k) =>
      `<circle cx="${X(f.j[k][0]).toFixed(1)}" cy="${Y(f.j[k][1]).toFixed(1)}" r="2.6"/>`).join("");
    return `<g transform="translate(${x0},${PAD})">`
      + `<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#3a3a3a"/>`
      + `<line x1="6" y1="${oy}" x2="${W - 6}" y2="${oy}" stroke="#666" stroke-dasharray="3 3"/>`
      + `<g stroke="#e8e0d0" stroke-width="4.5" stroke-linecap="round" fill="none">${bones}</g>`
      + `<g fill="#c8552a">${dots}</g>`
      + `<text x="6" y="14" fill="#8a8a8a" font-family="monospace" font-size="10">t+${f.t}s</text>`
      + `<text x="6" y="${H - 20}" fill="#c9c9c9" font-family="monospace" font-size="10">${f.state}</text>`
      + `<text x="6" y="${H - 8}" fill="#c8552a" font-family="monospace" font-size="10">${f.pitch}</text>`
      + `</g>`;
  }).join("");
  const total = PAD + frames.length * (W + PAD);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${H + PAD * 2 + 26}" `
    + `viewBox="0 0 ${total} ${H + PAD * 2 + 26}"><rect width="100%" height="100%" fill="#141414"/>`
    + panels
    + `<text x="${PAD}" y="${H + PAD * 2 + 18}" fill="#8a8a8a" font-family="monospace" font-size="11">${caption}</text>`
    + `</svg>`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, svg);
}

/** A rig, a motion and a frame context — everything `poseWarrior` needs. */
function stand(anim, player) {
  const parent = new THREE.Group();
  const rig = anim.createWarriorRig(parent, player, undefined, { tier: "high", shadows: false });
  const motion = anim.createMotion(player);
  const ctx = { dt: 1 / 60, rawDt: 1 / 60, time: 0, camera: new THREE.PerspectiveCamera(),
    focus: new THREE.Vector3(), localId: "", localState: null, mood: "dusk",
    quality: { tier: "high", shadows: false } };
  return { parent, rig, motion, ctx };
}

/**
 * The assembled trunk angle, in degrees from upright, off the pose the frame
 * actually committed.
 *
 * `body.rotation` is the pelvis and `applyPose` writes it from `prx`/`pry`/
 * `prz`; the topple is authored as ONE angle about ONE axis (`deathLayer` says
 * so in its own comment — "resolving it as an axis rather than adding a roll
 * term is what keeps the total a right angle however far round it goes"), so
 * the magnitude is the hypotenuse of pitch and roll and NOT the pitch alone.
 * Reading `prx` by itself is how a body that went over sideways reads as a body
 * still standing, and that is a ruler this repository has shipped before.
 */
const topple = (last) => Math.hypot(last.prx, last.prz) * DEG;

/**
 * THE SPINE, AND NOT THE MAN'S PITCH — a distinction this file got wrong once.
 *
 * `applyPose` hangs `chest` under `body` and `head` under `chest`, so the three
 * pitches compose and the first draft of §3 summed all three. That is the wrong
 * quantity and it produced a confident false positive: `knockLayer` writes
 * `P.prx = fall * flat * lie`, which is -73.8° for a man knocked over BACKWARDS
 * — and a man going over backwards is not a man arching his back, he is a man
 * falling. Summed, every knockdown in the game read as a spine defect.
 *
 * `prx` is the whole body pitching about its feet. `crx` + `hrx` is the spine
 * bending relative to the pelvis, which is the thing that has an articular
 * limit and the thing the owner is describing. They are reported separately and
 * only the second is gated.
 */
const spineArch = (last) => (last.crx + last.hrx) * DEG;
/** Whole-body pitch about the feet. Topple, not articulation. Reported, not gated. */
const bodyPitch = (last) => last.prx * DEG;

// ===========================================================================
// §1  THE DOWNED MAN — the server's word against the client's pelvis
// ===========================================================================
async function sectionDown(anim) {
  rule("§1  THE DOWNED MAN   (real engine at 20 Hz + real poseWarrior at 60 fps)");
  const eng = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);
  const { makeEngine, KNOCKDOWN } = eng;
  const TICK = 1 / 20;
  const NEUTRAL = { moveX: 0, moveZ: 0, rotationY: 0, sprint: false, attack: false,
    heavyAttack: false, block: false, dodge: false, crouch: false, ability: false,
    shove: false, attackDir: "right" };

  const session = (engine) => {
    const st = { latest: null, id: null, join: null, msgs: [] };
    const sid = engine.connect((str) => {
      const m = JSON.parse(str);
      if (m.type === "join") { st.id = m.data.playerId; st.join = m.data; }
      if (m.data && m.data.players) st.latest = m.data;
      st.msgs.push(m);
    });
    return { sid, st };
  };

  const engine = makeEngine({ autoTick: false });
  const A = session(engine);
  engine.message(A.sid, { type: "create", data: { name: "Aethel", mode: "blood_moot", bestOf: 1 } });
  engine.message(A.sid, { type: "select_class", data: { warriorClass: "berserker" } });
  const B = session(engine);
  engine.message(B.sid, { type: "join", data: { code: A.st.join.code } });
  engine.message(B.sid, { type: "select_class", data: { warriorClass: "huscarl" } });
  // Two spectators, so the room is a moot and the round does not end the moment
  // one man falls — the owner's report is explicitly NOT about the final 1v1.
  const C = session(engine), D = session(engine);
  engine.message(C.sid, { type: "join", data: { code: A.st.join.code } });
  engine.message(D.sid, { type: "join", data: { code: A.st.join.code } });
  engine.message(A.sid, { type: "start", data: {} });
  let guard = 0;
  while (guard++ < 600 && A.st.latest?.state !== "fighting") engine.step(TICK);
  if (A.st.latest?.state !== "fighting") { engine.stop(); bad("§1 never reached `fighting`"); return null; }
  for (let i = 0; i < 50; i++) engine.step(TICK);   // spawn i-frames

  const me = (S) => S.st.latest.players[S.st.id];
  const hold = (S, data) => engine.message(S.sid, { type: "input", data: { ...NEUTRAL, ...data } });

  // A rig for B, posed from the wire every render frame.
  const { parent, rig, motion, ctx } = stand(anim, me(B));
  const RENDER = 3;                                  // render frames per sim tick (20 Hz -> 60 fps)
  const DT = TICK / RENDER;
  let time = 0;
  const track = [];
  const drawB = () => {
    const b = me(B);
    for (let k = 0; k < RENDER; k++) {
      time += DT; ctx.time = time;
      anim.poseWarrior(rig, motion, b, DT, ctx);
      track.push({ t: time, state: b.state, mortal: !!b.mortal,
        mercy: b.mercyTimer ?? 0, downTimer: b.downTimer ?? 0, health: b.health,
        pitch: topple(rig.last), j: STRIP ? shootFrame(parent, rig) : null });
    }
  };

  // A beats B until B is off his feet. Heavy, because it is faster.
  let t = 0;
  while (t < 40) {
    const a = me(A), b = me(B);
    if (!a || !b) break;
    const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const yaw = Math.atan2(dx, dz);
    if (d > 1.5) hold(A, { moveX: dx / d, moveZ: dz / d, rotationY: yaw });
    else hold(A, { rotationY: yaw, heavyAttack: a.state === "idle" || a.state === "walking" });
    engine.step(TICK); t += TICK; drawB();
    if (b.mortal || b.state === "dead") break;
  }
  const fell = track.findIndex((s) => s.mortal || s.state === "knocked" || s.state === "dead");
  if (fell < 0) { engine.stop(); bad("§1 never got a man off his feet in 40 s — nothing to measure"); return null; }
  // Let the whole thing play out: the window, the rise, and a beat after it.
  hold(A, {});
  const after = Math.ceil((3.5 + KNOCKDOWN.down + KNOCKDOWN.rise) / TICK);
  for (let i = 0; i < after; i++) { hold(A, {}); engine.step(TICK); drawB(); }
  engine.stop();

  // ---- the strip ----
  const win = track.slice(fell);
  const t0 = win[0].t;
  say("");
  say(`    A FRAME SEQUENCE from the moment he went off his feet. 60 fps, every 6th frame.`);
  say(`    "drawn" is the assembled trunk angle from upright, in degrees, off rig.last.`);
  say("");
  say(`      t(s)   server state   mortal  mercyTimer  downTimer   hp   drawn`);
  for (let i = 0; i < win.length; i += 6) {
    const s = win[i];
    say(`      ${f2(s.t - t0).padStart(5)}   ${s.state.padEnd(13)}  ${(s.mortal ? "yes" : "no").padEnd(6)} `
      + `${f2(s.mercy).padStart(10)}  ${f2(s.downTimer).padStart(9)}  ${String(s.health).padStart(3)}  ${f1(s.pitch).padStart(6)}°`);
  }

  // ---- the verdict ----
  const knocked = win.filter((s) => s.state === "knocked");
  const upright = knocked.filter((s) => s.pitch < BAR.knockedDown);
  const worstRun = (() => { let run = 0, best = 0;
    for (const s of win) { if (s.state === "knocked" && s.pitch < BAR.knockedDown) { run++; best = Math.max(best, run); } else run = 0; }
    return best / 60; })();
  // The flop: the largest one-frame move of the drawn trunk anywhere in the strip.
  let step = 0, stepAt = 0, stepFrom = "", stepTo = "";
  for (let i = 1; i < win.length; i++) {
    const d = Math.abs(win[i].pitch - win[i - 1].pitch);
    if (d > step) { step = d; stepAt = win[i].t - t0; stepFrom = win[i - 1].state; stepTo = win[i].state; }
  }
  say("");
  say(`    frames the server calls \`knocked\`            ${String(knocked.length).padStart(5)}`);
  say(`    ...of those, drawn under ${String(BAR.knockedDown).padStart(2)}° from upright  ${String(upright.length).padStart(5)}`
    + `  (${knocked.length ? f1(100 * upright.length / knocked.length) : "  -"}%)`);
  say(`    longest unbroken run of that                 ${f2(worstRun)} s`);
  say(`    biggest ONE-FRAME move of the drawn trunk    ${f1(step)}°  at t+${f2(stepAt)}s, ${stepFrom} -> ${stepTo}`);
  if (STRIP) {
    // Ten samples across the window plus the two frames either side of the snap,
    // because the snap is one frame long and an even sampling would miss it.
    const snapAt = win.findIndex((s2, i) => i > 0 && Math.abs(s2.pitch - win[i - 1].pitch) === step);
    const idx = new Set();
    for (let i = 0; i < 8; i++) idx.add(Math.round(i * (win.length - 1) / 9));
    if (snapAt > 0) { idx.add(snapAt - 1); idx.add(snapAt); idx.add(Math.min(win.length - 1, snapAt + 6)); }
    const frames = [...idx].sort((a, b2) => a - b2).map((i) => ({
      t: f2(win[i].t - t0), state: win[i].state, pitch: `${f1(win[i].pitch)} deg`, j: win[i].j }));
    const out = resolve(ROOT, ".gravity/strip.svg");
    writeStrip(frames, out, "gravitytest §1 — rig joint positions, side elevation. NOT a screenshot: no mesh, no ground, no light.");
    say(`    STRIP written: ${out}   (${frames.length} panels)`);
  }
  say("");
  if (upright.length > 0) {
    bad(`§1 a man the server calls \`knocked\` is drawn STANDING for ${f2(worstRun)} s `
      + `(${upright.length}/${knocked.length} frames under ${BAR.knockedDown}° from upright)`);
  }
  if (step > BAR.step) {
    bad(`§1 the drawn trunk moves ${f1(step)}° in one frame at 60 fps (bar ${BAR.step}°) — ${stepFrom} -> ${stepTo}`);
  }
  return { knocked: knocked.length, upright: upright.length, worstRun, step, stepAt, stepFrom, stepTo, track: win };
}

// ===========================================================================
// §2  THE CORPSE — where it stops, measured against the GROUND
// ===========================================================================
async function sectionCorpse(anim) {
  rule("§2  WHERE THE CORPSE STOPS   (absolute terminal topple, not self-relative)");
  const man = (cls) => ({
    id: "d", name: "", warriorClass: cls, team: "none", ready: true,
    position: { x: 0, y: 0, z: 0 }, rotation: 0, velocity: { x: 0, y: 0, z: 0 },
    health: 0, maxHealth: 100, stamina: 100, maxStamina: 100, state: "idle",
    attackDir: "right", blockDir: "right",
    attackTimer: 0, blockTimer: 0, dodgeTimer: 0, staggerTimer: 0,
    abilityCooldown: 0, abilityActive: false, abilityTimer: 0,
    kills: 0, deaths: 0, damage: 0, score: 0, lastHitBy: "",
    comboCount: 0, comboTimer: 0, invincible: false, invincibleTimer: 0,
  });

  /**
   * One death, driven for 4 s, reported by WHERE IT ENDED and not by when.
   *
   * `prior` is the state he was in when the blow landed, and it is not a
   * garnish — `poseWarrior` keeps ONE clock for every one-shot,
   *
   *     motion.actT = dead || rolling || staggered || casting || shoving || floored
   *       ? motion.actT + dt : 0;
   *
   * and `dead`, `floored`, `staggered` and `rolling` are all in that set. So a
   * man killed out of any of them hands `deathLayer` a clock that is ALREADY
   * RUNNING, and every ramp in the collapse — `over`, `rest`, `lag` — is part
   * or all of the way through on the first frame of his death. Nothing in this
   * repository was driving that case, which is why nothing had seen it.
   */
  const oneDeath = (cls, cause, zone, prior = null) => {
    const player = man(cls);
    const { rig, motion, ctx } = stand(anim, player);
    let t = 0;
    for (let i = 0; i < 30; i++) { t += 1 / 60; ctx.time = t; anim.poseWarrior(rig, motion, player, 1 / 60, ctx); }
    if (prior) {
      player.state = prior;
      const secs = prior === "knocked" ? 2.5 : 0.65;   // 2.5 s is MERCY.window
      for (let i = 0; i < secs * 60; i++) {
        t += 1 / 60; ctx.time = t;
        player.downTimer = prior === "knocked" ? 1.30 : 0;
        player.staggerTimer = 0.6;
        anim.poseWarrior(rig, motion, player, 1 / 60, ctx);
      }
    }
    const carried = motion.actT;
    player.state = "dead"; player.deathCause = cause; player.deathZone = zone;
    let peak = 0, step = 0, prevPitch = topple(rig.last);
    const keys = Object.keys(rig.last);
    let prev = keys.map((k) => rig.last[k]);
    let settle3 = 0;
    for (let i = 0; i < 4 * 60; i++) {
      t += 1 / 60; ctx.time = t;
      anim.poseWarrior(rig, motion, player, 1 / 60, ctx);
      const now = keys.map((k) => rig.last[k]);
      let d = 0; for (let k = 0; k < now.length; k++) d = Math.max(d, Math.abs(now[k] - prev[k]));
      if (d > 1e-3) settle3 = (i + 1) / 60;
      prev = now;
      const p = topple(rig.last);
      peak = Math.max(peak, p);
      step = Math.max(step, Math.abs(p - prevPitch));
      prevPitch = p;
    }
    const sh = rig.gore.shape;
    return { cls, cause: cause ?? "-", zone: zone ?? "-", prior: prior ?? "-", carried,
      seam: rig.gore.cut ? rig.gore.cut.seam : null, halved: sh.halved,
      ended: topple(rig.last), peak, settle3, step,
      shape: sh.halved ? "halved" : `crum${f2(sh.crumple)} lean${f2(sh.lean)}` };
  };

  // Zone names are `HitZone`'s, verbatim — see src/game/types.ts. freezetest
  // records that its own first draft invented "leftArm"/"leftLeg", `sever()`
  // refused both, and the table printed six identical rows that looked like
  // proof and were proof of nothing.
  const cases = [
    ["warden", null, null], ["berserker", null, "torso"],
    ["huscarl", "fire", null], ["runekeeper", "fire", "torso"],
    ["runekeeper", null, "head"], ["warden", "finish", "head"],
    ["berserker", "finish", null], ["warden", null, "armL"],
    ["berserker", null, "legL"], ["huscarl", null, "waist"],
  ];
  const rows = cases.map((c) => oneDeath(...c));
  // And the same deaths again out of the four states that carry `actT`.
  const PRIORS = ["staggered", "rolling", "knocked"];
  const carryRows = [];
  for (const pr of PRIORS) for (const c of [["warden", null, null], ["huscarl", "finish", "head"], ["berserker", null, "armL"]]) {
    carryRows.push(oneDeath(c[0], c[1], c[2], pr));
  }
  say("");
  say(`    "ended" is how far from upright the trunk finished, in degrees, after 4 s.`);
  say(`    90° is flat on the turf. The bar is ${BAR.corpseDown}°, and it is ABSOLUTE —`);
  say(`    nothing here is measured against the body's own final frame.`);
  say("");
  say(`    class        cause    zone   seam      shape            settled   peak   ENDED`);
  for (const r of rows) {
    const flag = r.halved ? "  <-- halved: UNGATED, see below"
      : (r.ended < BAR.corpseDown ? "  <-- PARTLY RAISED" : "");
    say(`    ${r.cls.padEnd(11)} ${String(r.cause).padEnd(8)} ${r.zone.padEnd(6)} `
      + `${String(r.seam ?? "-").padEnd(9)} ${r.shape.padEnd(16)} ${f2(r.settle3).padStart(6)}s `
      + `${f1(r.peak).padStart(6)}° ${f1(r.ended).padStart(6)}°${flag}`);
  }
  // R4 — THE DEFERRAL RIDES THE VERDICT LINE AND NOT A FOOTNOTE.
  //
  // The halved body is measured and NOT gated on the angle, and the reason is
  // that the angle is the wrong question for it. `sever("waist")` really does
  // take the torso, head and both arms off the rig and throw them as a physics
  // piece; what `halfLayer` poses is a pelvis and two legs, and its own comment
  // says so — "there is no topple in this because there is nothing above the
  // belt to topple". A pelvis sitting at 25° on two knees folded to 1.95 rad is
  // a bottom half sitting down, which is correct. The first cut of this file
  // flagged it as the worst corpse in the table, which would have been failure
  // mode 1 committed by the harness written to catch failure mode 1.
  const gated = rows.filter((r) => !r.halved);
  const deferred = rows.filter((r) => r.halved);
  const short = gated.filter((r) => r.ended < BAR.corpseDown);
  const worst = gated.reduce((a, b) => (b.ended < a.ended ? b : a));
  say("");
  say(`    worst corpse: ${worst.cls} / ${worst.cause} / ${worst.zone} ended ${f1(worst.ended)}° `
    + `from upright — ${f1(90 - worst.ended)}° short of the turf,`);
  say(`    and it STOPPED MOVING at ${f2(worst.settle3)}s, which is why a settle-time ruler calls it clean.`);
  say("");
  say(`    THE SAME DEATHS, OUT OF A STATE THAT WAS ALREADY RUNNING A CLOCK.`);
  say(`    "carried" is \`motion.actT\` on the frame he died. A collapse handed a clock`);
  say(`    that is already 0.65-2.50 s old has no ramp left to run.`);
  say("");
  say(`    prior state   class        cause/zone     carried   ENDED    biggest one-frame move`);
  for (const r of carryRows) {
    const flag = r.step > BAR.step ? "  <-- FLOP" : "";
    say(`    ${r.prior.padEnd(13)} ${r.cls.padEnd(11)} ${(r.cause + "/" + r.zone).padEnd(14)} `
      + `${f2(r.carried).padStart(6)}s  ${f1(r.ended).padStart(6)}°  ${f1(r.step).padStart(10)}°${flag}`);
  }
  const baseStep = Math.max(...rows.map((r) => r.step));
  const carryStep = Math.max(...carryRows.map((r) => r.step));
  say("");
  say(`    dying from a standing start   worst one-frame move ${f1(baseStep)}°`);
  say(`    dying out of a running clock  worst one-frame move ${f1(carryStep)}°   ${f1(carryStep / (baseStep || 1))}x`);
  say("");
  if (short.length) {
    bad(`§2 ${short.length}/${gated.length} corpses finish above ${BAR.corpseDown}° from flat — `
      + `worst ${f1(worst.ended)}° (${worst.cause}/${worst.zone})`);
  }
  const flopped = carryRows.filter((r) => r.step > BAR.step);
  if (flopped.length) {
    bad(`§2 ${flopped.length}/${carryRows.length} deaths out of a running clock snap the trunk `
      + `more than ${BAR.step}° in one frame — worst ${f1(carryStep)}° `
      + `(vs ${f1(baseStep)}° from a standing start). \`motion.actT\` is not reset into \`dead\`.`);
  }
  return { rows, carryRows, gated: gated.length, deferred: deferred.length,
    short: short.length, worst, baseStep, carryStep, flopped: flopped.length };
}

// ===========================================================================
// §3  THE SPINE — how far it bends, and which action bends it
// ===========================================================================
async function sectionSpine(anim) {
  rule("§3  THE SPINE   (chest+neck arch relative to the pelvis, per action)");
  const man = (cls, extra) => ({
    id: "s", name: "", warriorClass: cls, team: "none", ready: true,
    position: { x: 0, y: 0, z: 0 }, rotation: 0, velocity: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, stamina: 100, maxStamina: 100, state: "idle",
    attackDir: "right", blockDir: "right",
    attackTimer: 0, blockTimer: 0, dodgeTimer: 0, staggerTimer: 0,
    abilityCooldown: 0, abilityActive: false, abilityTimer: 0,
    kills: 0, deaths: 0, damage: 0, score: 0, lastHitBy: "",
    comboCount: 0, comboTimer: 0, invincible: false, invincibleTimer: 0,
    ...extra,
  });

  /**
   * Hold one state for `secs`, from a real standing start, and report the
   * extremes of the assembled spine and the biggest one-frame move of it.
   *
   * The timers are ticked down here because the client reads them: a stagger
   * whose `staggerTimer` never falls is a stagger frozen at phase zero, which
   * would be measuring a bug this section is not about.
   */
  const hold = (label, cls, state, secs, mutate) => {
    const player = man(cls);
    const { rig, motion, ctx } = stand(anim, player);
    let time = 0;
    for (let i = 0; i < 45; i++) { time += 1 / 60; ctx.time = time; anim.poseWarrior(rig, motion, player, 1 / 60, ctx); }
    player.state = state;
    let back = 0, fwd = 0, step = 0, at = 0, prev = spineArch(rig.last);
    let peakPrx = 0, peakCrx = 0, peakHrx = 0;
    for (let i = 0; i < secs * 60; i++) {
      time += 1 / 60; ctx.time = time;
      if (mutate) mutate(player, i / 60);
      anim.poseWarrior(rig, motion, player, 1 / 60, ctx);
      const c = spineArch(rig.last);
      back = Math.min(back, c); fwd = Math.max(fwd, c);
      const d = Math.abs(c - prev);
      if (d > step) { step = d; at = i / 60; }
      prev = c;
      if (Math.abs(rig.last.prx) > Math.abs(peakPrx)) peakPrx = rig.last.prx;
      if (Math.abs(rig.last.crx) > Math.abs(peakCrx)) peakCrx = rig.last.crx;
      if (Math.abs(rig.last.hrx) > Math.abs(peakHrx)) peakHrx = rig.last.hrx;
    }
    return { label, back: -back, fwd, step, at,
      prx: peakPrx * DEG, crx: peakCrx * DEG, hrx: peakHrx * DEG };
  };

  // `motion.hitFwd` / `hitSide` are what the impact layers steer off, and the
  // client sets them from the `hit` broadcast. The worst case is a blow taken
  // square from the front, so that is what is driven here.
  const hitFront = (rig, motion) => { motion.hitFwd = -1; motion.hitSide = 0; };
  const rows = [];
  const CASES = [
    ["idle", "warden", "idle", 3, null],
    ["walking", "warden", "walking", 3, (p) => { p.velocity = { x: 0, y: 0, z: 4.2 }; }],
    ["attacking (light)", "berserker", "attacking", 1.2,
      (p, t) => { p.swingT = t / 0.55; p.swingDuration = 0.55; p.attackTimer = Math.max(0, 0.55 - t); p.swingHeavy = false; }],
    ["attacking (heavy)", "huscarl", "attacking", 1.2,
      (p, t) => { p.swingT = t / 0.85; p.swingDuration = 0.85; p.attackTimer = Math.max(0, 0.85 - t); p.swingHeavy = true; }],
    ["blocking", "huscarl", "blocking", 1.5, (p, t) => { p.blockTimer = t; }],
    ["shoving", "warden", "shoving", 1.2, null],
    ["staggered", "warden", "staggered", 1.5, (p, t) => { p.staggerTimer = Math.max(0, 0.6 - t); }],
    ["rolling", "runekeeper", "rolling", 1.0, null],
    ["ability", "berserker", "ability", 1.5, (p) => { p.abilityActive = true; p.abilityTimer = 1; }],
    ["riposte target", "warden", "idle", 1.5, (p, t) => { p.vulnerableTo = "x"; p.vulnerableTimer = Math.max(0, 0.9 - t); }],
  ];
  for (const [label, cls, state, secs, mut] of CASES) rows.push(hold(label, cls, state, secs, mut));
  // The stagger and the flinch both steer off the impact bearing, so the two
  // that can arch a man are run again with a blow taken square in the chest.
  {
    const player = man("warden");
    const { rig, motion, ctx } = stand(anim, player);
    let time = 0;
    for (let i = 0; i < 45; i++) { time += 1 / 60; ctx.time = time; anim.poseWarrior(rig, motion, player, 1 / 60, ctx); }
    player.state = "staggered"; hitFront(rig, motion); motion.flinch = 1;
    let back = 0, fwd = 0, step = 0, at = 0, prev = spineArch(rig.last);
    let peakPrx = 0, peakCrx = 0, peakHrx = 0;
    for (let i = 0; i < 90; i++) {
      time += 1 / 60; ctx.time = time;
      player.staggerTimer = Math.max(0, 0.6 - i / 60);
      motion.hitFwd = -1;
      anim.poseWarrior(rig, motion, player, 1 / 60, ctx);
      const c = spineArch(rig.last);
      back = Math.min(back, c); fwd = Math.max(fwd, c);
      const d = Math.abs(c - prev); if (d > step) { step = d; at = i / 60; }
      prev = c;
      if (Math.abs(rig.last.prx) > Math.abs(peakPrx)) peakPrx = rig.last.prx;
      if (Math.abs(rig.last.crx) > Math.abs(peakCrx)) peakCrx = rig.last.crx;
      if (Math.abs(rig.last.hrx) > Math.abs(peakHrx)) peakHrx = rig.last.hrx;
    }
    rows.push({ label: "staggered, hit from FRONT", back: -back, fwd, step, at,
      prx: peakPrx * DEG, crx: peakCrx * DEG, hrx: peakHrx * DEG });
  }

  say("");
  say(`    "back" is the worst BACKWARD arch of CHEST+NECK, in degrees. Bar ${BAR.spineBack}°.`);
  say(`    "step" is the biggest one-frame move of that arch at 60 fps. Bar ${BAR.step}°.`);
  say(`    prx is the WHOLE BODY pitching about its feet — topple, not articulation,`);
  say(`    reported beside the arch and deliberately NOT summed into it. See spineArch.`);
  say("");
  say(`    action                       back    fwd     step   @s      prx     crx     hrx`);
  for (const r of rows) {
    const flag = r.back > BAR.spineBack ? "  <-- BACKBEND" : (r.step > BAR.step ? "  <-- FLOP" : "");
    say(`    ${r.label.padEnd(26)} ${f1(r.back).padStart(5)}° ${f1(r.fwd).padStart(6)}° `
      + `${f1(r.step).padStart(6)}° ${f2(r.at).padStart(5)}  ${f1(r.prx).padStart(6)}° `
      + `${f1(r.crx).padStart(6)}° ${f1(r.hrx).padStart(6)}°${flag}`);
  }
  const arched = rows.filter((r) => r.back > BAR.spineBack);
  const flopped = rows.filter((r) => r.step > BAR.step);
  say("");
  // WHAT `stops()` ACTUALLY BOUNDS. Read out of anim.ts rather than asserted,
  // because the whole point of §3 is that the clamp list and the comment above
  // it do not agree, and a hard-coded claim here would be the same fault.
  const src = readFileSync(resolve(ROOT, "src/game/client/render/anim.ts"), "utf8");
  const at = src.indexOf("function stops(");
  const body = at < 0 ? "" : src.slice(at, src.indexOf("\n}", at));
  const clamped = [...body.matchAll(/P\.(\w+) = clamp/g)].map((m) => m[1]);
  const SPINE = ["prx", "pry", "prz", "crx", "cry", "crz", "hrx", "hry", "hrz"];
  const unclamped = SPINE.filter((c) => !clamped.includes(c));
  if (at < 0) say(`    COULD NOT READ stops() — the clamp audit below is void.`);
  else {
    say(`    stops() clamps: ${clamped.join(", ") || "(nothing)"}`);
    say(`    of the nine spine channels, UNCLAMPED: ${unclamped.join(", ") || "(none)"}`);
    say(`    stops()'s own comment says layers stacking is "how a spine ends up turned`);
    say(`    further than a spine turns". It bounds the chest and neither end of it.`);
  }
  // -------------------------------------------------------------------------
  // THE TRANSITION MATRIX. The owner said "after certain ACTIONS", and an
  // action is a thing you come OUT of. Every ordered pair of one-shot states,
  // held half a second then switched, because `motion.actT` is shared by all of
  // them and a state entered straight out of another one starts partway through
  // its own animation.
  // -------------------------------------------------------------------------
  const STATES = ["idle", "walking", "attacking", "blocking", "shoving", "staggered", "rolling", "ability"];
  const drive = (p, st, t) => {
    p.state = st;
    if (st === "attacking") { p.swingT = t / 0.6; p.swingDuration = 0.6; p.attackTimer = Math.max(0, 0.6 - t); }
    if (st === "blocking") p.blockTimer = t;
    if (st === "staggered") p.staggerTimer = Math.max(0, 0.6 - t);
    if (st === "ability") { p.abilityActive = true; p.abilityTimer = Math.max(0, 1 - t); }
    p.velocity = st === "walking" ? { x: 0, y: 0, z: 4.5 } : { x: 0, y: 0, z: 0 };
  };
  const pairs = [];
  for (const A of STATES) for (const B of STATES) {
    if (A === B) continue;
    const player = man("warden");
    const { rig, motion, ctx } = stand(anim, player);
    let t = 0;
    for (let i = 0; i < 45; i++) { t += 1 / 60; ctx.time = t; drive(player, "idle", 0); anim.poseWarrior(rig, motion, player, 1 / 60, ctx); }
    for (let i = 0; i < 30; i++) { t += 1 / 60; ctx.time = t; motion.hitFwd = -1; motion.hitSide = 0.3; drive(player, A, i / 60); anim.poseWarrior(rig, motion, player, 1 / 60, ctx); }
    const entered = motion.actT;
    let back = 0, step = 0, prev = spineArch(rig.last), pitch = 0;
    for (let i = 0; i < 72; i++) {
      t += 1 / 60; ctx.time = t; motion.hitFwd = -1; motion.hitSide = 0.3;
      drive(player, B, i / 60);
      anim.poseWarrior(rig, motion, player, 1 / 60, ctx);
      const c = spineArch(rig.last);
      back = Math.min(back, c); step = Math.max(step, Math.abs(c - prev)); prev = c;
      if (Math.abs(bodyPitch(rig.last)) > Math.abs(pitch)) pitch = bodyPitch(rig.last);
    }
    pairs.push({ k: `${A} -> ${B}`, back: -back, step, entered, pitch });
  }
  const worstArch = [...pairs].sort((a, b) => b.back - a.back).slice(0, 5);
  const worstStep = [...pairs].sort((a, b) => b.step - a.step).slice(0, 5);
  say("");
  say(`    TRANSITIONS — ${pairs.length} ordered pairs of one-shot states, 0.5 s in the first.`);
  say(`    "carried" is \`motion.actT\` at the switch: one clock serves rolling, staggered,`);
  say(`    shoving, casting, floored and dead, and it is only zeroed by a frame in which`);
  say(`    NONE of them is true. A state entered straight out of another starts late.`);
  say("");
  say(`    worst spine arch out of a transition          worst one-frame chest+neck move`);
  for (let i = 0; i < 5; i++) {
    const a = worstArch[i], b = worstStep[i];
    say(`    ${a.k.padEnd(24)} ${f1(a.back).padStart(5)}°       ${b.k.padEnd(24)} ${f1(b.step).padStart(5)}°  carried ${f2(b.entered)}s`);
  }
  const pairArch = pairs.filter((r) => r.back > BAR.spineBack);
  const pairStep = pairs.filter((r) => r.step > BAR.step);
  say("");
  say(`    pairs past ${BAR.spineBack}° of arch: ${pairArch.length}/${pairs.length}    `
    + `pairs past ${BAR.step}°/frame: ${pairStep.length}/${pairs.length}`);
  say("");
  if (pairArch.length) bad(`§3 ${pairArch.length} transition(s) arch the spine past ${BAR.spineBack}°: `
    + pairArch.slice(0, 4).map((r) => `${r.k} ${f1(r.back)}°`).join(", "));
  if (pairStep.length) bad(`§3 ${pairStep.length} transition(s) move the spine more than ${BAR.step}° in one frame: `
    + pairStep.slice(0, 4).map((r) => `${r.k} ${f1(r.step)}°`).join(", "));

  say("");
  if (arched.length) bad(`§3 ${arched.length} action(s) arch the spine past ${BAR.spineBack}°: `
    + arched.map((r) => `${r.label} ${f1(r.back)}°`).join(", "));
  if (flopped.length) bad(`§3 ${flopped.length} action(s) move the spine more than ${BAR.step}° in one frame: `
    + flopped.map((r) => `${r.label} ${f1(r.step)}°`).join(", "));
  return { rows, pairs, arched: arched.length, flopped: flopped.length,
    pairArch: pairArch.length, pairStep: pairStep.length, unclamped };
}

// ===========================================================================
(async () => {
  say("");
  say(`  GRAVITYTEST — a body in this game must not hold a posture a body cannot hold.`);
  say(`  Sections: ${ONLY.join(", ")}${LEVER ? `   LEVER: ${LEVER}` : ""}`);
  const anim = await loadAnim();
  if (!anim) { say("  anim.ts would not compile — nothing can be measured. VOID."); process.exit(2); }

  const R = {};
  if (has("down")) R.down = await sectionDown(anim);
  if (has("corpse")) R.corpse = await sectionCorpse(anim);
  if (has("spine")) R.spine = await sectionSpine(anim);

  rule("VERDICT");
  if (LEVER_MISSED) {
    say(`  VOID — a lever anchor missed, so this run measured the unsabotaged build`);
    say(`  while claiming otherwise. No verdict is offered.`);
    process.exit(2);
  }
  if (LEVER) {
    say(`  This run was SABOTAGED (--lever=${LEVER}). It is a test of the ruler, not of`);
    say(`  the build: compare its numbers with an unlevered run. If they did not MOVE,`);
    say(`  this harness is not measuring what it claims and R1 says stop.`);
  }
  if (R.down) {
    say(`  §1 DOWNED   ${R.down.upright}/${R.down.knocked} \`knocked\` frames drawn upright; `
      + `longest run ${f2(R.down.worstRun)}s; worst one-frame move ${f1(R.down.step)}°.`);
  }
  if (R.corpse) {
    say(`  §2 CORPSE   ${R.corpse.short}/${R.corpse.gated} corpses stop above ${BAR.corpseDown}° from flat `
      + `(worst ends ${f1(R.corpse.worst.ended)}°) — WITH ${R.corpse.deferred} halved bod(y/ies) measured and`);
    say(`              NOT gated, which is a deferral and not a clean sheet; and `
      + `${R.corpse.flopped}/${R.corpse.carryRows.length} deaths out of a running clock snapping up to ${f1(R.corpse.carryStep)}°/frame.`);
  }
  if (R.spine) {
    say(`  §3 SPINE    ${R.spine.arched} action(s) and ${R.spine.pairArch} transition(s) past ${BAR.spineBack}° of arch; `
      + `${R.spine.flopped} action(s) and ${R.spine.pairStep} transition(s) past ${BAR.step}°/frame.`);
    say(`              Unclamped spine channels in stops(): ${R.spine.unclamped.join(", ") || "none"}.`);
  }
  say("");
  if (fails.length) {
    say(`  RED — ${fails.length} finding(s):`);
    for (const f of fails) say(`    - ${f}`);
  } else {
    say(`  GREEN — every body measured lay down, stayed inside its own joints, and`);
    say(`  moved continuously. This is a ruler and not a bar; see R3 before trusting it.`);
  }
  say("");
  process.exit(GATE && fails.length ? 1 : 0);
})();
