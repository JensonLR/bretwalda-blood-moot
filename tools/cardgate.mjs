#!/usr/bin/env node
// ============================================================
// CLASSMATRIX — what the four class cards ACTUALLY DRAW, read out of the
// pixels of a browser capture.
//
//   node tools/classmatrix.mjs
//   node tools/classmatrix.mjs --port 3410      # pick the dev port
//   node tools/classmatrix.mjs --keep           # keep the PNGs in art/ui/classmatrix
//
// WHY THIS FILE EXISTS, and it is an incident rather than a wish.
//
// The chooser draws four stat bars on each of four cards. A previous gate for
// those bars READ THE SOURCE: it scanned `page.tsx` for typed maxima and for the
// clamp, and pronounced. An adversary then mutated the DRAWN GEOMETRY — the
// widths that end up on glass — in a way no source scan can see, and the gate
// stayed green through it. Its own remedy, in its own words, was "a check that
// reads the DRAWN geometry out of a browser capture". This is that check.
//
// The house rule about rulers is the reason for every design choice below:
//
//   * NOTHING IS CONCLUDED FROM SOURCE. The numbers gated on are runs of
//     coloured pixels in a PNG that a real Chromium took of the real page, at a
//     phone width and a desktop width. `getBoundingClientRect` is used only to
//     find where a bar is; the verdict is the pixels, because a rect is what the
//     layout INTENDED and a pixel is what the player GOT. The two are gated
//     against each other (claim 2) precisely so a clip, a transform or an
//     overflow that separates them is a finding rather than a silence.
//
//   * THE GATE MUST BE SHOWN DISCRIMINATING ON EVERY RUN. Two mutations are
//     applied on every invocation and the harness asserts that it goes RED under
//     each — the same arrangement `goretest.mjs` keeps with `--blind`:
//       MUTATION A (pixels)  a stylesheet pins every fill to 100%. The source is
//                            untouched, so a source scan cannot move; the drawn
//                            gate must.
//       MUTATION B (numbers) the served module is rewritten in flight so the
//                            runekeeper moves 5.0 -> 5.6 and the warden 4.0 ->
//                            5.0. That is the ORIGINAL defect verbatim: two
//                            different speeds drawing one identical full bar,
//                            because the ceiling is a hard-coded 100 and the
//                            fill clamps to it.
//     A gate that has only ever been seen green has never been tested.
//
//   * THE LEVER IS PULLED INSIDE THE HARNESS. Mutation B is also R1: change the
//     number by a lot and check the drawn bar MOVES. The warden's bar moving is
//     the proof the injection reached the glass; the runekeeper's bar NOT moving
//     is the defect, measured in pixels, with no reference to the source at all.
//
// WHAT IT FOUND ON THE TREE IT WAS WRITTEN AGAINST — this is not a hypothetical:
// every bar's leading class is drawn AT the rail (huscarl HP 150/150, runekeeper
// SPD 100/100, berserker ATK 84/84, huscarl DEF 80/80), so a buff to any leader
// is invisible on the card, and `src/game/types.ts`'s display table disagrees
// with `src/game/engine.mjs`'s authority on `moveSpeed` for all four classes.
// See `docs/OPEN-DEFECTS.md`. This harness owns no `src/` file and fixes
// neither; it makes both impossible to lose.
//
// Exits non-zero if any claim fails.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "art/ui/classmatrix");
const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
// Derived from the pid for the same reason `uishots.mjs` does it: honouring an
// ambient PORT means adopting whatever is already answering there and reporting
// on a stranger's build.
const PORT = parseInt(flag("port", String(3500 + (process.pid % 200))), 10);
const BASE = () => `http://localhost:${PORT}`;

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// ------------------------------------------------------------------ the cards
//
// The four bars, and what each one is drawn FROM. This mapping is the one piece
// of knowledge the harness cannot photograph, so it is stated once, here, and
// claim 3 re-checks it from the other end: if a bar were wired to a different
// stat, the drawn order would stop matching the authority's order for it.
const BARS = [
  { label: "HP", stat: "maxHealth" },
  { label: "SPD", stat: "moveSpeed" },
  { label: "ATK", stat: "attackDamage" },
  { label: "DEF", stat: "blockReduction" },
];
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
const CARD_NAME = { huscarl: "HUSCARL", warden: "WARDEN", runekeeper: "RUNEKEEPER", berserker: "BERSERKER" };

