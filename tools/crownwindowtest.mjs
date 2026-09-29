#!/usr/bin/env node
// ============================================================
// CROWNWINDOWTEST — can `stagehead` be passed WITHOUT a head? (PROCESS R3, the adversary's questions.)
//
//   node tools/crownwindowtest.mjs          CPU only, no browser, a second
//
// `tools/lib/crownwindow.mjs` decides, for `stagehead`, `uishots` and `armourycard`, whether a
// frame has a head. UI-PLAN §4 step 7 asks for an independent pass that tries to pass the gate
// without fixing the head — "for example by painting a skin-coloured pixel" — and confirms the
// numbers catch it. The browser cannot be made to paint one on demand, but the JUDGE can be handed
// the readings such an attempt would produce, and asked. Each case below is one way to be green
// without a head, and each must be red; each is paired with the honest reading it imitates, which
// must be green, so a judge that refuses everything cannot pass this file either.
//
// It also holds the two things the first cut got wrong (PROCESS R2): a MIRRORED man (det -1,
// scale -1 on x — a left-handed player's) is not a collapsed one, and a man who faces away (the
// cloak tab turns him round on purpose) is not asked for a face.
// ============================================================
import { judge, BARS, MIN_SKIN_PX, FACING, isSkin, hsv, measure } from "./lib/crownwindow.mjs";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); ok ? pass++ : fail++; };

/** A reading as `readHead` returns it. */
const reading = (o = {}) => {
  const n = o.n ?? 22344, skin = o.skin ?? Math.round(0.14 * n);
  return {
    lens: o.lens ?? "face", slot: "helm", turn: o.turn ?? -0.61, crown: 2.05, ready: true, settled: true, cls: "warden",
    win: o.win === null ? null : { x: 107, y: 27, w: 147, h: 152, crownAt: 0.16, bootsAt: 3.8, canvasW: 361, canvasH: 268 },
    m: { n, skin, skinFrac: skin / n, lit: 0, litFrac: 0, meanY: 0, sdY: 0 },
    authored: o.authored === undefined ? {
      cls: "warden", ok: true, refused: false, why: null, net: { ok: true, turnDeg: 2, reachDrift: 0 },
      head: { visible: 18, hidden: 0, skull: [1.7, 1.98, -0.1, 0.1], scale: [1, 1, 1], det: 1, boneName: "Head", crown: 2.05, reach: 0.88, verts: 10705 },
    } : o.authored,
  };
};
const withHead = (h) => reading({ authored: { ...reading().authored, head: { ...reading().authored.head, ...h } } });

console.log("CROWNWINDOWTEST — the adversary's ways of being green without a head\n");

// ---- the honest readings, which must be green -------------------------------------------------
check("an honest healthy man is green", judge(reading(), BARS).length === 0);
check("...at every lens's own healthy figure", [["face", 0.104], ["bust", 0.062], ["figure", 0.074], ["fight", 0.069]]
  .every(([lens, f]) => judge(reading({ lens, skin: Math.round(f * 22344) }), BARS).length === 0));
check("a MIRRORED man (a left-handed player's: det -1, scale -1 on x) is NOT called collapsed",
  judge(withHead({ det: -1, scale: [-1, 1, 1] }), BARS).length === 0, JSON.stringify(judge(withHead({ det: -1, scale: [-1, 1, 1] }), BARS)));
check("a man who FACES AWAY (the cloak tab, bearing 2.36) is not asked for a face",
  judge(reading({ lens: "figure", turn: 2.36, skin: 0 }), BARS).length === 0);

// ---- the ways to be green without a head, which must be red -----------------------------------
const paint = reading({ skin: 4000 });   // a skin-coloured pixel population where a face would be
check("PAINTED SKIN + the head net REFUSED him (the fallback man has a head) is RED",
  judge({ ...paint, authored: { ...paint.authored, ok: false, refused: true, why: "head net: turned 180 degrees" } }, BARS).some((p) => /REFUSED/.test(p)));
