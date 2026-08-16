#!/usr/bin/env node
// ============================================================
// RUNGCENSUS — did anything a player paid for lose a PIECE or a TRIANGLE?
//
//   node tools/rungcensus.mjs --save base.json     # record this tree
//   node tools/rungcensus.mjs --against base.json  # and hold the next one to it
//
// WHY THIS EXISTS, AND IT IS INSTANCE SEVENTEEN.
//
// `tools/cosmetictest.mjs:233` is `const RIG = { cls: "huscarl", ... }`. It
// builds ONE CLASS. Round seven changed the warden, the berserker and the
// runekeeper and did not touch the huscarl, so every cell it moved was invisible
// to the gate — and "cosmetictest holds main's baseline exactly" was a tautology
// rather than a proof. Both agents in that round cited it as their evidence that
// nothing paid had been taken away.
//
// Three separate rounds before that tried to pass a gate by DELETING content —
// three paid beards in one, 7680 triangles of hair in another, two hairstyles
// made pixel-identical to Shaved in a third — and each was caught by an
// adversary counting vertices by hand, after the fact. This is that count, in
// the tree, over the whole shop:
//
//   4 classes x 10 helms x 9 hair-and-beard rungs = 360 cells,
//   each counted twice: scoped to `rig:headPivot`, and over the WHOLE RIG.
//
// WHY BOTH SCOPES. `rig:neck` is a SIBLING of `rig:headPivot`, not a child —
// six rounds of `helmclash` measured a head with no neck in it for exactly that
// reason. A count taken under the pivot alone would have the identical hole, and
// a piece that moved from one scope to the other would read as a loss in one and
// a gain in the other rather than as the move it is.
//
// WHAT A "PIECE" IS. One connected component of the welded index graph: vertices
// merged by position to a tenth of a millimetre, then union-find over every
// triangle's three edges. That is the count that catches a deletion a triangle
// total can hide — swap a 300-triangle braid for a 300-triangle slab and the
// triangles agree while the pieces do not — and it is the count an adversary ran
// by hand over round seven's landing.
//
// THE BAR IS ZERO. Not "no significant change": zero cells losing a component,
// zero cells losing a triangle. Content may be ADDED — a curtain that grows to
// cover a nape is content — and gains are printed but never a failure.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import * as THREE from "three";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".rungcensus");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/characters.ts", "--outDir", ".rungcensus",
  "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(d, e.name)) : e.name === "characters.js" && found.push(resolve(d, e.name)); };
walk(OUT);
if (!found[0]) {
  console.error("[census] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || ""));
  process.exit(2);
}
const { buildCharacter, defaultAppearance, HELM } = await import(pathToFileURL(found[0]).href);

const CLASSES = ["huscarl", "warden", "berserker", "runekeeper"];
const HELMS = Object.keys(HELM);
const SEED = Number(flag("seed", "13"));
const LOD = "high";

// The same two ladders `helmclash` sweeps, and for the same reason: the shop's
// other six slots are tints and a cloak, and neither can put a surface inside a
// helmet. Deduplicated by what they BUILD, so a class whose default beard is one
// of the rungs does not get counted twice.
const BEARD_RUNGS = ["none", "short", "full", "forked", "braided"];
const HAIR_RUNGS = ["shaved", "short", "long", "braids"];
function getupsOf(cls) {
  const d = defaultAppearance(cls);
  const list = [], seen = new Set();
  const add = (name, hairStyle, beardStyle) => {
    const k = `${hairStyle}/${beardStyle}`;
    if (seen.has(k)) return;
    seen.add(k);
    list.push({ name, hairStyle, beardStyle });
  };
  add("default", d.hairStyle, d.beardStyle);
  for (const b of BEARD_RUNGS) add(`beard=${b}`, d.hairStyle, b);
  for (const h of HAIR_RUNGS) add(`hair=${h}`, h, d.beardStyle);
  return list;
}

/**
 * Components and triangles of one mesh, welded by position.
 *
 * The weld is what makes this a count of PIECES and not of draw calls: a shell
 * built as one grid but emitted as three index bands is one piece, and it has to
 * read as one or every band split would look like a gain.
 */
function countMesh(geom) {
  const pos = geom.attributes?.position;
  if (!pos) return { comp: 0, tris: 0 };
  const idx = geom.index ? geom.index.array : null;
  const n = idx ? idx.length : pos.count;
  const tris = Math.floor(n / 3);
  // Weld to 0.1 mm. Finer than any tessellation in the file and coarser than
  // the float noise two shells sharing a rim come out with.
  const key = new Map();
  const rep = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    let r = key.get(k);
    if (r === undefined) { r = i; key.set(k, i); }
    rep[i] = r;
  }
  const parent = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) parent[i] = rep[i];
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const uni = (a, b) => { const ra = find(rep[a]), rb = find(rep[b]); if (ra !== rb) parent[ra] = rb; };
  const at = (i) => (idx ? idx[i] : i);
  const used = new Set();
  for (let t = 0; t < tris; t++) {
    const a = at(t * 3), b = at(t * 3 + 1), c = at(t * 3 + 2);
    uni(a, b); uni(b, c);
    used.add(rep[a]); used.add(rep[b]); used.add(rep[c]);
  }
  const roots = new Set();
  for (const v of used) roots.add(find(v));
  return { comp: roots.size, tris };
}

