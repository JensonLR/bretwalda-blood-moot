#!/usr/bin/env node
// ============================================================
// BORDERSHOT — photograph the war map's GEOMETRY, without a server.
//
//   node tools/bordershot.mjs                 # art/ui/borders-*.png
//   node tools/bordershot.mjs --out DIR       # somewhere else
//   node tools/bordershot.mjs --zoom south    # south | north | wales | kent | all
//
// WHY THIS EXISTS AND WHY IT IS NOT `warshot.mjs`. `warshot` photographs the
// real /factions page, which is the only picture that can settle a question
// about the real screen, and it costs a Next build and a server that other
// harnesses on this box fight it for. The borders are authored in `war.mjs` in
// degrees and every one of them is wrong or right for reasons visible in the
// SVG alone — a Danelaw line that cuts across Wiltshire, a Pictish rectangle
// whose top edge is a ruled line across Scotland. So this tool assembles the
// SAME three layers WarMap.tsx assembles — the LAND clip, the territory fills
// in table order, the hairline borders — out of the SAME two modules, and
// rasterises them in about two seconds.
//
// IT IS NOT A SECOND MAP. It imports `TERRITORIES` and `project` from
// `war.mjs` and `LAND`/`NEIGHBOUR` from `britain.ts` (transliterated to JS in
// a temp file, because node cannot import TypeScript). If the geometry here
// disagrees with the page, this file is wrong and the page is right; check
// with `warshot`, which is what the last section of every run says.
// ============================================================
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync, mkdtempSync } from "fs";
import { resolve, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = resolve(flag("out", resolve(ROOT, "art/ui")));
const TAG = flag("tag", "borders");
mkdirSync(OUT, { recursive: true });

const { TERRITORIES, project } = await import(resolve(ROOT, "src/game/war.mjs"));

/* britain.ts is a TypeScript module of nothing but string and object literals.
   Stripping the four type annotations it carries is enough to make it a JS
   module, and doing that is honest in a way that re-copying the path data
   would not be: there is still exactly one coastline in this repository. */
function loadBritain() {
  const src = readFileSync(resolve(ROOT, "src/game/client/factionMap/britain.ts"), "utf8");
  const js = src.replace(/export const (\w+)\s*:[^=]+=/g, "export const $1 =");
  const dir = mkdtempSync(resolve(tmpdir(), "bordershot-"));
  const file = resolve(dir, "britain.mjs");
  writeFileSync(file, js);
  return import(file);
}
const { LAND, NEIGHBOUR, MAP_W, MAP_H, CLIP_DALRIATA } = await loadBritain();

/** The same `pathOf` territories.ts uses, and for the same reason. */
const pathOf = (t) => t.bounds.map((ring) => {
  const pts = ring.map(([lat, lon]) => {
    const { x, y } = project(lat, lon);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return `M${pts.join("L")}Z`;
}).join("");

/* The four fields, resolved to literal colours: this page has no globals.css
   to read `var(--gilt)` out of. The values are that file's. */
const FIELD = {
  saxon: "#d9a441", norse: "#8e2f3c", briton: "#5b6f3a", pict: "#3f5d78",
};

/**
 * Windows worth photographing on their own. A 639x1000 map of the whole island
 * at phone width renders the Thames four pixels tall, and "is that a river or
 * a ruler" is precisely the question this tool is asked.
 */
const WINDOWS = {
  all: { x: 0, y: 0, w: MAP_W, h: MAP_H },
  south: { x: 330, y: 700, w: 300, h: 300 },     // Thames, Danelaw, Kent
  north: { x: 180, y: 100, w: 320, h: 420 },     // Forth, Tay, the Mounth
  middle: { x: 240, y: 480, w: 340, h: 300 },    // Humber, Trent, Tees, Solway
  wales: { x: 280, y: 620, w: 220, h: 220 },     // Offa's Dyke
  kent: { x: 460, y: 780, w: 180, h: 160 },      // the estuary and the strait
};

function page(win, scale) {
  const fills = TERRITORIES.map((t) =>
    `<path d="${pathOf(t)}" class="wm-field" style="fill:${FIELD[t.people]}"/>`).join("\n");
  const borders = TERRITORIES.map((t) => `<path d="${pathOf(t)}" class="wm-border"/>`).join("\n");
  const anchors = TERRITORIES.map((t) => {
    const { x, y } = project(t.anchor[0], t.anchor[1]);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" class="wm-anchor"/>` +
      `<text x="${x.toFixed(1)}" y="${(y - 6).toFixed(1)}" class="wm-tag">${t.id}</text>`;
  }).join("\n");
  return `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:#0d0b09;}
svg{display:block;width:${(win.w * scale).toFixed(0)}px;height:${(win.h * scale).toFixed(0)}px;}
.wm-neighbour{fill:#14120f;stroke:rgba(217,164,65,0.18);stroke-width:1;}
.wm-field{opacity:.78;}
.wm-border{fill:none;stroke:rgba(12,10,8,0.55);stroke-width:1.4;}
.wm-dalriata{fill:none;stroke:rgba(230,214,180,.34);stroke-width:1.6;stroke-dasharray:7 6;}
.wm-coast{fill:none;stroke:rgba(240,224,190,.55);stroke-width:1.5;stroke-linejoin:round;}
.wm-anchor{fill:#fff;opacity:.9;}
.wm-tag{fill:#fff;font:9px sans-serif;text-anchor:middle;opacity:.75;}
</style>
<svg viewBox="${win.x} ${win.y} ${win.w} ${win.h}" xmlns="http://www.w3.org/2000/svg">
  <defs><clipPath id="warmap-land"><path d="${LAND}"/></clipPath></defs>
  <path d="${NEIGHBOUR}" class="wm-neighbour"/>
  <g clip-path="url(#warmap-land)">
    ${fills}
    ${borders}
    <path d="${CLIP_DALRIATA.join("")}" class="wm-dalriata"/>
  </g>
  <path d="${LAND}" class="wm-coast"/>
  ${argv.includes("--anchors") ? anchors : ""}
</svg>`;
}

const want = flag("zoom", "all,south,north,middle,wales,kent").split(",");
const preinstalled = "/opt/pw-browsers/chromium";
const browser = await chromium.launch({
  ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
  args: ["--no-sandbox", "--disable-gpu-sandbox", "--use-gl=swiftshader",
         "--enable-unsafe-swiftshader", "--disable-dev-shm-usage"],
});
for (const key of want) {
  const win = WINDOWS[key];
  if (!win) { console.log(`[bordershot] no window named ${key}`); continue; }
  const scale = key === "all" ? 1.4 : 3.2;
  const ctx = await browser.newContext({
    viewport: { width: Math.round(win.w * scale), height: Math.round(win.h * scale) },
    deviceScaleFactor: 2,
  });
  const p = await ctx.newPage();
  await p.setContent(page(win, scale), { waitUntil: "load" });
  const file = resolve(OUT, `${TAG}-${key}.png`);
  await p.screenshot({ path: file });
  console.log(`[bordershot] ${file}`);
  await ctx.close();
}
await browser.close();
console.log("[bordershot] geometry only. The real screen is `npm run warshot`.");
