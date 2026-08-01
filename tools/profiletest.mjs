#!/usr/bin/env node
// ============================================================
// PROFILETEST — drives the profile API the way a phone would and
// checks that the economy is the server's and not the client's.
//
//   npm run profiletest                          (degraded paths only)
//   PROFILE_TEST_DB=postgres://... npm run profiletest   (everything)
//
// Sibling of tools/playtest.mjs and tools/touchtest.mjs, which guard
// the controls. This one guards the money: that a profile appears out
// of nothing, that gold can only be granted by a fight the server
// witnessed, that a purchase is priced from the real ARMOURY, that a
// recovery code brings a profile back onto another device, and that an
// old localStorage save comes across exactly once.
//
// The last two blocks are the ones that will actually run in
// production for a while: no DATABASE_URL, and DATABASE_URL pointing
// at a Render free tier that has expired. Both must land on
// `mode: "local"` and a game that still plays, never a 500.
//
// Exits non-zero on any failure.
// ============================================================
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { WebSocket } from "ws";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_PORT = parseInt(process.env.PORT || String(3870 + (process.pid % 25)), 10);
const DB = process.env.PROFILE_TEST_DB || process.env.DATABASE_URL || "";

let port = BASE_PORT;
let base = `http://127.0.0.1:${port}`;
let server = null;
let pass = 0, fail = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

async function post(path, body) {
  const res = await fetch(base + path, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}

async function waitForServer(timeoutMs = 180000) {
  const started = Date.now();
  for (;;) {
    try { const r = await fetch(base + "/api/health"); if (r.ok) return; } catch { /* wait */ }
    if (Date.now() - started > timeoutMs) throw new Error(`server never came up at ${base}`);
    await sleep(400);
  }
}

/** Boots the game on a fresh port so a killed server can never answer for the next one. */
async function boot(env) {
  if (server) { server.kill("SIGKILL"); await sleep(1200); port++; base = `http://127.0.0.1:${port}`; }
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  server = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), NODE_ENV: useProd ? "production" : "development", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer();
}

/** A game socket, driven the way the browser drives it. */
class Fighter {
  constructor() { this.msgs = []; this.waiters = []; }
  open() {
    return new Promise((ok, no) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      this.ws.on("open", ok);
      this.ws.on("error", no);
      this.ws.on("message", (raw) => {
        const m = JSON.parse(raw.toString());
        this.msgs.push(m);
        this.waiters = this.waiters.filter((w) => (w.type === m.type ? (w.ok(m), false) : true));
      });
    });
  }
  send(type, data) { this.ws.send(JSON.stringify({ type, data: data || {} })); }
  expect(type, ms = 25000) {
    const hit = this.msgs.find((m) => m.type === type);
    if (hit) return Promise.resolve(hit);
    return new Promise((ok, no) => {
      this.waiters.push({ type, ok });
      setTimeout(() => no(new Error(`timed out waiting for ${type}`)), ms);
    });
  }
  close() { try { this.ws.close(); } catch { /* already gone */ } }
}

/**
 * Fights a real match and returns what the engine paid the survivor. The
 * loser leaves the field by closing his socket, which is both the quickest
 * way to end a round and a case worth exercising anyway.
 */
async function fightAMatch(claimant) {
  const a = new Fighter(); await a.open();
  const b = new Fighter(); await b.open();
  a.send("create", { name: "Aethelred" });
  const joinA = await a.expect("join");
  b.send("join", { code: joinA.data.code, name: "Guthrum" });
  await b.expect("join");
  // What a client does on the `join` message: says which warrior it is, before
  // there is any pay to argue over.
  let bound = null;
  if (claimant) {
    bound = await post("/api/profile/bind", {
      id: claimant.id, secret: claimant.secret, playerId: joinA.data.playerId,
    });
  }
  a.send("set_rounds", { bestOf: 1 });
  a.send("ready", {}); b.send("ready", {});
  await sleep(400);
  a.send("start", {});
  await a.expect("countdown");
  for (let i = 0; i < 80; i++) {
    const st = a.msgs.filter((m) => m.type === "game_state").pop();
    if (st?.data?.state === "fighting") break;
    await sleep(250);
  }
  b.close();
  const end = await a.expect("match_end");
  a.close();
  return {
    playerId: joinA.data.playerId,
    paid: end.data.results.find((r) => r.id === joinA.data.playerId),
    bound: bound?.json?.bound,
  };
}

