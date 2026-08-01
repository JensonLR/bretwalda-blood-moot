#!/usr/bin/env node
// ============================================================
// CHEATTEST — the economy, judged from the outside.
//
//   npm run cheattest                              (the no-database path only)
//   CHEAT_DB=postgres://... npm run cheattest      (everything)
//
// tools/profiletest.mjs drives the profile API directly and guards what the
// server will and will not do. This one goes a layer out: it drives the real
// built game in a real browser on a 390x844 phone, plays actual matches, and
// asks the question the whole wave exists to answer — can a player who edits
// localStorage buy something he has not earned?
//
// It is a separate tool because it is slow and needs a browser, and because
// the thing it proves is a claim about the SHIPPED CLIENT rather than about
// the API. An API that refuses a cheat is worth nothing if the client keeps
// its own books alongside it.
//
// Needs a production build (npm run build). Exits non-zero on any failure.
// ============================================================
import { spawn, execSync } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { WebSocket } from "ws";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DB = process.env.CHEAT_DB || process.env.PROFILE_TEST_DB || "";
const SCREEN = { width: 390, height: 844 };

let pass = 0, fail = 0;
const log = (s) => console.log(s);
const check = (name, ok, detail = "") => {
  if (ok) { pass++; log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sql(q) {
  const url = new URL(DB);
  return execSync(
    `PGPASSWORD='${url.password}' psql -U ${url.username} -h ${url.hostname} -p ${url.port} -d ${url.pathname.slice(1)} -At -c "${q}"`,
    { encoding: "utf8", shell: "/bin/bash" },
  ).trim();
}

let server = null, port = 3910, base = "";
async function boot(env, label) {
  if (server) { server.kill("SIGKILL"); await sleep(1000); port++; }
  base = `http://127.0.0.1:${port}`;
  server = spawn("node", ["custom-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), NODE_ENV: "production", DATABASE_URL: env.DATABASE_URL ?? "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(base + "/api/health"); if (r.ok) { log(`\n[cheattest] ${label} on ${base}`); return; } } catch { /* wait */ }
    await sleep(300);
  }
  throw new Error("server never came up");
}

// ---------------------------------------------------------------- page helpers

/** The gold the player can actually see on the landing screen. */
const goldOnScreen = (page) => page.evaluate(() => {
  for (const d of document.querySelectorAll("div")) {
    if (d.children.length === 0 && d.textContent.trim() === "GOLD") {
      const v = d.previousElementSibling;
      if (v) return v.textContent.trim();
    }
  }
  return null;
});

const bannerText = (page) => page.evaluate(() => {
  const n = document.querySelector('[role="status"]');
  return n ? n.textContent.trim() : null;
});

const creds = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("bretwalda_link") || "null"));
const savedProfile = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("bretwalda_profile") || "null"));

/** Load the game and wait for the sign-in to have actually answered. */
async function open(page, url = base + "/") {
  const answered = page.waitForResponse(
    (r) => /\/api\/profile\/(new|me)$/.test(new URL(r.url()).pathname),
    { timeout: 30000 },
  ).catch(() => null);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const res = await answered;
  await sleep(700); // let the answer land in React state
  return res;
}

/** Fights one real match in the browser, with a node socket as the opponent. */
async function fightInBrowser(page, name) {
  await page.fill("input[placeholder='Enter warrior name...']", name);
  await page.click("text=CREATE BATTLE");
  await page.waitForSelector("text=CREATE ROOM", { timeout: 15000 });
  // Single round, so one death decides it. ROUND_OPTIONS is [1, 3, 5].
  await page.locator(".seg-item").first().click();
  await page.click("text=CREATE ROOM");
  await page.waitForSelector(".warcode", { timeout: 25000 });
  const code = (await page.locator(".warcode").first().textContent()).trim();

  const foe = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((ok, no) => { foe.on("open", ok); foe.on("error", no); });
  foe.send(JSON.stringify({ type: "join", data: { code, name: "Guthrum" } }));
  await page.waitForSelector("text=Guthrum", { timeout: 20000 });
  foe.send(JSON.stringify({ type: "ready", data: {} }));

  await page.getByRole("button", { name: /READY/ }).first().click();
  await sleep(500);
  await page.getByRole("button", { name: "START", exact: true }).first().click();
  await page.waitForFunction(() => !!document.querySelector("canvas"), null, { timeout: 30000 });
  await sleep(6000);           // through the countdown and into the fight
  foe.close();                 // he flees the field; the browser is last man standing
  // The results screen appears 2.2s after match_end and the room resets ~10s later.
  await page.waitForSelector("text=BATTLE COMPLETE", { timeout: 45000 }).catch(() => null);
  const verdict = await page.evaluate(() => document.body.innerText.slice(0, 400));
  await sleep(4000);           // the pay is collected with a 3.5s clock + retries
  return { code, verdict };
}

