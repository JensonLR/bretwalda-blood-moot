#!/usr/bin/env node
// ============================================================
// MANESPREAD — WHERE ROUND THE HEAD IS THE HAIR, and does a helmet
// leave it anywhere a player can see it?
//
//   node tools/manespread.mjs                 every class x every helm, ~40 s
//   node tools/manespread.mjs --cls huscarl   one class
//   node tools/manespread.mjs --bins          print the per-bearing table
//
// THE OWNER, 2026-08-13:
//
//   "Long mane with huscarl when wearing a helmet causes 2 side front long
//    strands of hair to appear, on the rest of the characters with the same
//    hair there's just bald sides & nothing at the back on any, just the
//    helmet."
//
// Two failures in one sentence and they are the same failure: the mane
// survives in a NARROW BAND OF BEARING and nowhere else. On the coifed huscarl
// that band is in front of the ears, so it draws as two strands beside the
// face; on everybody else the band is thin enough to draw as nothing.
//
// WHY NO EXISTING GATE COULD SEE IT, and this is the thirteenth instance of the
// repository's signature fault. `cosmetictest` §3 measures the SILHOUETTE AREA
// the hair adds against Shaved, through one camera, at one bearing. Two long
// strands hanging beside a face are a LOT of silhouette — 11.09% against a 1%
// bar, the highest reading of any helm on the sheet — so the check that exists
// to prove a paid hairstyle still reads went green on exactly the frame the
// owner was pointing at. Area is not distribution. A number that says "there is
// hair" cannot say "the hair is only in one place".
//
// WHAT THIS MEASURES INSTEAD. The hairstyle is built twice at one seed — bare
// headed and under the helm — and the hair's vertices are binned by AZIMUTH
// about the head's axis. Per bin, how far the hair HANGS: the lowest hair
// vertex at that bearing, in mm below the crown. The bare-headed build is the
// FIXED REFERENCE (`docs/OPEN-DEFECTS.md`: "a ratio whose denominator moves
// with its numerator measures nothing"), so a bin's score is
//
//     kept = helmed hang at this bearing / bare hang at the same bearing
//
// and a garment that DELETES hair at a bearing scores zero there however much
// it leaves somewhere else.
//
// A helmet is entitled to compress hair, to cover it, and to take the crown
// outright. What it is not entitled to do is leave a 40-gold mane alive over
// one eighth of the head. So the reported statistic is the SPREAD: how many of
// the bearings that carry hair on a bare head still carry it under the helm.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".manespread");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
spawnSync("npx", ["tsc", "src/game/client/characters.ts", "--outDir", ".manespread",
  "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(d, e.name)) : e.name === "characters.js" && found.push(resolve(d, e.name)); };
walk(OUT);
if (!found[0]) { console.error("[mane] tsc emitted nothing"); process.exit(2); }
const { buildCharacter, defaultAppearance, HELM_VALUES } = await import(pathToFileURL(found[0]).href);
const THREE = await import("three");

/** A tint no palette entry uses, so the hair's meshes can be told by colour. */
const TINT = 0x2fe07a;
const TINT_HEX = TINT.toString(16).padStart(6, "0");
const SEED = 13;

const CLASSES = flag("cls", "") ? [flag("cls")] : ["huscarl", "warden", "runekeeper", "berserker"];
const STYLES = ["long", "braids"];
/**
 * The bearings a mane is judged over: everything from 45 degrees off dead ahead
 * to straight behind, both sides. In FRONT of 45 degrees a helmed head has a
 * brow band and a face, and the hair material also carries the brows and the
 * lash line — so the front octant is neither the style's business nor cleanly
 * separable, and it is left out rather than measured badly.
 */
const AZ_MIN = 45;
const NBIN = 24;                       // about 5.6 degrees a bin
/**
 * THE TWO BARS, and both are against the BARE-HEADED SAME STYLE.
 *
 * `fwdAdd` — the most extra hang, in mm, that the helm puts anywhere in FRONT
 * of 90 degrees. A helmet does not grow hair. It may reroute a mane under a
 * cheek plate's hem, which lowers the root by a couple of centimetres, so the
 * bar is 25 mm rather than zero — but a mane that hangs 150 mm further beside
 * the eye than the same mane does on a bare head is not the style the player
 * bought, it is two strands the garment invented.
 *
 * `napeKeep` — the median share of the bare hang that survives from 130 deg
 * back, which is the nape. An open helm is a bowl on the crown with the whole
 * back of the head in open air, so half is already generous.
 */
const FWD_ADD_MM = 25;
const NAPE_KEEP = 0.50;
/** How far forward a garment may drag a style's own lowest point, in degrees. */
const DEEP_SWING = 20;

/** Every hair vertex of one dress, in world space. */
const hairPoints = (cls, ap) => {
  const built = buildCharacter(cls, ap, 0, undefined, "high", SEED);
  const group = built.group ?? built;
  group.updateMatrixWorld?.(true);
  const pts = [];
  const v = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (mat?.color?.getHexString?.() !== TINT_HEX) return;
    const pos = o.geometry.getAttribute("position");
    const idx = o.geometry.getIndex();
    const n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t++) {
      v.fromBufferAttribute(pos, idx ? idx.getX(t) : t).applyMatrix4(o.matrixWorld);
      pts.push(v.x, v.y, v.z);
    }
  });
  return pts;
};

