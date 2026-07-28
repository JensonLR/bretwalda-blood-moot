// ============================================================
// BRETWALDA — Unified Game Engine (WS + HTTP transports, bots)
// Shared singleton via globalThis so custom-server and Next API
// routes share the same rooms in one process.
// ============================================================
import { randomUUID } from "crypto";

const TICK_RATE = 20;
const ATTACK_RANGE = 3.0;
const PARRY_WINDOW = 0.15;
const COMBO_WINDOW = 0.8;
const DODGE_DURATION = 0.35;
const DODGE_COOLDOWN = 0.8;
const STAGGER_DURATION = 0.6;
const MATCH_COUNTDOWN = 3;
const SPAWN_INVINCIBLE = 2.0;
const ARENA_RADIUS = 18;

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

  function generateCode() {
    const name = ROOM_NAMES[(Math.random() * ROOM_NAMES.length) | 0];
    const num = ((Math.random() * 90) | 0) + 10;
    return `${name}${num}`;
  }

  function createPlayer(id, name, warriorClass, appearance) {
    const stats = WARRIOR_STATS[warriorClass];
    return {
      id, name, warriorClass, team: "none", ready: false,
      appearance: appearance || null,
      position: { x: 0, y: 0, z: 0 }, rotation: 0, velocity: { x: 0, y: 0, z: 0 },
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

  function serializeRoom(room) {
    const players = {};
    room.players.forEach((p, id) => { players[id] = { ...p }; });
    return {
      code: room.code, mode: room.mode, state: room.state, arena: room.arena,
      players, hostId: room.hostId, countdown: room.countdown, matchTimer: room.matchTimer,
      maxPlayers: room.maxPlayers, killFeed: room.killFeed.slice(-10), lastStandTriggered: room.lastStandTriggered,
    };
  }

  const sendLobbyUpdate = (room) => broadcast(room, { type: "lobby_update", data: serializeRoom(room) });

  function humanCount(room) {
    let n = 0;
    room.players.forEach((p) => { if (!p.id.startsWith("bot_")) n++; });
    return n;
  }

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
        if (room.hostId !== player.id || room.mode === "solo") return;
        const diff = ["recruit", "warrior", "jarl"].includes(data.difficulty) ? data.difficulty : "warrior";
        const current = room.players.size;
        if (current >= room.maxPlayers) return;
        room.difficulty = room.difficulty || diff;
        addBot(room, current, diff);
        sendLobbyUpdate(room);
      });
      case "remove_bot": return withRoom(sid, (room, player) => {
        if (room.hostId !== player.id || room.mode === "solo") return;
        for (const [pid] of room.players) {
          if (pid.startsWith("bot_")) { room.players.delete(pid); sendLobbyUpdate(room); return; }
        }
      });
      case "start": return withRoom(sid, (room, player) => {
        if (room.hostId !== player.id) return;
        const total = room.players.size;
        if (total < 2) return sendSession(sid, { type: "error", data: { message: "Summon a friend, or press ADD AI below your war code." } });
        startCountdown(room);
      });
      case "set_appearance": return withRoom(sid, (room, player) => { player.appearance = data.appearance || null; sendLobbyUpdate(room); });
      case "input": return withRoom(sid, (room, player) => {
        if (room.state !== "fighting" && room.state !== "last_stand") return;
        if (player.state === "dead") return;
        player.latestInput = data;
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
    sendSession(sid, { type: "join", data: { playerId: pid, ...serializeRoom(room) } });
  }

  function handleJoin(sid, data) {
    const s = sessions.get(sid);
    if (!s) return;
    const code = String(data.code || "").toUpperCase();
    const room = rooms.get(code);
    if (room && s.roomCode === room.code) {
      // already in this room — resend snapshot instead of duplicating
      return sendSession(sid, { type: "join", data: { playerId: s.playerId, ...serializeRoom(room) } });
    }
    leaveRoomForSession(s);
    if (!room) return sendSession(sid, { type: "error", data: { message: "Room not found. Check your code." } });
    if (room.state !== "lobby") return sendSession(sid, { type: "error", data: { message: "Battle already in progress." } });
    if (humanCount(room) >= room.maxPlayers) return sendSession(sid, { type: "error", data: { message: "Room is full." } });

    const pid = randomUUID();
    const player = createPlayer(pid, String(data.name || "Warrior").substring(0, 20), "warden", data.appearance || null);
    room.players.set(pid, player);
    s.roomCode = code; s.playerId = pid;
    sendSession(sid, { type: "join", data: { playerId: pid, ...serializeRoom(room) } });
    broadcast(room, { type: "player_joined", data: { playerId: pid, name: player.name } }, pid);
    sendLobbyUpdate(room);
  }

  function handleSolo(sid, data) {
    const s = sessions.get(sid);
    if (!s) return;
    leaveRoomForSession(s);
    const name = String(data.name || "Warrior").substring(0, 20);
    const difficulty = ["recruit", "warrior", "jarl"].includes(data.difficulty) ? data.difficulty : "warrior";
    let code = "SOLO" + generateCode();
    while (rooms.has(code)) code = "SOLO" + generateCode();

    const room = {
      code, mode: "solo", state: "lobby", arena: "saxon_village",
      players: new Map(), hostId: null, countdown: 0, matchTimer: 0,
      maxPlayers: 1, killFeed: [], lastStandTriggered: false,
      difficulty, solo: true,
    };
    const pid = randomUUID();
    const player = createPlayer(pid, name, data.warriorClass && WARRIOR_STATS[data.warriorClass] ? data.warriorClass : "warden", data.appearance || null);
    room.players.set(pid, player);
    room.hostId = pid;
    rooms.set(code, room);
    s.roomCode = code; s.playerId = pid;

    // Add bots per difficulty
    const botCount = difficulty === "recruit" ? 1 : difficulty === "warrior" ? 2 : 3;
    for (let i = 0; i < botCount; i++) addBot(room, i);

    sendSession(sid, { type: "join", data: { playerId: pid, ...serializeRoom(room) } });
    // Auto-start the trial
    setTimeout(() => { if (rooms.has(code)) startCountdown(room); }, 800);
  }

  function addBot(room, idx, difficultyOverride) {
    const id = `bot_${randomUUID().slice(0, 8)}`;
    const cls = BOT_CLASSES[idx % BOT_CLASSES.length];
    const diff = difficultyOverride || room.difficulty || "warrior";
    const name = BOT_NAMES[(Math.random() * BOT_NAMES.length) | 0] + (diff === "jarl" ? " the Grim" : diff === "recruit" ? " the Young" : "");
    const bot = createPlayer(id, name, cls, { ...BOT_APPEARANCES[idx % BOT_APPEARANCES.length] });
    bot.bot = true;
    bot.ready = true;
    bot.aiSkill = diff === "recruit" ? 0.45 : diff === "jarl" ? 0.92 : 0.7;
    bot.nextThink = 0;
    bot.nextAttackAt = 0;
    bot.yaw = 0;
    bot.strafePhase = Math.random() * Math.PI * 2;
    bot.blockUntil = -1;
    bot.isBlocking = false;
    room.players.set(id, bot);
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
  function processInput(room, player, input) {
    const stats = WARRIOR_STATS[player.warriorClass];
    const dt = 1 / TICK_RATE;
    player.rotation = input.rotationY;
    if (player.state === "staggered") return;

    if (input.dodge && player.dodgeTimer <= 0 && player.stamina >= 20 && player.state !== "dodging") {
      player.state = "dodging"; player.dodgeTimer = DODGE_COOLDOWN;
      player.stamina -= 20; player.invincible = true; player.invincibleTimer = DODGE_DURATION;
      const dx = input.moveX || -Math.sin(player.rotation) * 0.5;
      const dz = input.moveZ || -Math.cos(player.rotation) * 0.5;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      player.velocity.x = (dx / len) * stats.dodgeDistance * 2.4;
      player.velocity.z = (dz / len) * stats.dodgeDistance * 2.4;
      return;
    }

    if (input.block && player.state !== "attacking" && player.state !== "dodging") {
      player.state = "blocking"; player.blockDir = input.attackDir;
      player.blockTimer = player.blockTimer || 0.001; player.stamina -= 2 * dt;
    } else if (player.state === "blocking" && !input.block) {
      player.state = "idle"; player.blockTimer = 0;
    }

    if (input.attack && player.attackTimer <= 0 && player.state !== "blocking" && player.state !== "dodging" && player.stamina >= 13) {
      player.state = "attacking"; player.attackDir = input.attackDir;
      player.attackTimer = stats.attackSpeed; player.stamina -= 13;
      if (player.comboTimer > 0) player.comboCount++; else player.comboCount = 1;
      player.comboTimer = COMBO_WINDOW;
      // Attack lunge — every strike propels you toward the blow
      player.velocity.x += Math.sin(player.rotation) * 2.6;
      player.velocity.z += Math.cos(player.rotation) * 2.6;
      processAttack(room, player, stats.attackDamage, false);
    }

    if (input.heavyAttack && player.attackTimer <= 0 && player.state !== "blocking" && player.state !== "dodging" && player.stamina >= 22) {
      player.state = "attacking"; player.attackDir = input.attackDir;
      player.attackTimer = stats.attackSpeed * 1.4; player.stamina -= 22;
      player.comboCount = 0; player.comboTimer = 0;
      player.velocity.x += Math.sin(player.rotation) * 3.6;
      player.velocity.z += Math.cos(player.rotation) * 3.6;
      processAttack(room, player, stats.heavyDamage, true);
    }

    if (input.ability && player.abilityCooldown <= 0) activateAbility(room, player);

    // Momentum-based movement (Half Sword style weight): accelerate
    // toward target velocity rather than snapping to it
    if (player.state !== "attacking" && player.state !== "dodging" && player.state !== "staggered") {
      const speed = input.sprint && player.stamina > 10 ? stats.sprintSpeed : stats.moveSpeed;
      if (input.sprint && (input.moveX !== 0 || input.moveZ !== 0)) {
        player.stamina -= 8 * dt; player.state = "sprinting";
      } else if (input.moveX !== 0 || input.moveZ !== 0) {
        player.state = input.sprint ? "running" : "walking";
      } else if (player.state !== "blocking") {
        player.state = "idle";
      }

      if (input.moveX !== 0 || input.moveZ !== 0) {
        const len = Math.sqrt(input.moveX * input.moveX + input.moveZ * input.moveZ) || 1;
        const wantX = (input.moveX / len) * speed;
        const wantZ = (input.moveZ / len) * speed;
        // Blocked warriors move slower
        const spdMult = player.state === "blocking" ? 0.55 : 1;
        const accel = 1 - Math.pow(0.07, dt); // lerp-rate toward want
        player.velocity.x += (wantX * spdMult - player.velocity.x) * accel;
        player.velocity.z += (wantZ * spdMult - player.velocity.z) * accel;
      }
      // (Friction for idle is handled by the tick deceleration)
    }
  }

  function processAttack(room, attacker, baseDamage, isHeavy) {
    const comboMult = Math.min(1 + attacker.comboCount * 0.15, 1.6);
    const abilityMult = attacker.abilityActive && attacker.warriorClass === "berserker" ? 1.5 :
      attacker.abilityActive && attacker.warriorClass === "warden" ? 1.3 : 1;
    const dmg = Math.floor(baseDamage * comboMult * abilityMult);

    room.players.forEach((target) => {
      if (target.id === attacker.id || target.state === "dead") return;
      if (room.mode === "war_band" && attacker.team === target.team && attacker.team !== "none") return;
      const dx = target.position.x - attacker.position.x;
      const dz = target.position.z - attacker.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > ATTACK_RANGE) return;
      const angleToTarget = Math.atan2(dx, dz);
      let angleDiff = angleToTarget - attacker.rotation;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      if (Math.abs(angleDiff) > Math.PI * 0.6) return;
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

  function botThink(room, bot, dt) {
    if (bot.state === "dead") return;
    const now = room.matchTimer;
    if (now < bot.nextThink) return;
    bot.nextThink = now + (0.18 - bot.aiSkill * 0.08);

    // Release a held block when its guard window ends
    if (bot.isBlocking && now >= bot.blockUntil) {
      processInput(room, bot, {
        moveX: 0, moveZ: 0, rotationY: bot.yaw, sprint: false,
        attack: false, heavyAttack: false, block: false, dodge: false,
        crouch: false, ability: false, attackDir: "right",
      });
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
      // Wander the moot
      if (Math.random() < 0.02) {
        const stats = WARRIOR_STATS[bot.warriorClass];
        const a = Math.random() * Math.PI * 2;
        bot.velocity.x = Math.sin(a) * stats.moveSpeed * 0.5;
        bot.velocity.z = Math.cos(a) * stats.moveSpeed * 0.5;
        bot.yaw = a; bot.rotation = a; bot.state = "walking";
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
    const stats = WARRIOR_STATS[bot.warriorClass];
    bot.strafePhase += dt * (0.6 + bot.aiSkill * 0.5);
    const strafe = Math.sin(bot.strafePhase);

    const dirs = ["left", "right", "overhead", "stab"];
    const attackDir = dirs[(Math.random() * 4) | 0];
    const enemyAttacking = target.state === "attacking";

    // Perfect-spacing steering: close in hungry, back off when too close
    const wantDist = 2.1;
    let toward = 0;
    if (dist > wantDist + 0.4) toward = 1;
    else if (dist < wantDist - 0.5) toward = -0.7;

    const speed = dist > 7 && bot.stamina > 40 ? stats.sprintSpeed : stats.moveSpeed;

    if (toward !== 0 || Math.abs(strafe) > 0.2) {
      const vx = nx * toward * speed + px * strafe * speed * 0.45;
      const vz = nz * toward * speed + pz * strafe * speed * 0.45;
      if (!bot.isBlocking && bot.state !== "attacking" && bot.state !== "dodging" && bot.state !== "staggered") {
        bot.velocity.x = vx; bot.velocity.z = vz;
        bot.state = toward > 0 && speed === stats.sprintSpeed ? "sprinting" : "walking";
        if (speed === stats.sprintSpeed && toward > 0) bot.stamina -= 6 * dt;
      }
    } else if (bot.state === "walking" || bot.state === "sprinting") {
      bot.state = "idle";
    }

    // Guard: hold a BLOCK for a short window when enemy winds up
    if (enemyAttacking && !bot.isBlocking && dist < 3.4 && Math.random() < 0.22 + bot.aiSkill * 0.3) {
      processInput(room, bot, {
        moveX: 0, moveZ: 0, rotationY: bot.yaw, sprint: false,
        attack: false, heavyAttack: false, block: true, dodge: false,
        crouch: false, ability: false, attackDir: target.attackDir,
      });
      bot.isBlocking = true;
      bot.blockUntil = now + (now < 0 ? 0 : 0) + 0.45 + Math.random() * 0.6;
      return;
    }

    // Dodge an imminent close blow
    if (enemyAttacking && dist < 1.9 && bot.dodgeTimer <= 0 && Math.random() < 0.08 + bot.aiSkill * 0.18) {
      processInput(room, bot, {
        moveX: -nx, moveZ: -nz, rotationY: bot.yaw, sprint: false,
        attack: false, heavyAttack: false, block: false, dodge: true,
        crouch: false, ability: false, attackDir: "right",
      });
      return;
    }

    // Ability on cooldown-loop
    if (bot.abilityCooldown <= 0 && dist < 4 && Math.random() < 0.03 + bot.aiSkill * 0.03) {
      processInput(room, bot, {
        moveX: 0, moveZ: 0, rotationY: bot.yaw, sprint: false,
        attack: false, heavyAttack: false, block: false, dodge: false,
        crouch: false, ability: true, attackDir,
      });
    }

    // Strike cadence
    if (!bot.isBlocking && dist <= ATTACK_RANGE * 0.95 && now >= bot.nextAttackAt && bot.stamina > 25) {
      const heavy = Math.random() < 0.2 * bot.aiSkill + (target.state === "blocking" ? 0.18 : 0);
      processInput(room, bot, {
        moveX: 0, moveZ: 0, rotationY: bot.yaw + (Math.random() - 0.5) * 0.15, sprint: false,
        attack: !heavy, heavyAttack: heavy, block: false, dodge: false,
        crouch: false, ability: false, attackDir,
      });
      bot.nextAttackAt = now + (1.5 - bot.aiSkill * 0.75) + Math.random() * 0.7;
    }
  }

  // ---------------- tick ----------------
  function gameTick() {
    const dt = 1 / TICK_RATE;
    rooms.forEach((room) => {
      if (room.state !== "fighting" && room.state !== "last_stand" && room.state !== "heartbeat") return;
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
        const stats = WARRIOR_STATS[player.warriorClass];
        if (player.state !== "sprinting" && player.state !== "attacking") {
          player.stamina = Math.min(player.maxStamina, player.stamina + stats.staminaRegen * dt);
        }
        player.position.x += player.velocity.x * dt;
        player.position.z += player.velocity.z * dt;
        const dist = Math.sqrt(player.position.x ** 2 + player.position.z ** 2);
        if (dist > ARENA_RADIUS) { const s = ARENA_RADIUS / dist; player.position.x *= s; player.position.z *= s; }
        if (player.state !== "dodging") { player.velocity.x *= 0.87; player.velocity.z *= 0.87; }
        else { player.velocity.x *= 0.94; player.velocity.z *= 0.94; }
      });

      // Soft body collision — warriors cannot stack on each other
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
            if (a.state !== "dodging") { a.position.x -= nx * push; a.position.z -= nz * push; }
            if (b.state !== "dodging") { b.position.x += nx * push; b.position.z += nz * push; }
          }
        }
      }

      broadcast(room, { type: "game_state", data: serializeRoom(room) });
    });
  }

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
