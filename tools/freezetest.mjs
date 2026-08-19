#!/usr/bin/env node
/**
 * FREEZETEST — WHY DOES A MAN GO STATIC, AND IS THERE TIME TO SEE HIM DIE?
 *
 *   node tools/freezetest.mjs                     both phases
 *   node tools/freezetest.mjs --phases=collapse   the death clock, no browser, ~40 s
 *   node tools/freezetest.mjs --phases=freeze     a real fight, ~2 min
 *   node tools/freezetest.mjs --secs=90           longer fight sample
 *   node tools/freezetest.mjs --lever=idle        R1: kill idleLayer and check the ruler moves
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS. The owner, 15 Aug 2026:
 *
 *   1. "In game the players sometimes randomly stand straight up stuck fully
 *      still. I get there would have been purpose behind it but it needs
 *      improving as it just looks like the players randomly get stuck and they
 *      go static, arms by their side etc."
 *
 *   3. "Taking into account the death cam, having enough time to see the death."
 *
 * Two reports, two phases, and NEITHER of them is a matter of taste once it has
 * a number on it. §1 is a DURATION — how long a body's committed pose is
 * bit-for-bit identical while its owner is alive and upright. §2 is two
 * durations put beside each other — how long the collapse runs, and how long
 * the lens stays on it.
 *
 * ---------------------------------------------------------------------------
 * WHAT "STATIC" MEANS HERE, AND WHY IT IS MEASURED ON `rig.last`
 *
 * `docs/PROCESS.md` failure mode 1 is a ruler that measures the wrong quantity,
 * ten times over. So the quantity is chosen to be the one the owner's eye is
 * actually on: THE POSE THAT REACHED THE SCENE GRAPH.
 *
 * `anim.ts`'s `commit()` ends every pose path — live, dead, floored — with
 *
 *     Object.assign(rig.last, P);   applyPose(rig, piv, st, ready);
 *
 * so `rig.last` is the exact set of joint channels that were written onto the
 * bones this frame. It is one object, it is on the rig, and it is downstream of
 * every layer, every weight, every blend and every anatomical stop. A ruler
 * upstream of any of those — "was idleLayer called", "what is wMove" — can be
 * green while the body on screen has not moved a millimetre, which is precisely
 * the failure this file is written to avoid.
 *
 * A FREEZE is therefore: `rig.last` unchanged, exactly, across consecutive
 * frames, on a man who is alive, not knocked down and not in the intermission
 * pose loop. Exact equality is deliberate and is not fragile in the direction
 * that would matter: `idleLayer` is a sum of sines of `ctx.time` with a per-man
 * seed, so a breathing man's channels move every single frame by ~1e-4 or more.
 * Nothing that is genuinely animating can hold a bit-identical pose for two
 * frames running, let alone thirty.
 *
 * ---------------------------------------------------------------------------
 * HOW IT MEASURES WITHOUT TOUCHING src/   (the pattern is tools/janktest.mjs's)
 *
 * Nothing in `src/` is edited and no debug hook is asked for. The served bundle
 * is rewritten IN FLIGHT by a Playwright route intercept; disk is never
 * touched. EVERY PATCH IS COUNTED, and a patch that matched nothing prints
 * MISSED and voids its own phase — an experiment that did not happen is worse
 * than no experiment.
 *
 * Every anchor is pinned on a PROPERTY ACCESS (`.poseWarrior)(`, `.rig,`,
 * `.motion,`), because Next's minifier renames local variables and leaves
 * property names alone. The three call sites are told apart by the shape of
 * their own argument lists and not by the minifier's alphabet:
 *
 *   summary.ts     ...poseWarrior)(b.rig,b.motion,m.player,dt,ctx,hooks)
 *   intermission   ...poseWarrior)(s.rig,s.motion,p,dt,ctx,{groundAt:...})
 *   the fight      ...poseWarrior)(s.rig,s.motion,p,dt,ctx,hooks)
 *
 * The first two are matched first and consumed; whatever still matches after
 * that is the fight. Each site reports its own index, so a freeze can never be
 * blamed on the fight loop when it happened in the summary restage.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE GATES: NOTHING. It is a ruler, not a bar.
 *
 * It prints a verdict line so a human can read it in one look, and it exits
 * non-zero ONLY on --gate, which is there so a fix has a red light to turn
 * green. R3: the person who writes the fix does not get to move the threshold.
 */
import { chromium } from "playwright";
import { spawn, spawnSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import * as THREE from "three";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".freeze");
const argv = process.argv.slice(2);
const argOf = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const SECS = Math.max(10, parseInt(argOf("secs", "60"), 10) || 60);
const PHASES = (argOf("phases", "collapse,freeze")).split(",").map((s) => s.trim());
const has = (p) => PHASES.includes(p);
const GATE = argv.includes("--gate");
const PORT = parseInt(process.env.PORT || String(3910 + (process.pid % 40)), 10);
/**
 * R1 — PULL THE LEVER. Not a fix and not a proposal: a test OF THE RULER.
 *
 *   --lever=idle    zero the weight handed to `idleLayer` in the served bundle.
 *
 * Every man alive then stops breathing, and §1's static-frame percentage must
 * go through the roof. If it does NOT move when the one layer that animates a
 * standing man is switched off, this harness is not measuring what it says it
 * is measuring and every number it prints is worthless. Nothing on disk
 * changes and no fix is being argued for; the lever exists so the ruler can be
 * disbelieved cheaply.
 */
