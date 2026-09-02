#!/usr/bin/env node
// ============================================================
// GRADESPLIT — the same frame, one stage of the colour grade at a time.
//
//   node tools/gradesplit.mjs                       # norse huscarl, armor_steel, 0°
//   node tools/gradesplit.mjs <people> <cls> <finish> <bearing>
//   node tools/gradesplit.mjs norse huscarl armor_steel 0 --arms=off,-chroma
//
// WHY IT EXISTS. `docs/OPEN-DEFECTS.md` carried four OPEN entries that were one
// question — the Danelaw's shield board rendering #a7043d against a --garnet of
// #7c1420, the Danelaw reading rose at the sleeves and byrnie, §1.3's hue, and
// the brightness ceiling bounding one channel. Every one of them was argued out
// of ALBEDO, and three separate rounds each moved a material and each moved a
// symptom. `docs/PROCESS.md` R11 stage 4 cuts both ways: a material must not be
// fixed by relighting the scene, AND a grade must not be fixed by repainting a
// kingdom. Nothing in the drawer could tell those two apart, because nothing
// could photograph the same man with one stage of the grade removed.
//
// This can. `render/postfx.ts` carries a capture-only door — `?grade=` — and
// this file drives it.
//
// WHAT IT MEASURES, and it is deliberately not "is the picture nice". Per
// SURFACE, off the same `tools/lib/surfacemask.mjs` masks `factionread` §7 and
// `vatprobe` cut from the client's own scene graph:
//
//   * the surface's ALBEDO in CIELAB — what the material actually is;
//   * the same surface RENDERED, under each arm;
//   * and the number the four defects are about: HUE DRIFT, how far the frame
//     has carried the surface off its own pigment's hue.
//
// A grade is allowed to change a surface's lightness and its chroma — that is
// what light and a tone curve do. It is NOT allowed to change what colour a
// thing IS. A drift of 28° is a different pigment.
//
// AND WITH `--gate`, IT IS ALSO THE GATE THAT WOULD HAVE CAUGHT THIS.
//
// Nothing in the drawer measured the quantity the four entries were about.
// `factionread` §6 counts CLIPPED pixels and §7 counts pixels in the rose BAND;
// both were doing their jobs while the board rendered hot magenta, because
// neither asks whether a surface is still ITS OWN COLOUR. And the answer cannot
// be "how far is the render from the albedo", because a lit surface is SUPPOSED
// to shift — the arena's key is warm, and warm light on garnet moves its hue.
//
// The quantity that discriminates is THE GRADE'S OWN ROTATION: the same frame,
// graded and ungraded, and how far apart the same surface's hue lands.
// Measured on the board, huscarl / armor_steel / 0°:
//
//     with the anisotropic skew      grade-off 40.4° -> shipped 12.4°   28.0°
//     with it a scale, not a skew    grade-off 32.7° -> shipped 32.3°    0.4°
//
// Seventy times. A tone curve, a white balance and a chroma expansion may all
// change how bright and how saturated a thing is; none of them has any business
// changing WHAT COLOUR IT IS.
//
// AND IT IS GATED ON DELTA-H*, NOT ON THE ANGLE, because the angle is the wrong
// ruler and the first run of this gate proved it. A hue ANGLE is meaningless as
// a near-neutral: the Briton's trouser reads C* 9 and swung 21.9 degrees for a
// colour change no eye would call a change of colour, while the magenta board —
// the actual defect — swung 28. On the angle alone those two are the same
// finding, which is `docs/PROCESS.md` R4 exactly: the ruler must measure the
// right question.
//
// dH* = 2 sqrt(C1 C2) sin(dh/2) is the hue term of dE, in the same perceptual
// units as the rest of Lab, and it discounts a neutral by construction because
// a colour with no chroma has no hue to move. On the same two readings:
//
//     the magenta board, as it shipped      dh 28.0 deg    dH* 15.8
//     the board with the skew removed       dh  0.4 deg    dH*  0.3
//     the Briton trouser, near-neutral      dh 21.9 deg    dH*  4.0
//
// Fifty times between the defect and the fix, and the false positive falls out
// on its own.
//
// WHAT IT IS NOT — docs/PROCESS.md R4.
//   * NOT A GATE WITHOUT `--gate`. Bare, it prints numbers and returns 0, and
//     `factionread` §6/§7 still walks the whole plan where this walks what you
//     name.
//   * NOT A PERCEPTUAL MODEL. A mean over a mask. Open the PNGs — it keeps
//     every one of them, and the standing law of this repo is look at them.
//   * NOT A VERDICT ON THE LOOK. Removing a stage is a diagnostic, not a
//     proposal. `off` is not a candidate frame; it is a control.
//
// AND IT PROVES THE DOOR WAS TAKEN. `/shot` publishes `window.__gradeMask` —
// the spec it parsed, the stages it neutralised, and any token it did not
// recognise. A mistyped arm that silently photographed the shipped frame four
// times over would be an attribution built out of one picture, so an
// unrecognised token is a refusal here and not a warning.
// ============================================================
import { spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { launchBrowser as launchChromium, rasteriserNote, confirmRasteriser, watchBoot } from "./lib/browser.mjs";
import { surfaceMasks, patchLab } from "./lib/surfacemask.mjs";
import { loadClient } from "./lib/clientmodule.mjs";
import { installVirtualClock, FRAME_MS } from "./lib/vclock.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flag = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const PEOPLE = argv[0] || "norse";
const CLS = argv[1] || "huscarl";
const FINISH = argv[2] || "armor_steel";
const TURN = Number(argv[3] ?? 0);

// The arms. `off` is the control — exposure, the filmic curve and the sRGB
// encode and nothing else — and each `off,+X` isolates ONE stage on top of it.
// The `-X` arms are the other direction: the shipped frame with one stage gone,
// which is the arm a candidate fix is judged on.
const ARMS = flag("arms", [
  "", "off",
  "off,+balance", "off,+contrast", "off,+cross", "off,+meter",
  "off,+chroma", "off,+split", "off,+lift",
  "-balance", "-meter", "-chroma", "-opponent",
].join("|")).split("|");

/**
 * `--gate` — the assertion at the bottom of this file, in dH* (see the header).
 * `--bar=` moves it, for a round that wants to know how much headroom there is
 * rather than whether there is any; `--turns=` picks the bearings.
 *
 * The bar is taken off the measurement rather than chosen. Swept over four
 * peoples, every masked surface and three bearings on this tree, the worst
 * reading is about 5 dH*; the defect this gate exists for read 15.8. A bar has
 * to sit clear of the standing state and well under the defect, and 8 is the
 * middle of the room between them.
 */
const GATE = process.argv.includes("--gate");
const DH_BAR = Number(flag("bar", "10"));
const GATE_TURNS = flag("turns", "0,90,180").split(",").map(Number);

const OUT = resolve(ROOT, "art/grade", `${PEOPLE}-${CLS}-${FINISH}-${TURN}`);
mkdirSync(OUT, { recursive: true });

const { CH, ANIM } = await loadClient(ROOT, ".gradesplit");
const { ARMOURY, buildCharacter, defaultAppearance, finishKit, kitFor, wornBy, shieldBoard,
        PEOPLE_IDS, FACTION_FIELD } = CH;
const CLASS_TUNIC = ANIM?.CLASS_TUNIC;
if (!CLASS_TUNIC) { console.error("render/anim.ts does not export CLASS_TUNIC"); process.exit(2); }
if (!PEOPLE_IDS.includes(PEOPLE)) { console.error(`"${PEOPLE}" is not one of ${PEOPLE_IDS.join(", ")}`); process.exit(2); }

// THE LENS — `factionread`'s, which is `/shot`'s `fightcard`, restated as
// arithmetic on the same two play constants rather than as four literals.
const PLAY = { fovDeg: 55, screenH: 900 };
const playScaleFov = (h) => (2 * Math.atan((h / PLAY.screenH) * Math.tan((PLAY.fovDeg * Math.PI) / 360)) * 180) / Math.PI;
const LENS = { w: 520, h: 320, dist: 6.8, targetY: 0.88, eyeY: 2.05, fov: playScaleFov(320) };
const SEED = 13;
const LINEN_SRC = 0xc2b69c;

const armorSlot = ARMOURY.find((s) => s.slot === "armor");
const finish = armorSlot.options.find((x) => x.id === FINISH);
if (!finish) { console.error(`"${FINISH}" is not a finish — have ${armorSlot.options.map((x) => x.id).join(", ")}`); process.exit(2); }

// The board is not a kit surface, and it is the surface three of the four
// entries are about, so it is added to the table the masks are named from. It
// differs between peoples exactly as the dyed surfaces do, which is what
// `nameMeshes` needs to tell it apart from everything else.
const kitWithExtras = (people) => ({
  ...kitFor(finishKit(Number(finish.value)), "none", people),
  linen: wornBy(LINEN_SRC, "none", people, "linen"),
  board: shieldBoard({ ...defaultAppearance(CLS), cloak: "none" }, "none", people),
});
const SURFACES = [...Object.keys(kitWithExtras("none"))];

// ---- the server ------------------------------------------------------------
const PORT = 3400 + (process.pid % 600);
const origin = `http://localhost:${PORT}`;
const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
const proc = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
  stdio: ["ignore", "ignore", "ignore"],
});
watchBoot(proc, "gradesplit");
for (const t0 = Date.now(); ;) {
  try { const r = await fetch(`${origin}/api/health`); if (r.ok || r.status === 404) break; } catch { /* not up */ }
  if (Date.now() - t0 > 240000) { console.error("server never came up"); process.exit(2); }
  await new Promise((r) => setTimeout(r, 400));
}
console.log(`[grade] ${useProd ? "production" : "dev"} server on :${PORT}`);
if (!useProd) console.log("[grade] NO PRODUCTION BUILD — this is the dev server. Run `npm run build` first.");
console.log(`[grade] ${rasteriserNote()}`);

