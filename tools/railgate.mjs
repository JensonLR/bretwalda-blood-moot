#!/usr/bin/env node
// RAILGATE — every rung of the fight rail is ON THE GLASS, on every shape.
//
//   npm run railgate
//
// WHY THIS EXISTS. The owner photographed the training HUD with the END SESSION
// button hanging off the left edge of the screen, reading "…D SESSION". It had
// been that way on every desktop since the fight rail landed, and the whole
// gate battery was green.
//
// THE CAUSE IS A CASCADE RULE, AND IT IS THE THIRD TIME THIS REPOSITORY HAS
// BEEN BITTEN BY ONE. The button asked for its desktop position in Tailwind:
//
//     pointer-fine:left-1/2 pointer-fine:right-auto pointer-fine:-translate-x-1/2
//
// and `railStyle` returned an inline `left: calc(12px + var(--safe-left,0px))`.
// AN INLINE DECLARATION BEATS EVERY CLASS, whatever its specificity — so the
// `left:50%` lost and the TRANSFORM, which the inline style said nothing about,
// won. The button was placed at 12 px and then shifted left by half its own
// 96 px width. Left edge: −36 px. Both halves did exactly what they were told.
//
// (The other two: `* { margin: 0 }` unlayered, which deleted every Tailwind
// utility in the app; and `--safe-*` needing to be a variable rather than a raw
// `env()` so a harness could write it. Same family — the cascade decided
// something nobody was asking it to decide.)
//
// WHAT IT CHECKS. `railStyle` is a pure function of (rung, geometry, handed,
// endShown), so this needs no browser and no GPU: it resolves each rung's box
// on a spread of real screen shapes and asserts every one lands inside the
// viewport. The arithmetic that produced −36 is arithmetic a test can do.
//
// It cannot see CSS this file never returns — a class that moves a rung is
// invisible here, which is precisely why the fix moved the decision INTO
// `railStyle` instead of out-specifying the class. That is the claim the last
// check makes: no rung's placement may depend on a className.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { emitClient } from "./lib/clientmodule.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const { byName } = await emitClient(ROOT, ["src/game/client/fightRail.ts"], ".railgate");
const RAIL = await byName("fightRail.js");
if (!RAIL) { console.error("fightRail.ts did not compile"); process.exit(1); }
const { railStyle, railFolds, endIsWide } = RAIL;

/**
 * Each rung's own box, mirrored from fightRail's RUNG for the width maths.
 *
 * `end` has TWO widths and that is the point. 96 is the short button; the wide
 * one is measured, not guessed — `art/ui` has no capture of it, so it comes
 * from a real render: 159 px at the shipped padding and font. The first cut of
 * this gate carried only the 96 and was therefore blind to the exact defect
 * that produced it.
 */
const RUNG_W = { end: 96, endWide: 159, sound: 44, graphics: 48, skip: 136 };
const RUNG_H = { end: 40, sound: 44, graphics: 48, skip: 44 };
const RUNGS = ["end", "sound", "graphics", "skip"];

/**
 * Resolve one rung to a box in CSS px.
 *
 * `calc(Npx + var(--safe-*, 0px))` is evaluated with the fallback, which is
 * what every screen without a cutout resolves it to — the shape this gate is
 * about. The safe-area behaviour has its own harness (`safearea`) and it drives
 * a real browser, because that is the only thing that can set an inset.
 */
function px(v) {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return null;
  const m = /^calc\((-?[\d.]+)px \+ var\(--safe-[a-z]+, 0px\)\)$/.exec(v);
  if (m) return Number(m[1]);
  if (/^-?[\d.]+px$/.test(v)) return Number(v.slice(0, -2));
  return null;
}

function box(rung, geo, lefty, endShown, vw) {
  const s = railStyle(rung, geo, lefty, endShown);
  // The rung's width follows the SAME predicate the markup uses to pick the
  // label, so this gate measures the button that actually renders.
  const w = rung === "end" && endIsWide(geo) ? RUNG_W.endWide : RUNG_W[rung];
  const h = RUNG_H[rung];
  let left;
  if (s.left === "50%") {
    // The centred case. `transform: translateX(-50%)` is the ONLY transform
    // this file emits, and it is read rather than assumed: a rung that grew a
    // transform without a matching offset is the original defect exactly.
    const shifted = s.transform === "translateX(-50%)";
    left = vw / 2 - (shifted ? w / 2 : 0);
  } else if (s.left !== undefined) {
    left = px(s.left);
  } else if (s.right !== undefined) {
    left = vw - px(s.right) - w;
  } else return null;
  if (left === null) return null;
  const top = px(s.top);
  return { left, right: left + w, top, bottom: top + h, style: s };
}

/** Real shapes, named. Widths and heights are CSS px. */
const SHAPES = [
  { name: "desktop 1440x900", w: 1440, h: 900, fine: true },
  { name: "desktop 1280x720", w: 1280, h: 720, fine: true },
  { name: "laptop 1200x700 (the owner's capture)", w: 1200, h: 700, fine: true },
  { name: "narrow desktop 900x800", w: 900, h: 800, fine: true },
  { name: "short desktop 1400x460 (folds)", w: 1400, h: 460, fine: true },
  { name: "iPhone portrait 390x844", w: 390, h: 844, fine: false },
  { name: "iPhone landscape 844x390 (folds)", w: 844, h: 390, fine: false },
  { name: "Z Fold inner 841x757", w: 841, h: 757, fine: false },
  { name: "iPad 768x1024", w: 768, h: 1024, fine: false },
];

