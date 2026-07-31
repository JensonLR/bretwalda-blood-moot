#!/usr/bin/env node
// ============================================================
// SHOOT — headless capture of the game's render output.
//
//   npm run shots                       # all presets, 1600x900
//   npm run shots -- duel closeup       # only these presets
//   npm run shots -- helmcards          # a contact sheet (see SHEETS)
//   npm run shots -- --hud              # keep the HUD visible
//   npm run shots -- --out art/shots/v2 # write elsewhere
//   npm run shots -- --w 2560 --h 1440  # capture resolution
//   npm run shots -- --dev              # ignore any production build
//
// Boots the app itself (production build if present, else dev),
// drives /shot with Playwright, writes PNGs, and fails loudly on
// any WebGL/console error so a broken scene can't pass review.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { mkdirSync, existsSync, writeFileSync, statSync, readdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// portrait/stance/lineup use an aimed camera; the rest follow the warrior.
const ALL_PRESETS = ["duel", "arena", "closeup", "brawl", "laststand", "portrait", "stance", "lineup"];
// Deaths. Off the default run: they are a review of one feature rather than of
// the game's look, and each one costs a preset's worth of frames on a box with
// no GPU. Ask for them by name — `npm run shots -- gorehead --out art/shots/gore`.
// Helmets are the same: a review of the shop's ladder rather than of the game's
// look, asked for by name — `npm run shots -- helmcards helmturn`.
const EXTRA_PRESETS = ["gorehead", "gorearm", "goresplit", "gorehelm", "helms", "helms2", "suttonhoo"];

// ============================================================
// CONTACT SHEETS
//
// A sheet is N captures of one parametric preset, laid out side by side into a
// single PNG. It exists because the thing it replaced — a row of five men
// photographed in one frame, then cropped into panels — could not answer the
// question it was built for. Men standing abreast in this arena are at five
// different bearings from the bonfire, so the row was five exposures: the
// middle panels were backlit by flame and blown to orange, the ends sat in
// shadow, and the crop that came out of it invited a reviewer to compare
// silhouettes across lighting he could not see changing. A helmet passed
// review on it.
//
// A sheet inverts that. The subject never moves, so every panel is the same
// photons; the camera never moves, so every panel is the same scale and the
// same background; only the helmet changes. Each panel is its own full-frame
// capture, so the fittings get the pixels the crop could not give them —
// ~450 px of head against ~200. The cards are kept on disk beside the sheet,
// because the sheet is for comparing and a card is for looking at.
//
// The cost is honest and worth stating: ten captures instead of one, which on
// a GPU-less box is minutes rather than seconds. That is the price of panels
// that can be compared at all.
// ============================================================
const CARD = { w: 700, h: 860 };

/** The shop's ladder, in the shop's order. Mirrors `HELM` in characters.ts. */
const HELM_LADDER = ["none", "hood", "iron", "nasal", "ridge", "spectacle", "boar", "crowned", "wyrm", "suttonhoo"];

// -35°, not 0 and not +35. Three-quarter because head-on is precisely the
// bearing that hides a crest and a nape guard — the two fittings the last
// review missed — while still showing the brow, the mask and the nasal. The
// SIGN is not cosmetic: the mark's key light is the bonfire off his right
// shoulder, so a negative turn rotates his face into it and a positive turn
// photographs the same helmet's shadow side.
const QUARTER = -35;