/**
 * The two stat tables, read as TEXT out of the two files that hold them.
 *
 * This is not "concluding from source" — it is reading the inputs so the drawn
 * output can be judged against them. Nothing here decides whether a bar is
 * right; the pixels do that.
 */
function statTable(file) {
  const src = readFileSync(resolve(ROOT, file), "utf8");
  const out = {};
  for (const c of CLASSES) {
    const m = src.match(new RegExp(`${c}\\s*:\\s*\\{([^}]*)\\}`, "s"));
    if (!m) throw new Error(`${file}: no ${c} block`);
    const body = m[1];
    out[c] = {};
    for (const b of BARS) {
      const v = body.match(new RegExp(`${b.stat}\\s*:\\s*(-?[\\d.]+)`));
      if (!v) throw new Error(`${file}: ${c} has no ${b.stat}`);
      out[c][b.stat] = parseFloat(v[1]);
    }
  }
  return out;
}
const DISPLAY = statTable("src/game/types.ts");
const AUTHORITY = statTable("src/game/engine.mjs");

// ------------------------------------------------------------------- the server
let server;
// A claim that throws leaves the child alive and the port held, and the next run
// then refuses to start. One line, and it covers every exit.
process.on("exit", () => { try { if (server) server.kill("SIGKILL"); } catch { /* already gone */ } });
function waitForServer(url, timeoutMs = 240000) {
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
async function startServer() {
  try {
    await fetch(`${BASE()}/api/health`, { signal: AbortSignal.timeout(1500) });
    console.error(`[matrix] something is already serving ${BASE()} — pass --port to pick another`);
    process.exit(2);
  } catch { /* nothing there, which is what we want */ }
  console.log(`[matrix] starting dev-server.mjs on :${PORT}`);
  // DEV and not a production build, on purpose: mutation B rewrites the served
  // module in flight, and a minified production chunk is a worse thing to do
  // regex surgery on. The claim that the surgery landed is asserted, not assumed.
  server = spawn("node", ["dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer(`${BASE()}/api/health`);
  console.log(`[matrix] server up on ${PORT}`);
}

// --------------------------------------------------------------- the capture
//
// One page, driven the way a player drives it: landing -> training -> muster,
// which is where the four cards are laid out four-across on a desktop and
// two-up on a phone.
async function openChooser(page) {
  await page.goto(`${BASE()}/`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await page.waitForFunction(() => {
    let rules = 0;
    for (const s of Array.from(document.styleSheets)) {
      try { rules += s.cssRules.length; } catch { /* opaque sheet */ }
    }
    return rules > 20;
  }, null, { timeout: 180000 });
  await page.getByRole("button", { name: /Training/ }).first().click();
  await page.waitForTimeout(600);
  const muster = page.getByRole("button", { name: /MUSTER THE TESTGROUNDS/ });
  if (await muster.count()) await muster.click();
  await page.waitForSelector("text=RUNEKEEPER", { timeout: 60000 });
  // A PHONE SCROLLS AND A DESKTOP DOES NOT, and the first cut of this file did
  // not know that: at 390 px the four cards sit two-up BELOW the fold, inside
  // the shell's own scroller rather than the window's, so the clip fell outside
  // the viewport, every screenshot came back as a strip of the difficulty line,
  // and all sixteen bars measured zero. Sixteen zeros is a capture failure and
  // this harness now says so out loud (claim 1) instead of reporting it as
  // sixteen identical bars. The grid is scrolled into the middle of the glass
  // before anything is measured.
  await page.evaluate(() => {
    const card = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("RUNEKEEPER"));
    if (card && card.parentElement) card.parentElement.scrollIntoView({ block: "center", inline: "center" });
  });
  await page.waitForTimeout(500);
}

/** Where every bar is, in CSS pixels, as the browser laid it out. */
const domRects = () => ({
  find: () => {
    const NAMES = ["HUSCARL", "WARDEN", "RUNEKEEPER", "BERSERKER"];
    const cards = [];
    for (const btn of document.querySelectorAll("button")) {
      const nameEl = btn.querySelector(".font-display");
      if (!nameEl) continue;
      const name = nameEl.textContent.trim();
      if (!NAMES.includes(name)) continue;
      const rows = [];
      for (const span of btn.querySelectorAll("span")) {
        const label = span.textContent.trim();
        if (!["HP", "SPD", "ATK", "DEF"].includes(label)) continue;
        const track = span.nextElementSibling;
        const fill = track && track.firstElementChild;
        if (!fill) continue;
        const t = track.getBoundingClientRect();
        const f = fill.getBoundingClientRect();
        rows.push({
          label,
          track: { x: t.x, y: t.y, w: t.width, h: t.height },
          fill: { x: f.x, y: f.y, w: f.width, h: f.height },
          inline: fill.getAttribute("style") || "",
        });
      }
      if (rows.length === 4) cards.push({ name, rows, box: btn.getBoundingClientRect().toJSON() });
    }
    return cards;
  },
});

/**
 * THE MEASUREMENT. A screenshot is taken, decoded back to pixels, and each bar
 * is read as a RUN OF SATURATED COLOUR from the left end of its track.
 *
 * Saturation, not a colour match: the four fills are emerald, sky, red and amber
 * and the track is `stone-700/80`, which is a neutral. `max-min > 22` separates
 * every fill from every track without the harness holding a table of hex codes
 * that a restyle would silently invalidate.
 *
 * Three rows are read and the median taken, so one row of antialiasing along the
 * rounded cap cannot decide a claim.
 */
async function measure(page, tag) {
  const cards = await page.evaluate(`(${domRects().find.toString()})()`);
  if (!cards.length) return { cards: [], bars: [] };
  const clip = cards.reduce((a, c) => ({
    x: Math.min(a.x, c.box.x), y: Math.min(a.y, c.box.y),
    r: Math.max(a.r, c.box.x + c.box.width), b: Math.max(a.b, c.box.y + c.box.height),
  }), { x: 1e9, y: 1e9, r: -1e9, b: -1e9 });
  // Clamped to the glass, because a clip that runs off the viewport is a
  // screenshot of somewhere else. Anything left outside is counted and reported
  // rather than measured as zero.
  const vp = page.viewportSize();
  const box = {
    x: Math.max(0, clip.x - 4), y: Math.max(0, clip.y - 4),
    width: Math.min(vp.width, clip.r + 4) - Math.max(0, clip.x - 4),
    height: Math.min(vp.height, clip.b + 4) - Math.max(0, clip.y - 4),
  };
  const outside = cards.reduce((n, c) => n + c.rows.filter((r) =>
    r.track.x < box.x || r.track.y < box.y
    || r.track.x + r.track.w > box.x + box.width || r.track.y + r.track.h > box.y + box.height).length, 0);
  const raw = await page.screenshot({ clip: box, timeout: 120000 });
  if (has("keep")) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, `${tag}.png`), raw);
  }
  // Decoded in the browser that drew it — the same arrangement `silhouette.mjs`
  // uses — so this tool adds no image dependency to the repo.
  const bars = await page.evaluate(async ([b64, cardsIn, boxIn]) => {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = "data:image/png;base64," + b64; });
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    // The capture is `clip` CSS pixels wide and `img.width` device pixels wide.
    const dsf = c.width / boxIn.width;
    const sat = (px, py) => {
      const i = ((py * c.width) + px) * 4;
      const r = d[i], g = d[i + 1], bl = d[i + 2];
      return Math.max(r, g, bl) - Math.min(r, g, bl);
    };
    const out = [];
    for (const card of cardsIn) {
      for (const row of card.rows) {
        const x0 = Math.round((row.track.x - boxIn.x) * dsf);
        const x1 = Math.round((row.track.x + row.track.w - boxIn.x) * dsf);
        const yc = Math.round((row.track.y + row.track.h / 2 - boxIn.y) * dsf);
        const runs = [];
        for (const dy of [-1, 0, 1]) {
          const py = Math.min(c.height - 1, Math.max(0, yc + dy));
          let run = 0;
          let miss = 0;
          for (let px = x0; px < x1; px++) {
            if (sat(px, py) > 22) { run = px - x0 + 1; miss = 0; } else if (++miss > 2) break;
          }
          runs.push(run);
        }
        runs.sort((a, b) => a - b);
        out.push({
          card: card.name, label: row.label,
          runPx: runs[1],
          trackPx: x1 - x0,
          domPx: row.fill.w * dsf,
          inline: row.inline,
          dsf,
        });
      }
    }
    return out;
  }, [raw.toString("base64"), cards, box]);
  return { cards, bars, outside };
}

