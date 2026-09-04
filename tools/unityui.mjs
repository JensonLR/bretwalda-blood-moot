#!/usr/bin/env node
// ============================================================
// UNITYUI — the Unity client's screens, checked against the two rules that
// have each already cost the owner a session.
//
//   node tools/unityui.mjs
//
// 1. WHOEVER ASKS FOR A PRESS MUST ASK FOR THE POINTER. FollowCamera locks the
//    cursor on any left click unless a screen has raised WantCursor. FirstMoot
//    was the only thing that ever raised it, so the FIRST SCREEN OF THE GAME
//    took the pointer away on the first click and left nothing to click with.
//    The owner: "I still having issue with selecting anything on screen, once i
//    click the mouse pointer goes."
//
// 2. A 9-SLICE BORDER CANNOT BE WIDER THAN THE TEXTURE IT SLICES. Skin.cs asked
//    for a 2 px border each side of a 3 px strip: the middle came out MINUS ONE,
//    Unity had nothing to stretch, and it painted the border colour over every
//    plate, field and button. The whole menu came up solid gold. Nothing failed
//    and nothing logged — it is a data error, and a C# compiler cannot see it.
//
// INNER-LOOP TOOL: no Unity, no build. It reads C#.
// ============================================================
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(ROOT, "BRETWALDA - Blood Moot/Assets/Bretwalda/Scripts/Game");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

console.log("\n[unityui] the screens, and the two rules that have already cost a session\n");

if (!existsSync(DIR)) {
  check("the Unity scripts are where this expects them", false, DIR);
  console.log("\n[unityui] 0 passed, 1 failed"); process.exit(1);
}
const files = readdirSync(DIR).filter((f) => f.endsWith(".cs"));

// ---- 1. the pointer ----------------------------------------------------
// A screen "takes input" if it calls a GUI control that answers a press. A
// screen that only DRAWS (the HUD) neither needs the pointer nor should hold it.
const CONTROLS = /GUI\.(Button|RepeatButton|Toggle|TextField|TextArea|SelectionGrid|HorizontalSlider|VerticalSlider|Toolbar)\s*\(/;
let screens = 0;
for (const f of files) {
  const src = readFileSync(resolve(DIR, f), "utf8");
  if (!/void OnGUI\s*\(/.test(src)) continue;
  const takesInput = CONTROLS.test(src);
  if (!takesInput) {
    check(`${f} draws only, and does not hold the pointer`, !/FollowCamera\.WantCursor/.test(src),
      "an overlay that grabs the cursor is a fight nobody can play");
    continue;
  }
  screens++;
  const raises = /FollowCamera\.WantCursor\s*\(/.test(src);
  check(`${f} asks for the pointer while it is up`, raises,
    raises ? "raises FollowCamera.WantCursor" : "takes presses but never raises WantCursor — the first click will lock the cursor and hide it");
  // Raising it is not enough: an unbalanced count leaves the pointer loose in
  // the fight for ever, which is the same bug from the other end.
  if (raises) check(`${f} pays the pointer back`, /void OnDisable\s*\(\s*\)[\s\S]{0,200}?(WantCursor|Want)\s*\(\s*false\s*\)/.test(src),
    "OnDisable lowers it, so a screen destroyed while up cannot strand the count");
}
check("every screen that takes a press was checked", screens >= 3, `${screens} interactive screens found`);

// ---- 2. the slice ------------------------------------------------------
const skin = existsSync(resolve(DIR, "Skin.cs")) ? readFileSync(resolve(DIR, "Skin.cs"), "utf8") : "";
if (!skin) check("Skin.cs is present", false);
else {
  // The strip's width and the border must come off ONE number, so they cannot
  // drift. A literal RectOffset in a style is the shape that went wrong.
  const rule = skin.match(/const int RULE\s*=\s*(\d+)/);
  const middle = skin.match(/const int MIDDLE\s*=\s*(\d+)/);
  const derived = /const int W = RULE \* 2 \+ MIDDLE/.test(skin);
  check("the rule's width is stated once", !!rule && !!middle, rule ? `RULE ${rule[1]}, MIDDLE ${middle?.[1]}` : "no RULE constant");
  check("the strip's width is derived from it", derived, "W = RULE * 2 + MIDDLE, so a border can never exceed the texture");
  if (rule && middle) {
    const r = +rule[1], m = +middle[1], w = r * 2 + m;
    check("the slice leaves a middle to stretch", w - 2 * r >= 1, `${w} px wide, ${r} px border each side, middle ${w - 2 * r}`);
  }
  const literal = [...skin.matchAll(/border = new RectOffset\((\d+),\s*(\d+)/g)];
  check("no style states its border as a literal", literal.length === 0,
    literal.length ? `${literal.length} literal border(s) — use the shared Border so it tracks RULE` : "all borders come off the shared Border");
}

console.log(`\n[unityui] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
