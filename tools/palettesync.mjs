#!/usr/bin/env node
// ============================================================
// PALETTESYNC — the two clients wear one palette, or the build fails.
//
//   node tools/palettesync.mjs
//
// The owner asked for one design system across the whole game. A second copy
// of a palette is not a design system, it is a second palette — it agrees on
// the day it is written and drifts every day after, silently, because nothing
// is watching. This watches.
//
// src/app/globals.css IS THE SYSTEM OF RECORD, because it is the file the
// launch surface actually renders from. Palette.cs is a copy that must match
// it, and every value there carries the hex it was copied from so the two can
// be compared without running either client.
//
// INNER-LOOP TOOL: no browser, no Unity, no build. Two files and a regex.
// ============================================================
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CSS = resolve(ROOT, "src/app/globals.css");
const CS = resolve(ROOT, "BRETWALDA - Blood Moot/Assets/Bretwalda/Scripts/Game/Palette.cs");

// WHERE EACH COLOUR COMES FROM. Most are custom properties; three are not,
// because the web states them as plain declarations — the ground and its ink
// are `body`'s background and colour, and the muted grey is what a section
// rule's label is written in. Naming the source here is the point: a token
// that cannot be pointed at is a token nobody can check.
const BOUND = [
  { cs: "Gilt", css: "--gilt" },
  { cs: "GiltLit", css: "--gilt-lit" },
  { cs: "Garnet", css: "--garnet" },
  { cs: "GarnetLit", css: "--garnet-lit" },
  { cs: "Woad", css: "--woad" },
  { cs: "WoadLit", css: "--woad-lit" },
  { cs: "Moss", css: "--moss" },
  { cs: "MossLit", css: "--moss-lit" },
  { cs: "Ground", rule: /html,\s*\n\s*body \{[\s\S]*?background:\s*(#[0-9a-f]{6})/i, where: "body { background }" },
  { cs: "Parchment", rule: /html,\s*\n\s*body \{[\s\S]*?\n\s*color:\s*(#[0-9a-f]{6})/i, where: "body { color }" },
  { cs: "Muted", rule: /\.section-title \{[\s\S]*?\n\s*color:\s*(#[0-9a-f]{6})/i, where: ".section-title { color }" },
];
// The forge is .btn-primary's own three stops, and a menu button in Unity is
// painted from them. Same rule: stated once on the web, copied with its source.
const FORGE = [
  { cs: "ForgeTop", stop: 0 },
  { cs: "ForgeMid", stop: 1 },
  { cs: "ForgeFoot", stop: 2 },
];

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

console.log("\n[palettesync] one palette, two clients\n");

if (!existsSync(CSS) || !existsSync(CS)) {
  console.log(`  FAIL  both files are present — ${existsSync(CSS) ? "" : CSS + " missing "}${existsSync(CS) ? "" : CS + " missing"}`);
  console.log("\n[palettesync] 0 passed, 1 failed");
  process.exit(1);
}
const css = readFileSync(CSS, "utf8");
const cs = readFileSync(CS, "utf8");

// Palette.cs states each colour as Hex("rrggbb"); that string is what is compared.
const declared = new Map();
for (const m of cs.matchAll(/public static readonly Color (\w+) = Hex\("([0-9a-fA-F]{6})"\)/g)) {
  declared.set(m[1], m[2].toLowerCase());
}
check("Palette.cs states its colours as hex", declared.size >= BOUND.length,
  `${declared.size} declared, ${BOUND.length} bound to the stylesheet`);

for (const b of BOUND) {
  let want = null, where = b.where ?? b.css;
  if (b.css) {
    const m = css.match(new RegExp(`${b.css}:\\s*(#[0-9a-fA-F]{6})`));
    want = m ? m[1].slice(1).toLowerCase() : null;
  } else {
    const m = css.match(b.rule);
    want = m ? m[1].slice(1).toLowerCase() : null;
  }
  if (!want) { check(`${b.cs} has a source in globals.css`, false, `nothing matched ${where}`); continue; }
  const got = declared.get(b.cs);
  check(`${b.cs} matches ${where}`, got === want,
    got === want ? `#${want}` : `the stylesheet says #${want}, Palette.cs says ${got ? `#${got}` : "nothing"}`);
}

// .btn-primary's forge ramp: three stops in one gradient, in order.
const btn = css.match(/\.btn-primary \{[\s\S]*?linear-gradient\(180deg,\s*(#[0-9a-fA-F]{6})[^)]*?,\s*(#[0-9a-fA-F]{6})[^)]*?,\s*(#[0-9a-fA-F]{6})/);
if (!btn) check("the forge ramp is readable off .btn-primary", false, "no three-stop 180deg gradient found");
else for (const f of FORGE) {
  const want = btn[f.stop + 1].slice(1).toLowerCase(), got = declared.get(f.cs);
  check(`${f.cs} matches .btn-primary stop ${f.stop + 1}`, got === want,
    got === want ? `#${want}` : `the stylesheet says #${want}, Palette.cs says ${got ? `#${got}` : "nothing"}`);
}

// THE PADS ARE THE WEB'S ALONE and must not quietly become a second palette in
// Unity: there are no touch controls in the Unity client, so a --pad-* copied
// into Palette.cs would be a colour with no caller and no way to notice it
// rotting. The web must still declare all seven.
const pads = [...css.matchAll(/--pad-([a-z]+):/g)].map((m) => m[1]);
const wantPads = ["cut", "heavy", "block", "dodge", "shove", "take", "power"];
check("the web declares every thumb pad", wantPads.every((p) => pads.includes(p)),
  `declared: ${[...new Set(pads)].join(", ")}`);
check("no thumb pad has leaked into the Unity palette", ![...declared.keys()].some((k) => /^Pad/.test(k)),
  "Unity has no touch controls; a pad colour there would have no caller");

console.log(`\n[palettesync] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
