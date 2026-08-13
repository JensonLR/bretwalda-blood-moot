#!/usr/bin/env node
// ============================================================
// HOODFALL — what a cowl actually does to a fall, measured on the mesh.
//
//   node tools/hoodfall.mjs            # THE GATE. ~20 s, no browser, no GL.
//   node tools/hoodfall.mjs --table    # also print the hem/reach table
//
// ------------------------------------------------------------
// WHY THIS EXISTS: A CARVE-OUT THAT IS STILL THERE
//
// docs/PROCESS.md names it as failure mode 2, first example: "`cosmetictest`
// carved the Shadow Hood out of its hair assertion". Half of that carve-out was
// closed — §3's "every paid hairstyle still reads under every helm, the hood
// included" is an assertion now and it is RED, at 15/16. The other half was
// not. §3's second check still reads, in the source and on the verdict line:
//
//     "no two PAID hairstyles are the same shape as each other under any helm
//      BUT THE HOOD"
//
// and it passes. The exclusion is doing real work: under the hood the Long Mane
// (40 g) and the Braided War-locks (100 g) are not merely hard to tell apart,
// they are THE SAME MESH — same vertex count, same bounds, same positions to
// the micron. That is 140 gold of shop resolving to one object, and the only
// check that could see it has the hood written out of its own scope.
//
// This file has no exclusions. It compares hair rungs as GEOMETRY rather than
// as a silhouette through a lens, which is a different instrument answering the
// same question from a direction that cannot be argued with: two builds are the
// same object or they are not.
//
// ------------------------------------------------------------
// AND THE SECOND FINDING, WHICH CHANGES WHAT THE FIX HAS TO BE
//
// docs/OPEN-DEFECTS.md records the cause as "`hairFall` returns 0 outright when
// hooded, so there is NO FALL UNDER A COWL AT ALL". True, and not the whole of
// it. §2 below measures the other half: **the hood is longer than the hair**.
// The Shadow Hood's shoulder drape hangs to y 1.464 on the huscarl; a Long Mane
// with no helmet on at all reaches y 1.446. Eighteen millimetres. So restoring
// `hairFall` on its own would not put one visible strand outside the cloth — it
// would put ~2600 vertices INSIDE it, which is the fault `hairFitProbe` exists
// to catch, and the mane would still be swallowed.
//
// Whatever the fix is, it has to make room as well as mass: a window where the
// cowl is not (the temples, between the face opening at 0.84 rad and the cowl
// fall's own leading edge), or a fall carried past the mantle's hem, or both.
// That is a reshape and it is not a one-line revert, which is presumably why
// the pass that found the cause left it alone.
//
// ------------------------------------------------------------
// WHAT IT DOES NOT MEASURE — docs/PROCESS.md R4
//
// Nothing here says anything about whether a hood SHOULD show a mane. That
// ruling was already made, in docs/OPEN-DEFECTS.md, and it is quoted in §2. This
// file measures whether the shop is selling two objects or one, and how much
// room there is to fix it in. It does not measure how it looks.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import * as THREE from "three";
import { createHash } from "crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = resolve(ROOT, ".hoodfall");
const T0 = Date.now();
const argv = process.argv.slice(2);
const TABLE = argv.includes("--table");

let failed = 0;
const check = (name, pass, detail) => {
  if (!pass) failed++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const note = (s) => console.log(`        ${s}`);
const die = (m) => { console.error(`[hood] ${m}`); process.exit(2); };

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/characters.ts",
  "--outDir", ".hoodfall", "--target", "es2022", "--module", "esnext",
  "--moduleResolution", "bundler", "--skipLibCheck"], { cwd: ROOT, encoding: "utf8" });
