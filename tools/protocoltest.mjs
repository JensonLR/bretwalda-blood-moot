#!/usr/bin/env node
// ============================================================
// PROTOCOLTEST — the console client's conformance suite, years early.
//
//   node tools/protocoltest.mjs          (or: npm run protocoltest)
//
// docs/PLATFORM-PATH.md §2: no console accepts a web wrapper, so a console
// client is a rewrite of the CLIENT — and a rewrite of the WHOLE GAME unless
// the simulation is a portable headless module speaking a defined protocol.
// docs/WIRE-PROTOCOL.md writes that protocol down. This file is what stops the
// document being fiction.
//
// It does three things no other harness in this repo does:
//
//   1. It imports `engine.mjs` with `window`, `document`, `navigator`, `self`,
//      `location`, `HTMLElement` and `requestAnimationFrame` rigged as getters
//      that THROW, then plays a complete match through them. The day somebody
//      reaches for a browser global inside the simulation, this run dies — and
//      it dies here, in ten seconds, rather than eighteen months from now in a
//      console port.
//
//   2. It walks the engine's import graph statically and refuses any specifier
//      that is not a Node builtin or a sibling `.mjs`. Nothing may sneak in
//      three.js, React or a DOM shim through a transitive import.
//
//   3. It parses the ```protocol block at the end of docs/WIRE-PROTOCOL.md and
//      holds the code to it in both directions: no message may be emitted that
//      the document does not list, no message the document calls `live` may go
//      unseen in a full match, and no `C2S` entry may be missing from the
//      router. The document cannot silently rot.
//
// INNER-LOOP TOOL (docs/GATES.md): no browser, no build, no database, no
// network. Two rooms are played in parallel against the real engine singleton;
// the whole thing is seconds.
//
// Exits non-zero on any failure.
// ============================================================
import { readFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { builtinModules } from "module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = join(ROOT, "src/game/engine.mjs");
const DOC = join(ROOT, "docs/WIRE-PROTOCOL.md");

let pass = 0, fail = 0;
const notes = [];
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};
const note = (s) => { notes.push(s); console.log(`  ....  ${s}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait for a predicate rather than for a duration: fast when it can be. */
async function until(fn, ms, label) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${label} (${ms}ms)`);
    await sleep(20);
  }
}

// ============================================================
// 1. THE BROWSER TRAP — set before the engine is ever imported
// ============================================================
const touched = [];
for (const name of ["window", "document", "navigator", "self", "location", "HTMLElement",
  "requestAnimationFrame", "localStorage", "WebSocket", "XMLHttpRequest", "Image"]) {
  try {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        touched.push(name);
        throw new Error(`the simulation reached for \`${name}\` — engine.mjs must stay headless`);
      },
    });
  } catch { /* a host that will not let us rig this one; the rest still stand */ }
}

