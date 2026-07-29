// ============================================================
// BRETWALDA — Character & Weapon 3D Builders + Armoury Catalog
// ============================================================
import * as THREE from "three";
import type { WarriorClass } from "../types";

// ---------------- Appearance ----------------
export interface Appearance {
  helm: string;      // none | iron | nasal | spectacle | crowned | hood
  hairStyle: string; // shaved | short | long | braids
  hairColor: number;
  beardStyle: string;// none | short | full | forked | braided
  beardColor: number;
  cloak: string;     // none | brown | red | blue | gold
  armorColor: number;
  warPaint: string;  // none | stripes | cross | half
}

export interface PlayerAppearanceHolder {
  appearance?: Appearance;
}

export function defaultAppearance(cls: WarriorClass): Appearance {
  return {
    helm: cls === "runekeeper" ? "hood" : cls === "huscarl" ? "nasal" : "iron",
    hairStyle: "short",
    hairColor: 0x6b4a2a,
    beardStyle: cls === "berserker" ? "full" : "short",
    beardColor: 0x6b4a2a,
    cloak: cls === "berserker" ? "brown" : cls === "runekeeper" ? "blue" : "red",
    armorColor: 0x4a5568,
    warPaint: "none",
  };
}

// ---------------- Armoury Catalog ----------------
export interface ArmouryOption {
  id: string;
  label: string;
  cost: number;
  slot: string;
  value: string | number;
  desc?: string;
}

