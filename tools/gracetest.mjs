#!/usr/bin/env node
// ============================================================
// GRACETEST — does the loading flash stop before the fight starts?
//
//   node tools/gracetest.mjs
//
// The owner's report: "when loading in the players flash while counting down
// but continue to flash a few seconds after countdown has finished, the
// flashing should stop before the fight starts."
//
// That is a bug you can see and no test could, because it lived in the seam
// between two files. `startRound` armed a two-second untouchable flag and set
// the room to `countdown`; the ONLY code that spends that flag is `stepRoom`,
// which `gameTick` skips for any room that is not `fighting`. So the flag was
// still set on the first frame of the fight and for two seconds after it, and
// the renderer blinked every body on and off at 12 Hz for exactly as long as
// the flag was true. Neither half is wrong on its own. Together they are the
// flashing.
//
// So this harness spans the seam. It drives the REAL engine — `getEngine()` is
// the same singleton `custom-server.mjs` hands a socket to, already ticking on
// its own interval — records every packet a client would receive with the time
// it arrived, and then REPLAYS those packets through the exact functions the
// renderer runs (`underGrace` and `easeGrace` from `src/game/grace.mjs`, which
// `hud3d.ts` and `GameCanvas.tsx` import). No browser: the whole question is
// arithmetic over a packet log, and the CPU answers it in a few seconds.
//
// The replay is run three times over one recording — at 60 fps, at a punishing
// 4 fps, and with every packet delivered a quarter-second late — because the
// standing lesson is that a duration drifts on a slow frame, a late packet and
// a phone, and this box produces all three. A fix that is a shorter timer
// passes the first replay and fails the other two.
//
// Exits non-zero if any claim fails.
// ============================================================
import { getEngine } from "../src/game/engine.mjs";
import { underGrace, easeGrace } from "../src/game/grace.mjs";
import { readFile } from "fs/promises";

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const engine = getEngine();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- recording
//
// Every packet, with the millisecond it landed. `state` is reconstructed the
// way `src/app/page.tsx` reconstructs it, because that is what the renderer
// actually holds: a thin `countdown` tick carries only a number, and the page
// pins the phase to "countdown" itself. Modelling the raw packet instead of
// the page's merge would test a client that does not exist.
function record(ms) {
  const t0 = Date.now();
  const log = [];
  let phase = "lobby";
  let players = {};
  const sid = engine.connect((str) => {
    const m = JSON.parse(str);
    const d = m.data || {};
    if (m.type === "countdown") phase = "countdown";
    else if (typeof d.state === "string") phase = d.state;
    if (d.players) players = d.players;
    log.push({ t: Date.now() - t0, type: m.type, state: phase, players });
  });
  engine.message(sid, { type: "solo", data: { name: "Grace", botCount: 3, difficulty: "jarl", autoStart: true } });
  return sleep(ms).then(() => log);
}

// ------------------------------------------------------------------ replay
//
// One client's frame loop over a recorded packet log. `lateMs` delays delivery
// so a frame sees a packet the server sent a quarter-second ago — the phone
// case. Returns one row per frame: the phase the client believed, and the
// drawn mark for every warrior, eased exactly as `hud3d.ts` eases it.
function replay(log, fps, lateMs = 0, blind = false) {
  const dt = 1 / fps;
  const end = log[log.length - 1].t;
  const drawn = new Map();
  const frames = [];
  let idx = 0;
  let held = null;
  for (let ms = 0; ms <= end; ms += dt * 1000) {
    while (idx < log.length && log[idx].t + lateMs <= ms) held = log[idx++];
    if (!held) continue;
    const row = { ms, state: held.state, marks: {}, target: 0 };
    for (const p of Object.values(held.players)) {
      // `blind` is the client this change replaces: it read the untouchable
      // flag alone, with no idea what phase the room was in. Replaying through
      // it proves the PACKET STREAM is clean rather than merely that today's
      // renderer filters it — so a future renderer that forgets the phase gate
      // still cannot resurrect the flashing, and this harness still fails if
      // the server ever arms grace against a stopped clock again.
      const target = (blind ? !!p.invincible : underGrace(p, held.state)) ? 1 : 0;
      const next = easeGrace(drawn.get(p.id) ?? 0, target, dt);
      drawn.set(p.id, next);
      row.marks[p.id] = next;
      row.target = Math.max(row.target, target);
    }
    frames.push(row);
  }
  return frames;
}