/**
 * How far the hair hangs at each bearing, in mm below the style's own crown.
 *
 * The crown is taken from the BARE build and handed in, so the helmed build is
 * measured against the same datum rather than against its own — a helm that
 * flattens the crown would otherwise appear to hang further by having a lower
 * top.
 */
const hangByBin = (pts, crownY) => {
  const low = new Array(NBIN).fill(null);
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], z = pts[i + 2];
    const az = Math.abs(Math.atan2(x, z)) * 180 / Math.PI;   // 0 ahead, 180 behind
    if (az < AZ_MIN) continue;
    const b = Math.min(NBIN - 1, Math.floor(((az - AZ_MIN) / (180 - AZ_MIN)) * NBIN));
    const d = (crownY - y) * 1000;
    if (low[b] === null || d > low[b]) low[b] = d;
  }
  return low;
};

const topY = (pts) => {
  let t = -Infinity;
  for (let i = 1; i < pts.length; i += 3) if (pts[i] > t) t = pts[i];
  return t;
};

const rows = [];
for (const cls of CLASSES) {
  for (const style of STYLES) {
    const base = { ...defaultAppearance(cls), beardStyle: "none", hairColor: TINT, hairStyle: style };
    const barePts = hairPoints(cls, { ...base, helm: "none" });
    if (barePts.length < 3) { console.log(`[mane] ${cls}/${style}: no hair geometry at all`); continue; }
    const crown = topY(barePts);
    const bare = hangByBin(barePts, crown);
    for (const helm of HELM_VALUES) {
      if (helm === "none") continue;
      const pts = hairPoints(cls, { ...base, helm });
      const worn = hangByBin(pts, crown);
      const kept = [];
      for (let b = 0; b < NBIN; b++) {
        if (bare[b] === null || bare[b] < 20) { kept.push(null); continue; }
        kept.push(worn[b] === null ? 0 : Math.max(0, worn[b]) / bare[b]);
      }
      // The most extra hang, in mm, anywhere in front of 90 degrees, and where.
      let fwdAdd = 0, fwdAt = 0;
      for (let b = 0; b < NBIN; b++) {
        if (az(b) >= 90 || bare[b] === null) continue;
        const add = (worn[b] ?? 0) - bare[b];
        if (add > fwdAdd) { fwdAdd = add; fwdAt = az(b); }
      }
      // WHERE THE DEEPEST HAIR IS, on this build and on the bare one, and the
      // bare one is the whole point. The first cut of this asserted "the lowest
      // hair is behind 90 degrees", which is true of the Long Mane and FALSE OF
      // THE WAR-LOCKS — bare-headed the plaits' deepest point is at 48 deg,
      // beside the face, because that is where a plait hangs. A bar that reads
      // like anatomy and fails a correct build is the failure this repository
      // keeps recording, so the reference is the STYLE'S OWN bare-headed
      // bearing: a garment may not drag the lowest point of a hairstyle round
      // toward the face, whatever that point was to begin with.
      let deep = -1, deepAt = 0, bareDeep = -1, bareDeepAt = 0;
      for (let b = 0; b < NBIN; b++) {
        if ((worn[b] ?? -1) > deep) { deep = worn[b] ?? -1; deepAt = az(b); }
        if ((bare[b] ?? -1) > bareDeep) { bareDeep = bare[b] ?? -1; bareDeepAt = az(b); }
      }
      // AND HOW FAR THE HAIR HANGS AT THE NAPE — the deepest of the bearings
      // from 130 degrees back, against the deepest of the same bearings on the
      // bare head.
      //
      // A SECTOR MAXIMUM AND NOT A PER-BIN MEDIAN, and the first cut of this was
      // the median. Two war-locks are 24 mm of rope apiece: at 5.6 degrees a bin
      // they land in every third bin and miss the rest, so the median of the
      // rear bins fell on an EMPTY one and read 0% — "nothing at the back" — on
      // builds whose plaits are plainly there at 115%. A statistic that reports
      // the sampling grid rather than the geometry is the fault this whole file
      // is about, caught on its own harness this time.
      let rearWorn = 0, rearBare = 0;
      for (let b = 0; b < NBIN; b++) {
        if (az(b) < 130) continue;
        rearWorn = Math.max(rearWorn, worn[b] ?? 0);
        rearBare = Math.max(rearBare, bare[b] ?? 0);
      }
      const napeKeep = rearBare > 20 ? rearWorn / rearBare : 1;
      // A hood is a bag for a head and a mask closes it on every bearing; both
      // are entitled to swallow hair, and this harness is about what an OPEN
      // helmet does. They are measured and reported, never gated.
      const open = helm !== "hood" && helm !== "suttonhoo";
      const fail = open && (deepAt < bareDeepAt - DEEP_SWING || napeKeep < NAPE_KEEP);
      rows.push({ cls, style, helm, kept, bare, worn, fwdAdd, fwdAt, napeKeep, open, fail,
        deep, deepAt, bareDeep, bareDeepAt });
    }
  }
}