console.log("RAILGATE — is every rung of the fight rail on the glass?\n");

for (const shape of SHAPES) {
  const geo = { h: shape.h, readoutBottom: 59, folded: railFolds(shape.h), fine: shape.fine };
  for (const lefty of [false, true]) {
    for (const endShown of [true, false]) {
      const hand = lefty ? "left-handed" : "right-handed";
      const solo = endShown ? "solo" : "multi";
      for (const rung of RUNGS) {
        if (rung === "end" && !endShown) continue;
        const b = box(rung, geo, lefty, endShown, shape.w);
        if (!b) { check(`${shape.name} ${hand} ${solo}: ${rung} resolves`, false, "unreadable style"); continue; }
        check(`${shape.name} ${hand} ${solo}: ${rung} is on the glass`,
          b.left >= 0 && b.right <= shape.w && b.top >= 0,
          `x ${b.left.toFixed(0)}..${b.right.toFixed(0)} of ${shape.w}, y ${b.top.toFixed(0)}`);
      }
    }
  }
}

// ---- the claims that are about the DEFECT and not the geometry -------------

console.log("");

// 1. END really is centred on a mouse, which is the behaviour page.tsx's own
//    comment promises and the thing that was silently lost.
{
  const geo = { h: 900, readoutBottom: 59, folded: false, fine: true };
  const b = box("end", geo, false, true, 1440);
  check("on a fine pointer END is centred",
    Math.abs((b.left + b.right) / 2 - 720) < 0.5,
    `centre ${(b.left + b.right) / 2} of 720`);
}

// 2. And is NOT centred on a thumb — the Z Fold finding, 223 dead free-look
//    points, which is why this is asked by pointer and never by width.
{
  const geo = { h: 757, readoutBottom: 59, folded: railFolds(757), fine: false };
  const b = box("end", geo, false, true, 841);
  check("on a coarse pointer END stays in the corner",
    b.left < 841 / 4,
    `left ${b.left} on an 841px coarse screen`);
}

// 3. THE REGRESSION ITSELF. A transform without an offset that accounts for it
//    is what put the button at −36. Any rung that emits one must also be the
//    centred case.
{
  let bad = [];
  for (const shape of SHAPES) {
    const geo = { h: shape.h, readoutBottom: 59, folded: railFolds(shape.h), fine: shape.fine };
    for (const lefty of [false, true]) for (const rung of RUNGS) {
      const s = railStyle(rung, geo, lefty, true);
      if (s.transform && s.left !== "50%") bad.push(`${shape.name}/${rung}`);
    }
  }
  check("no rung is shifted by a transform it has not been positioned for",
    bad.length === 0, bad.length ? bad.join(", ") : "none emit a bare transform");
}

// 4. THE FOLD MUST HOLD ITS OWN COLUMNS APART. The second column is placed at
//    `EDGE + RUNG.end.w + FOLD_GAP`, which is arithmetic on the SHORT button —
//    so any screen that folds while END is still the wide one is a collision.
//    That was reachable on every desktop window under 488 px tall.
{
  const bad = [];
  for (const shape of SHAPES) {
    const geo = { h: shape.h, readoutBottom: 59, folded: railFolds(shape.h), fine: shape.fine };
    if (!geo.folded) continue;
    for (const lefty of [false, true]) {
      const boxes = RUNGS.map((r) => ({ r, b: box(r, geo, lefty, true, shape.w) })).filter((x) => x.b);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].b, b = boxes[j].b;
        const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        if (overlap) bad.push(`${shape.name}/${lefty ? "lefty" : "righty"}: ${boxes[i].r}x${boxes[j].r}`);
      }
    }
  }
  check("a folded rail never draws one rung over another",
    bad.length === 0, bad.length ? bad.join(", ") : `${SHAPES.filter((s) => railFolds(s.h)).length} folding shapes, no collisions`);
}

// 5. And the source claim: the button must not carry a positioning class any
//    more, because a class cannot beat the inline style this file returns and
//    a reader who adds one will believe it works.
{
  const page = readFileSync(resolve(ROOT, "src/app/page.tsx"), "utf8");
  const btn = /railStyle\("end"[\s\S]{0,400}?className="([^"]*)"/.exec(page);
  const cls = btn ? btn[1] : "";
  const positioning = /(^|\s)(pointer-fine:)?-?(left|right|top|bottom|translate-x|translate-y)-/.test(cls);
  // And the LABEL must come from the predicate too, not from a media query that
  // knows nothing about the fold.
  const labelByClass = /pointer-fine:(hidden|inline)/.test(page.slice(page.indexOf('railStyle("end"'), page.indexOf('railStyle("end"') + 900));
  check("END's label is chosen by the rail, not by a pointer media query",
    !labelByClass, labelByClass ? "pointer-fine:hidden/inline still picks the text" : "endIsWide(rail) picks it");
  check("the END button carries no positioning class to fight the inline style",
    btn !== null && !positioning,
    btn ? (positioning ? `found: ${cls.split(" ").filter((c) => /-(left|right|top|bottom|translate)/.test(c) || /(left|right|translate)-/.test(c)).join(" ")}` : "none") : "could not find the button");
}

console.log(`\n[railgate] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
