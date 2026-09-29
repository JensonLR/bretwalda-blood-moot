#!/usr/bin/env node
// ============================================================
// NUMERALPROBE — does `font-variant-numeric` actually reach Alegreya's figures
// once Google's subsetter and `next/font` have had their way with the file?
//
//   node tools/numeralprobe.mjs            (through the lock: /tmp/claude-0/cap ...)
//   node tools/numeralprobe.mjs --port 3455
//
// WHY THIS IS A BROWSER PROBE AND NOT A GREP.
//
// The design plan (UI-PLAN.md section 1.5) sets every timer, war code, count and
// price in Alegreya 700 with `lining-nums tabular-nums`, because Cinzel's `1` is
// a bare bar and `21H 51M` reads `2IH 5IM` on the war map. That fix is only real
// if the two OpenType features (`lnum`, `tnum`) SURVIVE in the font file the
// player is actually served. `next/font/google` fetches a Google-subsetted
// WOFF2 at build time and Google's pipeline is free to drop layout features it
// does not think a Latin subset needs. Nothing in the source can say whether it
// did: a stylesheet that asks for `lining-nums` on a file without `lnum` is
// accepted without a word and does exactly nothing. That is the failure mode
// csscheck check 5 exists for (a rule that silently does nothing), arriving
// from the font instead of the stylesheet, and the only instrument that can see
// it is a rasteriser drawing the glyph.
//
// WHAT IS MEASURED (never the CSS, always the ink):
//   A. lining-nums  — the ink height of "1" reaches (almost) cap height AND is
//                     clearly taller than the same "1" under oldstyle-nums. A
//                     lining figure stands on the baseline and reaches the caps;
//                     an old-style "1" is x-height tall.
//                     THE FIRST DRAFT OF THIS CLAIM WAS WRONG, and it was wrong
//                     the way this repository's rulers usually are. It demanded
//                     the lining "1" equal the "H" to within 6% and failed on the
//                     real font at 98px against 105px, calling `lnum` broken when
//                     the figures were plainly lining (98px against 85px old-style,
//                     and "0" moved the same way). Alegreya draws its lining
//                     figures about 7% under cap height; that is a property of the
//                     typeface's design, not of the feature. What the feature
//                     changes, and what the claim now measures, is the RATIO
//                     between the two settings, with the cap height as a sanity
//                     bound that a figure of a quarter-height cannot pass.
//   B. tabular-nums — "1" and "0" occupy the same advance width; under
//                     proportional-nums they do not. That is what stops a
//                     ticking clock from shivering.
//   C. the two are NOT the default. Reported, not gated: if Alegreya's defaults
//      were already lining the fix would be a no-op, and that is worth knowing.
//   D. CONTROL, and the reason a green verdict means anything: the same three
//      questions asked of the display face (Cinzel), whose figures the plan
//      says are wrong. If the probe cannot tell a font that has the feature from
//      one that has not, it has not measured the feature.
//
// If A or B fails, STOP: the plan's fallback is Alegreya SC (if its defaults are
// lining) or dropping `lnum` and enlarging the digit with font-feature-settings.
// ============================================================
import { chromium } from "playwright";
import { launchOptions, watchBoot, rasteriserNote } from "./lib/browser.mjs";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = parseInt(flag("port", String(3400 + (process.pid % 200))), 10);
const BASE = `http://localhost:${PORT}`;

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const note = (m) => console.log(`        ${m}`);

let server;
async function startServer() {
  try {
    await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) });
    console.error(`[numeralprobe] something is already serving ${BASE} — pass --port to pick another`);
    process.exit(2);
  } catch { /* nothing there, which is what we want */ }
  if (!existsSync(resolve(ROOT, ".next/BUILD_ID"))) {
    console.error("[numeralprobe] no production build — run `npm run build` first (the fonts are what is probed)");
    process.exit(2);
  }
  server = spawn("node", ["custom-server.mjs"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"],
  });
  watchBoot(server, "numeralprobe");
  const started = Date.now();
  for (;;) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) break; } catch { /* wait */ }
    if (Date.now() - started > 120000) throw new Error("server never came up");
    await new Promise((r) => setTimeout(r, 600));
  }
}

