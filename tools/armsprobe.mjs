#!/usr/bin/env node
/**
 * ARMSPROBE — do the alternate arms TRADE, or do they upgrade? (backlog 7.7b)
 *
 *   node tools/armsprobe.mjs             250 bouts per cell, ~2 min
 *   node tools/armsprobe.mjs --bouts N
 *
 * `tools/classmatrix.mjs` certifies the ROSTER — the four class defaults —
 * and stays untouched: it is a measured instrument with its own bands,
 * mirrors and history, and weaving a second question through it risks the
 * first. This file asks the ARMS question with the same idiom (the engine's
 * own bots over the real wire, per-bout seeded streams, side-swap halves,
 * Wilson intervals, third-man discards) and two claims of its own:
 *
 *   THE TRADE.  Each alternate against ITS OWN class default must land with
 *               its interval inside 35-65%. An alternate outside that is not
 *               a lean, it is an upgrade (or a trap), and either one makes
 *               the choice a lie.
 *   THE FIELD.  Each alternate against the three OTHER defaults must stay
 *               inside 20-80%. Wider than the roster's 30-70 on purpose —
 *               a lean is ALLOWED to sharpen a matchup — but nothing may
 *               become a fight nobody would take.
 *
 * The same ruler blindness classmatrix documents applies here and is worth
 * restating: bots barely block and do not space, so the dane axe's guard
 * price and the gar's reach are UNDER-priced by this instrument. What it
 * reads honestly is health, damage and the stroke — which is most of what
 * the deltas move.
 */
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { makeEngine, ARMS, defaultArmsOf } = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? Number(argv[i + 1]) : dflt;
};
const BOUTS = flag("bouts", 250);
const MASTER = flag("seed", 20260827);
const TICK = 0.05;
const SETTLE_CAP = 30;
const BOUT_CAP = 180;
const TRADE_BAND = { lo: 0.35, hi: 0.65 };
const FIELD_BAND = { lo: 0.20, hi: 0.80 };

// The seeded-stream idiom, classmatrix's own: every bout gets its own
// reproducible noise, and Math.random is restored after each.
let realRandom = null;
function seedStream(seed) {
  realRandom = Math.random;
  let s = seed >>> 0;
  Math.random = () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
function releaseStream() { if (realRandom) { Math.random = realRandom; realRandom = null; } }

function wilson(wins, n, z = 1.96) {
  if (!n) return { p: NaN, lo: 0, hi: 1 };
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p, lo: Math.max(0, (centre - half) / d), hi: Math.min(1, (centre + half) / d) };
}