export const ARMOURY: Array<{ slot: string; label: string; options: ArmouryOption[] }> = [
  {
    slot: "helm", label: "Helmets",
    options: [
      { id: "helm_none", label: "Bare Head", cost: 0, slot: "helm", value: "none" },
      { id: "helm_iron", label: "Iron Spangenhelm", cost: 30, slot: "helm", value: "iron" },
      { id: "helm_nasal", label: "Nasal Helm", cost: 110, slot: "helm", value: "nasal" },
      { id: "helm_hood", label: "Shadow Hood", cost: 120, slot: "helm", value: "hood" },
      { id: "helm_spectacle", label: "Spectacle Helm", cost: 280, slot: "helm", value: "spectacle" },
      { id: "helm_crowned", label: "Jarl's Crowned Helm", cost: 570, slot: "helm", value: "crowned" },
    ],
  },
  {
    slot: "hair", label: "Hair",
    options: [
      { id: "hair_shaved", label: "Shaved", cost: 0, slot: "hair", value: "shaved" },
      { id: "hair_short", label: "Warrior Crop", cost: 0, slot: "hair", value: "short" },
      { id: "hair_long", label: "Long Mane", cost: 40, slot: "hair", value: "long" },
      { id: "hair_braids", label: "Braided War-locks", cost: 100, slot: "hair", value: "braids" },
    ],
  },
  {
    slot: "hairColor", label: "Hair Colour",
    options: [
      { id: "hc_brown", label: "Oak Brown", cost: 0, slot: "hairColor", value: 0x6b4a2a },
      { id: "hc_black", label: "Raven Black", cost: 0, slot: "hairColor", value: 0x1c1712 },
      { id: "hc_blond", label: "Norse Gold", cost: 40, slot: "hairColor", value: 0xb8a14e },
      { id: "hc_red", label: "Fire Red", cost: 30, slot: "hairColor", value: 0x8a3b22 },
      { id: "hc_grey", label: "Greybeard", cost: 30, slot: "hairColor", value: 0x9c9c9c },
      { id: "hc_snow", label: "Snow White", cost: 30, slot: "hairColor", value: 0xe8e4da },
    ],
  },
  {
    slot: "beard", label: "Beards",
    options: [
      { id: "beard_none", label: "Clean Shaven", cost: 0, slot: "beard", value: "none" },
      { id: "beard_short", label: "Stubble", cost: 0, slot: "beard", value: "short" },
      { id: "beard_full", label: "Full Beard", cost: 40, slot: "beard", value: "full" },
      { id: "beard_forked", label: "Forked Beard", cost: 80, slot: "beard", value: "forked" },
      { id: "beard_braided", label: "Ringed Braid", cost: 120, slot: "beard", value: "braided" },
    ],
  },
  {
    slot: "beardColor", label: "Beard Colour",
    options: [
      { id: "bc_brown", label: "Oak Brown", cost: 0, slot: "beardColor", value: 0x6b4a2a },
      { id: "bc_black", label: "Raven Black", cost: 0, slot: "beardColor", value: 0x1c1712 },
      { id: "bc_blond", label: "Norse Gold", cost: 40, slot: "beardColor", value: 0xb8a14e },
      { id: "bc_red", label: "Fire Red", cost: 30, slot: "beardColor", value: 0x8a3b22 },
      { id: "bc_grey", label: "Greybeard", cost: 30, slot: "beardColor", value: 0x9c9c9c },
      { id: "bc_snow", label: "Snow White", cost: 30, slot: "beardColor", value: 0xe8e4da },
    ],
  },
  {
    slot: "cloak", label: "Cloaks",
    options: [
      { id: "cloak_none", label: "No Cloak", cost: 0, slot: "cloak", value: "none" },
      { id: "cloak_brown", label: "Traveller's Cloak", cost: 30, slot: "cloak", value: "brown" },
      { id: "cloak_red", label: "Blood Red Cloak", cost: 90, slot: "cloak", value: "red" },
      { id: "cloak_blue", label: "Sea-Wolf Cloak", cost: 90, slot: "cloak", value: "blue" },
      { id: "cloak_gold", label: "Gilded War Cloak", cost: 400, slot: "cloak", value: "gold" },
    ],
  },
  {
    slot: "armor", label: "Armour Finish",
    options: [
      { id: "armor_iron", label: "Rough Iron", cost: 0, slot: "armor", value: 0x4a5568 },
      { id: "armor_steel", label: "Polished Steel", cost: 30, slot: "armor", value: 0x8a97a5 },
      { id: "armor_dark", label: "Blackened Steel", cost: 130, slot: "armor", value: 0x2a2f38 },
      { id: "armor_bronze", label: "Bronze Scales", cost: 160, slot: "armor", value: 0x8a6a3a },
      { id: "armor_crimson", label: "Crimson Warplate", cost: 120, slot: "armor", value: 0x7a2f2a },
      { id: "armor_seablue", label: "Sea Queen's Gift", cost: 100, slot: "armor", value: 0x2f4a6a },
      { id: "armor_gold", label: "Bretwalda Gold", cost: 510, slot: "armor", value: 0x9a7a2a },
    ],
  },
  {
    slot: "warPaint", label: "War Paint",
    options: [
      { id: "wp_none", label: "None", cost: 0, slot: "warPaint", value: "none" },
      { id: "wp_stripes", label: "Blood Stripes", cost: 40, slot: "warPaint", value: "stripes" },
      { id: "wp_cross", label: "Raven Cross", cost: 70, slot: "warPaint", value: "cross" },
      { id: "wp_half", label: "Half-Face Shadow", cost: 110, slot: "warPaint", value: "half" },
    ],
  },
];

export function freeCosmeticIds(): string[] {
  const ids: string[] = [];
  ARMOURY.forEach((s) => s.options.forEach((o) => { if (o.cost === 0) ids.push(o.id); }));
  return ids;
}

// ---------------- Materials ----------------
// A warrior asks for substances, not colours: mail, wool, leather, skin, steel,
// oak. Where those come from is the caller's business — the arena hands over its
// shared, textured library, so a lobby of eight warriors is a handful of
// programs rather than the 73 fresh MeshStandardMaterials per body this file
// used to allocate.
export interface CharacterMaterials {
  armour(color: number): THREE.MeshStandardMaterial;
  tunic(color: number): THREE.MeshStandardMaterial;
  hide(color: number): THREE.MeshStandardMaterial;
  flesh(color: number): THREE.MeshStandardMaterial;
  blade(color: number, roughness?: number): THREE.MeshStandardMaterial;
  timber(color: number): THREE.MeshStandardMaterial;
  standard(color: number, roughness?: number, metalness?: number): THREE.MeshStandardMaterial;
  get(name: "runeGlow"): THREE.Material;
}

/**
 * Untextured stand-in for callers with no texture library — the armoury preview
 * renders into its own canvas and cannot afford to generate half a megabyte of
 * PBR maps to show one hauberk. Every call allocates, and the caller is expected
 * to dispose what it built.
 */
