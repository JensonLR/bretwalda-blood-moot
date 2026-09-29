#!/usr/bin/env node
// ============================================================
// PLATECHECK — is a plate a plate, in every state, as rendered?
//
//   node tools/platecheck.mjs                    # the built sheet + specimens (run it under the capture lock)
//   node tools/platecheck.mjs --compile          # compile globals.css with postcss instead of reading .next
//   node tools/platecheck.mjs --css some.css     # any compiled stylesheet (the red-first run on the F1 build)
//   node tools/platecheck.mjs --no-browser       # the sheet laws only, about a second
//   node tools/platecheck.mjs --sheet DIR        # where the proof sheets go (default art/ui/plates)
//
// WHY IT EXISTS. UI-PLAN 1.1 makes laws about the material the menus are made of:
// no border-radius on a plate, no backdrop-filter, no opacity to say disabled, no
// glow, a focus ring inside the cut, and "every control must show hover / active /
// focus / disabled states". Before F2 nothing held any of them and the stylesheet
// broke every one (a rounded brown gradient with a blur behind it, `opacity: .55`
// on a disabled button, a gilt halo on the war-code panel). A law with no ruler
// is a wish, and this repository has learned what a ruler that answers the wrong
// question costs (docs/PROCESS.md Part 1), so this one asks the question in two
// different ways:
//
//   1. THE SHEET (no browser). The compiled stylesheet is parsed, not grepped, and
//      every rule that names a plate class is held to the laws: a clip-path
//      polygon, radius 0, no backdrop-filter, no opacity on a disabled rule, no
//      box-shadow with a blur and no text-shadow, a focus ring at offset -4px, and
//      the type-on-metal token pairs at their contrast (the ink on the silver
//      plate, the silver ramp turned over for type set on it, the disabled ink on
//      niello). It reads the COMPILED sheet, because DESIGN-SYSTEM.md section 10
//      and F1's hover incident say the source cannot tell you what shipped.
//   2. THE SPECIMENS (a browser). Every control class is rendered with the real
//      fonts and the real stylesheet and driven through the states with a real
//      pointer and a real Tab: hover, active (mouse down), focus-visible,
//      disabled. For each state it measures, off the render and not off the CSS:
//        - DOES IT LOOK DIFFERENT. The pixels of the state are compared with the
//          pixels at rest. A rule that is written and beaten by another (a
//          call-site `!important`, a `filter` on a clipped element, a colour set
//          in the wrong layer) changes nothing on glass, and only this can see it.
//        - IS THE TYPE LEGIBLE. The specimen is shot a second time with every
//          glyph made transparent, so what is left is the plate; each piece of
//          text is then graded against the median plate colour behind it, top and
//          bottom half separately (a plate is a gradient), at 4.5:1 or 3:1 for
//          large type.
//        - IS IT STILL THE SHAPE. computed border-radius, clip-path,
//          backdrop-filter, opacity, text-shadow and box-shadow blur, on the
//          specimen in every state, so a state cannot smuggle a radius back.
//        - IS IT A TARGET. The smaller side of every control is at least 44px.
//      It also writes the proof sheets (controls.png: every control in five
//      states; plates.png: the static plates; corners.png: the cut at 4x) so a
//      person can open them, which is the only ruler for "does it read as cut
//      silver and niello or as CSS".
//
// SHOWN FAILING FIRST (docs/PROCESS.md R2): run it on the F1 build's stylesheet,
//   node tools/platecheck.mjs --css <the F1 sheet>
// and it fails on the sheet laws (radius, no clip-path, backdrop-filter,
// `opacity: .55` on a disabled rule) and on the specimens (plates with no shape,
// the disabled primary at half opacity). The transcript is in the F2 commit.
//
// WHAT IT CANNOT SEE, and says so on the verdict line (R4): a call site that
// beats a plate with a utility (`rounded-xl` on a card) is invisible to a specimen
// that has no such call site, so `tools/uishots.mjs` runs the same computed-style
// audit over every real screen; a real Windows forced-colors theme; and any state
// that needs a server (a toast, a busy button).
// ============================================================
import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname, join, basename } from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import sharp from "sharp";
import { chromium } from "playwright";
import { launchOptions, rasteriserNote } from "./lib/browser.mjs";
import { newestSource } from "./lib/freshbuild.mjs";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ROOT = flag("root", HERE);
const SHEET_DIR = resolve(HERE, flag("sheet", "art/ui/plates"));