async function goLanding(page) {
  for (let i = 0; i < 8; i++) {
    if (await page.locator("text=CREATE BATTLE").count()) return;
    const leave = page.getByRole("button", { name: "LEAVE", exact: true }).first();
    if (await leave.count()) { await leave.click(); await sleep(700); continue; }
    const back = page.locator('button[aria-label="Leave room"]').first();
    if (await back.count()) { await back.click(); await sleep(700); continue; }
    await open(page);
    await sleep(600);
  }
}

async function openArmoury(page, tab) {
  await goLanding(page);
  await page.click("text=Armoury");
  await page.waitForSelector("text=THE ARMOURY", { timeout: 15000 });
  await page.locator(".tab-item").filter({ hasText: new RegExp(`^${tab}$`) }).first().click();
  await sleep(400);
}
const openArmouryHelms = (page) => openArmoury(page, "HELMETS");

// ---------------------------------------------------------------- the tests

async function cheatTest(browser) {
  log("\n[1] THE CHEAT TEST — a doctored purse buys nothing");
  const ctx = await browser.newContext({ viewport: SCREEN, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await open(page);

  const who = await creds(page);
  check("a profile was minted with no signup step", !!who && typeof who.id === "number", `id ${who?.id}`);
  check("it starts with an empty purse on screen", (await goldOnScreen(page)) === "0", `screen says ${await goldOnScreen(page)}`);

  // ---- earn something honestly, so there is a real number to compare against
  const fight = await fightInBrowser(page, "Aethelred");
  check("a real match was fought to a verdict in the browser",
    /BATTLE COMPLETE/i.test(fight.verdict), fight.verdict.split("\n").filter(Boolean).slice(0, 3).join(" · "));
  await goLanding(page);
  const earned = parseInt(await goldOnScreen(page), 10);
  const rowGold = parseInt(sql(`select gold from players where id=${who.id}`), 10);
  check("a fought match paid the profile", earned > 0 && earned === rowGold, `screen ${earned}, row ${rowGold}`);

  // ---- the payout survives a reload (it is the server's, not the tab's)
  await open(page);
  const afterReload = parseInt(await goldOnScreen(page), 10);
  check("the earned payout persists across a reload", afterReload === rowGold, `${afterReload} gold after reload, row ${rowGold}`);

  // ---- CHEAT A: rewrite the purse in the page context, no reload
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("bretwalda_profile"));
    p.gold = 999999;
    localStorage.setItem("bretwalda_profile", JSON.stringify(p));
  });
  const liveCheat = await savedProfile(page);
  check("localStorage now claims a fortune", liveCheat.gold === 999999, `bretwalda_profile.gold = ${liveCheat.gold}`);

  await openArmouryHelms(page);
  await page.locator("button", { hasText: /Sutton Hoo/ }).first().click();
  await sleep(400);
  await page.getByRole("button", { name: /EQUIP/ }).first().click();
  await page.waitForSelector('[role="status"]', { timeout: 15000 }).catch(() => null);
  const refusalA = await bannerText(page);
  check("the shop refuses the 2400 helm to a doctored purse", /not enough|gold/i.test(refusalA || ""), JSON.stringify(refusalA));
  const rowA = sql(`select gold||'|'||(unlocked_cosmetics::text like '%helm_suttonhoo%') from players where id=${who.id}`);
  check("the row was not charged and the helm was not granted", rowA === `${rowGold}|false`, `gold|owns_suttonhoo = ${rowA}`);

  // ---- CHEAT B: the same lie, carried across a reload
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("bretwalda_profile"));
    p.gold = 999999;
    p.unlocked = [...p.unlocked, "helm_suttonhoo"];
    localStorage.setItem("bretwalda_profile", JSON.stringify(p));
  });
  // Hold the sign-in back for three seconds so the doctored file is genuinely
  // the only thing the client has to draw from, then let the server answer.
  await page.route("**/api/profile/me", async (route) => {
    await sleep(3000);
    await route.continue();
  });
  await page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=CREATE BATTLE", { timeout: 20000 });
  const flashed = await goldOnScreen(page).catch(() => null);
  await sleep(6000);
  const settledGold = await goldOnScreen(page);
  await page.unroute("**/api/profile/me");
  check("the client does draw the doctored file before the server answers", flashed === "999999",
    `screen showed "${flashed}" while the sign-in was in flight`);
  check("the cheated number is overwritten by the server's", settledGold === String(rowGold),
    `flashed "${flashed}" from localStorage, settled on "${settledGold}"`);

  await openArmouryHelms(page);
  const suttonState = await page.locator("button", { hasText: /Sutton Hoo/ }).first().innerText();
  check("the helm is not shown as owned after the reload", !/owned|equipped/i.test(suttonState),
    suttonState.replace(/\n/g, " · "));

  // ---- CHEAT C: skip the client entirely and ask the API with the real key
  const direct = await page.evaluate(async (c) => {
    const r = await fetch("/api/profile/purchase", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...c, itemIds: ["helm_suttonhoo"] }),
    });
    return { status: r.status, body: await r.json() };
  }, who);
  check("the API itself refuses the helm to the same key", direct.status === 409 && direct.body.error === "insufficient_gold",
    `${direct.status} ${JSON.stringify(direct.body)}`);

  const forged = await page.evaluate(async (c) => {
    const r = await fetch("/api/profile/equip", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...c, appearance: { helm: "suttonhoo" } }),
    });
    return (await r.json())?.profile?.appearance?.helm;
  }, who);
  check("nor can the helm simply be worn without buying it", forged !== "suttonhoo", `wearing ${forged}`);

  const finalRow = sql(`select gold||'|'||(unlocked_cosmetics::text like '%helm_suttonhoo%') from players where id=${who.id}`);
  check("after every attempt the row is untouched", finalRow === `${rowGold}|false`, `gold|owns_suttonhoo = ${finalRow}`);

  // Buying what he CAN afford still works, so this is a real shop and not a wall.
  await openArmoury(page, "HAIR");
  await page.locator("button", { hasText: /Long Mane/ }).first().click();
  await sleep(400);
  await page.getByRole("button", { name: /EQUIP/ }).first().click();
  await sleep(2500);
  const afterBuy = sql(`select gold from players where id=${who.id}`);
  check("kit he has earned the gold for is sold to him", parseInt(afterBuy, 10) === rowGold - 40,
    `${rowGold} - 40 (Long Mane) = ${afterBuy}`);

  const words = await page.evaluate(() => JSON.parse(localStorage.getItem("bretwalda_profile")).recoveryCode);
  const state = { id: who.id, gold: parseInt(afterBuy, 10), words };
  await ctx.close();
  return state;
}

