#!/usr/bin/env node
// ============================================================
// CSSCHECK — does globals.css actually parse, and does every
// rule in it survive into the build?
//
//   node tools/csscheck.mjs
//
// WHY THIS EXISTS.
//
// A comment in globals.css was once closed early, leaving six lines of
// English prose sitting in the stylesheet as though they were a selector:
//
//     .rail-grid { ... }
//        64rem and not the 62rem `.faction-map` uses, because ...
//        player with a 1000px window would sit in. */
//     @media (min-width: 64rem) { .rail-grid { ... } }
//
// `npm run build` EXITED 0. `tsc --noEmit` exited 0. `npm run lint` exited 0.
// The CSS parser did what CSS parsers are specified to do — skipped the
// malformed run and everything it swallowed — and the desktop two-column
// layout silently never shipped. The only thing in the whole gate that noticed
// was a human looking at a screenshot.
//
// That is the project's signature failure wearing a new coat: the build is
// green and the output is wrong. Every other instance of it got a ruler, so
// this one gets a ruler.
//
// TWO CHECKS, and the second is the one that matters:
//   1. The source parses — braces balance, comments close, no stray text
//      between rules.
//   2. Every selector the source declares is PRESENT IN THE BUILT CSS. A rule
//      that parses but is dropped downstream is the same defect with a
//      different cause, and only comparing the two ends can see it.
// ============================================================
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { pageSource, pageFiles } from "./lib/pagesrc.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "src/app/globals.css");

let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL  ${msg}`); };
const pass = (msg) => console.log(`  PASS  ${msg}`);

const css = readFileSync(SRC, "utf8");

// ---- 1. strip comments, and refuse an unterminated one ----------------------
// Done by hand rather than with a regex because the failure being caught IS a
// comment-termination bug, and `/\/\*[\s\S]*?\*\//g` cannot tell an unclosed
// comment from a closed one — it just runs to the next `*/` it finds, which is
// exactly the wrong answer and exactly what happened.
let stripped = "";
let i = 0;
let openedAt = -1;
while (i < css.length) {
  if (css[i] === "/" && css[i + 1] === "*") {
    openedAt = i;
    const end = css.indexOf("*/", i + 2);
    if (end === -1) {
      fail(`unterminated comment opened at byte ${openedAt} (line ${css.slice(0, openedAt).split("\n").length})`);
      break;
    }
    // Keep the newlines so reported line numbers stay true to the file.
    stripped += css.slice(i, end + 2).replace(/[^\n]/g, " ");
    i = end + 2;
    continue;
  }
  stripped += css[i];
  i++;
}

// A `*/` with no `/*` in front of it is the actual shape of the bug: prose that
// was meant to be inside the comment above it, ending in a close nobody opened.
{
  let depth = 0, bad = 0;
  for (let k = 0; k < css.length - 1; k++) {
    if (css[k] === "/" && css[k + 1] === "*") { depth++; k++; }
    else if (css[k] === "*" && css[k + 1] === "/") {
      if (depth === 0) { bad++; console.log(`        stray '*/' on line ${css.slice(0, k).split("\n").length}`); }
      else depth--;
      k++;
    }
  }
  if (bad) fail(`${bad} '*/' with no comment open — text before it is being parsed as CSS`);
  else pass("every comment opens and closes");
}

// ---- 2. braces balance ------------------------------------------------------
{
  let depth = 0, minDepth = 0;
  for (const ch of stripped) {
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; minDepth = Math.min(minDepth, depth); }
  }
  if (depth !== 0) fail(`braces do not balance — ${depth > 0 ? `${depth} unclosed` : `${-depth} extra '}'`}`);
  else if (minDepth < 0) fail("a '}' appears before its '{'");
  else pass("braces balance");
}

