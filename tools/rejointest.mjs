#!/usr/bin/env node
// REJOINTEST — the way back in (backlog 8.9), headless.
//
//   node tools/rejointest.mjs
//
// A dropped link mid-match holds its body for AWOL_GRACE under a private
// reconnect key; a fresh session presenting the key walks back into it; the
// grace running out leaves through the departure's own door. The wartest
// idiom — the drop is `disconnectSession`, the SAME function the real
// server calls on socket close, so the lever is the production lever.
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { makeEngine } = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);

let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};
const RATE = 20;
const open = (eng) => {
  const c = { byType: new Map(), snapshot: null };
  c.sid = eng.connect((str) => {
    const m = JSON.parse(str);
    if (!c.byType.has(m.type)) c.byType.set(m.type, []);
    c.byType.get(m.type).push(m.data);
    if (m.data && m.data.players) c.snapshot = m.data;
  });
  c.send = (type, data) => eng.message(c.sid, { type, data: data || {} });
  c.last = (t) => { const a = c.byType.get(t) || []; return a[a.length - 1]; };
  return c;
};
const stepSeconds = (eng, s) => { for (let i = 0; i < Math.ceil(s * RATE); i++) eng.step(); };

/** Host + guest + a bot, fighting on the floor. */
const up = (eng) => {
  const host = open(eng);
  host.send("create", { name: "Hlaford", mode: "blood_moot", bestOf: 1, friendly: true, awaitLoad: false });
  const code = host.last("join").code;
  const guest = open(eng);
  guest.send("join", { code, name: "Wretha", awaitLoad: false });
  host.send("add_bot", {});
  host.send("start", {});
  stepSeconds(eng, 5);
  const room = eng._rooms.get(code);
  return { host, guest, code, room, gid: guest.last("join").playerId, gkey: guest.last("join").reconnectKey };
};

console.log("[rejoin] the way back in, headless\n");

// ---- §1 the key, the hold, and the walk back in ----
{
  const eng = makeEngine({ autoTick: false });
  const f = up(eng);
  check("the join hands each man his own key", typeof f.gkey === "string" && f.gkey.length > 10);
  check("the key is a credential and never rides a broadcast snapshot",
    !("reconnectKey" in (f.host.snapshot?.players?.[f.gid] ?? {}))
    && !("awol" in (f.host.snapshot?.players?.[f.gid] ?? {})));

  // The drop, by the production lever. The body STANDS.
  eng.disconnectSession(f.guest.sid);
  stepSeconds(eng, 2);
  check("a dropped link's body stands through the grace — no player_left, still on the floor",
    f.room.players.has(f.gid)
    && !(f.host.byType.get("player_left") || []).some((d) => d.playerId === f.gid));

  // A stranger with a forged key is refused; the room is unmoved.
  const thief = open(eng);
  thief.send("rejoin", { code: f.code, key: "not-the-key" });
  check("a forged key claims nothing", !!thief.last("error") && !thief.last("join"),
    `"${thief.last("error")?.message}"`);

  // The same person, back through a fresh session with the real key.
  const back = open(eng);
  back.send("rejoin", { code: f.code, key: f.gkey });
  const j = back.last("join");
  check("the key walks a fresh session back into the SAME body",
    !!j && j.playerId === f.gid && j.reconnectKey === f.gkey);
  const body = f.room.players.get(f.gid);
  check("the body is his again — awol cleared, and his input moves it",
    body.awol === 0 && (() => {
      back.send("input", { moveX: 0, moveZ: 0, rotationY: 1.5, attackDir: "overhead", attack: true });
      stepSeconds(eng, 0.3);
      return body.attackTimer > 0 || body.state === "attacking";
    })());

  // A LIVE man's key must not let a second tab hijack him.
  const hijack = open(eng);
  hijack.send("rejoin", { code: f.code, key: f.gkey });
  check("a live man cannot be hijacked — key alone is not a claim, awol is required too",
    !!hijack.last("error") && !hijack.last("join"));
}

// ---- §2 the grace runs out through the departure's own door ----
{
  const eng = makeEngine({ autoTick: false });
  const f = up(eng);
  eng.disconnectSession(f.guest.sid);
  // Past AWOL_GRACE (12 s): the sweep removes him through removeFromRoom,
  // so the host HEARS the departure and the round machinery sees it.
  stepSeconds(eng, 14);
  check("the grace expiring removes the body through the real door",
    !f.room.players.has(f.gid)
    && (f.host.byType.get("player_left") || []).some((d) => d.playerId === f.gid));
  check("and the expired key claims nothing", (() => {
    const late = open(eng);
    late.send("rejoin", { code: f.code, key: f.gkey });
    return !!late.last("error") && !late.last("join");
  })());
}

// ---- §3 the lobby keeps the old immediacy ----
{
  const eng = makeEngine({ autoTick: false });
  const host = open(eng);
  host.send("create", { name: "Hlaford", mode: "blood_moot", awaitLoad: false });
  const code = host.last("join").code;
  const guest = open(eng);
  guest.send("join", { code, name: "Wretha", awaitLoad: false });
  const gid = guest.last("join").playerId;
  const room = eng._rooms.get(code);
  eng.disconnectSession(guest.sid);
  stepSeconds(eng, 0.5);
  check("a lobby drop removes at once — there is nothing to hold a body IN, and a ghost blocks a seat",
    !room.players.has(gid));
}

// ---- §4 the muster does not wait for a dead socket ----
{
  const eng = makeEngine({ autoTick: false });
  const host = open(eng);
  host.send("create", { name: "Hlaford", mode: "blood_moot", bestOf: 1, friendly: true, awaitLoad: false });
  const code = host.last("join").code;
  const guest = open(eng);
  guest.send("join", { code, name: "Wretha", awaitLoad: true });
  host.send("add_bot", {});
  host.send("start", {});
  stepSeconds(eng, 0.5);
  const room = eng._rooms.get(code);
  check("the room holds the muster for a declared loader", room.state === "loading", `state=${room.state}`);
  eng.disconnectSession(guest.sid);
  stepSeconds(eng, 1.5);
  check("his socket dropping releases the muster AND holds his body — both, not either",
    (room.state === "countdown" || room.state === "fighting")
    && room.players.has(guest.last("join").playerId),
    `state=${room.state}`);
}

console.log(`\n[rejoin] ${passed}/${passed + failed}${failed ? " — FAILING" : ""}`);
process.exit(failed ? 1 : 0);