const pct = (b) => (b.runPx / b.trackPx) * 100;
const get = (bars, cls, label) => bars.find((b) => b.card === CARD_NAME[cls] && b.label === label);

function printMatrix(tag, bars) {
  console.log(`\n  ${tag} — DRAWN width as a percentage of the track, read out of the PNG`);
  console.log(`    ${"".padEnd(12)}${BARS.map((b) => b.label.padStart(9)).join("")}`);
  for (const cls of CLASSES) {
    const row = BARS.map((b) => {
      const x = get(bars, cls, b.label);
      return (x ? `${pct(x).toFixed(1)}%` : "—").padStart(9);
    }).join("");
    console.log(`    ${CARD_NAME[cls].padEnd(12)}${row}`);
  }
}

// ------------------------------------------------------- mutation B, in flight
//
// The served module is rewritten between the server and the browser. Nothing on
// disk changes, which is the point: this is a mutation of what the page DRAWS
// FROM, and a scan of `src/` is blind to it in exactly the way an adversary's
// mutation of what the page draws was blind to the old gate.
const MUTATIONS = [
  { cls: "runekeeper", from: 5, to: 5.6 },
  { cls: "warden", from: 4, to: 5 },
];
let mutationHits = 0;
async function installStatMutation(page) {
  mutationHits = 0;
  await page.route(/\.(js|mjs|ts|tsx)(\?|$)/, async (route) => {
    const res = await route.fetch();
    let body;
    try { body = await res.text(); } catch { return route.fulfill({ response: res }); }
    if (!/WARRIOR_STATS|runekeeper/.test(body)) return route.fulfill({ response: res, body });
    let hit = false;
    for (const m of MUTATIONS) {
      const re = new RegExp(`(${m.cls}\\s*:\\s*\\{[^}]*?moveSpeed\\s*:\\s*)${m.from}(\\b(?!\\.))`, "s");
      if (re.test(body)) { body = body.replace(re, `$1${m.to}`); hit = true; }
    }
    if (hit) mutationHits++;
    return route.fulfill({ response: res, body });
  });
}