const LEVER = argOf("lever", null);

// ---------------------------------------------------------------------------
// statistics — a distribution, never a bare mean.
// ---------------------------------------------------------------------------
const pct = (s, p) => (s.length ? s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))] : NaN);
function stats(values) {
  const v = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return { n: v.length, min: v[0], p50: pct(v, 50), p90: pct(v, 90), p95: pct(v, 95), p99: pct(v, 99), max: v[v.length - 1], mean };
}
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "n/a");
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : "n/a");
const say = (s = "") => console.log(s);
const rule = (t) => { say(); say("=".repeat(78)); say(t); say("=".repeat(78)); };

// ===========================================================================
// §2  THE DEATH CLOCK  — headless, exact, no browser and no GPU
// ===========================================================================
//
// Two durations, and the owner's question is whether the second is bigger than
// the first:
//
//   COLLAPSE   how long `poseWarrior`'s dead branch keeps moving the body,
//              measured on the committed pose and not read off a comment.
//   HOLD       how long the lens stays on it, taken from `deathcam.mjs`'s own
//              exported clock.
//
// The collapse is measured, not derived. `deathLayer`'s slowest term is
// `rest = (d-0.6)/0.5`, which says 1.10 s on paper — but `settleOnFeet`, the
// gore's `stepPiece`, the cloak drape and the anatomical stops all run after
// it, and any of them can still be moving when the layer has stopped. So this
// drives the REAL `poseWarrior` frame by frame and watches `rig.last`.
async function phaseCollapse() {
  rule("§1  THE DEATH CLOCK   (real poseWarrior, no browser — exact)");

  const BUILD = resolve(ROOT, ".freeze/anim");
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });
  const tsc = spawnSync("npx", ["tsc", "src/game/client/render/anim.ts", "--outDir", ".freeze/anim",
    "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
    { cwd: ROOT, encoding: "utf8" });
  const emitted = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const f = resolve(d, e.name);
    if (e.isDirectory()) walk(f); else if (e.name.endsWith(".js")) emitted.push(f);
  } };
  if (existsSync(BUILD)) walk(BUILD);
  // tsc emits TypeScript's extensionless relative specifiers; node's ESM loader
  // will not resolve them. One rewrite over the emitted tree, inside .freeze.
  for (const f of emitted) {
    const src = readFileSync(f, "utf8");
    const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c));
    if (fixed !== src) writeFileSync(f, fixed);
  }
  const animFile = emitted.find((f) => f.endsWith("anim.js"));
  if (!animFile) { say(`  tsc emitted no anim.js:\n${tsc.stdout || ""}${tsc.stderr || ""}`); return null; }
  const anim = await import(pathToFileURL(animFile).href);
  const { DEATH_HOLD, ROUND_HOLD } = await import(pathToFileURL(resolve(ROOT, "src/game/deathcam.mjs")).href);

  const man = (cls, extra = {}) => ({
    id: "d", name: "", warriorClass: cls, team: "none", ready: true,
    position: { x: 0, y: 0, z: 0 }, rotation: 0, velocity: { x: 0, y: 0, z: 0 },
    health: 0, maxHealth: 100, stamina: 100, maxStamina: 100, state: "idle",
    attackDir: "right", blockDir: "right",
    attackTimer: 0, blockTimer: 0, dodgeTimer: 0, staggerTimer: 0,
    abilityCooldown: 0, abilityActive: false, abilityTimer: 0,
    kills: 0, deaths: 0, damage: 0, score: 0, lastHitBy: "",
    comboCount: 0, comboTimer: 0, invincible: false, invincibleTimer: 0,
    ...extra,
  });

  /**
   * One death, sampled on the committed pose.
   *
   * The man is stood up and idled for half a second first, so the collapse
   * starts from a real standing pose rather than from the zeroed `rig.last` a
   * fresh rig carries — which is a body that is ALREADY limp, and would flatter
   * every number below.
   */
  const oneDeath = (cls, cause, zone) => {
    const parent = new THREE.Group();
    const player = man(cls);
    const rig = anim.createWarriorRig(parent, player, undefined, { tier: "high", shadows: false });
    const motion = anim.createMotion(player);
    const ctx = { dt: 1 / 60, rawDt: 1 / 60, time: 0, camera: new THREE.PerspectiveCamera(),
      focus: new THREE.Vector3(), localId: "", localState: null, mood: "dusk", quality: { tier: "high", shadows: false } };
    for (let i = 0; i < 30; i++) { ctx.time = i / 60; anim.poseWarrior(rig, motion, player, 1 / 60, ctx); }
    player.state = "dead";
    player.deathCause = cause;
    player.deathZone = zone;
    const keys = Object.keys(rig.last);
    let prev = keys.map((k) => rig.last[k]);
    const track = [];
    const SECONDS = 4;
    for (let i = 0; i < SECONDS * 60; i++) {
      ctx.time = (30 + i) / 60;
      anim.poseWarrior(rig, motion, player, 1 / 60, ctx);
      const now = keys.map((k) => rig.last[k]);
      // Per-frame motion of the pose, as the largest single-joint change in
      // radians (or metres, for the three position channels). A sum would let
      // twenty joints each creeping 1e-4 read as more motion than one arm
      // swinging, and it is the visible joint that decides whether a body is
      // still moving.
      let d = 0;
      for (let k = 0; k < now.length; k++) d = Math.max(d, Math.abs(now[k] - prev[k]));
      track.push({ t: (i + 1) / 60, d, prx: rig.last.prx });
      prev = now;
    }
    // Settle time at three thresholds, so no single arbitrary number carries
    // the verdict. 1e-3 rad is about 0.06 degrees per frame — well below what
    // an eye reads as motion at fight distance.
    const settle = (thr) => { let last = 0; for (const s of track) if (s.d > thr) last = s.t; return last; };
    const finalPrx = track[track.length - 1].prx;
    // When the topple reaches 99% of where it ends up — "the body has landed".
    let landed = NaN;
    for (const s of track) if (Math.abs(s.prx - finalPrx) <= Math.abs(finalPrx) * 0.01) { landed = s.t; break; }
    // What the collapse was actually SHAPED by, printed beside the durations.
    // Without this column a zone the severance refused is indistinguishable
    // from a zone that has no effect, and the table quietly becomes evidence
    // for the wrong conclusion.
    const sh = rig.gore.shape;
    return { cls, cause, zone, settle3: settle(1e-3), settle4: settle(1e-4), settle2: settle(1e-2), landed, finalPrx,
      seam: rig.gore.cut ? rig.gore.cut.seam : null,
      shape: `${sh.halved ? "halved" : `lean${f2(sh.lean)} spin${f2(sh.spin)} crum${f2(sh.crumple)}`}` };
  };

  // THE ZONE NAMES ARE `HitZone`'s, VERBATIM, and that is not pedantry: the
  // first draft of this table used "leftArm" and "leftLeg", `sever()` refused
  // both, `shapeOf(null)` handed back INTACT, and the harness printed six
  // identical rows that looked like proof the death is one canned clip. It was
  // proof of nothing except that the ruler had invented its own vocabulary.
  // See src/game/types.ts:27 for the eight the wire can actually carry.
  const cases = [
    ["warden", null, null],       // no cut at all — the plain topple
    ["berserker", null, "torso"], // a hit that takes nothing off
    ["huscarl", "fire", null],    // burned: never severs
    ["runekeeper", null, "head"], // crumple 1 — he goes down where he stood
    ["warden", null, "armL"],     // a torque: the body keeps turning
    ["berserker", null, "legL"],  // the leg he was standing on
    ["huscarl", null, "waist"],   // halved — halfLayer, a different clock
  ];
  const rows = cases.map(([c, cause, zone]) => oneDeath(c, cause, zone));

  say();
  say("  COLLAPSE — how long the body keeps moving after the killing blow.");
  say("  Measured on rig.last, the pose that actually reached the bones.");
  say();
  say("    class        cause  zone   seam    landed  @1e-2  @1e-3  @1e-4   collapse shape");
  for (const r of rows) {
    say(`    ${r.cls.padEnd(11)} ${String(r.cause ?? "-").padEnd(6)} ${String(r.zone ?? "-").padEnd(6)} ` +
        `${String(r.seam ?? "-").padEnd(7)} ${f2(r.landed).padStart(5)}s ${f2(r.settle2).padStart(5)}s ` +
        `${f2(r.settle3).padStart(6)}s ${f2(r.settle4).padStart(6)}s   ${r.shape}`);
  }
  const collapse = stats(rows.map((r) => r.settle3));
  say();
  say(`  COLLAPSE DURATION (1e-3 rad/frame floor): p50 ${f2(collapse.p50)}s  worst ${f2(collapse.max)}s`);

  say();
  say("  HOLD — how long the lens stays, from deathcam.mjs's own exported clock.");
  say(`    your own death   fall ${f2(DEATH_HOLD.fall)}s + move ${f2(DEATH_HOLD.move)}s + linger ${f2(DEATH_HOLD.linger)}s` +
      `  =  ${f2(DEATH_HOLD.total)}s`);
  if (ROUND_HOLD) {
    const rb = ROUND_HOLD;
    const total = rb.total ?? (rb.fall ?? 0) + (rb.move ?? 0) + (rb.linger ?? 0);
    say(`    the round's      fall ${f2(rb.fall)}s + move ${f2(rb.move)}s + linger ${f2(rb.linger)}s  =  ${f2(total)}s`);
  }
  say();
  // The owner's third sentence — "having enough time to see the death" — is two
  // separate questions and they have different answers. Asking only the first
  // would report the death camera as clean and never look at the camera that
  // actually plays on the death everybody watches.
  //
  //   1. DOES THE LENS EVER CUT AWAY MID-COLLAPSE?  total hold vs collapse.
  //      This is the literal reading of "enough time", and it is the one that
  //      would make this a defect rather than a preference.
  //   2. IS THE LENS STILL WHILE HE FALLS?  the `fall` beat vs collapse.
  //      `deathcam.mjs` is explicit that the still opening is the part where
  //      you watch your own body buckle; a lens that starts travelling with
  //      half the collapse left is showing it from a moving camera, which is a
  //      weaker claim than a cut but is still a number and not a taste.
  const cams = [["your own death", DEATH_HOLD], ["the round's final death", ROUND_HOLD]];
  say(`  THE QUESTION, asked of BOTH cameras — they do not have the same answer.`);
  say();
  say(`    camera                    hold   still   worst collapse   cuts away?   still enough?`);
  const cam = [];
  for (const [label, H] of cams) {
    const total = H.total ?? (H.fall + H.move + H.linger);
    const cuts = total < collapse.max;
    const stillEnough = H.fall >= collapse.max;
    cam.push({ label, total, fall: H.fall, cuts, stillEnough,
      overrun: rows.filter((r) => r.settle3 > H.fall).length });
    say(`    ${label.padEnd(24)} ${f2(total).padStart(5)}s ${f2(H.fall).padStart(6)}s ` +
        `${f2(collapse.max).padStart(13)}s   ${(cuts ? "YES" : "no").padStart(9)}   ${(stillEnough ? "yes" : "NO").padStart(11)}`);
  }
  say();
  say(`    "cuts away?"     the lens leaves before the body has stopped moving.`);
  say(`                     This is the literal reading of the owner's sentence.`);
  say(`    "still enough?"  the lens is still for the WHOLE collapse, which is`);
  say(`                     what deathcam.mjs's own header says the fall beat is for.`);

  return { rows, collapse, hold: DEATH_HOLD, cam };
}

