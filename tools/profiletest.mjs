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
import { spawn, spawnSync } from "child_process";
import { existsSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
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

  // ---- key bindings live on the profile, and junk does not ----
  // The remap is only worth persisting if it survives the trip to another
  // device, so it is checked here and driven for real in a browser by
  // tools/playtest.mjs. What this block guards is the wire: what the server
  // will take, and what it refuses rather than storing.
  const remap = {
    forward: ["KeyT", "ArrowUp"], back: ["KeyS"], left: ["KeyA"], right: ["KeyD"],
    sprint: ["ShiftLeft"], dodge: ["Space"], crouch: ["ControlLeft"], attack: ["Mouse0"],
    heavy: ["KeyE"], block: ["Mouse2"], ability: ["KeyQ"],
  };
  check("a profile starts with no bindings of its own",
    (await post("/api/profile/me", { id, secret })).json?.profile?.bindings === null,
    "null is what tells a client to carry the device's own table up");
  const kept = await post("/api/profile/equip", { id, secret, bindings: remap });
  check("a remap is kept on the roll", kept.json?.profile?.bindings?.forward?.[0] === "KeyT",
    JSON.stringify(kept.json?.profile?.bindings?.forward));
  check("saving bindings does not disturb the gold",
    kept.json?.profile?.gold === paid.goldEarned - 30, `${kept.json?.profile?.gold} gold`);

  const junkTables = [
    ["an action this game does not have", { fly: ["KeyT"] }],
    ["a code that is not a code", { forward: ["'; drop table players --"] }],
    ["a key the browser has already taken", { forward: ["F12"] }],
    ["more keys than one action can hold", { forward: ["KeyT", "KeyU", "KeyI", "KeyO"] }],
    ["a table that is not a table", ["KeyT"]],
    ["a blob far bigger than a binding table", { forward: new Array(400).fill("KeyT") }],
  ];
  for (const [what, blob] of junkTables) {
    const r = await post("/api/profile/equip", { id, secret, bindings: blob });
    check(`${what} is refused`, r.status === 400 && r.json?.error === "bad_bindings",
      `${r.status} ${r.json?.error}`);
  }
  check("and the refusals left the real bindings alone",
    (await post("/api/profile/me", { id, secret })).json?.profile?.bindings?.forward?.[0] === "KeyT");

  const spoken = `  ${profile.recoveryCode.toUpperCase().replace(/ /g, "-")}. `;
  const rec = await post("/api/profile/recover", { recoveryCode: spoken });
  check("four words bring the profile back on another device", rec.json?.profile?.id === id, JSON.stringify(rec.json)?.slice(0, 90));
  check("and the gold comes with it", rec.json?.profile?.gold === paid.goldEarned - 30);
  check("and so do the keys he plays with", rec.json?.profile?.bindings?.forward?.[0] === "KeyT",
    JSON.stringify(rec.json?.profile?.bindings?.forward));
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

  // The loop that nearly shipped: the client keeps mirroring the server's
  // totals back into `bretwalda_profile`, so the migration's own output is
  // sitting in localStorage looking exactly like an old save. Claiming it
  // pays the same hoard twice, and a single fight between the two claims
  // moves the numbers enough that the fingerprint index does not catch it.
  const mirror = { ...migrated.json.profile };
  const third = (await post("/api/profile/new", {})).json;
  const loop = await post("/api/profile/claim", { id: third.id, secret: third.secret, save: mirror });
  check("the server's own mirror cannot be claimed as an old save",
    loop.status === 409 && loop.json.error === "replayed", `${loop.status} ${loop.json?.error}`);
  check("and nothing was granted for it", (await post("/api/profile/me", { id: third.id, secret: third.secret })).json?.profile?.gold === 0);

  const fought = { ...mirror, gold: mirror.gold + 60, matches: mirror.matches + 1, kills: mirror.kills + 2 };
  const fourth = (await post("/api/profile/new", {})).json;
  const loop2 = await post("/api/profile/claim", { id: fourth.id, secret: fourth.secret, save: fought });
  check("nor can it after a fight has moved the numbers",
    loop2.status === 409 && loop2.json.error === "replayed", `${loop2.status} ${loop2.json?.error}`);

  // The same hoard, hashed the same whichever shape it arrives in: a save
  // that has been round-tripped through a profile lists the free starting
  // kit, and the original does not.
  const dressed = { ...save, unlocked: [...(migrated.json.profile.unlocked || [])] };
  const fifth = (await post("/api/profile/new", {})).json;
  const rehash = await post("/api/profile/claim", { id: fifth.id, secret: fifth.secret, save: dressed });
  check("free starting kit does not make one hoard look like two",
    rehash.status === 409 && rehash.json.error === "replayed", `${rehash.status} ${rehash.json?.error}`);
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

/**
 * THE POOLED/DIRECT SPLIT, checked as arithmetic rather than trusted.
 *
 * Neon publishes two hostnames for one database and the rule is that the app
 * takes the pooled one and schema work takes the direct one. `src/db/index.ts`
 * derives the second from the first, and it is the kind of string surgery that
 * looks obviously right and eats a password. These cases are cheap and they are
 * the reason it is a `URL` rewrite and not a `replace` on the whole string.
 */
async function directUrlChecks() {
  console.log("\n[profiletest] the pooled/direct split");
  // Compiled here rather than imported from source, the same way every other
  // tool in this directory reaches into `src/`: one tsc, into a scratch dir
  // this file owns.
  const OUT = resolve(ROOT, ".profiletest-db");
  rmSync(OUT, { recursive: true, force: true });
  spawnSync("npx", ["tsc", "src/db/index.ts", "--outDir", ".profiletest-db",
    "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler",
    "--skipLibCheck"], { cwd: ROOT, encoding: "utf8" });
  const built = resolve(OUT, "index.js");
  const mod = existsSync(built)
    ? await import(pathToFileURL(built).href).catch(() => null)
    : null;
  const directUrl = mod?.directUrl;
  if (!directUrl) {
    check("the direct-url helper compiles and is reachable", false, "tsc emitted nothing for src/db/index.ts");
    return;
  }
  const pooled = "postgresql://u:p@ep-cool-name-a1b2c3-pooler.us-east-2.aws.neon.tech/db?sslmode=require";
  check("a Neon pooled host loses only its -pooler",
    directUrl(pooled).includes("ep-cool-name-a1b2c3.us-east-2.aws.neon.tech")
    && !directUrl(pooled).includes("-pooler"), directUrl(pooled));
  const direct = "postgresql://u:p@ep-cool-name-a1b2c3.us-east-2.aws.neon.tech/db?sslmode=require";
  check("a host that is already direct comes back untouched",
    directUrl(direct) === direct, directUrl(direct));
  // The whole reason this is a URL rewrite: a text substitution would eat this.
  const nasty = "postgresql://u:secret-pooler.hunter2@ep-x-pooler.us-east-2.aws.neon.tech/db";
  const out = directUrl(nasty);
  check("a password containing -pooler. survives the rewrite",
    out.includes("secret-pooler.hunter2") && !out.includes("-pooler.us-east-2"), out);
  check("a string that is not a URL comes back as itself",
    directUrl("not a url at all") === "not a url at all");
  check("Render and local Postgres are untouched",
    directUrl("postgresql://postgres:postgres@127.0.0.1:5432/app_db")
      === "postgresql://postgres:postgres@127.0.0.1:5432/app_db");

  // ---- and the TLS mode, which is on a timer ----
  //
  // `pg` treats `require` as `verify-full` TODAY and will adopt libpq's weaker
  // meaning in v9 — encrypt, do not verify. Neon's strings say `sslmode=require`.
  // These pin what is in force now so the upgrade cannot quietly loosen it.
  const pinSslMode = mod?.pinSslMode;
  if (!pinSslMode) { check("the sslmode pin is reachable", false); return; }
  check("Neon's own sslmode=require is pinned to verify-full",
    pinSslMode("postgresql://u:p@h.neon.tech/db?sslmode=require&channel_binding=require")
      .includes("sslmode=verify-full"));
  check("channel_binding survives the pin",
    pinSslMode("postgresql://u:p@h.neon.tech/db?sslmode=require&channel_binding=require")
      .includes("channel_binding=require"));
  check("an explicit sslmode=disable is somebody's choice and is left alone",
    pinSslMode("postgresql://u:p@h/db?sslmode=disable").includes("sslmode=disable"));
  check("verify-full is already right and is not rewritten",
    pinSslMode("postgresql://u:p@h/db?sslmode=verify-full").includes("sslmode=verify-full"));
  check("a URL with no sslmode at all is untouched",
    pinSslMode("postgresql://postgres@127.0.0.1:5432/app_db")
      === "postgresql://postgres@127.0.0.1:5432/app_db");
}

async function main() {
  await directUrlChecks();
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
