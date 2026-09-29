#!/usr/bin/env node
// ============================================================
// STAGEHEAD — does the armoury's mannequin have a head, in the pixels, in every lens?
//
//   /tmp/claude-0/cap node tools/stagehead.mjs                        4 classes x 4 lenses x phone+desktop
//   /tmp/claude-0/cap node tools/stagehead.mjs --desktop-only
//   /tmp/claude-0/cap node tools/stagehead.mjs --classes warden --lenses face,fight
//   /tmp/claude-0/cap node tools/stagehead.mjs --report               print every number, never fail (calibration)
//   /tmp/claude-0/cap node tools/stagehead.mjs --no-net               a tree that predates the head net: judge the pixels and the legacy numbers only
//   /tmp/claude-0/cap node tools/stagehead.mjs --allow-refused        the head net's fallback is EXPECTED (the end-to-end proof that the net fires)
//   /tmp/claude-0/cap node tools/stagehead.mjs --out art/ui           where the frames go (default art/ui, as armourycard)
//
// THE OWNER'S WORDS (PROCESS R6), reported four times on four screens:
//   the armoury / oath / lobby / training mannequin is "a torso ending in a neck stump
//   with hair strands floating over the collar".
// Every number this repository had about that man said he was fine. The swap had
// landed, ten joints were repointed, forty-six meshes dressed, `head.det` was +1 and
// the skull was `visible`. None of it looked at the picture, and the picture had no
// head in it. `docs/PROCESS.md` failure mode 1, instance eleven.
//
// WHAT IT ASKS, for every class x every lens the armoury offers (portrait, shoulders,
// full kit, fight range), after the stage has been made to draw a frame and the canvas
// has been read back INSIDE the task that drew it (`window.__armouryStage`):
//
//   1. PIXELS   the window the crown belongs in, projected from the PROCEDURAL crown,
//               holds skin-hue pixels (H 15-35 deg, S .2-.6, V > .25) — as a fraction
//               of the window per lens, and an absolute floor for the fight lens where
//               the whole head is a dozen pixels across.
//   2. NUMBERS  `window.__authored.head`: det >= 1e-3, skull found, something visible,
//               no scale component under 0.5 — the brief's own list, which the headless
//               man PASSED, and which is why this is not enough alone.
//   3. THE NET  the authored man was judged by the head net (render/authoredHead.ts) and
//               passed; a REFUSED man is a fail here, because the frame then shows the
//               procedural man and would pass 1 and 2 on a build whose authored path is
//               broken. `--allow-refused` turns that one check off for the run that
//               proves the net fires.
//   4. FRAMING  (full kit) the crown sits ~8% from the top and the boots ~90%.
//
// R2, SHOWN RED FIRST. Run against the tree before the AI1 fix (160485a + only the
// probe): the crown window is empty at portrait and shoulders. See docs/GATES.md.
// R3: the pixel test alone can be fooled by a man that is not the authored one — the
// head net's fallback passes 1 and 2 with the defect present — so 3 is asked too, and
// each is shown to fail with the other two green.
// ============================================================
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { launchOptions } from "./lib/browser.mjs";
import * as A from "./lib/armoury.mjs";
import * as W from "./lib/crownwindow.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);
const OUT = resolve(ROOT, flag("out", "art/ui"));
const PORT = parseInt(flag("port", String(3800 + (process.pid % 150))), 10);
const CLASSES = flag("classes", A.CLASSES.join(",")).split(",");
const LENSES = flag("lenses", A.LENSES.join(",")).split(",");
const REPORT = has("report"), NO_NET = has("no-net"), ALLOW_REFUSED = has("allow-refused");
const VPS = has("desktop-only") ? [A.VIEWPORTS.desktop] : has("phone-only") ? [A.VIEWPORTS.phone] : [A.VIEWPORTS.phone, A.VIEWPORTS.desktop];
const NAME = flag("name", "stagehead");
mkdirSync(OUT, { recursive: true });

/** Full-kit framing (UI-PLAN U-M M3): where the crown and the boots land, fractions of the canvas from the top. */
const FRAMING = { figure: { crown: [0.03, 0.14], boots: [0.84, 0.96] } };

let bad = 0;
const rows = [];