// ===========================================================================
// §1  THE FREEZE  — a real fight, the real pose path, per warrior per frame
// ===========================================================================

/**
 * The in-flight rewrite. Anchored on property names, counted, and voided if a
 * patch matched nothing.
 *
 * ORDER MATTERS. `summary` and `intermission` are matched first and rewritten,
 * which removes them from the text; `fight` then matches only what is left.
 * That is what lets three structurally similar call sites report three
 * different site indices without depending on a single minified identifier.
 */
const PATCHES = {
  summary: {
    name: "tag the summary restage pose call",
    subs: [[/\.poseWarrior\)\((\w+)\.rig,\1\.motion,(\w+\.player),(\w+),(\w+),/g,
            `.poseWarrior)(window.__fzTag(0,$1,$2,$3,$4),$1.motion,$2,$3,$4,`]],
  },
  intermission: {
    name: "tag the intermission pose call",
    subs: [[/\.poseWarrior\)\((\w+)\.rig,\1\.motion,(\w+),(\w+),(\w+),\{groundAt:/g,
            `.poseWarrior)(window.__fzTag(1,$1,$2,$3,$4),$1.motion,$2,$3,$4,{groundAt:`]],
  },
  fight: {
    name: "tag the fight-loop pose call",
    subs: [[/\.poseWarrior\)\((\w+)\.rig,\1\.motion,(\w+),(\w+),(\w+),/g,
            `.poseWarrior)(window.__fzTag(2,$1,$2,$3,$4),$1.motion,$2,$3,$4,`]],
  },
  /**
   * SUPPRESS THE DRAW, AND NOTHING ELSE — and this one is not optional here.
   *
   * This box has no GPU; it rasterises through SwiftShader, which draws a real
   * fight at about one frame a second. §1's whole quantity is "did the pose
   * change BETWEEN CONSECUTIVE FRAMES", and at one frame a second that question
   * is meaningless: a second of wall time separates neighbours, every layer has
   * moved a long way, and no freeze shorter than a second could ever be seen.
   * A first run of this harness with drawing on was abandoned for exactly that.
   *
   * `postfx.render` is the only call in the loop that issues GL. The
   * interpolation, the animation, the pose, the camera, the vfx and the audio
   * all still run — so everything §1 measures is untouched, and the client runs
   * at a frame rate a desktop would actually produce. Swapping the method NAME
   * rather than removing the call keeps the expression and its arguments
   * intact, so the surrounding comma sequences are undisturbed.
   *
   * What this costs: no number here is a frame RATE, and none is printed as
   * one. Frame COUNTS and pose EQUALITY are unaffected.
   */
  nodraw: {
    name: "suppress the draw call",
    subs: [[/\.postfx\.render\((\w+),(\w+)\)/g, `.postfx[window.__fzNoDraw?"__none":"render"]?.($1,$2)`]],
  },
  /**
   * R1's lever, and it is deliberately a SABOTAGE and not a fix. `idleLayer` is
   * the only thing animating a man who is doing nothing; zeroing its weight
   * should send the static-frame count through the roof. If it does not, the
   * ruler above is not reading the pose it claims to read.
   *
   * ANCHORED ON THE CALM EXPRESSION, NOT ON A CALL. `idleLayer` is a static
   * single-caller function and the minifier INLINES it — there is no call to
   * patch, and an anchor written against `idleLayer(t,seed,wounded,calm)` in
   * `src/` matches nothing in the build. What survives is `calm` itself:
   *
   *     let eF=n3(1-n.wAction-.7*n.wBlock-.85*n.wMove);eF>.001&&(...)
   *
   * so the lever forces that whole expression to 0. The gate below it then
   * never opens, every man alive stops breathing, and §1's static-frame count
   * must go through the roof. What pins the match is the shape no rename can
   * touch: three property names and the three coefficients they are weighted
   * by. If those move in `src/`, this patch reports MISSED and voids itself
   * rather than silently measuring an unlevered build.
   */
  leverIdle: {
    name: "R1 lever: force calm to zero, killing the idle layer",
    subs: [[/(\w+)\(1-(\w+)\.wAction-\.7\*\2\.wBlock-\.85\*\2\.wMove\)/g, `(0)`]],
  },
};

async function installPatches(ctx, names) {
  const hits = Object.fromEntries(names.map((n) => [n, 0]));
  if (!names.length) return hits;
  await ctx.route("**/*.js*", async (route) => {
    let res; try { res = await route.fetch(); } catch { return route.abort(); }
    let body; try { body = await res.text(); } catch { return route.fulfill({ response: res }); }
    let touched = false;
    for (const n of names) {
      for (const [from, to] of PATCHES[n].subs) {
        const rx = new RegExp(from.source, from.flags.includes("g") ? from.flags : from.flags + "g");
        // Count first, so a patch that matched nothing still reports 0 and
        // voids its own result rather than passing silently.
        const n0 = (body.match(rx) || []).length;
        if (n0) { hits[n] += n0; body = body.replace(rx, to); touched = true; }
      }
    }
    if (!touched) return route.fulfill({ response: res });
    route.fulfill({ response: res, body });
  });
  return hits;
}

/** A patch that matched nothing voids its own experiment. R2's sibling. */
function patchesLanded(hits, names) {
  let ok = true;
  for (const n of names) {
    if (!hits[n]) { say(`  PATCH MISSED: ${PATCHES[n].name} — nothing in the served bundle matched. Result VOID.`); ok = false; }
  }
  return ok;
}

/**
 * Everything the page collects, installed before a line of app code runs.
 *
 * `__fzTag` is called with the SLOT and returns `slot.rig`, so it sits exactly
 * in the argument position the rig occupied and changes nothing about what
 * `poseWarrior` receives. It runs BEFORE the pose is rebuilt, which means the
 * `rig.last` it reads is last frame's committed pose — the correct thing to
 * sample, because it is the pose that was actually on screen for a frame.
 */
const COLLECTOR = () => {
  const w = window;
  w.__fz = {
    frames: 0,            // rAF callbacks that have run
    samples: [],          // one per warrior per posed frame
    roster: [],           // { frame, ids } from the wire, to catch a man NEVER posed
    started: performance.now(),
    on: false,
    uid: 0,
  };
  const R = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => R((t) => { w.__fz.frames++; cb(t); });

  // The wire, read for the ROSTER only. A man in `players` who never reaches
  // `__fzTag` on a frame is a man the render loop skipped, which is the
  // orchestrator's stated hypothesis and has to be falsifiable.
  const RealWS = window.WebSocket;
  function Tapped(url, protocols) {
    const s = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    s.addEventListener("message", (e) => {
      const d = e.data;
      if (typeof d !== "string" || d.indexOf('"game_state"') < 0) return;
      if (!w.__fz.on) return;
      try {
        const m = JSON.parse(d);
        const st = m.data || m.state || m;
        const players = st.players || (st.room && st.room.players);
        if (!players) return;
        w.__fz.roster.push({
          frame: w.__fz.frames,
          state: st.state || (st.room && st.room.state) || "",
          ids: Object.keys(players),
          alive: Object.keys(players).filter((k) => players[k].state !== "dead"),
        });
      } catch { /* a packet we cannot read is not a roster */ }
    });
    return s;
  }
  Tapped.prototype = RealWS.prototype;
  for (const k of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) Tapped[k] = RealWS[k];
  window.WebSocket = Tapped;

  w.__fzTag = (site, slot, player, dt, ctx) => {
    const rig = slot.rig;
    const f = w.__fz;
    if (!f.on) return rig;
    const m = slot.motion;
    const L = rig.last;
    // A weighted sum, not a plain one: twenty channels that happen to cancel
    // would read as an unchanged pose, and an index weight makes that
    // vanishingly unlikely. Exactness is the point — see the header.
    let sum = 0, i = 0;
    for (const k in L) { i++; sum += L[k] * (i * 1.000173); }
    if (rig.__fzUid === undefined) rig.__fzUid = ++f.uid;
    if (f.samples.length < 400000) f.samples.push({
      f: f.frames, t: performance.now(), site, dt,
      id: player.id, st: player.state, hp: player.health,
      uid: rig.__fzUid,
      sum,
      // The two channels that carry the owner's own words — "arms by their
      // side". `arx` is the weapon shoulder, `olx` the off shoulder.
      arx: L.arx, olx: L.olx, py: L.py,
      // The state the orchestrator's hypothesis and the blend hypothesis both
      // turn on.
      bl: m.blend, ls: m.lastState, wm: m.wMove, wa: m.wAction, wb: m.wBlock,
      at: m.actT, sd: m.seed,
      ct: ctx.time,
      // Lifecycle: is this rig still in the scene and visible at all?
      vis: rig.body.visible ? 1 : 0, par: rig.group.parent ? 1 : 0,
    });
    return rig;
  };
};

/** Landing -> training -> a fight with as many bots as the muster will take. */
async function reachFight(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByText("Training", { exact: false }).first().click();
  await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click();
  const more = page.getByLabel("More AI warriors");
  for (let i = 0; i < 10 && await more.isEnabled().catch(() => false); i++) await more.click();
  await page.getByText("DRAW STEEL", { exact: false }).first().click();
  await page.waitForFunction(() => window.__fz.frames > 60, null, { timeout: 120000 });
}

async function runFight(browser, { patches, secs, shots = null, noDraw = true }) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const hits = await installPatches(ctx, patches);
  await ctx.addInitScript(COLLECTOR);
  if (noDraw) await ctx.addInitScript(() => { window.__fzNoDraw = true; });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => say(`  [page-error] ${String(e).slice(0, 160)}`));
  await reachFight(page, `http://127.0.0.1:${PORT}/?quality=low`);
  const canvas = page.locator("canvas").first();
  await canvas.click({ position: { x: 480, y: 270 } }).catch(() => {});
  // Fight, rather than stand in it. A freeze that only happens to a man who has
  // been hit, staggered, knocked down or respawned will never appear in a
  // sample where nobody is fighting.
  let stop = false;
  const fight = (async () => {
    const keys = ["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft"];
    let i = 0;
    while (!stop) {
      const k = keys[i++ % keys.length];
      await page.keyboard.down(k).catch(() => {});
      await page.mouse.move(480 + Math.sin(i * 0.7) * 300, 270 + Math.cos(i * 0.4) * 90).catch(() => {});
      if (i % 3 === 0) await page.mouse.down().catch(() => {});
      if (i % 7 === 0) await page.mouse.down({ button: "right" }).catch(() => {});
      await new Promise((r) => setTimeout(r, 170));
      if (i % 3 === 0) await page.mouse.up().catch(() => {});
      if (i % 7 === 0) await page.mouse.up({ button: "right" }).catch(() => {});
      await page.keyboard.up(k).catch(() => {});
    }
  })();
  // Let the fight settle before the ruler is armed: the first seconds carry
  // shader compilation and texture upload, which are a load screen and not a
  // freeze.
  await new Promise((r) => setTimeout(r, 5000));
  await page.evaluate(() => {
    const f = window.__fz;
    f.samples.length = 0; f.roster.length = 0; f.started = performance.now(); f.on = true;
  });

  // R5 — WATCH IT MOVE. A still cannot show a freeze. If a warrior is caught
  // static, a strip of consecutive frames is the only artefact that can show a
  // human what the number means.
  const strip = [];
  if (shots) {
    mkdirSync(shots.dir, { recursive: true });
    const t0 = Date.now();
    for (let i = 0; i < shots.count; i++) {
      const file = resolve(shots.dir, `f${String(i).padStart(3, "0")}.png`);
      await page.screenshot({ path: file }).catch(() => {});
      strip.push({ file, at: Date.now() - t0 });
    }
  }
  await new Promise((r) => setTimeout(r, secs * 1000));
  stop = true; await fight.catch(() => {});
  const data = await page.evaluate(() => {
    const f = window.__fz;
    return { samples: f.samples, roster: f.roster, frames: f.frames, elapsed: performance.now() - f.started };
  });
  await ctx.close();
  return { ...data, hits, strip };
}