let charJs = null;
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
  const f = resolve(d, e.name);
  if (e.isDirectory()) walk(f); else if (e.name === "characters.js") charJs = f;
} };
if (existsSync(WORK)) walk(WORK);
if (!charJs) die(`tsc emitted nothing:\n${tsc.stdout || ""}${tsc.stderr || ""}`);
const { buildCharacter, defaultAppearance, HELM_VALUES, HAIR_VALUES } = await import(pathToFileURL(charJs).href);

const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
const SEED = 13;
// Hair and beard are told apart by their material colour, so the two must not
// collide — a shared hex would fold the beard into every hair reading and the
// whole file would be measuring a chin.
const HAIR_HEX = 0x4a3220;
const BEARD_HEX = 0xe8e4da;
const HOOD_HEX = 0x2a2521;

/**
 * Every mesh whose material carries `hex`, reduced to a fingerprint.
 *
 * The digest is over the WORLD-SPACE positions, rounded to a micron and sorted,
 * so it is invariant to the order the builder happens to emit parts in and to
 * nothing else. Two rungs with the same digest are the same object; there is no
 * threshold in that and therefore nothing to tune.
 */
function surface(cls, helm, hair, hex) {
  const c = buildCharacter(cls, {
    ...defaultAppearance(cls), helm, hairStyle: hair,
    hairColor: HAIR_HEX, beardColor: BEARD_HEX, beardStyle: "short",
  }, 0x6a5636, undefined, "high", SEED);
  c.group.updateMatrixWorld(true);
  const pts = [];
  let lo = Infinity, hi = -Infinity, wide = 0;
  const v = new THREE.Vector3();
  c.group.traverse((o) => {
    if (!o.isMesh || o.material?.color?.getHex() !== hex) return;
    const pos = o.geometry.attributes?.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      lo = Math.min(lo, v.y); hi = Math.max(hi, v.y);
      wide = Math.max(wide, Math.abs(v.x));
      pts.push(`${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`);
    }
  });
  const n = pts.length;
  pts.sort();
  return { n, lo, hi, wide, digest: createHash("sha1").update(pts.join(";")).digest("hex").slice(0, 12) };
}

console.log("\n[hood] === HOODFALL ===\n");

// ============================================================
// 0. CALIBRATION
// ============================================================
console.log("[hood] === 0. CALIBRATION ===\n");
{
  const a = surface("huscarl", "none", "long", HAIR_HEX);
  const b = surface("huscarl", "none", "long", HAIR_HEX);
  check("the fingerprint is stable — the same build twice is the same digest",
    a.digest === b.digest && a.n === b.n, `${a.n} verts, ${a.digest}`);

  // If this ever passed, the instrument would be blind to the very difference
  // it exists to find, and every FAIL below would be an artefact.
  const mane = surface("huscarl", "none", "long", HAIR_HEX);
  const locks = surface("huscarl", "none", "braids", HAIR_HEX);
  check("bare-headed, the Long Mane and the War-locks ARE two objects",
    mane.digest !== locks.digest,
    `mane ${mane.n} verts ${mane.digest}, war-locks ${locks.n} verts ${locks.digest}`);

  const beard = surface("huscarl", "none", "long", BEARD_HEX);
  check("hair and beard are separable by material — the beard is not in the hair reading",
    beard.n > 0 && beard.digest !== mane.digest, `beard ${beard.n} verts`);
}

// ============================================================
// 1. NO TWO HAIR RUNGS MAY BE ONE OBJECT — UNDER ANY HELM, THE HOOD INCLUDED
// ============================================================
console.log("\n[hood] === 1. IS THE SHOP SELLING TWO OBJECTS? every helm, every pair ===\n");
const PAID = HAIR_VALUES.filter((h) => h !== "shaved");
const collisions = [];
let pairs = 0;
for (const cls of CLASSES) {
  for (const helm of HELM_VALUES) {
    const seen = new Map();
    for (const hair of PAID) {
      const s = surface(cls, helm, hair, HAIR_HEX);
      const prior = seen.get(s.digest);
      if (prior) collisions.push({ cls, helm, a: prior.hair, b: hair, n: s.n });
      else seen.set(s.digest, { hair, s });
    }
    pairs += (PAID.length * (PAID.length - 1)) / 2;
  }
}
for (const c of collisions) {
  console.log(`  ONE OBJECT   ${c.cls.padEnd(11)} ${c.helm.padEnd(10)} ${c.a} == ${c.b}   (${c.n} verts, identical to the micron)`);
}
check(`no two paid hairstyles are ONE OBJECT under any helm — the hood included (${pairs} pairs)`,
  collisions.length === 0,
  collisions.length ? `${collisions.length} collapsed pair(s)` : `all ${pairs} pairs are two objects`);