/** Ink bounding box of a PNG buffer against its own top-left background pixel. */
async function ink(buf) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const bg = [data[0], data[1], data[2]];
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * ch;
      const d = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
      if (d > 90) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  return x1 < 0 ? null : { w: x1 - x0 + 1, h: y1 - y0 + 1, top: y0, bottom: y1 };
}

async function main() {
  await startServer();
  const browser = await chromium.launch({ ...launchOptions() });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 700 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  // The two families exactly as the app names them, through its own variables.
  const fam = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const probe = (v) => { const s = document.createElement("span"); s.style.fontFamily = `var(${v})`; document.body.appendChild(s);
      const f = getComputedStyle(s).fontFamily; s.remove(); return f; };
    return { body: probe("--font-body"), display: probe("--font-display"), html: document.documentElement.className };
  });
  note(`--font-body    -> ${fam.body}`);
  note(`--font-display -> ${fam.display}`);

  const SIZE = 160;
  const stage = async (family, weight, variant, text) => {
    await page.evaluate(async ({ family, weight, text, SIZE }) => {
      // Make sure the exact face (weight, and the digits' unicode-range) is loaded before drawing. ONLY THE FIRST FAMILY IS
      // ASKED FOR: `--font-body` reads `Alegreya, "Alegreya Fallback"`, and `next/font` declares the fallback as
      // `src: local(Times New Roman)`, which a box without that font cannot load, so `fonts.load()` on the whole stack rejects
      // with a NetworkError that has nothing to do with the face being probed (the first run of this file died on it).
      const primary = family.split(",")[0].trim();
      const loaded = await document.fonts.load(`${weight} ${SIZE}px ${primary}`, text);
      if (!loaded.length) throw new Error(`no face for "${primary}" weight ${weight} covers "${text}"`);
      await document.fonts.ready;
    }, { family, weight, text, SIZE });
    await page.evaluate(({ family, weight, variant, text, SIZE }) => {
      document.getElementById("__np")?.remove();
      const d = document.createElement("div");
      d.id = "__np";
      d.style.cssText = `position:fixed;left:40px;top:40px;z-index:99999;background:#000;color:#fff;padding:40px 60px;
        font-family:${family};font-weight:${weight};font-size:${SIZE}px;line-height:1.3;white-space:nowrap;
        font-variant-numeric:${variant};font-feature-settings:normal;`;
      const s = document.createElement("span"); s.id = "__np_t"; s.textContent = text; d.appendChild(s);
      document.body.appendChild(d);
    }, { family, weight, variant, text, SIZE });
    const el = await page.$("#__np");
    const w = await page.evaluate(() => document.getElementById("__np_t").getBoundingClientRect().width);
    const buf = await el.screenshot({ type: "png" });
    return { ...(await ink(buf)), adv: w };
  };

  const ask = async (label, family, weight) => {
    const H = await stage(family, weight, "normal", "H");
    const one = {};
    const zero = {};
    for (const v of ["normal", "lining-nums", "oldstyle-nums", "tabular-nums", "proportional-nums", "lining-nums tabular-nums"]) {
      one[v] = await stage(family, weight, v, "1");
      zero[v] = await stage(family, weight, v, "0");
    }
    console.log(`\n  ${label}   (${SIZE}px, weight ${weight})`);
    note(`"H" ink height ${H.h}px  (cap height, the yardstick)`);
    for (const v of Object.keys(one)) {
      note(`${v.padEnd(26)} "1" ink ${String(one[v].w).padStart(3)}x${String(one[v].h).padStart(3)} adv ${one[v].adv.toFixed(1).padStart(6)}   "0" adv ${zero[v].adv.toFixed(1).padStart(6)} ink h ${zero[v].h}`);
    }
    const liningIsCap = one["lining-nums"].h >= H.h * 0.9 && one["lining-nums"].h >= one["oldstyle-nums"].h * 1.1;
    const defaultIsCap = one["normal"].h >= H.h * 0.9;
    const tabEqual = Math.abs(one["tabular-nums"].adv - zero["tabular-nums"].adv) < 0.6;
    const propDiffer = Math.abs(one["proportional-nums"].adv - zero["proportional-nums"].adv) >= 0.6;
    const liningMoves = one["lining-nums"].h !== one["oldstyle-nums"].h || one["lining-nums"].w !== one["oldstyle-nums"].w;
    return { H, one, zero, liningIsCap, defaultIsCap, tabEqual, propDiffer, liningMoves };
  };

  const A = await ask("ALEGREYA (the numeral face)", fam.body, 700);
  const C = await ask("CINZEL (control: the face the plan says has the wrong figures)", fam.display, 700);

  console.log("");
  const r = (a, b) => (a / b).toFixed(2);
  if (A.liningIsCap) pass(`A. Alegreya lining-nums: "1" reaches the caps (${A.one["lining-nums"].h}px = ${r(A.one["lining-nums"].h, A.H.h)} of "H" ${A.H.h}px) and is ${r(A.one["lining-nums"].h, A.one["oldstyle-nums"].h)}x the old-style "1" (${A.one["oldstyle-nums"].h}px)`);
  else fail(`A. Alegreya lining-nums: "1" is ${A.one["lining-nums"].h}px against cap height ${A.H.h}px and old-style ${A.one["oldstyle-nums"].h}px — lnum did not take. STOP, use the plan's fallback (Alegreya SC / enlarge the digit)`);
  if (A.tabEqual && A.propDiffer) pass(`B. Alegreya tabular-nums: "1" and "0" share an advance (${A.one["tabular-nums"].adv.toFixed(1)} / ${A.zero["tabular-nums"].adv.toFixed(1)}), proportional-nums does not (${A.one["proportional-nums"].adv.toFixed(1)} / ${A.zero["proportional-nums"].adv.toFixed(1)})`);
  else fail(`B. Alegreya tabular-nums: tab equal=${A.tabEqual}, proportional differs=${A.propDiffer} — tnum did not take`);
  if (A.liningMoves) pass(`   lining-nums and oldstyle-nums draw different figures — the switch is wired both ways`);
  else fail(`   lining-nums and oldstyle-nums draw the SAME "1" — the feature has no effect in this file`);
  note(`C. Alegreya's DEFAULT "1" is ${A.defaultIsCap ? "already lining" : "OLD-STYLE (x-height)"}: "1" ${A.one["normal"].h}px vs cap ${A.H.h}px. ${A.defaultIsCap ? "The class is belt and braces." : "So the class is what makes the figure a lining one; without it every code and timer is old-style."}`);
  const cinzelMoves = C.one["lining-nums"].h !== C.one["normal"].h || C.one["tabular-nums"].adv !== C.one["proportional-nums"].adv;
  if (!cinzelMoves) pass(`D. CONTROL: Cinzel ignores lining-nums/tabular-nums (its "1" is ${C.one["normal"].w}px wide x ${C.one["normal"].h}px, the bare bar the plan describes) — the probe can tell a face that has the feature from one that has not`);
  else note(`D. CONTROL: Cinzel does respond to a numeric variant ("1" ${C.one["normal"].h}px -> ${C.one["lining-nums"].h}px lining, adv ${C.one["tabular-nums"].adv.toFixed(1)} tab vs ${C.one["proportional-nums"].adv.toFixed(1)} prop) — so the plan's stated reason for moving numerals off Cinzel is not what this file shows; reported, not gated`);
  console.log(`\n${rasteriserNote()}`);
  console.log(failures ? `[numeralprobe] ${failures} FAILED` : "[numeralprobe] lining-nums and tabular-nums reach Alegreya's figures in the served font");

  await browser.close();
  server.kill("SIGTERM");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); try { server?.kill("SIGTERM"); } catch { /* gone */ } process.exit(2); });