/**
 * The analysis. One pass per warrior, in frame order.
 *
 * A RUN is a maximal stretch of consecutive posed frames whose committed pose
 * checksum never changes. Runs are attributed to the state the man was in, so
 * a corpse lying still — which is CORRECT and is not the defect — never gets
 * counted as a freeze.
 */
function analyse(r) {
  const byId = new Map();
  for (const s of r.samples) {
    if (s.site !== 2) continue;          // the fight loop only
    let a = byId.get(s.id); if (!a) byId.set(s.id, a = []);
    a.push(s);
  }
  const runs = [];
  const perMan = [];
  for (const [id, arr] of byId) {
    arr.sort((a, b) => a.f - b.f);
    let staticFrames = 0, live = 0;
    let cur = null;
    const rigChanges = new Set(arr.map((s) => s.uid)).size;
    // Frames the fight loop ran but this man was not posed in. The
    // orchestrator's stated hypothesis, made falsifiable.
    const posedFrames = new Set(arr.map((s) => s.f));
    for (let i = 1; i < arr.length; i++) {
      const p = arr[i - 1], s = arr[i];
      // Only a man who is UPRIGHT and ALIVE can be "stuck standing". A corpse
      // that has settled, a man face down, and a man being restaged in the
      // summary are all excluded by construction — counting them would be the
      // ruler measuring the wrong quantity for the eleventh time.
      const upright = s.st !== "dead" && s.st !== "knocked" && s.st !== "rising";
      if (!upright) { cur = null; continue; }
      live++;
      // Consecutive frames only: a gap in frame numbers means he was not posed
      // in between, which is a different defect and is counted separately.
      const consecutive = s.f === p.f + 1;
      const frozen = consecutive && s.sum === p.sum;
      if (frozen) {
        staticFrames++;
        if (!cur) { cur = { id, from: p, to: s, frames: 2 }; runs.push(cur); }
        else { cur.to = s; cur.frames++; }
      } else cur = null;
    }
    perMan.push({
      id, samples: arr.length, live, staticFrames,
      pctStatic: live ? (100 * staticFrames) / live : 0,
      rigChanges,
      missed: (arr.length ? (arr[arr.length - 1].f - arr[0].f + 1) - posedFrames.size : 0),
    });
  }
  for (const run of runs) run.secs = (run.to.t - run.from.t) / 1000;
  runs.sort((a, b) => b.secs - a.secs);
  return { perMan, runs };
}

