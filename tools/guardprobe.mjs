#!/usr/bin/env node
// ============================================================
// GUARDPROBE — what a shield is actually worth, per class, in damage.
//
//   node tools/guardprobe.mjs        (npm run guardprobe)
//
// THE HOLE THIS FILLS, AND IT WAS DECLARED BEFORE IT WAS FOUND.
//
// `blockReduction` is a headline column of `WARRIOR_STATS` — it is the
// huscarl's whole identity ("Shield & sword. Unbreakable.") — and until this
// file NOTHING IN THE REPOSITORY HELD IT TO A NUMBER.
//
//   * `classmatrix` cannot see it and says so on its own verdict line: only
//     ~6% of the damage in its duels ever meets a raised guard, because bots
//     block on a readable windup and little else. `docs/BACKLOG.md` records
//     the proof — taking the huscarl's `blockReduction` from 0.80 to 0.00,
//     the best shield in the game to no shield at all, moved `huscarl vs
//     warden` from 69% to 69%. INERT.
//
//   * `fighttest` §3 does drive real held guards, and its claims are the
//     right ones — but every one of them is ORDINAL: a haft leaks more than
//     a board, a wrong-way guard leaks more than a matched one, SHIELD WALL
//     leaks least. Ordering survives any magnitude. Set the berserker's
//     0.28 to 0.90 and every existing claim in this repository still passes.
//
// So the shield could be arbitrarily wrong in either direction and no gate
// would notice. That is the "half the stat sheet is invisible to the balance
// ruler" debt, and this is the half that can be closed with arithmetic.
//
// WHAT IT MEASURES, AND WHY IT IS A RATIO.
//
// The engine's own line (`processAttack`) is:
//
//     guarded = clamp(blockReduction + armsDelta.blockReduction, 0, 0.95)
//     eff     = SHIELD WALL ? 0.95 : matched ? guarded : guarded * GUARD.mismatch
//
// This probe never re-implements that. It swings ONE identical blow twice —
// once at an unguarded man, once at the same man holding a guard — and
// compares what got through. The ratio `guarded / unguarded` must be
// `1 - eff`. Everything that could vary (class, position, facing, stroke,
// zone, seed) is held fixed between the two halves, so the only thing the
// ratio can be measuring is the guard.
//
// It reads the constants off the engine and the leak off the wire. A harness
// that recomputed the damage would be auditing its own copy of the formula —
// `docs/PROCESS.md` failure mode 3 — and would have passed happily while the
// engine did something else entirely.
//
// ---------------------------------------------------------------------------
// WHAT THIS PROBE CANNOT SEE, MEASURED RATHER THAN GUESSED AT.
//
// It compares the engine's BEHAVIOUR against the engine's OWN SHEET, so a
// changed sheet value is invisible to it by construction: set the berserker's
// `blockReduction` to 0.90 and this file still reads 19/19, because the guard
// then honestly is worth 0.90. That was tried before this note was written.
//
// It is not a gap, because it is somebody else's job and that job is done:
// `classmatrix` mirrors `engine.mjs` against `types.ts` and failed the same
// edit immediately — "the two sheets disagree on 1 value(s)". VALUES are
// guarded by the two-sheet mirror; the MECHANISM was guarded by nothing.
//
// The mechanism is what this file holds, and the demonstration is a drift
// that preserves every ordering: `GUARD.mismatch` moved 0.5 -> 0.9, so a
// wrong-way guard still leaks more than a matched one and still less than a
// bare man. `fighttest` 23/23 GREEN. `classmatrix` PASS. **This file fails
// four times and names the quantity.** That gap is the reason it exists.
// ============================================================
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { makeEngine, WARRIOR_STATS, ARMS, GUARD, defaultArmsOf } =
  await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);

let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};
const RATE = 20;
const open = (eng) => {
  const c = { byType: new Map() };
  c.sid = eng.connect((str) => {
    const m = JSON.parse(str);
    if (!c.byType.has(m.type)) c.byType.set(m.type, []);
    c.byType.get(m.type).push(m.data);
  });
  c.send = (type, data) => eng.message(c.sid, { type, data: data || {} });
  c.last = (t) => { const a = c.byType.get(t) || []; return a[a.length - 1]; };
  return c;
};
const stepSeconds = (eng, s) => { for (let i = 0; i < Math.ceil(s * RATE); i++) eng.step(); };