const maxMark = (row) => Math.max(0, ...Object.values(row.marks));

/**
 * FLASHING, defined so it can be counted.
 *
 * Not "the mark changed direction" — a bot dodging mid-fight re-arms the grace
 * for real and the mark rightly comes back up, and an early version of this
 * check called that a flash. What flashing means is a mark that reverses
 * WHILE THE SERVER'S ANSWER HAS NOT CHANGED: motion the picture invented. So
 * the recording is cut into runs of constant truth and reversals are counted
 * inside each run, where an ease is monotone by construction and a 12 Hz strobe
 * turns on every other frame.
 */
function flashes(frames) {
  let n = 0, prevTarget = null, prevVal = null, dir = 0;
  for (const f of frames) {
    if (f.target !== prevTarget) { prevTarget = f.target; prevVal = null; dir = 0; }
    const v = maxMark(f);
    if (prevVal !== null) {
      const d = Math.sign(+(v - prevVal).toFixed(4));
      if (d !== 0 && dir !== 0 && d !== dir) n++;
      if (d !== 0) dir = d;
    }
    prevVal = v;
  }
  return n;
}

// ------------------------------------------------------------------- claims
const log = await record(9500);

const countdownRows = log.filter((r) => r.state === "countdown");
const firstFight = log.find((r) => r.state === "fighting");
const fightIdx = log.indexOf(firstFight);

check("a real countdown was driven", countdownRows.length > 0 && fightIdx > 0,
  `${countdownRows.length} countdown packets, fight at ${firstFight ? firstFight.t : "never"}ms`);

// 1. THE SOURCE. Nobody may be flagged untouchable while the room is counting
//    down, because the clock that spends that flag is not running yet. This is
//    the assertion the old code fails: it read 2/2 for every countdown packet.
const invDuringCountdown = countdownRows.reduce(
  (n, r) => Math.max(n, Object.values(r.players).filter((p) => p.invincible).length), 0);
check("nobody carries an untouchable flag through the countdown", invDuringCountdown === 0,
  `worst countdown packet had ${invDuringCountdown} flagged`);

// 2. THE GRACE STILL EXISTS. Removing the flashing must not quietly remove the
//    rule — the men are meant to be untouchable for the top of the fight.
const graced = log.slice(fightIdx).some((r) => Object.values(r.players).some((p) => p.invincible));
const gracePackets = log.slice(fightIdx).filter((r) => Object.values(r.players).some((p) => p.invincible));
const graceEnds = gracePackets.length ? gracePackets[gracePackets.length - 1].t - firstFight.t : 0;
check("the grace is armed on the frame the fight starts, and spends itself", graced && graceEnds > 500,
  `grace ran ${graceEnds}ms into the fight`);

