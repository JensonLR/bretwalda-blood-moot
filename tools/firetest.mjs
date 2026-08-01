#!/usr/bin/env node
// ============================================================
// FIRETEST — does the bonfire actually cost anything?
//
//   node tools/firetest.mjs
//
// Drives the REAL engine, not a copy of its numbers. `getEngine()` is the same
// singleton `custom-server.mjs` hands the WebSocket to, and it is already
// ticking on its own `setInterval` at the game's own rate — so this file opens
// a session, starts a solo room, sends `input` messages the way a browser does,
// and reads the authoritative `game_state` snapshots back off the session's
// sender. Nothing is stepped by hand and no constant is re-declared here:
// every number below is read out of a packet.
//
// It exists because "a man walking through the fire takes a bite and survives,
// a man standing in it dies" is a claim about the simulation that only the
// simulation can settle, and the browser playtest cannot reach it — the fire is
// at the origin and the ring spawns at 6 m, so a scripted keyboard walk is
// twenty seconds of held W before the first assertion.
//
// Exits non-zero if any of the five claims fails.
// ============================================================
import { getEngine } from "../src/game/engine.mjs";

const engine = getEngine();
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One session, one solo room. `latest` is whatever the server last said, which
 * is the only thing a client ever knows and therefore the only thing worth
 * asserting on.
 */
function openSession(name, botCount) {
  const state = { latest: null, kills: [], rounds: [] };
  const sid = engine.connect((str) => {
    const m = JSON.parse(str);
    if (m.type === "game_state" || m.type === "lobby_update") state.latest = m.data;
    if (m.type === "kill") state.kills.push(m.data);
    if (m.type === "round_end") state.rounds.push(m.data);
  });
  engine.message(sid, { type: "solo", data: { name, botCount, difficulty: "jarl", autoStart: true } });
  return { sid, state };
}

const mine = (state) => {
  const s = state.latest;
  if (!s || !s.players) return null;
  return Object.values(s.players).find((p) => !String(p.id).startsWith("bot_")) ?? null;
};

/** Wait until the room is fighting and the warrior has a position. */
async function reachFight(session, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const me = mine(session.state);
    if (me && (session.state.latest.state === "fighting" || session.state.latest.state === "last_stand")) return me;
    await sleep(50);
  }
  throw new Error("never reached a fight");
}

/**
 * Point a warrior at a mark and hold W until he is there.
 *
 * Teleporting him would be faster and would prove nothing: the whole question
 * is what the sim does to a man who WALKS into the fire, and the walk is what
 * carries him across the hazard boundary at the speed his class actually moves.
 * So this is held input, resent every 50 ms the way the render loop does it.
 */
async function walkTo(session, tx, tz, opts = {}) {
  const { stopWithin = 0.35, timeoutMs = 30000, sprint = false, onTick } = opts;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const me = mine(session.state);
    if (!me || me.state === "dead") return me;
    const dx = tx - me.position.x;
    const dz = tz - me.position.z;
    const d = Math.hypot(dx, dz);
    if (onTick) onTick(me, d);
    if (d < stopWithin) return me;
    // `moveX`/`moveZ` are a WORLD-space unit vector, not a camera-relative one —
    // the client resolves the thumb against the camera before it sends. So the
    // heading is the vector and `rotationY` only decides which way he is facing
    // while he walks it.
    engine.message(session.sid, {
      type: "input",
      data: { moveX: dx / d, moveZ: dz / d, rotationY: Math.atan2(dx, dz), sprint, attack: false, block: false, dodge: false, attackDir: "right" },
    });
    await sleep(50);
  }
  return mine(session.state);
}

/** Hold still for `ms`, reporting every snapshot. */
async function stand(session, ms, onTick) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const me = mine(session.state);
    if (me) onTick?.(me);
    if (me && me.state === "dead") return me;
    engine.message(session.sid, {
      type: "input",
      data: { moveX: 0, moveZ: 0, rotationY: me?.rotation ?? 0, sprint: false, attack: false, block: false, dodge: false, attackDir: "right" },
    });
    await sleep(50);
  }
  return mine(session.state);
}

const r = (p) => Math.hypot(p.position.x, p.position.z);