async function main() {
  const { base, stop } = await A.serveProduction(ROOT, "stagehead", PORT);
  const browser = await chromium.launch({ ...launchOptions() });
  try {
    for (const vp of VPS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.touch, hasTouch: vp.touch,
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => {
        if (m.type() === "error") { errors.push(m.text().slice(0, 500)); console.log(`[stagehead] ${vp.tag} console.error: ${m.text().slice(0, 500)}`); }
      });
      page.on("pageerror", (e) => { errors.push(String(e).slice(0, 500)); console.log(`[stagehead] ${vp.tag} PAGE ERROR: ${String(e).slice(0, 500)}`); });

      await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      await page.getByRole("button", { name: /Armoury/ }).first().click();
      await A.settleShop(page, "stagehead");

      for (const cls of CLASSES) {
        const picked = await A.pickClass(page, cls);
        // The props (helm, hair, beard) are what he WEARS; they land after the swap and a frame
        // taken before them is a picture of the baked helm. Waited for, or said not to have come.
        let props = "n/a";
        if (picked.a?.ok && !picked.a.refused) {
          props = await page.waitForFunction(() => !!window.__authoredProps && window.__authoredProps !== window.__armouryPropsMark, null, { timeout: 45000, polling: 500 })
            .then(() => "landed", () => "DID NOT LAND in 45 s");
        }
        await page.evaluate(() => { window.__armouryPropsMark = window.__authoredProps ?? null; });
        console.log(`[stagehead] ${vp.tag} ${cls}: authored ${picked.timedOut ? "TIMED OUT" : picked.a?.refused ? "REFUSED" : picked.a?.ok ? "ok" : "not ok"}${picked.a?.why ? ` (${picked.a.why})` : ""} after ${(picked.waitedMs / 1000).toFixed(1)} s, props ${props}`);
        await A.framesMore(page, 6);

        for (const lens of LENSES) {
          await page.getByRole("button", { name: new RegExp(A.LENS_BUTTON[lens]) }).first().click();
          await A.framesMore(page, 8);
          await A.toTop(page);
          await A.framesMore(page, 3);
          await W.untilSettled(page, { expectAuthored: false, budgetMs: 30000 });
          const r = await W.readHead(page);
          const problems = W.judge(r, W.BARS, { requireAuthored: !ALLOW_REFUSED, allowRefused: ALLOW_REFUSED, requireNet: !NO_NET && !ALLOW_REFUSED });
          if (r?.win && FRAMING[lens]) {
            const f = FRAMING[lens];
            if (r.win.crownAt < f.crown[0] || r.win.crownAt > f.crown[1]) problems.push(`the crown is ${(r.win.crownAt * 100).toFixed(1)}% from the top, wanted ${f.crown.map((v) => v * 100).join("-")}%`);
            if (r.win.bootsAt < f.boots[0] || r.win.bootsAt > f.boots[1]) problems.push(`the boots are ${(r.win.bootsAt * 100).toFixed(1)}% from the top, wanted ${f.boots.map((v) => v * 100).join("-")}%`);
          }
          const tag = `${NAME}-${cls}-${lens}-${vp.tag}`;
          await page.screenshot({ path: resolve(OUT, `${tag}.png`) });
          await W.saveWindow(r, resolve(OUT, `${tag}-crown.png`));
          console.log(`[stagehead] ${vp.tag} ${cls}/${lens}: ${W.describe(r)}`);
          const failed = problems.length > 0;
          console.log(`[stagehead]   ${failed ? (REPORT ? "would FAIL" : "FAIL") : "PASS"}  ${tag}${failed ? " — " + problems.join("; ") : ""}`);
          if (failed && !REPORT) bad++;
          rows.push({ vp: vp.tag, cls, lens, skinFrac: r?.m?.skinFrac ?? null, skin: r?.m?.skin ?? null, n: r?.m?.n ?? null, failed });
        }
      }
      console.log(`[stagehead] ${vp.tag}: ${errors.length} console/page error(s)`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    stop();
  }

  // The calibration table: the smallest skin fraction per lens across every class and viewport.
  console.log("");
  for (const lens of LENSES) {
    const rs = rows.filter((x) => x.lens === lens && x.skinFrac !== null);
    if (!rs.length) continue;
    const lo = rs.reduce((a, b) => (b.skinFrac < a.skinFrac ? b : a));
    const hi = rs.reduce((a, b) => (b.skinFrac > a.skinFrac ? b : a));
    console.log(`[stagehead] ${lens.padEnd(6)} skin fraction ${(lo.skinFrac * 100).toFixed(1)}% (${lo.cls}/${lo.vp}, ${lo.skin} px of ${lo.n}) .. ${(hi.skinFrac * 100).toFixed(1)}% (${hi.cls}/${hi.vp})   bar ${(W.BARS[lens].skinFrac * 100).toFixed(1)}% (floor ${W.MIN_SKIN_PX} px)`);
  }
  const total = rows.length;
  const failed = rows.filter((x) => x.failed).length;
  console.log(`[stagehead] ${REPORT ? "REPORT" : bad ? "FAIL" : "PASS"}: ${total - failed} of ${total} frames have a head where the head belongs`
    + `${NO_NET ? "  (--no-net: the head net's verdict was NOT asked)" : ""}${ALLOW_REFUSED ? "  (--allow-refused: a refused man was expected)" : ""}`);
  process.exit(REPORT || !bad ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
