#!/usr/bin/env node
// ============================================================
// PALETTECHECK — is the palette the stylesheet CLAIMS to have the palette the
// player is actually served, and can a person read it?
//
//   node tools/palettecheck.mjs                 # this tree
//   node tools/palettecheck.mjs --root /tmp/x   # any other tree (a checkout, an export)
//
// No browser, no server, about a second. It reads `src/app/globals.css`, the
// compiled sheet under `.next/static/chunks` (when there is a fresh one) and the
// TSX, and answers four questions:
//
//   1. CONTRAST. Every word-carrying step of the ink ramp is at least 4.5:1 on
//      the three grounds it is set on: niello-raised (the plate), the hall (the
//      page), and the lit top of a card as `.card` still draws it. The last is
//      the one the old ramp failed: `--ink-faint` was 2.78:1 there and 3.90:1 on
//      the page, and 44 sites set words in it.
//   2. THE REMAP. Tailwind's default hues (amber, yellow, orange, purple,
//      emerald, sky, cyan, red) resolve to palette tokens, at every shade, IN THE
//      COMPILED SHEET. `@theme` compiles cleanly whether or not it took: put in
//      the wrong place, or given a value Tailwind does not parse, it leaves every
//      default hue in the build and says nothing (DESIGN-SYSTEM.md section 10:
//      "verify tokens in the compiled sheet, not the source"). So this reads the
//      built rules, and requires that EVERY hue class the source uses still has
//      one, because a remap that deletes utilities passes a "no raw hue" test by
//      having nothing left to test.
//   3. HOVER. Every `hover:` utility in the build sits inside
//      `@media (hover: hover) and (pointer: fine)`, and there are as many as the
//      source asks for. The first draft of the override compiled to ZERO of them.
//   4. MIRRORS. The three health-bar bases are the same three hexes in the DOM
//      (`--hp-*`) and in the 3D nameplate (`hud3d.ts`). Before this file no gate
//      compared them; a comment said they matched.
//
// SHOWN FAILING FIRST (docs/PROCESS.md R2), on the tree before F1:
//   git archive <F0 commit> | tar -x -C /tmp/pre ; node tools/palettecheck.mjs --root /tmp/pre
// It goes red on the ramp (2.78:1), on the missing palette tokens, on the absent
// `@theme`, and on the compiled sheet still carrying amber as oklch. The mirror
// check is the exception, correctly: on that tree the two DID match, so it is
// shown red by editing one side (see the F1 commit message).
//
// EVERY DEFERRAL RIDES THE VERDICT LINE (R4): a check that could not run says so
// in the last sentence, in words, and never as a quiet SKIP above a green line.
// ============================================================
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const rootFlag = argv.indexOf("--root");
const ROOT = rootFlag >= 0 && argv[rootFlag + 1] ? resolve(argv[rootFlag + 1]) : HERE;

