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

console.log(failures ? `[csscheck] ${failures} FAILED` : "[csscheck] the stylesheet parses and survives the build");
process.exit(failures ? 1 : 0);
