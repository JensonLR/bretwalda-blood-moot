// ============================================================
// WEARSWEEP — every hanging cosmetic against the armour it hangs over.
//
//   node tools/wearsweep.mjs        gate: hair and beards, cloaked and not
//
// WHY THIS FILE EXISTS. The owner, after the hairmail merge: *"I hope a check
// through the full armoury items & any ugly overlaps or sticking out elements
// is on the list."* `hairmail` answers exactly one cell of that matrix — long
// hair against the trunk, bare-headed, no cloak, default finish. This file
// widens the same instrument to the rest of the hanging cosmetics.
//
// THE INSTRUMENT, and the three designs it burned through getting honest:
//
//   1. Ray parity alone convicted the berserker's mane for standing behind
//      his OPEN pelt sheet — parity against an open surface calls everything
//      behind it "inside" (the sheet's own build comment names it "one
//      continuous two-sided sheet"). Two rays fixed that: a truly buried
//      vertex reads odd on ANY bearing; a lone sheet crossing does not.
//   2. Binary membership then convicted a mane for NESTING into 55 mm of fur
//      pile, which is what hair on fur looks like. Conviction became DEPTH —
//      the exit distance along the outward ray.
//   3. An analytic test against the worn registry was tried and thrown out:
//      a garment is a SHELL, and its swept cross-section includes the neck
//      opening, so the registry convicted every beard hanging correctly down
//      an open collar. Mesh parity has the hole; the registry does not.
//
// THE BAR. 2% of hanging vertices deeper than the class's conviction depth:
//   - 8 mm against hard armour — mail, byrnies, robes. The shipped huscarl
//     defect read tens of millimetres and convicts at ~100%; hair pressed a
//     strand's width into a surface does not.
//   - 20 mm on the berserker, whose trunk wears ONLY fur: the ruff's wall is
//     20 mm and its hanging lock cones are 24 mm across, so fur mingling
//     with fur reads up to ~18 mm (measured 15.4–17.7 on the four residual
//     vertices, photographed invisible in art/look/wearsweep/), while a mane
//     genuinely through the ruff onto the body reads 40+. Nothing hard hangs
//     on his trunk for the smaller bar to protect.
//
// NOT MEASURED HERE, and why: hair/beard INSIDE THE CLOAK ITSELF (open
// sheet — capture question, kitcard lens); helm/hood fit (`wearmeasure`,
// `helmclash`, `hoodfall`, `facecover`, `eyeclip` own that ground).
// ============================================================
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { loadClient } from "./lib/clientmodule.mjs";
import * as THREE from "three";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { CH } = await loadClient(ROOT, ".wearsweep");
const { buildCharacter, defaultAppearance } = CH;

const TINT = 0x2fe07a;
const SEED = 13;
const BAR_PCT = 2.0;
/** Conviction depth in metres, by what the class's trunk actually wears. */
const DEPTH = (cls) => (cls === "berserker" ? 0.020 : 0.008);

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

/** Build a man; return tinted-cosmetic verts, trunk meshes, registry, cloak verts. */
function subject(cls, ap) {
  const c = buildCharacter(cls, { ...defaultAppearance(cls), helm: "none", ...ap }, 0x8a6b3f, undefined, "high", SEED);
  c.group.updateMatrixWorld(true);
  const tinted = [];
  const trunk = [];
  const cloak = [];
  const v = new THREE.Vector3();
  c.group.traverse((o) => {
    if (!o.isMesh) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const hex = mat?.color?.getHexString?.() ?? "";
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    let inCloak = false;
    for (let p = o.parent; p; p = p.parent) if (p.name === "rig:cloak") { inCloak = true; break; }
    if (hex === TINT.toString(16)) {
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        tinted.push(v.x, v.y, v.z);
      }
      return;
    }
    if (inCloak) {
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        cloak.push(v.x, v.y, v.z);
      }
      return;
    }
    if (o.name === "rig:torso") trunk.push(o);
  });
  return { tinted, trunk, worn: c.wornTrunk ?? [], cloak };
}

const ray = new THREE.Ray();
const caster = new THREE.Raycaster();
caster.firstHitOnly = false;

/** Depth below the trunk's outer surface, or 0 when not buried (see header). */
function buriedDepth(trunk, x, y, z) {
  const d = Math.hypot(x, z) || 1;
  let odd = 0, exit = Infinity;
  for (const dir of [
    new THREE.Vector3(x / d, 0, z / d),
    new THREE.Vector3((x / d) * 0.707, 0.707, (z / d) * 0.707),
  ]) {
    ray.set(new THREE.Vector3(x, y, z), dir);
    caster.ray = ray;
    caster.far = 2;
    let hits = 0, first = Infinity;
    for (const t of trunk) {
      for (const h of caster.intersectObject(t, false)) {
        hits++;
        if (h.distance < first) first = h.distance;
      }
    }
    if (hits % 2 === 1) { odd++; if (first < exit) exit = first; }
  }
  return odd === 2 ? exit : 0;
}