let failures = 0;
const skipped = [];
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  PASS  ${m}`);
const note = (m) => console.log(`        ${m}`);

// ---------------------------------------------------------------- the stylesheet
async function loadCss() {
  const cssFlag = flag("css", null);
  const chunks = resolve(ROOT, ".next/static/chunks");
  const builtFiles = existsSync(chunks) ? readdirSync(chunks).filter((f) => f.endsWith(".css")).map((f) => join(chunks, f)) : [];
  // Fonts come from whichever built chunk carries @font-face, in every mode: the lab needs the real faces, and a
  // compiled sheet on its own has none (next/font emits them into their own chunk).
  const fontCss = builtFiles.map((f) => readFileSync(f, "utf8")).filter((t) => t.includes("@font-face")).join("\n");
  if (cssFlag) return { text: readFileSync(resolve(cssFlag), "utf8"), label: `--css ${basename(cssFlag)}`, fontCss };
  if (has("compile")) {
    const { default: tw } = await import(resolve(ROOT, "node_modules/@tailwindcss/postcss/dist/index.mjs"));
    const from = resolve(ROOT, "src/app/globals.css");
    const r = await postcss([tw()]).process(readFileSync(from, "utf8"), { from });
    return { text: r.css, label: "globals.css compiled now (postcss + tailwind, unminified)", fontCss };
  }
  if (!builtFiles.length) { console.error("[platecheck] no built stylesheet under .next/static/chunks: run `npm run build`, or pass --compile or --css"); process.exit(2); }
  const app = builtFiles.map((f) => ({ f, t: readFileSync(f, "utf8") })).filter(({ t }) => t.includes(".btn-primary")).sort((a, b) => b.t.length - a.t.length)[0];
  if (!app) { console.error("[platecheck] no built chunk carries .btn-primary"); process.exit(2); }
  const built = statSync(app.f).mtimeMs;
  const src = newestSource(ROOT);
  if (src.at > built) {
    console.error(`[platecheck] the built stylesheet is older than ${src.file.slice(ROOT.length + 1)}: it would be a photograph of a tree that is gone. Run \`npm run build\`, or pass --compile.`);
    process.exit(2);
  }
  return { text: app.t, label: `.next/static/chunks/${basename(app.f)}`, fontCss };
}

const { text: CSS, label: CSS_LABEL, fontCss } = await loadCss();
console.log(`[platecheck] stylesheet: ${CSS_LABEL} (${CSS.length} bytes)`);

// --------------------------------------------------------------------- parse
const ast = postcss.parse(CSS);
/** Every style rule: { sel: string[], decl: [[prop, value]], at: string[] } */
const rules = [];
ast.walkRules((rule) => {
  const at = [];
  for (let p = rule.parent; p && p.type !== "root"; p = p.parent) if (p.type === "atrule") at.push(`@${p.name} ${p.params}`);
  if (at.some((a) => a.startsWith("@keyframes") || a.startsWith("@property"))) return;
  const decl = [];
  rule.walkDecls((d) => { if (d.parent === rule) decl.push([d.prop, d.value.trim()]); });
  rules.push({ sel: rule.selector.split(",").map((s) => s.trim()), decl, at });
});

/** The plates: everything the F2 material rule builds. Each is held to the shape laws. */
const PLATES = ["plate", "plate-silver", "plate-hud", "card", "mini-nav", "warcode-frame",
  "btn-primary", "btn-ghost", "btn-info", "btn-danger", "btn-step", "btn-back",
  "input-frame", "select-frame", "tab-strip", "tab-item", "seg", "seg-item",
  "badge-sky", "badge-garnet", "badge-stone"];
/** Everything F2 owns, which is held to the no-glow and no-blur laws. The pads, the pips, the round HUD, the map and the
 *  title belong to other units and are not judged here. */
const OWNED = [...PLATES, "card-glow", "card-glow-green", "card-noble", "card-interactive", "card-selected", "medallion",
  "kbd", "warcode", "link-preview", "ctrl-row", "tip-row", "divider", "rule-label", "label-overline", "section-title",
  "ornament-line", "knot-band", "cabochon", "plate-reason"];
/** The classes that may carry a radius, and why. */
const RADIUS_OK = { kbd: "2px", medallion: "9999px", cabochon: "9999px" };
const FOCUSABLE = ["plate", "plate-silver", "plate-hud", "card", "mini-nav", "btn-primary", "btn-ghost", "btn-info",
  "btn-danger", "btn-step", "btn-back", "input-frame", "select-frame", "tab-item", "seg-item"];

const classesOf = (sel) => [...sel.matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1]);
const ruleNames = (r, list) => r.sel.flatMap((s) => classesOf(s)).filter((c) => list.includes(c));
const dv = (r, prop) => r.decl.filter(([p]) => p === prop).map(([, v]) => v);

console.log("");
console.log("THE SHEET");

// 1. every plate has a shape: a rule that names it (alone or in a list) declaring a clip-path polygon and radius 0.
{
  const missing = [];
  for (const c of PLATES) {
    // EIGHT vertices, because a rectangle is a polygon too and `polygon(0 0, 100% 0, 100% 100%, 0 100%)` would pass a test that asked only for one.
    const eight = (v) => v.startsWith("polygon(") && v.slice(8, -1).split(/,(?![^(]*\))/).length >= 8;
    const shaped = rules.filter((r) => r.sel.some((s) => s === `.${c}`) && dv(r, "clip-path").some(eight));
    const round0 = rules.filter((r) => r.sel.some((s) => s === `.${c}`) && dv(r, "border-radius").some((v) => /^0(px)?$/.test(v)));
    if (!shaped.length) missing.push(`.${c} has no rule with an eight-vertex clip-path polygon`);
    else if (!round0.length) missing.push(`.${c} never sets border-radius: 0`);
  }
  if (missing.length) { fail(`${missing.length} of ${PLATES.length} plate classes are not a cut plate`); missing.slice(0, 8).forEach(note); }
  else pass(`all ${PLATES.length} plate classes are cut (an eight-vertex clip-path polygon) and square (border-radius 0)`);
}

// 2. no radius on anything F2 owns, except the three named carve-outs.
{
  const bad = [];
  for (const r of rules) for (const c of ruleNames(r, OWNED)) for (const v of dv(r, "border-radius")) {
    if (/^0(px|rem)?$/.test(v)) continue;
    if (RADIUS_OK[c] && v === RADIUS_OK[c]) continue;
    bad.push(`.${c}: border-radius ${v}`);
  }
  if (bad.length) { fail(`${bad.length} F2-owned rule(s) round a corner`); [...new Set(bad)].slice(0, 8).forEach(note); }
  else pass("no F2-owned rule sets a border-radius other than 0 (carve-outs: .kbd 2px, .medallion and .cabochon round)");
}

