#!/usr/bin/env node
// ============================================================
// SILHOUETTE — the same audit cards, with the material taken away.
//
//   node tools/silhouette.mjs helm      --out art/shots/sil
//   node tools/silhouette.mjs weapons   --out art/shots/sil
//   node tools/silhouette.mjs helm hair beard cloak armor warpaint weapons
//
// "Generic, and almost the same as each other" is a judgement about SHAPE, and
// colour is what stops it being made: two helmets in different metals read as
// two helmets long after their outlines have stopped differing. So this tool
// photographs the identical cards `tools/shoot.mjs` shoots and throws the
// shading away — flat black on white, no material, no light, no grade.
//
// It does that without touching a line of src/, by hooking the GL context
// before the app boots: every FRAGMENT shader that is not a fullscreen post
// pass (those sample `tDiffuse` and must be left alone, or the chain that
// composites the frame gets rewritten too) is given a new `main` that keeps the
// original's `discard`s — alpha-tested cutouts are part of the outline — and
// then overwrites the colour with a depth band about the subject's own
// distance. Everything nearer or further than the man goes black, the man goes
// white, and the tool inverts and hard-thresholds the PNG afterwards.
//
// The band is why the ground does not swallow the legs: a straight "nearer than
// X" test paints every blade of grass between the lens and the boots, and on
// the kit card that is the bottom third of the frame.
//
// `quality=low` on purpose, and only here: it drops bloom and AO, which are the
// two effects that would dilate a hard edge by several pixels before the
// threshold sees it. It is not a change to what the geometry is.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { mkdirSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = resolve(ROOT, flag("out", "art/shots/sil"));
// `--material` shoots the same sheets with the hook off and the game's own
// quality: the silhouette answers "is this a different shape", and the material
// pass answers "is it a different object". The weapon sheets need both, and
// /shot has no weapon lens for `npm run shots` to drive one from.
const MATERIAL = argv.includes("--material");
// Pinned tier, for the one comparison the harness could not make otherwise: a
// card's viewport is 700 px wide, and `detectTier` steps a non-touch client
// under 900 px down to `medium` — which is also what a phone gets. The face was
// authored at `high`, so "what does a player actually see" needs both.
const QUALITY = flag("quality", null);
const PORT = parseInt(flag("port", String(3800 + (process.pid % 190))), 10);
const ORIGIN = `http://localhost:${PORT}`;

// Panel geometry, mirrored from /shot's CARDS. Only `dist` is duplicated here
// (the depth band needs it) and it is asserted against the roster at run time,
// so this cannot drift into photographing the wrong band in silence.
const CARDS = { facecard: { dist: 2.05 }, kitcard: { dist: 5.2 }, fightcard: { dist: 6.8 } };
const BAND = 0.85; // metres either side of the mark: a man is ~0.5 m deep, plus a spear.

const QUARTER = -35;
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];

/**
 * The sheets. A silhouette sheet is one slot at one bearing: adding bearings
 * multiplies a two-hour run, and the bearing that decides "do these differ" is
 * the three-quarter the material sheets already use, plus profile where the
 * shape being sold is a side-on one (a crest runs fore-and-aft; a forked beard
 * hangs).
 */