async function phaseFreeze(browser) {
  rule("§2  THE FREEZE   (a real fight, the real pose path, per warrior per frame)");
  say(`  The owner: "the players sometimes randomly stand straight up stuck fully still ...`);
  say(`             they go static, arms by their side".`);
  say();
  // The measurement run draws NOTHING. See the `nodraw` patch for why that is
  // not a shortcut but the only way the question can be asked on this box.
  // R5's frame strip is a separate, drawing run — a still cannot show a freeze,
  // so the strip is taken with the rasteriser on and the numbers are not.
  const names = ["nodraw", "summary", "intermission", "fight"];
  if (LEVER === "idle") names.push("leverIdle");
  const r = await runFight(browser, { patches: names, secs: SECS, noDraw: true });
  for (const n of names) say(`  patch "${PATCHES[n].name}": ${r.hits[n]} site(s)`);
  if (!patchesLanded(r.hits, names)) return { void: true };

  const a = analyse(r);
  const totalLive = a.perMan.reduce((s, m) => s + m.live, 0);
  const totalStatic = a.perMan.reduce((s, m) => s + m.staticFrames, 0);
  const totalMissed = a.perMan.reduce((s, m) => s + m.missed, 0);
  const rigChurn = a.perMan.filter((m) => m.rigChanges > 1);

  say();
  say(`  ${r.samples.length} pose calls recorded over ${f2(r.elapsed / 1000)} s and ${r.frames} frames,`);
  say(`  across ${a.perMan.length} warriors.`);
  say();
  say(`  STATIC WARRIOR-FRAMES   ${totalStatic} of ${totalLive} upright-and-alive  ` +
      `(${((100 * totalStatic) / (totalLive || 1)).toFixed(2)}%)`);
  say(`    A static frame is one where the pose committed to the bones is`);
  say(`    BIT-IDENTICAL to the frame before it, on a man who is alive and not`);
  say(`    on the ground. A breathing man cannot produce one.`);
  say();

  // ---- the orchestrator's hypothesis, answered out loud either way.
  say(`  WAS poseWarrior CALLED FOR HIM?`);
  say(`    warrior-frames where the fight loop ran and a man in it was NOT posed: ${totalMissed}`);
  say(`  WAS HIS RIG SWAPPED UNDER HIM?`);
  say(`    warriors whose rig object identity changed mid-sample: ${rigChurn.length}` +
      (rigChurn.length ? ` (${rigChurn.map((m) => `${m.id}:${m.rigChanges}`).join(", ")})` : ""));
  const dts = r.samples.filter((s) => s.site === 2).map((s) => s.dt);
  const ds = stats(dts);
  const zeroDt = dts.filter((d) => !(d > 1e-6)).length;
  say(`  WAS dt ZERO?`);
  say(`    dt handed to poseWarrior: p50 ${f3(ds?.p50 * 1000)} ms  p99 ${f3(ds?.p99 * 1000)} ms  min ${f3(ds?.min * 1000)} ms`);
  say(`    calls with dt <= 0: ${zeroDt}`);
  const cts = r.samples.filter((s) => s.site === 2).map((s) => s.ct);
  const ctStuck = (() => { let n = 0; for (let i = 1; i < cts.length; i++) if (cts[i] === cts[i - 1]) n++; return n; })();
  say(`  DID THE RENDER CLOCK STOP?`);
  say(`    consecutive pose calls sharing one ctx.time: ${ctStuck} (same frame counts here, so this is an upper bound)`);

  say();
  if (a.runs.length) {
    say(`  THE ${Math.min(10, a.runs.length)} LONGEST FREEZES`);
    say(`    secs  frames  warrior            state       blend  wMove wAct  wBlk   arx     olx`);
    for (const run of a.runs.slice(0, 10)) {
      const s = run.to;
      say(`    ${f2(run.secs).padStart(4)}  ${String(run.frames).padStart(6)}  ${run.id.slice(0, 16).padEnd(17)} ` +
          `${String(s.st).padEnd(11)} ${f2(s.bl).padStart(5)} ${f2(s.wm).padStart(5)} ${f2(s.wa).padStart(4)} ` +
          `${f2(s.wb).padStart(5)} ${f3(s.arx).padStart(7)} ${f3(s.olx).padStart(7)}`);
    }
    const long = a.runs.filter((x) => x.secs >= 0.25);
    say();
    say(`  FREEZES LASTING >= 0.25 s: ${long.length} in ${f2(r.elapsed / 1000)} s ` +
        `= ${f2((60 * long.length) / (r.elapsed / 1000))} per minute of fight.`);
  } else {
    say(`  NO static run of two or more consecutive frames was recorded.`);
  }

  say();
  say(`  PER WARRIOR`);
  say(`    warrior            samples   live  static   %static  rigs  unposed`);
  for (const m of a.perMan.sort((x, y) => y.pctStatic - x.pctStatic)) {
    say(`    ${m.id.slice(0, 16).padEnd(17)} ${String(m.samples).padStart(8)} ${String(m.live).padStart(6)} ` +
        `${String(m.staticFrames).padStart(7)} ${m.pctStatic.toFixed(2).padStart(8)}  ${String(m.rigChanges).padStart(4)} ${String(m.missed).padStart(8)}`);
  }

  return { void: false, perMan: a.perMan, runs: a.runs, totalStatic, totalLive, totalMissed, rigChurn: rigChurn.length,
    zeroDt, elapsed: r.elapsed, strip: r.strip, samples: r.samples };
}