/**
 * WHICH PEOPLE THE CENSUS DRESSES THE MAN IN — `--people norse`, default unsworn.
 *
 * INSTANCE EIGHTEEN, AND IT IS THE SAME SHAPE AS THE SEVENTEEN IN THE HEADER.
 * `docs/BACKLOG.md` 4.3 added a faction livery to `Appearance`, and every one
 * of the 320 cells below was built with `defaultAppearance`, which is the
 * UNSWORN — so this census proved that swearing takes nothing off a man only
 * in the case where nobody had sworn. That is exactly `cosmetictest`'s
 * one-class hole with a different field in it.
 *
 * The livery is colour and not geometry, so all five runs SHOULD read
 * identically, and a run that does not is a livery that has started deleting
 * content. The bar is the same bar: zero components lost, zero triangles lost,
 * against a baseline recorded on the tree before the change.
 *
 *   node tools/rungcensus.mjs --save base.json                    # on origin/main
 *   for p in "" saxon norse briton pict; do
 *     node tools/rungcensus.mjs --against base.json --people "$p"
 *   done
 */
const PEOPLE = flag("people", "none");

/** One cell: the head-pivot scope and the whole rig, as two pairs. */
function census(cls, helm, g) {
  const root = buildCharacter(cls, {
    ...defaultAppearance(cls), helm, hairStyle: g.hairStyle, beardStyle: g.beardStyle,
    people: PEOPLE,
  }, 0x8a6b3f, undefined, LOD, SEED).group;
  root.updateMatrixWorld(true);
  let pivot = null;
  root.traverse((o) => { if (!pivot && o.name === "rig:headPivot") pivot = o; });
  if (!pivot) {
    console.error(`[census] ${cls}/${helm}: no rig:headPivot in the rig`);
    process.exit(2);
  }
  const under = (o) => { for (let c = o; c; c = c.parent) if (c === pivot) return true; return false; };
  let hc = 0, ht = 0, rc = 0, rt = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const { comp, tris } = countMesh(o.geometry);
    rc += comp; rt += tris;
    if (under(o)) { hc += comp; ht += tris; }
  });
  return { head: [hc, ht], rig: [rc, rt] };
}

const table = {};
let cells = 0;
for (const cls of CLASSES) {
  for (const helm of HELMS) {
    for (const g of getupsOf(cls)) {
      table[`${cls}|${helm}|${g.name}`] = census(cls, helm, g);
      cells++;
    }
  }
}

const save = flag("save", null);
const against = flag("against", null);
console.log(`[census] livery: ${PEOPLE}`);
console.log(`[census] ${cells} cells — ${CLASSES.length} classes x ${HELMS.length} helms x ${cells / (CLASSES.length * HELMS.length)} rungs, seed ${SEED}, lod ${LOD}`);
let headC = 0, headT = 0, rigC = 0, rigT = 0;
for (const v of Object.values(table)) { headC += v.head[0]; headT += v.head[1]; rigC += v.rig[0]; rigT += v.rig[1]; }
console.log(`[census] totals: head-pivot ${headC} components / ${headT} triangles; whole rig ${rigC} / ${rigT}`);

if (save) {
  writeFileSync(resolve(ROOT, save), JSON.stringify(table));
  console.log(`[census] saved ${save}`);
}
if (!against) {
  console.log("[census] no --against baseline given, so nothing is asserted. This run RECORDS, it does not gate.");
  process.exit(0);
}
if (!existsSync(resolve(ROOT, against))) {
  console.error(`[census] baseline ${against} not found — a missing baseline is not a pass`);
  process.exit(2);
}
const base = JSON.parse(readFileSync(resolve(ROOT, against), "utf8"));
const baseKeys = Object.keys(base);
if (!baseKeys.length) { console.error("[census] baseline is empty — not a pass"); process.exit(2); }
let losses = 0, gains = 0, same = 0, missing = 0;
console.log("");
console.log("[census] cell                                   scope   comp        tri");
console.log("[census] --------------------------------------------------------------------");
for (const k of baseKeys) {
  const b = base[k], a = table[k];
  if (!a) {
    // A RUNG THAT STOPPED EXISTING. Retiring a style is how a fixer buys a clean
    // sheet, so it is the loudest failure here and not a skipped row.
    missing++; losses++;
    console.log(`[census] ${k.padEnd(42)}  —      RUNG GONE FROM THE SHOP   FAIL`);
    continue;
  }
  for (const scope of ["head", "rig"]) {
    const dc = a[scope][0] - b[scope][0], dt = a[scope][1] - b[scope][1];
    if (dc === 0 && dt === 0) { same++; continue; }
    const bad = dc < 0 || dt < 0;
    if (bad) losses++; else gains++;
    console.log(`[census] ${k.padEnd(42)} ${scope.padEnd(5)} ${(dc >= 0 ? "+" : "") + dc}`.padEnd(66) +
      `${(dt >= 0 ? "+" : "") + dt}${bad ? "   FAIL" : ""}`);
  }
}
for (const k of Object.keys(table)) if (!base[k]) console.log(`[census] ${k} is NEW since the baseline`);
console.log("");
console.log(`[census] ${same} scope-readings identical, ${gains} gained, ${losses} LOST, ${missing} rungs gone`);
console.log(`[census] ${losses ? "FAIL" : "PASS"}: the bar is zero paid rungs losing a component or a triangle`);
process.exit(losses ? 1 : 0);