// 3. no backdrop-filter.
{
  const bad = [];
  for (const r of rules) for (const c of ruleNames(r, OWNED)) for (const p of ["backdrop-filter", "-webkit-backdrop-filter"])
    for (const v of dv(r, p)) if (!/^none\b/.test(v)) bad.push(`.${c}: ${p}: ${v}`);
  if (bad.length) { fail(`${bad.length} plate rule(s) blur what is behind them`); [...new Set(bad)].slice(0, 8).forEach(note); }
  else pass("no plate has a backdrop-filter (it is switched off with !important against call-site `backdrop-blur`)");
}

// 4. disabled is never opacity.
{
  const bad = [];
  for (const r of rules) {
    // every way a stylesheet can say "disabled": the pseudo-class, the attribute, aria, and the two class names people reach for
    if (!r.sel.some((s) => /:disabled|:not\(:enabled\)|\[aria-disabled|\[disabled|\.is-disabled|\.disabled/.test(s))) continue;
    for (const c of ruleNames(r, OWNED)) for (const v of dv(r, "opacity")) if (Number(v) !== 1) bad.push(`.${c} (disabled): opacity ${v}`);
  }
  if (bad.length) { fail(`${bad.length} disabled rule(s) fade the plate instead of drawing a different one`); [...new Set(bad)].slice(0, 8).forEach(note); }
  else pass("no disabled rule uses opacity (a disabled plate is niello with dim type, not a faded primary)");
}

// 5. no glow: a box-shadow with a blur, or any text-shadow, on anything F2 owns.
{
  const stripColours = (v) => { let prev; do { prev = v; v = v.replace(/[\w-]+\([^()]*\)/g, " "); } while (v !== prev); return v.replace(/#[0-9a-f]{3,8}\b/gi, " "); };
  const bad = [];
  for (const r of rules) for (const c of ruleNames(r, OWNED)) {
    for (const v of dv(r, "text-shadow")) if (!/^none\b/.test(v)) bad.push(`.${c}: text-shadow ${v.slice(0, 40)}`);
    // a glow can be spelled as a filter too: `.plate-lift` is the one wrapper allowed a drop-shadow, and it is not in OWNED's plates
    if (c !== "plate-lift") for (const v of dv(r, "filter")) if (/drop-shadow\(/.test(v)) bad.push(`.${c}: filter ${v.slice(0, 40)} (a drop-shadow on a clipped plate is a glow or a lie)`);
    for (const v of dv(r, "box-shadow")) {
      if (/^none\b/.test(v)) continue;
      for (const layer of v.split(/,(?![^(]*\))/)) {
        const nums = stripColours(layer).replace(/\binset\b/g, " ").split(/\s+/).filter(Boolean).map((t) => parseFloat(t)).filter((n) => !Number.isNaN(n));
        if (nums.length >= 3 && nums[2] > 0) bad.push(`.${c}: box-shadow blur ${nums[2]}px (${layer.trim().slice(0, 40)})`);
      }
    }
  }
  if (bad.length) { fail(`${bad.length} glow(s) on F2-owned rules (blood is the only heat, and a blur is heat)`); [...new Set(bad)].slice(0, 8).forEach(note); }
  else pass("no F2-owned rule has a blurred box-shadow or any text-shadow (lift is a wrapper's drop-shadow, `.plate-lift`)");
}

// 6. the focus ring is inside the cut.
{
  const missing = [];
  for (const c of FOCUSABLE) {
    const ok = rules.some((r) => r.sel.some((s) => s.includes(`.${c}:focus-visible`)) && dv(r, "outline-offset").some((v) => /^-4px$/.test(v)) && dv(r, "outline").some((v) => v !== "none"));
    if (!ok) missing.push(`.${c}:focus-visible has no outline at offset -4px`);
  }
  if (missing.length) { fail(`${missing.length} of ${FOCUSABLE.length} focusable plate classes have no ring inside the cut (a clip-path clips an outline that sits outside it)`); missing.slice(0, 6).forEach(note); }
  else pass(`all ${FOCUSABLE.length} focusable plate classes draw their focus ring inside the cut (outline-offset -4px)`);
}

// 7. the type-on-metal pairs, from the tokens in the sheet.
const tok = new Map();
for (const r of rules) if (r.sel.includes(":root") && !r.at.some((a) => a.startsWith("@media"))) for (const [p, v] of r.decl) if (p.startsWith("--")) tok.set(p, v);
const resolveTok = (v, depth = 0) => {
  if (depth > 8) return null;
  const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
  if (m) return tok.has(m[1]) ? resolveTok(tok.get(m[1]), depth + 1) : m[2] ? resolveTok(m[2], depth + 1) : null;
  return v;
};
const hex = (name) => { const v = tok.has(name) ? resolveTok(tok.get(name)) : null; const m = v && v.match(/^#([0-9a-f]{6})$/i); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
{
  const PAIRS = [
    // [ink, ground, floor, what]
    ["--niello", "--plate-silver-top", 9.5, "ink on the top of the silver hero plate"],
    ["--niello", "--plate-silver-bot", 9.5, "ink on the foot of the silver hero plate"],
    ["--onsilver-soft", "--plate-silver-bot", 4.5, "supporting ink turned over for silver"],
    ["--onsilver-dim", "--plate-silver-bot", 4.5, "dim ink turned over for silver"],
    ["--onsilver-faint", "--plate-silver-bot", 4.5, "faint ink turned over for silver (the floor for a word)"],
    ["--niello", "--silver-dim", 4.5, "ink on a selected tab or segment"],
    ["--silver-lit", "--niello", 4.5, "ghost-button type on niello"],
    ["--silver-lit", "--niello-raised", 4.5, "chip type on niello-raised"],
    ["--ink-faint", "--niello", 4.5, "a disabled plate's type on niello"],
    ["--ink-faint", "--niello-raised", 4.5, "a disabled plate's type on the top of niello"],
    ["--ink-soft", "--niello-raised", 4.5, "the stone chip's type"],
    ["--ink-bright", "--madder", 4.5, "type on the madder plate (the danger button, the garnet chip)"],
    ["--silver-dim", "--hall", 3.0, "a field's boundary against the page (WCAG 1.4.11)"],
  ];
  const bad = [], seen = [];
  for (const [a, b, floor, what] of PAIRS) {
    const ca = hex(a), cb = hex(b);
    if (!ca || !cb) { bad.push(`${what}: ${!ca ? a : b} is not a hex token in :root`); continue; }
    const c = contrast(ca, cb);
    seen.push(`${c.toFixed(1)}`);
    if (c < floor) bad.push(`${what}: ${a} on ${b} is ${c.toFixed(2)}:1, floor ${floor}`);
  }
  if (bad.length) { fail(`${bad.length} of ${PAIRS.length} type-on-metal pairs are under their floor`); bad.slice(0, 8).forEach(note); }
  else pass(`all ${PAIRS.length} type-on-metal pairs clear their floor (${seen.join(", ")}:1)`);
}

if (has("no-browser")) {
  console.log("");
  finish("the browser half did not run (--no-browser): no state, contrast or shape was measured on a rendered plate");
}

// ------------------------------------------------------------------ the specimens
console.log("");
console.log("THE SPECIMENS");

const b64 = (file) => readFileSync(file).toString("base64");
/** @font-face blocks with the woff2 inlined, so a page built with setContent has the real faces. */
const inlineFonts = (text) => text.replace(/url\(([^)]*?\/media\/([^)]+?\.woff2))\)/g, (m, full, name) => {
  const f = resolve(ROOT, ".next/static/media", name);
  return existsSync(f) ? `url(data:font/woff2;base64,${b64(f)})` : m;
});

const LAB_CSS = `
  :root { --font-display: "Cinzel", "Cinzel Fallback"; --font-body: "Alegreya", "Alegreya Fallback"; }
  html, body { height: auto !important; overflow: visible; }
  body { margin: 0; padding: 28px 32px 40px; width: 1240px; background: var(--hall); }
  .lab-h { font: 700 11px/1 var(--font-display); letter-spacing: .2em; color: #9a8f7a; margin: 26px 0 12px; }
  .lab-row { display: flex; flex-wrap: wrap; gap: 26px; align-items: flex-start; }
  .lab-cell { display: flex; flex-direction: column; gap: 6px; }
  .lab-id { font: 600 10px/1 monospace; color: #6d6555; }
  .hide-text, .hide-text * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }
`;

/** [id, html, { subject, states, tap }] — subject is the element driven through the states (a selector inside the cell root). */
const CARD = (extra = "") => `<span class="label-overline" style="display:block">YOUR WARRIOR</span><span class="font-display" style="display:block;font-size:20px;margin-top:4px;color:var(--ink-bright)">WEARD</span><span style="display:block;font-size:14px;margin-top:4px;color:var(--ink-dim)">Balanced blade. Reliable. ${extra}</span>`;
const CONTROLS = [
  ["btn-primary", `<button class="btn-primary" data-subject>THE FIRST MOOT</button>`, ["hover", "active", "focus", "disabled"]],
  ["btn-ghost", `<button class="btn-ghost" data-subject>FIND A FIGHT</button>`, ["hover", "active", "focus", "disabled"]],
  ["btn-info", `<button class="btn-info" data-subject>SHARE INVITE</button>`, ["hover", "active", "focus", "disabled"]],
  ["btn-danger", `<button class="btn-danger" data-subject aria-label="Leave">LEAVE</button>`, ["hover", "active", "focus", "disabled"]],
  ["btn-step", `<button class="btn-step" data-subject aria-label="More">+</button>`, ["hover", "active", "focus", "disabled"]],
  ["btn-back", `<button class="btn-back" data-subject>&larr; BACK</button>`, ["hover", "active", "focus"]],
  ["card-interactive", `<button class="card card-interactive" data-subject style="width:290px;padding:16px;text-align:left">${CARD()}</button>`, ["hover", "active", "focus"]],
  ["card-selected", `<button class="card card-interactive card-selected" data-subject style="width:290px;padding:16px;text-align:left">${CARD("(chosen)")}</button>`, ["hover", "active", "focus"]],
  ["mini-nav", `<a class="mini-nav" data-subject href="#" style="width:120px">WAR MAP</a>`, ["hover", "active", "focus"]],
  ["tab-item", `<div class="tab-strip" style="width:360px"><button class="tab-item tab-item-active">HELMETS</button><button class="tab-item" data-subject>CLOAKS</button><button class="tab-item">ARMOUR</button></div>`, ["hover", "active", "focus"]],
  ["seg-item", `<div class="seg" style="width:300px"><button class="seg-item seg-item-active">1</button><button class="seg-item" data-subject>3</button><button class="seg-item">5</button></div>`, ["hover", "active", "focus"]],
  ["input-frame", `<input class="input-frame" data-subject placeholder="Enter warrior name..." style="width:300px">`, ["hover", "focus", "disabled"]],
  ["select-frame", `<select class="select-frame" data-subject><option>AI: Warrior</option><option>AI: Weard</option></select>`, ["hover", "focus"]],
];
const STATICS = [
  ["plate", `<div class="plate" data-subject style="width:290px;padding:18px">${CARD()}</div>`],
  ["plate-silver", `<div class="plate-silver" data-subject style="width:290px;padding:18px"><span class="label-overline" style="display:block">WAR CODE</span><span class="warcode" style="font-size:38px">JORVIK49</span><span style="display:block;font-size:14px;color:var(--ink-dim)">Send this link, nothing to install.</span><span style="display:block;font-size:12px;color:var(--ink-faint);margin-bottom:10px">Faint ink turned over.</span><button class="btn-primary" style="width:100%">COPY THE LINK</button></div>`],
  ["plate-hud", `<div class="plate-hud" data-subject style="padding:6px 12px;font:700 13px/1.2 var(--font-display);color:var(--silver-lit)">HP 84 &middot; LAST STAND</div>`],
  ["card", `<div class="card" data-subject style="width:290px;padding:16px">${CARD()}</div>`],
  ["card-glow", `<div class="card card-glow" data-subject style="width:290px;padding:16px">${CARD()}</div>`],
  ["card-noble", `<div class="card card-noble card-glow" data-subject style="width:290px;padding:26px 28px">${CARD()}</div>`],
  ["warcode-frame", `<div class="warcode-frame card-noble" data-subject style="width:310px;padding:24px;text-align:center"><span class="label-overline" style="display:block">WAR CODE</span><span class="warcode" style="font-size:34px">JORVIK49</span><div class="knot-band" style="margin:6px auto 0;width:15rem"></div></div>`],
  ["badges", `<div data-subject style="display:flex;gap:10px"><span class="badge-sky">YOU</span><span class="badge-garnet">WAR-GEAR</span><span class="badge-stone">KEPT ON THIS DEVICE</span></div>`],
  ["kbd", `<div data-subject style="display:flex;gap:10px;align-items:center"><span class="kbd">SPACE</span><span class="kbd" style="min-width:0">W</span><span style="color:var(--ink-dim);font-size:14px">to jump</span></div>`],
  ["plate-lift", `<div class="plate-lift" data-subject style="width:240px"><div class="plate-silver" style="padding:16px 22px;text-align:center;font:700 15px/1.2 var(--font-display);letter-spacing:.14em">THE HERO PLATE</div></div>`],
  ["reason", `<div data-subject style="width:290px"><button class="btn-primary" disabled style="width:100%">EQUIP &amp; BUY</button><span class="plate-reason">NEED 2,400 &mdash; YOU HAVE 0. Gold is earned in battle.</span></div>`],
  ["ornament", `<div data-subject style="width:340px;display:flex;flex-direction:column;gap:14px"><div class="section-title">CHOOSE WARRIOR</div><div class="rule-label">OR SPAR AT ONCE</div><div class="knot-band"></div><div style="text-align:center"><span class="ornament-line"></span></div><div class="label-overline" style="text-align:center">THE FORGE</div><div class="plate" style="padding:14px"><div class="divider"></div><div style="margin-top:10px;display:flex;gap:12px;align-items:center"><div class="medallion"><span style="font-size:14px">&#9876;</span></div><span class="cabochon"></span><span class="tip-row">A tip in a row.</span></div></div></div>`],
];

// ---- in-page functions: each takes the element the locator resolved to ----------------
/** Geometry facts about one element, in whatever state the page is in. */
const factsFn = (el) => {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    radii: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius],
    clip: cs.clipPath, backdrop: cs.backdropFilter || "none", opacity: cs.opacity, textShadow: cs.textShadow,
    boxShadow: cs.boxShadow, w: r.width, h: r.height, focusVisible: el.matches(":focus-visible"), cursor: cs.cursor,
  };
};
/** Every piece of text under an element: its colour, size, weight and the rect the glyphs occupy. */
const probesFn = (root) => {
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    out.push({ text: n.nodeValue.trim().slice(0, 24), color: cs.color, size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10), x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height });
  }
  // A field's own value (or its placeholder) is text the walker cannot see: it is drawn by the control, not by a text node.
  for (const el of root.querySelectorAll("input:not([type=checkbox]):not([type=radio]), select")) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const empty = el.tagName === "INPUT" && !el.value;
    const colour = empty ? getComputedStyle(el, "::placeholder").color : cs.color;
    out.push({ text: empty ? `placeholder (${el.placeholder || ""})`.slice(0, 24) : "value", color: colour, size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10), x: r.x + scrollX + 12, y: r.y + scrollY + r.height * 0.3, w: Math.max(4, r.width - 40), h: r.height * 0.4 });
  }
  return out;
};
const boxFn = (e) => { const r = e.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; };