// ============================================================
// 2. THE IMPORT GRAPH — statically, before anything runs
// ============================================================
function importsOf(file) {
  const src = readFileSync(file, "utf8");
  const out = [];
  const re = /^\s*(?:import|export)[^'"]*?from\s+["']([^"']+)["']/gm;
  for (let m; (m = re.exec(src));) out.push(m[1]);
  const bare = /^\s*import\s+["']([^"']+)["']/gm;
  for (let m; (m = bare.exec(src));) out.push(m[1]);
  return out;
}

function walkImports(entry) {
  const seen = new Set(), bad = [], files = [];
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    files.push(file);
    for (const spec of importsOf(file)) {
      const clean = spec.replace(/^node:/, "");
      if (builtinModules.includes(clean)) continue;
      if (spec.startsWith(".") && spec.endsWith(".mjs")) { stack.push(resolve(dirname(file), spec)); continue; }
      bad.push(`${file.slice(ROOT.length + 1)} → ${spec}`);
    }
  }
  return { bad, files };
}

console.log("\n[protocoltest] the simulation, judged as a console client would judge it\n");
console.log("-- headlessness --");
{
  const { bad, files } = walkImports(ENGINE);
  check("the sim's import graph is Node builtins only", bad.length === 0,
    bad.length ? bad.join("; ") : `${files.length} file(s), ${importsOf(ENGINE).join(", ") || "nothing"}`);
}

// The engine is loaded ONLY now, with the trap armed.
const { getEngine, HIT_ZONES, EMOTES, WARRIOR_STATS, SWING_PHASES } = await import("../src/game/engine.mjs");
const engine = getEngine();
check("engine.mjs imports with every browser global rigged to throw", true,
  "window/document/navigator/self/location/HTMLElement/rAF");

// ============================================================
// 3. THE DOCUMENT — parsed, and held to
// ============================================================
const docText = readFileSync(DOC, "utf8");
const block = /```protocol\n([\s\S]*?)```/.exec(docText);
const docC2S = new Set(), docS2C = new Set(), docLive = new Set();
if (block) {
  for (const line of block[1].split("\n")) {
    const p = line.trim().split(/\s+/);
    if (p[0] === "C2S") docC2S.add(p[1]);
    else if (p[0] === "S2C") { docS2C.add(p[1]); if (p[2] === "live") docLive.add(p[1]); }
  }
}
console.log("\n-- the document is machine-checkable --");
check("docs/WIRE-PROTOCOL.md carries a ```protocol block", !!block,
  block ? `${docC2S.size} client→server, ${docS2C.size} server→client, ${docLive.size} exercised here` : "missing");

{
  // Both directions against the router itself.
  const src = readFileSync(ENGINE, "utf8");
  const from = src.indexOf("function routeMessage");
  const to = src.indexOf("function withRoom");
  const router = src.slice(from, to);
  const routed = new Set([...router.matchAll(/case "([a-z_]+)":/g)].map((m) => m[1]));
  const missingFromDoc = [...routed].filter((t) => !docC2S.has(t));
  const missingFromCode = [...docC2S].filter((t) => !routed.has(t));
  check("every message the router accepts is documented", missingFromDoc.length === 0, missingFromDoc.join(", "));
  check("every documented client message exists in the router", missingFromCode.length === 0, missingFromCode.join(", "));
}

// ============================================================
// 4. A SESSION — the only thing a client ever is
// ============================================================
/**
 * Everything a client can possibly know: the frames the server sent it. No
 * assertion below reads a room object or a player object out of the engine —
 * a console client will not have one.
 */
function open(label) {
  const c = { label, frames: [], byType: new Map(), snapshot: null, order: [] };
  c.sid = engine.connect((str) => {
    c.frames.push(str);
    const m = JSON.parse(str);
    c.order.push(m.type);
    if (!c.byType.has(m.type)) c.byType.set(m.type, []);
    c.byType.get(m.type).push(m.data);
    if (m.data && m.data.players) c.snapshot = m.data;
  });
  c.send = (type, data) => engine.message(c.sid, { type, data: data || {} });
  c.got = (t) => c.byType.get(t) || [];
  c.last = (t) => { const a = c.got(t); return a[a.length - 1]; };
  c.bytes = (t) => c.frames.filter((f) => f.startsWith(`{"type":"${t}"`)).map((f) => Buffer.byteLength(f));
  return c;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const NEUTRAL = {
  moveX: 0, moveZ: 0, rotationY: 0, sprint: false, attack: false, heavyAttack: false,
  block: false, dodge: false, crouch: false, ability: false, shove: false, attackDir: "right",
};

// The 48 fields serializeRoom publishes for a human warrior. Held exactly, in
// both directions: a leak of server scratch fails here, and so does a field
// quietly removed from under a client. See WIRE-PROTOCOL.md §9.5 — this is a
// denylist upstream, so this assertion is the only thing standing under it.
const PUBLISHED = [
  "id", "name", "warriorClass", "team", "ready", "appearance",
  "position", "rotation", "velocity",
  "health", "maxHealth", "stamina", "maxStamina",
  "state", "attackDir", "blockDir", "attackTimer", "blockTimer", "dodgeTimer", "staggerTimer",
  "attackPhase", "attackPhaseT", "swingT", "swingDuration", "swingHeavy", "hitstop", "shoveTimer",
  "emote", "abilityCooldown", "abilityActive", "abilityTimer",
  "kills", "deaths", "damage", "score", "lastHitBy", "comboCount", "comboTimer",
  "invincible", "invincibleTimer", "deadAt",
  "burning", "burnTimer", "burnInside",
  "deathZone", "deathDir", "deathHeavy", "deathCause",
];
const PRIVATE = ["moveVel", "impulse", "latestInput", "inputAt", "lastHitAt", "aiSkill",
  "nextThink", "nextAttackAt", "strafePhase", "blockUntil", "isBlocking", "yaw", "baseName",
  "aimYaw", "pendingSwing", "shovePending", "shoveCooldown", "emoteUntil"];

// ============================================================
// SCENARIO A — a whole match, two humans, best of one
// ============================================================
async function scenarioMatch() {
  const host = open("host"), guest = open("guest");

  host.send("ping");
  host.send("join", { code: "NOSUCH99", name: "Ghost" });
  host.send("create", { name: "Alfa", mode: "blood_moot", bestOf: 1 });
  await until(() => host.last("join"), 2000, "join reply");
  const room = host.last("join");
  const aid = room.playerId;

  host.send("start");                       // alone in a shared room: refused
  host.send("select_class", { warriorClass: "runekeeper" });
  await sleep(60);

  guest.send("join", { code: room.code, name: "Bravo" });
  await until(() => guest.last("join"), 2000, "guest join");
  const bid = guest.last("join").playerId;
  await until(() => host.got("player_joined").length, 1000, "player_joined");

  host.send("ready");
  guest.send("ready");
  await until(() => host.got("lobby_update").length >= 3, 1500, "lobby_update");

  host.send("start");
  await until(() => host.got("countdown").length >= 1, 1500, "countdown");
  await until(() => host.snapshot && host.snapshot.state === "fighting", 6000, "the bell");

  // The kill, without needing two hands on two keyboards: Alfa sprints into the
  // bonfire at the origin and cooks. Bravo never sends an input and never moves,
  // so the round ends with exactly one man standing.
  const drive = setInterval(() => {
    const p = host.snapshot && host.snapshot.players[aid];
    if (!p || p.state === "dead") return;
    const r = Math.hypot(p.position.x, p.position.z) || 1;
    host.send("input", { ...NEUTRAL, moveX: -p.position.x / r, moveZ: -p.position.z / r,
      rotationY: Math.atan2(-p.position.x, -p.position.z), sprint: true });
  }, 50);
  // ...and one garbage packet in the middle of it. Nothing a client sends may
  // put a NaN in a position, because a NaN in a position is permanent.
  setTimeout(() => host.send("input", { ...NEUTRAL, moveX: "north", moveZ: NaN, rotationY: undefined }), 400);

  await until(() => host.got("kill").length, 12000, "a death");
  clearInterval(drive);
  await until(() => host.got("match_end").length, 4000, "match_end");
  await sleep(400);   // let any stray frame arrive and be caught

  console.log("\n-- handshake and lobby --");
  check("ping is answered with pong", host.got("pong").length === 1);
  check("join to an unknown room is refused with a message",
    host.got("error").some((e) => typeof e.message === "string" && /not found/i.test(e.message)));
  check("the server never sets `error.code`", host.got("error").every((e) => e.code === undefined),
    "the browser's `code:\"lost\"` is fabricated by transport.ts");
  check("starting alone in a shared room is refused",
    host.got("error").some((e) => /friend|ADD AI/i.test(e.message || "")));
  check("the join reply carries playerId, the room and the whole stat sheet",
    typeof aid === "string" && typeof room.code === "string" && room.state === "lobby" &&
    room.hostId === aid && !!room.warriorStats &&
    Object.keys(room.warriorStats).length === Object.keys(WARRIOR_STATS).length);
  check("a native client need not ship the balance sheet",
    room.warriorStats.runekeeper.maxHealth === WARRIOR_STATS.runekeeper.maxHealth &&
    typeof room.warriorStats.berserker.attackSpeed === "number",
    "WARRIOR_STATS rides the join message");
  check("select_class in the lobby sets the class and its health",
    host.snapshot.players[aid].warriorClass === "runekeeper" &&
    host.snapshot.players[aid].maxHealth === WARRIOR_STATS.runekeeper.maxHealth);
  check("a second client gets its own join, the first gets player_joined",
    typeof bid === "string" && bid !== aid &&
    host.got("player_joined")[0].playerId === bid && host.got("player_joined")[0].name === "Bravo");
  check("the joiner does not hear about itself", guest.got("player_joined").length === 0);
  check("ready is broadcast to the room",
    guest.got("lobby_update").some((d) => d.players[aid] && d.players[aid].ready === true));

  console.log("\n-- the snapshot --");
  const snaps = [...host.got("game_state"), ...host.got("lobby_update"), ...host.got("round_end")];
  const humans = snaps.flatMap((d) => Object.values(d.players)).filter((p) => !p.id.startsWith("bot_"));
  check("no server scratch field ever reaches a client",
    humans.every((p) => PRIVATE.every((f) => !(f in p))),
    `${PRIVATE.length} denied fields checked over ${humans.length} player records`);
  const keysOk = humans.every((p) => {
    const k = Object.keys(p).sort();
    return k.length === PUBLISHED.length && k.every((n, i) => n === [...PUBLISHED].sort()[i]);
  });
  check("the published player is exactly the 48 documented fields", keysOk,
    keysOk ? "" : `saw ${JSON.stringify(Object.keys(humans[0]).filter((k) => !PUBLISHED.includes(k)))}`);
  check("every frame is JSON with `type` as its first key",
    host.frames.every((f) => f.startsWith('{"type":"')),
    "src/db/matchLedger.ts:151 depends on this to pay players");
  check("garbage input cannot put a NaN in a body",
    snaps.every((d) => Object.values(d.players).every((p) =>
      Number.isFinite(p.position.x) && Number.isFinite(p.position.z) &&
      Number.isFinite(p.rotation) && Number.isFinite(p.velocity.x))));
  const timers = host.got("game_state").map((d) => d.matchTimer);
  check("matchTimer is the one clock on the wire and never goes back",
    timers.every((t, i) => i === 0 || t >= timers[i - 1]) && timers[timers.length - 1] > 1,
    `${timers[timers.length - 1].toFixed(2)}s of simulation`);

  console.log("\n-- the sequence a match actually is --");
  const cds = host.got("countdown");
  check("the first countdown is a whole snapshot, the rest are not",
    !!cds[0].players && cds.slice(1).every((d) => Object.keys(d).length === 1 && "countdown" in d),
    "WIRE-PROTOCOL §9.3 — two payloads under one type");
  check("the countdown counts down", cds.map((d) => d.countdown).join(",") === "3,2,1");
  const bell = host.got("game_state")[0];
  check("the bell is a game_state, and the grace is armed on it",
    bell.state === "fighting" && Object.values(bell.players).every((p) => p.invincible === true && p.invincibleTimer > 0),
    "grace.mjs: armed on the frame the fight starts, not at startRound");
  const gsPerSec = host.got("game_state").length / (timers[timers.length - 1] || 1);
  check("snapshots arrive at the tick rate", gsPerSec > 17 && gsPerSec < 23, `${gsPerSec.toFixed(1)} Hz`);

  const kill = host.got("kill")[0];
  check("a fire death is nobody's kill, and says so plainly",
    kill.cause === "fire" && kill.killerId === "" && kill.killerName === "The Fire" &&
    kill.hitZone === null && kill.direction === null && kill.heavy === false &&
    kill.victimId === aid);
  const re = host.last("round_end");
  check("round_end is a whole snapshot spread with the round's result",
    !!re.players && re.index === 1 && re.winnerId === bid && re.winnerTeam === null &&
    re.draw === false && re.matchOver === true && re.state === "finished");
  check("round_end and match_end arrive in that order, once each",
    host.got("round_end").length === 1 && host.got("match_end").length === 1 &&
    host.order.indexOf("round_end") < host.order.indexOf("match_end"));
  // Exactly one, and it is a real wart: gameTick tests the room state before its
  // substeps and broadcasts after them, so the wake that ends the match still
  // emits a snapshot. WIRE-PROTOCOL §9.10.
  const tail = host.order.slice(host.order.indexOf("match_end") + 1);
  check("exactly one trailing game_state follows match_end, and it says `finished`",
    tail.filter((t) => t === "game_state").length === 1 &&
    host.snapshot.state === "finished",
    "WIRE-PROTOCOL §9.10 — a client must not tear its room down on match_end");

  const me = host.last("match_end");
  const mine = me.results.find((r) => r.id === aid);
  const theirs = me.results.find((r) => r.id === bid);
  check("match_end names the winner by kind, not by guesswork",
    me.winnerKind === "player" && me.winnerId === bid && me.winnerTeam === null &&
    me.bestOf === 1 && me.roundsPlayed === 1 && me.roundScoreBy === "player");
  check("every fighter gets a result row with a payout",
    me.results.length === 2 && [mine, theirs].every((r) =>
      typeof r.name === "string" && Number.isInteger(r.kills) && Number.isInteger(r.deaths) &&
      Number.isInteger(r.xpEarned) && Number.isInteger(r.goldEarned) && typeof r.isWinner === "boolean"));
  check("the payout is the engine's own arithmetic, not the client's",
    theirs.isWinner === true && mine.isWinner === false &&
    theirs.xpEarned === Math.floor(50 + theirs.kills * 30 + theirs.damage * 0.5 + 100) &&
    theirs.goldEarned === Math.floor(10 + theirs.kills * 15 + 50) &&
    mine.goldEarned === Math.floor(10 + mine.kills * 15),
    `winner ${theirs.goldEarned}g / ${theirs.xpEarned}xp, loser ${mine.goldEarned}g / ${mine.xpEarned}xp`);
  check("a man who died still gets a row", mine.deaths === 1);

  const b = host.bytes("game_state");
  return { host, guest, bytes2p: median(b) };
}

// ============================================================
// SCENARIO B — eight men in the ring: every combat message, and the wire's cost
// ============================================================
async function scenarioMelee() {
  const c = open("solo");
  c.send("solo", { name: "Alfa", difficulty: "jarl", botCount: 7, warriorClass: "runekeeper" });
  await until(() => c.snapshot, 2000, "solo join");
  c.send("emote", { emote: "taunt" });
  c.send("emote", { emote: "raise" });      // inside the 2.5 s throttle: dropped
  c.send("emote", { emote: "shrug" });      // not an emote: dropped
  await until(() => c.snapshot.state === "fighting", 6000, "the bell");
  // Stand still and be killed. Standing still is an input, not an absence of one.
  c.send("input", { ...NEUTRAL });
  await until(() => c.got("hit").length > 12 && c.got("kill").length > 0, 20000, "a melee");
  const me = Object.keys(c.snapshot.players).find((k) => !k.startsWith("bot_"));

  console.log("\n-- combat, in eight-man traffic --");
  check("a solo room is sealed to humans and full of bots",
    c.snapshot.maxPlayers === 1 && c.snapshot.botCount === 7 &&
    Object.keys(c.snapshot.players).length === 8);
  check("bots are named by their id, and a client may rely on it",
    Object.keys(c.snapshot.players).filter((k) => k.startsWith("bot_")).length === 7 &&
    Object.values(c.snapshot.players).every((p) => (p.id.startsWith("bot_")) === (p.bot === true)));
  const hits = c.got("hit");
  check("every hit names an attacker, a target, a number and a freeze",
    hits.every((h) => typeof h.attackerId === "string" && typeof h.targetId === "string" &&
      Number.isFinite(h.damage) && Number.isFinite(h.hitstop)),
    `${hits.length} blows, kinds: ${[...new Set(hits.map((h) => h.type))].join("/")}`);
  check("a blow that wounds carries where it landed; a parry or a shove does not",
    hits.every((h) => ["light", "heavy", "blocked", "blocked_heavy"].includes(h.type)
      ? (Number.isFinite(h.health) && HIT_ZONES.includes(h.hitZone) && typeof h.direction === "string")
      : (h.damage === 0 && h.hitZone === undefined)),
    "WIRE-PROTOCOL §3 — six kinds under one type");
  check("the hit zone is always one the client can draw",
    hits.every((h) => h.hitZone === undefined || HIT_ZONES.includes(h.hitZone)));
  const blow = c.got("kill").find((k) => k.cause === "blow");
  check("a killing blow says which limb and which stroke took him",
    !!blow && HIT_ZONES.includes(blow.hitZone) && typeof blow.direction === "string" &&
    typeof blow.heavy === "boolean" && blow.killerId.startsWith("bot_"));
  check("the corpse carries its own death on every later snapshot",
    c.got("game_state").some((d) => d.players[me] && d.players[me].state === "dead" &&
      d.players[me].deathCause === "blow" && HIT_ZONES.includes(d.players[me].deathZone)),
    "a spectator arriving late rebuilds the same body");
  check("the kill feed is on the snapshot and is capped at ten",
    c.got("game_state").every((d) => Array.isArray(d.killFeed) && d.killFeed.length <= 10));
  const ab = c.got("ability_used");
  check("an ability is announced with its name and its class",
    ab.length > 0 && ab.every((a) => typeof a.playerId === "string" &&
      typeof a.ability === "string" && !!WARRIOR_STATS[a.warriorClass]),
    ab.length ? `${ab.length}, e.g. ${ab[0].ability}` : "none seen");
  const em = c.got("emote");
  check("an emote is relayed to its own sender, validated and throttled",
    em.length === 1 && em[0].playerId === me && EMOTES.includes(em[0].emote) && em[0].emote === "taunt",
    "second press inside 2.5 s dropped; unknown id dropped; both silently");
  check("the swing phases on the wire are the ones the sim resolves on",
    c.got("game_state").some((d) => Object.values(d.players).some((p) =>
      p.attackPhase === "windup" && p.swingT >= 0 && p.swingT < SWING_PHASES.windup &&
      p.swingDuration > 0)),
    `windup ${SWING_PHASES.windup} / contact ${SWING_PHASES.contact} / recovery ${SWING_PHASES.recovery}`);

  return { bytes8p: median(c.bytes("game_state")) };
}

// ============================================================
const [a, m] = await Promise.all([scenarioMatch(), scenarioMelee()]);

console.log("\n-- the sim never reached for the browser --");
check("no browser global was touched during a whole match", touched.length === 0,
  touched.length ? [...new Set(touched)].join(", ") : "window, document, navigator, self, location, HTMLElement, rAF");

console.log("\n-- the document held --");
{
  const seen = new Set([...a.host.byType.keys(), ...a.guest.byType.keys()]);
  // Scenario B's types too — it is the only place hit/kill-by-blow/ability live.
  for (const t of ["hit", "kill", "ability_used", "emote"]) seen.add(t);
  const undocumented = [...seen].filter((t) => !docS2C.has(t));
  const unseen = [...docLive].filter((t) => !seen.has(t));
  check("the engine emitted nothing the document does not list", undocumented.length === 0, undocumented.join(", "));
  check("every message the document calls `live` was actually seen", unseen.length === 0, unseen.join(", "));
}

console.log("\n-- what this protocol costs, per client, at 20 Hz --");
note(`2 players: ${a.bytes2p} B/snapshot = ${(a.bytes2p * 20 / 1024).toFixed(1)} KiB/s = ${(a.bytes2p * 20 * 8 / 1e6).toFixed(2)} Mbit/s`);
note(`8 players: ${m.bytes8p} B/snapshot = ${(m.bytes8p * 20 / 1024).toFixed(1)} KiB/s = ${(m.bytes8p * 20 * 8 / 1e6).toFixed(2)} Mbit/s`);
note(`a listen server would upload ${(m.bytes8p * 20 * 8 * 8 / 1e6).toFixed(1)} Mbit/s to hold eight men — WIRE-PROTOCOL §8`);
check("one snapshot exceeds the deprecated Steam P2P packet limit", a.bytes2p > 1200,
  `${a.bytes2p} B against ISteamNetworking's 1200 — needs ISteamNetworkingSockets, i.e. steamworks-rs, i.e. Tauri`);
check("the snapshot has not silently grown", m.bytes8p < 20000, `${m.bytes8p} B at eight men`);

console.log(`\n[protocoltest] ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