async function withDatabase() {
  console.log("\n[profiletest] with a database");
  const mint = await post("/api/profile/new", { name: "Aethelred" });
  check("a profile appears out of nothing", mint.json?.mode === "server" && typeof mint.json.secret === "string",
    JSON.stringify(mint.json)?.slice(0, 120));
  const { id, secret, profile } = mint.json;
  check("it carries a recovery code of four words", /^[a-z]+( [a-z]+){3}$/.test(profile?.recoveryCode || ""), profile?.recoveryCode);
  check("it starts broke and owning only the free kit", profile.gold === 0 && profile.unlocked.length > 10);

  check("a wrong key is refused", (await post("/api/profile/me", { id, secret: secret.slice(0, -2) + "xx" })).status === 401);
  check("an unknown profile is refused", (await post("/api/profile/me", { id: id + 99999, secret })).status === 401);

  const broke = await post("/api/profile/purchase", { id, secret, itemIds: ["helm_suttonhoo"] });
  check("the 2400 helm cannot be had for nothing", broke.status === 409 && broke.json.error === "insufficient_gold");
  const junk = await post("/api/profile/purchase", { id, secret, itemIds: ["helm_i_made_this_up"] });
  check("an invented item is not in the armoury", junk.status === 400 && junk.json.error === "unknown_item");
  const sneak = await post("/api/profile/equip", { id, secret, appearance: { ...profile.appearance, helm: "suttonhoo" } });
  check("unowned kit cannot be worn", sneak.json?.profile?.appearance?.helm !== "suttonhoo",
    `wearing ${sneak.json?.profile?.appearance?.helm}`);

  const other = (await post("/api/profile/new", {})).json;

  // A fight nobody reserved: the pay exists and belongs to no one.
  const loose = await fightAMatch(null);
  check("the engine paid the survivor of an unreserved fight", loose.paid?.goldEarned > 0);
  const grab = await post("/api/profile/match", { id: other.id, secret: other.secret, playerId: loose.playerId });
  check("an unreserved payout is paid to nobody", grab.status === 409 && grab.json.error === "not_bound",
    JSON.stringify(grab.json)?.slice(0, 90));
  const lateBind = await post("/api/profile/bind", { id: other.id, secret: other.secret, playerId: loose.playerId });
  check("and it cannot be reserved after the fact", lateBind.json?.bound === false);

  const { playerId, paid, bound } = await fightAMatch({ id, secret });
  check("a warrior is reserved at the join", bound === true);
  check("the engine paid the survivor", paid?.goldEarned > 0, `${paid?.goldEarned} gold`);
  const stolenBind = await post("/api/profile/bind", { id: other.id, secret: other.secret, playerId });
  check("a second profile cannot reserve the same warrior", stolenBind.json?.bound === false);
  const theft = await post("/api/profile/match", { id: other.id, secret: other.secret, playerId });
  check("another warrior cannot collect that pay", theft.status === 403, JSON.stringify(theft.json)?.slice(0, 90));

  const claim = await post("/api/profile/match", { id, secret, playerId });
  check("the pay lands on the profile that fought", claim.json?.granted === true && claim.json.profile.gold === paid.goldEarned,
    `${claim.json?.profile?.gold} vs ${paid.goldEarned}`);
  check("the match is counted once", claim.json?.profile?.matches === 1 && claim.json.profile.wins === 1);
  const retry = await post("/api/profile/match", { id, secret, playerId });
  check("a retried claim does not pay twice", retry.json?.granted === false && retry.json.profile.gold === paid.goldEarned);
  const ghost = await post("/api/profile/match", { id, secret, playerId: "00000000-0000-4000-8000-000000000000" });
  check("a fight that never happened pays nothing", ghost.status === 404 && ghost.json.error === "no_award");

  const buy = await post("/api/profile/purchase", { id, secret, itemIds: ["helm_iron"] });
  check("gold won in the ring buys what it should", buy.json?.spent === 30 && buy.json.profile.gold === paid.goldEarned - 30);
  check("the helm is owned and worn", buy.json?.profile?.appearance?.helm === "iron");
  check("re-equipping owned kit is free", (await post("/api/profile/purchase", { id, secret, itemIds: ["helm_iron"] })).json?.spent === 0);

  const spoken = `  ${profile.recoveryCode.toUpperCase().replace(/ /g, "-")}. `;
  const rec = await post("/api/profile/recover", { recoveryCode: spoken });
  check("four words bring the profile back on another device", rec.json?.profile?.id === id, JSON.stringify(rec.json)?.slice(0, 90));
  check("and the gold comes with it", rec.json?.profile?.gold === paid.goldEarned - 30);
  check("the old key stops working", (await post("/api/profile/me", { id, secret })).status === 401);
  check("a made-up code finds nobody", (await post("/api/profile/recover", { recoveryCode: "wolf wolf wolf wolf" })).status === 404);

  const save = {
    // The xp varies per run on purpose: the replay guard is a permanent unique
    // index on a hash of the save, so a fixed one would pass once and then
    // report a bug that is the guard doing its job.
    name: "Old Save", gold: 999999, xp: 4200 + (Date.now() % 5000), kills: 40, deaths: 9, wins: 7, matches: 20,
    unlocked: ["helm_iron", "cloak_red", "definitely_not_real"],
    appearance: { helm: "iron", hairStyle: "long", hairColor: 0x6b4a2a, beardStyle: "full", beardColor: 0x6b4a2a, cloak: "red", armorColor: 0x5f6b7a, warPaint: "none" },
  };
  const fresh = (await post("/api/profile/new", {})).json;
  const migrated = await post("/api/profile/claim", { id: fresh.id, secret: fresh.secret, save });
  check("an old localStorage save comes across", migrated.json?.profile?.unlocked?.includes("cloak_red"), JSON.stringify(migrated.json?.granted));
  check("but it is capped, not believed", migrated.json?.profile?.gold === 3000, `${migrated.json?.profile?.gold} from a claimed 999999`);
  check("junk unlocks are dropped", !migrated.json?.profile?.unlocked?.includes("definitely_not_real"));
  check("the same profile cannot claim twice", (await post("/api/profile/claim", { id: fresh.id, secret: fresh.secret, save })).status === 409);
  const second = (await post("/api/profile/new", {})).json;
  const replay = await post("/api/profile/claim", { id: second.id, secret: second.secret, save });
  check("the same save cannot be claimed again elsewhere", replay.status === 409 && replay.json.error === "replayed");
}