const SHEETS = {
  helmcards: {
    file: "helm-cards.png",
    cols: 5,
    title: `HELM LADDER · one huscarl, one mark, one camera, one light · three-quarter ${QUARTER}° · each panel ${CARD.w}×${CARD.h}`,
    shots: HELM_LADDER.map((helm, i) => ({
      label: `${i + 1}. ${helm}`,
      query: `preset=helmcard&helm=${helm}&turn=${QUARTER}`,
      expect: { helm, turn: QUARTER },
    })),
  },
  // The second complaint the sheet above does not answer: one helmet is a
  // three-dimensional object and a single bearing is not a review of it. The
  // crest runs fore-and-aft over the crown and the guard hangs off the nape, so
  // head-on both of them are a line and a rumour. Same mark, same camera, same
  // light — the man turns, the rig does not.
  helmturn: {
    file: "suttonhoo-turn.png",
    cols: 4,
    title: "SUTTON HOO · turntable · the rig is fixed and the man turns · crest and nape guard live at 90° and 180°",
    shots: [
      { label: "front 0°", turn: 0 },
      { label: "three-quarter −45°", turn: -45 },
      { label: "profile −90°", turn: -90 },
      { label: "back 180°", turn: 180 },
    ].map((s) => ({
      label: s.label,
      query: `preset=helmcard&helm=suttonhoo&turn=${s.turn}`,
      expect: { helm: "suttonhoo", turn: s.turn },
    })),
  },
};
const SHEET_NAMES = Object.keys(SHEETS);

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const OUT = resolve(ROOT, flag("out", "art/shots"));
const WIDTH = parseInt(flag("w", "1600"), 10);
const HEIGHT = parseInt(flag("h", "900"), 10);
// Derive a per-process port so concurrent captures don't fight over one.
const PORT = parseInt(flag("port", String(3100 + (process.pid % 700))), 10);
const CLEAN = has("hud") ? "0" : "1";
// `localhost`, not `127.0.0.1`, and this is not cosmetic. Next 16 refuses to
// serve dev resources to an origin it does not recognise, and the loopback
// literal is not one of them: `/_next/webpack-hmr` comes back blocked, the HMR
// socket handshake fails, and Next's dev client answers a dead socket by
// full-reloading the page — forever. The renderer never gets far enough to
// mount a canvas, so every dev-mode capture is a blank frame, and the tool
// dutifully reports BLANK FRAME without ever saying why. It stayed hidden
// because a production build was always lying around and the fallback was
// never the path anyone took; the first time it was, it cost a capture run.
// Change this back and the dev fallback is decoration.
const ORIGIN = `http://localhost:${PORT}`;
// A misspelled preset used to fall through to "no presets named" and quietly
// shoot the whole default set — twenty minutes of the wrong pictures. Name
// which words are flag values so anything left over can be called out.
const VALUE_FLAGS = new Set(["out", "w", "h", "port", "settle"]);
const eaten = new Set();
argv.forEach((a, i) => {
  if (!a.startsWith("--")) return;
  eaten.add(i);
  if (VALUE_FLAGS.has(a.slice(2)) && argv[i + 1] !== undefined) eaten.add(i + 1);
});
const words = argv.filter((a, i) => !eaten.has(i));
const known = (a) => ALL_PRESETS.includes(a) || EXTRA_PRESETS.includes(a) || SHEET_NAMES.includes(a);
const stray = words.filter((a) => !known(a));
if (stray.length) {
  console.error(`[shoot] not a preset or sheet: ${stray.join(", ")}`);
  console.error(`[shoot] presets: ${[...ALL_PRESETS, ...EXTRA_PRESETS].join(" ")}`);
  console.error(`[shoot] sheets:  ${SHEET_NAMES.join(" ")}`);
  process.exit(2);
}
const TARGETS = words.length ? words : ALL_PRESETS;

mkdirSync(OUT, { recursive: true });

function waitForServer(url, timeoutMs = 180000) {
  const started = Date.now();
  return new Promise((ok, fail) => {
    const poll = async () => {
      try {
        const r = await fetch(url);
        if (r.ok || r.status === 404) return ok();
      } catch { /* not up yet */ }
      if (Date.now() - started > timeoutMs) return fail(new Error(`server never came up at ${url}`));
      setTimeout(poll, 700);
    };
    poll();
  });
}

/**
 * Newest mtime under the directories a rendered frame depends on.
 *
 * A production build is a photograph of the source at the moment it was made,
 * and this tool prefers one whenever it finds a BUILD_ID — so a capture run
 * after an edit and before a rebuild reviews the *previous* commit's art and
 * says nothing about it. That is not a hypothetical: it is the same class of
 * silent-wrong-answer as the lineup this file's sheets replaced.
 */
