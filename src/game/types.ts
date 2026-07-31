// ============================================================
// BRETWALDA: BLOOD MOOT — Shared Game Types
// ============================================================

export type GameMode = "honour_duel" | "blood_moot" | "war_band";
export type WarriorClass = "huscarl" | "warden" | "runekeeper" | "berserker";
export type Team = "red" | "blue" | "none";
export type AttackDirection = "left" | "right" | "overhead" | "stab";
export type AttackType = "light" | "heavy";
// Where a blow landed on the body. The server is the only authority on this —
// see deriveHitZone in engine.mjs — so that two clients watching one death
// never disagree about which limb came off.
export type HitZone = "head" | "neck" | "armL" | "armR" | "legL" | "legR" | "torso" | "waist";
export type PlayerState = "idle" | "walking" | "running" | "sprinting" | "attacking" | "blocking" | "dodging" | "rolling" | "staggered" | "dead" | "ability";
export type MatchState = "lobby" | "countdown" | "fighting" | "last_stand" | "finished";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlayerInput {
  moveX: number;
  moveZ: number;
  rotationY: number;
  sprint: boolean;
  attack: boolean;
  heavyAttack: boolean;
  block: boolean;
  dodge: boolean;
  crouch: boolean;
  ability: boolean;
  attackDir: AttackDirection;
}

export interface WarriorStats {
  maxHealth: number;
  moveSpeed: number;
  sprintSpeed: number;
  attackDamage: number;
  heavyDamage: number;
  attackSpeed: number;
  blockReduction: number;
  dodgeDistance: number;
  staminaMax: number;
  staminaRegen: number;
  ability: string;
  abilityCooldown: number;
}

export const WARRIOR_STATS: Record<WarriorClass, WarriorStats> = {
  huscarl: {
    maxHealth: 150,
    moveSpeed: 3.5,
    sprintSpeed: 5.5,
    attackDamage: 18,
    heavyDamage: 30,
    attackSpeed: 0.7,
    blockReduction: 0.8,
    dodgeDistance: 3,
    staminaMax: 100,
    staminaRegen: 15,
    ability: "SHIELD WALL",
    abilityCooldown: 12,
  },
  warden: {
    maxHealth: 120,
    moveSpeed: 4,
    sprintSpeed: 6,
    attackDamage: 20,
    heavyDamage: 35,
    attackSpeed: 0.6,
    blockReduction: 0.6,
    dodgeDistance: 3.5,
    staminaMax: 110,
    staminaRegen: 18,
    ability: "BATTLE FOCUS",
    abilityCooldown: 15,
  },
  runekeeper: {
    maxHealth: 90,
    moveSpeed: 5,
    sprintSpeed: 7.5,
    attackDamage: 14,
    heavyDamage: 25,
    attackSpeed: 0.4,
    blockReduction: 0.4,
    dodgeDistance: 5,
    staminaMax: 130,
    staminaRegen: 22,
    ability: "SHADOW STEP",
    abilityCooldown: 8,
  },
  berserker: {
    maxHealth: 110,
    moveSpeed: 4.2,
    sprintSpeed: 6.5,
    attackDamage: 28,
    heavyDamage: 50,
    attackSpeed: 0.9,
    blockReduction: 0.3,
    dodgeDistance: 3,
    staminaMax: 90,
    staminaRegen: 12,
    ability: "BLOOD FURY",
    abilityCooldown: 18,
  },
};

export interface GamePlayer {
  id: string;
  name: string;
  warriorClass: WarriorClass;
  team: Team;
  ready: boolean;
  position: Vec3;
  rotation: number;
  velocity: Vec3;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  state: PlayerState;
  attackDir: AttackDirection;
  blockDir: AttackDirection;
  attackTimer: number;
  blockTimer: number;
  dodgeTimer: number;
  staggerTimer: number;
  abilityCooldown: number;
  abilityActive: boolean;
  abilityTimer: number;
  kills: number;
  deaths: number;
  damage: number;
  score: number;
  lastHitBy: string;
  comboCount: number;
  comboTimer: number;
  invincible: boolean;
  invincibleTimer: number;
  // The killing blow, carried on the player rather than only in the kill
  // message, so a spectator or late joiner rebuilding from a snapshot still
  // sees the body the way everyone else does. Cleared on every road back to
  // standing.
  deathZone: HitZone | null;
  deathDir: AttackDirection | null;
  deathHeavy: boolean;
}