async function recoveryTest(browser, from) {
  log("\n[3] THE RECOVERY CODE — four words move a hoard to a second device");
  const ctx = await browser.newContext({ viewport: SCREEN, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await open(page);

  // Read the words off the Saga screen of the first device's profile? No — the
  // point is a NEW device that has never seen it, so this context mints its own.
  const mine = await creds(page);
  check("the second device minted its own empty profile", mine.id !== from.id && (await goldOnScreen(page)) === "0",
    `id ${mine.id}, ${await goldOnScreen(page)} gold`);

  await page.click("text=Saga");
  await page.waitForSelector("text=THE WORDS THAT BRING YOU BACK", { timeout: 15000 });
  const shown = await page.evaluate(() => {
    const cells = [...document.querySelectorAll(".font-display")]
      .filter((e) => /^[a-z]+$/i.test(e.textContent.trim()) && e.textContent.trim().length > 2);
    return cells.map((e) => e.textContent.trim().toLowerCase());
  });
  check("its own four words are on screen to be read", shown.length >= 4, shown.slice(0, 4).join(" "));

  // Now type the FIRST device's words on this one.
  await page.getByRole("button", { name: /FOUR WORDS/i }).first().click();
  await page.waitForSelector("input[placeholder='leaf sapling wolf glass']", { timeout: 10000 });
  await page.fill("input[placeholder='leaf sapling wolf glass']", from.words);
  await page.keyboard.press("Enter");
  await sleep(2500);

  const now = await creds(page);
  check("the second device is now the first device's profile", now.id === from.id, `id ${now.id} (was ${mine.id})`);
  await goLanding(page);
  const gold = parseInt(await goldOnScreen(page), 10);
  check("the gold came with it", gold === from.gold, `${gold} gold, expected ${from.gold}`);
  const worn = await savedProfile(page);
  check("and so did the kit that gold bought", worn.unlocked.includes("hair_long"), `owns hair_long: ${worn.unlocked.includes("hair_long")}`);

  const wrong = await page.evaluate(async () => {
    const r = await fetch("/api/profile/recover", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ recoveryCode: "wrong words entirely here" }),
    });
    return { status: r.status, body: await r.json() };
  });
  check("a phrase nobody owns finds nobody", wrong.status === 404, `${wrong.status} ${wrong.body?.error}`);

  await ctx.close();
}

