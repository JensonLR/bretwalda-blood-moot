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
const { getEngine, makeEngine, decideMatch, HIT_ZONES, EMOTES, WARRIOR_STATS, SWING_PHASES } = await import("../src/game/engine.mjs");
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
function open(label, eng = engine) {
  const c = { label, frames: [], byType: new Map(), snapshot: null, order: [] };
  c.sid = eng.connect((str) => {
    c.frames.push(str);
    const m = JSON.parse(str);
    c.order.push(m.type);
    if (!c.byType.has(m.type)) c.byType.set(m.type, []);
    c.byType.get(m.type).push(m.data);
    if (m.data && m.data.players) c.snapshot = m.data;
  });
  c.send = (type, data) => eng.message(c.sid, { type, data: data || {} });
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
  // CHANGED, AND SAID OUT LOUD, because a harness quietly edited to fit a new
  // build is how a defect gets certified. The bonus a man is paid used to be
  // `isWinner ? 50 : 0`; it is now the purse for the PLACE he finished in
  // (`PLACE_GOLD` / `PLACE_XP` in engine.mjs), because the owner asked for
  // rounds won to count toward the payout and a place is what rounds buy. So
  // the loser's arithmetic follows the PLACE he finished in and not his crown.
  //
  // SECOND PLACE IS BACK TO ZERO. The first cut of that change also gave second
  // and third 20 g / 40 xp, which is a new payout tier riding on a bug fix and
  // has no authority in `docs/MONETISATION.md` — see the argument written out
  // beside PLACE_GOLD. So the winner's line is exactly the 50 / 100 it has
  // always been and the loser's is exactly the nothing it has always been, and
  // what actually changed is only WHICH man each is handed to.
  //
  // NOT relaxed: the numbers are still written out here by hand rather than
  // imported, or the check would agree with the engine by construction and
  // measure nothing. And it is STRICTER than it was — it now also pins `place`
  // and `roundsWon` on a real match driven through the whole wire, which the
  // fixtures in `tiebreak.mjs` cannot do because they never reach `endMatch`.
  check("the payout is the engine's own arithmetic, not the client's",
    theirs.isWinner === true && mine.isWinner === false &&
    theirs.xpEarned === Math.floor(50 + theirs.kills * 30 + theirs.damage * 0.5 + 100) &&
    theirs.goldEarned === Math.floor(10 + theirs.kills * 15 + 50) &&
    mine.xpEarned === Math.floor(50 + mine.kills * 30 + mine.damage * 0.5 + 0) &&
    mine.goldEarned === Math.floor(10 + mine.kills * 15 + 0) &&
    theirs.place === 1 && mine.place === 2 &&
    theirs.roundsWon === 1 && mine.roundsWon === 0,
    `winner ${theirs.goldEarned}g / ${theirs.xpEarned}xp / #${theirs.place} / ${theirs.roundsWon} rnd,`
    + ` loser ${mine.goldEarned}g / ${mine.xpEarned}xp / #${mine.place} / ${mine.roundsWon} rnd`);
  check("the results leave the server already in placement order",
    me.results[0]?.id === bid && me.results[0]?.place === 1,
    `order=${me.results.map((r) => `${r.name}#${r.place}`).join(" > ")} — the row order is the`
    + ` server's answer now, not three screens each sorting their own copy`);
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
// SCENARIO C — THE CLOCK, TAKEN OFF THE ENGINE
//
// The two scenarios above are what a BROWSER client is: they hand the engine a
// socket and then wait, on the wall clock, for the engine's own 20 Hz timer to
// produce a match. That is the thing docs/PLATFORM-PATH.md §2 says a console
// client cannot do. A native host runs the simulation inside its own frame
// loop; it cannot hand its clock to a `setInterval` it does not own, and it
// cannot wait eighteen real seconds to find out whether a round transition
// works.
//
// So this scenario plays a WHOLE match — lobby, countdown, fighting, the round
// break, a second round, the summary, and the room becoming a lobby again — and
// it contains no timer, no `sleep`, no `await` and no reading of a wall clock.
// Every millisecond of the match is one this function handed the engine.
//
// It is also, deliberately, where the wall clock is CAUGHT. Under the old
// arrangement a `Date.now()` inside the sim was invisible: the timer advanced
// the sim at roughly the rate the wall advanced, so the two agreed and nothing
// could tell them apart. Drive the sim faster than real time and they part
// company immediately — an intent whose lapse is measured on the wall never
// lapses, a round break measured on the wall never ends, a `nextRoundAt`
// stamped off the wall lands billions of milliseconds away from the epoch this
// engine was built with. Each of those is one of the checks below.
//
// EPOCH is pinned to a date long past so that a leaked `Date.now()` is not
// merely wrong, it is twenty-four years wrong, and the range check says so.
const EPOCH = 1_000_000_000_000;

function scenarioHeadless() {
  const wallStart = Date.now();
  console.log("\n-- the sim can be driven by a host that owns the clock --");

  // How many fixed steps a second of sim time buys, asked of the engine rather
  // than assumed — and the first claim, which everything else rests on:
  // `step(dt)` spends a duration on WHOLE fixed steps and CARRIES the
  // remainder. A frame loop hands the sim ragged 16 ms and 33 ms frames; if any
  // of that were spent on a variable-length step then every speed, cooldown and
  // timer in the arena would become a measurement of the host's frame rate,
  // which is the exact bug the clock comment in engine.mjs is about.
  const probe = makeEngine({ autoTick: false });
  const HZ = probe.step(1);
  const short = probe.step(0.03);     // 30 ms: not yet a step, and not thrown away
  const carried = probe.step(0.03);   // 60 ms owed: one step, 10 ms still owed
  check("step(dt) spends a duration on whole fixed steps and carries the remainder",
    HZ === 20 && short === 0 && carried === 1 && probe.simTime() === 1050,
    `step(1) = ${HZ} steps; two 30 ms frames ran ${short} then ${carried}; sim clock ${probe.simTime()} ms`);
  // Everything below counts in ticks. If the engine cannot step at all then the
  // check above has already gone red and every one below is going red with it —
  // this fallback exists only so they REPORT that rather than dividing by zero
  // and taking the run down with a TypeError. A harness that dies is a harness
  // whose other findings are lost.
  const RATE = HZ || 20;
  {
    // The default, built only to prove it is untouched, and put straight down
    // again — a live interval holds this process open.
    const timed = makeEngine();
    check("autoTick:false owns no timer at all, and the default still owns the 20 Hz one",
      probe.autoTick === false && probe._tickInterval === null &&
      timed.autoTick === true && timed._tickInterval !== null,
      "the default is what custom-server.mjs and dev-server.mjs get, unchanged");
    timed.stop();
  }

  // ---- a whole match, on step() alone ----
  const sim = makeEngine({ autoTick: false, epoch: EPOCH });
  const host = open("clock-host", sim), guest = open("clock-guest", sim);

  // The ladder a room walks, recorded off the WIRE — the same frames a console
  // client would have and nothing else.
  const ladder = [];
  const record = () => {
    const s = host.snapshot ? host.snapshot.state : null;
    if (s && s !== ladder[ladder.length - 1]) ladder.push(s);
  };
  let totalSteps = 0;
  const tick = () => { sim.step(); totalSteps++; record(); };
  /** Step until the room leaves `state`, and say how many steps that took. */
  const stepWhile = (state, cap) => {
    let n = 0;
    while (host.snapshot.state === state && n < cap) { tick(); n++; }
    return n;
  };

  // Every message is answered synchronously, so the whole lobby is one straight
  // line with nothing to wait for.
  host.send("create", { name: "Alfa", mode: "blood_moot", bestOf: 3 });
  const joined = host.last("join");
  const aid = joined.playerId;
  host.send("select_class", { warriorClass: "runekeeper" });
  guest.send("join", { code: joined.code, name: "Bravo" });
  const bid = guest.last("join").playerId;
  host.send("ready"); guest.send("ready");
  record();
  host.send("start");
  record();
  const startedOnCountdown = host.snapshot.state === "countdown" && host.snapshot.countdown === 3;

  // THE BELL. Three seconds of countdown that used to be a `setInterval` — a
  // host driving the sim itself could reach this state and then step for the
  // rest of the afternoon without the fight ever starting.
  const bellSteps = stepWhile("countdown", 400);
  check("a countdown no timer is driving still rings the bell, on the tick sim time says",
    bellSteps === 3 * RATE && host.snapshot.state === "fighting" &&
    host.got("countdown").map((d) => d.countdown).join(",") === "3,2,1",
    `${bellSteps} steps = ${(bellSteps / RATE).toFixed(1)} s of sim, counted 3,2,1`);
  check("the grace is armed on the bell frame, under a frame loop exactly as under the timer",
    Object.values(host.snapshot.players).every((p) => p.invincible === true && p.invincibleTimer > 0),
    "grace.mjs — armed by the statement that starts the fight, not by startRound");

  // THE INPUT LAPSE, and this is the check that catches a wall clock in a rule.
  // One `input` and then nothing but steps. A standing intent lapses after
  // INPUT_LAPSE_MS (600 ms), which is 12 steps — so at 8 steps he is still
  // running and at 40 he has stopped dead. Measured on the WALL those 40 steps
  // are a millisecond or two, the intent never lapses, and the warrior runs
  // into the palisade forever.
  const alfa = () => host.snapshot.players[aid];
  const speed = (p) => Math.hypot(p.velocity.x, p.velocity.z);
  host.send("input", { ...NEUTRAL, moveX: 1, moveZ: 0, rotationY: Math.PI / 2 });
  for (let i = 0; i < 8; i++) tick();          // 400 ms of sim, inside the lapse
  const movingAt400 = speed(alfa());
  for (let i = 0; i < 32; i++) tick();         // 2.0 s of sim in all, no further input
  const movingAt2000 = speed(alfa());
  check("a standing intent lapses on SIM time, so a stepped host is not a man running forever",
    movingAt400 > 1 && movingAt2000 === 0,
    `${movingAt400.toFixed(2)} u/s at 400 ms of sim, ${movingAt2000.toFixed(2)} at 2000 ms ` +
    `— INPUT_LAPSE_MS is 600, and 2 s of sim cost ${Date.now() - wallStart} ms of wall clock`);

  // ROUND ONE. Alfa sprints into the bonfire and cooks; Bravo never sends an
  // input and never moves, so the round ends with one man standing.
  const driveIntoFire = () => {
    const p = alfa();
    if (!p || p.state === "dead") return;
    const r = Math.hypot(p.position.x, p.position.z) || 1;
    host.send("input", { ...NEUTRAL, moveX: -p.position.x / r, moveZ: -p.position.z / r,
      rotationY: Math.atan2(-p.position.x, -p.position.z), sprint: true });
  };
  let fightSteps = 0;
  while (host.snapshot.state === "fighting" && fightSteps < 600) { driveIntoFire(); tick(); fightSteps++; }
  const roundEndAt = sim.simTime();
  // `|| {}` for the same reason RATE has a fallback: if the round never ends,
  // the check below says so and the ones after it still get to run.
  const re1 = host.got("round_end")[0] || {};
  check("a round is fought and decided with no clock but the one the caller supplies",
    re1.index === 1 && re1.winnerId === bid && re1.matchOver === false &&
    host.snapshot.state === "intermission",
    `${fightSteps} steps = ${(fightSteps / RATE).toFixed(1)} s of fight; ${host.got("kill").length} death(s)`);

  // THE ROUND BREAK — a `setTimeout` until now, and therefore unreachable from
  // a stepped host: the match simply stopped at round one, forever.
  const breakSteps = stepWhile("intermission", 600);
  check("the round break is five seconds of SIM time, and the next round is dealt on the tick that owes it",
    breakSteps === 5 * RATE && host.snapshot.state === "countdown" && host.snapshot.roundIndex === 2,
    `${breakSteps} steps = ${(breakSteps / RATE).toFixed(1)} s, then round ${host.snapshot.roundIndex}`);
  check("nextRoundAt names the tick the sim will ACTUALLY deal the round, not an instant off the wall",
    re1.nextRoundAt === EPOCH + roundEndAt + breakSteps * (1000 / RATE),
    `epoch+${roundEndAt} ms + ${(breakSteps / RATE).toFixed(1)} s = ${re1.nextRoundAt}, ` +
    `and the wall clock is ${Date.now()} — a leaked Date.now() misses by ${((Date.now() - re1.nextRoundAt) / 31557600000).toFixed(0)} years`);

  // ROUND TWO, and the match falls out of it: two round wins take a best of three.
  const bell2 = stepWhile("countdown", 400);
  let fight2 = 0;
  while (host.snapshot.state === "fighting" && fight2 < 600) { driveIntoFire(); tick(); fight2++; }
  const me = host.last("match_end");
  check("the second round runs, and the match ends out of it, on step() alone",
    bell2 === 3 * RATE && !!me && me.winnerKind === "player" && me.winnerId === bid &&
    me.roundsPlayed === 2 && me.bestOf === 3 && me.roundWins[bid] === 2 &&
    host.snapshot.state === "finished",
    `round 2: ${bell2} countdown steps, ${fight2} fight steps; ${me ? me.results.length : 0} result rows paid`);

  // THE SUMMARY, held for ten seconds and then rolled back to a lobby — the
  // last of the four `setTimeout`s, and the one `render/summary.ts` stages the
  // victor over a corpse for.
  const summarySteps = stepWhile("finished", 600);
  check("the summary is held for ten seconds of sim time and then the room is a lobby again",
    summarySteps === 10 * RATE && host.snapshot.state === "lobby" &&
    host.snapshot.roundIndex === 0 && host.snapshot.players[aid].health > 0,
    `${summarySteps} steps = ${(summarySteps / RATE).toFixed(1)} s`);

  check("the room walked the whole ladder without a timer anywhere in the process",
    startedOnCountdown &&
    ladder.join(" -> ") === "lobby -> countdown -> fighting -> intermission -> countdown -> fighting -> finished -> lobby",
    ladder.join(" -> "));

  // Every wire timestamp has to be a function of sim time. Pinned epoch, so the
  // whole match's stamps live inside one known window; a `Date.now()` anywhere
  // in that path lands a quarter of a century outside it.
  const stamps = host.got("game_state").flatMap((d) => d.killFeed.map((k) => k.timestamp));
  check("every timestamp on the wire is sim time on a fixed epoch, not the box's clock",
    stamps.length > 0 && stamps.every((t) => t >= EPOCH && t <= EPOCH + sim.simTime()),
    `${stamps.length} kill-feed stamps, all within [epoch, epoch+${sim.simTime()} ms]`);

  const wallMs = Date.now() - wallStart;
  check("a whole match ran faster than real time, which no timer-driven engine can do",
    sim.simTime() > 25000 && wallMs < sim.simTime() / 4,
    `${(sim.simTime() / 1000).toFixed(2)} s of match in ${wallMs} ms of wall clock over ${totalSteps} step() calls ` +
    `— ${(sim.simTime() / Math.max(1, wallMs)).toFixed(0)}x real time, no timer and no await`);

  // ---- two engines in one process ----
  // Nothing in engine.mjs keeps mutable state outside `makeEngine`'s closure,
  // so two simulations cannot reach each other. Proved the only way that means
  // anything: step ONE of them and check the other did not move.
  const alpha = makeEngine({ autoTick: false }), beta = makeEngine({ autoTick: false });
  const ca = open("engine-alpha", alpha), cb = open("engine-beta", beta);
  ca.send("solo", { name: "Alpha", difficulty: "recruit", botCount: 1 });
  cb.send("solo", { name: "Beta", difficulty: "recruit", botCount: 1 });
  for (let i = 0; i < 200; i++) alpha.step();
  check("two engines in one process share no clock, no rooms and no sessions",
    alpha.simTime() === 10000 && beta.simTime() === 0 &&
    ca.snapshot.state === "fighting" && cb.snapshot.state === "lobby" &&
    cb.snapshot.matchTimer === 0 &&
    alpha.has(ca.sid) && !alpha.has(cb.sid) && beta.has(cb.sid) && !beta.has(ca.sid),
    `alpha ran ${alpha.simTime()} ms and is ${ca.snapshot.state}; beta ran ${beta.simTime()} ms and is still ${cb.snapshot.state}`);
  check("the process-wide singleton is one engine among many, not the only one there can be",
    getEngine() === getEngine() && getEngine() !== alpha && getEngine() !== sim,
    "getEngine() still caches on globalThis for the two servers; makeEngine() is independent of it");

  return { simMs: sim.simTime(), steps: totalSteps, wallMs };
}

// ============================================================
// The same scripted match, twice, on two engines built with the same epoch.
// Determinism is the other half of what taking the clock off the engine buys —
// and it is the check that would catch a wall clock ANYWHERE on the wire, not
// only in the places named above, because a wall clock is the one thing that
// cannot be the same in two runs a few milliseconds apart.
//
// Ids are masked and nothing else is: `randomUUID` is deliberately not seeded
// (see the note on getEngine) and room codes come off the process-wide
// `Math.random`, which two engines share. Everything else — every position,
// every timer, every timestamp — has to match to the byte.
function replayOnce() {
  const sim = makeEngine({ autoTick: false, epoch: EPOCH });
  const host = open("replay", sim), guest = open("replay-guest", sim);
  host.send("create", { name: "Alfa", mode: "blood_moot", bestOf: 3 });
  const joined = host.last("join");
  host.send("select_class", { warriorClass: "runekeeper" });
  guest.send("join", { code: joined.code, name: "Bravo" });
  host.send("ready"); guest.send("ready");
  host.send("start");
  // A fixed budget, not a condition: 20 s of sim carries the bell, a fire
  // death, the five-second break and the second round's countdown.
  for (let i = 0; i < 400; i++) {
    const p = host.snapshot.players[joined.playerId];
    if (p && p.state !== "dead" && host.snapshot.state === "fighting") {
      const r = Math.hypot(p.position.x, p.position.z) || 1;
      host.send("input", { ...NEUTRAL, moveX: -p.position.x / r, moveZ: -p.position.z / r,
        rotationY: Math.atan2(-p.position.x, -p.position.z), sprint: true });
    }
    sim.step();
  }
  // The engine's OWN sim time comes back with the frames. Not tidiness — see
  // the check below, which had nothing to prove the match ever ran.
  return {
    text: host.frames.join("\n")
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>")
      .split(joined.code).join("<code>"),
    simMs: sim.simTime(),
  };
}

/** 400 steps of TICK_MS with a tick of slack. A run shorter than this did not happen. */
const REPLAY_MIN_MS = 19_000;
/**
 * A live run emits 432 kB of frames. A DEAD one — `step()` sabotaged to a no-op
 * — still emits 11.5 kB, because the lobby handshake happens before any time
 * passes at all. So the floor has to sit above the dead figure and not merely
 * above zero: 4 kB was the first number here and it would have passed the very
 * sabotage this tooth exists to catch.
 */
const REPLAY_MIN_BYTES = 100_000;

// ============================================================
// ---- the wire's two epoch-ms fields still track the browser's clock ----
//
// THE REGRESSION THIS CATCHES, which shipped and which nothing could see.
// `nextRoundAt` and the kill feed's `timestamp` are stamped from `wallNow()`
// = `epoch + simMs`, and `simMs` is what the sim RAN, not what the wall did:
// `advance` clamps arrears at MAX_CATCHUP_MS, so every event-loop stall past
// 400 ms threw `stall - 400` ms away permanently. Ten 600 ms stalls cost
// 2252 ms; four 1500 ms stalls cost 4655 ms. Cumulative and unbounded.
//
// What breaks is the round break. `page.tsx` counts down `nextRoundAt -
// Date.now()` against the BROWSER's clock, so the counter ran early by the
// accumulated lag and, once the lag passed the five-second break, opened at
// zero and sat there looking hung — the opposite of the promise that
// component exists to make.
//
// It has to be tested through the real timer. `step(dt)` passes no cap, so an
// `autoTick: false` engine never reaches the clamp — which is exactly why
// every determinism check in this file ran green while this was broken.
{
  const drift = makeEngine();
  const before = drift.wallTime() - Date.now();
  // Three stalls the cap will bite on, blocking the loop the way a real one
  // does. Busy-waiting is the point: `await` would yield and the timer would
  // keep up, which is the case that never had a bug.
  for (let i = 0; i < 3; i++) {
    const until = Date.now() + 1200;
    while (Date.now() < until) { /* hold the event loop, as a GC pause would */ }
    await new Promise((r) => setTimeout(r, 60));
  }
  const after = drift.wallTime() - Date.now();
  drift.stop();
  // One cap's worth of slack, and no more. Before the fix this ran to
  // seconds and grew with every stall.
  const slipped = Math.abs(after - before);
  check("the wire's epoch-ms clock keeps up with the wall across stalls",
    slipped < 500,
    `${slipped} ms of slip across 3 x 1200 ms stalls (cap is 400 ms) — nextRoundAt is compared ` +
    `against the browser's own Date.now(), so slip here is the round-break counter running early`);
}

const h = scenarioHeadless();
{
  const a = replayOnce(), b = replayOnce();
  const first = a.text, second = b.text;
  let where = -1;
  for (let i = 0; i < Math.max(first.length, second.length); i++) if (first[i] !== second[i]) { where = i; break; }
  // THREE TEETH, AND THE FIRST TWO ARE WHY THIS CHECK IS WORTH ANYTHING.
  //
  // It used to assert `first === second` and nothing else. Two empty strings
  // are identical, so a dead engine passed it: under a `step()` sabotaged to a
  // no-op it reported `PASS ... 11506 B of frames, twice, 0 s of sim apiece`
  // and stayed green. That is this repository's signature failure — a test
  // measuring the wrong quantity — and it is the sixth instance.
  //
  // Worse, the number it printed was a lie by construction: `h.simMs` belongs
  // to `scenarioHeadless()`, a DIFFERENT scenario, so the sim time in the
  // detail line was never the sim time of the thing under test. Each run now
  // reports its own.
  const ran = a.simMs >= REPLAY_MIN_MS && b.simMs >= REPLAY_MIN_MS;
  const spoke = first.length >= REPLAY_MIN_BYTES;
  check("two runs of one scripted match are identical to the byte",
    first === second && ran && spoke,
    where >= 0
      ? `diverged at byte ${where}: ${JSON.stringify(first.slice(where - 60, where + 60))} vs ${JSON.stringify(second.slice(where - 60, where + 60))}`
      : !ran
        ? `the match did not run: ${(a.simMs / 1000).toFixed(1)} s and ${(b.simMs / 1000).toFixed(1)} s of sim against a floor of ${REPLAY_MIN_MS / 1000} s — two identical nothings are still identical`
        : !spoke
          ? `only ${first.length} B of frames against a floor of ${REPLAY_MIN_BYTES} B — the engine ran but said almost nothing`
          : `${first.length} B of frames, twice, ${(a.simMs / 1000).toFixed(0)} s of sim apiece`);
}

const [a, m] = await Promise.all([scenarioMatch(), scenarioMelee()]);

console.log("\n-- who takes the match --");
{
  // The owner's case, verbatim: eight men, five rounds, two men on two apiece
  // and a third on one. Before the tiebreak existed this returned null and the
  // match those rounds produced ended "none".
  const eight = (kills) => Object.entries(kills).map(([key, k]) => ({ key, kills: k }));
  const ffa = { a: 2, b: 2, c: 1 };

  check("rounds still decide it outright when somebody is ahead",
    decideMatch({ roundWins: { a: 3, b: 1, c: 1 }, entrants: eight({ a: 0, b: 40, c: 9 }) }).key === "a",
    "a took three rounds with zero kills against b's forty — kills never overturn rounds");

  check("level on rounds, the most kills takes it",
    decideMatch({ roundWins: ffa, entrants: eight({ a: 4, b: 7, c: 30 }) }).key === "b",
    "a and b tie on two rounds each, c has one round and thirty kills — b wins on 7 kills to a's 4, "
    + "and c's thirty do not promote him past men who won more rounds");

  check("level on rounds AND on kills is a draw",
    decideMatch({ roundWins: ffa, entrants: eight({ a: 7, b: 7, c: 30 }) }).key === null,
    "nobody is the victor, which the wire reports as winnerKind none and the stage renders as a draw");

  check("a three-way tie broken by one man's kill count",
    decideMatch({ roundWins: { a: 2, b: 2, c: 2 }, entrants: eight({ a: 5, b: 9, c: 5 }) }).key === "b",
    "three level on rounds, b alone on top of the kills");

  check("a match in which nobody won a round is a draw, whatever the kills",
    decideMatch({ roundWins: {}, entrants: eight({ a: 3, b: 11, c: 6 }) }).key === null,
    "every round a mutual wipe — the kill count does not get to invent a victor, and summaryflow "
    + "caught the version that let it: a 2v2 whose only round downed both sides stood a band up");

  check("a man who won a round and left cannot be skipped",
    decideMatch({ roundWins: { gone: 3, a: 1 }, entrants: [{ key: "a", kills: 50 }] }).key === "gone",
    "gone is not among the entrants any more and still takes the match he won");

  check("an empty match is a draw rather than a crash",
    decideMatch({ roundWins: {}, entrants: [] }).key === null, "no entrants, no victor");

  // A war band ranks bands, so the same rule has to work on two keys carrying
  // summed kills rather than eight carrying their own.
  // The REASON, because a match won on kills looks identical on screen to one
  // won on rounds unless something says otherwise.
  check("the verdict says how it was won",
    decideMatch({ roundWins: { a: 3, b: 1 }, entrants: eight({ a: 1, b: 9 }) }).by === "rounds"
    && decideMatch({ roundWins: ffa, entrants: eight({ a: 4, b: 7, c: 1 }) }).by === "kills"
    && decideMatch({ roundWins: ffa, entrants: eight({ a: 7, b: 7, c: 1 }) }).by === "draw"
    && decideMatch({ roundWins: {}, entrants: [] }).by === "draw",
    "rounds / kills / draw — the summary has no other way to tell a player he lost a match he was level on");

  check("a war band tied on rounds is broken by the band's kills",
    decideMatch({ roundWins: { red: 1, blue: 1 }, entrants: [{ key: "red", kills: 12 }, { key: "blue", kills: 13 }] }).key === "blue",
    "red 12, blue 13");
}

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