// ------------------------------------------------------------ the source scan
//
// THE OLD RULER, kept and run so the two verdicts can be put side by side. It is
// the thing this file replaces: it reads `page.tsx` and looks for a numeric
// literal reaching a bar width, and for the clamp. It is reported, never gated
// on, and its whole purpose here is claim 6 — under a mutation of the drawn
// pixels it does not move, because it cannot see them.
function sourceScan() {
  const src = readFileSync(resolve(ROOT, "src/app/page.tsx"), "utf8");
  const literals = [...src.matchAll(/<StatBar[^>]*?max=\{\s*([\d.]+)\s*\}/g)].map((m) => m[1]);
  const clamped = /Math\.min\(\s*100\s*,/.test(src);
  return { literals, clamped, clean: literals.length === 0 && !clamped };
}

// ==================================================================== the run
await startServer();
const preinstalled = "/opt/pw-browsers/chromium";
const browser = await chromium.launch({
  ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
  args: ["--no-sandbox", "--disable-gpu-sandbox"],
});

const VIEWPORTS = [
  { tag: "phone", width: 390, height: 844, touch: true },
  { tag: "desktop", width: 1440, height: 900, touch: false },
];

const scan = sourceScan();
console.log(`\n[matrix] the OLD ruler, for comparison only — source scan of page.tsx: `
  + `${scan.clean ? "GREEN" : "RED"} (${scan.literals.length} typed maxima ${scan.literals.join(", ") || "—"}; `
  + `clamp ${scan.clamped ? "present" : "absent"})`);

const seen = {};
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    // Two device pixels to the CSS pixel, so a 175 px track is 350 samples wide
    // and a one-percent difference is three and a half pixels rather than one.
    deviceScaleFactor: 2,
    isMobile: vp.touch, hasTouch: vp.touch, reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await openChooser(page);
  const plain = await measure(page, `${vp.tag}-plain`);

  // ---- MUTATION A: the pixels, and nothing else.
  await page.addStyleTag({ content: `button div[style*="width"] { width: 100% !important; }` });
  await page.waitForTimeout(150);
  const pinned = await measure(page, `${vp.tag}-mutation-a`);

  // ---- MUTATION B: the numbers the page draws from, rewritten in flight. A
  // FRESH PAGE, because the rewrite has to be in place before the module is
  // fetched — routing the page that is already showing the cards would change
  // nothing and would look exactly like a clamp.
  const page2 = await ctx.newPage();
  await installStatMutation(page2);
  await openChooser(page2);
  const bumped = await measure(page2, `${vp.tag}-mutation-b`);
  const hits = mutationHits;
  await page2.close();
  await page.close();
  await ctx.close();
  seen[vp.tag] = { plain, pinned, bumped, hits };
  printMatrix(vp.tag, plain.bars);
}
await browser.close();
if (server) server.kill("SIGTERM");