export interface Room {
  code: string;
  mode: GameMode;
  state: MatchState;
  arena: string;
  players: Map<string, GamePlayer>;
  hostId: string;
  countdown: number;
  matchTimer: number;
  maxPlayers: number;
  teamSize: number;
  killFeed: KillFeedEntry[];
  lastStandTriggered: boolean;
}

export interface KillFeedEntry {
  killer: string;
  victim: string;
  killerName: string;
  victimName: string;
  timestamp: number;
  hitZone: HitZone;
}

// WebSocket message types
export type WSMessageType =
  | "join"
  | "create"
  | "lobby_update"
  | "select_class"
  | "select_team"
  | "ready"
  | "start"
  | "input"
  | "game_state"
  | "hit"
  | "kill"
  | "match_end"
  | "error"
  | "player_joined"
  | "player_left"
  | "countdown"
  | "chat"
  | "kill_feed"
  | "last_stand"
  | "ability_used"
  | "ping"
  | "pong";

export interface WSMessage {
  type: WSMessageType;
  data?: Record<string, unknown>;
}

export const ARENAS = ["saxon_village", "forest_battlefield", "castle_courtyard"] as const;
export type Arena = (typeof ARENAS)[number];

export const ARENA_NAMES: Record<Arena, string> = {
  saxon_village: "Saxon Village",
  forest_battlefield: "Forest Battlefield",
  castle_courtyard: "Castle Courtyard",
};

export const LEVEL_TITLES: Record<number, string> = {
  1: "Young Warrior",
  5: "Blade Novice",
  10: "Shield Bearer",
  15: "Sword Sworn",
  20: "Battle Tested",
  25: "Huscarl",
  30: "War Chief",
  40: "Thane",
  50: "Jarl's Champion",
  75: "Aetheling",
  100: "Bretwalda Legend",
};

export function getLevelTitle(level: number): string {
  const thresholds = Object.keys(LEVEL_TITLES)
    .map(Number)
    .sort((a, b) => b - a);
  for (const t of thresholds) {
    if (level >= t) return LEVEL_TITLES[t];
  }
  return "Young Warrior";
}

export function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.15, level - 1));
}

export const COSMETIC_CATALOG = {
  helmets: [
    { id: "helm_basic", name: "Leather Cap", cost: 0 },
    { id: "helm_iron", name: "Iron Helm", cost: 100 },
    { id: "helm_nasal", name: "Nasal Helm", cost: 250 },
    { id: "helm_spectacle", name: "Spectacle Helm", cost: 500 },
    { id: "helm_crowned", name: "Crowned Helm", cost: 1000 },
  ],
  cloaks: [
    { id: "cloak_none", name: "No Cloak", cost: 0 },
    { id: "cloak_brown", name: "Brown Cloak", cost: 50 },
    { id: "cloak_red", name: "Red Cloak", cost: 150 },
    { id: "cloak_blue", name: "Royal Blue Cloak", cost: 300 },
    { id: "cloak_gold", name: "Golden Cloak", cost: 750 },
  ],
  shields: [
    { id: "shield_wood", name: "Wooden Shield", cost: 0 },
    { id: "shield_iron", name: "Iron Shield", cost: 200 },
    { id: "shield_rune", name: "Rune Shield", cost: 400 },
    { id: "shield_gold", name: "Gilded Shield", cost: 800 },
  ],
  weapons: [
    { id: "wpn_basic", name: "Basic Blade", cost: 0 },
    { id: "wpn_damascus", name: "Damascus Blade", cost: 300 },
    { id: "wpn_rune", name: "Rune Blade", cost: 600 },
    { id: "wpn_kings", name: "King's Blade", cost: 1200 },
  ],
};