/**
 * One blow, landed. `guard` is null for the bare man, or the direction he
 * holds; `wall` raises SHIELD WALL first. Returns the health it cost him.
 *
 * The staging is `fighttest`'s, deliberately — two humans over the real wire,
 * the grace fully burnt, a stride apart on open turf away from the fire — so
 * this file and that one are measuring the same fight.
 */
function leak({ defender, arms, guard, swingDir = "overhead", wall = false }) {
  const eng = makeEngine({ autoTick: false });
  const a = open(eng);
  a.send("create", { name: "Ecgbryht", mode: "blood_moot", bestOf: 1, friendly: true, awaitLoad: false });
  const code = a.last("join").code;
  const b = open(eng);
  b.send("join", { code, name: "Osric", awaitLoad: false });
  // Kit is LOBBY-gated (`KIT_STATES`) — `fighttest`'s own fixture learned
  // that the hard way by selecting mid-fight, being refused, and measuring
  // two wardens. The attacker is left at his default so the blow is one
  // blow across every row of the sheet.
  b.send("select_class", { warriorClass: defender, arms: arms ?? defaultArmsOf(defender) });
  a.send("start", {});
  stepSeconds(eng, 6);
  const room = eng._rooms.get(code);
  const pa = room.players.get(a.last("join").playerId);
  const pb = [...room.players.values()].find((p) => p.id !== pa.id);
  pa.position = { x: 8, y: 0, z: 0 };
  pb.position = { x: 9.2, y: 0, z: 0 };
  pa.invincible = false; pb.invincible = false;
  const face = Math.atan2(pb.position.x - pa.position.x, pb.position.z - pa.position.z);
  const back = face + Math.PI;

  if (wall) b.send("input", { moveX: 0, moveZ: 0, rotationY: back, attackDir: guard, ability: true });
  // A guard must be HELD: one block message lapses with the intent
  // (INPUT_LAPSE_MS), and fighttest records a first cut that measured two
  // unguarded men because of exactly that.
  const hold = () => { if (guard) b.send("input", { moveX: 0, moveZ: 0, rotationY: back, attackDir: guard, block: true }); };
  hold();
  // Long enough that the guard is HELD and not a parry: `blockTimer` must be
  // past PARRY_WINDOW when the blow lands, or this probe would be measuring
  // the timing read instead of the shield.
  stepSeconds(eng, 0.6);
  const hp = pb.health;
  a.send("input", { moveX: 0, moveZ: 0, rotationY: face, attackDir: swingDir, attack: true });
  for (let i = 0; i < 40; i++) { if (i % 4 === 0) hold(); eng.step(); }
  const parried = (b.byType.get("hit") || []).some((h) => h.type === "parry");
  return { took: hp - pb.health, parried, state: pb.state };
}

/** What the engine's own line says this guard is worth. Read, not retyped. */
const effOf = (cls, arms, matched, wall) => {
  const base = WARRIOR_STATS[cls].blockReduction;
  const delta = (ARMS[cls]?.[arms ?? defaultArmsOf(cls)]?.delta?.blockReduction) || 0;
  const guarded = Math.max(0, Math.min(0.95, base + delta));
  return wall ? 0.95 : matched ? guarded : guarded * GUARD.mismatch;
};

console.log("[guard] what a shield is worth, in damage, per class\n");

// ============================================================
// 1. EVERY CLASS, HELD TO ITS OWN NUMBER
// ============================================================
//
// The bar is 0.06 of the ratio. It is not tighter because the leak is an
// INTEGER of health off an integer blow, so a 17-damage light through a 0.64
// guard is 6 either way the rounding falls — about four points of ratio on
// the smallest blow in the game. It is not looser because 0.06 still
// separates every pair of shields on the sheet: the closest two are the
// runekeeper's 0.35 and the berserker's 0.28.
const TOL = 0.06;
console.log("  class        arms          bare  guarded   ratio   expected");
for (const cls of Object.keys(WARRIOR_STATS)) {
  const bare = leak({ defender: cls, guard: null });
  const held = leak({ defender: cls, guard: "overhead", swingDir: "overhead" });
  const ratio = bare.took > 0 ? held.took / bare.took : NaN;
  const want = 1 - effOf(cls, null, true, false);
  console.log(`  ${cls.padEnd(12)} ${String(defaultArmsOf(cls)).padEnd(13)} `
    + `${String(bare.took).padStart(4)} ${String(held.took).padStart(8)}   `
    + `${Number.isNaN(ratio) ? "  —  " : ratio.toFixed(3)}   ${want.toFixed(3)}`);
  check(`${cls}: the bare man is actually hit — the probe has a blow to measure`,
    bare.took > 0, `${bare.took} damage`);
  check(`${cls}: a held guard is not a parry — this measures the shield, not the read`,
    !held.parried);
  check(`${cls}: the guard is worth what the sheet says (blockReduction ${WARRIOR_STATS[cls].blockReduction})`,
    Number.isFinite(ratio) && Math.abs(ratio - want) <= TOL,
    `let ${(ratio * 100).toFixed(1)}% through, sheet says ${(want * 100).toFixed(1)}%`);
}

