// ============================================================
// BRETWALDA: BLOOD MOOT — Shared Game Types
// ============================================================

export type GameMode = "honour_duel" | "blood_moot" | "war_band";
export type WarriorClass = "huscarl" | "warden" | "runekeeper" | "berserker";
export type Team = "red" | "blue" | "none";
export type AttackDirection = "left" | "right" | "overhead" | "stab";
export type AttackType = "light" | "heavy";
/**
 * Where in a stroke a warrior is. Null on `GamePlayer.attackPhase` whenever he
 * is not swinging — which is the same thing as `state !== "attacking"`, so a
 * renderer may test either.
 *
 *   "windup"    the blade goes back and nothing has happened yet. This is the
 *               only phase in which a defender has a decision.
 *   "contact"   the edge is out; the server resolved the hit on the step that
 *               entered this phase, so by the time a client sees it the damage
 *               is already decided.
 *   "recovery"  the weight is being brought back. The largest share of the
 *               stroke, and what a whiff costs.
 */
export type AttackPhase = "windup" | "contact" | "recovery";
// Where a blow landed on the body. The server is the only authority on this —
// see deriveHitZone in engine.mjs — so that two clients watching one death
// never disagree about which limb came off.
export type HitZone = "head" | "neck" | "armL" | "armR" | "legL" | "legR" | "torso" | "waist";
/**
 * What killed a man. "blow" carries a `deathZone` and may take a limb off with
 * it; "fire" never does — nobody was swinging, so there is nothing to sever and
 * the body falls whole. Null on a man who is still standing.
 *
 * "finish" IS SENT BY THE SERVER AND WAS MISSING FROM THIS UNION. `engine.mjs`
 * has written `deathCause = finishing ? "finish" : "blow"` since the mercy rules
 * landed, with a comment beside it saying in as many words that "he was on the
 * ground and a man chose" is not the same death as "he was cut down on his
 * feet". The wire has been carrying a third value that this type said could not
 * exist, so every client narrowed it away and `anim.ts` played one collapse on
 * all three. Widened to what the sender actually sends.
 */
export type DeathCause = "blow" | "finish" | "fire";
/**
 * What a warrior's body is doing. The server owns every one of these and a
 * client may present them but never decide them.
 *
 * The two floor states are read off ONE clock (`downTimer`), the same way the
 * three swing phases are read off `attackTimer` — so a renderer that can phase
 * a swing can phase a fall without new machinery, and the server and the client
 * cannot disagree about which half of it a man is in:
 *
 *   "knocked"   flat, and not getting up yet. He cannot act, cannot turn, and
 *               keeps no invincibility. `downTimer > KNOCKDOWN.rise`.
 *   "rising"    getting his feet back. Still cannot act, but the punishment is
 *               visibly ending. `0 < downTimer <= KNOCKDOWN.rise`.
 */
export type PlayerState = "idle" | "walking" | "running" | "sprinting" | "attacking" | "blocking" | "dodging" | "rolling" | "staggered" | "knocked" | "rising" | "dead" | "ability" | "shoving";
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
  /** One-shot, like dodge: the press is the event. */
  shove: boolean;
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

/**
 * THE SAME SHEET THE SERVER FIGHTS BY — every column, not just four of them.
 *
 * `engine.mjs` is the authority and ships its own copy to the client in the
 * `join` message as `warriorStats`. This one exists because `anim.ts` needs
 * `attackSpeed` synchronously to drive the swing, and the class-select card and
 * the HUD read it before a room exists.
 *
 * Until this pass the two copies disagreed on EIGHT of twelve columns — huscarl
 * 3.5 move here against 4.0 there, runekeeper 90 health against 90 but 5.0 move
 * against 5.5, and so on. `docs/WIRE-PROTOCOL.md` §9.11 recorded it as a display
 * bug and it was worse than that: it is the repository's third named failure
 * mode, a constant written twice, and what a player saw was a class card
 * promising one man and a health bar filling for another. The class rework had
 * to touch nine of these columns, and the engine's own note on the table says
 * the payment "has to land in both tables at once or not at all" — so it did.
 *
 * They are now identical, field for field. If you edit one, edit the other in
 * the same commit. The reasoning behind every number — the 4,800-duel matrix it
 * was measured against, which levers move a fight and which do not — lives on
 * `WARRIOR_STATS` in `engine.mjs` and is deliberately NOT duplicated here,
 * because a rationale copied twice drifts exactly the way these numbers did.
 */