const SHEETS = {
  // Split in two rather than shot as one two-row sheet, because a sheet is
  // atomic — the PNG is written after the last panel — and on a GPU-less box ten
  // panels is an hour. The bearing that answers "are these the same helmet" is
  // the three-quarter; the profile is where a crest and a nape guard live, and
  // it is worth its own hour only once the first sheet has been read.
  helm: { file: "sil-helm.png", card: "facecard", slot: "helm", cols: 10,
    title: "HELM · SILHOUETTE ONLY · three-quarter −35°",
    rows: [{ turn: QUARTER, tag: "3/4" }] },
  helmprofile: { file: "sil-helm-profile.png", card: "facecard", slot: "helm", cols: 10,
    title: "HELM · SILHOUETTE ONLY · profile −90°, where a crest and a nape guard are",
    rows: [{ turn: -90, tag: "profile" }] },
  helmfight: { file: "sil-helm-fight.png", card: "fightcard", slot: "helm", cols: 10,
    title: "HELM · SILHOUETTE ONLY · at fight distance, −35°", rows: [{ turn: QUARTER }] },
  hair: { file: "sil-hair.png", card: "facecard", slot: "hair", cols: 4,
    title: "HAIR · SILHOUETTE ONLY · three-quarter and from behind",
    rows: [{ turn: QUARTER, tag: "3/4" }, { turn: 180, tag: "back" }] },
  beard: { file: "sil-beard.png", card: "facecard", slot: "beard", cols: 5,
    title: "BEARD · SILHOUETTE ONLY · three-quarter and profile",
    rows: [{ turn: QUARTER, tag: "3/4" }, { turn: -90, tag: "profile" }] },
  cloak: { file: "sil-cloak.png", card: "kitcard", slot: "cloak", cols: 5,
    title: "CLOAK · SILHOUETTE ONLY · from behind and three-quarter",
    rows: [{ turn: 180, tag: "back" }, { turn: QUARTER, tag: "3/4" }] },
  armor: { file: "sil-armour.png", card: "kitcard", slot: "armor", cols: 7,
    title: "ARMOUR FINISH · SILHOUETTE ONLY · seven tints, one outline · three-quarter",
    rows: [{ turn: QUARTER }] },
  warpaint: { file: "sil-warpaint.png", card: "facecard", slot: "warPaint", cols: 4,
    title: "WAR PAINT · SILHOUETTE ONLY · front 0° · a paint has no outline and this is the proof",
    rows: [{ turn: 0 }] },
};

/**
 * Weapons. There is no lens in /shot that photographs a weapon on its own, and
 * this tool may not add one — so the honest capture is the man holding it, from
 * the bearing where the weapon is not inside his own body. Every class, both
 * lenses, silhouette and material, and the profile row is the one that answers
 * whether a sword reads as a sword.
 */
const WEAPON_ROWS = [
  { turn: -90, tag: "profile" },
  { turn: QUARTER, tag: "3/4" },
];

function classSheet(card, file, title) {
  return {
    file, card, cols: 4, title,
    shots: WEAPON_ROWS.flatMap((r) =>
      CLASSES.map((cls) => ({ label: `${cls} · ${r.tag}`, query: `cls=${cls}&turn=${r.turn}` }))),
  };
}
/**
 * The face, which is the closest thing to the lens in the whole game and the
 * one the owner called a mannequin. Front and three-quarter, bare and under two
 * helmets, because "does the face survive a helm" is a different question from
 * "is the face any good" and both were asked.
 */
SHEETS.face = {
  file: "sil-face.png", card: "facecard", cols: 4,
  title: "THE FACE · front 0° and three-quarter −45° · bare, under the Wyrm-Crest, under the Sutton Hoo mask",
  shots: [
    { label: "bare · front 0°", query: "helm=helm_none&turn=0" },
    { label: "bare · 3/4 −45°", query: "helm=helm_none&turn=-45" },
    { label: "under helm · front 0°", query: "helm=helm_wyrm&turn=0" },
    { label: "under mask · front 0°", query: "helm=helm_suttonhoo&turn=0" },
  ],
};

/**
 * Armour finish, per class. Every finish panel in the audit is shot on a
 * huscarl, and a huscarl is the one warrior in the game wearing mail over his
 * whole torso — so the sheet flatters a slot that the other three wear less of,
 * or none of. Rough Iron against Bretwalda Gold, 0 gold against 510, on each.
 */
SHEETS.finishcls = {
  file: "sil-finish-by-class.png", card: "kitcard", cols: 4,
  title: "ARMOUR FINISH BY CLASS · Rough Iron (0g) over Bretwalda Gold (510g) · three-quarter −35°",
  shots: [
    ...CLASSES.map((cls) => ({ label: `${cls} · iron 0g`, query: `cls=${cls}&armor=armor_iron&turn=${QUARTER}` })),
    ...CLASSES.map((cls) => ({ label: `${cls} · gold 510g`, query: `cls=${cls}&armor=armor_gold&turn=${QUARTER}` })),
  ],
};