// ---- pixels ---------------------------------------------------------------------------
const parseRgb = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).map(Number); return { rgb: p.slice(0, 3), a: p[3] ?? 1 }; };
const median = (a) => { const t = [...a].sort((x, y) => x - y); return t[t.length >> 1]; };
async function decode(buf) { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; }
/** Fraction of pixels that moved by more than `t` in any channel. Two crops of different sizes are entirely different. */
function diffFrac(a, b, t = 8) {
  if (a.w !== b.w || a.h !== b.h) return 1;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - b.data[i]) > t || Math.abs(a.data[i + 1] - b.data[i + 1]) > t || Math.abs(a.data[i + 2] - b.data[i + 2]) > t) n++;
  return n / (a.w * a.h);
}
/** Median colour of a rect of a decoded image, in two bands (upper half, lower half): a plate is a gradient. */
function bands(img, rect, origin) {
  const x0 = Math.max(0, Math.floor(rect.x - origin.x)), x1 = Math.min(img.w, Math.ceil(rect.x + rect.w - origin.x));
  const y0 = Math.max(0, Math.floor(rect.y - origin.y)), y1 = Math.min(img.h, Math.ceil(rect.y + rect.h - origin.y));
  const ym = (y0 + y1) >> 1;
  const sample = (ya, yb) => {
    const R = [], G = [], B = [];
    for (let y = ya; y < yb; y++) for (let x = x0; x < x1; x++) { const i = (y * img.w + x) * 4; R.push(img.data[i]); G.push(img.data[i + 1]); B.push(img.data[i + 2]); }
    return R.length ? [median(R), median(G), median(B)] : null;
  };
  return [sample(y0, Math.max(y0 + 1, ym)), sample(ym, Math.max(ym + 1, y1))].filter(Boolean);
}