function fracInside(tinted, trunk, belowY, depthBar) {
  for (const t of trunk) {
    const m = Array.isArray(t.material) ? t.material : [t.material];
    for (const mm of m) mm.side = THREE.DoubleSide;
  }
  let hanging = 0, inside = 0;
  for (let i = 0; i < tinted.length; i += 3) {
    const y = tinted[i + 1];
    if (y > belowY) continue;
    hanging++;
    if (trunk.length && buriedDepth(trunk, tinted[i], y, tinted[i + 2]) > depthBar) inside++;
  }
  return { hanging, inside, frac: hanging ? (100 * inside) / hanging : 0 };
}

const round3 = (a) => a.map((x) => Math.round(x * 1000));
const same = (a, b) => a.length === b.length && round3(a).every((x, i) => x === round3(b)[i]);

console.log("\n[wearsweep] hanging cosmetics against the armour, per class\n");

// ---- collapse assertions ----------------------------------------------------
{
  // Cloak dyes are DIFFERENT GARMENTS sharing one topology: red vs blue drape
  // 0.43 m apart at their worst coordinate (measured, same seed). So the dye
  // dimension does NOT collapse — the hair rows below sweep every dye — and
  // the assertion here is the weaker true one: the topology matches, so a
  // per-dye re-route of the hair cannot hide a vertex-count change.
  const dyes = ["brown", "red", "blue", "gold"];
  const built = dyes.map((cloak) => subject("huscarl", { hairStyle: "shaved", beardStyle: "none", cloak }));
  const counts = built.map((b) => b.cloak.length / 3);
  check("cloak dyes share one topology (counts equal)", counts.every((c) => c === counts[0]),
    `${counts.join("/")} verts — drapes differ by design, so every dye is swept below`);
}
{
  // Armour finish is a dye: it must move no registered station, or the rows
  // below would only hold for the finish they were run at.
  const colors = [0x8a8f98, 0xc9a24a];
  const regs = colors.map((armorColor) => {
    const s = subject("huscarl", { hairStyle: "shaved", beardStyle: "none", armorColor });
    return s.worn.flatMap(({ sts, power }) => sts.flatMap((st) => [st.y, st.hw, st.hd, power]));
  });
  check("armour dye moves no registered station (steel vs gold)", same(regs[0], regs[1]),
    `${regs[0].length / 4} stations each — the rows below hold for every finish`);
}

/**
 * Where "hanging" begins, PER SUBJECT: 20 mm under the top edge of the
 * highest registered garment. A fixed 1.48 was huscarl anatomy hard-coded —
 * classes differ in height, and a taller man's collar band sits above a
 * threshold tuned on a shorter one, which turns his rows into absent cases
 * that read as green.
 */
function collarOf(worn) {
  let top = -Infinity;
  for (const { sts } of worn) if (sts[0].y > top) top = sts[0].y;
  return top - 0.02;
}

/** A row is only a row when the case exists; the grounding is printed either way. */
function judge(label, s, cls) {
  const total = s.tinted.length / 3;
  if (!s.worn.length || !s.trunk.length) {
    console.log(`  ${label}  — nothing on the trunk; structurally absent (${total} cosmetic verts)`);
    return;
  }
  if (!total) {
    check(`${label}: cosmetic vertices found by tint`, false, "0 tinted vertices — the tint trick missed; row VOID");
    return;
  }
  const hangBelow = collarOf(s.worn);
  const r = fracInside(s.tinted, s.trunk, hangBelow, DEPTH(cls));
  if (!r.hanging) {
    let minY = Infinity;
    for (let i = 1; i < s.tinted.length; i += 3) if (s.tinted[i] < minY) minY = s.tinted[i];
    console.log(`  ${label}  — no case: lowest of ${total} verts ends ${((minY - hangBelow) * 1000).toFixed(0)} mm above the armour's top edge`);
    return;
  }
  check(`${label}: stays out of the armour`, r.frac <= BAR_PCT,
    `${r.frac.toFixed(1)}% of ${r.hanging} hanging vertices deeper than ${DEPTH(cls) * 1000} mm (${total} total)`);
}

// ---- hair, against the trunk, under every cloak -----------------------------
console.log("\n  hair vs trunk armour, every dye of every cloak");
for (const cls of ["huscarl", "warden", "runekeeper", "berserker"]) {
  for (const hairStyle of ["long", "braids"]) {
    for (const cloak of ["none", "brown", "red", "blue", "gold"]) {
      const s = subject(cls, { hairStyle, beardStyle: "none", hairColor: TINT, cloak });
      judge(`${cls}/${hairStyle}/cloak=${cloak}`, s, cls);
    }
  }
}

// ---- beards vs the chest ----------------------------------------------------
console.log("\n  beard vs chest armour");
for (const cls of ["huscarl", "warden", "runekeeper", "berserker"]) {
  for (const beardStyle of ["full", "forked", "braided"]) {
    const s = subject(cls, { hairStyle: "shaved", beardStyle, beardColor: TINT });
    judge(`${cls}/${beardStyle} beard`, s, cls);
  }
}

console.log(`\n${fail ? "FAIL" : "PASS"}: hanging cosmetics against the armour — ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