async function main() {
  // ---------------------------------------------------------------
  // 1 & 3. A man WALKS THROUGH the fire: he takes a bite, he lives,
  //        and he is still visibly alight after he is out of it.
  // ---------------------------------------------------------------
  {
    const s = openSession("Walker", 0);
    await reachFight(s);
    const start = mine(s.state);
    const hp0 = start.health;
    // Straight through the middle and out the far side. The far mark is 5 m
    // past the origin, which is well outside anything the hazard can reach.
    const through = { minR: 99, hpIn: null, everInside: false };
    await walkTo(s, -start.position.x * 0.83, -start.position.z * 0.83, {
      stopWithin: 0.6,
      onTick: (me) => {
        through.minR = Math.min(through.minR, r(me));
        if (me.burnInside) through.everInside = true;
      },
    });
    const out = mine(s.state);
    const hpAfterCrossing = out.health;
    check("a warrior walking through the fire is set alight",
      through.everInside && out.burning === true,
      `closest approach ${through.minR.toFixed(2)} m (hazard 1.475), burning=${out.burning}`);
    check("walking through it costs a bite, not a life",
      hpAfterCrossing > 0 && hpAfterCrossing < hp0 - 8,
      `${hp0.toFixed(0)} -> ${hpAfterCrossing.toFixed(0)} hp, alive=${out.state !== "dead"}`);

    // Now stand clear and watch the afterburn run down. This is the claim the
    // renderer depends on: the flames have to persist AFTER he leaves, or the
    // whole feature is a damage tick with a light on it.
    const tail = { sawOutsideButBurning: false, timers: [] };
    await stand(s, 1200, (me) => {
      if (me.burning && !me.burnInside) tail.sawOutsideButBurning = true;
      if (me.burning) tail.timers.push(me.burnTimer);
    });
    const settled = mine(s.state);
    const fell = tail.timers.length > 1 && tail.timers[tail.timers.length - 1] < tail.timers[0];
    check("the burn persists after he is out of the fire, and counts down",
      tail.sawOutsideButBurning && fell,
      `burnTimer ${tail.timers[0]?.toFixed(2)} -> ${tail.timers[tail.timers.length - 1]?.toFixed(2)} s at r=${r(settled).toFixed(2)} m`);
    engine.message(s.sid, { type: "leave" });
  }

  // ---------------------------------------------------------------
  // 2 & 4. A man who STANDS in it dies — and the death is a burn,
  //        which takes no limb off him.
  // ---------------------------------------------------------------
  {
    const s = openSession("Stander", 0);
    await reachFight(s);
    const hp0 = mine(s.state).health;
    const t0 = Date.now();
    await walkTo(s, 0, 0, { stopWithin: 0.5 });
    const arrived = Date.now();
    await stand(s, 12000);
    const dead = mine(s.state);
    check("a warrior who stands in the fire dies",
      dead.state === "dead" && dead.health === 0,
      `${hp0.toFixed(0)} hp -> dead in ${((Date.now() - arrived) / 1000).toFixed(1)} s inside (walk in took ${((arrived - t0) / 1000).toFixed(1)} s)`);
    check("a burn death takes no limb off",
      dead.deathCause === "fire" && dead.deathZone === null,
      `deathCause=${dead.deathCause}, deathZone=${JSON.stringify(dead.deathZone)}`);
    const burnKill = s.state.kills[s.state.kills.length - 1];
    console.log(`        kill feed: killerName=${JSON.stringify(burnKill?.killerName)}, cause=${JSON.stringify(burnKill?.cause)}, hitZone=${JSON.stringify(burnKill?.hitZone)}`);
    // The corpse goes on smouldering and then goes out on the server's clock,
    // which is what the renderer is told not to run a timer of its own for.
    check("the corpse is still alight when it lands", dead.burning === true,
      `burning=${dead.burning}, burnTimer=${dead.burnTimer?.toFixed(2)} s`);
    engine.message(s.sid, { type: "leave" });
  }

  // ---------------------------------------------------------------
  // 5. Bots do not walk into it.
  // ---------------------------------------------------------------
  {
    const s = openSession("Marshal", 7);
    await reachFight(s);
    // The human stands off at the ring's edge and does nothing, so the bots
    // have a target on the far side of the hearth and every reason to cross it.
    const watch = { closest: 99, ignitions: 0, fireDeaths: 0, samples: 0, seen: new Set() };
    const end = Date.now() + 45000;
    while (Date.now() < end) {
      const snap = s.state.latest;
      if (snap?.players) {
        for (const p of Object.values(snap.players)) {
          if (!String(p.id).startsWith("bot_")) continue;
          watch.seen.add(p.id);
          if (p.state === "dead") {
            if (p.deathCause === "fire") watch.fireDeaths++;
            continue;
          }
          watch.samples++;
          watch.closest = Math.min(watch.closest, r(p));
          if (p.burning) watch.ignitions++;
        }
      }
      // Keep the human alive and out of the way; a dead host ends the round.
      const me = mine(s.state);
      if (me && me.state !== "dead") {
        engine.message(s.sid, {
          type: "input",
          data: { moveX: 0, moveZ: 0, rotationY: me.rotation, sprint: false, attack: false, block: false, dodge: false, attackDir: "right" },
        });
      }
      await sleep(50);
    }
    check("bots do not walk into the fire",
      watch.closest > 1.475 && watch.ignitions === 0 && watch.fireDeaths === 0,
      `${watch.seen.size} bots, ${watch.samples} samples over 45 s: closest approach ${watch.closest.toFixed(2)} m, ${watch.ignitions} ignitions, ${watch.fireDeaths} fire deaths`);
    engine.message(s.sid, { type: "leave" });
  }

  const failed = results.filter((x) => !x.pass);
  console.log(`\n[firetest] ${results.length - failed.length}/${results.length} claims proven`);
  if (failed.length) {
    console.log("[firetest] UNPROVEN: " + failed.map((f) => f.name).join(", "));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error("[firetest] failed:", e); process.exitCode = 1; })
  .finally(() => { clearInterval(engine._tickInterval); });