// ---- the page --------------------------------------------------------------------------
const cellHtml = (id, html) => `<div class="lab-cell" data-lab="${id}"><div data-root>${html}</div><div class="lab-id">${id}</div></div>`;
const bodyHtml = `
  <div class="lab-h">CONTROLS</div><div class="lab-row" id="controls">${CONTROLS.map(([id, h]) => cellHtml(id, h)).join("")}</div>
  <div class="lab-h">PLATES</div><div class="lab-row" id="statics">${STATICS.map(([id, h]) => cellHtml(id, h)).join("")}</div>`;
const pageHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${inlineFonts(fontCss)}</style><style>${CSS}</style><style>${LAB_CSS}</style></head><body>${bodyHtml}</body></html>`;

const browser = await chromium.launch({ ...launchOptions() });
async function openLab(dsf) {
  const ctx = await browser.newContext({ viewport: { width: 1320, height: 1000 }, deviceScaleFactor: dsf });
  const pg = await ctx.newPage();
  await pg.setContent(pageHtml, { waitUntil: "load" });
  await pg.evaluate(async () => { await Promise.all(["700 17px Cinzel", "800 17px Cinzel", "700 17px Alegreya", "400 17px Alegreya"].map((f) => document.fonts.load(f))); await document.fonts.ready; });
  await pg.waitForTimeout(300);
  return pg;
}
const page = await openLab(1);
const clipOf = (r, m) => ({ x: Math.max(0, r.x - m), y: Math.max(0, r.y - m), width: Math.ceil(r.w + 2 * m), height: Math.ceil(r.h + 2 * m) });
const shot = async (r, m = 8) => { const clip = clipOf(r, m); return { buf: await page.screenshot({ clip, fullPage: true }), clip }; };

/** Grade every piece of text under `root` against the plate behind it, in whatever state the page is in. */
async function gradeText(root, label, problems) {
  const r = await root.evaluate(boxFn);
  const probes = await root.evaluate(probesFn);
  await root.evaluate((e) => e.classList.add("hide-text"));
  const { buf, clip } = await shot(r, 0);
  await root.evaluate((e) => e.classList.remove("hide-text"));
  const img = await decode(buf);
  let worst = Infinity, worstText = "";
  for (const p of probes) {
    const fg = parseRgb(p.color);
    if (!fg) continue;
    if (fg.a < 0.99) { problems.push(`${label}: "${p.text}" is set in a translucent colour (${p.color})`); continue; }
    const large = p.size >= 24 || (p.size >= 18.66 && p.weight >= 700);
    const floor = large ? 3 : 4.5;
    for (const bg of bands(img, p, { x: clip.x, y: clip.y })) {
      const c = contrast(fg.rgb, bg);
      if (c < worst) { worst = c; worstText = p.text; }
      if (c < floor) problems.push(`${label}: "${p.text}" ${p.size}px is ${c.toFixed(2)}:1 on its plate, floor ${floor}`);
    }
  }
  return { worst, worstText, count: probes.length };
}

const shapeProblems = (f, label, allow = {}) => {
  const out = [];
  if (!allow.radius && !f.radii.every((v) => v === "0px")) out.push(`${label}: border-radius ${f.radii.join(" ")}`);
  if (allow.radius && !f.radii.every((v) => v === allow.radius)) out.push(`${label}: border-radius ${f.radii.join(" ")}, allowed ${allow.radius}`);
  if (!allow.noClip && !(f.clip.startsWith("polygon(") && f.clip.slice(8, -1).split(/,(?![^(]*\))/).length >= 8)) out.push(`${label}: no eight-vertex clip-path polygon (${f.clip.slice(0, 30)})`);
  if (f.backdrop !== "none") out.push(`${label}: backdrop-filter ${f.backdrop}`);
  if (f.opacity !== "1") out.push(`${label}: opacity ${f.opacity}`);
  if (f.textShadow !== "none") out.push(`${label}: text-shadow ${f.textShadow.slice(0, 40)}`);
  const blur = (f.boxShadow || "none").split(/,(?![^(]*\))/).some((l) => { const n = l.replace(/rgba?\([^)]*\)/g, " ").replace(/\binset\b/, " ").trim().split(/\s+/).map(parseFloat).filter((x) => !Number.isNaN(x)); return n.length >= 3 && n[2] > 0; });
  if (blur) out.push(`${label}: blurred box-shadow ${f.boxShadow.slice(0, 50)}`);
  return out;
};

const shapeIssues = [], stateIssues = [], legibility = [], targets = [], sheetRows = [];
let stateChecks = 0, textChecks = 0, textProbes = 0, worstText = { c: Infinity, where: "" }, liftDiff = 0;
const noteWorst = (g, where) => { textChecks++; textProbes += g.count; if (g.worst < worstText.c) worstText = { c: g.worst, where: `${where} "${g.worstText}"` }; };
const THRESH = 0.004; // a state must move at least 0.4% of the crop's pixels by more than 8 levels
const diffLog = [];

await page.keyboard.press("Shift+Tab"); // enter keyboard modality, so a programmatic focus() matches :focus-visible

for (const [id, , states] of CONTROLS) {
  const root = page.locator(`[data-lab="${id}"] [data-root]`);
  const subject = root.locator("[data-subject]");
  const rr = await root.evaluate(boxFn);
  const rest = await shot(rr);
  const restImg = await decode(rest.buf);
  const cells = [{ name: "rest", buf: rest.buf }];

  const restFacts = await subject.evaluate(factsFn);
  shapeIssues.push(...shapeProblems(restFacts, `${id}/rest`));
  if (Math.min(restFacts.w, restFacts.h) < 44) targets.push(`${id}: ${Math.round(restFacts.w)}x${Math.round(restFacts.h)}, under the 44px floor`);
  noteWorst(await gradeText(root, `${id}/rest`, legibility), `${id}/rest`);

  for (const st of states) {
    let ok = true;
    if (st === "hover") { await subject.hover(); await page.waitForTimeout(260); }
    else if (st === "active") { await subject.hover(); await page.mouse.down(); await page.waitForTimeout(260); }
    // A Tab first: after a pointer has been used, a script focus() no longer matches :focus-visible, and the ring is
    // what this state is for. A key press puts the page back in keyboard modality.
    else if (st === "focus") { await page.keyboard.press("Tab"); await subject.focus(); await page.waitForTimeout(260); }
    else if (st === "disabled") { await subject.evaluate((e) => { e.disabled = true; }); await page.waitForTimeout(260); }
    const f = await subject.evaluate(factsFn);
    if (st === "focus" && !f.focusVisible) { stateIssues.push(`${id}/focus: the harness could not raise :focus-visible, so this state was not measured`); ok = false; }
    if (ok) {
      const s = await shot(rr);
      const img = await decode(s.buf);
      const d = diffFrac(restImg, img);
      diffLog.push(`${id}/${st} ${(d * 100).toFixed(1)}%`);
      stateChecks++;
      if (d < THRESH) stateIssues.push(`${id}/${st}: looks the same as at rest (${(d * 100).toFixed(2)}% of pixels moved, floor ${(THRESH * 100).toFixed(1)}%)`);
      shapeIssues.push(...shapeProblems(f, `${id}/${st}`));
      noteWorst(await gradeText(root, `${id}/${st}`, legibility), `${id}/${st}`);
      cells.push({ name: st, buf: s.buf });
    }
    if (st === "active") await page.mouse.up();
    if (st === "focus") await subject.evaluate((e) => e.blur());
    if (st === "disabled") {
      // the same plate must be drawn when the control says so with aria-disabled instead (a control that has to stay focusable)
      if (id !== "input-frame") {
        await subject.evaluate((e) => { e.disabled = false; e.setAttribute("aria-disabled", "true"); });
        await page.waitForTimeout(260);
        const s2 = await shot(rr);
        const dis = cells.find((c) => c.name === "disabled");
        if (dis) {
          const same = diffFrac(await decode(dis.buf), await decode(s2.buf), 4);
          if (same > 0.003) stateIssues.push(`${id}: aria-disabled and disabled draw different plates (${(same * 100).toFixed(1)}% of pixels differ)`);
        }
        await subject.evaluate((e) => e.removeAttribute("aria-disabled"));
      } else await subject.evaluate((e) => { e.disabled = false; });
    }
    await page.mouse.move(2, 2);
    await page.waitForTimeout(120);
  }
  sheetRows.push({ id, cells });
}

// the static plates
const STATIC_SHAPE = {
  plate: [["[data-subject]", {}]], "plate-silver": [["[data-subject]", {}], ["[data-subject] .btn-primary", {}]], "plate-hud": [["[data-subject]", {}]],
  card: [["[data-subject]", {}]], "card-glow": [["[data-subject]", {}]], "card-noble": [["[data-subject]", {}]], "warcode-frame": [["[data-subject]", {}]],
  badges: [[".badge-sky", {}], [".badge-garnet", {}], [".badge-stone", {}]], kbd: [[".kbd", { radius: "2px", noClip: true }]],
  ornament: [[".plate", {}]],
  "plate-lift": [[".plate-silver", {}]],
  reason: [[".btn-primary", {}]],
};
for (const [id] of STATICS) {
  const root = page.locator(`[data-lab="${id}"] [data-root]`);
  for (const [sel, allow] of STATIC_SHAPE[id] ?? []) {
    const el = root.locator(sel).first();
    shapeIssues.push(...shapeProblems(await el.evaluate(factsFn), `${id} ${sel}`, allow));
  }
  noteWorst(await gradeText(root, `${id}`, legibility), id);
}

// LIFT IS A WRAPPER'S SHADOW. A shadow on the plate itself is clipped away by its own clip-path, so the hero plate's lift
// lives on a wrapper (`.plate-lift`). Prove it: the same specimen with and without the class must differ OUTSIDE the plate.
{
  const root = page.locator('[data-lab="plate-lift"] [data-root]');
  const rr = await root.evaluate(boxFn);
  const withLift = await decode((await shot(rr, 24)).buf);
  await root.locator("[data-subject]").evaluate((e) => e.classList.remove("plate-lift"));
  const without = await decode((await shot(rr, 24)).buf);
  await root.locator("[data-subject]").evaluate((e) => e.classList.add("plate-lift"));
  const d = diffFrac(withLift, without, 4);
  liftDiff = d;
  if (d < 0.01) stateIssues.push(`plate-lift: a wrapper with the class draws the same pixels as one without (${(d * 100).toFixed(2)}%): the lift does not show`);
}

console.log(`  ${stateChecks} states driven (${diffLog.join(", ")})`);
if (stateIssues.length) { fail(`${stateIssues.length} state(s) do not show: hover, active, focus-visible and disabled must each look different on the glass`); stateIssues.slice(0, 12).forEach(note); }
else pass(`every control shows every one of its states: ${stateChecks} states, each moves at least ${(THRESH * 100).toFixed(1)}% of its pixels; the wrapper's lift moves ${(liftDiff * 100).toFixed(1)}% outside the plate`);
if (shapeIssues.length) { fail(`${shapeIssues.length} shape fault(s) on the rendered specimens`); shapeIssues.slice(0, 14).forEach(note); }
else pass("every rendered specimen, in every state, is cut (clip-path), square, unblurred, opaque and unshadowed");
if (legibility.length) { fail(`${legibility.length} piece(s) of type under the floor on the plate behind them`); legibility.slice(0, 40).forEach(note); }
else pass(`all ${textProbes} pieces of type in ${textChecks} renders clear 4.5:1 (3:1 large) against the median plate colour behind them, top and bottom half; worst ${worstText.c.toFixed(2)}:1 ("${worstText.where}")`);
if (targets.length) { fail(`${targets.length} control(s) under the 44px floor`); targets.forEach(note); }
else pass(`all ${CONTROLS.length} controls are at least 44px on their smaller side`);

