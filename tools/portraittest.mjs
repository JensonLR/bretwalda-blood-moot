#!/usr/bin/env node
// ============================================================
// PORTRAITTEST — the four men in the class picker are men, not magenta.
//
//   node tools/portraittest.mjs
//
// The owner photographed his editor and the class picker held four pink men.
// The pink is Blender's missing-image colour: `attach_textures` loads the maps
// by absolute path, `save_as_mainfile` remaps paths as RELATIVE, and a blend
// rendered from anywhere but its own directory resolves `//tex/` to nothing.
// The material still lights and shades, so the render SUCCEEDS and comes out a
// properly-lit pink man. Blender's exit code cannot see it. Only the pixels can.
//
// The deeper fault was that these four PNGs had no maker at all — rendered once
// by hand, copied into StreamingAssets, and left behind when the blends were
// fixed. tools/blender/exportportraits.mjs is the maker now; this is the gate.
//
// INNER-LOOP TOOL: no Blender, no Unity, no build. It reads four PNGs.
// ============================================================
import { existsSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { magentaShare, MAGENTA_LIMIT } from "./blender/exportportraits.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHIP = resolve(ROOT, "BRETWALDA - Blood Moot/Assets/StreamingAssets");
// The names the Unity menu asks for, off MainMenu.cs's own list.
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

console.log("\n[portraittest] the class picker's four men\n");

for (const cls of CLASSES) {
  const f = resolve(SHIP, `portrait-${cls}.png`);
  if (!existsSync(f)) {
    check(`${cls} has a portrait`, false, `no ${f} — run node tools/blender/exportportraits.mjs`);
    continue;
  }
  const share = await magentaShare(f);
  const kb = statSync(f).size / 1024;
  check(`${cls} is a man and not a missing texture`, share <= MAGENTA_LIMIT,
    `${(share * 100).toFixed(1)}% of the lit pixels are magenta, the limit is ${(MAGENTA_LIMIT * 100).toFixed(0)}%`);
  // A menu tile is drawn at 100 px. A megabyte of it is a render nobody trimmed.
  check(`${cls}'s portrait is a tile and not a poster`, kb < 700, `${kb.toFixed(0)} KB`);
}

// The picker asks for exactly these four; a class added to the menu without a
// portrait would draw an empty box, which is why the list is checked too.
const menu = resolve(ROOT, "BRETWALDA - Blood Moot/Assets/Bretwalda/Scripts/Game/MainMenu.cs");
if (existsSync(menu)) {
  const src = (await import("fs")).readFileSync(menu, "utf8");
  const m = src.match(/static readonly string\[\] Classes = \{([^}]*)\}/);
  const named = m ? [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]) : [];
  check("every class the menu names has a portrait", named.length > 0 && named.every((c) => CLASSES.includes(c)),
    `the menu names ${named.join(", ") || "nothing this could read"}`);
}

console.log(`\n[portraittest] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