const RAW: CharacterMaterials = {
  armour: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.55 }),
  tunic: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0 }),
  hide: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0 }),
  flesh: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0 }),
  blade: (c, rough = 0.35) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0.85 }),
  timber: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0 }),
  standard: (c, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }),
  get: () => new THREE.MeshStandardMaterial({ color: 0x66c8ff, emissive: 0x2288dd, emissiveIntensity: 3.5, roughness: 0.4 }),
};

const SKIN = 0xd9a97e;
const SKIN_DARK = 0xc28f63;
const LEATHER = 0x4a3020;

const CLOAK_COLORS: Record<string, number> = {
  brown: 0x5a4030, red: 0x7a2020, blue: 0x24386a, gold: 0xa8842a, none: 0x5a4030,
};

// ---------------- Weapon builders ----------------
export function buildSword(materials?: CharacterMaterials): THREE.Group {
  const M = materials ?? RAW;
  const g = new THREE.Group();
  // Grip (origin = hand)
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.24, 8), M.hide(0x2a1c10));
  grip.position.y = 0.02;
  g.add(grip);
  // Grip wrap rings
  const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 6, 10), M.blade(0x8a6a3a, 0.5));
  wrap.rotation.x = Math.PI / 2; wrap.position.y = 0.08;
  g.add(wrap);
  // Pommel
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), M.blade(0xb8a14e, 0.3));
  pommel.position.y = -0.11;
  g.add(pommel);
  // Crossguard
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.05), M.blade(0x8a97a5, 0.3));
  guard.position.y = 0.16;
  g.add(guard);
  // Blade (pattern-welded: bright edges, darker fuller, tapered)
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.92, 0.02), M.blade(0xdcdee8, 0.16));
  blade.position.y = 0.66;
  blade.scale.x = 1;
  g.add(blade);
  // Edge bevels
  [-1, 1].forEach((s) => {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.9, 0.024), M.blade(0xf0f4fa, 0.12));
    edge.position.set(s * 0.04, 0.66, 0);
    g.add(edge);
  });
  // Fuller (dark groove)
  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.86, 0.022), M.blade(0x50565e, 0.5));
  fuller.position.y = 0.68;
  g.add(fuller);
  // Tip
  const tipMesh = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.16, 4), M.blade(0xf0f4fa, 0.12));
  tipMesh.position.y = 1.2;
  tipMesh.scale.z = 0.35;
  g.add(tipMesh);
  return g;
}

export function buildDagger(materials?: CharacterMaterials): THREE.Group {
  const M = materials ?? RAW;
  const g = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.16, 8), M.hide(0x1f2a3a));
  g.add(grip);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.04), M.blade(0x6a8ab8, 0.35));
  guard.position.y = 0.09;
  g.add(guard);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.014), M.blade(0xc8e0f8, 0.18));
  blade.position.y = 0.35;
  g.add(blade);
  const tipMesh = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), M.blade(0xc8e0f8, 0.18));
  tipMesh.position.y = 0.62; tipMesh.scale.z = 0.28;
  g.add(tipMesh);
  // Rune etching glow
  const rune = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.3, 0.016), M.get("runeGlow"));
  rune.position.y = 0.4;
  g.add(rune);
  return g;
}

export function buildAxe(materials?: CharacterMaterials): THREE.Group {
  const M = materials ?? RAW;
  const g = new THREE.Group();
  // Long haft
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.04, 1.5, 8), M.timber(0x5a3c22));
  haft.position.y = 0.45;
  g.add(haft);
  // Langets (metal strips on haft)
  [-1, 1].forEach((s) => {
    const langet = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.42, 0.05), M.blade(0x757b83, 0.45));
    langet.position.set(s * 0.045, 1.04, 0);
    g.add(langet);
  });
  // Axe head — bearded Danish axe blade
  const headGroup = new THREE.Group();
  const headCore = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.05), M.blade(0x8a9098, 0.28));
  headGroup.add(headCore);
  // Sweeping crescent blade edge
  const edge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 0.048, 28, 1, false, -Math.PI * 0.24, Math.PI * 0.5),
    M.blade(0xdfe6ee, 0.12)
  );
  edge.rotation.z = Math.PI / 2;
  edge.scale.set(1, 1, 0.72);
  edge.position.set(0.12, -0.04, 0);
  headGroup.add(edge);
  // Mail collar (top wedge)
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.055), M.blade(0x757b83, 0.4));
  collar.position.y = 0.18;
  headGroup.add(collar);
  // Poll
  const poll = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), M.blade(0x757b83, 0.4));
  poll.position.x = -0.07;
  headGroup.add(poll);
  headGroup.position.set(0, 1.16, 0);
  g.add(headGroup);
  // Leather grip wrap near top
  const wrap2 = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.14, 8), M.hide(0x3a2a18));
  wrap2.position.y = 0.28;
  g.add(wrap2);
  return g;
}