SHEETS.weapons = classSheet("kitcard", "sil-weapons.png",
  "WEAPONS · SILHOUETTE ONLY · sword+shield, spear, seax, dane axe · profile and three-quarter");
SHEETS.weaponsfight = classSheet("fightcard", "sil-weapons-fight.png",
  "WEAPONS · SILHOUETTE ONLY · at fight distance");

const words = argv.filter((a, i) => !a.startsWith("--") && !(argv[i - 1] ?? "").startsWith("--"));
const TARGETS = words.length ? words : Object.keys(SHEETS);
const unknown = TARGETS.filter((t) => !SHEETS[t]);
if (unknown.length) {
  console.error(`[sil] not a sheet: ${unknown.join(", ")}`);
  console.error(`[sil] sheets: ${Object.keys(SHEETS).join(" ")}`);
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });

let server;
async function startServer() {
  if (!existsSync(resolve(ROOT, ".next/BUILD_ID"))) throw new Error("no production build — run `npm run build` first");
  server = spawn("node", ["custom-server.mjs"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const started = Date.now();
  for (;;) {
    try { const r = await fetch(`${ORIGIN}/api/health`); if (r.ok || r.status === 404) break; } catch { /* not up */ }
    if (Date.now() - started > 180000) throw new Error("server never came up");
    await new Promise((ok) => setTimeout(ok, 700));
  }
  console.log(`[sil] server up on :${PORT}`);
}

/** The same virtual clock shoot.mjs installs: the pose must be the frame count. */
function installVirtualClock(stepMs) {
  const realRaf = window.requestAnimationFrame.bind(window);
  let vnow = 0, queue = [], scheduled = false, nextId = 1;
  const cancelled = new Set();
  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    queue.push({ id, cb });
    if (!scheduled) {
      scheduled = true;
      realRaf(() => {
        scheduled = false; vnow += stepMs;
        const batch = queue; queue = [];
        for (const item of batch) if (!cancelled.has(item.id)) item.cb(vnow);
      });
    }
    return id;
  };
  window.cancelAnimationFrame = (id) => { cancelled.add(id); };
  performance.now = () => vnow;
}

/**
 * The material, removed at the driver. Runs before any app code, so nothing in
 * src/ knows this happened and nothing in src/ had to be changed to allow it.
 */
function installSilhouette(band) {
  const FRAGMENT = 0x8b30;
  const kind = new WeakMap();
  const rewrite = (src) => {
    // Fullscreen post passes are the frame's compositor, not the scene. Leave
    // them: rewriting them paints the whole picture one flat value.
    //
    // `tDiffuse` alone does NOT identify one here — this game's surface
    // materials carry a sampler of that name too, and keying on it skipped
    // every warrior in the frame and rewrote only the sky. A pass is a shader
    // that samples a full frame and has no surface behind it, so it is the
    // absence of the lit-surface varying that names it.
    if (/tDiffuse/.test(src) && !/vViewPosition/.test(src)) return src;
    if (!/void\s+main\s*\(/.test(src)) return src;
    // gl_FragColor is a macro for the GLSL3 out-variable in three's own
    // preamble, so one assignment covers WebGL1 and WebGL2 both.
    if (!/gl_FragColor/.test(src)) return src;
    // 1/gl_FragCoord.w is view-space depth in metres, which is what makes the
    // band a statement about where the man is rather than about the depth
    // buffer's nonlinearity. Note the identifier: GLSL reserves any name with
    // two consecutive underscores, and `__sil_main` fails to compile.
    return src.replace(/void\s+main\s*\(/, "void silMain_(") + `
void main() {
  silMain_();
  float d = 1.0 / gl_FragCoord.w;
  float v = (d > ${band.near.toFixed(3)} && d < ${band.far.toFixed(3)}) ? 1.0 : 0.0;
  gl_FragColor = vec4(vec3(v), 1.0);
}
`;
  };
  for (const proto of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype]) {
    if (!proto) continue;
    const create = proto.createShader;
    proto.createShader = function (type) { const s = create.call(this, type); if (s) kind.set(s, type); return s; };
    const source = proto.shaderSource;
    proto.shaderSource = function (shader, src) {
      return source.call(this, shader, kind.get(shader) === FRAGMENT ? rewrite(src) : src);
    };
  }
}

async function main() {
  await startServer();
  const browser = await chromium.launch({
    ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
      "--disable-gpu-sandbox", "--no-sandbox", "--ignore-gpu-blocklist"],
  });

  const roster = await (async () => {
    const c = await browser.newContext({ viewport: { width: 400, height: 300 } });
    const p = await c.newPage();
    await p.goto(`${ORIGIN}/shot?roster=1`, { waitUntil: "domcontentloaded", timeout: 300000 });
    await p.waitForFunction(() => window.__shotRoster, null, { timeout: 300000 });
    const r = await p.evaluate(() => window.__shotRoster);
    await c.close();
    return r;
  })();
  console.log(`[sil] armoury: ${roster.slots.length} slots, ${roster.slots.reduce((n, s) => n + s.options.length, 0)} options`);

  const contexts = new Map();
  const ctxFor = async (card) => {
    if (contexts.has(card)) return contexts.get(card);
    const size = roster.cards[card];
    if (!size) throw new Error(`/shot has no card "${card}"`);
    const dist = CARDS[card].dist;
    const c = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
    await c.addInitScript(installVirtualClock, 50);
    if (!MATERIAL) await c.addInitScript(installSilhouette, { near: dist - BAND, far: dist + BAND });
    contexts.set(card, c);
    return c;
  };

  const report = [];
  const cardDir = resolve(OUT, "cards");
  mkdirSync(cardDir, { recursive: true });

  /** One panel: capture, then hard-threshold to black on white. */
  async function capture(card, query, file) {
    const page = await (await ctxFor(card)).newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const url = `${ORIGIN}/shot?preset=${card}&${query}&clean=1`
      + (QUALITY ? `&quality=${QUALITY}` : MATERIAL ? "" : "&quality=low");
    console.log(`[sil] ${file.split("/").pop()} -> ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300000 });
    await page.waitForFunction(() => window.__shotReady === true || typeof window.__shotError === "string",
      null, { timeout: 300000 });
    const refused = await page.evaluate(() => window.__shotError ?? null);
    if (refused) errors.push(`page refused the stage: ${refused}`);
    const raw = await page.screenshot({ timeout: 300000 });
    // Threshold in the browser that drew it, so the tool keeps to the
    // dependencies the repo already has.
    const { b64, ink } = await page.evaluate(async ([src, material]) => {
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = "data:image/png;base64," + src; });
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height);
      let on = 0;
      for (let i = 0; i < d.data.length; i += 4) {
        // The grade and the vignette still run, so the subject comes back as
        // "bright" rather than as 255. A mid threshold is well clear of both.
        const lit = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3 > 110;
        if (lit) on++;
        if (material) continue;
        const v = lit ? 20 : 246;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
      }
      if (!material) x.putImageData(d, 0, 0);
      return { b64: c.toDataURL("image/png").split(",")[1], ink: on / (c.width * c.height) };
    }, [raw.toString("base64"), MATERIAL]);
    await page.close();
    // A silhouette that is all paper or all ink is a failed capture, not a
    // finding, and saying so here is what stops it being read as one.
    if (!MATERIAL && (ink < 0.01 || ink > 0.9)) errors.push(`ink=${(ink * 100).toFixed(1)}% — the band missed the subject`);
    writeFileSync(file, Buffer.from(b64, "base64"));
    console.log(`[sil]   ink=${(ink * 100).toFixed(1)}% errors=${errors.length}`);
    report.push({ file, query, card, ink, errors });
    return { b64, bad: errors.length > 0 };
  }

  async function buildSheet(name, spec) {
    const size = roster.cards[spec.card];
    const shots = spec.shots ?? (() => {
      const slot = roster.slots.find((s) => s.slot === spec.slot);
      if (!slot) throw new Error(`armoury has no slot "${spec.slot}"`);
      return spec.rows.flatMap((row) => slot.options.map((o, i) => ({
        label: `${i + 1}. ${o.label} · ${o.cost}g${row.tag ? ` · ${row.tag}` : ""}`,
        query: `${spec.slot}=${o.id}&turn=${row.turn}`,
      })));
    })();

    const panels = [];
    for (const s of shots) {
      const stem = `${name}-${s.label.replace(/[^\w.-]+/g, "_")}`;
      const { b64, bad } = await capture(spec.card, s.query, resolve(cardDir, `${stem}.png`));
      panels.push({ label: s.label, b64, bad });
    }

    const page = await (await ctxFor(spec.card)).newPage();
    const dataUrl = await page.evaluate(async (arg) => {
      const { cards, cols, cardW, cardH, title } = arg;
      const GUT = 8, LABEL = 34, HEAD = 50;
      const rows = Math.ceil(cards.length / cols);
      const c = document.createElement("canvas");
      c.width = cols * cardW + (cols + 1) * GUT;
      c.height = HEAD + rows * (cardH + LABEL) + (rows + 1) * GUT;
      const x = c.getContext("2d");
      x.fillStyle = arg.material ? "#0e0f13" : "#ffffff"; x.fillRect(0, 0, c.width, c.height);
      x.textBaseline = "middle"; x.fillStyle = arg.material ? "#c8cede" : "#101216";
      x.font = "600 24px ui-sans-serif, system-ui, sans-serif";
      x.fillText(title, GUT + 2, HEAD / 2);
      for (let i = 0; i < cards.length; i++) {
        const px = GUT + (i % cols) * (cardW + GUT);
        const py = HEAD + GUT + Math.floor(i / cols) * (cardH + LABEL + GUT);
        const img = new Image();
        await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = "data:image/png;base64," + cards[i].b64; });
        x.drawImage(img, px, py);
        x.strokeStyle = cards[i].bad ? "#c0392b" : (arg.material ? "#2b3140" : "#b9c0cc");
        x.lineWidth = 2; x.strokeRect(px + 1, py + 1, cardW - 2, cardH - 2);
        x.fillStyle = cards[i].bad ? "#ff8a7a" : (arg.material ? "#e7ebf2" : "#101216");
        x.font = "600 20px ui-sans-serif, system-ui, sans-serif";
        x.fillText(cards[i].label, px + 4, py + cardH + LABEL / 2);
      }
      return c.toDataURL("image/png");
    }, { cards: panels, cols: spec.cols, cardW: size.w, cardH: size.h, material: MATERIAL,
      title: `${MATERIAL ? spec.title.replace("SILHOUETTE ONLY", "IN MATERIAL") : spec.title} · ${size.w}×${size.h}` });
    await page.close();
    const file = resolve(OUT, (MATERIAL ? spec.file.replace(/^sil-/, "mat-") : spec.file)
      .replace(/\.png$/, QUALITY ? `-${QUALITY}.png` : ".png"));
    writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
    console.log(`[sil] sheet ${name} -> ${file} (${panels.length} panels)`);
  }

  for (const t of TARGETS) await buildSheet(t, SHEETS[t]);
  await browser.close();
  writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
  const bad = report.filter((r) => r.errors.length);
  console.log(`\n[sil] wrote ${report.length} panels to ${OUT}`);
  if (bad.length) {
    console.log("[sil] PROBLEMS:");
    for (const b of bad) console.log(`  - ${b.file.split("/").pop()}: ${b.errors.join(" | ")}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error("[sil] failed:", e); process.exitCode = 1; })
  .finally(() => { if (server && !server.killed) server.kill("SIGTERM"); });
