// ============================================================
// BRETWALDA: BLOOD MOOT — Shared Game Types
// ============================================================
/** Best of 1, 3 or 5 rounds. The host picks; the server decides everything else. */
export const ROUND_OPTIONS = [1, 3, 5];
export const DEFAULT_BEST_OF = 3;
/** Round wins that take the match — first to this, so a best-of-3 can end 2-0. */
export function roundsToWin(bestOf) {
    return Math.ceil(bestOf / 2);
}
/**
 * `attackSpeed` is the WHOLE stroke — windup, contact and recovery — and these
 * four numbers are held identical to `engine.mjs`, which is the authority. They
 * have to be: `anim.ts` drives the swing animation off this copy, and a drift
 * is a blade that finishes on the client before it lands on the server.
 *
 * The other columns still disagree with the engine (huscarl 3.5 move here
 * against 4.0 there). That is an older display bug and is deliberately not
 * touched by the weight pass.
 */
export const WARRIOR_STATS = {
    huscarl: {
        maxHealth: 150,
        moveSpeed: 3.5,
        sprintSpeed: 5.5,
        attackDamage: 18,
        heavyDamage: 30,
        attackSpeed: 1.02,
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
        attackSpeed: 0.85,
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
        attackSpeed: 0.58,
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
        attackSpeed: 1.33,
        blockReduction: 0.3,
        dodgeDistance: 3,
        staminaMax: 90,
        staminaRegen: 12,
        ability: "BLOOD FURY",
        abilityCooldown: 18,
    },
};
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
};
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
};
/**
 * The victory emotes, mirrored from `engine.mjs`, which is the authority —
 * nothing here decides anything. Three flourishes: the weapon raised to the
 * sky, the shield boss (or the chest, on the classes that carry no shield)
 * beaten, and a taunt. They are relayed by the server, never trusted from a
 * peer: the server validates the press (alive, not committed) and throttles it
 * per player, so the id on the wire is always one of these three and never
 * arrives faster than a human celebrating.
 */
export const EMOTES = ["raise", "boss", "taunt"];
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
export const SWING_PHASES = { windup: 0.40, contact: 0.15, recovery: 0.45 };
/**
 * Seconds of freeze at contact, by blow. Also carried on the `hit` message as
 * `hitstop`, so the camera and the impact effects can start on the message
 * rather than waiting for the next snapshot to show `GamePlayer.hitstop`.
 * A parry uses the heavy value.
 */
export const HITSTOP = { light: 0.06, heavy: 0.11 };
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
export const SWING_TURN_PHASE = {
    windup: 1.0,
    contact: 0.25,
    recovery: 0.6,
};
/** Seconds a whole stroke takes for this class. Heavies are 1.25x a light. */
export const HEAVY_SWING_SCALE = 1.25;
export function swingDuration(warriorClass, isHeavy) {
    return WARRIOR_STATS[warriorClass].attackSpeed * (isHeavy ? HEAVY_SWING_SCALE : 1);
}
export const ARENAS = ["saxon_village", "forest_battlefield", "castle_courtyard"];
export const ARENA_NAMES = {
    saxon_village: "Saxon Village",
    forest_battlefield: "Forest Battlefield",
    castle_courtyard: "Castle Courtyard",
};
export const LEVEL_TITLES = {
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
export function getLevelTitle(level) {
    const thresholds = Object.keys(LEVEL_TITLES)
        .map(Number)
        .sort((a, b) => b - a);
    for (const t of thresholds) {
        if (level >= t)
            return LEVEL_TITLES[t];
    }
    return "Young Warrior";
}
export function xpForLevel(level) {
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