export function buildShield(color = 0x6b4226, materials?: CharacterMaterials): THREE.Group {
  const M = materials ?? RAW;
  const g = new THREE.Group();
  // Planking: two-tone wedges (alternate circles slightly offset in shade)
  const board = new THREE.Mesh(new THREE.CircleGeometry(0.52, 24), M.timber(color));
  g.add(board);
  // Turned to face away, so this is the back of the shield rather than a second
  // copy of the front hidden behind the first. Both discs are single-sided, so
  // without it a shield seen from behind is an iron rim around nothing.
  const boardDark = new THREE.Mesh(new THREE.CircleGeometry(0.52, 24), M.timber(0x3a2a18));
  boardDark.position.z = -0.006;
  boardDark.rotation.y = Math.PI;
  g.add(boardDark);
  // Painted cross pattern
  const paint1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5), M.timber(0xc9b48a));
  paint1.rotation.x = Math.PI / 2;
  paint1.position.z = 0.004;
  g.add(paint1);
  // Iron rim
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.02, 6, 32), M.blade(0x7a828c, 0.4));
  g.add(rim);
  // Boss
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.blade(0xc9b48a, 0.25));
  boss.rotation.x = Math.PI / 2;
  boss.position.z = 0.05;
  g.add(boss);
  // Rivets
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), M.blade(0xb8b088, 0.3));
    rivet.position.set(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0.012);
    g.add(rivet);
  }
  return g;
}

// ---------------- Character builder ----------------
export interface BuiltCharacter {
  group: THREE.Group;
  rightArm: THREE.Group;
  leftArm: THREE.Group;
  rightLeg: THREE.Group;
  leftLeg: THREE.Group;
  head: THREE.Group;
  cloak?: THREE.Group;
  torso: THREE.Mesh;
}

