#!/usr/bin/env node
// ============================================================
// CHAINTEST — the second blow of a combination is not the first blow again.
//
//   node tools/chaintest.mjs      (or: npm run chaintest)
//
// WHY THIS EXISTS. The owner, 7 Sep 2026: "think we need variation of attack
// animations & maybe combos with some distinct movement". The combos were
// already there in the NUMBERS — `comboCount` rides the wire and
// `min(1 + combo * 0.15, 1.6)` is a real damage multiplier that has been
// paying out since the weight pass — and the PICTURE never read a byte of it.
// `SWINGS` held four strokes, one per direction, so a man throwing three
// right-cuts threw the identical animation three times and the chain was
// invisible to the only person it was happening to.
//
// WHAT THIS HOLDS, and the first one is the defect itself:
//
//   1. THE THREE BLOWS ARE ACTUALLY DIFFERENT. A rule that quietly collapses
//      to "return the base" puts the game back exactly where it started and
//      nothing else in this repository would notice.
//   2. A LONE BLOW IS THE AUTHORED STROKE, byte for byte. A variant is an
//      addition to the vocabulary; it must never be what a single swing
//      falls back to.
//   3. THE WIND-UP SHORTENS THROUGH THE CHAIN. This is the historical claim
//      the design rests on — short controlled strokes off the recovery,
//      because a big re-wind in a press is how a man gets killed — and it is
//      the one an eye reads first.
//   4. BLOW TWO STEPS THROUGH. `shift` is which foot he is standing on, and
//      it INVERTS on the second blow: he crosses onto the other foot instead
//      of rocking back onto the one he started on. That is the whole of the
//      owner's "distinct movement", stated as a sign change.
//   5. BLOW THREE PIVOTS RATHER THAN TRAVELS. Hip rotation grows, the weight
//      shift is damped and NOT inverted — a man cannot step through twice in
//      the 0.8 s `COMBO_WINDOW` without ending up somewhere he did not choose.
//   6. NOTHING IS NaN AND NOTHING IS ABSURD. A rule made of multiplications is
//      one bad factor away from a man folded through himself.
//
// IT RUNS THE REAL CODE. `chain.ts` was split out of `anim.ts` for exactly
// this: `anim.ts` imports three.js and nothing under tools/ can execute a line
// of it, so these rules would have been checked by reading text or not at all.
// `chain.ts` imports nothing.
// ============================================================
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { SWINGS, chainSwing, CHAIN_STEPS, CUT_CYCLE, CHAIN_WINDOW, cutAt } =
  await import(pathToFileURL(resolve(ROOT, "src/game/client/render/chain.ts")).href);
// The sim's own combo window, so the client's copy of it cannot drift.
const { COMBO_WINDOW } =
  await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

console.log("\n[chaintest] the chain, and whether an eye could tell one blow from the next\n");

const DIRS = Object.keys(SWINGS);
check("the four strokes are readable", DIRS.length >= 4, DIRS.join(", "));

/** Every numeric channel of a swing, flattened, for distance and sanity work. */
const flat = (s) => Object.keys(s).sort().flatMap((k) => Array.from(s[k]));

// ---- 2. a lone blow is the authored stroke ------------------------------
for (const d of DIRS) {
  const base = SWINGS[d];
  check(`${d}: a lone blow is the authored stroke, unchanged`,
    JSON.stringify(flat(chainSwing(base, 1))) === JSON.stringify(flat(base)));
  check(`${d}: an absent or nonsense combo falls back to the authored stroke`,
    JSON.stringify(flat(chainSwing(base, 0))) === JSON.stringify(flat(base))
    && JSON.stringify(flat(chainSwing(base, NaN))) === JSON.stringify(flat(base))
    && JSON.stringify(flat(chainSwing(base, undefined))) === JSON.stringify(flat(base)));
}