/** One bout: left spec vs right spec, each {cls, arms}. */
function runBout(left, right, seed, swapSides) {
  seedStream(seed);
  const engine = makeEngine({ autoTick: false });
  const seen = { hits: [], kills: [], playerId: null, latest: null };
  const sid = engine.connect((str) => {
    const m = JSON.parse(str);
    if (m.type === "join") seen.playerId = m.data.playerId;
    if ((m.type === "game_state" || m.type === "lobby_update" || m.type === "countdown"
      || m.type === "round_end") && m.data.players) seen.latest = m.data;
    if (m.type === "hit") seen.hits.push(m.data);
    if (m.type === "kill") seen.kills.push(m.data);
  });
  engine.message(sid, { type: "create", data: { name: "Steward", mode: "blood_moot", bestOf: 1 } });
  const order = swapSides ? [right, left] : [left, right];
  for (const spec of order) {
    engine.message(sid, { type: "add_bot", data: { difficulty: "warrior", warriorClass: spec.cls, arms: spec.arms } });
  }
  engine.message(sid, { type: "start", data: {} });
  const meId = seen.playerId;

  let settled = 0;
  while (settled < SETTLE_CAP && seen.latest?.state !== "fighting") { engine.step(TICK); settled += TICK; }
  if (seen.latest?.state !== "fighting") { engine.stop(); releaseStream(); throw new Error("room never reached `fighting`"); }

  const botIds = Object.keys(seen.latest.players).filter((id) => id.startsWith("bot_"));
  if (botIds.length !== 2) { engine.stop(); releaseStream(); throw new Error(`expected 2 bots, got ${botIds.length}`); }
  const [firstId, secondId] = botIds;
  const leftId = swapSides ? secondId : firstId;
  const rightId = swapSides ? firstId : secondId;
  // The room must have dealt what was asked — class AND arms — or the probe
  // is grading a different fight than it names.
  for (const [id, spec] of [[leftId, left], [rightId, right]]) {
    const p = seen.latest.players[id];
    const want = spec.arms ?? defaultArmsOf(spec.cls);
    if (p.warriorClass !== spec.cls || (p.arms ?? defaultArmsOf(p.warriorClass)) !== want) {
      engine.stop(); releaseStream();
      throw new Error(`asked ${spec.cls}:${want}, dealt ${p.warriorClass}:${p.arms}`);
    }
  }

  const hitsAtBell = seen.hits.length;
  const killsAtBell = seen.kills.length;
  let t = 0, winner = null;
  while (t < BOUT_CAP) {
    const me = seen.latest?.players?.[meId];
    if (me) {
      const r = Math.hypot(me.position.x, me.position.z) || 1;
      engine.message(sid, { type: "input", data: {
        moveX: me.position.x / r, moveZ: me.position.z / r,
        rotationY: Math.atan2(me.position.x / r, me.position.z / r), sprint: true,
        attack: false, heavyAttack: false, block: false, dodge: false,
        crouch: false, ability: false, shove: false, attackDir: "right",
      } });
    }
    engine.step(TICK);
    t += TICK;
    const fell = seen.kills.slice(killsAtBell).find((k) => k.victimId === leftId || k.victimId === rightId);
    if (fell) { winner = fell.victimId === leftId ? "right" : "left"; break; }
  }
  const thirdMan = seen.hits.slice(hitsAtBell).some((h) => h.attackerId === meId || h.targetId === meId);
  engine.message(sid, { type: "leave" });
  engine.stop();
  releaseStream();
  return { winner, thirdMan };
}

// The cells: every alternate of every class, against its own default and
// the three other defaults.
const CLASSES = Object.keys(ARMS);
const cells = [];
for (const cls of CLASSES) {
  const alt = Object.keys(ARMS[cls]).find((a) => a !== defaultArmsOf(cls));
  if (!alt) continue;
  cells.push({ kind: "trade", left: { cls, arms: alt }, right: { cls }, band: TRADE_BAND });
  for (const foe of CLASSES) {
    if (foe === cls) continue;
    cells.push({ kind: "field", left: { cls, arms: alt }, right: { cls: foe }, band: FIELD_BAND });
  }
}

console.log(`[armsprobe] ${cells.length} cells x ${BOUTS} bouts, seed ${MASTER}\n`);
let bout = 0, failed = 0, edges = 0, discardedAll = 0;
for (const cell of cells) {
  let wins = 0, n = 0, discarded = 0;
  for (let i = 0; i < BOUTS; i++) {
    const r = runBout(cell.left, cell.right, MASTER + (bout++) * 7919, i % 2 === 1);
    if (r.thirdMan) { discarded++; continue; }
    n++;
    if (r.winner === "left") wins++;
  }
  discardedAll += discarded;
  const w = wilson(wins, n);
  const name = `${cell.left.cls}:${cell.left.arms} vs ${cell.right.cls}`;
  const range = `[${(w.lo * 100).toFixed(0)}-${(w.hi * 100).toFixed(0)}]`;
  // The three-way ruling classmatrix taught: INSIDE is measured, EDGE is a
  // deferral said out loud, OUTSIDE fails.
  const inside = w.lo >= cell.band.lo && w.hi <= cell.band.hi;
  const outside = w.hi < cell.band.lo || w.lo > cell.band.hi;
  const verdict = inside ? "INSIDE" : outside ? "FAIL" : "EDGE";
  if (verdict === "FAIL") failed++;
  if (verdict === "EDGE") edges++;
  console.log(`  ${verdict.padEnd(6)} ${cell.kind.padEnd(5)} ${name.padEnd(42)} ${(w.p * 100).toFixed(1)}% ${range} n=${n}`);
}
console.log(`\n[armsprobe] ${cells.length - failed - edges} inside, ${edges} edge (deferred), ${failed} outside; ${discardedAll} third-man bouts discarded`);
process.exit(failed ? 1 : 0);