async function degraded(label) {
  console.log(`\n[profiletest] ${label}`);
  const calls = [
    ["/api/profile/new", {}],
    ["/api/profile/me", { id: 1, secret: "x" }],
    ["/api/profile/equip", { id: 1, secret: "x", name: "Beorn" }],
    ["/api/profile/purchase", { id: 1, secret: "x", itemIds: ["helm_suttonhoo"] }],
    ["/api/profile/bind", { id: 1, secret: "x", playerId: "00000000-0000-4000-8000-000000000000" }],
    ["/api/profile/match", { id: 1, secret: "x", playerId: "00000000-0000-4000-8000-000000000000" }],
    ["/api/profile/recover", { recoveryCode: "iron raven storm apple" }],
    ["/api/profile/claim", { id: 1, secret: "x", save: { gold: 999999 } }],
  ];
  for (const [path, body] of calls) {
    const r = await post(path, body);
    check(`${path} says local rather than failing`, r.status === 200 && r.json?.ok === true && r.json.mode === "local",
      `${r.status} ${JSON.stringify(r.json)?.slice(0, 70)}`);
  }
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) await post("/api/profile/me", { id: 1, secret: "x" });
  check("ten calls to a database that is not there stay fast", Date.now() - t0 < 3000, `${Date.now() - t0}ms`);
  check("the landing page still renders", (await fetch(base + "/")).ok);

  const a = new Fighter(); await a.open();
  a.send("solo", { name: "Beorn", botCount: 1, autoStart: true });
  const join = await a.expect("join");
  check("a fight still starts", !!join.data.playerId);
  a.close();
}

async function main() {
  if (DB) {
    await boot({ DATABASE_URL: DB });
    await withDatabase();
  } else {
    console.log("\n[profiletest] no PROFILE_TEST_DB set — skipping the database half");
  }
  await boot({ DATABASE_URL: "" });
  await degraded("with no database configured");
  // A host that is gone: the shape of a Render free tier on day 91.
  await boot({ DATABASE_URL: "postgresql://postgres@127.0.0.1:5499/expired" });
  await degraded("with a database that has expired");

  server?.kill("SIGKILL");
  console.log(`\n[profiletest] ${pass}/${pass + fail} checks passing`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  server?.kill("SIGKILL");
  process.exit(1);
});