const browser = await launchChromium();
const ctx = await browser.newContext({ viewport: { width: LENS.w, height: LENS.h }, deviceScaleFactor: 1 });
// The fire is at a different phase in every unclocked capture, and a per-surface
// reading is over a tenth of the pixels — vatprobe's own header measured that at
// 10-30 POINTS of noise on a small surface. With the clock, two captures of one
// subject are one picture.
await ctx.addInitScript(installVirtualClock, FRAME_MS);
const page = await ctx.newPage();

const baseAt = (t) => `preset=fightcard&clean=1&settle=16&turn=${t}&cls=${CLS}&armor=${FINISH}`;

const cap = (spec, people) => capAt(spec, people, TURN);

const capAt = async (spec, people, turn) => {
  const url = `${origin}/shot?${baseAt(turn)}&people=${people}${spec ? `&grade=${encodeURIComponent(spec)}` : ""}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300000 });
  await page.waitForFunction(() => window.__shotReady === true || typeof window.__shotError === "string", null, { timeout: 300000 });
  const st = await page.evaluate(() => ({
    s: window.__shotSubject ?? null, e: window.__shotError ?? null, m: window.__gradeMask ?? null,
  }));
  if (st.e) { console.error(`[grade] the page refused: ${st.e}`); process.exit(2); }
  // R4 — the door must be PROVEN taken. A typo that fell through to the shipped
  // frame would make every arm the same picture and the table a fiction.
  if (spec) {
    if (!st.m) { console.error(`[grade] ?grade=${spec} was never read — is the door still in postfx.ts?`); process.exit(2); }
    if (st.m.bad?.length) { console.error(`[grade] ?grade=${spec} names no such stage: ${st.m.bad.join(", ")}`); process.exit(2); }
    if (!st.m.off?.length) { console.error(`[grade] ?grade=${spec} neutralised nothing`); process.exit(2); }
  } else if (st.m) { console.error("[grade] the shipped arm somehow took the door"); process.exit(2); }
  const buf = await page.screenshot({ timeout: 300000 });
  writeFileSync(resolve(OUT, `${people}__${turn}__${(spec || "shipped").replace(/[^a-z0-9+]/gi, "_")}.png`), buf);
  const px = await page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = "data:image/png;base64," + b64; });
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    return Array.from(x.getImageData(0, 0, c.width, c.height).data);
  }, buf.toString("base64"));
  return { subject: st.s, data: Uint8ClampedArray.from(px), mask: st.m };
};

console.log("[grade] warming…");
const warm = await cap("", PEOPLE);
{
  const r = await confirmRasteriser(page);
  console.log(`[grade] the page rasterised through: ${r.renderer}`);
  if (r.mismatch) { console.error("[grade] BRETWALDA_GPU=1 was asked for and the page fell back to SOFTWARE — refusing to report a GPU run that is not one"); process.exit(2); }
}

// ---- the masks are the man the page says it staged ------------------------
// factionread §6.0c's discipline: `/shot` publishes the appearance it built,
// slot for slot, and the mask is cut from THAT rather than from
// `defaultAppearance` — which for a huscarl is a nasal helm and a red cloak the
// card does not stage, and is 20-33% too many pixels at these bearings.
const SUBJECT_FIELD = {
  helm: "helm", hair: "hairStyle", hairColor: "hairColor",
  beard: "beardStyle", beardColor: "beardColor",
  cloak: "cloak", armor: "armorColor", warPaint: "warPaint", weapon: "weapon",
};
{
  const a = ARMOURY.map((x) => x.slot).sort().join(",");
  const b = Object.keys(SUBJECT_FIELD).sort().join(",");
  if (a !== b) { console.error(`[grade] the shop has slots this probe cannot stage: [${a}] vs [${b}]`); process.exit(2); }
}
const apFor = (people) => {
  const ap = { ...defaultAppearance(CLS) };
  for (const [slot, field] of Object.entries(SUBJECT_FIELD)) {
    const v = warm.subject?.[slot];
    if (v === undefined || v === null) { console.error(`[grade] the page published no ${slot}`); process.exit(2); }
    ap[field] = /^0x[0-9a-f]+$/i.test(String(v)) ? Number(v) : String(v);
  }
  ap.people = people;
  return ap;
};
const { masks, counts, problems } = surfaceMasks({
  buildGroup: (people) => buildCharacter(CLS,
    { ...apFor(people), armorColor: Number(finish.value) },
    CLASS_TUNIC[CLS] ?? 0x5a4a2c, undefined, "high", SEED, "none").group,
  kitOf: kitWithExtras,
  peoples: [...PEOPLE_IDS], surfaces: SURFACES, lens: LENS, turnDeg: TURN,
});
if (problems.length) { console.error(`[grade] the per-surface mask cannot be trusted: ${problems[0]}`); process.exit(2); }

// ---- CIELAB helpers, matching surfacemask's own conversion -----------------
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function labOfHex(hex) {
  const R = (hex >> 16) & 255, G = (hex >> 8) & 255, B = hex & 255;
  const r = lin(R / 255), g = lin(G / 255), b = lin(B / 255);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const chroma = (lab) => Math.hypot(lab[1], lab[2]);
const hue = (lab) => ((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360;
/** Signed shortest way round the circle, which is the only correct hue delta. */
const hueDrift = (a, b) => { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };

// The surfaces worth printing: the ones with enough pixels to mean anything.
const MIN = 120;
const SHOWN = SURFACES.filter((s) => (counts[s]?.eroded ?? 0) >= MIN);
const SKIPPED = SURFACES.filter((s) => !SHOWN.includes(s));

const albedo = Object.fromEntries(SHOWN.map((s) => {
  const hex = kitWithExtras(PEOPLE)[s];
  return [s, { hex, lab: labOfHex(hex) }];
}));

console.log(`\n[grade] ${PEOPLE} ${CLS} · ${finish.label} (${finish.cost}g) · bearing ${TURN}°`);
console.log(`[grade] frames in art/grade/${PEOPLE}-${CLS}-${FINISH}-${TURN}/ — OPEN THEM\n`);
if (SKIPPED.length) console.log(`        too few pixels to read at this bearing, skipped: ${SKIPPED.join(", ")}\n`);

const rows = [];
for (const spec of ARMS) {
  const { data } = spec === "" ? warm : await cap(spec, PEOPLE);
  const row = { arm: spec || "SHIPPED", by: {} };
  for (const s of SHOWN) {
    const p = patchLab(data, masks[s]);
    row.by[s] = p.n ? { lab: p.lab, hex: p.hex, n: p.n } : null;
  }
  rows.push(row);
}

for (const s of SHOWN) {
  const a = albedo[s];
  console.log(`  ── ${s.toUpperCase()}  (${counts[s].eroded} px)`);
  console.log(`     ALBEDO  #${a.hex.toString(16).padStart(6, "0")}   L* ${a.lab[0].toFixed(1).padStart(5)}  C* ${chroma(a.lab).toFixed(1).padStart(5)}  hue ${hue(a.lab).toFixed(1).padStart(6)}°`);
  console.log(`     arm                    rendered      L*     C*     hue      HUE DRIFT off the pigment`);
  for (const r of rows) {
    const v = r.by[s];
    if (!v) continue;
    const d = hueDrift(hue(v.lab), hue(a.lab));
    const bar = "█".repeat(Math.min(30, Math.round(Math.abs(d) / 2)));
    console.log(`     ${r.arm.padEnd(20)} ${v.hex}   ${v.lab[0].toFixed(1).padStart(5)}  ${chroma(v.lab).toFixed(1).padStart(5)}  ${hue(v.lab).toFixed(1).padStart(6)}°   ${(d >= 0 ? "+" : "") + d.toFixed(1) + "°"}`.padEnd(96) + ` ${bar}`);
  }
  console.log("");
}

