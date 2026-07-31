// ============================================================
// BRETWALDA — Unified Game Engine (WS + HTTP transports, bots)
// Shared singleton via globalThis so custom-server and Next API
// routes share the same rooms in one process.
// ============================================================
import { randomUUID } from "crypto";

const TICK_RATE = 20;
const PARRY_WINDOW = 0.15;
const COMBO_WINDOW = 0.8;
const DODGE_DURATION = 0.35;
const DODGE_COOLDOWN = 0.8;
const STAGGER_DURATION = 0.6;
const MATCH_COUNTDOWN = 3;
const SPAWN_INVINCIBLE = 2.0;
const ARENA_RADIUS = 18;

// ---- reach ----
// One flat ATTACK_RANGE of 3.0 for every class is why a berserker connected with
// the middle of his haft: the server was granting a metre of reach the weapon
// does not have, so the only part of the axe near the target at the moment of
// the hit was wood. The server stays authoritative; what changes is that its
// numbers now describe the weapons the player is actually looking at.
//
// These are measurements, not tuning knobs. Each is the largest local-space
// bounding-box max.y over the weapon's meshes — how far past the fist the steel
// goes — which is precisely how `anim.ts` derives `rig.reach` for the blade
// trail. Same definition on both sides, so the hit and the streak that draws it
// cannot drift apart. Re-measure when a builder in `characters.ts` is re-cut.
//
//   runekeeper  seax      0.50  buildDagger, blade tip station y = 0.50
//   berserker   Dane axe  1.00  buildAxe, headY 0.86 + top horn at +0.137;
//                               the haft alone stops at 0.92, which is the
//                               difference between an edge hit and a haft hit
//   huscarl     sword     1.06  buildSword, blade tip station y = 1.055
//   warden      spear     1.44  buildSpear, blade tip station y = 1.44
//
// NOTE: the warden carries `buildSpear`, not a sword, and it out-reaches the
// axe by 440 mm. The axe is a big weapon, but most of it hangs *below* the
// grip — the butt is 580 mm down the haft — and none of that is reach.
const WEAPON_REACH = { huscarl: 1.055, warden: 1.44, runekeeper: 0.50, berserker: 1.00 };

// The two bodies between the two fists, which no weapon table can supply:
// ~0.60 m from the attacker's centre out to his extended fist, ~0.25 m from the
// target's centre to the chest that stops the blade, and ~0.35 m of forgiveness
// so a hit the client already drew does not get denied by the lag between them.
// This is the one number here that is a judgement call rather than a measurement.
const BODY_REACH = 1.20;

const ATTACK_RANGE = Object.fromEntries(
  Object.entries(WEAPON_REACH).map(([cls, r]) => [cls, r + BODY_REACH]),
);
const DEFAULT_ATTACK_RANGE = ATTACK_RANGE.huscarl;

// How far off his facing a warrior may land a blow. Flat at 0.6π for every
// class before, which let a seax thrust connect with something stood behind the
// attacker's own shoulder. It is per-weapon now for the same reason reach is —
// a two-handed axe really does cross the whole front in one sweep, and a spear
// really is thrust down its own line and cannot be waved sideways.
//
// It is also where the warden pays for that 1.44 m of steel. Reach and arc
// multiply into the ground a single swing covers (~r²·θ), so leaving the spear
// on the old wide window would have handed the longest weapon the largest
// footprint as well, and a long weapon is supposed to trade something for the
// length. The footprints these land on, against 16.97 flat before:
// huscarl 8.0, warden 8.3, berserker 8.8, runekeeper 5.4. The runekeeper is
// lowest on purpose and is answering with the roster's best damage rate and
// best mobility; if it turns out to be answering with too little, this table
// is the lever, not `WARRIOR_STATS` — see the note on that table.
const SWING_ARC = {
  huscarl: Math.PI * 0.50,     // sword and shield: compact, worked in close
  warden: Math.PI * 0.38,      // spear: a line, not a sweep
  runekeeper: Math.PI * 0.60,  // twin seaxes, and the class that must fight from
                               // inside everyone else's guard needs the width
  berserker: Math.PI * 0.58,   // the two-handed sweep, which is genuinely wide
};
const DEFAULT_SWING_ARC = SWING_ARC.huscarl;

/** Centre-to-centre distance at which this warrior's weapon can bite. */
function reachOf(p) {
  return ATTACK_RANGE[p.warriorClass] ?? DEFAULT_ATTACK_RANGE;
}

// ---- movement tuning ----
// Every number here is a time constant in seconds, never a per-tick factor.
// gameTick turns them into per-dt rates, so they mean the same thing whatever
// the tick rate is and — the whole point — whatever the network is doing.
const MOVE_ACCEL_TAU = 0.17;    // 63% of the gap to full stride shed per tau: weight, not sludge
const MOVE_STOP_TAU = 0.14;     // let go of the keys and the boots bite
const MOVE_CARRY_TAU = 0.32;    // momentum you keep while committed to a swing or a roll
const IMPULSE_TAU = 0.34;       // lunges and rolls bleed off at the old friction's pace
const LUNGE_LIGHT = 0.9;        // ground a light swing carries you, in units
const LUNGE_HEAVY = 1.25;       // ...and a heavy one
const BLOCK_MOVE_MULT = 0.55;   // a raised shield is a slow shield — a felt tax, not a root
const SPRINT_STAMINA = 8;       // per second, sprinting
const BLOCK_STAMINA = 2;        // per second, guard up
const INPUT_LAPSE_MS = 600;     // a client this quiet has stopped asking for anything.
                                // Long enough that a hitching renderer is not a stutter in
                                // the legs — a phone that thermal-throttles or a software-GL
                                // capture box can spend 400 ms on a frame, and a warrior must
                                // not lose a fifth of his stride to the frame rate — short
                                // enough that a dead tab's warrior stops inside three strides.

// ---- the clock ----
// The simulation advances in fixed steps; the wall clock decides how many are
// owed. See gameTick — this is where the movement-speed bug actually lived.
const TICK_SLACK_MS = 3;        // treat a wake this close to a step boundary as on time,
                                // so a punctual timer is never a wasted wake
const MAX_CATCHUP_MS = 400;     // arrears we will work off in one wake; past this the box
                                // was asleep and fast-forwarding the fight is worse than
                                // losing the time

const DIFFICULTIES = ["recruit", "warrior", "jarl"];
const BOT_SKILL = { recruit: 0.45, warrior: 0.7, jarl: 0.92 };
const BOT_TITLES = { recruit: " the Young", warrior: "", jarl: " the Grim" };
const SOLO_BOTS_BY_DIFFICULTY = { recruit: 1, warrior: 2, jarl: 3 };
const SOLO_MAX_BOTS = 7;        // eight warriors in the ring, same as a blood moot