// 3. THE OWNER'S BUG. The claim is NOT "nothing is on screen once the fight
//    starts" — the grace is real and it overlaps live combat. Measured in an
//    eight-man moot, the closest warrior is inside his own attack range of
//    another by 636ms into the fight and stays there, so two seconds of
//    untouchability at the top of a round is protecting something and deleting
//    it would be a balance change wearing a bug fix's clothes.
//
//    The claim is that NOTHING RAISED BY THE LOADING PHASE IS STILL ON SCREEN
//    WHEN THE FIGHT STARTS. That has an exact shape: the mark is 0 for every
//    countdown frame including the last, and across the boundary it only ever
//    RISES. A leftover decays across a boundary; an arrival climbs from zero.
//    The bug the owner reported was a decay — a mark still going out two
//    seconds into the fight — and this tells the two apart by their sign.
for (const [label, fps, late] of [["60 fps", 60, 0], ["4 fps", 4, 0], ["quarter-second late packets", 60, 250]]) {
  const frames = replay(log, fps, late);
  const firstFightFrame = frames.findIndex((f) => f.state === "fighting");
  const cdFrames = frames.filter((f) => f.state === "countdown");
  const worstCd = cdFrames.reduce((m, f) => Math.max(m, maxMark(f)), 0);

  const blindCd = replay(log, fps, late, true).filter((f) => f.state === "countdown");
  const worstBlind = blindCd.reduce((m, f) => Math.max(m, maxMark(f)), 0);
  check(`nothing is drawn on any countdown frame, including the last (${label})`,
    cdFrames.length > 0 && worstCd === 0 && worstBlind === 0,
    `${cdFrames.length} frames; worst mark ${worstCd} phase-gated, ${worstBlind} phase-blind`);

  // Across the boundary and through the grace, the mark may only climb. Any
  // fall here is a residue of the countdown fading out inside the fight, which
  // is the defect verbatim.
  let fell = 0, prev = 0;
  for (let i = Math.max(0, firstFightFrame - 1); i < frames.length; i++) {
    const v = maxMark(frames[i]);
    if (v < prev - 1e-6 && v > 0 && frames[i].ms - frames[firstFightFrame].ms < 1200) fell++;
    prev = v;
    if (v >= 1) break;
  }
  check(`nothing from the loading phase is still going out in the fight (${label})`,
    firstFightFrame >= 0 && maxMark(frames[Math.max(0, firstFightFrame - 1)]) === 0 && fell === 0,
    `${fell} falling frames across the boundary`);

  // 4. NOT FLASHING, formally. Zero, not "few": every movement the mark makes
  //    must be answering a change the server sent. The 12 Hz body strobe this
  //    replaces scored about six hundred over a nine-second recording.
  const n = flashes(frames);
  check(`the mark never flashes (${label})`, n === 0,
    `${n} reversals with the server's answer unchanged`);
}

// 5. NO CLIENT-OWNED DURATION. The mark goes out because the server stopped
//    saying it, not because anything elapsed. At 60 fps AND at 4 fps the last
//    drawn frame must sit alongside the last packet that carried the flag —
//    one packet interval plus the ease's tail, and nowhere near the two whole
//    seconds the bug produced.
for (const [label, fps] of [["60 fps", 60], ["4 fps", 4]]) {
  const frames = replay(log, fps, 0);
  const lastMarked = frames.reduce((m, f, i) => (maxMark(f) > 0 ? i : m), -1);
  const lastMarkedMs = lastMarked >= 0 ? frames[lastMarked].ms : -1;
  const truthEndsMs = gracePackets.length ? gracePackets[gracePackets.length - 1].t : -1;
  const lag = lastMarkedMs - truthEndsMs;
  check(`the mark ends with the server, not on a timer (${label})`, Math.abs(lag) < 700,
    `mark and flag part company by ${Math.round(lag)}ms`);
}

// 6. REGRESSION LOCK, and it is a source assertion rather than a measurement —
//    said plainly because the house rule is not to reason from source. The
//    defect was one line, `rig.body.visible = player.invincible ? Math.floor(t
//    * 12) % 2 === 0 : true`, and the only way to prove a deleted line stays
//    deleted is to look for it. Everything above measures behaviour; this
//    stops the exact line coming back.
const anim = await readFile(new URL("../src/game/client/render/anim.ts", import.meta.url), "utf8");
const strobe = /body\.visible\s*=[^;]*Math\.floor/.test(anim);
check("the renderer has no periodic gate on body visibility", !strobe,
  strobe ? "the 12 Hz body strobe is back" : "no strobe in anim.ts");

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