// ---- 1. THE DEFECT ITSELF: the blows are different ----------------------
//
// A mean absolute difference per channel, which is the crudest honest measure
// of "an eye could tell these apart". The bar is deliberately low — this is
// catching a COLLAPSE to identity, not judging the animation.
const spread = (a, b) => {
  const x = flat(a), y = flat(b);
  return x.reduce((t, v, i) => t + Math.abs(v - y[i]), 0) / x.length;
};
for (const d of DIRS) {
  const b = SWINGS[d];
  const one = chainSwing(b, 1), two = chainSwing(b, 2), three = chainSwing(b, 3);
  check(`${d}: blow two is not blow one`, spread(one, two) > 0.02, `mean channel delta ${spread(one, two).toFixed(4)}`);
  check(`${d}: blow three is not blow two`, spread(two, three) > 0.02, `mean channel delta ${spread(two, three).toFixed(4)}`);
  check(`${d}: blow three is not blow one either`, spread(one, three) > 0.02, `mean channel delta ${spread(one, three).toFixed(4)}`);
}

// ---- 3. the wind-up shortens through the chain --------------------------
// Index 0 of every Key is the LOAD. Summed magnitude across the arm and hip
// channels is "how far back he took it".
const load = (s) => ["arx", "arz", "arb", "cry", "pry", "front", "back"]
  .reduce((t, k) => t + Math.abs(s[k][0]), 0);
for (const d of DIRS) {
  const b = SWINGS[d];
  const l = [1, 2, 3].map((i) => load(chainSwing(b, i)));
  check(`${d}: the wind-up shortens with every blow of the chain`,
    l[0] > l[1] && l[1] > l[2], l.map((x) => x.toFixed(3)).join(" > "));
}

// ---- 4. blow two steps through ------------------------------------------
for (const d of DIRS) {
  const b = SWINGS[d];
  const two = chainSwing(b, 2);
  const inverted = b.shift.every((v, i) => v === 0 || Math.sign(two.shift[i]) === -Math.sign(v));
  check(`${d}: blow two STEPS THROUGH — the weight crosses to the other foot`,
    inverted, `${b.shift.map((x) => x.toFixed(2)).join("/")} -> ${two.shift.map((x) => x.toFixed(2)).join("/")}`);
}

// ---- 5. blow three pivots rather than travels ---------------------------
for (const d of DIRS) {
  const b = SWINGS[d];
  const three = chainSwing(b, 3);
  const sameSide = b.shift.every((v, i) => v === 0 || Math.sign(three.shift[i]) === Math.sign(v));
  const damped = Math.abs(three.shift[1]) < Math.abs(b.shift[1]);
  const hips = Math.abs(three.pry[1]) > Math.abs(b.pry[1]);
  check(`${d}: blow three PIVOTS — the shift damps and stays on its own side`,
    sameSide && damped, `${b.shift[1].toFixed(2)} -> ${three.shift[1].toFixed(2)}`);
  check(`${d}: ...and the hips take over what the feet no longer do`,
    hips, `pry release ${b.pry[1].toFixed(3)} -> ${three.pry[1].toFixed(3)}`);
}

// ---- 6. nothing is NaN and nothing is absurd ----------------------------
// A man's joint does not travel three radians in a swing; a rule made of
// multiplications is one bad factor away from one that does.
const LIMIT = 3.0;
for (const d of DIRS) {
  for (let i = 1; i <= CHAIN_STEPS + 2; i++) {
    const v = flat(chainSwing(SWINGS[d], i));
    const bad = v.filter((x) => !Number.isFinite(x) || Math.abs(x) > LIMIT);
    check(`${d}: blow ${i} is finite and within ${LIMIT}`, bad.length === 0,
      bad.length ? `${bad.length} channel(s) out: ${bad.slice(0, 4).join(", ")}` : `${v.length} channels`);
  }
}