// This is the sheet the simulation fights by, and it is deliberately untouched
// by the reach pass even though the reach pass changed the balance under it.
// Two reasons, and the second is the hard one:
//
//   Reach came *down* for every class, so nobody was handed an advantage that
//   has to be paid for here. The class that gained relative ground is the
//   warden, and it pays in `SWING_ARC` instead.
//
//   `src/game/types.ts` carries a second copy of this table that the class-select
//   screen and the HUD read, and the two already disagree — that copy still has
//   the huscarl at 3.5 move / 0.7 attack against 4.0 / 0.6 here. Anything edited
//   here that a player can *see* on a card widens a drift that is already a bug:
//   change `maxHealth` and the card promises 90 while the health bar fills to
//   100. The runekeeper is the class the reach pass costs most (3.0 -> 1.70, and
//   it must now stand inside every other weapon), and if it needs paying back,
//   the payment has to land in both tables at once or not at all.
export const WARRIOR_STATS = {
  huscarl: { maxHealth: 150, moveSpeed: 4.0, sprintSpeed: 6.4, attackDamage: 18, heavyDamage: 30, attackSpeed: 0.6, blockReduction: 0.8, dodgeDistance: 3.6, staminaMax: 105, staminaRegen: 17, ability: "SHIELD WALL", abilityCooldown: 12 },
  warden: { maxHealth: 120, moveSpeed: 4.5, sprintSpeed: 6.8, attackDamage: 20, heavyDamage: 35, attackSpeed: 0.5, blockReduction: 0.6, dodgeDistance: 4.1, staminaMax: 115, staminaRegen: 20, ability: "BATTLE FOCUS", abilityCooldown: 15 },
  runekeeper: { maxHealth: 90, moveSpeed: 5.5, sprintSpeed: 8.2, attackDamage: 14, heavyDamage: 25, attackSpeed: 0.34, blockReduction: 0.4, dodgeDistance: 5.6, staminaMax: 135, staminaRegen: 24, ability: "SHADOW STEP", abilityCooldown: 8 },
  berserker: { maxHealth: 110, moveSpeed: 4.7, sprintSpeed: 7.2, attackDamage: 28, heavyDamage: 50, attackSpeed: 0.78, blockReduction: 0.3, dodgeDistance: 3.7, staminaMax: 95, staminaRegen: 14, ability: "BLOOD FURY", abilityCooldown: 18 },
};

const ROOM_NAMES = ["WESSEX", "MERCIA", "ESSEX", "KENT", "SUSSEX", "ANGLIA", "NORTHUMBRIA", "JORVIK", "LINDSEY", "BERNICIA", "DEIRA", "HWICCE"];
const BOT_NAMES = ["Ealdred", "Wulfred", "Aelric", "Beorn", "Cynric", "Eadwig", "Grim", "Hardred", "Leofric", "Osric", "Uhtred", "Deor"];
const BOT_CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
const BOT_APPEARANCES = [
  { helm: "iron", hairStyle: "short", hairColor: 0x6b4a2a, beardStyle: "short", beardColor: 0x6b4a2a, cloak: "brown", armorColor: 0x4a5568, warPaint: "none" },
  { helm: "nasal", hairStyle: "long", hairColor: 0xb8a14e, beardStyle: "full", beardColor: 0xb8a14e, cloak: "red", armorColor: 0x2a2f38, warPaint: "stripes" },
  { helm: "none", hairStyle: "braids", hairColor: 0x8a3b22, beardStyle: "braided", beardColor: 0x8a3b22, cloak: "brown", armorColor: 0x7a2f2a, warPaint: "half" },
  { helm: "iron", hairStyle: "shaved", hairColor: 0x1c1712, beardStyle: "forked", beardColor: 0x1c1712, cloak: "blue", armorColor: 0x8a6a3a, warPaint: "cross" },
];