// ---- proof sheets: what a person opens ---------------------------------------------------
mkdirSync(SHEET_DIR, { recursive: true });
async function montage(rows, file, cellCaption = true) {
  const pg = await (await browser.newContext({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 1 })).newPage();
  const html = `<body style="margin:0;padding:20px;background:#14100b;font:600 11px monospace;color:#8b8d8a;width:${1400 - 40}px">${rows.map((r) => `<div style="display:flex;align-items:flex-end;gap:14px;margin-bottom:10px"><div style="width:130px;flex:0 0 130px">${r.id}</div>${r.cells.map((c) => `<div><img src="data:image/png;base64,${c.buf.toString("base64")}" style="display:block">${cellCaption ? `<div style="text-align:center;margin-top:3px">${c.name}</div>` : ""}</div>`).join("")}</div>`).join("")}</body>`;
  await pg.setContent(html);
  await pg.waitForTimeout(150);
  await pg.screenshot({ path: resolve(SHEET_DIR, file), fullPage: true });
  await pg.context().close();
}
await montage(sheetRows, "controls.png");
// the static plates, at 2x
const page2 = await openLab(2);
await page2.locator("#statics").screenshot({ path: resolve(SHEET_DIR, "plates.png") });
await page2.context().close();
// the cut, at 4x: the corners a plate is judged by
const page4 = await openLab(4);
const corner = async (sel, which) => {
  const b = await page4.locator(sel).first().evaluate(boxFn);
  const W = 44, H = 34;
  const clip = which === "tl" ? { x: b.x - 4, y: b.y - 4, width: W, height: H } : { x: b.x + b.w - W + 4, y: b.y + b.h - H + 4, width: W, height: H };
  return page4.screenshot({ clip: { x: Math.max(0, clip.x), y: Math.max(0, clip.y), width: clip.width, height: clip.height }, fullPage: true });
};
const cornerCells = [];
for (const [name, sel, which] of [
  ["primary TL", '[data-lab="btn-primary"] [data-subject]', "tl"], ["primary BR", '[data-lab="btn-primary"] [data-subject]', "br"],
  ["ghost TL", '[data-lab="btn-ghost"] [data-subject]', "tl"], ["card TL", '[data-lab="card"] [data-subject]', "tl"],
  ["noble TL", '[data-lab="card-noble"] [data-subject]', "tl"], ["silver TL", '[data-lab="plate-silver"] [data-subject]', "tl"],
]) cornerCells.push({ name, buf: await corner(sel, which) });
await montage([{ id: "corners at 4x", cells: cornerCells }], "corners.png");
await page4.context().close();
await browser.close();
console.log(`  proof sheets: ${SHEET_DIR}/{controls,plates,corners}.png`);

finish("not measured: a real Windows forced-colors theme, any state that needs a server, and a call site that beats a plate with a utility (uishots runs the computed-style audit over the real screens)");

function finish(deferral) {
  console.log("");
  console.log(failures
    ? `[platecheck] ${failures} FAILED — ${CSS_LABEL}. ${deferral}`
    : `[platecheck] PASS — ${CSS_LABEL}. ${deferral}. ${rasteriserNote()}`);
  process.exit(failures ? 1 : 0);
}