export function buildCharacter(
  cls: WarriorClass,
  ap: Appearance,
  accents: number,
  materials?: CharacterMaterials,
): BuiltCharacter {
  const M = materials ?? RAW;
  const root = new THREE.Group();

  const armorMat = M.armour(ap.armorColor);
  const clothDark = M.tunic(0x3a2c1c);
  const accentMat = M.tunic(accents);

  // ===== LEGS (pivot at hip, swinging forward/back) =====
  function buildLeg(side: number): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.16, 0.82, 0);
    const trouser = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.082, 0.42, 12), clothDark);
    trouser.position.y = -0.21;
    pivot.add(trouser);
    // Wool leg wraps
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.078, 0.22, 10), M.tunic(0x8a7a5a));
    wrap.position.y = -0.5;
    pivot.add(wrap);
    // Boot (toe + heel)
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.3), M.hide(0x2a1c10));
    boot.position.set(0, -0.73, 0.05);
    boot.scale.x = 0.95;
    pivot.add(boot);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), M.hide(0x2a1c10));
    toe.scale.set(1, 0.7, 1.4);
    toe.position.set(0, -0.76, 0.19);
    pivot.add(toe);
    return pivot;
  }
  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);
  root.add(leftLeg, rightLeg);

  // ===== TORSO =====
  // Tunic
  const tunic = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.43, 0.78, 14), accentMat);
  tunic.position.y = 1.22;
  root.add(tunic);
  // Mail hauberk (armoured chest) with chest bulge
  const mail = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.5, 14), armorMat);
  mail.position.y = 1.38;
  root.add(mail);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), armorMat);
  chest.scale.set(1, 0.75, 0.82);
  chest.position.set(0, 1.5, 0.04);
  root.add(chest);
  // Chest plate rim
  const rimBelt = new THREE.Mesh(new THREE.TorusGeometry(0.375, 0.03, 6, 14), M.blade(0xb8a14e, 0.4));
  rimBelt.rotation.x = Math.PI / 2;
  rimBelt.position.y = 1.58;
  root.add(rimBelt);
  // Belt
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.045, 6, 14), M.hide(0x2a1c10));
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.92;
  root.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.03), M.blade(0xb8a14e, 0.3));
  buckle.position.set(0, 0.92, 0.39);
  root.add(buckle);
  // Skirt (mail/tunic lower)
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.28, 10), clothDark);
  skirt.position.y = 0.78;
  root.add(skirt);
  const torso = tunic;

  // Class flair
  if (cls === "berserker") {
    // Fur pelt (squashed down & back so it never clips the neck/head)
    const pelt = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 9), M.tunic(0x6a4a2c));
    pelt.scale.set(1.05, 0.42, 0.8);
    pelt.position.set(0, 1.56, -0.06);
    root.add(pelt);
    // Cross strap
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.62, 0.03), M.hide(0x3a2a18));
    strap.rotation.z = 0.6;
    strap.position.set(-0.06, 1.36, 0.37);
    root.add(strap);
  }
  if (cls === "runekeeper") {
    // Rune amulet (clear of the mail rim)
    const am = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), M.get("runeGlow"));
    am.position.set(0, 1.44, 0.42);
    root.add(am);
    // cord
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 4), M.hide(0x3a2a18));
    cord.rotation.x = 0.5;
    cord.position.set(0, 1.55, 0.3);
    root.add(cord);
  }

  // ===== ARMS (pivot at shoulder) =====
  function buildArm(side: number): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.53, 1.57, 0);
    // Pauldron (ridge + cap)
    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), armorMat);
    pauldron.position.set(side * 0.01, 0.05, 0);
    pivot.add(pauldron);
    const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.018, 6, 16, Math.PI), armorMat);
    ridge.position.y = 0.06;
    ridge.rotation.y = Math.PI / 2;
    pivot.add(ridge);
    // Upper arm (tunic sleeve)
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.078, 0.3, 10), accentMat);
    upper.position.y = -0.16;
    pivot.add(upper);
    // Elbow
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M.hide(0x5a463a));
    elbow.position.y = -0.32;
    pivot.add(elbow);
    // Forearm (skin + leather bracer)
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.058, 0.24, 10), M.flesh(SKIN));
    fore.position.y = -0.44;
    pivot.add(fore);
    const bracer = new THREE.Mesh(new THREE.CylinderGeometry(0.076, 0.066, 0.14, 10), M.hide(LEATHER));
    bracer.position.y = -0.5;
    pivot.add(bracer);
    if (cls === "runekeeper") {
      const etch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), M.get("runeGlow"));
      etch.position.set(side * 0.07, -0.5, 0.02);
      pivot.add(etch);
    }
    // Hand
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), M.flesh(SKIN_DARK));
    hand.position.y = -0.62;
    pivot.add(hand);
    return pivot;
  }
  const rightArm = buildArm(1);
  const leftArm = buildArm(-1);
  root.add(rightArm, leftArm);

  // Weapon mounts — at the fists. POSITIVE X-rotation swings the
  // builder's +Y blade FORWARD toward the enemy (+Z), tipped slightly up.
  const rightHand = new THREE.Group();
  rightHand.position.set(0.05, -0.68, 0.04);
  rightHand.rotation.set(1.28, 0, 0);
  rightHand.name = "handMount";
  rightArm.add(rightHand);
  const leftHand = new THREE.Group();
  leftHand.position.set(-0.05, -0.62, 0.06);
  leftHand.rotation.set(1.28, 0, 0);
  leftHand.name = "handMount";
  leftArm.add(leftHand);

  // ===== HEAD =====
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.78, 0);
  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.115, 0.12, 10), M.flesh(SKIN_DARK));
  neck.position.y = 0;
  headPivot.add(neck);
  // Skull + jaw (smooth)
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.205, 20, 16), M.flesh(SKIN));
  skull.position.y = 0.16;
  skull.scale.set(1, 1.05, 1.02);
  headPivot.add(skull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 12), M.flesh(SKIN_DARK));
  jaw.position.set(0, 0.055, 0.045);
  jaw.scale.set(0.92, 0.75, 0.95);
  headPivot.add(jaw);
  // Cheeks — flush against the jaw, not poking through
  [-1, 1].forEach((s) => {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 8), M.flesh(SKIN));
    cheek.position.set(s * 0.105, 0.065, 0.15);
    cheek.scale.set(1, 0.8, 0.85);
    headPivot.add(cheek);
  });
  // Nose (shorter — no javelin)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 8), M.flesh(SKIN_DARK));
  nose.rotation.x = Math.PI / 2.35;
  nose.position.set(0, 0.135, 0.205);
  headPivot.add(nose);
  // Ears
  [-1, 1].forEach((s) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), M.flesh(SKIN));
    ear.position.set(s * 0.195, 0.13, 0.01);
    ear.scale.set(0.55, 0.95, 0.7);
    headPivot.add(ear);
  });
  // Brows ON the skull surface (z≈0.205), not buried inside
  [-1, 1].forEach((s) => {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.018, 0.018), M.tunic(ap.hairColor));
    brow.position.set(s * 0.075, 0.195, 0.185);
    brow.rotation.x = -0.1;
    headPivot.add(brow);
  });
  // Eyes ON the skull surface
  [-1, 1].forEach((s) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), M.standard(0x1a1208, 0.3));
    eye.position.set(s * 0.075, 0.155, 0.185);
    eye.scale.set(1, 1, 0.55);
    headPivot.add(eye);
  });

  // ----- HAIR -----
  const hairMat = M.tunic(ap.hairColor);
  if (ap.hairStyle !== "shaved") {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.215, 16, 12, 0, Math.PI * 2, 0, Math.PI * (ap.hairStyle === "short" ? 0.38 : 0.5)), hairMat);
    cap.position.y = 0.235;
    cap.rotation.x = -0.12; // tilt hairline back off the brow
    headPivot.add(cap);
    if (ap.hairStyle === "long") {
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.34, 8), hairMat);
      back.position.set(0, 0.0, -0.06);
      headPivot.add(back);
    }
    if (ap.hairStyle === "braids") {
      [-1, 1].forEach((s) => {
        for (let i = 0; i < 3; i++) {
          const seg = new THREE.Mesh(new THREE.SphereGeometry(0.038 - i * 0.006, 6, 6), hairMat);
          seg.position.set(s * 0.155, 0.05 - i * 0.085, -0.06);
          headPivot.add(seg);
        }
      });
    }
  }

  // ----- BEARD (no chest migration — measured to stop at the jaw) -----
  const beardMat = M.tunic(ap.beardColor);
  if (ap.beardStyle !== "none") {
    if (ap.beardStyle === "short") {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 8), beardMat);
      b.position.set(0, 0.0, 0.09);
      b.scale.set(0.9, 0.62, 0.72);
      headPivot.add(b);
    } else if (ap.beardStyle === "full") {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.24, 8), beardMat);
      b.rotation.x = Math.PI;
      b.position.set(0, -0.06, 0.11);
      headPivot.add(b);
      // Moustache (not floating mid-air)
      const mo = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.022, 0.025), beardMat);
      mo.position.set(0, 0.045, 0.19);
      headPivot.add(mo);
    } else if (ap.beardStyle === "forked") {
      [-0.055, 0.055].forEach((x) => {
        const b = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), beardMat);
        b.rotation.x = Math.PI;
        b.rotation.z = x * 2.2;
        b.position.set(x, -0.075, 0.105);
        headPivot.add(b);
      });
    } else if (ap.beardStyle === "braided") {
      for (let i = 0; i < 3; i++) {
        const seg = new THREE.Mesh(new THREE.SphereGeometry(0.06 - i * 0.012, 6, 6), beardMat);
        seg.position.set(0, -0.01 - i * 0.075, 0.115);
        headPivot.add(seg);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 10), M.blade(0xb8a14e, 0.3));
      ring.position.set(0, -0.14, 0.115);
      headPivot.add(ring);
    }
  }

  // ----- WAR PAINT -----
  if (ap.warPaint !== "none") {
    const paintMat = M.standard(ap.warPaint === "cross" ? 0x223a66 : 0x7a2015, 0.9);
    if (ap.warPaint === "stripes") {
      for (let i = -1; i <= 1; i++) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.01), paintMat);
        st.position.set(-0.1, 0.13, 0.2 + i * 0.02);
        st.rotation.y = -0.5;
        headPivot.add(st);
      }
    } else if (ap.warPaint === "cross") {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.01), paintMat);
      v.position.set(0, 0.24, 0.17);
      headPivot.add(v);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.01), paintMat);
      h.position.set(0, 0.2, 0.18);
      headPivot.add(h);
    } else if (ap.warPaint === "half") {
      const half = new THREE.Mesh(new THREE.SphereGeometry(0.215, 8, 8, Math.PI / 2, Math.PI / 2, 0, Math.PI), paintMat);
      half.position.set(0.02, 0.15, 0.01);
      headPivot.add(half);
    }
  }

  // ----- HELMS -----
  const ironMat = M.blade(0x8a9099, 0.3);
  if (ap.helm === "iron" || ap.helm === "nasal" || ap.helm === "spectacle" || ap.helm === "crowned") {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.245, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.46), ironMat);
    cap.position.y = 0.245;
    headPivot.add(cap);
    // Rim band (sits over hair ears)
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.228, 0.022, 8, 18), ironMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.18;
    headPivot.add(band);
    if (ap.helm !== "iron") {
      // Nose guard — drops from the brim to cover the bridge of the nose
      const ng = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.14, 0.022), ironMat);
      ng.position.set(0, 0.1, 0.245);
      headPivot.add(ng);
    }
    if (ap.helm === "spectacle" || ap.helm === "crowned") {
      // Face plate in FRONT of the skull — eyes/nose stay clear behind it
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.17, 0.022), ironMat);
      plate.position.set(0, 0.175, 0.235);
      plate.rotation.x = -0.05;
      headPivot.add(plate);
      [-1, 1].forEach((s) => {
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.028, 0.025), M.standard(0x0a0a0a, 0.85));
        slit.position.set(s * 0.08, 0.19, 0.25);
        headPivot.add(slit);
      });
      // Rivets on the brim band
      [-0.15, 0.15].forEach((x) => {
        const riv = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), M.blade(0xb8a14e, 0.3));
        riv.position.set(x, 0.105, 0.22);
        headPivot.add(riv);
      });
    }
    if (ap.helm === "crowned") {
      const crown = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.028, 6, 14), M.blade(0xd8b84a, 0.25));
      crown.rotation.x = Math.PI / 2;
      crown.position.y = 0.24;
      headPivot.add(crown);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 4), M.blade(0xd8b84a, 0.25));
        spike.position.set(Math.cos(a) * 0.225, 0.3, Math.sin(a) * 0.225);
        headPivot.add(spike);
      }
    }
  } else if (ap.helm === "hood") {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), M.tunic(0x24304a));
    hood.position.y = 0.18;
    hood.scale.z = 1.15;
    headPivot.add(hood);
    const drape = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.3, 8), M.tunic(0x24304a));
    drape.position.set(0, -0.02, -0.08);
    headPivot.add(drape);
  }

  root.add(headPivot);

  // ===== CLOAK (slung from a shoulder yoke, never through pauldrons) =====
  let cloak: THREE.Group | undefined;
  if (ap.cloak !== "none") {
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.6, -0.34);
    const clothMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.1, 0.035), M.tunic(CLOAK_COLORS[ap.cloak] ?? 0x5a4030));
    clothMesh.position.y = -0.58;
    pivot.add(clothMesh);
    // Fold rib down the back for drape
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.05, 0.045), M.tunic(0x2a2018));
    rib.position.y = -0.56;
    rib.position.z = 0.012;
    pivot.add(rib);
    // Shoulder clasp on the LEFT chest (clear of weapons/shield on the right)
    const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), M.blade(0xb8a14e, 0.3));
    clasp.position.set(-0.18, 1.6, 0.28);
    root.add(clasp);
    root.add(pivot);
    cloak = pivot;
  }

  return { group: root, rightArm, leftArm, rightLeg, leftLeg, head: headPivot, cloak, torso };
}

export function buildWeaponForClass(cls: WarriorClass, materials?: CharacterMaterials): THREE.Group {
  if (cls === "runekeeper") return buildDagger(materials);
  if (cls === "berserker") return buildAxe(materials);
  return buildSword(materials);
}