function makeEngine() {
  const rooms = new Map();          // code -> room
  const sessions = new Map();       // sid -> { sender, roomCode, playerId|null }
  const TICK_MS = 1000 / TICK_RATE;
  const TICK_DT = 1 / TICK_RATE;
  // Wall time the simulation has been advanced to. Monotonic, so an NTP step
  // cannot hand the arena a second of catch-up or a second of stall.
  let simClock = performance.now();

  function generateCode() {
    const name = ROOM_NAMES[(Math.random() * ROOM_NAMES.length) | 0];
    const num = ((Math.random() * 90) | 0) + 10;
    return `${name}${num}`;
  }

  // Anything a client sends can be a lie or a NaN; a NaN in a position is
  // permanent, so intent is scrubbed on the way in.
  const finite = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

  function createPlayer(id, name, warriorClass, appearance) {
    const stats = WARRIOR_STATS[warriorClass];
    return {
      id, name, warriorClass, team: "none", ready: false,
      appearance: appearance || null,
      position: { x: 0, y: 0, z: 0 }, rotation: 0, velocity: { x: 0, y: 0, z: 0 },
      // Steering and bursts are integrated apart (see gameTick) and summed
      // into `velocity`, which stays the honest total the client draws.
      moveVel: { x: 0, z: 0 }, impulse: { x: 0, z: 0 },
      latestInput: null, inputAt: 0,
      health: stats.maxHealth, maxHealth: stats.maxHealth,
      stamina: stats.staminaMax, maxStamina: stats.staminaMax,
      state: "idle", attackDir: "right", blockDir: "right",
      attackTimer: 0, blockTimer: 0, dodgeTimer: 0, staggerTimer: 0,
      abilityCooldown: 0, abilityActive: false, abilityTimer: 0,
      kills: 0, deaths: 0, damage: 0, score: 0, lastHitBy: "",
      comboCount: 0, comboTimer: 0, invincible: false, invincibleTimer: 0,
      deadAt: 0,
    };
  }

  function spawnPositions(count) {
    const positions = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      positions.push({ x: Math.cos(angle) * 9, y: 0, z: Math.sin(angle) * 9 });
    }
    return positions;
  }

  function sendSession(sid, msg) {
    const s = sessions.get(sid);
    if (s && s.sender) { try { s.sender(JSON.stringify(msg)); } catch { /* closed */ } }
  }

  function broadcast(room, msg, excludePlayerId) {
    const str = JSON.stringify(msg);
    room.players.forEach((p) => {
      if (p.id === excludePlayerId || p.id.startsWith("bot_")) return;
      sessions.forEach((s) => {
        if (s.playerId === p.id && s.sender) { try { s.sender(str); } catch { /* closed */ } }
      });
    });
  }

  // Simulation scratch: needed every tick, meaningless off the server, and
  // twenty times a second of wire it does not deserve.
  const PRIVATE_FIELDS = ["moveVel", "impulse", "latestInput", "inputAt",
    "aiSkill", "nextThink", "nextAttackAt", "strafePhase", "blockUntil", "isBlocking", "yaw", "baseName"];

  function serializeRoom(room) {
    const players = {};
    room.players.forEach((p, id) => {
      const pub = { ...p };
      for (const f of PRIVATE_FIELDS) delete pub[f];
      players[id] = pub;
    });
    return {
      code: room.code, mode: room.mode, state: room.state, arena: room.arena,
      players, hostId: room.hostId, countdown: room.countdown, matchTimer: room.matchTimer,
      maxPlayers: room.maxPlayers, killFeed: room.killFeed.slice(-10), lastStandTriggered: room.lastStandTriggered,
      // Room setup, so a lobby screen can render what it is about to start.
      difficulty: room.difficulty || null, botCount: botsIn(room), maxBots: botCapacity(room),
      autoStart: !!room.autoStart,
    };
  }

  const sendLobbyUpdate = (room) => broadcast(room, { type: "lobby_update", data: serializeRoom(room) });

  function humanCount(room) {
    let n = 0;
    room.players.forEach((p) => { if (!p.id.startsWith("bot_")) n++; });
    return n;
  }

  function botsIn(room) {
    let n = 0;
    room.players.forEach((p) => { if (p.bot) n++; });
    return n;
  }

  // A solo room stays sealed to other humans (maxPlayers 1) yet still holds a
  // full ring of sparring partners.
  function botCapacity(room) {
    return room.mode === "solo" ? SOLO_MAX_BOTS : Math.max(0, room.maxPlayers - humanCount(room));
  }

  const normalizeDifficulty = (value, fallback) =>
    (DIFFICULTIES.includes(value) ? value : (DIFFICULTIES.includes(fallback) ? fallback : "warrior"));

  // ---------------- message routing ----------------
  function routeMessage(sid, msg) {
    const type = msg.type;
    const data = msg.data || {};
    switch (type) {
      case "create": return handleCreate(sid, data);
      case "join": return handleJoin(sid, data);
      case "solo": return handleSolo(sid, data);
      case "select_class": return withRoom(sid, (room, player) => {
        if (!WARRIOR_STATS[data.warriorClass]) return;
        player.warriorClass = data.warriorClass;
        const stats = WARRIOR_STATS[data.warriorClass];
        player.maxHealth = stats.maxHealth; player.health = stats.maxHealth;
        player.maxStamina = stats.staminaMax; player.stamina = stats.staminaMax;
        sendLobbyUpdate(room);
      });
      case "select_team": return withRoom(sid, (room, player) => { player.team = data.team; sendLobbyUpdate(room); });
      case "ready": return withRoom(sid, (room, player) => { player.ready = !player.ready; sendLobbyUpdate(room); });
      case "add_bot": return withRoom(sid, (room, player) => {
        if (room.hostId !== player.id) return;
        const diff = normalizeDifficulty(data.difficulty, room.difficulty);
        if (botsIn(room) >= botCapacity(room)) return;
        room.difficulty = room.difficulty || diff;
        addBot(room, botsIn(room), diff);
        sendLobbyUpdate(room);
      });
      case "remove_bot": return withRoom(sid, (room, player) => {
        if (room.hostId !== player.id) return;
        if (removeBot(room, typeof data.botId === "string" ? data.botId : null)) sendLobbyUpdate(room);
      });
      // Size the whole roster in one message — what a setup screen's stepper wants.
      case "set_bots": return withRoom(sid, (room, player) => {
        if (room.hostId !== player.id || room.state !== "lobby") return;
        const diff = normalizeDifficulty(data.difficulty, room.difficulty);
        room.difficulty = diff;
        room.players.forEach((p) => { if (p.bot) retuneBot(p, diff); });
        const asked = data.count === undefined ? botsIn(room) : Math.round(finite(data.count));
        const want = Math.max(0, Math.min(botCapacity(room), asked));
        while (botsIn(room) > want) removeBot(room, null);
        while (botsIn(room) < want) addBot(room, botsIn(room), diff);
        sendLobbyUpdate(room);
      });
      case "start": return withRoom(sid, (room, player) => {
        if (room.hostId !== player.id || room.state !== "lobby") return;
        // A trial may be a lonely one; a shared room still needs an opponent.
        if (room.mode !== "solo" && room.players.size < 2) {
          return sendSession(sid, { type: "error", data: { message: "Summon a friend, or press ADD AI below your war code." } });
        }
        startCountdown(room);
      });
      case "set_appearance": return withRoom(sid, (room, player) => { player.appearance = data.appearance || null; sendLobbyUpdate(room); });
      case "input": return withRoom(sid, (room, player) => {
        if (room.state !== "fighting" && room.state !== "last_stand") return;
        if (player.state === "dead") return;
        // Standing intent for the tick to act on; actions fire here and now.
        player.latestInput = data;
        player.inputAt = Date.now();
        processInput(room, player, data);
      });
      case "leave": return disconnectSession(sid);
      case "ping": return sendSession(sid, { type: "pong" });
    }
  }

  function withRoom(sid, fn) {
    const s = sessions.get(sid);
    if (!s || !s.roomCode || !s.playerId) return;
    const room = rooms.get(s.roomCode);
    if (!room) return;
    const player = room.players.get(s.playerId);
    if (!player) return;
    fn(room, player);
  }

  function leaveRoomForSession(s) {
    if (!s.roomCode || !s.playerId) return;
    const room = rooms.get(s.roomCode);
    if (room) {
      room.players.delete(s.playerId);
      broadcast(room, { type: "player_left", data: { playerId: s.playerId } });
      if (humanCount(room) === 0) {
        rooms.delete(room.code);
      } else {
        if (room.hostId === s.playerId) {
          for (const [pid] of room.players) { if (!pid.startsWith("bot_")) { room.hostId = pid; break; } }
        }
        sendLobbyUpdate(room);
      }
    }
    s.roomCode = null; s.playerId = null;
  }

  function handleCreate(sid, data) {
    const s = sessions.get(sid);
    if (!s) return;
    leaveRoomForSession(s);
    const name = String(data.name || "Warrior").substring(0, 20);
    const mode = data.mode || "blood_moot";
    let code = generateCode();
    while (rooms.has(code)) code = generateCode();

    const room = {
      code, mode, state: "lobby", arena: "saxon_village",
      players: new Map(), hostId: null, countdown: 0, matchTimer: 0,
      maxPlayers: mode === "honour_duel" ? 2 : 8, killFeed: [], lastStandTriggered: false,
    };
    const pid = randomUUID();
    const player = createPlayer(pid, name, "warden", data.appearance || null);
    room.players.set(pid, player);
    room.hostId = pid;
    rooms.set(code, room);
    s.roomCode = code; s.playerId = pid;
    sendSession(sid, { type: "join", data: { playerId: pid, warriorStats: WARRIOR_STATS, ...serializeRoom(room) } });
  }

  function handleJoin(sid, data) {
    const s = sessions.get(sid);
    if (!s) return;
    const code = String(data.code || "").toUpperCase();
    const room = rooms.get(code);
    if (room && s.roomCode === room.code) {
      // already in this room — resend snapshot instead of duplicating
      return sendSession(sid, { type: "join", data: { playerId: s.playerId, warriorStats: WARRIOR_STATS, ...serializeRoom(room) } });
    }
    leaveRoomForSession(s);
    if (!room) return sendSession(sid, { type: "error", data: { message: "Room not found. Check your code." } });
    if (room.state !== "lobby") return sendSession(sid, { type: "error", data: { message: "Battle already in progress." } });
    if (humanCount(room) >= room.maxPlayers) return sendSession(sid, { type: "error", data: { message: "Room is full." } });

    const pid = randomUUID();
    const player = createPlayer(pid, String(data.name || "Warrior").substring(0, 20), "warden", data.appearance || null);
    room.players.set(pid, player);
    s.roomCode = code; s.playerId = pid;
    sendSession(sid, { type: "join", data: { playerId: pid, warriorStats: WARRIOR_STATS, ...serializeRoom(room) } });
    broadcast(room, { type: "player_joined", data: { playerId: pid, name: player.name } }, pid);
    sendLobbyUpdate(room);
  }

  function handleSolo(sid, data) {
    const s = sessions.get(sid);
    if (!s) return;
    leaveRoomForSession(s);
    const name = String(data.name || "Warrior").substring(0, 20);
    const difficulty = normalizeDifficulty(data.difficulty);
    // The caller sizes the trial. Omitting botCount falls back to the old
    // difficulty→count map, so the one-tap TRAINING button still works; passing
    // autoStart:false parks the room in the lobby for a setup screen.
    const requested = data.botCount === undefined ? SOLO_BOTS_BY_DIFFICULTY[difficulty] : Math.round(finite(data.botCount));
    const botCount = Math.max(0, Math.min(SOLO_MAX_BOTS, requested));
    const autoStart = data.autoStart !== false;
    let code = "SOLO" + generateCode();
    while (rooms.has(code)) code = "SOLO" + generateCode();

    const room = {
      code, mode: "solo", state: "lobby", arena: "saxon_village",
      players: new Map(), hostId: null, countdown: 0, matchTimer: 0,
      maxPlayers: 1, killFeed: [], lastStandTriggered: false,
      difficulty, solo: true, autoStart,
    };
    const pid = randomUUID();
    const player = createPlayer(pid, name, data.warriorClass && WARRIOR_STATS[data.warriorClass] ? data.warriorClass : "warden", data.appearance || null);
    room.players.set(pid, player);
    room.hostId = pid;
    rooms.set(code, room);
    s.roomCode = code; s.playerId = pid;

    for (let i = 0; i < botCount; i++) addBot(room, i, difficulty);

    sendSession(sid, { type: "join", data: { playerId: pid, warriorStats: WARRIOR_STATS, ...serializeRoom(room) } });
    if (autoStart) {
      setTimeout(() => {
        if (rooms.get(code) === room && room.state === "lobby") startCountdown(room);
      }, 800);
    }
  }

  function addBot(room, idx, difficultyOverride) {
    const id = `bot_${randomUUID().slice(0, 8)}`;
    const cls = BOT_CLASSES[idx % BOT_CLASSES.length];
    const diff = normalizeDifficulty(difficultyOverride, room.difficulty);
    const bot = createPlayer(id, "", cls, { ...BOT_APPEARANCES[idx % BOT_APPEARANCES.length] });
    bot.bot = true;
    bot.ready = true;
    bot.baseName = BOT_NAMES[(Math.random() * BOT_NAMES.length) | 0];
    bot.nextThink = 0;
    bot.nextAttackAt = 0;
    bot.yaw = 0;
    bot.strafePhase = Math.random() * Math.PI * 2;
    bot.blockUntil = -1;
    bot.isBlocking = false;
    retuneBot(bot, diff);
    room.players.set(id, bot);
  }

  // Difficulty is a dial, not a birthmark: a bot can be re-graded in the lobby
  // and keeps its name and its place in the list.
  function retuneBot(bot, difficulty) {
    bot.difficulty = difficulty;
    bot.aiSkill = BOT_SKILL[difficulty];
    bot.name = (bot.baseName || bot.name) + BOT_TITLES[difficulty];
  }

  function removeBot(room, botId) {
    if (botId) {
      const victim = room.players.get(botId);
      if (!victim || !victim.bot) return false;
      room.players.delete(botId);
      return true;
    }
    let last = null;
    room.players.forEach((p, id) => { if (p.bot) last = id; });
    if (!last) return false;
    room.players.delete(last);
    return true;
  }

  function startCountdown(room) {
    room.state = "countdown";
    room.countdown = MATCH_COUNTDOWN;
    const spawns = spawnPositions(room.players.size);
    let i = 0;
    room.players.forEach((p) => {
      p.position = { ...spawns[i] };
      p.rotation = Math.atan2(-p.position.x, -p.position.z);
      p.health = p.maxHealth;
      p.stamina = p.maxStamina;
      p.state = "idle";
      p.kills = 0; p.deaths = 0; p.damage = 0; p.score = 0;
      p.invincible = true; p.invincibleTimer = SPAWN_INVINCIBLE;
      // Nobody walks out of the last fight into this one.
      clearMotion(p);
      i++;
    });
    broadcast(room, { type: "countdown", data: { ...serializeRoom(room), countdown: room.countdown } });

    const ci = setInterval(() => {
      room.countdown--;
      if (room.countdown <= 0) {
        clearInterval(ci);
        room.state = "fighting";
        room.matchTimer = 0;
        broadcast(room, { type: "game_state", data: serializeRoom(room) });
      } else {
        broadcast(room, { type: "countdown", data: { countdown: room.countdown } });
      }
    }, 1000);
  }

  // ---------------- combat ----------------
  // A burst of travel laid on top of steering. `distance` is the ground it
  // covers over its whole life — see the integration note in gameTick — so a
  // roll goes exactly as far as the class sheet says a roll goes.
  function applyImpulse(player, dirX, dirZ, distance, replace) {
    const len = Math.hypot(dirX, dirZ) || 1;
    const speed = distance / IMPULSE_TAU;
    if (replace) {
      player.impulse.x = (dirX / len) * speed;
      player.impulse.z = (dirZ / len) * speed;
    } else {
      player.impulse.x += (dirX / len) * speed;
      player.impulse.z += (dirZ / len) * speed;
    }
  }

  // Strikes, guards and rolls resolve the moment the message lands — a click
  // that waits for the next tick is a click the player believes he lost.
  // Steering is only recorded here; gameTick is what moves anybody.
  function processInput(room, player, input) {
    const stats = WARRIOR_STATS[player.warriorClass];
    player.rotation = finite(input.rotationY);
    if (player.state === "staggered") return;

    if (input.dodge && player.dodgeTimer <= 0 && player.stamina >= 20 && player.state !== "dodging") {
      player.state = "dodging"; player.dodgeTimer = DODGE_COOLDOWN;
      player.stamina -= 20; player.invincible = true; player.invincibleTimer = DODGE_DURATION;
      // You roll where you lean, and away from the fight if you lean nowhere.
      // (Taking each axis' fallback separately used to send a warrior holding W
      //  rolling diagonally.)
      let dx = finite(input.moveX), dz = finite(input.moveZ);
      if (dx === 0 && dz === 0) { dx = -Math.sin(player.rotation); dz = -Math.cos(player.rotation); }
      // The roll owns the body: whatever stride you were in is spent on it.
      player.moveVel.x = 0; player.moveVel.z = 0;
      applyImpulse(player, dx, dz, stats.dodgeDistance, true);
      return;
    }

    if (input.block && player.state !== "attacking" && player.state !== "dodging") {
      player.state = "blocking"; player.blockDir = input.attackDir;
      player.blockTimer = player.blockTimer || 0.001;
    } else if (player.state === "blocking" && !input.block) {
      player.state = "idle"; player.blockTimer = 0;
    }

    if (input.attack && player.attackTimer <= 0 && player.state !== "blocking" && player.state !== "dodging" && player.stamina >= 13) {
      player.state = "attacking"; player.attackDir = input.attackDir;
      player.attackTimer = stats.attackSpeed; player.stamina -= 13;
      if (player.comboTimer > 0) player.comboCount++; else player.comboCount = 1;
      player.comboTimer = COMBO_WINDOW;
      // Attack lunge — every strike propels you toward the blow
      applyImpulse(player, Math.sin(player.rotation), Math.cos(player.rotation), LUNGE_LIGHT, false);
      processAttack(room, player, stats.attackDamage, false);
    }

    if (input.heavyAttack && player.attackTimer <= 0 && player.state !== "blocking" && player.state !== "dodging" && player.stamina >= 22) {
      player.state = "attacking"; player.attackDir = input.attackDir;
      player.attackTimer = stats.attackSpeed * 1.4; player.stamina -= 22;
      player.comboCount = 0; player.comboTimer = 0;
      applyImpulse(player, Math.sin(player.rotation), Math.cos(player.rotation), LUNGE_HEAVY, false);
      processAttack(room, player, stats.heavyDamage, true);
    }

    if (input.ability && player.abilityCooldown <= 0) activateAbility(room, player);
  }

  function processAttack(room, attacker, baseDamage, isHeavy) {
    const comboMult = Math.min(1 + attacker.comboCount * 0.15, 1.6);
    const abilityMult = attacker.abilityActive && attacker.warriorClass === "berserker" ? 1.5 :
      attacker.abilityActive && attacker.warriorClass === "warden" ? 1.3 : 1;
    const dmg = Math.floor(baseDamage * comboMult * abilityMult);
    const range = reachOf(attacker);
    const arc = SWING_ARC[attacker.warriorClass] ?? DEFAULT_SWING_ARC;

    room.players.forEach((target) => {
      if (target.id === attacker.id || target.state === "dead") return;
      if (room.mode === "war_band" && attacker.team === target.team && attacker.team !== "none") return;
      const dx = target.position.x - attacker.position.x;
      const dz = target.position.z - attacker.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > range) return;
      const angleToTarget = Math.atan2(dx, dz);
      let angleDiff = angleToTarget - attacker.rotation;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      if (Math.abs(angleDiff) > arc) return;
      if (target.invincible) return;

      if (target.state === "blocking") {
        const blockStats = WARRIOR_STATS[target.warriorClass];
        const shieldWall = target.abilityActive && target.warriorClass === "huscarl";
        const eff = shieldWall ? 0.95 : blockStats.blockReduction;
        if (target.blockTimer > 0 && target.blockTimer < PARRY_WINDOW) {
          attacker.state = "staggered"; attacker.staggerTimer = STAGGER_DURATION * 1.5;
          broadcast(room, { type: "hit", data: { type: "parry", attackerId: attacker.id, targetId: target.id, damage: 0 } });
          return;
        }
        if (isHeavy && !shieldWall) {
          target.state = "staggered"; target.staggerTimer = STAGGER_DURATION;
          applyDamage(room, attacker, target, Math.floor(dmg * (1 - eff * 0.5)), "blocked_heavy");
        } else {
          target.stamina -= 10;
          applyDamage(room, attacker, target, Math.floor(dmg * (1 - eff)), "blocked");
        }
        return;
      }
      applyDamage(room, attacker, target, dmg, isHeavy ? "heavy" : "light");
    });
  }

  function applyDamage(room, attacker, target, damage, hitType) {
    target.health -= damage; target.lastHitBy = attacker.id; attacker.damage += damage;
    broadcast(room, { type: "hit", data: { type: hitType, attackerId: attacker.id, targetId: target.id, damage, health: target.health, direction: attacker.attackDir } });
    if (target.health <= 0) {
      target.health = 0; target.state = "dead"; target.deaths++;
      target.deadAt = room.matchTimer;
      clearMotion(target);   // the dead stop running
      attacker.kills++; attacker.score += 100;
      room.killFeed.push({ killer: attacker.id, victim: target.id, killerName: attacker.name, victimName: target.name, timestamp: Date.now() });
      broadcast(room, { type: "kill", data: { killerId: attacker.id, killerName: attacker.name, victimId: target.id, victimName: target.name } });
      if (room.mode !== "solo") checkMatchEnd(room);
    }
  }

  function activateAbility(room, player) {
    const stats = WARRIOR_STATS[player.warriorClass];
    player.abilityCooldown = stats.abilityCooldown; player.abilityActive = true;
    switch (player.warriorClass) {
      case "huscarl": player.abilityTimer = 4; break;
      case "warden": player.abilityTimer = 5; break;
      case "runekeeper": {
        let nearest = null, minDist = Infinity;
        room.players.forEach((t) => {
          if (t.id === player.id || t.state === "dead") return;
          const d = Math.hypot(t.position.x - player.position.x, t.position.z - player.position.z);
          if (d < minDist) { minDist = d; nearest = t; }
        });
        if (nearest) {
          player.position.x = nearest.position.x + Math.sin(nearest.rotation) * 2;
          player.position.z = nearest.position.z + Math.cos(nearest.rotation) * 2;
          player.rotation = nearest.rotation + Math.PI;
          player.invincible = true; player.invincibleTimer = 0.3;
        }
        player.abilityTimer = 0.5; break;
      }
      case "berserker": player.abilityTimer = 6; break;
    }
    broadcast(room, { type: "ability_used", data: { playerId: player.id, ability: stats.ability, warriorClass: player.warriorClass } });
  }

  function checkMatchEnd(room) {
    const alive = [];
    room.players.forEach((p) => { if (p.state !== "dead") alive.push(p); });
    if (room.mode === "blood_moot" || room.mode === "honour_duel") {
      if (alive.length === 2 && !room.lastStandTriggered && room.players.size > 2) {
        room.lastStandTriggered = true; room.state = "last_stand";
        broadcast(room, { type: "last_stand", data: { players: alive.map((p) => ({ id: p.id, name: p.name })) } });
      }
      if (alive.length <= 1) endMatch(room, alive[0] || null);
    } else if (room.mode === "war_band") {
      const ra = alive.filter((p) => p.team === "red").length;
      const ba = alive.filter((p) => p.team === "blue").length;
      if (ra === 0 || ba === 0) endMatch(room, alive[0] || null);
    }
  }

  function endMatch(room, winner) {
    room.state = "finished";
    const results = [];
    room.players.forEach((p) => {
      const xp = 50 + p.kills * 30 + p.damage * 0.5 + (p.id === winner?.id ? 100 : 0);
      const gold = 10 + p.kills * 15 + (p.id === winner?.id ? 50 : 0);
      results.push({ id: p.id, name: p.name, kills: p.kills, deaths: p.deaths, damage: p.damage, score: p.score, isWinner: p.id === winner?.id, xpEarned: Math.floor(xp), goldEarned: Math.floor(gold) });
    });
    broadcast(room, { type: "match_end", data: { winnerId: winner?.id || null, winnerName: winner?.name || "Draw", results } });
    setTimeout(() => {
      if (!rooms.has(room.code)) return;
      room.state = "lobby"; room.matchTimer = 0; room.countdown = 0; room.killFeed = []; room.lastStandTriggered = false;
      room.players.forEach((p) => {
        const stats = WARRIOR_STATS[p.warriorClass];
        p.health = stats.maxHealth; p.stamina = stats.staminaMax; p.state = "idle"; p.ready = false;
        p.kills = 0; p.deaths = 0; p.damage = 0; p.score = 0;
        p.position = { x: 0, y: 0, z: 0 }; p.invincible = false;
        clearMotion(p);
      });
      sendLobbyUpdate(room);
    }, 10000);
  }

  // ---------------- bots ----------------
  function angDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // Bots ask for movement exactly the way a player does and the tick answers
  // both the same way. A bot that could write its own velocity was a bot that
  // could not be outrun, however fast the class sheet said you were.
  function botIntent(bot, moveX, moveZ, sprint) {
    bot.latestInput = { moveX, moveZ, rotationY: bot.yaw, sprint: !!sprint, block: false };
  }

  // One-shot deed. Movement intent is left alone: a swing does not stop a bot
  // wanting to circle, any more than it stops a player leaning on W.
  function botAct(room, bot, deed) {
    processInput(room, bot, {
      moveX: 0, moveZ: 0, rotationY: bot.yaw, sprint: false,
      attack: false, heavyAttack: false, block: false, dodge: false,
      crouch: false, ability: false, attackDir: "right",
      ...deed,
    });
  }

  function botThink(room, bot, dt) {
    if (bot.state === "dead") return;
    const now = room.matchTimer;
    if (now < bot.nextThink) return;
    bot.nextThink = now + (0.18 - bot.aiSkill * 0.08);

    // Release a held block when its guard window ends
    if (bot.isBlocking && now >= bot.blockUntil) {
      botAct(room, bot, {});
      bot.isBlocking = false;
    }

    // Find nearest living enemy (prefer humans in solo for pressure)
    let target = null, minDist = Infinity;
    let human = null, humanDist = Infinity;
    room.players.forEach((p) => {
      if (p.id === bot.id) return;
      const d = Math.hypot(p.position.x - bot.position.x, p.position.z - bot.position.z);
      if (p.state === "dead") return;
      if (d < minDist) { minDist = d; target = p; }
      if (!p.bot && d < humanDist) { humanDist = d; human = p; }
    });
    if (room.mode === "solo" && human && humanDist < minDist + 3) target = human;
    if (!target) {
      // Wander the moot — half a stride, so it reads as pacing, not patrolling
      if (Math.random() < 0.02) {
        const a = Math.random() * Math.PI * 2;
        bot.yaw = a; bot.rotation = a;
        botIntent(bot, Math.sin(a) * 0.5, Math.cos(a) * 0.5, false);
      }
      return;
    }

    const dx = target.position.x - bot.position.x;
    const dz = target.position.z - bot.position.z;
    const dist = Math.max(0.01, Math.hypot(dx, dz));
    const angleTo = Math.atan2(dx, dz);

    // Smooth turning toward target (no snap jitter)
    const turn = Math.min(1, dt * (6 + bot.aiSkill * 8));
    bot.yaw += angDiff(angleTo, bot.yaw ?? angleTo) * turn;
    bot.rotation = bot.yaw;

    const nx = dx / dist, nz = dz / dist;         // toward target
    const px = -nz, pz = nx;                       // perpendicular (strafe)
    bot.strafePhase += dt * (0.6 + bot.aiSkill * 0.5);
    const strafe = Math.sin(bot.strafePhase);

    const dirs = ["left", "right", "overhead", "stab"];
    const attackDir = dirs[(Math.random() * 4) | 0];
    const enemyAttacking = target.state === "attacking";

    // Every distance a bot judges is now judged against a weapon rather than
    // against one constant. Two different weapons are in play and the bot needs
    // both: its own reach decides where it stands and when it swings, the
    // target's decides when it is in danger and must guard or roll.
    const myReach = reachOf(bot);
    const theirReach = reachOf(target);

    // Perfect-spacing steering: close in hungry, back off when too close.
    // Held at 0.7 of its own reach, which is where the old 2.1 sat inside the
    // old flat 3.0 — near enough to strike on the next beat without standing so
    // deep that a backstep takes it out of range. A runekeeper bot that kept the
    // old 2.1 would have paced around a seax that stops biting at 1.70 and swung
    // at air for the whole match.
    const wantDist = myReach * 0.7;
    let toward = 0;
    if (dist > wantDist + 0.4) toward = 1;
    else if (dist < wantDist - 0.5) toward = -0.7;

    // A short intent vector is a slow stride: circling at 0.45 stays a circle,
    // not a charge. The tick reads magnitude as throttle.
    if (toward !== 0 || Math.abs(strafe) > 0.2) {
      const charge = dist > 7 && bot.stamina > 40 && toward > 0;
      botIntent(bot, nx * toward + px * strafe * 0.45, nz * toward + pz * strafe * 0.45, charge);
    } else {
      botIntent(bot, 0, 0, false);
    }

    // Guard: hold a BLOCK for a short window when enemy winds up
    if (enemyAttacking && !bot.isBlocking && dist < theirReach * 1.15 && Math.random() < 0.22 + bot.aiSkill * 0.3) {
      botAct(room, bot, { block: true, attackDir: target.attackDir });
      bot.isBlocking = true;
      bot.blockUntil = now + 0.45 + Math.random() * 0.6;
      return;
    }

    // Dodge an imminent close blow
    if (enemyAttacking && dist < theirReach * 0.65 && bot.dodgeTimer <= 0 && Math.random() < 0.08 + bot.aiSkill * 0.18) {
      botAct(room, bot, { moveX: -nx, moveZ: -nz, dodge: true });
      return;
    }

    // Ability on cooldown-loop
    if (bot.abilityCooldown <= 0 && dist < 4 && Math.random() < 0.03 + bot.aiSkill * 0.03) {
      botAct(room, bot, { ability: true, attackDir });
    }

    // Strike cadence
    if (!bot.isBlocking && dist <= myReach * 0.95 && now >= bot.nextAttackAt && bot.stamina > 25) {
      const heavy = Math.random() < 0.2 * bot.aiSkill + (target.state === "blocking" ? 0.18 : 0);
      botAct(room, bot, {
        rotationY: bot.yaw + (Math.random() - 0.5) * 0.15,
        attack: !heavy, heavyAttack: heavy, attackDir,
      });
      bot.nextAttackAt = now + (1.5 - bot.aiSkill * 0.75) + Math.random() * 0.7;
    }
  }

  // ---------------- movement ----------------
  // The tick is the only clock the simulation trusts. An input message says
  // what a warrior WANTS; how far he actually travels is settled here, once
  // per fixed step, so a player on a ragged line moves exactly as fast as one
  // on a clean line — and exactly as fast as his class sheet promises.
  //
  //   steering:  v += (want - v) * k,   k = 1 - e^(-dt/TAU)
  //
  // What sustained speed does that produce? The correction is proportional to
  // (want - v) and to nothing else, so the fixed point is v = want exactly: no
  // offset, no residue, no dependence on dt, TAU or the message rate. The step
  // integrates with the post-update v, so a step at the fixed point covers
  // want*dt, and a hold of T seconds from a standstill covers
  //
  //   want * (T - TAU*(1 - e^(-T/TAU)))
  //
  // — the full distance less one time constant's worth of ramp. For a Warden's
  // 4.5 u/s and the playtest's 1.2 s hold that is 4.5*(1.2 - 0.17) = 4.63 units
  // against an assertion of 3.0, and 4.67 measured in-process. So the algebra
  // here was already right; what was wrong was `dt` — see gameTick.
  //
  // Two things would move that fixed point off the sheet, and both are
  // deliberately absent:
  //   - Drag on a step that HAS intent. Any drag term at all, applied
  //     alongside the correction, settles at want*k/(k + drag) < want, which
  //     makes top speed a property of the tuning constants instead of the class
  //     sheet. So deceleration lives only in the `else` branch: letting go is
  //     what stops you, not moving.
  //   - An unclamped intent vector. `want` is the intent DIRECTION times
  //     min(1, |intent|) * speed, so a keyboard diagonal (|intent| = √2) walks
  //     at moveSpeed rather than 1.41 * moveSpeed, and a thumb half pushed
  //     walks at half of it. Nothing a client sends can ask for more than one.
  //
  // (Two passes ago this lerped toward `want` once per input MESSAGE and
  //  multiplied by 0.87 once per TICK, settling at 0.87(1-a^m)/(1-0.87·a^m)·want
  //  for m messages a tick, a = 0.07^dt — 45% of the stated speed at 20 msg/s,
  //  69% at 60, 87% at infinity. Top speed was a network measurement. The pass
  //  after that fixed the algebra and left the clock, which was the other half
  //  of the same bug.)
  //
  // Sprint and guard are the only multipliers on `want`, and both are sheet
  // numbers rather than accidents: sprintSpeed is its own column and is reached
  // to the same tolerance as the walk, and a raised shield is exactly
  // BLOCK_MOVE_MULT of the walk — 0.55, enough to be felt, not enough to root
  // you, and never compounded with a sprint because you cannot sprint behind a
  // shield.
  function integrateMovement(player, dt) {
    const stats = WARRIOR_STATS[player.warriorClass];
    // Committed: the body is spent on a swing, a roll or a stagger, and steers
    // for nobody — but it keeps the momentum it already had.
    const committed = player.state === "attacking" || player.state === "dodging" || player.state === "staggered";
    const intent = currentIntent(player);

    let wantX = 0, wantZ = 0, sprinting = false;
    if (intent && !committed) {
      const mx = finite(intent.moveX), mz = finite(intent.moveZ);
      const len = Math.hypot(mx, mz);
      if (len > 0.05) {
        sprinting = !!intent.sprint && player.stamina > 10 && player.state !== "blocking";
        const guard = player.state === "blocking" ? BLOCK_MOVE_MULT : 1;
        const speed = (sprinting ? stats.sprintSpeed : stats.moveSpeed) * guard;
        // A thumb half-pushed is half a stride; a keyboard is always all of it,
        // and nothing a client sends can ask for more than one.
        const throttle = Math.min(1, len) / len * speed;
        wantX = mx * throttle; wantZ = mz * throttle;
      }
    }
    const moving = wantX !== 0 || wantZ !== 0;

    if (moving) {
      const k = 1 - Math.exp(-dt / MOVE_ACCEL_TAU);
      player.moveVel.x += (wantX - player.moveVel.x) * k;
      player.moveVel.z += (wantZ - player.moveVel.z) * k;
    } else {
      const k = Math.exp(-dt / (committed ? MOVE_CARRY_TAU : MOVE_STOP_TAU));
      player.moveVel.x *= k; player.moveVel.z *= k;
      if (Math.abs(player.moveVel.x) < 0.01) player.moveVel.x = 0;
      if (Math.abs(player.moveVel.z) < 0.01) player.moveVel.z = 0;
    }

    // Locomotion never overwrites a state the fight owns.
    if (player.state === "idle" || player.state === "walking" || player.state === "running" || player.state === "sprinting") {
      player.state = !moving ? "idle" : sprinting ? "sprinting" : intent && intent.sprint ? "running" : "walking";
    }

    // A burst decays by e^(-dt/TAU); the exact ground it covers in this tick is
    // the integral of that, and those integrals sum to impulse*TAU over its
    // whole life. Launch it at distance/TAU and it travels `distance`, period.
    const decay = Math.exp(-dt / IMPULSE_TAU);
    const carried = IMPULSE_TAU * (1 - decay);
    player.position.x += player.moveVel.x * dt + player.impulse.x * carried;
    player.position.z += player.moveVel.z * dt + player.impulse.z * carried;
    player.impulse.x *= decay; player.impulse.z *= decay;
    if (Math.abs(player.impulse.x) < 0.01) player.impulse.x = 0;
    if (Math.abs(player.impulse.z) < 0.01) player.impulse.z = 0;

    // What goes on the wire is the whole motion, not the steering half of it —
    // the client leans and extrapolates off this.
    player.velocity.x = player.moveVel.x + player.impulse.x;
    player.velocity.z = player.moveVel.z + player.impulse.z;

    if (sprinting) player.stamina -= SPRINT_STAMINA * dt;
    if (player.state === "blocking") player.stamina -= BLOCK_STAMINA * dt;
  }

  // The last input a player sent is his standing intent — the tick keeps acting
  // on it until a newer one arrives. If the link dies or the tab sleeps we let
  // that intent lapse rather than leave a warrior jogging into the palisade
  // forever. Bots are simulated in-process, so their intent is never stale.
  function currentIntent(player) {
    if (!player.latestInput) return null;
    if (!player.bot && Date.now() - player.inputAt > INPUT_LAPSE_MS) {
      if (player.state === "blocking") { player.state = "idle"; player.blockTimer = 0; }
      return null;
    }
    return player.latestInput;
  }

  function clearMotion(player) {
    player.velocity = { x: 0, y: 0, z: 0 };
    player.moveVel = { x: 0, z: 0 };
    player.impulse = { x: 0, z: 0 };
    player.latestInput = null;
    player.inputAt = 0;
  }

  // ---------------- tick ----------------
  // THE CLOCK, and the movement bug's real home. Every quantity in the
  // simulation is a rate times this function's dt, so if dt is a fiction then
  // the whole game — speed, stamina, cooldowns, the match timer — runs at the
  // wrong rate together.
  //
  // It used to be `setInterval(gameTick, 50)` with a hardcoded `dt = 1/20`.
  // setInterval is not a real-time clock; it is "no sooner than". A Node loop
  // sharing a box with anything (a Next request, a GC pause, a headless browser
  // eating four cores in the next process) delivers 8-12 Hz while the code keeps
  // charging 50 ms a wake, so:
  //
  //   observed speed = stats.moveSpeed * TICK_MS / real_ms_between_wakes
  //
  // A Warden's 4.5 u/s measured 1.92 u/s in the playtest, which is 4.5 * 50/117:
  // a tick really firing at 8.5 Hz. Blocking this loop on purpose reproduces it
  // to the digit — 20.0 Hz -> 7.9 Hz takes a held W from 4.52 units in 1.2 s to
  // 1.53 — and no correction to integrateMovement can touch it, because the
  // integrator was never the thing that was wrong.
  //
  // So the step stays fixed at 1/TICK_RATE — every tuning constant then means
  // what it says, a step is too short to tunnel a body through another, and two
  // runs of the same inputs agree — and the wall clock decides how many steps
  // are owed. Arrears carry rather than being dropped, so a run of 63 ms wakes
  // averages out exactly instead of quietly losing 13 ms each time. One
  // broadcast per wake regardless: the packet rate may sag on a starved box, the
  // simulation rate may not.
  function gameTick() {
    const now = performance.now();
    if (now - simClock > MAX_CATCHUP_MS) simClock = now - MAX_CATCHUP_MS;
    const steps = Math.floor((now - simClock + TICK_SLACK_MS) / TICK_MS);
    if (steps <= 0) return;   // owed nothing yet: no simulation, no duplicate snapshot
    simClock += steps * TICK_MS;

    rooms.forEach((room) => {
      if (room.state !== "fighting" && room.state !== "last_stand" && room.state !== "heartbeat") return;
      for (let s = 0; s < steps; s++) stepRoom(room, TICK_DT);
      broadcast(room, { type: "game_state", data: serializeRoom(room) });
    });
  }

  // One fixed step of one room. Never called with anything but TICK_DT — the
  // constant is a parameter so the substep loop above reads as what it is.
  function stepRoom(room, dt) {
    room.matchTimer += dt;

    room.players.forEach((player) => {
      // Solo respawns for endless training
      if (room.mode === "solo" && player.state === "dead") {
        if (room.matchTimer - player.deadAt > 5) {
          const stats = WARRIOR_STATS[player.warriorClass];
          const sp = spawnPositions(8)[(Math.random() * 8) | 0];
          player.position = { ...sp };
          player.health = stats.maxHealth;
          player.stamina = stats.staminaMax;
          player.state = "idle";
          player.invincible = true; player.invincibleTimer = 1.5;
          player.deadAt = -999;
          clearMotion(player);   // you come back standing, not still running
        }
        return;
      }
      if (player.state === "dead") return;

      if (player.bot) botThink(room, player, dt);

      if (player.attackTimer > 0) { player.attackTimer -= dt; if (player.attackTimer <= 0 && player.state === "attacking") player.state = "idle"; }
      if (player.blockTimer > 0) player.blockTimer += dt;
      if (player.dodgeTimer > 0) {
        player.dodgeTimer -= dt;
        // Dodge roll ends cleanly — the warrior returns to fighting stance
        if (player.dodgeTimer <= DODGE_COOLDOWN - DODGE_DURATION && player.state === "dodging") player.state = "idle";
        if (player.dodgeTimer <= 0 && player.state === "dodging") player.state = "idle";
      }
      if (player.staggerTimer > 0) { player.staggerTimer -= dt; if (player.staggerTimer <= 0 && player.state === "staggered") player.state = "idle"; }
      if (player.invincibleTimer > 0) { player.invincibleTimer -= dt; if (player.invincibleTimer <= 0) player.invincible = false; }
      if (player.comboTimer > 0) { player.comboTimer -= dt; if (player.comboTimer <= 0) player.comboCount = 0; }
      if (player.abilityCooldown > 0) player.abilityCooldown -= dt;
      if (player.abilityActive) {
        player.abilityTimer -= dt;
        if (player.abilityTimer <= 0) { player.abilityActive = false; if (player.state === "ability") player.state = "idle"; }
        if (player.warriorClass === "berserker") { player.health -= 3 * dt; if (player.health < 1) player.health = 1; }
      }
      integrateMovement(player, dt);

      const stats = WARRIOR_STATS[player.warriorClass];
      if (player.state !== "sprinting" && player.state !== "attacking") {
        player.stamina = Math.min(player.maxStamina, player.stamina + stats.staminaRegen * dt);
      }
      if (player.stamina < 0) player.stamina = 0;

      // The palisade. The projection is radial, so it only ever costs the
      // outward part of a step — a warrior meeting the wall at an angle keeps
      // every bit of his tangential travel and slides along it, which is why
      // this is not a displacement leak on the way to it. What it must also do
      // is take the outward velocity with it: leaving 4.5 u/s pointed into the
      // timber makes the client extrapolate through the wall and snap back on
      // every packet, and hands the stride straight back the instant the body
      // turns away.
      const r = Math.hypot(player.position.x, player.position.z);
      if (r > ARENA_RADIUS) {
        const nx = player.position.x / r, nz = player.position.z / r;
        player.position.x = nx * ARENA_RADIUS;
        player.position.z = nz * ARENA_RADIUS;
        killComponent(player, nx, nz);
      }
    });

    // Soft body collision — warriors cannot stack on each other. The push is
    // positional and symmetric, and it eats displacement only while two bodies
    // are actually overlapping, which is the point of it.
    const arr = [];
    room.players.forEach((p) => { if (p.state !== "dead") arr.push(p); });
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d = Math.hypot(dx, dz);
        const MIN = 1.05;
        if (d < MIN && d > 0.0001) {
          const push = (MIN - d) * 0.5;
          const nx = dx / d, nz = dz / d;
          // A roll goes through the scrum rather than being sorted by it.
          if (a.state !== "dodging") { a.position.x -= nx * push; a.position.z -= nz * push; killComponent(a, nx, nz); }
          if (b.state !== "dodging") { b.position.x += nx * push; b.position.z += nz * push; killComponent(b, -nx, -nz); }
        }
      }
    }
  }

  // `blockedX/blockedZ` is a unit direction that has just turned solid — the
  // outward radial at the palisade, the line to the man you walked into. Take
  // the part of the stride pointed that way and only that part, so the warrior
  // goes on sliding along the wall or around him. Without this the server spends
  // displacement it then undoes, reports a velocity the client extrapolates into
  // the obstacle, and hands back a full stride the instant contact breaks. The
  // impulse is deliberately left alone: a lunge that lands on a shield should
  // still read as a lunge, and it decays on its own.
  function killComponent(player, blockedX, blockedZ) {
    const into = player.moveVel.x * blockedX + player.moveVel.z * blockedZ;
    if (into <= 0) return;
    player.moveVel.x -= into * blockedX; player.moveVel.z -= into * blockedZ;
    player.velocity.x = player.moveVel.x + player.impulse.x;
    player.velocity.z = player.moveVel.z + player.impulse.z;
  }

  // The timer only decides how often we come and LOOK at the clock; how much
  // simulation happens is gameTick's business. A late wake is worked off, not
  // lost, so this being a plain setInterval is now a scheduling detail rather
  // than the thing that sets the game's speed.
  const tickInterval = setInterval(gameTick, TICK_MS);

  return {
    connect(sender) {
      const sid = randomUUID();
      sessions.set(sid, { sender, roomCode: null, playerId: null });
      return sid;
    },
    attachSender(sid, sender) {
      const s = sessions.get(sid);
      if (!s) return false;
      s.sender = sender;
      return true;
    },
    detachSender(sid) {
      const s = sessions.get(sid);
      if (!s) return false;
      s.sender = null;
      return true;
    },
    message(sid, msg) { routeMessage(sid, msg); },
    httpMessage(sid, msg) {
      const replies = [];
      const s = sessions.get(sid);
      if (!s) return { ok: false, replies: [] };
      const prev = s.sender;
      s.sender = (str) => replies.push(JSON.parse(str));
      try { routeMessage(sid, msg); }
      finally { s.sender = prev; }
      return { ok: true, replies };
    },
    disconnectSession,
    has(sid) { return sessions.has(sid); },
    _tickInterval: tickInterval,
  };

  function disconnectSession(sid) {
    const s = sessions.get(sid);
    if (!s) return;
    if (s.roomCode && s.playerId) {
      const room = rooms.get(s.roomCode);
      if (room) {
        room.players.delete(s.playerId);
        broadcast(room, { type: "player_left", data: { playerId: s.playerId } });
        if (humanCount(room) === 0) {
          rooms.delete(room.code);
        } else {
          if (room.hostId === s.playerId) {
            for (const [pid] of room.players) { if (!pid.startsWith("bot_")) { room.hostId = pid; break; } }
          }
          if (room.state === "fighting" || room.state === "last_stand") checkMatchEnd(room);
          else sendLobbyUpdate(room);
        }
      }
    }
    sessions.delete(sid);
  }
}

export function getEngine() {
  const g = globalThis;
  if (!g.__bretwaldaEngine) g.__bretwaldaEngine = makeEngine();
  return g.__bretwaldaEngine;
}