// ---- and the chain does not invent a fourth idea -------------------------
for (const d of DIRS) {
  const b = SWINGS[d];
  check(`${d}: past the third blow the pivot holds rather than escalating`,
    JSON.stringify(flat(chainSwing(b, 4))) === JSON.stringify(flat(chainSwing(b, 3)))
    && JSON.stringify(flat(chainSwing(b, 99))) === JSON.stringify(flat(chainSwing(b, 3))));
}

// ---- 7. THE CUT CYCLE — no burst of blows is the same stroke twice --------
//
// The owner, after the chain above shipped: "the desktop moves for fighting
// feel really boring & uninspired too". The swing table was never the problem;
// `input.ts` picked the direction off the MOVEMENT KEYS and had no `else`, so a
// desktop player standing his ground threw one identical cut for ever and one
// walking forward threw an overhead every time. `cutAt` is the rule that
// replaced it. These are the claims that make it a rule rather than a hope.

check("the cycle is the four cuts, once each",
  CUT_CYCLE.length === 4 && new Set(CUT_CYCLE).size === 4
  && ["left", "right", "overhead", "stab"].every((d) => CUT_CYCLE.includes(d)),
  CUT_CYCLE.join(" -> "));

// THE DEFECT ITSELF, stated as a claim: three blows, three DIFFERENT strokes,
// from every opening. A cycle that collapsed anywhere would put the game back
// where it started and nothing else here would notice.
for (const open of CUT_CYCLE) {
  const burst = [0, 1, 2].map((n) => cutAt(open, n));
  check(`opening ${open}: a three-blow burst throws three different strokes`,
    new Set(burst).size === 3, burst.join(" -> "));
}

// THE OPENING IS THE PLAYER'S. Blow one is what he asked for, byte for byte —
// the cycle is an addition to the vocabulary and must never be what a lone
// blow falls back to.
for (const open of CUT_CYCLE) {
  check(`opening ${open}: blow one is the stroke he asked for`, cutAt(open, 0) === open);
}

// THE HISTORICAL ORDER, which is the design and not decoration: forehand into
// backhand (the return stroke), backhand into the overhead (the blade is
// already high), overhead into the thrust (the point is forward and low, and
// that is the shield wall's killing blow), thrust back into the forehand.
check("forehand returns as a backhand", cutAt("right", 1) === "left");
check("the backhand finishes high and the blade drops", cutAt("left", 1) === "overhead");
check("the downstroke leaves the point forward, so the point goes in", cutAt("overhead", 1) === "stab");
check("a withdrawn point is a cocked forehand", cutAt("stab", 1) === "right");

// IT WRAPS, and it wraps back to the opening. Four blows in eight tenths of a
// second is not reachable, but a rule that walks off the end of its own table
// is a rule that returns undefined into an animation lookup.
for (const open of CUT_CYCLE) {
  check(`opening ${open}: the cycle wraps to the opening on the fifth blow`,
    cutAt(open, 4) === open && cutAt(open, 8) === open);
}

// NEVER UNDEFINED, whatever it is handed. This decides an animation inside a
// fight; the one thing it may not do is fail.
for (const [name, arg] of [["null", null], ["undefined", undefined], ["nonsense", "sideways"],
  ["a number", 3], ["empty", ""]]) {
  check(`an ${name} opening still yields a cut`, CUT_CYCLE.includes(cutAt(arg, 1)),
    String(cutAt(arg, 1)));
}
for (const combo of [-5, -1, 0, 0.4, NaN, Infinity]) {
  check(`combo ${combo} still yields a cut`, CUT_CYCLE.includes(cutAt("right", combo)),
    String(cutAt("right", combo)));
}

// AND THE WINDOW IS THE SIM'S. `chain.ts` imports nothing on purpose, so its
// copy of the combo window is a copy — held here against the engine's export.
check("the client's chain window is the engine's combo window",
  CHAIN_WINDOW === COMBO_WINDOW, `${CHAIN_WINDOW} vs ${COMBO_WINDOW}`);

console.log(`\n[chaintest] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