// ============================================================
// 2. HOW MUCH ROOM IS THERE TO FIX IT IN?
//
// The ruling this measures against was made in docs/OPEN-DEFECTS.md and is
// quoted rather than re-argued: "a cowl covers the crown, it does not swallow a
// mane that hangs past the shoulder".
//
// Reported and NOT gated, and the reason is that there is no honest bar to put
// on it yet: how far a mane should hang below a cowl's hem is a design call,
// and a number picked here would be this file inventing the thing it is
// supposed to be checking. What it does say out loud is the arithmetic that
// decides whether the known fix is even available.
// ============================================================
console.log("\n[hood] === 2. THE HOOD IS LONGER THAN THE HAIR (reported, not gated) ===\n");
console.log("  class        hair      bare reach   hooded reach   verts bare/hooded   hood hem   clearance");
const room = [];
for (const cls of CLASSES) {
  const hood = surface(cls, "hood", "long", HOOD_HEX);
  for (const hair of PAID) {
    const bare = surface(cls, "none", hair, HAIR_HEX);
    const on = surface(cls, "hood", hair, HAIR_HEX);
    const clear = hood.lo - bare.lo;
    // The Warrior Crop is excluded from the worst-case line below, and not from
    // the table. A crop has no FALL — `hairFall` is a statement about hanging
    // mass — so "how far does it reach below the hood's hem" is a quantity it
    // does not have, and its -300 mm rows would otherwise set a worst case that
    // means nothing. Left visible because a crop that suddenly did reach the
    // hem would be a defect worth seeing.
    if (hair !== "short") room.push({ cls, hair, clear });
    console.log(`  ${cls.padEnd(11)}  ${hair.padEnd(8)}  ${bare.lo.toFixed(3).padStart(10)}   ${on.lo.toFixed(3).padStart(12)}   ${String(bare.n).padStart(6)}/${String(on.n).padEnd(6)}      ${hood.lo.toFixed(3)}   ${(clear * 1000).toFixed(0).padStart(6)} mm`);
  }
}
const worst = room.reduce((a, b) => (b.clear < a.clear ? b : a));
const best = room.reduce((a, b) => (b.clear > a.clear ? b : a));
note(`"clearance" is how far a FREE fall reaches below the hood's own hem — the only place a`);
note(`mane could emerge without being carried further down than it is drawn. Crop rows excluded: it has no fall.`);
note(`Worst ${worst.cls}/${worst.hair} ${(worst.clear * 1000).toFixed(0)} mm; BEST ${best.cls}/${best.hair} ${(best.clear * 1000).toFixed(0)} mm.`);
note(`At the play lens a man is ~230 px over ~1.8 m, so 1 px is ~7.9 mm. The best case in the game is`);
note(`${(best.clear * 1000 / 7.9).toFixed(1)} px of mane, and ${room.filter((r) => r.clear <= 0).length} of ${room.length} falls do not clear the hem at all.`);

console.log("");
console.log(`[hood] ${failed === 0 ? "PASS" : "FAIL"} in ${((Date.now() - T0) / 1000).toFixed(0)}s`
  + ` — WITH the §2 table reported and ungated, which is a deferral and not a clean sheet`);
process.exit(failed ? 1 : 0);