// ============================================================
// 1. THE CAPTURE IS REAL. Sixteen bars at each width, on tracks wide enough to
//    measure, with something drawn in every one of them. A gate whose subject
//    did not render is a gate that passes for the wrong reason.
// ============================================================
for (const vp of VIEWPORTS) {
  const b = seen[vp.tag].plain.bars;
  const thin = b.filter((x) => x.trackPx < 60);
  const empty = b.filter((x) => x.runPx <= 1);
  const over = b.filter((x) => x.runPx > x.trackPx + 1);
  check(`${vp.tag}: sixteen bars captured, all measurable, none empty, none overflowing, none off the glass`,
    b.length === 16 && !thin.length && !empty.length && !over.length && seen[vp.tag].plain.outside === 0,
    `${b.length} bars, narrowest track ${Math.min(...b.map((x) => x.trackPx))}px, `
    + `${empty.length} empty, ${over.length} overflowing, ${seen[vp.tag].plain.outside} outside the capture`);
}

// ============================================================
// 2. THE PIXELS AND THE LAYOUT AGREE. The rect is what the layout intended; the
//    run of colour is what the player got. Where they disagree something is
//    clipping, transforming or overflowing between the two — which is a finding,
//    and it is the class of mutation this file was written to catch. Everything
//    below is gated on the PIXELS.
// ============================================================
for (const vp of VIEWPORTS) {
  const b = seen[vp.tag].plain.bars;
  const worst = b.reduce((m, x) => Math.max(m, Math.abs(x.runPx - x.domPx) / x.trackPx), 0);
  check(`${vp.tag}: drawn pixels agree with the laid-out rect on every bar (within 3% of the track)`,
    worst <= 0.03,
    `worst disagreement ${(worst * 100).toFixed(1)}% of the track`);
}

/**
 * The claim the whole file is for: WITHIN A STAT, four different numbers must
 * draw four different widths, IN THE RIGHT ORDER.
 *
 * `minGapPx` is three device pixels, which at these track widths is under one
 * percent — well inside the smallest real gap the roster contains (the warden
 * and berserker are 5% of the SPD ceiling apart) and well outside antialiasing.
 * It is a fixed threshold and it does not move with the sample, because a bar
 * that moves with what it is measuring is how this repository has been fooled
 * thirteen times.
 */
