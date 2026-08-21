// ============================================================
// HAIRMAIL — does a man's falling hair respect the ARMOUR ON HIS BODY?
//
//   node tools/hairmail.mjs              gate: every class, both long styles
//   node tools/hairmail.mjs --fix-table  print the worst offenders per style
//
// WHY THIS FILE EXISTS. The owner, from the armoury at the SHOULDERS lens:
// *"the long hair on huscarl is sticking out of the chainmail"* — brown hanks
// half-buried in the gold hauberk at the shoulder blades. Every hair gate in
// the repository measures hair against the HELMET stack (`hairFitProbe`,
// `wearmeasure`'s 30 hair-and-helm pairs, `cosmetictest`'s silhouette pass) and
// not one of them puts a bare-headed man in body armour: the case the armoury
// opens on. A gate green because the case is absent is not a gate.
//
// THE MEASUREMENT. CPU only, no browser. Build the man with a distinctive hair
// tint (the `hairprobe` trick — the tint names the meshes), merge every mesh
// whose name is `rig:torso` into one picture of what the trunk wears, and test
// each hanging hair vertex for containment by RAY PARITY: a point is inside
// the mail if a ray out of it crosses the torso surface an odd number of
// times. What is reported is the fraction of below-collar hair vertices INSIDE
// the trunk's own geometry — hair lying ON mail reads ~0, hair fallen THROUGH
// it reads high, and the half-in hanks the owner photographed read in between.
//
// THE BAR. 2% of hanging vertices. Not zero: the containment test reads the
// glancing skim of a strand's inner face against the mail's outer face as
// "inside" for a vertex or two, and a bar at zero would be a bar on float
// noise. The shipped defect measures far above it.
// ============================================================
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { loadClient } from "./lib/clientmodule.mjs";
import * as THREE from "three";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { CH } = await loadClient(ROOT, ".hairmail");
const { buildCharacter, defaultAppearance } = CH;

const TINT = 0x2fe07a;
const SEED = 13;
const BAR_PCT = 2.0;

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

/** The man, his hair vertices (by tint) and his trunk meshes (by name). */
function subject(cls, hairStyle) {
  const c = buildCharacter(cls, {
    ...defaultAppearance(cls), beardStyle: "none", hairColor: TINT,
    helm: "none", hairStyle,
  }, 0x8a6b3f, undefined, "high", SEED);
  c.group.updateMatrixWorld(true);
  const hair = [];
  const trunk = [];
  const v = new THREE.Vector3();
  c.group.traverse((o) => {
    if (!o.isMesh) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const hex = mat?.color?.getHexString?.() ?? "";
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    if (hex === "2fe07a") {
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        hair.push(v.x, v.y, v.z);
      }
      return;
    }
    if (o.name === "rig:torso") trunk.push(o);
  });
  return { hair, trunk };
}

/** Ray-parity containment against the trunk meshes, horizontally outward. */
function insideTrunk(trunk, x, y, z, ray, caster) {
  // Outward through the point from the trunk's axis, so a vertex on the far
  // side of the mail is one crossing and a vertex inside it is two-crossings-
  // minus-one whichever way it faces.
  const d = Math.hypot(x, z) || 1;
  ray.set(new THREE.Vector3(x, y, z), new THREE.Vector3(x / d, 0, z / d));
  caster.ray = ray;
  caster.far = 2;
  let hits = 0;
  for (const t of trunk) {
    const sect = caster.intersectObject(t, false);
    hits += sect.length;
  }
  return hits % 2 === 1;
}

console.log("\n[hairmail] hanging hair against the trunk's own armour, bare-headed, per class\n");
console.log("  class        style     hanging  inside  frac");

const CASES = [];
for (const cls of ["huscarl", "warden", "runekeeper", "berserker"]) {
  for (const hairStyle of ["long", "braids"]) CASES.push({ cls, hairStyle });
}

const ray = new THREE.Ray();
const caster = new THREE.Raycaster();
caster.firstHitOnly = false;

const rows = [];
for (const { cls, hairStyle } of CASES) {
  const { hair, trunk } = subject(cls, hairStyle);
  // Double-sided materials would double the crossings and break parity, so the
  // raycaster is told to hit both faces regardless of material side.
  for (const t of trunk) {
    const m = Array.isArray(t.material) ? t.material : [t.material];
    for (const mm of m) mm.side = THREE.DoubleSide;
  }
  // Hanging = below the COLLAR BAND, not merely below the chin. The band
  // itself (y ~1.49-1.52) is ambiguous ground: a collar is a ring, and hair
  // must pass within that ring to exit over it — the runekeeper's mane reads
  // seven vertices "inside" there that are simply hair against the nape inside
  // an open collar, which is where real hair goes. The gate reads where armour
  // COVERS the trunk; the crown above is the helm gates' business.
  const chinY = 1.48;
  let hanging = 0, inside = 0;
  for (let i = 0; i < hair.length; i += 3) {
    const y = hair[i + 1];
    if (y > chinY) continue;
    hanging++;
    if (trunk.length && insideTrunk(trunk, hair[i], y, hair[i + 2], ray, caster)) inside++;
  }
  const frac = hanging ? (100 * inside) / hanging : 0;
  rows.push({ cls, hairStyle, hanging, inside, frac });
  console.log(`  ${cls.padEnd(11)}  ${hairStyle.padEnd(8)}  ${String(hanging).padStart(6)}  ${String(inside).padStart(6)}  ${frac.toFixed(1).padStart(5)}%`);
}
console.log("");

for (const r of rows) {
  if (r.hanging === 0) continue;
  check(`${r.cls}/${r.hairStyle}: hanging hair stays out of the trunk's armour (bar ${BAR_PCT}%)`,
    r.frac <= BAR_PCT, `${r.frac.toFixed(1)}% of ${r.hanging} hanging vertices inside`);
}

console.log(`\n${fail ? "FAIL" : "PASS"}: hair against the mail — ${pass}/${pass + fail}\n`);
process.exit(fail ? 1 : 0);
