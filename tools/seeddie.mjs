// ============================================================
// SEEDDIE — a fixed die for the game server a harness spawns.
//
//   node --import ./tools/seeddie.mjs custom-server.mjs
//
// Loaded with `--import`, this replaces Math.random in the server process
// before a line of engine code is evaluated. It is the same trick, and for the
// same reason, that tools/cosmetictest.mjs plays on the browser: a measurement
// taken over an unseeded die is not a measurement, it is a sample of a
// distribution nobody wrote down.
//
// WHAT IT BUYS. engine.mjs already advances on a FIXED step — `stepRoom` is
// only ever called with 1/TICK_RATE, and a slow wake produces more steps rather
// than a longer one — so the simulation is a pure function of its step index,
// its inputs and its die. Two of those three were already pinned. The die was
// not, and it is what decides:
//
//   * `bot.strafePhase = Math.random() * 2π`, which is the ONE number that says
//     whether a recruit orbits you clockwise or anticlockwise as he closes. The
//     bearing to a man circling at arm's length sweeps at about three radians a
//     second, so which way he went is the difference between a facing assertion
//     that reads two degrees of error and one that reads thirty — and it was
//     being redrawn on every run.
//   * every block, dodge, ability and swing roll in the bot brain
//     (`Math.random() < 0.22 + skill*0.3` and its dozen siblings),
//   * the 2%-per-think idle re-aim, which walks a bot off a straight line for
//     no reason a harness can see or reproduce.
//
// WHAT IT DOES NOT BUY. It does not make a run byte-identical: the player's
// inputs still arrive from a real browser at times the box decides, and the
// bots react to those. It removes an INDEPENDENT source of variance, not all
// variance. Anything that still moves after this is either the box or the game.
//
// WHAT IT MUST NOT BREAK. Room codes are drawn from this die
// (`generateCode`), but every caller re-draws on collision inside its own
// process, and the harnesses each run their own server — so a fixed stream
// still yields unique codes. Player and bot IDs come from `randomUUID`, which
// is crypto and untouched here, so nothing downstream can start depending on a
// fixed identity by accident.
//
// Nothing in src/ knows this file exists, and production never loads it.
// ============================================================

// xorshift32 — not for cryptography and not for statistics, for repeatability.
// The constant is cosmetictest's, so the two instruments roll the same stream
// and a difference between them is never the seed.
let seed = 0x2545f491;
Math.random = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
};
