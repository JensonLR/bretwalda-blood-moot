#!/usr/bin/env node
// PLATFORMCHECK — the dual-platform laws, held mechanically (backlog 7.2).
//
//   node tools/platformcheck.mjs
//
// The owner's ruling, 26 Aug 2026: "Scaffold now then mobile, everything
// built or added after with this in mind so we can almost seamlessly be able
// to list / sell the game on either platform." A ruling that lives in a doc
// is advice; this file is the half of it a machine can hold. Each law names
// the platform cost of breaking it. `docs/PLATFORM-PATH.md` §7 carries the
// design half (the account doors, the wrapper, the order).
//
// LAWS, and why each one is a law:
//
//   1. THE SIM STAYS HEADLESS. A console client is "a renderer plus an input
//      layer plus a socket" ONLY while engine.mjs and the shared .mjs rule
//      modules never touch a browser global or three.js. One `window.` in
//      the sim is the whole console port back to "restart".
//   2. STORAGE GOES THROUGH THE SEAMS. A Steam wrapper swaps localStorage
//      for Steam Cloud, a console for its own save system. That swap is an
//      afternoon while every read goes through the named seam files, and a
//      rewrite once localStorage is sprinkled through the client.
//   3. NO HARD ORIGINS IN CLIENT CODE. A wrapped client boots from its own
//      protocol against a CONFIGURED server; a fetch("https://...") burned
//      into a component pins the build to one deployment.
//   4. NO NATIVE-HOSTILE DIALOGS. alert/confirm/prompt hang or vanish in
//      webviews and are certification failures on consoles.
//   5. THE SERVER NEVER IMPORTS THE RENDERER, except through the ONE named
//      seam (db/catalogue -> characters, recorded below with its reason).
//      A second one turns the headless server into a three.js dependency.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

const walk = (dir, exts, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".next", ".git"].includes(e.name)) continue;
      walk(p, exts, out);
    } else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
};
const rel = (p) => relative(ROOT, p);
const read = (p) => readFileSync(p, "utf8");

console.log("[platform] the dual-platform laws, held mechanically\n");