// ---- 3. nothing but rules between rules -------------------------------------
// After a `}` or the start of a block, the next thing must be a selector, an
// at-rule, a declaration or another `}`. Prose is none of those, and the tell
// is a run of text with no `{`, `}`, `:` or `;` terminating it.
{
  const strays = [];
  // Walk top level and one level in; that is where the failure lives and going
  // deeper would need a real parser for no extra catch.
  const lines = stripped.split("\n");
  let depth = 0;
  lines.forEach((raw, n) => {
    const line = raw.trim();
    const before = depth;
    for (const ch of raw) { if (ch === "{") depth++; else if (ch === "}") depth--; }
    if (!line) return;
    // A line that declares or opens something is fine.
    if (/[{};:@]/.test(line)) return;
    // A bare selector continued onto the next line (`.a,` / `.a`) is fine.
    if (/[,>+~]$/.test(line)) return;
    if (/^[.#&*\[a-zA-Z:)-]/.test(line) && lines[n + 1]?.trim().startsWith("{")) return;
    strays.push(`line ${n + 1} (depth ${before}): ${line.slice(0, 72)}`);
  });
  if (strays.length) {
    fail(`${strays.length} line(s) of text sitting between rules, which CSS will discard along with what follows`);
    strays.slice(0, 8).forEach((s) => console.log(`        ${s}`));
  } else pass("no stray text between rules");
}

// ---- 4. the built CSS still contains every class the source declares --------
// The check that would have caught the original bug on its own. Parsing is a
// proxy; surviving the build is the thing actually wanted.
{
  // `.next/static/chunks`, not `.next/static/css`: Turbopack emits the app's
  // stylesheet as a chunk beside the JS. `.next/dev/**` is deliberately not
  // searched — a dev build is compiled per request and would let a stale or
  // half-written file answer for the real one.
  const out = resolve(ROOT, ".next/static/chunks");
  const cssFiles = existsSync(out)
    ? readdirSync(out).filter((f) => f.endsWith(".css")).map((f) => join(out, f))
    : [];
  if (!cssFiles.length) {
    console.log("  SKIP  no built stylesheet under .next/static/chunks — run `npm run build` first");
  } else {
    const built = cssFiles.map((f) => readFileSync(f, "utf8")).join("\n");
    const newest = Math.max(...cssFiles.map((f) => statSync(f).mtimeMs));
    const stale = newest < statSync(SRC).mtimeMs;
    if (stale) {
      console.log("  SKIP  the built stylesheet is older than globals.css — build is stale, not checking it");
    } else {
      // COUNTED, NOT MERELY PRESENT — and this is the whole difference between
      // a check that works and one that reads as though it does.
      //
      // The first cut asked "does `.rail-grid` appear in the build?" and PASSED
      // against the very bug it was written for. `.rail-grid` is declared
      // twice: a base rule that sets one column, then an `@media (min-width:
      // 64rem)` rule that makes it two. The stray prose sat between them, so
      // the base rule survived and the media rule was swallowed — the class was
      // still "present", the desktop layout still never shipped, and a
      // presence test cannot tell those apart. Verified directly against the
      // broken build: one `.rail-grid` block, and the only surviving 64rem
      // media query belonged to a different class.
      //
      // So every class is counted at both ends. A class declared twice must
      // arrive twice.
      // `}` and `;` are in the lookbehind, and leaving them out is not a
      // detail. Source CSS is written `\n  .card {`, but the BUILT file is
      // minified to `}.card{` — so a class set that excluded `}` matched
      // almost nothing on the build side and reported most of the stylesheet
      // missing on a perfectly good build. A checker that cries wolf on a
      // green build gets muted, and then it is worth less than nothing.
      const count = (text) => {
        const m = new Map();
        for (const hit of text.matchAll(/(^|[\s,>+~({};])\.([a-zA-Z][\w-]*)/g)) {
          m.set(hit[2], (m.get(hit[2]) ?? 0) + 1);
        }
        return m;
      };
      const src = count(stripped);
      const dst = count(built);
      // `>=` and not `===`: the build legitimately duplicates a selector when
      // it splits a rule across layers or vendor-prefixes one, and the failure
      // this tool exists for is always a rule going MISSING.
      const short = [...src.entries()].filter(([c, n]) => (dst.get(c) ?? 0) < n);
      if (short.length) {
        fail(`${short.length} class(es) reach the build with fewer rules than globals.css declares — a rule was dropped`);
        short.slice(0, 20).forEach(([c, n]) => console.log(`        .${c} — declared ${n}x, built ${dst.get(c) ?? 0}x`));
      } else {
        pass(`all ${src.size} classes reach the build with every rule declared for them`);
      }
    }
  }
}

// ---- 5. every var(--x) resolves to a declaration of --x --------------------
//
// A CSS custom property that does not resolve DOES NOT THROW. It does not warn,
// it does not fall back to anything visible, and the build succeeds. The rule
// simply does nothing, forever, silently — which is the exact failure mode this
// whole file exists for.
//
// WRITTEN BECAUSE SOMEBODY ELSE HIT IT. The Bretwalda design system delivered on
// 12 Aug 2026 declared a grain overlay on `var(--noise-url)` in both Panel and
// Dialog. The token had been renamed `--grain-url` during a pivot and the two
// components were never updated, so the system's own material law — the grain
// that every panel and every dialog is supposed to carry — failed on every
// panel and every dialog, in a bundle that was typechecked and render-proved.
// Nothing caught it because nothing can: there is no error to catch.
//
// That is the same shape as this repository's own recorded faults — the
// malformed comment that silently discarded a media query, and four mirrored
// definitions where editing one constant moved nothing. The lesson each time is
// that a thing which fails by doing nothing needs a ruler that counts.
//
// Scoped to what the source declares rather than to the built CSS, because the
// build inlines third-party and framework properties this file has no business
// ruling on. `--tw-*` is Tailwind's own machinery and is exempt by prefix.
{
  const declared = new Set();
  for (const hit of stripped.matchAll(/(--[a-zA-Z][\w-]*)\s*:/g)) declared.add(hit[1]);
  // `next/font` DECLARES CUSTOM PROPERTIES TOO. `layout.tsx` passes
  // `variable: "--font-display"` to the font loader, which emits a class
  // carrying that declaration and puts it on <html> — a real declaration this
  // ruler cannot see in the CSS source. Without this scan the check failed on
  // `--font-display`/`--font-body` the day the fonts moved to `next/font`,
  // and the "fix" it invited — fallback declarations in `:root` — would race
  // the loader's own class on specificity and could beat the REAL font. Read
  // the declaration where it is actually made.
  const layout = resolve(ROOT, "src/app/layout.tsx");
  if (existsSync(layout)) {
    for (const hit of readFileSync(layout, "utf8").matchAll(/variable:\s*["'](--[a-zA-Z][\w-]*)["']/g)) {
      declared.add(hit[1]);
    }
  }
  const used = new Map();
  for (const hit of stripped.matchAll(/var\(\s*(--[a-zA-Z][\w-]*)/g)) {
    used.set(hit[1], (used.get(hit[1]) ?? 0) + 1);
  }
  const orphan = [...used.keys()]
    .filter((v) => !declared.has(v) && !v.startsWith("--tw-"));
  if (orphan.length) {
    fail(`${orphan.length} custom propert(ies) are read by var() and never declared — those rules silently do nothing`);
    orphan.slice(0, 20).forEach((v) => console.log(`        var(${v}) — read ${used.get(v)}x, declared 0x`));
  } else {
    pass(`all ${used.size} custom properties read by var() are declared somewhere in the source`);
  }
}

// ---------------------------------------------------------------------------
// CHECK 6 — the palette stays in the palette.
//
// This one is a RATCHET and not a bar. `docs/DESIGN-SYSTEM.md` describes a
// token system that the interface did not use: counted across the two largest
// UI files, 178 raw hex literals against 3 var() reads. Check 5 above cannot
// see any of that — it catches a var() with no declaration, which is the
// opposite fault, and a hardcoded colour is invisible to it by construction.
//
// Most of those 178 were not indiscipline. 133 were six values that had never
// been DECLARED — the type ramp that carries nearly every word in the
// interface had no name, so a literal was the only thing anybody could write.
// They are `--ink-bright` through `--ink-ghost` now and the files read them.
//
// What is left is genuinely un-tokenised: one-off accents that earn a literal.
// So the rule is not "zero", which would be a lie that invites suppression —
// it is "no more than there are today". A new literal is either a colour that
// belongs to the ramp, in which case use the ramp, or a new one worth naming,
// in which case name it and raise this number in the same commit.
{
  // Today's counts, taken after the ramp landed: 178 -> 28 across the two.
  const CEILING = { "src/app/page.tsx": 15, "src/game/client/GameHud.tsx": 7 };
  for (const [rel, ceiling] of Object.entries(CEILING)) {
    const file = resolve(ROOT, rel);
    if (!existsSync(file)) continue;
    // "THE PAGE" IS NOT ONE FILE ANY MORE. The F0 scaffold carved the screen components out of
    // `src/app/page.tsx` into `src/app/ui/*` (and reserved `src/app/glyphs/*`). Counted on the
    // one file alone this ratchet read 7 against a ceiling of 15 the moment the carve landed:
    // eight literals had not been tokenised, they had moved next door, and a ceiling with eight
    // spare is a ceiling that lets eight new ones in. So the page's key counts the page family.
    const isPage = rel === "src/app/page.tsx";
    const src = isPage ? pageSource(ROOT) : readFileSync(file, "utf8");
    const label = isPage ? `${rel} (+ src/app/ui, src/app/glyphs)` : rel;
    const hex = [...src.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]);
    // A literal that IS a declared token is always wrong: that is the one this
    // ratchet can name a fix for, so it is reported separately and never
    // allowed, whatever the ceiling.
    const named = new Map();
    for (const m of css.matchAll(/(--[a-z][\w-]*):\s*(#[0-9a-fA-F]{6})\b/g)) named.set(m[2].toLowerCase(), m[1]);
    const spelled = hex.filter((h) => named.has(h.toLowerCase()));
    if (spelled.length) {
      fail(`${label}: ${spelled.length} literal(s) spell out a colour that already has a token`);
      [...new Set(spelled)].slice(0, 8).forEach((h) => console.log(`        ${h} is var(${named.get(h.toLowerCase())})`));
    } else if (hex.length > ceiling) {
      fail(`${label}: ${hex.length} raw hex literals, ceiling ${ceiling} — tokenise it, or name the new colour and raise the ceiling here`);
      [...new Set(hex)].slice(0, 8).forEach((h) => console.log(`        ${h}`));
    } else {
      pass(`${label}: ${hex.length} raw hex literals, ceiling ${ceiling}, none of them a colour that has a name`);
    }
  }
}

// ---------------------------------------------------------------------------
// CHECKS 7-12 — THE UI OVERHAUL'S RATCHETS (F1, 29 Sep 2026).
//
// UI-PLAN section 2 counted the faults the overhaul exists to remove, and every
// one of them is a THING THAT CAN BE TYPED AGAIN the day after it is fixed: an
// 8px label, an amber utility, a system monospace, a hardcoded family name. A
// ratchet is the right instrument for that, and the same argument as check 6
// applies: "zero" would be a lie that invites suppression (the remapped hue
// classes are sites to CONVERT one unit at a time, not to delete in one commit),
// so each ceiling is MEASURED ON THE TREE THE RATCHET LANDED ON and can only go
// down. A unit that removes sites lowers its number in the same commit, which is
// what makes the number a record of the work and not a wish.
//
// Every count is taken from CODE, with comments stripped: three of these
// patterns are also things the source explains in prose ("this grid used to be
// `text-yellow-400`"), and a ratchet that counts its own documentation punishes
// the people who wrote it.
// ---------------------------------------------------------------------------
{
  /** Strip `/* *\/` and `//` comments from TS/TSX, leaving strings alone. */
  const stripTs = (text) => {
    let out = "", i = 0, q = null;
    while (i < text.length) {
      const c = text[i], n = text[i + 1];
      if (q) {
        out += c;
        if (c === "\\") { out += text[i + 1] ?? ""; i += 2; continue; }
        if (c === q) q = null;
        i++;
        continue;
      }
      if (c === "/" && n === "*") { const e = text.indexOf("*/", i + 2); const end = e < 0 ? text.length : e + 2; out += text.slice(i, end).replace(/[^\n]/g, " "); i = end; continue; }
      // `//` starts a comment only when it is not the tail of a `://` URL scheme or the middle of a JSX text run
      if (c === "/" && n === "/" && text[i - 1] !== ":") { const e = text.indexOf("\n", i); const end = e < 0 ? text.length : e; out += " ".repeat(end - i); i = end; continue; }
      if (c === '"' || c === "'" || c === "`") q = c;
      out += c;
      i++;
    }
    return out;
  };
  const walkSrc = (dir, acc = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walkSrc(p, acc);
      else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
    }
    return acc;
  };
  const srcRoot = resolve(ROOT, "src");
  const rel = (f) => f.slice(ROOT.length + 1);
  const files = existsSync(srcRoot) ? walkSrc(srcRoot).map((f) => ({ file: rel(f), code: stripTs(readFileSync(f, "utf8")) })) : [];
  const pageFamily = new Set(pageFiles(ROOT));
  const group = (f) => (pageFamily.has(f) ? "page" : f === "src/game/client/GameHud.tsx" ? "hud" : "rest");

  const report = (ok, msg, detail = []) => {
    (ok ? pass : fail)(msg);
    if (!ok) detail.slice(0, 8).forEach((d) => console.log(`        ${d}`));
  };

  // ---- 7. the type floor -----------------------------------------------------
  // `text-[9px]`, `text-[0.6rem]`: an arbitrary size under the floor. The floor is 12px in the menus and 11px in the fight HUD
  // (UI-PLAN 1.5: "Never below"). Counted by file group because the two floors differ.
  {
    const CEILING = { page: 95, hud: 38, rest: 5 };
    const FLOOR = { page: 12, hud: 11, rest: 12 };
    const NAME = { page: "the page family (page.tsx + ui/ + glyphs/), under 12px", hud: "GameHud.tsx, under 11px", rest: "every other .tsx under src/, under 12px" };
    const hits = { page: [], hud: [], rest: [] };
    for (const { file, code } of files) {
      const g = group(file);
      for (const m of code.matchAll(/text-\[(\d*\.?\d+)(px|rem)\]/g)) {
        const px = m[2] === "rem" ? parseFloat(m[1]) * 16 : parseFloat(m[1]);
        if (px < FLOOR[g]) hits[g].push(`${file}: text-[${m[1]}${m[2]}]`);
      }
    }
    for (const g of ["page", "hud", "rest"]) {
      report(hits[g].length <= CEILING[g], `type floor, ${NAME[g]}: ${hits[g].length}, ceiling ${CEILING[g]}${hits[g].length > CEILING[g] ? " — a size under the floor was added; use the scale (.t-label is 12px) or raise the ceiling with the reason" : ""}`, hits[g].slice(-8));
    }
    // and the stylesheet's own sizes. 10 at F1; F2 re-sized `.label-overline`, `.section-title`, `.tab-item`, the three badges, `.rule-label` and
    // `.mini-nav` onto the 12px label step, which took seven of the ten out. Three remain and each belongs to a unit that has not landed:
    // `.round-hud` (9.5px, unit H), `.fm-row-seat` (10px) and `.fm-credit` (.7rem), both unit W's.
    const CSS_CEILING = 3;
    const small = [];
    for (const m of stripped.matchAll(/font-size:\s*(\d*\.?\d+)(px|rem)\b/g)) {
      const px = m[2] === "rem" ? parseFloat(m[1]) * 16 : parseFloat(m[1]);
      if (px < 12) small.push(`font-size: ${m[1]}${m[2]} on line ${stripped.slice(0, m.index).split("\n").length}`);
    }
    report(small.length <= CSS_CEILING, `type floor, globals.css font-size under 12px: ${small.length}, ceiling ${CSS_CEILING}`, small);
  }

  // ---- 8. the framework's hues -----------------------------------------------
  // Tailwind's amber, yellow, emerald, sky, purple, orange, red and cyan are not the game's colours. F1 remapped them onto the
  // palette (see @theme at the top of globals.css and tools/palettecheck.mjs), so the pixels are right; what is left is SITES
  // that name a hue the game does not have and should name a token. One ceiling PER HUE, not one total, so that a unit that
  // removes amber cannot spend the slack on red.
  {
    const HUES = ["amber", "yellow", "emerald", "sky", "purple", "orange", "red", "cyan"];
    const CEILING = { amber: 222, yellow: 10, emerald: 17, sky: 9, purple: 3, orange: 6, red: 28, cyan: 1 };
    const re = new RegExp(`(?<![\\w-])(?:text|bg|border|border-[trblxy]|from|to|via|ring|shadow|fill|stroke|decoration|outline|accent|divide|placeholder|caret)-(${HUES.join("|")})-\\d{2,3}(?:/\\d{1,3})?(?![\\w-])`, "g");
    const n = Object.fromEntries(HUES.map((h) => [h, 0]));
    const where = new Map();
    for (const { file, code } of files) for (const m of code.matchAll(re)) { n[m[1]]++; where.set(file, (where.get(file) ?? 0) + 1); }
    const over = HUES.filter((h) => n[h] > CEILING[h]);
    const total = HUES.reduce((a, h) => a + n[h], 0);
    report(!over.length, `Tailwind hue classes (${total} sites; ${HUES.map((h) => `${h} ${n[h]}/${CEILING[h]}`).join(", ")})${over.length ? ` — over the ceiling: ${over.join(", ")}. Name a palette token instead (var(--ink-*), var(--silver-*), var(--hp-*)) or lower nothing and raise this with the reason` : ""}`,
      [...where.entries()].sort((a, b) => b[1] - a[1]).map(([f, c]) => `${c}  ${f}`));
  }

  // ---- 9. no system monospace ------------------------------------------------
  // `ui-monospace` is a different face on every device and none of them is Cinzel or Alegreya. The war code, keycaps and the
  // bench clock move to Alegreya/Cinzel (UI-PLAN 1.5); a figure that must not shiver is `tabular-nums`, not a monospace face.
  {
    const CSS_CEILING = 0, TS_CEILING = 9;
    const cssHits = [...stripped.matchAll(/monospace/g)].length;
    report(cssHits <= CSS_CEILING, `no system monospace in globals.css: ${cssHits}, ceiling ${CSS_CEILING}`);
    const tsHits = [];
    for (const { file, code } of files) for (const m of code.matchAll(/\bfont-mono\b|(?<![\w-])(?:ui-)?monospace\b/g)) tsHits.push(`${file}: ${m[0]}`);
    report(tsHits.length <= TS_CEILING, `no system monospace in the TSX: ${tsHits.length}, ceiling ${TS_CEILING}`, tsHits);
  }

  // ---- 10. literal family names live in layout.tsx and globals.css -----------
  // The two faces are `--font-display` and `--font-body`, declared once by next/font. A component that types "Cinzel" or
  // Georgia is a second definition of a font, the mirrored-definition fault this repo has recorded five times. What is left
  // are the three places that CANNOT read a CSS variable: the OG image (rendered on the server without a stylesheet), a canvas
  // (hud3d's nameplate text) and the dev capture page. Per file, so a new one is a failure and not a rounding error.
  {
    const ALLOW = { "src/app/opengraph-image.tsx": 4, "src/game/client/render/hud3d.ts": 1, "src/app/shot/page.tsx": 2 };
    // Whole string literals, so `"Cinzel, 'Trajan Pro', Georgia, serif"` is ONE site and not three fragments.
    const LITERAL = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
    const FAMILY = /\b(?:Cinzel|Alegreya|Georgia|Times New Roman|Trajan|Geist|Menlo|SFMono-Regular|Consolas|ui-monospace|system-ui|sans-serif|serif|monospace)\b/;
    const per = new Map();
    for (const { file, code } of files) {
      if (file === "src/app/layout.tsx") continue;
      for (const m of code.matchAll(LITERAL)) {
        if (!FAMILY.test(m[0])) continue;
        // A CSS-variable READ is not a literal family: `var(--font-display, inherit)` names none
        if (/^["'`]\s*var\(--font-(display|body)[^"'`]*["'`]$/.test(m[0])) continue;
        per.set(file, (per.get(file) ?? 0) + 1);
      }
    }
    const bad = [...per.entries()].filter(([f, c]) => c > (ALLOW[f] ?? 0));
    const total = [...per.values()].reduce((a, b) => a + b, 0);
    report(!bad.length, `literal font-family names outside layout.tsx and globals.css: ${total} in ${per.size} file(s) (${[...per.entries()].map(([f, c]) => `${f.split("/").pop()} ${c}/${ALLOW[f] ?? 0}`).join(", ") || "none"})`, bad.map(([f, c]) => `${f}: ${c}, allowed ${ALLOW[f] ?? 0}`));
  }

  // ---- 11. ghost ink is not a word -------------------------------------------
  // `--ink-ghost` is 2.3:1: rules and traces only (see :root). Words set in it cannot be read.
  {
    const CEILING = 3;
    const hits = [];
    for (const { file, code } of files) for (const m of code.matchAll(/text-\[var\(--ink-ghost\)\]|color:\s*["'`]?var\(--ink-ghost\)/g)) hits.push(`${file}: ${m[0]}`);
    report(hits.length <= CEILING, `text set in --ink-ghost: ${hits.length}, ceiling ${CEILING}`, hits);
  }

  // ---- 12. the war layer's raw bone rgba -------------------------------------
  // `rgba(238,226,204,a)` is --ink spelled as a number, 53 times (the plan counted 52) in the war layer's inline CSS, where an alpha under 1
  // takes it below the floor and away from the ramp. UI-PLAN D09.
  {
    const CEILING = 53;
    const hits = [];
    for (const { file, code } of files) for (const m of code.matchAll(/rgba\(\s*238\s*,\s*226\s*,\s*204\b/g)) hits.push(file);
    const per = new Map(); hits.forEach((f) => per.set(f, (per.get(f) ?? 0) + 1));
    report(hits.length <= CEILING, `raw rgba(238,226,204,...) in the TSX: ${hits.length}, ceiling ${CEILING}`, [...per.entries()].map(([f, c]) => `${c}  ${f}`));
  }

  // ---- 13. a hover that outlives the finger ----------------------------------
  // Every `:hover` that moves or recolours is behind `@media (hover: hover) and (pointer: fine)` (UI-PLAN 1.7), or a tap leaves
  // it stuck on. globals.css and the `hover:` utilities are held by check 3 of palettecheck against the COMPILED sheet. This is
  // the third place a hover can be written: a CSS string inside a component, which neither of those sees. One exists
  // (`Hearth.tsx`, unit W's). Counted per occurrence rather than judged for a wrapper, because a string of CSS in a template
  // literal cannot be parsed honestly with a regex, and the honest ceiling is the one nobody has to trust.
  {
    const CEILING = 1;
    const hits = [];
    for (const { file, code } of files) for (const m of code.matchAll(/[.\w-]+:hover\b/g)) hits.push(`${file}: ${m[0]}`);
    report(hits.length <= CEILING, `:hover written inside TSX/TS (an inline CSS string, invisible to the stylesheet checks): ${hits.length}, ceiling ${CEILING}`, hits);
  }
}

console.log(failures ? `[csscheck] ${failures} FAILED` : "[csscheck] the stylesheet parses and survives the build");
process.exit(failures ? 1 : 0);