async function migrationTest(browser) {
  log("\n[5] THE MIGRATION — an old save is an amnesty, not a printing press");
  const hoard = {
    level: 9, xp: 8000, gold: 999999, honour: 500, kills: 90, deaths: 10, wins: 40, matches: 50,
    unlocked: ["helm_suttonhoo", "helm_iron", "cloak_bear"], appearance: {},
  };

  // Seeded before any page script runs, so the save is genuinely there when
  // the game first boots rather than racing the sign-in that boot kicks off.
  const seeded = async () => {
    const c = await browser.newContext({ viewport: SCREEN, isMobile: true, hasTouch: true });
    await c.addInitScript((h) => {
      if (!localStorage.getItem("bretwalda_profile")) localStorage.setItem("bretwalda_profile", JSON.stringify(h));
    }, hoard);
    return [c, await c.newPage()];
  };

  // First device: a genuine player who has been playing since before the server.
  const [c1, p1] = await seeded();
  await open(p1);
  await sleep(1500);
  const id1 = (await creds(p1)).id;
  const g1 = parseInt(sql(`select gold from players where id=${id1}`), 10);
  check("an old save is carried across, capped rather than believed", g1 === 3000, `claimed 999999, granted ${g1}`);
  const u1 = sql(`select unlocked_cosmetics::text like '%helm_suttonhoo%' from players where id=${id1}`);
  check("the kit came across inside the value ceiling", u1 === "t", `owns_suttonhoo = ${u1}`);

  // Replay 1: same browser, link key and migration flag both wiped — two
  // localStorage keys and a reload, no devtools skill required. What is left
  // on the device is the server's own mirror of the hoard it just granted.
  const link1 = await creds(p1);
  const mirror = await savedProfile(p1);
  check("the device is left holding a mirror of the granted hoard",
    mirror.gold === 3000 && typeof mirror.recoveryCode === "string" && mirror.recoveryCode.length > 0,
    `bretwalda_profile = ${mirror.gold} gold, recoveryCode "${mirror.recoveryCode}"`);
  await p1.evaluate(() => { localStorage.removeItem("bretwalda_link"); localStorage.removeItem("bretwalda_migrated"); });
  await open(p1);
  await sleep(1500);
  const id2 = (await creds(p1)).id;
  const g2 = parseInt(sql(`select gold from players where id=${id2}`), 10);
  check("re-minting and re-claiming that mirror mints nothing", id2 !== id1 && g2 === 0,
    `new profile ${id2} has ${g2} gold`);

  // Replay 2: a different browser entirely, same save file.
  const [c2, p2] = await seeded();
  await open(p2);
  await sleep(1500);
  const id3 = (await creds(p2)).id;
  const g3 = parseInt(sql(`select gold from players where id=${id3}`), 10);
  check("the same save on another device mints nothing either", g3 === 0, `profile ${id3} has ${g3} gold`);

  // Replay 3: straight at the API, on the profile that already claimed.
  const again = await p1.evaluate(async ([link, h]) => {
    const r = await fetch("/api/profile/claim", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...link, save: { ...h, gold: 2999 } }),
    });
    return { status: r.status, body: await r.json() };
  }, [link1, hoard]);
  check("a profile that has already claimed is refused a second save",
    again.status === 409 && again.body?.error === "already_claimed",
    `${again.status} ${JSON.stringify(again.body?.error)}`);

  const paid = sql("select count(*)||'|'||coalesce(sum(gold),0) from players where legacy_claimed_at is not null");
  check("exactly one profile was ever paid for that save", paid === "1|3000",
    `profiles_paid|gold = ${paid}`);

  // The bound the design accepts and does not hide: a save is unverifiable, so
  // somebody willing to hand-write one in devtools can still get a fresh
  // profile up to the ceiling. What is measured here is that the ceiling holds
  // and that it is once per profile — the window itself closes 2026-11-01.
  const [c3, p3] = await seeded();
  await open(p3);
  await sleep(1200);
  const forged = await p3.evaluate(async () => {
    const link = JSON.parse(localStorage.getItem("bretwalda_link"));
    const save = { gold: 9_999_999, xp: 9_999_999, kills: 9999, wins: 9999, matches: 9999,
      unlocked: ["helm_suttonhoo", "helm_wyrm", "helm_crowned", "helm_boar", "cloak_bear"] };
    const one = await (await fetch("/api/profile/claim", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...link, save }),
    })).json();
    const two = await fetch("/api/profile/claim", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...link, save: { ...save, gold: 9_999_998 } }),
    });
    return { granted: one?.granted, gold: one?.profile?.gold, second: two.status };
  });
  check("a hand-written save is capped at the ceiling, not believed",
    forged.gold === 3000, `claimed 9999999, granted ${forged.gold}`);
  check("and that profile cannot claim a second one", forged.second === 409, `second claim ${forged.second}`);
  await c3.close();

  await c1.close(); await c2.close();
}

