#!/usr/bin/env node
// ============================================================
// VATPROBE — one question, on graded frames, in ten minutes instead of two
// hours: does swearing to a people make a man PINKER than he was, in THIS kit?
//
//   node tools/vatprobe.mjs armor_steel,armor_crimson norse
//   node tools/vatprobe.mjs <finish_id>[,<finish_id>...] [people]
//
// WHY IT EXISTS. `tools/factionread.mjs` §6/§7 is the gate and it sweeps the
// whole plan — 11 staged men x 4 peoples x 3 bearings plus a matched unsworn
// floor for each — which is a couple of hours on a box with no GPU. That is the
// right cost for a verdict and the wrong cost for a QUESTION. Four rounds of
// the Danelaw's rose were argued out of albedo numbers and second-hand
// sentences because the only lit instrument in the drawer cost an afternoon.
//
// WHAT IT MEASURES, and it is `factionread` §7.1's quantity exactly, off the
// same `tools/lib/roseband.mjs`: the share of the man's own pixels inside the
// rose band, on a settled `fightcard` capture at the play lens, against the
// SAME MAN IN THE SAME KIT SWORN TO NOBODY on the same mark under the same
// fire. The finish is NAMED on the query and the staged `armor` is checked, so
// it cannot quietly photograph the issued iron — which is the hole this round
// found in §6, §7 and every faction sheet in `tools/shoot.mjs`.
//
// WHAT IT IS NOT — docs/PROCESS.md R4.
//   * NOT A GATE. It prints numbers and returns 0. `factionread` §7.1 is the
//     gate and it walks the whole plan; this walks what you name.
//   * NOT A MASK OFF THE RASTERISER. `factionread` builds the man's coverage
//     mask by rasterising the same scene graph at the same lens, which is
//     exact. This thresholds luminance at 24/255 to separate the man from the
//     arena's near-black ground, which is a shade generous at the silhouette
//     and identical between the sworn frame and its control — so the DELTA is
//     sound and the absolute share is not comparable to §7.1's.
//   * NOT A PERCEPTUAL MODEL. A pixel count. Open the frame.
//   * NOT CLOCKED. `factionread` §6 installs a virtual clock and a seeded die
//     and then ASSERTS repeatability (§6.2: the same subject twice must give
//     the same count). This does neither, so the arena's fire is at a different
//     phase in every capture. The size of that is measured rather than guessed:
//     the same UNSWORN huscarl in Polished Steel at 0°, on two trees whose
//     unsworn path is byte-identical by construction, read 0.202% and 0.193% —
//     about 5% of the floor, and the modal moved `#c89090` to `#c88880`. Treat
//     anything inside a tenth of a point as noise. The deltas this file was
//     built to settle are ten times that. A verdict still belongs to §7.1.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { makeBand, roseShare, labOf, chromaOf, hueOfLab } from "./lib/roseband.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FINISHES = (process.argv[2] || "armor_iron,armor_steel").split(",");
const PEOPLE = process.argv[3] || "norse";
const BEARINGS = [0, 90, 180];
const LENS = { w: 520, h: 320 };

const PORT = 3400 + (process.pid % 600);
const origin = `http://localhost:${PORT}`;
const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
const proc = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
  stdio: ["ignore", "ignore", "ignore"],
});
const t0 = Date.now();
for (;;) {
  try { const r = await fetch(`${origin}/api/health`); if (r.ok || r.status === 404) break; } catch {}
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
const band = makeBand(0x7c1420);

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
await cap(`preset=fightcard&clean=1&settle=16&turn=0&cls=huscarl&people=none&armor=${FINISHES[0]}`);

/** The man's own pixels: anything that is not the near-black arena ground/sky. */
const manMask = (a) => {
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

console.log("\nfinish            turn  SWORN rose%   modal      UNSWORN rose%  modal      delta     clipped px (hottest)   peak C*");
for (const f of FINISHES) {
  for (const turn of BEARINGS) {
    const s = await cap(`preset=fightcard&clean=1&settle=16&turn=${turn}&cls=huscarl&people=${PEOPLE}&armor=${f}`);
    const u = await cap(`preset=fightcard&clean=1&settle=16&turn=${turn}&cls=huscarl&people=none&armor=${f}`);
    const ms = manMask(s.data), mu = manMask(u.data);
    const rs = roseShare(band, s.data, ms);
    const ru = roseShare(band, u.data, mu);
    const cs = clipOf(s.data, ms), cu = clipOf(u.data, mu), pk = peakChroma(s.data, ms);
    console.log(`${f.padEnd(16)} ${String(turn).padStart(5)}  ${rs.pct.toFixed(3).padStart(9)}%  ${rs.modal.padEnd(9)}  ${ru.pct.toFixed(3).padStart(9)}%  ${ru.modal.padEnd(9)}  ${(rs.pct - ru.pct >= 0 ? "+" : "")}${(rs.pct - ru.pct).toFixed(3)}   ${String(cs.clipped).padStart(5)} of ${cs.n} (${cs.hot}) vs unsworn ${cu.clipped}   ${pk.hex} C* ${pk.C.toFixed(1)}   (${s.ms}ms/${u.ms}ms)`);
  }
}
await browser.close();
proc.kill("SIGTERM");