function waitForServer(url, timeoutMs = 180000) {
  const t0 = Date.now();
  return new Promise((ok, fail) => {
    const poll = async () => {
      try { const res = await fetch(url); if (res.ok || res.status === 404) return ok(); } catch { /* wait */ }
      if (Date.now() - t0 > timeoutMs) return fail(new Error("server never came up"));
      setTimeout(poll, 700);
    };
    poll();
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const result = {};
  if (has("collapse")) result.collapse = await phaseCollapse();

  if (has("freeze")) {
    const server = spawn("node", ["custom-server.mjs"], {
      cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForServer(`http://127.0.0.1:${PORT}/api/health`);
    const pre = "/opt/pw-browsers/chromium";
    const browser = await chromium.launch({
      ...(existsSync(pre) ? { executablePath: pre } : {}),
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
    });
    try { result.freeze = await phaseFreeze(browser); }
    finally {
      await browser.close().catch(() => {});
      if (server && !server.killed) server.kill("SIGTERM");
    }
  }
  finish(result);
}

function finish(R) {
  rule("VERDICT");
  if (R.collapse) {
    const c = R.collapse;
    say(`  DEATH CLOCK   collapse ${f2(c.collapse.min)}-${f2(c.collapse.max)}s across ${c.rows.length} kinds of death.`);
    for (const k of c.cam) {
      say(`                ${k.label.padEnd(24)} hold ${f2(k.total)}s — ` +
          `${k.cuts ? "CUTS AWAY mid-collapse" : "never cuts away"}; ` +
          `still for ${f2(k.fall)}s, ${k.stillEnough ? "covering the whole fall" : `${k.overrun}/${c.rows.length} collapses still moving when it starts to travel`}.`);
    }
  }
  if (R.freeze && !R.freeze.void) {
    const f = R.freeze;
    const pctStatic = (100 * f.totalStatic) / (f.totalLive || 1);
    const long = f.runs.filter((x) => x.secs >= 0.25).length;
    say(`  FREEZE        ${pctStatic.toFixed(2)}% of upright warrior-frames committed a bit-identical pose.`);
    say(`                ${long} freeze(s) of 0.25 s or longer; worst ${f2(f.runs[0]?.secs)} s.`);
    say(`                unposed warrior-frames ${f.totalMissed}; rig swaps ${f.rigChurn}; dt<=0 calls ${f.zeroDt}.`);
  } else if (R.freeze?.void) {
    say(`  FREEZE        VOID — a patch missed. No number from this run may be quoted.`);
  }
  say();
  say(`  DEFERRALS, on the verdict line and not below it (R4):`);
  say(`    - This harness GATES NOTHING unless --gate is passed. It is a ruler.`);
  say(`    - No frames-per-second figure here is a player's: this box has no GPU`);
  say(`      and rasterises through SwiftShader. Frame COUNTS and pose EQUALITY`);
  say(`      are unaffected by that; frame RATES would be, and none is printed.`);
  say(`    - The collapse phase measures ONE warrior at a time with no wire and`);
  say(`      no ground under him. It is the animation's own clock, which is the`);
  say(`      thing the owner's sentence is about, and it is not a claim about`);
  say(`      what a body does on a slope.`);
  say(`    - The freeze phase attributes nothing to a cause. It records blend,`);
  say(`      the three layer weights, dt, ctx.time, rig identity and whether the`);
  say(`      call happened at all, and prints them beside every freeze it caught.`);
  say(`      Reading those columns is a human's job and is not gated.`);
  say();
  say(`  Artefacts: ${OUT}`);
  if (GATE) {
    const f = R.freeze;
    const bad = f && !f.void && f.runs.filter((x) => x.secs >= 0.25).length > 0;
    if (bad) { say(`\n  FAIL (--gate): a warrior stood bit-identical for 0.25 s or more.`); process.exitCode = 1; }
    else say(`\n  PASS (--gate): no upright warrior held one pose for 0.25 s.`);
  }
}

main().catch((e) => { console.error("[freezetest] failed:", e); process.exitCode = 1; });
