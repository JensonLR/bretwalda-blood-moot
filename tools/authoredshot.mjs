#!/usr/bin/env node
// ============================================================
// AUTHOREDSHOT — the authored man, drawn, beside the procedural one.
//
//   npm run build && npm run authored && node tools/authoredshot.mjs
//
// WHY: `ONE-CLIENT.md`'s P2 inventory says, of everything built so far,
// "NOT ONE AUTHORED MAN HAS BEEN DRAWN — every gate reads structure, not
// pixels. The visual verdict is unmade." This is the tool that makes it
// makeable. It photographs the SAME man twice on the SAME build, at the same
// tier, from the same lens, differing by one query flag:
//
//     /?quality=high              the procedural man, as he ships
//     /?quality=high&authored=1   the Blender mesh, swapped in
//
// Both go through `createWarriorRig` and `poseWarrior` — the authored one is
// the same rig with its body replaced and its pivots repointed at the export's
// own bones, so any difference in these two frames is the MESH and nothing
// else. Same pose, same light, same lens.
//
// IT ASSERTS THE SWAP HAPPENED. `window.__authored` is written by
// `armouryStage` with what the upgrade did or why it refused, so a pair of
// frames that came out identical because the asset 404'd cannot be filed as a
// pair of frames that came out identical because the mesh looks the same.
// That distinction is the whole reason this file has assertions in it and is
// not just a screenshot script.
// ============================================================
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".authored");
const PORT = 3971;
const CLASS = (process.argv.find((a) => a.startsWith("--class=")) || "--class=huscarl").split("=")[1];

/**
 * WHAT THE PICKER CALLS HIM, which is not always his class id.
 *
 * `src/app/page.tsx`: "RUNEKEEPER became WRECCA — a name a player reads is
 * allowed to change". The asset, the engine and the wire all still say
 * `runekeeper`, so a harness that clicks on the id waits three minutes for a
 * button that does not exist. Mapped here rather than matched loosely: a
 * substring match on a class grid is how you click the wrong man.
 */
const PICKER_LABEL = { runekeeper: "WRECCA" };
const LABEL = (PICKER_LABEL[CLASS] ?? CLASS).toUpperCase();

let failed = false;
const say = (s) => console.log(s);
const good = (s) => say(`  PASS  ${s}`);
const bad = (s) => { failed = true; say(`  FAIL  ${s}`); };

if (!existsSync(resolve(ROOT, ".next/BUILD_ID"))) {
  say("\n  NO PRODUCTION BUILD. Run `npm run build` first.");
  process.exit(1);
}
if (!existsSync(resolve(ROOT, `public/authored/warrior-${CLASS}.glb`))) {
  say(`\n  NO SERVED ASSET for ${CLASS}. Run \`npm run authored\` first.`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const srv = spawn("node", ["custom-server.mjs"], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
watchBoot(srv, "authoredshot");
for (let i = 0; i < 240; i++) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.ok) break; } catch { /* soon */ }
  await new Promise((r) => setTimeout(r, 500));
}

/** Walk a fresh page to the class picker's mannequin and photograph it. */
async function shoot(browser, query, file) {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  page.setDefaultTimeout(180000);
  const notes = [];
  page.on("console", (m) => { if (/authored/i.test(m.text())) notes.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/${query}`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Enter warrior name", { exact: false }).first().fill("Wulfnoth");
  await page.getByText("CREATE BATTLE", { exact: false }).first().click();
  await page.getByText("BLOOD MOOT", { exact: false }).first().click();
  await page.getByText("CREATE ROOM", { exact: false }).first().click();
  await page.getByText(LABEL, { exact: false }).first().click();
  const stage = page.locator("canvas").first();
  await stage.waitFor({ state: "visible", timeout: 120000 });
  // A software rasteriser drawing a 400 px man at `high`, plus 1.6 MB to fetch
  // and parse on the authored arm. Generous on purpose: a frame taken before
  // the swap lands is a frame that proves nothing and looks like proof.
  await page.waitForTimeout(26000);
  const shot = await stage.screenshot({ path: resolve(OUT, file) });
  const state = await page.evaluate(() => window.__authored ?? null);
  await page.close();
  return { shot, state, notes };
}

const browser = await chromium.launch({ ...launchOptions() });
say(`\n[authoredshot] the ${CLASS}, twice, one build, one flag apart\n`);
try {
  const plain = await shoot(browser, "?quality=high", `${CLASS}-procedural.png`);
  good(`the procedural man is drawn — ${plain.shot.length} bytes`);

  const auth = await shoot(browser, "?quality=high&authored=1", `${CLASS}-authored.png`);
  good(`the authored arm drew a frame — ${auth.shot.length} bytes`);

  // THE ASSERTION THAT MAKES THE PAIR MEAN ANYTHING.
  const st = auth.state;
  if (!st) bad("the swap never ran — window.__authored is unset. The frames are not a pair.");
  else if (st.ok === false) bad(`the swap REFUSED: ${st.why} — the authored frame is the procedural man`);
  else good(`the swap landed — ${st.joints} joints repointed, ${st.dressed} meshes dressed, ${st.hidden} hidden`);

  if (plain.shot.equals(auth.shot)) {
    bad("the two frames are byte-identical — nothing was swapped, whatever __authored says");
  } else {
    good(`the pixels moved: ${plain.shot.length} vs ${auth.shot.length} bytes`);
  }
  for (const n of auth.notes) say(`  note: ${n}`);

  say(`\n  Written to .authored/ — LOOK AT THEM. This tool cannot judge a picture;`);
  say(`  docs/VISUAL-BAR.md is 8+ and that verdict is the owner's.`);
} finally {
  await browser.close();
  srv.kill();
}
say(failed ? "\n[authoredshot] FAIL" : "\n[authoredshot] PASS");
process.exit(failed ? 1 : 0);
