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
/**
 * What killed a man. "blow" carries a `deathZone` and may take a limb off with
 * it; "fire" never does — nobody was swinging, so there is nothing to sever and
 * the body falls whole. Null on a man who is still standing.
 */
export type DeathCause = "blow" | "fire";
export type PlayerState = "idle" | "walking" | "running" | "sprinting" | "attacking" | "blocking" | "dodging" | "rolling" | "staggered" | "dead" | "ability";
// "intermission" is the breath between rounds: everyone still dead where they
// fell, the round result on screen, the next countdown already scheduled.
export type MatchState = "lobby" | "countdown" | "fighting" | "last_stand" | "intermission" | "finished";

/** Best of 1, 3 or 5 rounds. The host picks; the server decides everything else. */
export const ROUND_OPTIONS = [1, 3, 5] as const;
export type BestOf = (typeof ROUND_OPTIONS)[number];
export const DEFAULT_BEST_OF: BestOf = 3;

/** Round wins that take the match — first to this, so a best-of-3 can end 2-0. */
export function roundsToWin(bestOf: number): number {
  return Math.ceil(bestOf / 2);
}

/**
 * What the keys of `roundWins` mean. A free-for-all is scored by man and keys
 * are player ids; a war band is scored by side and the keys are "red" and
 * "blue". The HUD reads this rather than inferring it from the mode.
 */
export type RoundScoreBy = "player" | "team";

/** The round just finished. Null until one has. */
export interface RoundResult {
  index: number;
  /** Set in a free-for-all; null in a war band. */
  winnerId: string | null;
  /** Set in a war band; null in a free-for-all. */
  winnerTeam: Team | null;
  winnerName: string;
  /** Last two men down on the same tick: nobody takes the round. */
  draw: boolean;
}

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
  // The four fire fields are optional only because a warrior is not always a
  // warrior off the wire: `shot/page.tsx` fabricates one to stand in front of a
  // camera, and a portrait has no arena to be burning in. Anything that came
  // out of `serializeRoom` carries all four, every snapshot, on every man.
  /**
   * Alight — in the bonfire, or still burning from having been in it. This is
   * the one field that decides whether a man wears flames, and it is true for
   * both halves of the state on purpose: the image the feature exists to produce
   * is a warrior running out of the fire still burning, and to a renderer that is
   * not a different state, only a cooler one.
   *
   * It stays true on a corpse that burned and goes false when the body has
   * finished smouldering, so nothing on the client has to decide when a dead man
   * stops smoking. It is false on every man who respawns.
   */
  burning?: boolean;
  /**
   * Seconds of burn left. Pinned at `FIRE.linger` for as long as he is stood in
   * the flames, then counts down to 0 and takes `burning` with it — so
   * `burnTimer / FIRE.linger` is a 1→0 fade the flames and their light can be
   * driven off directly. 0 whenever `burning` is false.
   */
  burnTimer?: number;
  /**
   * Stood in the fire right now, as against running away from it still alight.
   * The server settles this so that eight clients agree; it is the difference
   * between a man engulfed and a man trailing flame, and it is where the "you
   * are in it NOW" moment belongs.
   */
  burnInside?: boolean;
  // The killing blow, carried on the player rather than only in the kill
  // message, so a spectator or late joiner rebuilding from a snapshot still
  // sees the body the way everyone else does. Cleared on every road back to
  // standing.
  deathZone: HitZone | null;
  deathDir: AttackDirection | null;
  deathHeavy: boolean;
  /** Null while alive. "fire" is the explicit no-severance death. */
  deathCause?: DeathCause | null;
}

/**
 * The bonfire hazard, mirrored from `engine.mjs`, which is the authority —
 * nothing here decides anything. It is here so the renderer can normalise
 * `burnTimer` and knows where the hot ground is without deriving it a second
 * time. This carries the same standing hazard as `WARRIOR_STATS`: two copies
 * that must agree, and nothing fails loudly when they drift.
 *
 * `radius` is not a chosen number. `world.ts` records that the fire's widest
 * geometry reaches 2.0 m; the hazard sits one body's half-width inside that
 * (bodies are held 1.05 m apart centre to centre), so a man is burning only once
 * he is more inside the flame than out of it.
 */
export const FIRE = {
  /** Metres from the origin. Trigger is on a warrior's centre. */
  radius: 1.475,
  /** Seconds a man stays alight after leaving. `burnTimer` counts down from this. */
  linger: 3.0,
  /** Health per second while inside — 4.1 s to kill the frailest class. */
  dpsInside: 22,
  /** Health per second for the tail after. */
  dpsAfter: 4,
} as const;

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
  /** A round-level moment — two men left in THIS round. Reset every round. */
  lastStandTriggered: boolean;
  /** Rounds in the match: 1, 3 or 5. Solo training is not a match and is always 1. */
  bestOf: number;
  /** 1-based, 0 before the first round of a match has been placed. */
  roundIndex: number;
  /** `roundsToWin(bestOf)`, carried so the HUD never recomputes it. */
  roundTarget: number;
  /** Keyed by player id or by team — see `roundScoreBy`. */
  roundWins: Record<string, number>;
  roundScoreBy: RoundScoreBy;
  lastRound: RoundResult | null;
  /** Epoch ms the next round starts, during "intermission". 0 otherwise. */
  nextRoundAt: number;
}

/** `round_end` payload: a whole room snapshot plus the round that just ended. */
export interface RoundEndData extends RoundResult {
  matchOver: boolean;
  roundWins: Record<string, number>;
  roundTarget: number;
  bestOf: number;
  nextRoundAt: number;
}

export interface MatchResult {
  id: string;
  name: string;
  kills: number;
  deaths: number;
  damage: number;
  score: number;
  isWinner: boolean;
  xpEarned: number;
  goldEarned: number;
}

/**
 * `match_end`. `winnerId` alone could not say that a war band had won, so the
 * winner is named by kind: a man, a side, or nobody. Kills and damage in
 * `results` are the match's totals across every round; gold and XP are paid
 * once, from those totals.
 */
export interface MatchEndData {
  winnerKind: "player" | "team" | "none";
  winnerId: string | null;
  winnerTeam: Team | null;
  winnerName: string;
  bestOf: number;
  roundsPlayed: number;
  roundTarget: number;
  roundWins: Record<string, number>;
  roundScoreBy: RoundScoreBy;
  results: MatchResult[];
}

export interface KillFeedEntry {
  /** Empty when the fire took him and no one was close enough to be paid. */
  killer: string;
  victim: string;
  /** "The Fire" for an environmental death, so a feed can read it verbatim. */
  killerName: string;
  victimName: string;
  timestamp: number;
  /** Null on a burn death: no blow, so nowhere for it to have landed. */
  hitZone: HitZone | null;
}

/**
 * The `kill` message. A burn death carries `cause: "fire"`, a null `hitZone` and
 * an empty `killerId` unless a blow inside the credit window drove the man into
 * the flames — in which case the kill is that man's, because he is the reason
 * the victim was in there.
 */
export interface KillData {
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  hitZone: HitZone | null;
  direction: AttackDirection | null;
  heavy: boolean;
  cause: DeathCause;
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
  | "set_rounds"
  | "round_end"
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