function discriminates(bars, table) {
  const faults = [];
  for (const bar of BARS) {
    const seenBars = CLASSES.map((cls) => ({ cls, v: table[cls][bar.stat], px: get(bars, cls, bar.label) }))
      .filter((x) => x.px);
    for (let i = 0; i < seenBars.length; i++) {
      for (let j = i + 1; j < seenBars.length; j++) {
        const a = seenBars[i];
        const b = seenBars[j];
        const dv = a.v - b.v;
        const dpx = a.px.runPx - b.px.runPx;
        if (dv === 0) continue;
        if (Math.abs(dpx) < 3) {
          faults.push(`${bar.label}: ${a.cls} ${a.v} and ${b.cls} ${b.v} draw the same bar `
            + `(${a.px.runPx}px vs ${b.px.runPx}px of ${a.px.trackPx})`);
        } else if (Math.sign(dv) !== Math.sign(dpx)) {
          faults.push(`${bar.label}: ${a.cls} ${a.v} draws ${a.px.runPx}px but ${b.cls} ${b.v} draws ${b.px.runPx}px — inverted`);
        }
      }
    }
  }
  return faults;
}

// ============================================================
// 3. DISCRIMINATION. Different numbers, different bars, right way round.
// ============================================================
for (const vp of VIEWPORTS) {
  const faults = discriminates(seen[vp.tag].plain.bars, DISPLAY);
  check(`${vp.tag}: every pair of classes that differs on a stat draws a visibly different bar`,
    faults.length === 0, faults.length ? faults.join("; ") : "all twenty-four pairs separated and in order");
}

// ============================================================
// 4. THE RATIOS ARE FAITHFUL. A bar is a proportion or it is decoration: within
//    a stat, twice the number must be twice the bar. This is transform-free —
//    whatever constant the card multiplies a stat by cancels in the ratio — so
//    it holds without the harness knowing what that constant is, and it is what
//    a clamp or a floor breaks first.
// ============================================================
for (const vp of VIEWPORTS) {
  const faults = [];
  for (const bar of BARS) {
    const row = CLASSES.map((cls) => ({ cls, v: DISPLAY[cls][bar.stat], px: get(seen[vp.tag].plain.bars, cls, bar.label) })).filter((x) => x.px);
    const k = row.map((x) => (x.px.runPx / x.px.trackPx) / x.v);
    const lo = Math.min(...k);
    const hi = Math.max(...k);
    if ((hi - lo) / hi > 0.05) {
      faults.push(`${bar.label}: pixels-per-unit spans ${lo.toFixed(4)}–${hi.toFixed(4)} across the four cards`);
    }
  }
  check(`${vp.tag}: within a stat, the drawn width is proportional to the number`,
    faults.length === 0, faults.length ? faults.join("; ") : "one pixels-per-unit constant fits all four cards on all four bars");
}