let failures = 0;
const skipped = [];
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  PASS  ${m}`);
const note = (m) => console.log(`        ${m}`);
const skip = (what, why) => { skipped.push(what); console.log(`  SKIP  ${what} — ${why}`); };

const CSS_PATH = resolve(ROOT, "src/app/globals.css");
const HUD3D_PATH = resolve(ROOT, "src/game/client/render/hud3d.ts");
if (!existsSync(CSS_PATH)) { console.error(`[palettecheck] no ${CSS_PATH}`); process.exit(2); }
const raw = readFileSync(CSS_PATH, "utf8");

/** Comments out, newlines kept. (csscheck strips by hand for a reason; this file only needs the values.) */
const css = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

// ---------------------------------------------------------------- colour maths
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const unlin = (c) => { const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, v)) * 255); };
const parseHex = (h) => {
  let s = h.replace("#", "");
  if (s.length === 3 || s.length === 4) s = [...s].map((c) => c + c).join("");
  if (s.length !== 6 && s.length !== 8) return null;
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const toHex = ([r, g, b]) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
// oklab, for `color-mix(in oklab, ...)` (Bjorn Ottosson's matrices)
const toOk = ([r, g, b]) => {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const fromOk = ([L, a, b]) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), unlin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
};

/** Split on top-level commas (not inside parentheses). */
const splitTop = (s) => {
  const out = []; let d = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") d++; else if (ch === ")") d--;
    if (ch === "," && d === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
};

/**
 * A declared value -> an [r,g,b], following `var()` through `vars` and mixing
 * `color-mix(in oklab, A p%, B)`. Returns null for anything else (a keyword, a
 * gradient), which the callers treat as "cannot be judged", not as a pass.
 */
function resolveColour(expr, vars, depth = 0) {
  if (depth > 12 || expr == null) return null;
  const e = expr.trim().replace(/!important$/, "").trim();
  if (/^#[0-9a-f]{3,8}$/i.test(e)) return parseHex(e);
  const v = e.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);
  if (v) return resolveColour(vars.get(v[1]) ?? v[2], vars, depth + 1);
  const cm = e.match(/^color-mix\(\s*in\s+oklab\s*,(.*)\)$/i);
  if (cm) {
    const parts = splitTop(cm[1]);
    if (parts.length !== 2) return null;
    const pick = (p) => { const m = p.match(/^(.*?)\s*(\d+(?:\.\d+)?)%$/); return m ? { c: m[1], pct: parseFloat(m[2]) } : { c: p, pct: null }; };
    let A = pick(parts[0]), B = pick(parts[1]);
    if (A.pct == null && B.pct == null) { A.pct = 50; B.pct = 50; }
    else if (A.pct == null) A.pct = 100 - B.pct; else if (B.pct == null) B.pct = 100 - A.pct;
    const ca = resolveColour(A.c, vars, depth + 1), cb = resolveColour(B.c, vars, depth + 1);
    if (!ca || !cb) return null;
    const total = A.pct + B.pct, wa = A.pct / total, wb = B.pct / total;
    const oa = toOk(ca), ob = toOk(cb);
    return fromOk(oa.map((x, i) => x * wa + ob[i] * wb));
  }
  return null;
}

// ------------------------------------------------ the source's declared tokens
/** Every `--name: value;` in the stylesheet. FIRST declaration wins, which is the base :root and not a later media override. */
const declared = new Map();
for (const m of css.matchAll(/(--[a-zA-Z][\w-]*)\s*:\s*([^;{}]+);/g)) if (!declared.has(m[1])) declared.set(m[1], m[2].trim());

const REQUIRED = [
  "--hall", "--niello", "--niello-raised", "--niello-line", "--silver", "--silver-lit", "--silver-dim", "--pewter",
  "--blood", "--madder", "--woad-team",
  "--field-saxon", "--field-saxon-lit", "--field-norse", "--field-norse-lit", "--field-briton", "--field-briton-lit", "--field-pict", "--field-pict-lit",
  "--ink-bright", "--ink", "--ink-soft", "--ink-dim", "--ink-faint", "--ink-ghost",
  "--hp-healthy", "--hp-wounded", "--hp-critical", "--hp-critical-lit",
];
console.log(`[palettecheck] reading ${ROOT}`);
console.log("\n1. the palette exists");
{
  const missing = REQUIRED.filter((t) => !declared.has(t));
  if (missing.length) {
    fail(`${missing.length} of ${REQUIRED.length} palette tokens are not declared: ${missing.slice(0, 8).join(" ")}${missing.length > 8 ? " ..." : ""}`);
    note("UI-PLAN 1.2: `grep niello src/` found nothing before F1 — the thesis was adopted in text and never built");
  } else pass(`all ${REQUIRED.length} palette tokens are declared`);
}

// ------------------------------------------------------------------ contrast
console.log("\n2. contrast (WCAG ratio, sRGB)");
const vars0 = new Map(declared);
const hexOf = (t, fallback) => resolveColour(`var(${t})`, vars0) ?? (fallback ? parseHex(fallback) : null);
// The grounds. A missing token falls back to the plan's value so the ratios below are STILL PRINTED on a tree that has not
// got the palette — a red run that only said "token missing" would not show what the reader could not read.
const NIELLO_RAISED = hexOf("--niello-raised", "#1a191d");
const NIELLO = hexOf("--niello", "#111013");
let HALL = hexOf("--hall");
if (!HALL) {
  const m = css.match(/html\s*,\s*body\s*\{[^}]*?background:\s*(#[0-9a-fA-F]{6})/);
  HALL = m ? parseHex(m[1]) : parseHex("#14100b");
}
// The lit top of a card as `.card` draws it today: rgba(66,55,42,.74) laid over the hall. Named a LEGACY ground because
// F2 replaces the plate; until every panel has moved, any word can still land on one.
const CARD_TOP = [66, 55, 42].map((c, i) => Math.round(c * 0.74 + HALL[i] * 0.26));
note(`grounds: niello-raised ${toHex(NIELLO_RAISED)}   hall ${toHex(HALL)}   lit card top ${toHex(CARD_TOP)} (rgba(66,55,42,.74) over the hall)`);
const GROUNDS = [["niello-raised", NIELLO_RAISED], ["hall", HALL], ["card top", CARD_TOP]];

const gate = (title, tokens, grounds, min = 4.5) => {
  let bad = 0;
  const rows = [];
  for (const t of tokens) {
    const c = resolveColour(`var(${t})`, vars0);
    if (!c) { bad++; rows.push(`${t.padEnd(20)} (not declared)`); continue; }
    const cells = grounds.map(([n, g]) => { const r = contrast(c, g); if (r < min) bad++; return `${n} ${r.toFixed(2)}${r < min ? "*" : ""}`; });
    rows.push(`${t.padEnd(20)} ${toHex(c)}  ${cells.join("   ")}`);
  }
  (bad ? fail : pass)(`${title}: ${bad ? `${bad} reading(s) under ${min}:1 (marked *)` : `all at least ${min}:1`}`);
  rows.forEach(note);
};
gate("the ink ramp, on niello-raised, the hall and the lit card top", ["--ink-bright", "--ink", "--ink-soft", "--ink-dim", "--ink-faint"], GROUNDS);
gate("silver, as type on niello", ["--silver-lit", "--silver", "--silver-dim"], [["niello-raised", NIELLO_RAISED], ["niello", NIELLO], ["hall", HALL]]);
gate("the people's -lit step and blood text, as words on niello", ["--field-saxon-lit", "--field-norse-lit", "--field-briton-lit", "--field-pict-lit", "--hp-critical-lit", "--hp-wounded", "--hp-healthy"], [["niello-raised", NIELLO_RAISED], ["hall", HALL]]);
{
  const g = resolveColour("var(--ink-ghost)", vars0);
  if (g) note(`--ink-ghost ${toHex(g)} is ${contrast(g, NIELLO_RAISED).toFixed(2)}:1 on niello-raised, ${contrast(g, CARD_TOP).toFixed(2)}:1 on the card top: RULES AND TRACES ONLY, never a word (csscheck ratchets the sites that set text in it)`);
}

// ---------------------------------------------------------------- the remap
console.log("\n3. the framework hues resolve to palette tokens");
const HUES = ["amber", "yellow", "orange", "purple", "emerald", "sky", "cyan", "red"];
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
{
  // (a) In the SOURCE: a top-level `@theme` that defines every shade, each as a var() of a declared --ramp token.
  let depth = 0, themeAt = null, i = 0;
  const themeBodies = [];
  const re = /@theme\b[^{]*\{/g;
  let m;
  while ((m = re.exec(css))) {
    // depth of the '@theme' keyword = braces open before it
    let d = 0; for (let k = 0; k < m.index; k++) { if (css[k] === "{") d++; else if (css[k] === "}") d--; }
    let b = 1, k = m.index + m[0].length; const start = k;
    while (k < css.length && b > 0) { if (css[k] === "{") b++; else if (css[k] === "}") b--; k++; }
    themeBodies.push({ depth: d, body: css.slice(start, k - 1), inline: /@theme\s+inline/.test(m[0]) });
  }
  if (!themeBodies.length) fail("no @theme block in globals.css — Tailwind's default amber, yellow, orange, purple, emerald, sky, cyan and red are unmapped");
  else {
    const nested = themeBodies.filter((t) => t.depth !== 0);
    if (nested.length) fail(`${nested.length} @theme block(s) are NOT top level (inside a layer or a rule) — Tailwind ignores them without a word`);
    const defs = new Map();
    for (const t of themeBodies) for (const d of t.body.matchAll(/(--color-[a-z]+-\d+)\s*:\s*([^;]+);/g)) defs.set(d[1], d[2].trim());
    const missing = [], leaks = [];
    for (const h of HUES) for (const s of SHADES) {
      const name = `--color-${h}-${s}`, v = defs.get(name);
      if (v == null) { missing.push(name); continue; }
      const ref = v.match(/^var\((--[\w-]+)\)$/);
      if (!ref || !declared.has(ref[1])) leaks.push(`${name}: ${v}`);
      else if (!resolveColour(`var(${ref[1]})`, vars0)) leaks.push(`${name} -> ${ref[1]} does not resolve to a colour`);
    }
    if (missing.length) fail(`${missing.length} of ${HUES.length * SHADES.length} hue shades have no @theme entry (a shade left undefined makes its utility VANISH): ${missing.slice(0, 5).join(" ")}${missing.length > 5 ? " ..." : ""}`);
    if (leaks.length) fail(`${leaks.length} hue shade(s) are not a var() of a declared token: ${leaks.slice(0, 4).join(" | ")}`);
    if (!nested.length && !missing.length && !leaks.length) pass(`@theme is top level and maps all ${HUES.length * SHADES.length} hue shades (${HUES.join(", ")}) to declared palette ramp tokens`);
  }

  // (a2) The ramps themselves are made of TOKENS. Without this the remap check above could be passed by pointing
  // `--ramp-warm-300` at `#fcd34d` (Tailwind's amber, typed by hand): every hue class would still read var(--ramp-*), the build
  // would carry no raw colour in any hue RULE, and the game would be exactly as amber as before. So each ramp entry may contain
  // only var(--token) of a declared colour token and the syntax of a tint of two of them, and no colour literal of its own.
  const ramps = [...declared.entries()].filter(([k]) => k.startsWith("--ramp-"));
  const impure = [];
  for (const [name, value] of ramps) {
    const refs = [...value.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
    const rest = value.replace(/var\((--[\w-]+)\)/g, "").replace(/color-mix\(\s*in\s+oklab\s*,/g, "").replace(/[\d.]+%|[(),\s]/g, "");
    const badRef = refs.find((r) => r.startsWith("--ramp-") || !declared.has(r) || !resolveColour(`var(${r})`, vars0));
    if (rest || badRef || !refs.length) impure.push(`${name}: ${value}${badRef ? `  (${badRef} is not a palette token)` : ""}`);
  }
  if (!ramps.length) fail("no --ramp-* tokens are declared, so the @theme remap has nothing palette-shaped to point at");
  else if (impure.length) { fail(`${impure.length} of ${ramps.length} ramp entries are not made of palette tokens alone (a colour literal in a ramp is an amber that passes every other check here)`); impure.slice(0, 5).forEach(note); }
  else pass(`all ${ramps.length} ramp entries are built only from palette tokens (no colour literal, no raw hue)`);
}

// (b) In the COMPILED sheet.
const chunks = resolve(ROOT, ".next/static/chunks");
const cssFiles = existsSync(chunks) ? readdirSync(chunks).filter((f) => f.endsWith(".css")).map((f) => join(chunks, f)) : [];
let built = null;
if (!cssFiles.length) skip("the COMPILED-sheet checks (remap resolves, hover guard, resolved contrast)", "no built stylesheet under .next/static/chunks — run `npm run build`");
else if (Math.max(...cssFiles.map((f) => statSync(f).mtimeMs)) < statSync(CSS_PATH).mtimeMs) skip("the COMPILED-sheet checks (remap resolves, hover guard, resolved contrast)", "the built stylesheet is older than globals.css — the build is stale");
else built = cssFiles.map((f) => readFileSync(f, "utf8")).join("\n");

/** Walk a (minified) stylesheet, calling `leaf(selector, body, atStack)` for every declaration block. */
function walk(text, leaf, stack = []) {
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open < 0) break;
    const head = text.slice(i, open).trim().replace(/^.*;/s, "").trim();
    let d = 1, k = open + 1;
    while (k < text.length && d > 0) { if (text[k] === "{") d++; else if (text[k] === "}") d--; k++; }
    const body = text.slice(open + 1, k - 1);
    if (head.startsWith("@")) {
      if (/@font-face|@keyframes|@property/.test(head)) { /* not rules we judge */ }
      else walk(body, leaf, [...stack, head]);
    } else if (head) leaf(head, body, stack);
    i = k;
  }
}

