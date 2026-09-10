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
import { requireFreshBuild } from "./lib/freshbuild.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".authored");
const PORT = 3971;
const CLASS = (process.argv.find((a) => a.startsWith("--class=")) || "--class=huscarl").split("=")[1];
/** `--arena` photographs a real eight-man fight instead of the shop's mannequin. */
const ARENA = process.argv.includes("--arena");

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

// A MISSING build and a build from before your edit are the same problem.
requireFreshBuild(ROOT, "authoredshot");
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
/**
 * A REAL FIGHT, not the shop's mannequin.
 *
 * The preview swaps ONE man. The arena is where the thing that only the arena
 * can be wrong about lives: eight men against four files, each needing his own
 * skeleton, because the swap re-parents what it is handed. A picture of one
 * man proves none of that.
 */
async function shootArena(browser, query, file) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(240000);
  const notes = [];
  page.on("console", (m) => { if (/authored/i.test(m.text())) notes.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/${query}`, { waitUntil: "domcontentloaded" });
  await page.getByText("Training", { exact: false }).first().click();
  await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click();
  const more = page.getByLabel("More AI warriors");
  for (let i = 0; i < 10 && await more.isEnabled().catch(() => false); i++) await more.click();
  await page.getByText("DRAW STEEL", { exact: false }).first().click();
  // WAIT FOR THE WORK, NOT FOR A CLOCK.
  //
  // This was a flat 48 s — generous enough for a software rasteriser to fetch
  // four files and clone eight skeletons, and far too long for the fight: the
  // local man stands still while eight AI kill him, so the shutter caught a
  // FALLEN overlay over a red screen with "Spectating the survivors…" across
  // it. Every claim in this file passed on that frame, because none of them
  // look at the picture. Now the arm that has work to do waits for the work —
  // each man logs `upgraded` — and the arm that has none takes the shortest
  // wait that gets eight men drawn.
  // HE BACKS AWAY WHILE THE FILES LAND. A man who stands still in a training
  // pit with seven AI in it is dead inside a minute, and the authored arm has
  // to wait out four fetches and eight skeleton clones — so the shutter kept
  // catching a red FALLEN wash instead of a fight. Holding `S` is what a player
  // would do and it costs the harness nothing.
  await page.keyboard.down("KeyS");
  // AND HIS GUARD UP. Backing away alone was not enough — bots follow — and a
  // blocked blow is a fraction of an open one, which between them buys the
  // ninety seconds the authored arm needs to fetch four files and clone eight
  // skeletons without the shutter catching a corpse's red wash.
  await page.mouse.down({ button: "right" }).catch(() => { });
  const wanted = /authored=1/.test(query);
  const deadline = Date.now() + 90000;
  if (wanted) {
    while (Date.now() < deadline
      && notes.filter((n) => /: upgraded/.test(n)).length < 8) await page.waitForTimeout(500);
    notes.push(`[authored] ${notes.filter((n) => /: upgraded/.test(n)).length} men upgraded`);
  } else {
    await page.waitForTimeout(14000);
  }
  await page.keyboard.up("KeyS");
  await page.mouse.up({ button: "right" }).catch(() => { });
  // The pointer-lock prompt stands over the arena until the canvas is clicked.
  await page.locator("canvas").first().click({ position: { x: 640, y: 620 } }).catch(() => { });
  await page.waitForTimeout(600);
  // AND THE LENS IS POINTED AT SOMEBODY. Mouse-look needs pointer lock, which
  // the headless SHELL binary does not have (see docs/HANDOVER.md), so the
  // camera sat wherever the spawn left it and the first honest frame this tool
  // ever produced was a photograph of the BONFIRE with all eight men off to
  // one side. `R` is the game's own soft lock-on and it turns the rig's yaw
  // onto the nearest enemy without touching the mouse.
  await page.keyboard.press("KeyR");
  await page.waitForTimeout(2000);
  // THE TUITION CARD STANDS OVER THE ARENA, AND THIS TOOL PHOTOGRAPHED IT.
  //
  // A fresh profile gets "THE FIRST MOOT — 1 OF 4 · THE FIELD" over a dimmed
  // canvas, and the run that found this filed 123 KB of dark modal under
  // `arena-authored.png` while asserting "no man refused the upgrade" and "the
  // pixels moved". Both were true. Neither was about a picture of the arena.
  // This repository has the same story under `weightshot`, which photographed a
  // menu, and the cure is the same one: dismiss what stands in the way, and
  // then CLAIM that nothing is standing in the way at the shutter.
  for (let i = 0; i < 6; i++) {
    const card = page.getByText("I AM READY", { exact: false }).first();
    if (!await card.isVisible().catch(() => false)) break;
    await card.click().catch(() => { });
    await page.waitForTimeout(1200);
  }
  const tuition = await page.getByText("I AM READY", { exact: false }).first()
    .isVisible().catch(() => false);
  // WHETHER HE IS ON HIS FEET IS A NOTE, NOT A GATE. A corpse's screen is a
  // red wash with "Spectating the survivors…" over it and is worth knowing
  // about, but training respawns him and the locator reads true on a card that
  // has already faded — failing the whole tool on it would make the run a coin
  // toss. The TUITION card is the gate, because that one genuinely stood over
  // the canvas for the whole 48 s wait and got filed as evidence.
  const fallen = await page.getByText("FALLEN", { exact: true }).first()
    .isVisible().catch(() => false);
  notes.push(`[authored] at the shutter: tuition=${tuition} fallenOverlay=${fallen}`);
  const clear = !tuition;
  const shot = await page.screenshot({ path: resolve(OUT, file) });
  const seen = await page.evaluate(() => {
    const men = document.querySelectorAll("[data-nameplate], .nameplate");
    const w = window;
    return { plates: men.length, heads: w.__authoredHeads ?? null };
  }).catch(() => ({ plates: -1, heads: null }));
  seen.clear = clear;
  await page.close();
  return { shot, seen, notes };
}

async function shoot(browser, query, file) {
  // 1280x900, AND THE ARMOURY RATHER THAN THE LOBBY CARD.
  //
  // This tool exists so the owner can give a visual verdict — its own last line
  // says so — and at 900x900 the page laid out in one column, the lobby's
  // preview canvas came out a 768x256 letterbox, and both arms were filed as a
  // man WITH NO HEAD. A capture that cannot show the thing it is a capture of
  // is not evidence, whatever it asserts underneath.
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(180000);
  const notes = [];
  page.on("console", (m) => { if (/authored/i.test(m.text())) notes.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/${query}`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Enter warrior name", { exact: false }).first().fill("Wulfnoth");
  await page.getByText("CREATE BATTLE", { exact: false }).first().click();
  await page.getByText("BLOOD MOOT", { exact: false }).first().click();
  await page.getByText("CREATE ROOM", { exact: false }).first().click();
  await page.getByText(LABEL, { exact: false }).first().click();
  // THE BIGGEST CANVAS ON THE PAGE, not the first one in the DOM — and the
  // size it comes back is reported, because on this flow the mannequin is the
  // LOBBY's preview card and it is small. Clicking through to the armoury was
  // tried and did not open one; that is a note for whoever wants a bigger
  // portrait, not a silent `.catch(() => {})` pretending it worked. The arena
  // arm (`--arena`) is the full-size evidence and is what a verdict on the
  // whole upgrade should be given on.
  const stage = await (async () => {
    const all = page.locator("canvas");
    const n = await all.count();
    let best = all.first(), area = 0;
    for (let i = 0; i < n; i++) {
      const box = await all.nth(i).boundingBox().catch(() => null);
      if (box && box.width * box.height > area) { area = box.width * box.height; best = all.nth(i); }
    }
    notes.push(`[authored] mannequin canvas ${Math.round(area)} px^2 of ${n} on the page`);
    return best;
  })();
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
  if (ARENA) {
    const a = await shootArena(browser, "?quality=high", "arena-procedural.png");
    good(`the procedural arena is drawn — ${a.shot.length} bytes`);
    const b = await shootArena(browser, "?quality=high&authored=1", "arena-authored.png");
    good(`the authored arena drew a frame — ${b.shot.length} bytes`);
    // AND BOTH ARE PICTURES OF THE ARENA. See `shootArena`: the tuition card
    // stands over the canvas on a fresh profile, and a run that photographs it
    // can still pass every claim below, because none of them look at the
    // picture. This one does.
    ((a.seen.clear && b.seen.clear) ? good : bad)(
      (a.seen.clear && b.seen.clear)
        ? "both frames are of the arena, not of the tuition card"
        : `the tuition card was still over the canvas at the shutter — `
          + `procedural clear=${a.seen.clear}, authored clear=${b.seen.clear}`);
    // AND EVERY ONE OF THEM STILL HAS A HEAD. See the census in GameCanvas.
    if (b.seen.heads) {
      const heads = b.seen.heads;
      const bald = heads.filter((h) => h.drawnAbove < 3);
      for (const h of heads) {
        say(`  ${h.cls} ${h.id.slice(0, 6)}: ${h.drawnAbove} meshes above the shoulders, `
          + `props ${h.props.join("+") || "none"}${h.missing.length ? ` (missing ${h.missing.join("+")})` : ""}`);
      }
      (bald.length === 0 ? good : bad)(bald.length === 0
        ? `all ${heads.length} upgraded men kept a head`
        : `${bald.length} of ${heads.length} men lost their head to the upgrade: `
          + bald.map((h) => `${h.cls} drew ${h.drawnAbove}`).join(", "));
    }
    const refusals = b.notes.filter((n) => /keeping the procedural man/.test(n));
    (refusals.length === 0 ? good : bad)(
      refusals.length === 0 ? "no man refused the upgrade" : `${refusals.length} man/men refused: ${refusals[0]}`);
    (a.shot.equals(b.shot) ? bad : good)(
      a.shot.equals(b.shot) ? "the two arenas are byte-identical — nothing swapped"
        : `the pixels moved: ${a.shot.length} vs ${b.shot.length} bytes`);
    say(`\n  .authored/arena-*.png — LOOK AT THEM.`);
    await browser.close(); srv.kill();
    say(failed ? "\n[authoredshot] FAIL" : "\n[authoredshot] PASS");
    process.exit(failed ? 1 : 0);
  }

  const plain = await shoot(browser, "?quality=high", `${CLASS}-procedural.png`);
  good(`the procedural man is drawn — ${plain.shot.length} bytes`);

  const auth = await shoot(browser, "?quality=high&authored=1", `${CLASS}-authored.png`);
  good(`the authored arm drew a frame — ${auth.shot.length} bytes`);

  // THE ASSERTION THAT MAKES THE PAIR MEAN ANYTHING.
  const st = auth.state;
  if (!st) bad("the swap never ran — window.__authored is unset. The frames are not a pair.");
  else if (st.ok === false) bad(`the swap REFUSED: ${st.why} — the authored frame is the procedural man`);
  else good(`the swap landed — ${st.joints} joints repointed, ${st.dressed} meshes dressed, ${st.hidden} hidden`);

  // HAS HE STILL GOT A HEAD. The owner, of an authored arena capture: "image
  // 1's head is missing from a full health player". Every claim above passed on
  // that frame — the swap landed, ten joints repointed, forty-six meshes
  // dressed — because not one of them asks whether the man has a face. This
  // reads what `armouryStage` measured off the built body: every mesh whose
  // geometry reaches above the head bone, and whether it is drawn.
  if (st && st.head) {
    const v = st.head.visible ?? [], h = st.head.hidden ?? [];
    say(`  above the shoulders: ${v.length} drawn [${v.join(" ")}], ${h.length} hidden [${h.join(" ")}]`);
    say(`  head pivot "${st.head.boneName}" isBone=${st.head.isBone} at ${JSON.stringify(st.head.bone)} `
      + `scale=${JSON.stringify(st.head.scale)} det=${st.head.det}; skull bind box y/x ${JSON.stringify(st.head.skull)}`);
    (v.length >= 2 ? good : bad)(v.length >= 2
      ? `the man has a head — ${v.length} meshes drawn above the head bone`
      : `THE MAN HAS NO HEAD — only ${v.length} mesh(es) drawn above the head bone, ${h.length} hidden`);
  }

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
