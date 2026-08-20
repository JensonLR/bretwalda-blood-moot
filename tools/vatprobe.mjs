#!/usr/bin/env node
// ============================================================
// VATPROBE — one question, on graded frames, in ten minutes instead of two
// hours: does swearing to a people make a man PINKER than he was, in THIS kit?
// And since a man is not one surface: pinker WHERE?
//
//   node tools/vatprobe.mjs armor_steel,armor_crimson norse
//   node tools/vatprobe.mjs <finish_id>[,<finish_id>...] [people] [cls]
//
// WHY IT EXISTS. `tools/factionread.mjs` §6/§7 is the gate and it sweeps the
// whole plan — 11 staged men x 4 peoples x 3 bearings plus a matched unsworn
// floor for each — which is a couple of hours on a box with no GPU. That is the
// right cost for a verdict and the wrong cost for a QUESTION. Four rounds of
// the Danelaw's rose were argued out of albedo numbers and second-hand
// sentences because the only lit instrument in the drawer cost an afternoon.
//
// WHAT IT MEASURES, and it is `factionread` §7.1 and §7.1b's quantity exactly,
// off the same `tools/lib/roseband.mjs` and the same
// `tools/lib/surfacemask.mjs`: the share of the man's own pixels inside the
// rose band, and the share of ONE SURFACE'S pixels — his byrnie, his tunic, his
// leg wraps — on a settled `fightcard` capture at the play lens, against the
// SAME MAN IN THE SAME KIT SWORN TO NOBODY on the same mark under the same
// fire. The finish is NAMED on the query and the staged `armor` is checked, so
// it cannot quietly photograph the issued iron.
//
// WHY PER SURFACE, AND IT IS THIS FILE'S OWN HISTORY. The version of this probe
// that shipped last round read the loadout `huscarl / Polished Steel 60g / 0° /
// norse` as **+0.391 points of rose** and its author called that noise. An
// adversary cropped the byrnie out of the same frame by hand and read **1.5%
// unsworn against 19.4% sworn** — twelve times pinker, and thirteen points
// lighter with it. Both numbers are true. A byrnie is about half of a man at
// that lens and the other five surfaces are not pink, so a surface that goes
// all the way over dilutes to a rounding error across him. An instrument that
// answers the whole man cannot answer this question, and this one now answers
// both and prints them side by side.
//
// WHAT IT IS NOT — docs/PROCESS.md R4.
//   * NOT A GATE. It prints numbers and returns 0. `factionread` §7.1/§7.1b is
//     the gate and it walks the whole plan; this walks what you name.
//   * NOT A PERCEPTUAL MODEL. A pixel count. Open the frame.
//   * NOT CLOCKED. `factionread` §6 installs a virtual clock and a seeded die
//     and then ASSERTS repeatability (§6.2: the same subject twice must give
//     the same count). This does neither, so the arena's fire is at a different
//     phase in every capture. The size of that is measured rather than guessed:
//     the same UNSWORN huscarl in Polished Steel at 0°, on two trees whose
//     unsworn path is byte-identical by construction, read 0.202% and 0.193% —
//     about 5% of the floor. Treat anything inside a tenth of a point on the
//     WHOLE MAN as noise; a per-surface reading is over a tenth of the pixels,
//     so treat a point of it the same way. The deltas this file was built to
//     settle are ten and a hundred times that. A verdict still belongs to §7.1.
//
// WHAT CHANGED IN THE MASK, AND IT IS NO LONGER A THRESHOLD. This file used to
// separate the man from the arena by luminance — "a shade generous at the
// silhouette", in its own words — because it had no rasteriser. It now cuts the
// same masks `factionread` does, off the client's own scene graph at the
// capture's own lens, built from the appearance `/shot` publishes for the frame
// it just took. The whole-man share is therefore comparable to §7.1's now, and
// the luminance column is kept beside it for one run's worth of continuity.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { makeBand, roseShare, labOf, chromaOf, hueOfLab, arcTo, ARC } from "./lib/roseband.mjs";
import { surfaceMasks, patchLab, MIN_PIXELS } from "./lib/surfacemask.mjs";
import { loadClient } from "./lib/clientmodule.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FINISHES = (process.argv[2] || "armor_iron,armor_steel").split(",");
const PEOPLE = process.argv[3] || "norse";
const CLS = process.argv[4] || "huscarl";
const BEARINGS = [0, 90, 180];