// ============================================================
// 2. THE MISMATCH IS EXACTLY HALF, AND IT IS HALF OF HIS OWN GUARD
// ============================================================
//
// `GUARD.mismatch` is one constant shared by four different shields, so the
// wrong-way guard is checked per class too: a single ordinal claim on one
// class would let the constant be right for the huscarl and wrong for
// everybody else.
console.log("");
for (const cls of Object.keys(WARRIOR_STATS)) {
  const bare = leak({ defender: cls, guard: null });
  const wrong = leak({ defender: cls, guard: "right", swingDir: "overhead" });
  const ratio = bare.took > 0 ? wrong.took / bare.took : NaN;
  const want = 1 - effOf(cls, null, false, false);
  check(`${cls}: a guard facing the wrong line keeps exactly ${GUARD.mismatch} of its worth`,
    Number.isFinite(ratio) && Math.abs(ratio - want) <= TOL,
    `let ${(ratio * 100).toFixed(1)}% through, expected ${(want * 100).toFixed(1)}%`);
}

// ============================================================
// 3. THE ARMS DELTA IS REAL, AND THE CLAMP HOLDS
// ============================================================
//
// The dane axe trades the best guard in the game for reach and mass: -0.50
// on a huscarl's 0.80 is 0.30, and that is a number, not a direction.
// `fighttest` proves the ORDER (a haft leaks more than a board); this proves
// the SIZE, which is the half that could drift.
console.log("");
{
  const bare = leak({ defender: "huscarl", arms: "dane_axe", guard: null });
  const held = leak({ defender: "huscarl", arms: "dane_axe", guard: "overhead" });
  const ratio = bare.took > 0 ? held.took / bare.took : NaN;
  const want = 1 - effOf("huscarl", "dane_axe", true, false);
  check("the dane axe's haft-parry is worth the sheet's 0.80 MINUS 0.50, not merely 'less'",
    Number.isFinite(ratio) && Math.abs(ratio - want) <= TOL,
    `let ${(ratio * 100).toFixed(1)}% through, expected ${(want * 100).toFixed(1)}%`);
}
{
  // SHIELD WALL is the ceiling the clamp names, and it is blind to direction:
  // a wrong-way guard under the wall still stops 95%.
  const bare = leak({ defender: "huscarl", guard: null });
  const walled = leak({ defender: "huscarl", guard: "right", swingDir: "overhead", wall: true });
  const ratio = bare.took > 0 ? walled.took / bare.took : NaN;
  check("SHIELD WALL is the 0.95 ceiling, on the wrong line as much as the right",
    Number.isFinite(ratio) && Math.abs(ratio - 0.05) <= TOL,
    `let ${(ratio * 100).toFixed(1)}% through, ceiling says 5.0%`);
}

// ============================================================
// 4. THE PROBE'S OWN CONTROL
// ============================================================
//
// If the two halves were not the same blow, every ratio above would be
// measuring staging noise. Two bare runs of the identical fixture must land
// the identical damage — the engine is deterministic under a fixed stage,
// and if that ever stops being true this file's arithmetic is void.
console.log("");
{
  const one = leak({ defender: "warden", guard: null });
  const two = leak({ defender: "warden", guard: null });
  check("THE RULER: the same blow twice is the same damage twice",
    one.took === two.took && one.took > 0, `${one.took} then ${two.took}`);
}

console.log(`\n[guard] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