export const WARRIOR_STATS: Record<WarriorClass, WarriorStats> = {
  // HEALTH + DEFENCE. The wall: the largest bar and the best guard in the game,
  // the slowest walk, and damage that is merely adequate.
  huscarl: {
    maxHealth: 162,
    moveSpeed: 3.9,
    sprintSpeed: 6.2,
    attackDamage: 17,
    heavyDamage: 30,
    attackSpeed: 1.02,
    blockReduction: 0.8,
    dodgeDistance: 3.6,
    staminaMax: 105,
    staminaRegen: 17,
    ability: "SHIELD WALL",
    abilityCooldown: 12,
  },
  // DEFENCE + SPEED. The disciplined spear: second guard, second stride, and
  // the lightest blows of the four. He wins by not being hit.
  warden: {
    maxHealth: 108,
    moveSpeed: 5.0,
    sprintSpeed: 7.5,
    attackDamage: 16,
    heavyDamage: 29,
    attackSpeed: 0.85,
    blockReduction: 0.64,
    dodgeDistance: 4.1,
    staminaMax: 115,
    staminaRegen: 20,
    ability: "BATTLE FOCUS",
    abilityCooldown: 15,
  },
  // SPEED + DAMAGE, and his damage is a RATE: 14 every 0.58 s is 24.1 a second,
  // the best in the game, out of the smallest bar and the second-worst guard.
  // The 0.232 s windup is the point of him — it is under a reaction, so his
  // blows are not answered, and that is what he is buying with 92 health.
  runekeeper: {
    maxHealth: 92,
    moveSpeed: 5.6,
    sprintSpeed: 8.3,
    attackDamage: 14,
    heavyDamage: 25,
    attackSpeed: 0.58,
    blockReduction: 0.35,
    dodgeDistance: 5.6,
    staminaMax: 135,
    staminaRegen: 24,
    ability: "SHADOW STEP",
    abilityCooldown: 8,
  },
  // DAMAGE + HEALTH, and his damage is per BLOW: 50 on a heavy, arriving one at
  // a time behind the longest telegraph in the game. HEALTH is the second high
  // stat this class did not have — the owner described a man who was slow, low
  // defence AND lowish health, which is one strength, and one strength is why he
  // could not win a fight. He soaks now. He still cannot guard.
  berserker: {
    maxHealth: 134,
    moveSpeed: 4.0,
    sprintSpeed: 6.1,
    attackDamage: 28,
    heavyDamage: 50,
    attackSpeed: 1.33,
    blockReduction: 0.28,
    dodgeDistance: 3.7,
    staminaMax: 95,
    staminaRegen: 14,
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
  // ---- the swing, phase by phase ----
  // Optional for the same reason the fire fields below are: `shot/page.tsx`
  // fabricates a warrior for a portrait and has no arena to swing in. Anything
  // that came out of `serializeRoom` carries all six, every snapshot, on every
  // man, and they are the whole of what a client needs to animate weight.
  //
  // `attackTimer` is unchanged and still counts the WHOLE stroke down, so
  // anything already reading it keeps working.
  /** Which third of the stroke he is in. Null whenever he is not swinging. */
  attackPhase?: AttackPhase | null;
  /** 0 -> 1 through the CURRENT phase. Restarts at each boundary. */
  attackPhaseT?: number;
  /** 0 -> 1 through the whole stroke. Crosses SWING_PHASES boundaries. */
  swingT?: number;
  /** Seconds this whole stroke takes, heavy scaling already applied. 0 when idle. */
  swingDuration?: number;
  /** This stroke is a heavy. Authoritative — do not infer it from `attackTimer`. */
  swingHeavy?: boolean;
  /**
   * Seconds left of a shove — windup then recovery, `SHOVE.windup + SHOVE.recover`
   * at the press. Only meaningful while `state === "shoving"`; 0 otherwise. The
   * animator runs its own clock off the state edge, so this exists for late
   * joiners and harnesses rather than for the pose.
   */
  shoveTimer?: number;
  /**
   * Seconds of HITSTOP left on this man. Both fighters get it at contact and it
   * is the same value for both. While it is above zero the server advances
   * nothing about him — no swing clock, no stagger, no stamina, no travel — and
   * reports `velocity` as zero, so a client extrapolating between packets must
   * freeze him too rather than sliding him through it. 0 the rest of the time.
   */
  hitstop?: number;
  // ---- poise, the floor, and the opening a parry buys ----
  // Optional on the same terms as the swing fields above: a fabricated portrait
  // warrior has none of them, and anything out of `serializeRoom` has all five.
  /**
   * POISE. Spent by every blow that lands on him — scaled by the weapon's mass,
   * doubled when he was caught off guard — and refilled at `BALANCE.regen` per
   * second whenever he is neither staggered nor on the floor. At zero he goes
   * down. Public because a knockdown a player could not see coming is a
   * knockdown that reads as the server being unfair.
   */
  balance?: number;
  /** What `balance` refills to. Per class; the huscarl is the hardest to floor. */
  maxBalance?: number;
  /**
   * Seconds left of the WHOLE floor sequence — down, then rising. 0 whenever he
   * is on his feet. `state` is derived from it (see `PlayerState`), so a
   * renderer needs this only for the phase fraction and for a late joiner
   * arriving mid-fall.
   */
  downTimer?: number;
  /**
   * Seconds left of the riposte window this man is caught in. Above zero means
   * he was parried and is open: the parrier's next blow will do `RIPOSTE.bonus`
   * damage and throw him `RIPOSTE.knockbackScale` further.
   *
   * ON THE WIRE, and that is the point of it. `docs/DESIGN-SYSTEM.md` §3 keeps
   * the rule that the parry tell lights the OPPONENT's brackets for the
   * window's real duration rather than putting a bar on the parrier's own HUD —
   * which requires the real duration to be replicated. A window nobody can see
   * is not a mechanic, it is a dice roll.
   */
  vulnerableTimer?: number;
  /**
   * Whose window it is. Only this player id collects the riposte; everybody
   * else's blow lands at its ordinary weight, so a parry is a reward for the
   * man who read it and not a free-for-all on the man who was read. Empty
   * string when `vulnerableTimer` is 0.
   */
  vulnerableTo?: string;
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
  /**
   * The flourish this warrior last performed — his CHOSEN emote, kept on the
   * record rather than only in the relay message so the end-of-match tableau
   * can pose the victor with it. Null until he has ever emoted. Optional for
   * the same reason the fire fields are: `shot/page.tsx` fabricates warriors.
   */
  emote?: EmoteId | null;
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

/**
 * The shove, mirrored from `engine.mjs`, which is the authority — nothing here
 * decides anything. Its currency is POSITION: no damage, an impulse and a brief
 * stagger, and the burn-credit window runs from it, so driving a man into the
 * bonfire with two hands is a credited kill. A raised shield does not stop it
 * (the guard-break niche); a dodge does. The renderer needs `windup + recover`
 * to phase the animation off the state edge.
 */
export const SHOVE = {
  /** Seconds of readable tell before the hands land. */
  windup: 0.3,
  /** Seconds spent recovering after, shield up or not. */
  recover: 0.35,
  /** Centre-to-centre metres the hands can reach. */
  range: 1.7,
  /** Stamina at the press. */
  stamina: 25,
  /** Metres of ground the impulse carries the target. */
  push: 2.2,
  /** Seconds the target staggers. */
  stagger: 0.55,
  /** Seconds from one press to the next being heard. */
  cooldown: 1.5,
} as const;

/**
 * The victory emotes, mirrored from `engine.mjs`, which is the authority —
 * nothing here decides anything. Three flourishes: the weapon raised to the
 * sky, the shield boss (or the chest, on the classes that carry no shield)
 * beaten, and a taunt. They are relayed by the server, never trusted from a
 * peer: the server validates the press (alive, not committed) and throttles it
 * per player, so the id on the wire is always one of these three and never
 * arrives faster than a human celebrating.
 */
export const EMOTES = ["raise", "boss", "taunt"] as const;
export type EmoteId = (typeof EMOTES)[number];

/** Seconds one performance takes on a client. The animator owns the clock. */
export const EMOTE_SECONDS = 1.6;

/**
 * The three phases of a stroke, as fractions of `WarriorStats.attackSpeed`.
 * Mirrored from `engine.mjs`, which is the authority and asserts them —
 * nothing here decides anything. Multiply by a man's `swingDuration` for
 * seconds; the boundaries in `swingT` are 0.40 and 0.55 for every class.
 *
 * The server resolves the hit on the step that crosses into "contact", so a
 * client may draw the edge arriving anywhere inside that band and be right.
 */
export const SWING_PHASES = { windup: 0.40, contact: 0.15, recovery: 0.45 } as const;

/**
 * Seconds of freeze at contact, by blow. Also carried on the `hit` message as
 * `hitstop`, so the camera and the impact effects can start on the message
 * rather than waiting for the next snapshot to show `GamePlayer.hitstop`.
 * A parry uses the heavy value.
 */
export const HITSTOP = { light: 0.06, heavy: 0.11 } as const;

/**
 * THE FLOOR, mirrored from `engine.mjs`, which is the authority — nothing here
 * decides anything. One clock (`GamePlayer.downTimer`) and two states read off
 * it, so a renderer phases a fall the way it phases a swing.
 *
 * 0.75 s flat and 0.55 s rising is 1.30 s of being unable to answer — long
 * enough to be the worst thing that can happen in a fight, short enough that
 * it is not simply death. A huscarl light takes 0.408 s to reach contact, so
 * the man who floored you gets one blow, and a second only if he was already
 * in reach.
 */
export const KNOCKDOWN = {
  /** Seconds flat on his back before the get-up starts. */
  down: 0.75,
  /** Seconds spent getting his feet back. `downTimer <= this` means "rising". */
  rise: 0.55,
  /** Metres the fall carries him away from whatever put him there. */
  slide: 1.05,
  /** Fraction of `maxBalance` he stands up with. A beaten man is not fresh. */
  balanceOnRise: 0.34,
} as const;

/**
 * THE RIPOSTE, mirrored from `engine.mjs`, which is the authority — nothing
 * here decides anything.
 *
 * A parry writes `vulnerableTimer = window` and `vulnerableTo = <the parrier>`
 * onto the man who was read. Inside that window the parrier's next blow — and
 * only his — does `bonus` damage, throws him `knockbackScale` further, and
 * costs him `balanceScale` more poise. Landing it CLOSES the window: one parry
 * buys one blow.
 *
 * WHY 0.90 s AND NOT LESS, at a 20 Hz tick. The parry itself is 3 ticks wide
 * (150 ms) and that is an INPUT test, deliberately tight. The riposte window is
 * a LICENCE, so it has to survive a round trip: a 120 ms ping costs a player
 * ~2.4 ticks at each end, leaving 13 of the 18 ticks genuinely usable — still
 * more than the 408 ms a huscarl light needs to reach contact from a standing
 * start. It is also exactly the length of the stagger the parry deals, so what
 * a player learns is "he is reeling, therefore he is open" and not two clocks.
 */
export const RIPOSTE = {
  /** Seconds the parried man stays open, and what `vulnerableTimer` starts at. */
  window: 0.90,
  /** Damage multiplier on the riposte blow. */
  bonus: 1.6,
  /** Knockback multiplier on the riposte blow. */
  knockbackScale: 1.7,
  /** Poise-cost multiplier on the riposte blow. */
  balanceScale: 1.8,
} as const;

/**
 * Commitment. Free turning is instantaneous — the server adopts the client's
 * yaw as sent. Inside a swing it is capped at SWING_TURN_RATE radians per
 * second, scaled per phase, and integrated on the server's fixed 20 Hz step.
 *
 * So during a stroke the client's own yaw is NOT the warrior's rotation: the
 * body lags the aim on purpose and `GamePlayer.rotation` is the only truth
 * about where he is pointed. A camera may keep looking where the player asked;
 * the man underneath it will not have got there yet.
 *
 * Over a whole runekeeper light (0.58 s) the cap allows 0.739 rad — 42.3 deg —
 * against the 180 deg a free warrior takes instantly.
 */
export const SWING_TURN_RATE = 1.8;
export const SWING_TURN_PHASE: Record<AttackPhase, number> = {
  windup: 1.0,
  contact: 0.25,
  recovery: 0.6,
};

/** Seconds a whole stroke takes for this class. Heavies are 1.25x a light. */
export const HEAVY_SWING_SCALE = 1.25;
export function swingDuration(warriorClass: WarriorClass, isHeavy: boolean): number {
  return WARRIOR_STATS[warriorClass].attackSpeed * (isHeavy ? HEAVY_SWING_SCALE : 1);
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
  /**
   * HOW it was won. A match taken on the kill count looks identical on the
   * summary to one taken on rounds, so without this a player who just lost a
   * match he was level on has no way to learn why he lost it.
   */
  winnerBy?: "rounds" | "kills" | "draw";
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

/**
 * Every message on the wire, in both directions. **`docs/WIRE-PROTOCOL.md` is
 * the specification**; this union is only the TypeScript face of it, and
 * `tools/protocoltest.mjs` holds both to what `engine.mjs` actually does.
 *
 * It used to declare `"chat"` and `"kill_feed"`, neither of which the engine
 * has ever sent or accepted, and to omit `solo`, `add_bot`, `remove_bot`,
 * `set_bots`, `set_appearance` and `leave`, all of which it routes. Same fault
 * as the documented-and-unread `CLASS.gorget`: a type that describes an
 * intention rather than a program. Corrected against the router.
 */
export type WSClientMessageType =
  | "create" | "join" | "solo"
  | "select_class" | "select_team" | "ready" | "set_appearance"
  | "add_bot" | "remove_bot" | "set_bots" | "set_rounds"
  | "start" | "input" | "emote" | "leave" | "ping";

export type WSServerMessageType =
  | "join" | "error" | "pong"
  | "player_joined" | "player_left" | "lobby_update"
  | "countdown" | "game_state"
  | "hit" | "kill" | "ability_used" | "last_stand"
  | "round_end" | "match_end" | "emote";

export type WSMessageType = WSClientMessageType | WSServerMessageType;

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
