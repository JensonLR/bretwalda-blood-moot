// ============================================================
// BROWSER — one place that decides which rasteriser the capture suites use.
//
// WHY THIS EXISTS. Every browser tool in this drawer hard-coded the same six
// launch flags, and the middle two of them — `--use-angle=swiftshader
// --enable-unsafe-swiftshader` — pin the render to a SOFTWARE rasteriser. That
// was not a preference: the container these suites were written on has no GPU,
// `fpstest`'s ablation refuses to rank on it, and `docs/HANDOVER.md` records
// cosmetictest costing about 22 minutes a run there.
//
// On a machine that HAS a GPU that choice is pure cost, and it is a large one.
// Measured on an Apple M5, the same `/shot` capture — Danelaw huscarl,
// `armor_steel`, fightcard, settle 16 — through both:
//
//     SwiftShader   60.7 s      ANGLE (Google, Vulkan 1.3.0, SwiftShader)
//     Metal         12.0 s      ANGLE (Apple, ANGLE Metal Renderer: Apple M5)
//
// FIVE TIMES, AND THE PIXELS AGREE. That second half is the part that decides
// whether this is allowed at all, because every reading in `docs/OPEN-DEFECTS.md`
// and `docs/FACTIONS.md` was taken through SwiftShader and a rasteriser swap
// that moved colour would invalidate all of them. The Danelaw's shield board —
// the most saturated dark surface in the game, and the one whose hue four open
// defects are about, so the worst case on purpose — read on both:
//
//                        top 2% by chroma          modal bucket
//     SwiftShader     rgb(169,5,62)  C* 62.4  hue 15.0     #780830  L* 24.9
//     Metal           rgb(169,5,62)  C* 62.4  hue 15.2     #780830  L* 24.9
//
// Identical to the byte on the mean, 0.2 degrees apart on the hue, and the same
// modal bucket. The residual is the fire's phase, which the virtual clock
// already owns.
//
// AND THE CLAIM IS ABOUT MEANS, NOT ABOUT THRESHOLD COUNTS. `factionread` §6
// counts pixels OVER a bar, and the shadow-proxy entry in `docs/OPEN-DEFECTS.md`
// already paid for this lesson once: "rose share is a THRESHOLD metric ... where
// a fraction of a point of changed micro-shadowing flips whole pixel
// populations in or out". A rasteriser difference far too small to move a mean
// can still move a count of pixels sitting on a bar. So: a MEAN colour is
// comparable across the two, and a THRESHOLD COUNT is only comparable against
// another run on the same rasteriser. Which is the other reason the default
// stays software — the ledgers are full of threshold counts.
//
// THE DEFAULT IS STILL SWIFTSHADER, and deliberately: a gate must produce the
// same verdict wherever it is run, a GPU driver is not a controlled variable
// across machines, and CI has no GPU. The GPU is opt-in, per run, by env:
//
//     BRETWALDA_GPU=1 npm run factionread
//
// A tool that takes this door must SAY SO on its own verdict line — see
// `rasteriserNote()`. A reading that does not name its rasteriser is a reading
// that cannot be compared with the ledgers.
// ============================================================
import { chromium } from "playwright";
import { existsSync } from "fs";

/** The container's preinstalled browser, when there is one. */
const PREINSTALLED = "/opt/pw-browsers/chromium";

/** Whether this run was asked for the GPU. */
export const useGpu = /^(1|true|yes|on)$/i.test(process.env.BRETWALDA_GPU ?? "");

/**
 * The flags, in one place.
 *
 * The GPU arm asks for the full browser rather than the headless shell, because
 * the shell ships without a GPU process and silently falls back to software —
 * which would be a lie told at five times the honest speed.
 */
export function launchOptions(extraArgs = []) {
  const shared = ["--disable-gpu-sandbox", "--no-sandbox", "--ignore-gpu-blocklist"];
  if (useGpu) {
    return {
      channel: "chromium",
      args: ["--use-gl=angle", "--use-angle=default", "--enable-gpu", ...shared, ...extraArgs],
    };
  }
  return {
    ...(existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
      ...shared, ...extraArgs],
  };
}

/** Launch, with the flags this run asked for. */
export const launchBrowser = (extraArgs = []) => chromium.launch(launchOptions(extraArgs));

/**
 * AND THERE IS A SECOND REASON, WHICH IS NOT SPEED AND COST A RUN TO FIND.
 *
 * The software arm prefers the container's `/opt/pw-browsers/chromium`, which is
 * a FULL browser. A dev machine that runs `npx playwright install chromium`
 * gets the headless SHELL instead — and the shell has no real pointer-lock
 * implementation. `tools/playtest.mjs` has three claims about the mouse turning
 * the camera; on the shell all three go red with
 *
 *     WrongDocumentError: The root document of this element is not valid for
 *     pointer lock
 *
 * and the suite reads 35/38 against a 38/38 baseline. Nothing is wrong with the
 * game. Measured on this Mac, same tree, same commit: shell 35/38, full browser
 * 38/38. The GPU arm asks for `channel: "chromium"`, so it is also the arm that
 * has pointer lock — which is why `BRETWALDA_GPU=1` is the right flag for
 * playtest on a workstation even though the suite is not remotely GPU-bound.
 *
 * If a browser suite goes red on claims about INPUT rather than about pixels,
 * check which binary you are on before you check the diff.
 */

/**
 * What a tool must print beside its verdict, so a reading can never be compared
 * against a ledger taken on the other rasteriser without somebody noticing.
 */
export const rasteriserNote = () =>
  useGpu
    ? "RASTERISER: the GPU (BRETWALDA_GPU=1). Colour matches SwiftShader to the byte on the worst surface in the game — see tools/lib/browser.mjs — but timing numbers from this run are NOT comparable with any taken in software."
    : "RASTERISER: SwiftShader (software), which is what every reading in the ledgers was taken through.";

/**
 * Ask the page what actually rasterised it. A GPU run that quietly fell back to
 * software is the failure this exists to catch — it is the same trap as a
 * capture harness demoting its own quality tier, which cosmetictest already
 * had to be pinned against.
 */
export async function confirmRasteriser(page) {
  const renderer = await page.evaluate(() => {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "unknown";
  });
  const software = /swiftshader|llvmpipe|software/i.test(renderer);
  return { renderer, software, asked: useGpu ? "gpu" : "swiftshader", mismatch: useGpu && software };
}