// ============================================================
// 5. THE LEVER, AND THE ORIGINAL DEFECT REPRODUCED IN DRAWN GEOMETRY.
//
//    The served module is rewritten so the runekeeper moves 5.0 -> 5.6 and the
//    warden 4.0 -> 5.0.
//
//    5a is the control and it is what makes 5b mean anything: the warden's bar
//    must GROW, because if the injection never reached the page then nothing
//    below is evidence of anything.
//    5b is the lever on the class at the top of the bar. A 12% faster runekeeper
//    must draw a longer bar. If it does not, the ceiling is a hard-coded number
//    and the card cannot show a fast man being made faster.
//    5c is the defect in the owner's own terms: two different speeds, one
//    identical full bar.
// ============================================================
for (const vp of VIEWPORTS) {
  const s = seen[vp.tag];
  const wardenBefore = get(s.plain.bars, "warden", "SPD");
  const wardenAfter = get(s.bumped.bars, "warden", "SPD");
  const runeBefore = get(s.plain.bars, "runekeeper", "SPD");
  const runeAfter = get(s.bumped.bars, "runekeeper", "SPD");
  const ok = s.hits > 0 && wardenAfter && wardenBefore && wardenAfter.runPx - wardenBefore.runPx > 10;
  check(`${vp.tag}: 5a CONTROL — the injected 4.0 -> 5.0 reached the glass (the warden's bar grew)`,
    ok,
    `${s.hits} module(s) rewritten; warden SPD ${wardenBefore ? wardenBefore.runPx : "?"}px -> ${wardenAfter ? wardenAfter.runPx : "?"}px `
    + `of ${wardenBefore ? wardenBefore.trackPx : "?"}`);

  // Predicted from the control, not from the source: the warden's growth per
  // unit of moveSpeed is measured on this very capture, and the runekeeper is
  // asked for the same growth for the same +0.6. Half of it will do.
  const perUnit = wardenAfter && wardenBefore ? (wardenAfter.runPx - wardenBefore.runPx) / (5 - 4) : 0;
  const want = perUnit * (5.6 - 5) * 0.5;
  const got = runeAfter && runeBefore ? runeAfter.runPx - runeBefore.runPx : 0;
  check(`${vp.tag}: 5b THE LEVER — a runekeeper made 12% faster draws a longer speed bar`,
    got >= want && want > 0,
    `runekeeper SPD ${runeBefore ? runeBefore.runPx : "?"}px -> ${runeAfter ? runeAfter.runPx : "?"}px `
    + `(moved ${got.toFixed(0)}px, needed ${want.toFixed(0)}px at the warden's own rate of ${perUnit.toFixed(0)}px per m/s)`);

  const collide = runeAfter && wardenAfter && Math.abs(runeAfter.runPx - wardenAfter.runPx) < 3;
  check(`${vp.tag}: 5c a 5.6 and a 5.0 do not draw the same bar`,
    !collide,
    collide ? `both draw ${runeAfter.runPx}px of ${runeAfter.trackPx} — the identical full bar this gate exists to catch`
      : `5.6 draws ${runeAfter ? runeAfter.runPx : "?"}px, 5.0 draws ${wardenAfter ? wardenAfter.runPx : "?"}px`);
}

// ============================================================
// 6. THE PROOF THAT THIS RULER IS STRONGER THAN THE ONE IT REPLACES.
//
//    A stylesheet pins every fill to the full width. Nothing under `src/`
//    changes, so the source scan's verdict CANNOT move — and it does not. The
//    drawn gate must go from green to red on the same page, or it is not
//    reading the drawing.
// ============================================================
const scanAfter = sourceScan();
for (const vp of VIEWPORTS) {
  const before = discriminates(seen[vp.tag].plain.bars, DISPLAY);
  const after = discriminates(seen[vp.tag].pinned.bars, DISPLAY);
  const pinnedFull = seen[vp.tag].pinned.bars.filter((b) => b.runPx >= b.trackPx - 2).length;
  check(`${vp.tag}: 6 CONTROL — pixels mutated, source untouched: the drawn gate goes RED and the source scan does not move`,
    before.length === 0 && after.length >= 6 && pinnedFull === 16
    && scanAfter.clean === scan.clean && scanAfter.literals.length === scan.literals.length,
    `drawn gate ${before.length} faults -> ${after.length} faults with ${pinnedFull}/16 bars pinned full; `
    + `source scan ${scan.clean ? "GREEN" : "RED"} -> ${scanAfter.clean ? "GREEN" : "RED"} (unchanged, as it must be — it never saw the pixels)`);
}

// ============================================================
// 7. SERVER AUTHORITY. `engine.mjs` decides a fight; the card is a promise about
//    what the engine will do. A card drawn from a second copy of the numbers is
//    a promise nobody is keeping — and this is failure mode 3 in `PROCESS.md`,
//    the mirrored definition, in the one place a player reads before choosing.
// ============================================================
const drift = [];
for (const cls of CLASSES) {
  for (const bar of BARS) {
    const a = AUTHORITY[cls][bar.stat];
    const d = DISPLAY[cls][bar.stat];
    if (a !== d) drift.push(`${cls}.${bar.stat} card ${d} vs engine ${a}`);
  }
}
check("the card's table is the engine's table",
  drift.length === 0,
  drift.length ? drift.join("; ") : "all sixteen drawn stats match src/game/engine.mjs");

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (has("keep")) console.log(`captures in ${OUT}`);
else rmSync(OUT, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