check("...unless the run is the one PROVING the net fires (allowRefused), and then only that check is off",
  judge({ ...paint, authored: { ...paint.authored, ok: false, refused: true, why: "x" } }, BARS, { requireAuthored: false, allowRefused: true }).length === 0);
check("PAINTED SKIN + the swap never landed is RED", judge({ ...paint, authored: { ...paint.authored, ok: false, why: "no bones" } }, BARS).length > 0);
check("PAINTED SKIN + no authored report at all is RED", judge({ ...paint, authored: null }, BARS).length > 0);
check("PAINTED SKIN on a tree WITHOUT the head net (numbers all fine, no verdict) is RED — the pre-fix man's own case",
  judge({ ...paint, authored: { ...paint.authored, net: null } }, BARS).some((p) => /no head net verdict/.test(p)));
check("...and --no-net (requireNet false) is the one switch that turns that off, for the run that measures the pixels alone",
  judge({ ...paint, authored: { ...paint.authored, net: null } }, BARS, { requireNet: false }).length === 0);
check("PAINTED SKIN + a collapsed head matrix (det 0) is RED", judge(withHead({ det: 0 }), BARS).some((p) => /det/.test(p)));
check("PAINTED SKIN + a collapsed scale is RED", judge(withHead({ scale: [1, 0.1, 1] }), BARS).some((p) => /scale/.test(p)));
check("PAINTED SKIN + no skull is RED", judge(withHead({ skull: null }), BARS).some((p) => /skull/.test(p)));
check("PAINTED SKIN + nothing visible above the shoulders is RED", judge(withHead({ visible: 0 }), BARS).some((p) => /visible/.test(p)));
check("NO SKIN in the crown window (the headless man) is RED at every lens",
  ["face", "bust", "figure", "fight"].every((lens) => judge(reading({ lens, skin: 0 }), BARS).some((p) => /skin-hue/.test(p))));
check("the headless man's OWN neck stump (2.5% of a portrait window) is RED at the portrait bar", judge(reading({ lens: "face", skin: Math.round(0.025 * 22344) }), BARS).length > 0);
check("the head OFF THE CANVAS is RED", judge(reading({ win: null }), BARS).length > 0);
check("NO STAGE mounted is RED", judge(null, BARS).length > 0);
check("a man who faces the lens by LESS than the facing bound is still asked (bearing 1.1 < " + FACING + ")", judge(reading({ turn: 1.1, skin: 0 }), BARS).length > 0);

// ---- R1: the bars are what decide it ----------------------------------------------------------
const tight = Object.fromEntries(Object.entries(BARS).map(([k, v]) => [k, { skinFrac: v.skinFrac * 4 }]));
check("R1: bars ×4 turn the honest healthy portrait RED (the number is what decides it)", judge(reading({ skin: Math.round(0.14 * 22344) }), tight).length > 0);
const loose = Object.fromEntries(Object.entries(BARS).map(([k]) => [k, { skinFrac: 0 }]));
check(`R1: bars at 0 still fail an EMPTY window, by the ${MIN_SKIN_PX}-pixel floor`, judge(reading({ skin: 0 }), loose).length > 0);

// ---- the colour test is the brief's ----------------------------------------------------------
check("skin hue: rgb(160,96,64) H 20 S .60 V .63 is skin", isSkin(160, 96, 64), JSON.stringify(hsv(160, 96, 64)));
check("not skin: steel (110,118,130), backdrop (11,10,13), hearth orange (198,92,20, S .90), beard white (240,240,235)",
  !isSkin(110, 118, 130) && !isSkin(11, 10, 13) && !isSkin(198, 92, 20) && !isSkin(240, 240, 235));
check("measure() counts a window", (() => {
  const px = Buffer.from([160, 96, 64, 255, 11, 10, 13, 255, 160, 96, 64, 255, 110, 118, 130, 255]);
  const m = measure(px, 4, 1);
  return m.n === 4 && m.skin === 2;
})());

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