if (built) {
  const rules = [];
  walk(built, (sel, body, stack) => rules.push({ sel, body, stack }));
  // The compiled custom properties: every `--name: value` on any rule, LAST declaration wins here because the build's own order
  // is the cascade. RULES UNDER AN `@media` ARE LEFT OUT: `prefers-contrast: more` and `forced-colors` redeclare tokens, and a
  // reading taken through them would grade the special case and not the page everyone gets. (The first version of this read
  // them, and a lever pulled on `--ramp-warm-500` resolved to the contrast override's value and passed; see the F1 commit.)
  const cvars = new Map();
  for (const r of rules) {
    if (r.stack.some((a) => /^@media/.test(a))) continue;
    for (const d of r.body.matchAll(/(--[a-zA-Z][\w-]*):([^;}]+)/g)) cvars.set(d[1], d[2].trim());
  }

  // --- every hue class the SOURCE uses must still have a compiled rule, and no compiled hue rule may carry a raw colour
  const srcFiles = [];
  (function walkDir(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walkDir(p); else if (/\.(tsx?|jsx?)$/.test(e.name)) srcFiles.push(p);
    }
  })(resolve(ROOT, "src"));
  const HUE_RE = new RegExp(`(?<![\\w-])((?:text|bg|border|border-[trblxy]|from|to|via|ring|shadow|fill|stroke|decoration|outline|accent|divide|placeholder|caret)-(?:${HUES.join("|")})-\\d{2,3}(?:\\/\\d{1,3})?)(?![\\w-])`, "g");
  const used = new Set();
  for (const f of srcFiles) for (const m of readFileSync(f, "utf8").matchAll(HUE_RE)) used.add(m[1]);

  const hueSelector = new RegExp(`(?:^|[.,\\s\\\\!:])(?:text|bg|border|border-[trblxy]|from|to|via|ring|shadow|fill|stroke|decoration|outline|accent|divide|placeholder|caret)-(?:${HUES.join("|")})-\\d{2,3}(?![\\w-])`);
  const hueRules = rules.filter((r) => hueSelector.test(r.sel));
  const RAW = /#[0-9a-fA-F]{3,8}\b|\b(?:oklch|oklab|lab|lch|rgb|rgba|hsl|hsla)\(/;
  const COLOUR_PROPS = /(^|;)(color|background-color|border-color|border-[a-z]+-color|outline-color|accent-color|fill|stroke|text-decoration-color|caret-color|--tw-gradient-(?:from|to|via)|--tw-ring-color|--tw-shadow-color|--tw-inset-shadow-color|--tw-drop-shadow-color)\s*:([^;]+)/g;
  const raws = [];
  for (const r of hueRules) {
    for (const d of r.body.matchAll(COLOUR_PROPS)) {
      const value = d[3];
      if (RAW.test(value)) raws.push(`${r.sel.slice(0, 44)} { ${d[2]}:${value.trim().slice(0, 40)} }`);
    }
  }
  // "used" classes are matched against the selectors that ended up in the build
  // A class as the build writes it: the opacity slash is escaped in a selector (`.bg-amber-950\/40`).
  const has = (cls) => {
    const esc = cls.replace(/-/g, "\\-").replace(/\//g, "\\\\/");
    return hueRules.some((r) => new RegExp(`(?:^|[.,\\s\\\\!:])${esc}(?![\\w-]|\\\\/)`).test(r.sel));
  };
  const gone = [...used].filter((c) => !has(c));
  if (!used.size) fail("the source uses no hue classes at all — this check has nothing to read, which is not a pass");
  else if (gone.length) fail(`${gone.length} of ${used.size} hue classes the source uses have NO compiled rule (a shade left out of @theme makes its utility vanish): ${gone.slice(0, 6).join(" ")}`);
  else pass(`all ${used.size} distinct hue classes the source uses (${hueRules.length} compiled rules, every variant and opacity) are present in the build`);
  if (raws.length) {
    fail(`${raws.length} compiled hue rule(s) carry a raw colour literal (Tailwind's default oklch/hex) instead of a palette token`);
    raws.slice(0, 6).forEach(note);
  } else if (hueRules.length) pass(`no compiled hue rule carries a raw colour: every one reads var(--ramp-*)`);

  // --- they resolve to a colour, and the text steps are legible
  let unresolved = 0, checkedText = 0;
  const unresolvedList = [];
  const lowNiello = [], lowCard = [];
  for (const r of hueRules) {
    const m = r.sel.match(new RegExp(`(?:^|[.,\\s\\\\!])text-(${HUES.join("|")})-(\\d{2,3})(?![\\w-]|\\\\/)`));
    for (const d of r.body.matchAll(/(^|;)color\s*:([^;]+)/g)) {
      const c = resolveColour(d[2], cvars);
      if (!c) {
        // `color-mix(<token> N%, transparent)` is how an opacity modifier is written: alpha, not a colour to judge.
        if (!/^\s*color-mix\(in oklab,\s*var\(--ramp-[a-z]+-\d+\)\s*\d+%,\s*transparent\)\s*(!important)?\s*$/.test(d[2])) { unresolved++; unresolvedList.push(`${r.sel.slice(0, 40)} { color:${d[2].trim().slice(0, 60)} }`); }
        continue;
      }
      if (m && +m[2] <= 500 && !/\\\//.test(r.sel)) {
        checkedText++;
        const label = `text-${m[1]}-${m[2]} ${toHex(c)}`;
        if (contrast(c, NIELLO_RAISED) < 4.5 || contrast(c, HALL) < 4.5) lowNiello.push(`${label} (${contrast(c, NIELLO_RAISED).toFixed(2)} on niello-raised, ${contrast(c, HALL).toFixed(2)} on the hall)`);
        if (contrast(c, CARD_TOP) < 4.5) lowCard.push(label);
      }
    }
  }
  if (unresolved) { fail(`${unresolved} compiled hue colour(s) could not be resolved through the build's own custom properties`); unresolvedList.slice(0, 6).forEach(note); }
  if (checkedText === 0) fail("no compiled text-<hue>-50..500 rule could be resolved to a colour — the legibility check read nothing");
  else if (lowNiello.length) { fail(`${lowNiello.length} of ${checkedText} remapped text steps (50-500, resolved through the build) are under 4.5:1 on niello-raised or the hall`); lowNiello.slice(0, 6).forEach(note); }
  else pass(`all ${checkedText} remapped text steps (text-<hue>-50..500) resolve to a colour of at least 4.5:1 on niello-raised and on the hall`);
  if (checkedText) note(`REPORTED, NOT GATED: ${lowCard.length} of ${checkedText} of those are under 4.5:1 on the LEGACY lit card top${lowCard.length ? ` (${[...new Set(lowCard)].slice(0, 5).join(", ")})` : ""} — blood text is the plan's #d4634a, which is 5.1:1 on niello and 3.6:1 on the old brown`);

  // --- hover: every utility is behind the pointer query, and there are as many as the source asks for
  console.log("\n4. hover");
  const hoverSrc = new Set();
  for (const f of srcFiles) for (const m of readFileSync(f, "utf8").matchAll(/(?<![\w-])hover:(!?[a-z][\w\[\]#().\/%-]*)/g)) hoverSrc.add(m[1]);
  let guarded = 0, bare = [];
  const hoverClass = /\.hover\\:/;
  for (const r of rules) {
    if (!hoverClass.test(r.sel)) continue;
    const ok = r.stack.some((a) => /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/.test(a));
    if (ok) guarded++; else bare.push(`${r.sel.slice(0, 50)}  in ${r.stack.join(" > ") || "the top level"}`);
  }
  if (!hoverSrc.size) fail("the source uses no `hover:` utilities — nothing to read");
  else if (guarded === 0 && bare.length === 0) fail(`the build has NO \`.hover\\:\` rules at all, and the source uses ${hoverSrc.size}. A hover override that matches nothing deletes them all without an error`);
  else if (guarded === 0) fail(`none of the ${bare.length} \`hover:\` rules in the build is inside @media (hover:hover) and (pointer:fine)`);
  else if (guarded < hoverSrc.size) fail(`${guarded} guarded hover rules for ${hoverSrc.size} distinct \`hover:\` utilities in the source — some are missing`);
  else pass(`${guarded} \`hover:\` rules in the build for ${hoverSrc.size} distinct utilities in the source, every one inside @media (hover:hover) and (pointer:fine)`);
  if (bare.length) { fail(`${bare.length} \`hover:\` rule(s) sit OUTSIDE the pointer query, so a tap leaves them stuck on`); bare.slice(0, 4).forEach(note); }
  // the hand-written ones
  const stuck = [];
  for (const r of rules) {
    if (/\.hover\\:/.test(r.sel) || !/:hover/.test(r.sel)) continue;
    if (!r.stack.some((a) => /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/.test(a))) stuck.push(r.sel.slice(0, 60));
  }
  if (stuck.length) { fail(`${stuck.length} hand-written :hover rule(s) in the build are not behind (hover:hover) and (pointer:fine)`); stuck.slice(0, 6).forEach(note); }
  else pass("every hand-written :hover rule in the build is behind (hover:hover) and (pointer:fine)");
} else {
  console.log("\n4. hover");
  skip("the hover-guard check", "it reads the compiled sheet");
}

// ------------------------------------------------------------------ mirrors
console.log(`\n${built ? "5" : "5"}. mirrors: the DOM health bar and the 3D nameplate`);
{
  if (!existsSync(HUD3D_PATH)) skip("the hp mirror", `no ${HUD3D_PATH}`);
  else {
    const src = readFileSync(HUD3D_PATH, "utf8");
    const pairs = [["--hp-healthy", "FILL_HEALTHY"], ["--hp-wounded", "FILL_WOUNDED"], ["--hp-critical", "FILL_CRITICAL"]];
    let bad = 0;
    for (const [tok, cname] of pairs) {
      const m = src.match(new RegExp(`const\\s+${cname}\\s*=\\s*radiance\\(\\s*0x([0-9a-fA-F]{6})`));
      const t = resolveColour(`var(${tok})`, vars0);
      if (!m) { bad++; fail(`hud3d.ts has no \`${cname} = radiance(0x......\` — the mirror cannot be read`); continue; }
      if (!t) { bad++; fail(`${tok} is not a colour in globals.css`); continue; }
      const same = toHex(t).toLowerCase() === `#${m[1].toLowerCase()}`;
      if (!same) { bad++; fail(`${tok} is ${toHex(t)} but hud3d.ts ${cname} is #${m[1].toLowerCase()} — one health bar, two answers`); }
    }
    if (!bad) pass("--hp-healthy / --hp-wounded / --hp-critical are the same three hexes as hud3d.ts FILL_HEALTHY / FILL_WOUNDED / FILL_CRITICAL");
  }
}

console.log("");
const tail = skipped.length ? ` — WITH ${skipped.length} check(s) NOT RUN (${skipped.join("; ")}), which is a deferral and not a clean sheet` : "";
console.log(failures ? `[palettecheck] ${failures} FAILED${tail}`
  : skipped.length ? `[palettecheck] the palette SOURCE is built and legible; the build was not read${tail}`
  : `[palettecheck] the palette is built, legible, and is what the build serves`);
process.exit(failures ? 1 : 0);
