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
import { existsSync, statSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { magentaShare, MAGENTA_LIMIT } from "./blender/exportportraits.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// THE EXPORTER'S OWN OUTPUT, beside the blend that made it — not a copy.
//
// This used to read `BRETWALDA - Blood Moot/Assets/StreamingAssets`, which was
// a COPY of these four files, and Unity is retired (docs/ONE-CLIENT.md §4.3).
// Reading the source rather than a sink is the better arrangement anyway: the
// defect this file exists for is a render whose textures missed, and that is a
// property of the render, not of where it was filed.
const ART = resolve(ROOT, "art/blender");
const TYPES = resolve(ROOT, "src/game/types.ts");
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

console.log("\n[portraittest] the class picker's four men\n");

for (const cls of CLASSES) {
  const f = resolve(ART, `portrait-${cls}.png`);
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

// THE ROSTER IS THE GAME'S, NOT A MENU'S. A class added to the game without a
// portrait would draw an empty box, so the list is checked against the only
// place that decides what classes exist — `WARRIOR_STATS` in types.ts. Reading
// Unity's `MainMenu.cs` for this was always reading a copy of the answer.
{
  const src = readFileSync(TYPES, "utf8");
  const block = src.slice(src.indexOf("WARRIOR_STATS"));
  const named = [...new Set([...block.matchAll(/(\w+):\s*\{[^}]*?attackSpeed:/g)].map((m) => m[1]))];
  check("the game's class roster is readable", named.length >= 4, named.join(", "));
  const missing = named.filter((c) => !CLASSES.includes(c));
  check("every class the game has, has a portrait", missing.length === 0,
    missing.length ? `${missing.join(", ")} — a class with no portrait draws an empty box`
                   : `the game names ${named.join(", ")}`);
}

console.log(`\n[portraittest] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