// ---- The client, compiled and imported, so the masks are the shipped man ----
const { CH, ANIM } = await loadClient(ROOT, ".vatprobe");
const { ARMOURY, buildCharacter, defaultAppearance, finishKit, kitFor, wornBy, PEOPLE_IDS, FACTION_FIELD } = CH;
const CLASS_TUNIC = ANIM?.CLASS_TUNIC;
if (!CLASS_TUNIC) { console.error("render/anim.ts does not export CLASS_TUNIC"); process.exit(2); }
const PEOPLES = [...PEOPLE_IDS];
if (!PEOPLES.includes(PEOPLE)) { console.error(`"${PEOPLE}" is not one of ${PEOPLES.join(", ")}`); process.exit(2); }

// THE LENS — `factionread`'s, which is `/shot`'s `fightcard`. Restated here as
// arithmetic on the same two play constants rather than as four literals.
const PLAY = { fovDeg: 55, screenH: 900 };
const playScaleFov = (h) => (2 * Math.atan((h / PLAY.screenH) * Math.tan((PLAY.fovDeg * Math.PI) / 360)) * 180) / Math.PI;
const LENS = { w: 520, h: 320, dist: 6.8, targetY: 0.88, eyeY: 2.05, fov: playScaleFov(320) };

const SEED = 13;
const LINEN_SRC = 0xc2b69c;
const armorSlot = ARMOURY.find((s) => s.slot === "armor");
const finishOf = (id) => {
  const o = armorSlot.options.find((x) => x.id === id);
  if (!o) { console.error(`"${id}" is not an armoury finish — have ${armorSlot.options.map((x) => x.id).join(", ")}`); process.exit(2); }
  return { id: o.id, label: o.label, cost: o.cost, value: Number(o.value) };
};
const probeKit = finishKit(Number(armorSlot.options[0].value));
const DYED = Object.keys(probeKit).filter((k) => PEOPLES.some((p) => kitFor(probeKit, "none", p)[k] !== probeKit[k]));
const UNDYED = Object.keys(probeKit).filter((k) => !DYED.includes(k));
const SURFACES = [...DYED, "linen", ...UNDYED];
const GATEWORTHY = new Set([...DYED, "linen"]);
const kitWithLinen = (value, people) => ({
  ...kitFor(finishKit(value), "none", people),
  linen: wornBy(LINEN_SRC, "none", people, "linen"),
});