async function noDatabaseTest(browser) {
  log("\n[2] THE NO-DATABASE PATH — the one that runs today");
  const ctx = await browser.newContext({ viewport: SCREEN, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  const modes = [];
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", async (r) => {
    if (!/\/api\/profile\//.test(r.url())) return;
    try { modes.push({ path: new URL(r.url()).pathname, status: r.status(), body: await r.json() }); } catch { /* ok */ }
  });

  await open(page);
  check("the game starts with no database", await page.locator("text=CREATE BATTLE").count() > 0);
  check("no profile route answered anything but 200 local",
    modes.length > 0 && modes.every((m) => m.status === 200 && m.body?.mode === "local"),
    modes.map((m) => `${m.path}=${m.status}/${m.body?.mode}`).join(" "));
  check("no key was minted on the device", (await creds(page)) === null);
  check("nothing on screen tells the player anything is wrong", (await bannerText(page)) === null);

  const before = parseInt(await goldOnScreen(page), 10);
  const fight = await fightInBrowser(page, "Osric");
  const banner = await bannerText(page);
  check("a full match plays through with no database", /BATTLE COMPLETE/i.test(fight.verdict),
    fight.verdict.split("\n").filter(Boolean).slice(0, 3).join(" · "));
  check("the player is never shown a failure", banner === null || !/could not|did not|error|fail/i.test(banner),
    banner === null ? "no banner at all" : JSON.stringify(banner));
  await goLanding(page);
  const after = parseInt(await goldOnScreen(page), 10);
  check("the fight paid out on the device", after > before, `${before} -> ${after} gold`);

  await open(page);
  const kept = parseInt(await goldOnScreen(page), 10);
  check("and the device keeps it across a reload", kept === after, `${kept} gold`);

  // The Saga screen must be honest about where the hoard lives.
  await page.click("text=Saga");
  await sleep(1200);
  const keepText = await page.evaluate(() => document.body.innerText);
  check("the Saga says plainly that there are no war rolls today",
    /KEPT ON THIS DEVICE/i.test(keepText) && !/THE WORDS THAT BRING YOU BACK/i.test(keepText));

  check("no uncaught error was thrown in the page", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 160));
  await ctx.close();
}

// ---------------------------------------------------------------- run

(async () => {
  const preinstalled = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
  try {
    if (!existsSync(resolve(ROOT, ".next/BUILD_ID"))) {
      console.log("[cheattest] no production build — run `npm run build` first");
      process.exit(1);
    }
    if (DB) {
      await boot({ DATABASE_URL: DB }, "with a database");
      const earned = await cheatTest(browser);
      await recoveryTest(browser, earned);
      await migrationTest(browser);
    } else {
      log("\n[cheattest] no CHEAT_DB set — skipping the database half");
    }
    await boot({ DATABASE_URL: "" }, "with no database at all");
    await noDatabaseTest(browser);
  } finally {
    await browser.close();
    if (server) server.kill("SIGKILL");
  }
  log(`\n[cheattest] ${pass}/${pass + fail} checks passing`);
  process.exit(fail === 0 ? 0 : 1);
})();
