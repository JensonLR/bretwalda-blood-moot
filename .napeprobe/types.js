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
export const WARRIOR_STATS = {
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
};
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
};
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