const PORT = 3400 + (process.pid % 600);
const origin = `http://localhost:${PORT}`;
const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
const proc = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
  stdio: ["ignore", "ignore", "ignore"],
});
const t0 = Date.now();
for (;;) {
  try { const r = await fetch(`${origin}/api/health`); if (r.ok || r.status === 404) break; } catch { /* not up */ }
  if (Date.now() - t0 > 240000) { console.error("server never came up"); process.exit(2); }
  await new Promise((r) => setTimeout(r, 500));
}
console.log(`${useProd ? "production" : "dev"} server on :${PORT}`);
const browser = await chromium.launch({
  ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--no-sandbox", "--ignore-gpu-blocklist"],
});
const ctx = await browser.newContext({ viewport: { width: LENS.w, height: LENS.h }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const band = makeBand(FACTION_FIELD.norse);

const cap = async (q) => {
  const t = Date.now();
  await page.goto(`${origin}/shot?${q}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await page.waitForFunction(() => window.__shotReady === true || typeof window.__shotError === "string", null, { timeout: 300000 });
  const st = await page.evaluate(() => ({ s: window.__shotSubject ?? null, e: window.__shotError ?? null }));
  if (st.e) { console.error("refused:", st.e, q); process.exit(2); }
  const buf = await page.screenshot({ timeout: 300000 });
  const px = await page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = "data:image/png;base64," + b64; });
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    return Array.from(x.getImageData(0, 0, c.width, c.height).data);
  }, buf.toString("base64"));
  return { subject: st.s, data: Uint8ClampedArray.from(px), ms: Date.now() - t };
};

console.log("warming…");
const warm = await cap(`preset=fightcard&clean=1&settle=16&turn=0&cls=${CLS}&people=none&armor=${FINISHES[0]}`);

// ---- THE MASK IS THE MAN THE PAGE SAYS IT STAGED ---------------------------
// Same discipline as `factionread` §6.0c: `/shot` publishes the appearance it
// built, slot for slot, and the mask is cut from THAT rather than from
// `defaultAppearance` — which for a huscarl is a nasal helm and a red cloak the
// card does not stage, and is 20-33% too many pixels at these bearings.
const SUBJECT_FIELD = {
  helm: "helm", hair: "hairStyle", hairColor: "hairColor",
  beard: "beardStyle", beardColor: "beardColor",
  cloak: "cloak", armor: "armorColor", warPaint: "warPaint",
};
{
  const a = ARMOURY.map((x) => x.slot).sort().join(",");
  const b = Object.keys(SUBJECT_FIELD).sort().join(",");
  if (a !== b) { console.error(`the shop has slots this probe cannot stage: [${a}] vs [${b}]`); process.exit(2); }
}
const apFromSubject = (subject, people) => {
  const ap = { ...defaultAppearance(CLS) };
  for (const [slot, field] of Object.entries(SUBJECT_FIELD)) {
    const v = subject?.[slot];
    if (v === undefined || v === null) { console.error(`the page published no ${slot}`); process.exit(2); }
    ap[field] = /^0x[0-9a-f]+$/i.test(String(v)) ? Number(v) : String(v);
  }
  ap.people = people;
  return ap;
};
console.log(`staged dress: ${Object.keys(SUBJECT_FIELD).filter((k) => k !== "armor").map((k) => `${k}=${warm.subject?.[k]}`).join("  ")}`);

const masksFor = (finish, turn) => {
  const buildGroup = (people) => buildCharacter(CLS,
    { ...apFromSubject(warm.subject, people), armorColor: finish.value },
    CLASS_TUNIC[CLS] ?? 0x5a4a2c, undefined, "high", SEED, "none").group;
  const r = surfaceMasks({ buildGroup, kitOf: (p) => kitWithLinen(finish.value, p),
    peoples: PEOPLES, surfaces: SURFACES, lens: LENS, turnDeg: turn });
  if (r.problems.length) { console.error("the per-surface mask cannot be trusted:", r.problems[0]); process.exit(2); }
  return r;
};

/** The old luminance silhouette, kept for one round so the columns can be compared. */
const lumMask = (a) => {
  const m = new Uint8Array(a.length / 4);
  for (let i = 0, p = 0; i < a.length; i += 4, p++) {
    const lum = 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2];
    m[p] = lum > 24 ? 1 : 0;
  }
  return m;
};
/** Pixels of the man with any channel at full scale, and the hottest of them. */
const clipOf = (a, m) => {
  let n = 0, clipped = 0, hot = null, hotL = -1;
  for (let i = 0, p = 0; i < a.length; i += 4, p++) {
    if (!m[p]) continue;
    n++;
    if (a[i] < 255 && a[i + 1] < 255 && a[i + 2] < 255) continue;
    clipped++;
    const lum = 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2];
    if (lum > hotL) { hotL = lum; hot = `#${a[i].toString(16).padStart(2, "0")}${a[i + 1].toString(16).padStart(2, "0")}${a[i + 2].toString(16).padStart(2, "0")}`; }
  }
  return { n, clipped, pct: n ? (100 * clipped) / n : 0, hot: hot ?? "—" };
};
/** The most chromatic pixel on the man — a flat painted field shows up here. */
const peakChroma = (a, m) => {
  let best = null, bestC = -1;
  for (let i = 0, p = 0; i < a.length; i += 4, p++) {
    if (!m[p]) continue;
    const C = chromaOf(labOf((a[i] << 16) | (a[i + 1] << 8) | a[i + 2]));
    if (C > bestC) { bestC = C; best = `#${a[i].toString(16).padStart(2, "0")}${a[i + 1].toString(16).padStart(2, "0")}${a[i + 2].toString(16).padStart(2, "0")}`; }
  }
  return { hex: best ?? "—", C: bestC };
};

console.log(`\nband: ${band.describe()}`);
console.log(`\n=== THE WHOLE MAN — ${CLS}, ${PEOPLE} against the same kit sworn to nobody ===`);
console.log("\nfinish            turn   SWORN rose%   modal      UNSWORN rose%  modal      delta    (luminance mask: sworn/unsworn)   clipped px (hottest)   peak C*");
const perSurfaceRows = [];
for (const id of FINISHES) {
  const f = finishOf(id);
  for (const turn of BEARINGS) {
    const s = await cap(`preset=fightcard&clean=1&settle=16&turn=${turn}&cls=${CLS}&people=${PEOPLE}&armor=${f.id}`);
    const u = await cap(`preset=fightcard&clean=1&settle=16&turn=${turn}&cls=${CLS}&people=none&armor=${f.id}`);
    if (String(s.subject?.armor) !== `0x${f.value.toString(16).padStart(6, "0")}`) { console.error(`staged wrong armor: ${s.subject?.armor}`); process.exit(2); }
    if (String(s.subject?.people) !== PEOPLE || String(u.subject?.people) !== "none") { console.error("staged wrong people"); process.exit(2); }
    const sm = masksFor(f, turn);
    const man = sm.cov;
    const rs = roseShare(band, s.data, man), ru = roseShare(band, u.data, man);
    const ls = roseShare(band, s.data, lumMask(s.data)), lu = roseShare(band, u.data, lumMask(u.data));
    const cs = clipOf(s.data, man), pk = peakChroma(s.data, man);
    console.log(`${f.id.padEnd(16)} ${String(turn).padStart(5)}  ${rs.pct.toFixed(3).padStart(10)}%  ${rs.modal.padEnd(9)}  ${ru.pct.toFixed(3).padStart(9)}%  ${ru.modal.padEnd(9)}  ${(rs.pct - ru.pct >= 0 ? "+" : "")}${(rs.pct - ru.pct).toFixed(3)}   ${ls.pct.toFixed(3)}%/${lu.pct.toFixed(3)}%   ${String(cs.clipped).padStart(5)} of ${cs.n} (${cs.hot})   ${pk.hex} C* ${pk.C.toFixed(1)}   (${s.ms}ms/${u.ms}ms)`);
    for (const surf of SURFACES) {
      const m = sm.masks[surf], n = sm.counts[surf].eroded;
      if (n < MIN_PIXELS) { perSurfaceRows.push({ f, turn, surf, thin: n, raw: sm.counts[surf].raw }); continue; }
      const a = roseShare(band, s.data, m), b = roseShare(band, u.data, m);
      const la = patchLab(s.data, m), lb = patchLab(u.data, m);
      perSurfaceRows.push({ f, turn, surf, n, sworn: a.pct, unsworn: b.pct, modal: a.modal,
        swL: la.lab[0], unL: lb.lab[0], swHex: la.hex, unHex: lb.hex,
        onArc: arcTo(hueOfLab(la.lab), band.fieldH) <= ARC || arcTo(hueOfLab(lb.lab), band.fieldH) <= ARC });
    }
  }
}

console.log(`\n=== PER SURFACE — the SAME pixels sworn and unsworn, eroded one pixel so no blend belongs to two surfaces ===`);
console.log("\nfinish            turn  surface     px      SWORN rose%   UNSWORN rose%   delta      SWORN L*   UNSWORN L*   delta    mean sworn / unsworn   arc");
for (const r of perSurfaceRows) {
  if (r.thin !== undefined) {
    console.log(`${r.f.id.padEnd(16)} ${String(r.turn).padStart(5)}  ${(r.surf + (GATEWORTHY.has(r.surf) ? "" : "*")).padEnd(10)} ${String(r.thin).padStart(5)}   NOT MEASURABLE (under ${MIN_PIXELS} px after erosion; ${r.raw} before)`);
    continue;
  }
  console.log(`${r.f.id.padEnd(16)} ${String(r.turn).padStart(5)}  ${(r.surf + (GATEWORTHY.has(r.surf) ? "" : "*")).padEnd(10)} ${String(r.n).padStart(5)} `
    + `${r.sworn.toFixed(2).padStart(11)}%  ${r.unsworn.toFixed(2).padStart(12)}%  ${((r.sworn - r.unsworn >= 0 ? "+" : "") + (r.sworn - r.unsworn).toFixed(2)).padStart(8)}  `
    + `${r.swL.toFixed(1).padStart(9)}  ${r.unL.toFixed(1).padStart(11)}  ${((r.swL - r.unL >= 0 ? "+" : "") + (r.swL - r.unL).toFixed(1)).padStart(7)}    `
    + `${r.swHex} / ${r.unHex}   ${r.onArc ? "ON ARC" : "off"}`);
}
console.log("\n* = a surface no vat touches. It is the control, not a rule: it should not move.");
console.log("A verdict belongs to `tools/factionread.mjs` §7.1 and §7.1b, which walk the whole plan under a virtual clock.");

await browser.close();
proc.kill("SIGTERM");
