// ============================================================
// ARMOURY — drive the shop's mannequin panel, once, for every tool that photographs it.
//
// `armourycard.mjs` grew these (the server, the settle, the class and lens buttons)
// and `stagehead.mjs` needs the same four things. A second copy is the mirrored
// definition of PROCESS Part 1 §3 — two tools with two ideas of "the shop has
// settled" — so they live here and both import them.
// ============================================================
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import { watchBoot } from "./browser.mjs";
import { requireFreshBuild } from "./freshbuild.mjs";

/** The class button's accessible name on the picker (the runekeeper is WRECCA, the warden WEARD). */
export const CLASS_BUTTON = { huscarl: "HUSCARL", warden: "WEARD", runekeeper: "WRECCA", berserker: "BERSERKER" };
/** The lens strip, in the order the stage's own `LENS_ORDER` has them. */
export const LENS_BUTTON = { face: "PORTRAIT", bust: "SHOULDERS", figure: "FULL KIT", fight: "FIGHT RANGE" };
export const LENSES = Object.keys(LENS_BUTTON);
export const CLASSES = Object.keys(CLASS_BUTTON);

export const VIEWPORTS = {
  phone: { tag: "phone", width: 390, height: 844, touch: true },
  desktop: { tag: "desktop", width: 1440, height: 900, touch: false },
};

function waitForServer(url, timeoutMs = 180000) {
  const started = Date.now();
  return new Promise((ok, fail) => {
    const poll = async () => {
      try { const r = await fetch(url); if (r.ok || r.status === 404) return ok(); } catch { /* wait */ }
      if (Date.now() - started > timeoutMs) return fail(new Error(`server never came up at ${url}`));
      setTimeout(poll, 700);
    };
    poll();
  });
}

/**
 * Serve THIS worktree's production build on a free port, refusing a stale one
 * (`requireFreshBuild`) and refusing a port somebody already answers on.
 * Returns `{ base, stop }`.
 */
export async function serveProduction(root, tag, port) {
  const base = `http://localhost:${port}`;
  try {
    await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) });
    console.error(`[${tag}] something is already serving ${base} — pass --port`);
    process.exit(2);
  } catch { /* free, good */ }
  requireFreshBuild(root, tag);
  if (!existsSync(resolve(root, ".next/BUILD_ID"))) {
    console.error(`[${tag}] no production build found — run \`npm run build\` first`);
    process.exit(2);
  }
  const server = spawn("node", ["custom-server.mjs"], {
    cwd: root, env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  watchBoot(server, tag);
  server.stdout.on("data", () => {});
  server.stderr.on("data", (d) => process.stderr.write(`[srv] ${d}`));
  await waitForServer(`${base}/api/health`);
  console.log(`[${tag}] serving the production build on ${port}`);
  return { base, stop: () => { if (!server.killed) server.kill("SIGTERM"); } };
}

/** Frames the stage has drawn so far. */
export const framesOf = (page) => page.evaluate(() => window.__armouryStats?.frames ?? 0);

/** Wait for `n` more frames from the stage. */
export async function framesMore(page, n, budgetMs = 30000) {
  const f0 = await framesOf(page);
  const t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    if ((await framesOf(page)) - f0 >= n) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/**
 * Waits until every visible card carries a picture and the mannequin has drawn
 * a few frames since, or gives up and says so. Returns what it saw.
 */
export async function settleShop(page, tag = "card", budgetMs = 150000) {
  const started = Date.now();
  let last = null;
  for (;;) {
    const now = await page.evaluate(() => {
      const tiles = document.querySelectorAll("button .aspect-square").length;
      const imgs = document.querySelectorAll("button img").length;
      const st = window.__armouryStats ?? null;
      return { tiles, imgs, frames: st ? st.frames : 0, mounted: !!st };
    });
    last = now;
    if (now.mounted && now.tiles > 0 && now.imgs >= now.tiles) break;
    if (Date.now() - started > budgetMs) {
      console.log(`[${tag}] settle GAVE UP after ${((Date.now() - started) / 1000).toFixed(0)} s: ${now.imgs}/${now.tiles} cards drawn, mounted=${now.mounted}`);
      break;
    }
    await page.waitForTimeout(500);
  }
  // A beat past the last picture, so the mannequin is drawn over the corner
  // the last thumbnail was taken in.
  await page.waitForTimeout(1200);
  return last;
}

/** Back to the top of the shop, where the mannequin is (a click scrolls its button into view and the man out of it). */
export const toTop = (page) => page.evaluate(() => { const sh = document.querySelector(".shell"); if (sh) sh.scrollTop = 0; window.scrollTo(0, 0); });

/**
 * Pick a class and wait until THAT class's authored man has been judged: landed
 * and passed, or refused, or refused to swap. Resolves with a summary of
 * `window.__authored`. Waiting on the class matters: the report is REPLACED by
 * every swap, and the last man's report is not this man's — so "new" is "not the
 * object that was there when I clicked".
 */
export async function pickClass(page, cls, budgetMs = 90000) {
  const t0 = Date.now();
  await page.evaluate(() => { window.__armouryMark = window.__authored ?? null; });
  const already = await page.evaluate((c) => window.__authored?.cls === c, cls);
  if (!already) await page.getByRole("button", { name: new RegExp(`^${CLASS_BUTTON[cls]}$`) }).first().click();
  for (;;) {
    const st = await page.evaluate((c) => {
      const a = window.__authored;
      return {
        fresh: !!a && a.cls === c && a !== window.__armouryMark,
        a: a ? { cls: a.cls, ok: a.ok !== false, refused: !!a.refused, why: a.why ?? null } : null,
        props: !!window.__authoredProps,
      };
    }, cls);
    if ((already && st.a?.cls === cls) || st.fresh) return { ...st, already, waitedMs: Date.now() - t0 };
    if (Date.now() - t0 > budgetMs) return { ...st, already, waitedMs: Date.now() - t0, timedOut: true };
    await page.waitForTimeout(400);
  }
}