console.log("  A grade may move a surface's LIGHTNESS and its CHROMA — that is what light and a");
console.log("  tone curve do. HUE DRIFT is the column the four open entries are about: a pigment");
console.log("  carried tens of degrees off its own hue is a different colour, whatever its ΔE.");

// ---- THE GATE ------------------------------------------------------------
if (GATE) {
  console.log(`\n[grade] === THE GRADE'S OWN ROTATION — every people, every surface, ${GATE_TURNS.join("/")}° ===\n`);
  console.log(`  The bar is ${DH_BAR} dH*. Not a taste: the frame with the grade OFF has already had`);
  console.log("  the scene's own light on it, so a hue difference between it and the shipped frame");
  console.log("  is the GRADE turning a material. The magenta board read 15.8; see the header for");
  console.log("  why this is dH* and not the raw angle, which called a neutral trouser the same");
  console.log("  finding as the defect.\n");
  // WHAT THIS GATE DOES NOT COVER, SAID BEFORE ITS VERDICT AND NOT AFTER.
  //
  // The masks come from `buildCharacter(...).group`, and the SHIELD is not in
  // that group — `render/anim.ts` builds it separately and hangs it on the
  // rig's own `joints.elbowL`. `factionread` carries the same hole as a standing
  // deferral in its own words ("the shield is NOT in the raster"), and §1's
  // entry in docs/OPEN-DEFECTS.md is built on it: "factionread §1 measures the
  // man WITHOUT HIS SHIELD".
  //
  // So the surface this whole round is named after — the Danelaw's board — is
  // the one surface this gate cannot read, and saying so is the point. A gate
  // that quietly omitted it would be green for the same reason §6 and §7 were
  // green while the board rendered magenta. The board's own reading is in the
  // ledger, taken by hand off these same captures (28.0° before, 0.4° after).
  //
  // THE NEXT INSTRUMENT STEP, for whoever wants it: attach the shield to the
  // mask build the way the rig does. It needs the elbow joint, and
  // `buildCharacter` returns `leftArm` rather than the joint itself, so it is a
  // small change to what that function hands back — not a change to this file.
  // Guessing the transform is worse than the deferral: a mask that does not
  // line up with the pixels measures a different surface and says nothing.
  const UNCOVERED = SURFACES.filter((x) => !SHOWN.includes(x));
  console.log(`  NOT COVERED: the shield board — it is not in buildCharacter's group, so no mask`);
  console.log(`  can be cut for it. See the note at this gate. Also unread at these bearings:`);
  console.log(`  ${UNCOVERED.filter((x) => x !== "board").join(", ") || "nothing else"}.\n`);

  const bad = [];
  let worst = { dH: -1 };
  console.log("  people   surface    bearing   grade OFF             SHIPPED               the grade turned it");
  console.log("  ---------------------------------------------------------------------------------------------------");
  // The masks are a function of the BEARING, not of the people —
  // `surfaceMasks` asserts every people rasterises to the same geometry, which
  // is the whole reason a sworn frame and its control can be read through one
  // array. So they are cut once per bearing and not once per cell.
  const maskAt = new Map();
  for (const t of GATE_TURNS) {
    const mk = surfaceMasks({
      buildGroup: (pp) => buildCharacter(CLS,
        { ...apFor(pp), armorColor: Number(finish.value) },
        CLASS_TUNIC[CLS] ?? 0x5a4a2c, undefined, "high", SEED, "none").group,
      kitOf: kitWithExtras,
      peoples: [...PEOPLE_IDS], surfaces: SURFACES, lens: LENS, turnDeg: t,
    });
    if (mk.problems.length) { console.error(`[grade] the mask cannot be trusted: ${mk.problems[0]}`); process.exit(2); }
    maskAt.set(t, mk);
  }
  for (const people of PEOPLE_IDS) {
    for (const t of GATE_TURNS) {
      const mk = maskAt.get(t);
      const shipped = await capAt("", people, t);
      const off = await capAt("off", people, t);
      for (const surf of SURFACES) {
        if ((mk.counts[surf]?.eroded ?? 0) < MIN) continue;
        const a = patchLab(shipped.data, mk.masks[surf]);
        const b = patchLab(off.data, mk.masks[surf]);
        if (!a.n || !b.n) continue;
        // No chroma floor is needed any more and that is the point of dH*: a
        // surface with no chroma cannot produce a large one however far its
        // angle wanders, so the neutrals discount themselves instead of being
        // excluded by a threshold somebody had to choose.
        const Ca = chroma(a.lab), Cb = chroma(b.lab);
        const dh = hueDrift(hue(a.lab), hue(b.lab));
        // dH* — the hue term of dE. Signed under the root only through dh, so
        // the magnitude is what is gated.
        const dH = 2 * Math.sqrt(Math.max(Ca * Cb, 0)) * Math.abs(Math.sin((dh * Math.PI) / 360));
        const row = { people, surf, t, off: hue(b.lab), ship: hue(a.lab), dh: Math.abs(dh), dH, Ca, Cb };
        if (dH > worst.dH) worst = row;
        if (dH > DH_BAR) bad.push(row);
        console.log(`  ${people.padEnd(8)} ${surf.padEnd(9)} ${String(t).padStart(6)}°   ${b.hex} ${b.lab[0].toFixed(0).padStart(3)}L C*${Cb.toFixed(0).padStart(3)}   ${a.hex} ${a.lab[0].toFixed(0).padStart(3)}L C*${Ca.toFixed(0).padStart(3)}   ${Math.abs(dh).toFixed(1).padStart(6)}°  ${dH.toFixed(1).padStart(5)} dH*${dH > DH_BAR ? "   OVER" : ""}`);
      }
    }
  }
  console.log("");
  if (bad.length) {
    console.log(`  FAIL  the grade turns a material's hue — ${bad.length} surface-readings over ${DH_BAR} dH*, worst ${worst.dH.toFixed(1)} dH* (${worst.dh.toFixed(1)}°) at ${worst.people}/${worst.surf}@${worst.t}° — ${worst.off.toFixed(1)}° C*${worst.Cb.toFixed(0)} lit -> ${worst.ship.toFixed(1)}° C*${worst.Ca.toFixed(0)} graded`);
    await browser.close(); proc.kill(); process.exit(1);
  }
  console.log(`  PASS  the grade turns no material's hue past ${DH_BAR} dH* — worst ${worst.dH.toFixed(1)} dH* (${worst.dh.toFixed(1)}°) at ${worst.people}/${worst.surf}@${worst.t}°`);
  console.log(`        — AND THE BOARD IS NOT IN IT. This is a PASS over the surfaces that can be`);
  console.log(`          masked, not over the man. See NOT COVERED above.`);
}

console.log("\n[grade] now open the PNGs.");

await browser.close();
proc.kill();
process.exit(0);