// ---- LAW 1: the sim and the shared rule modules stay headless ----
{
  // tuition.mjs is the ONE exception and it is the seam itself: the injected
  // device-store helper, localStorage-guarded (`typeof localStorage ===
  // "undefined"` on every touch) so a headless import costs nothing. The
  // first run of this law flagged it — and flagged `war.mjs`'s `window`,
  // which is a LOCAL ARRAY (a time window). Both taught the ruler: member
  // access on the browser's own API, not a name that happens to collide.
  const SIM_SEAMS = new Set(["src/game/tuition.mjs"]);
  const BROWSER_MEMBER =
    /\bwindow\s*\.\s*(addEventListener|removeEventListener|location|history|open|document|localStorage|sessionStorage|navigator|innerWidth|innerHeight|setTimeout|setInterval|requestAnimationFrame)\b/;
  const simFiles = walk(resolve(ROOT, "src/game"), [".mjs"]);
  const offenders = [];
  for (const f of simFiles) {
    if (SIM_SEAMS.has(rel(f))) continue;
    const stripped = read(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
    if (BROWSER_MEMBER.test(stripped)) offenders.push(`${rel(f)}: browser window member`);
    for (const g of ["document.", "localStorage", "navigator.", "requestAnimationFrame("]) {
      if (stripped.includes(g)) offenders.push(`${rel(f)}: ${g}`);
    }
    if (/from\s+["']three["']/.test(stripped)) offenders.push(`${rel(f)}: imports three`);
  }
  check("the sim's .mjs modules touch no browser global and no renderer",
    offenders.length === 0, offenders.slice(0, 4).join("; ") || `${simFiles.length} modules clean, 1 named seam`);
}

// ---- LAW 2: client storage goes through the seams ----
{
  // The seams: the boot/persist layer, the input/binding stores, the audio
  // prefs, the quality prefs, the rite's device store, watermark stores.
  // Everything else asks one of those. New seams are added HERE, on purpose,
  // in a commit that says why — not discovered in a component later.
  const SEAMS = new Set([
    "src/app/page.tsx",            // LEGACY_KEY mirror + boot reader (documented)
    "src/app/profileLink.ts",      // the credential store
    "src/app/factions/page.tsx",   // the mirror's one read (documented)
    "src/game/client/bindings.ts",
    "src/game/client/input.ts",
    "src/game/client/render/audio.ts",
    "src/game/client/render/quality.ts",
    "src/game/firstmoot.mjs",      // takes a store; browserStore lives client-side
    "src/game/client/GameHud.tsx", // browserStore(FIRST_MOOT_KEY) + graphics pad prefs
    "src/game/client/factionMap/Dispatch.tsx", // the watermark store (documented)
  ]);
  const files = walk(resolve(ROOT, "src"), [".ts", ".tsx"]);
  const offenders = [];
  for (const f of files) {
    const r = rel(f);
    if (SEAMS.has(r)) continue;
    const stripped = read(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
    if (/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/.test(stripped)) offenders.push(r);
  }
  check("storage reads live in the named seams only",
    offenders.length === 0, offenders.slice(0, 4).join("; ") || `${SEAMS.size} seams`);
}

// ---- LAW 3: no hard-coded deployment origins in client code ----
{
  const files = walk(resolve(ROOT, "src"), [".ts", ".tsx", ".mjs"]);
  const offenders = [];
  for (const f of files) {
    const stripped = read(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
    const m = stripped.match(/fetch\(\s*["'`]https?:\/\/[^"'`]+/g);
    if (m) offenders.push(`${rel(f)}: ${m[0].slice(0, 60)}`);
  }
  check("no client fetch pins a deployment origin",
    offenders.length === 0, offenders.slice(0, 3).join("; ") || "every fetch is same-origin relative");
}

// ---- LAW 4: no native-hostile dialogs ----
{
  const files = walk(resolve(ROOT, "src"), [".ts", ".tsx"]);
  const offenders = [];
  for (const f of files) {
    const stripped = read(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
    if (/\b(?:window\.)?(alert|confirm|prompt)\s*\(/.test(stripped)) offenders.push(rel(f));
  }
  check("no alert/confirm/prompt anywhere in the client",
    offenders.length === 0, offenders.slice(0, 4).join("; ") || "dialogs are the game's own");
}

// ---- LAW 5: the server imports the renderer through one named seam ----
{
  // THE ONE EXCEPTION, and its reason, verbatim from db/catalogue.ts: the
  // server prices the shop off the SAME ARMOURY array the armoury screen
  // draws, because "a second price list on the server is a price list that
  // will disagree". That import drags three.js into the route bundle,
  // ONCE, knowingly. A second exception needs the same quality of reason
  // written here.
  const SEAM = "src/db/catalogue.ts";
  const files = walk(resolve(ROOT, "src/db"), [".ts"])
    .concat(walk(resolve(ROOT, "src/app/api"), [".ts"]));
  const offenders = [];
  for (const f of files) {
    if (rel(f) === SEAM) continue;
    // `import type` is erased at compile — a server file naming a client TYPE
    // ships no renderer. Only value imports count against the law.
    const stripped = read(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")
      .replace(/import\s+type\s+[^;]+;/g, "");
    if (/from\s+["'][^"']*client\/characters["']/.test(stripped)
      || /from\s+["']three["']/.test(stripped)) offenders.push(rel(f));
  }
  check("server code reaches the renderer only through db/catalogue",
    offenders.length === 0, offenders.slice(0, 4).join("; ") || "one seam, documented");
}

// ---- the door column exists (the Steam account door's groundwork) ----
{
  const schema = read(resolve(ROOT, "src/db/schema.ts"));
  check("the players table carries the steamId door column",
    /steamId/.test(schema), "nullable + unique; the door's server half lands with app credentials");
}

console.log(`\n[platform] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