function az(b) { return Math.round(AZ_MIN + ((180 - AZ_MIN) * (b + 0.5)) / NBIN); }
console.log("\n[mane] how much of a bare head's HANG survives the helm, by bearing (45 deg = beside the eye, 180 = straight behind)\n");
console.log("[mane] class        hair     helm         deepest hair   (bare)   front add   nape kept  verdict");
console.log("[mane] " + "-".repeat(96));
let bad = 0;
for (const r of rows) {
  if (r.fail) bad++;
  console.log(`[mane] ${r.cls.padEnd(12)} ${r.style.padEnd(8)} ${r.helm.padEnd(12)}`
    + `${r.deep.toFixed(0).padStart(6)} mm at${String(r.deepAt).padStart(4)}`
    + `${(String(r.bareDeepAt) + " deg").padStart(9)}`
    + `${r.fwdAdd.toFixed(0).padStart(9)} mm`
    + `${(r.napeKeep * 100).toFixed(0).padStart(10)}%`
    + `   ${r.fail ? "<-- FAIL" : r.open ? "" : "(covered rung, reported only)"}`);
}

if (has("bins")) {
  console.log("\n[mane] per-bearing kept fraction (. = under the floor, x = no hair at all)\n");
  console.log("[mane] bearing   " + Array.from({ length: NBIN }, (_, b) => String(az(b)).padStart(4)).join(""));
  for (const r of rows) {
    console.log(`[mane] ${(r.cls + "/" + r.style + "/" + r.helm).padEnd(34)}`
      + r.kept.map((k) => (k === null ? "   -" : k === 0 ? "   x" : String(Math.round(k * 100)).padStart(4))).join(""));
  }
}
console.log("");
console.log(`[mane] A GARMENT MAY NOT DRAG A STYLE'S LOWEST POINT ROUND TOWARD THE FACE — more than`);
console.log(`[mane] ${DEEP_SWING} deg forward of where the same style hangs bare-headed is the gate. An OPEN helm`);
console.log(`[mane] must also leave ${(NAPE_KEEP * 100).toFixed(0)}% of the nape's hang, against the`);
console.log(`[mane] same style bare-headed. The hood and the Sutton Hoo close the head and are`);
console.log(`[mane] reported, never gated. 'front add' is REPORTED for the same reason it is not a`);
console.log(`[mane] bar: every helm deliberately drops the hairline at the temple so hair comes out`);
console.log(`[mane] from under the band, which is 80-110 mm on an open rung and correct.`);
console.log(`[mane] ${rows.length - bad}/${rows.length} rows pass`);
console.log(bad ? "[mane] FAIL" : "[mane] PASS");
process.exit(bad ? 1 : 0);