function newestSourceMtime() {
  let newest = 0;
  for (const dir of ["src", "public"]) {
    const root = resolve(ROOT, dir);
    if (!existsSync(root)) continue;
    for (const e of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!e.isFile()) continue;
      const m = statSync(join(e.parentPath ?? e.path, e.name)).mtimeMs;
      if (m > newest) newest = m;
    }
  }
  return newest;
}

let server;
async function startServer() {
  const buildId = resolve(ROOT, ".next/BUILD_ID");
  let useProd = existsSync(buildId) && !has("dev");
  if (useProd) {
    const built = statSync(buildId).mtimeMs;
    const edited = newestSourceMtime();
    if (edited > built) {
      const mins = ((edited - built) / 60000).toFixed(1);
      console.log(`[shoot] .next is ${mins} min older than src/ — falling back to dev so the shots are of the code on disk`);
      console.log("[shoot] (run `npm run build` first for a faster, production-accurate capture)");
      useProd = false;
    }
  }
  const script = useProd ? "custom-server.mjs" : "dev-server.mjs";
  console.log(`[shoot] starting ${script} on :${PORT}`);
  server = spawn("node", [script], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.env.SHOOT_VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.SHOOT_VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer(`${ORIGIN}/api/health`);
  console.log("[shoot] server up");
}

function stopServer() {
  if (server && !server.killed) server.kill("SIGTERM");
}

const report = [];

async function main() {
  await startServer();

  // Use the pre-installed full Chromium (it has the GL stack the
  // headless shell lacks) rather than letting Playwright download one.
  const preinstalled = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: [
      // Software GL so WebGL works on a headless box with no GPU.
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-gpu-sandbox",
      "--no-sandbox",
      "--ignore-gpu-blocklist",
    ],
  });

  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
  });

  // One context per viewport size, reused. A card is not 1600×900 — it is a
  // tall crop of a head — and the panels have to come out of the renderer at
  // the size the sheet lays them down at, because resampling a 3D frame is
  // exactly how a crest ridge turns back into three grey pixels.
  const contexts = new Map([[`${WIDTH}x${HEIGHT}`, ctx]]);
  const ctxFor = async (w, h) => {
    const key = `${w}x${h}`;
    if (!contexts.has(key)) {
      contexts.set(key, await browser.newContext({
        viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: "no-preference",
      }));
    }
    return contexts.get(key);
  };

  /**
   * One capture: drive /shot with `query`, wait for the settle, write a PNG,
   * and measure it. Returns the report row plus the raw buffer, because a sheet
   * needs the pixels and does not want to read them back off disk.
   */
  async function capture({ key, query, file, w, h, expect }) {
    const page = await (await ctxFor(w, h)).newPage();
    // Photo mode has no live match, so the game transport failing to connect
    // is expected. Only surface errors that indicate a broken scene.
    const IGNORE = [
      /ERR_CONNECTION_RESET/, /favicon/, /404 \(Not Found\)/,
      /webpack-hmr/, /EventSource/, /\/api\/game\//,
    ];
    const errors = [];
    const note = (text) => { if (!IGNORE.some((r) => r.test(text))) errors.push(text); };
    page.on("console", (m) => { if (m.type() === "error") note(m.text()); });
    page.on("pageerror", (e) => note(String(e)));

    const settle = flag("settle", null);
    // `--revive` runs the preset, then puts the dead back on their feet and
    // captures that instead. On a gore preset it is the respawn check: a body
    // that came apart has to go back together, and this is the only way to look
    // at the result rather than argue about it.
    const url = `${ORIGIN}/shot?${query}&clean=${CLEAN}`
      + (settle ? `&settle=${settle}` : "")
      + (has("revive") ? "&revive=1" : "");
    console.log(`[shoot] ${key} -> ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300000 });

    // Wait for the renderer to signal it has settled. The budget is generous
    // because this box has no GPU: the full post chain through SwiftShader is
    // ~1 s a frame, and the settle is 60 of them plus procedural texture
    // generation on top. `__shotError` is the other way out: the page refusing
    // a stage it was asked for, which must not cost a five-minute timeout.
    let ready = true;
    try {
      await page.waitForFunction(
        () => window.__shotReady === true || typeof window.__shotError === "string",
        null, { timeout: 300000 },
      );
    } catch {
      ready = false;
      errors.push("renderer never signalled __shotReady (scene may have failed to build)");
    }

    // What the page says it actually staged, checked against what was asked
    // for. Without this a mistyped helm renders a bare head in silence and the
    // sheet files it under the name the tool meant — a panel that reads as "this
    // rung adds nothing", which is the most expensive wrong answer this harness
    // can produce, and the one it has already produced once.
    const staged = await page.evaluate(() => ({
      subject: window.__shotSubject ?? null,
      refused: window.__shotError ?? null,
    }));
    if (staged.refused) { ready = false; errors.push(`page refused the stage: ${staged.refused}`); }
    if (expect) {
      if (!staged.subject) errors.push("preset published no __shotSubject — is it `parametric`?");
      else if (staged.subject.helm !== expect.helm || staged.subject.turn !== expect.turn) {
        errors.push(`asked for helm=${expect.helm} turn=${expect.turn}, got helm=${staged.subject.helm} turn=${staged.subject.turn}`);
      }
    }

    // How long the settle actually took. A gore preset names an instant in a
    // death in frames and converts at the renderer's 0.05 s dt cap; if a frame
    // here is faster than that, the shot is of an earlier instant than the
    // preset asked for and the pose review is measuring the wrong moment.
    const clock = await page.evaluate(() => ({
      frames: window.__shotFrames ?? 0,
      msPerFrame: window.__shotMsPerFrame ?? 0,
    }));

    // Playwright's screenshot budget defaults to 30 s, which was never a
    // deliberate choice here and is the one budget in this file that was not
    // sized against a GPU-less box. It forces a fresh paint, so it costs a whole
    // frame — and `brawl` is now well past 30 s a frame, because the bonfire
    // beam became a second shadow-casting light and eight warriors are rendered
    // into its map as well as the key's. That failed the entire capture at the
    // fourth preset with three good PNGs already on disk. Same budget as the
    // settle wait above; it is a ceiling, not a delay.
    const buf = await page.screenshot({ path: file, timeout: 300000 });

    // A dead-black frame means the scene never rendered — catch it here
    // rather than letting a critic agent review an empty image. Measure the
    // captured PNG, not the live canvas: a WebGL canvas without
    // preserveDrawingBuffer reads back black outside its own frame.
    const stats = await page.evaluate(async (b64) => {
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = "data:image/png;base64," + b64; });
      const g = document.createElement("canvas");
      g.width = 160; g.height = 90;
      const cx = g.getContext("2d");
      cx.drawImage(img, 0, 0, 160, 90);
      const d = cx.getImageData(0, 0, 160, 90).data;
      let sum = 0, max = 0;
      // Spread of luma tells us the frame has actual content, not one flat fill.
      const hist = new Array(16).fill(0);
      for (let i = 0; i < d.length; i += 4) {
        const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
        sum += l; if (l > max) max = l;
        hist[Math.min(15, (l / 16) | 0)]++;
      }
      const n = d.length / 4;
      const occupied = hist.filter((h) => h > n * 0.002).length;
      return { ok: true, meanLuma: sum / n, maxLuma: max, tonalBuckets: occupied };
    }, buf.toString("base64"));

    const blank = stats.ok && stats.maxLuma < 8;
    const row = { preset: key, file, ready, blank, ...clock, ...stats, errors: errors.slice(0, 8) };
    report.push(row);
    console.log(
      `[shoot] ${key}: ${blank ? "BLANK FRAME" : "ok"} ` +
      `meanLuma=${stats.meanLuma?.toFixed(1)} ` +
      `frames=${clock.frames}@${clock.msPerFrame.toFixed(0)}ms errors=${errors.length}`
    );
    await page.close();
    return { row, buf };
  }

  /**
   * Lays captured cards into one PNG, in a browser canvas so the tool stays on
   * the dependencies it already has — no image library, nothing to install, and
   * the same Chromium that drew the panels draws the sheet.
   *
   * Panels go down at 1:1. The sheet is large because the cards are, and that is
   * the point of it: a contact sheet that has to be resampled to be looked at is
   * the old cropped strip with extra steps. Every panel is also left on disk as
   * its own file, so the sheet is for the comparison and the card is for the
   * fitting.
   */
  async function buildSheet(name, spec) {
    const cards = [];
    for (const shot of spec.shots) {
      const key = `${name}:${shot.label.replace(/[^\w.-]+/g, "_")}`;
      const file = resolve(cardDir, `${key.replace(":", "-")}.png`);
      const { row, buf } = await capture({ key, query: shot.query, file, w: CARD.w, h: CARD.h, expect: shot.expect });
      cards.push({ label: shot.label, b64: buf.toString("base64"), bad: row.blank || !row.ready || row.errors.length > 0 });
    }

    const page = await (await ctxFor(400, 300)).newPage();
    const dataUrl = await page.evaluate(async (arg) => {
      const { cards, cols, cardW, cardH, title } = arg;
      const GUT = 10, LABEL = 42, HEAD = 56;
      const rows = Math.ceil(cards.length / cols);
      const W = cols * cardW + (cols + 1) * GUT;
      const H = HEAD + rows * (cardH + LABEL) + (rows + 1) * GUT;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const x = c.getContext("2d");
      x.fillStyle = "#0e0f13"; x.fillRect(0, 0, W, H);
      x.textBaseline = "middle";
      x.fillStyle = "#c8cede";
      x.font = "600 26px ui-sans-serif, system-ui, sans-serif";
      x.fillText(title, GUT + 2, HEAD / 2);
      for (let i = 0; i < cards.length; i++) {
        const px = GUT + (i % cols) * (cardW + GUT);
        const py = HEAD + GUT + Math.floor(i / cols) * (cardH + LABEL + GUT);
        const img = new Image();
        await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = "data:image/png;base64," + cards[i].b64; });
        x.drawImage(img, px, py);
        x.strokeStyle = cards[i].bad ? "#c0392b" : "#2b3140";
        x.lineWidth = 2;
        x.strokeRect(px + 1, py + 1, cardW - 2, cardH - 2);
        x.fillStyle = cards[i].bad ? "#ff8a7a" : "#e7ebf2";
        x.font = "600 23px ui-sans-serif, system-ui, sans-serif";
        x.fillText(cards[i].label, px + 4, py + cardH + LABEL / 2);
      }
      return c.toDataURL("image/png");
    }, { cards, cols: spec.cols, cardW: CARD.w, cardH: CARD.h, title: spec.title });
    await page.close();

    const file = resolve(OUT, spec.file);
    writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
    console.log(`[shoot] sheet ${name} -> ${file} (${cards.length} panels)`);
    report.push({ preset: name, file, ready: true, blank: false, panels: cards.length, errors: [] });
  }

  const cardDir = resolve(OUT, "cards");
  if (TARGETS.some((t) => SHEETS[t])) mkdirSync(cardDir, { recursive: true });

  for (const target of TARGETS) {
    if (SHEETS[target]) await buildSheet(target, SHEETS[target]);
    else await capture({ key: target, query: `preset=${target}`, file: resolve(OUT, `${target}.png`), w: WIDTH, h: HEIGHT });
  }

  await browser.close();
  writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));

  const bad = report.filter((r) => r.blank || !r.ready || r.errors.length);
  console.log(`\n[shoot] wrote ${report.length} shots to ${OUT}`);
  if (bad.length) {
    console.log("[shoot] PROBLEMS:");
    for (const b of bad) console.log(`  - ${b.preset}: ready=${b.ready} blank=${b.blank} ${b.errors.join(" | ")}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error("[shoot] failed:", e); process.exitCode = 1; })
  .finally(stopServer);

process.on("SIGINT", () => { stopServer(); process.exit(130); });
