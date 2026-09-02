#!/usr/bin/env node
// NEONMOVE — the ninety-day clock's last mile, run by the OWNER on their own
// machine with their own connection strings. Nothing here is ever printed.
//
//   RENDER_URL='postgres://…render…' NEON_DIRECT_URL='postgres://…neon.tech/…?sslmode=require' \
//     node tools/neonmove.mjs            # dump Render, restore into Neon, verify the counts
//   … node tools/neonmove.mjs --check    # only compare the two databases' row counts
//
// docs/BACKLOG.md Wave B: Render's free Postgres is deleted 90 days after it was
// created, and every profile — recovery words, helmets, gold — goes with it. The
// code half of the move to Neon is done (docs/BACKLOG.md, "the code half audited
// against Neon's own skills"). This is the dump/restore half, which needs two
// credentials this repository's rule keeps out of every agent's hands:
//
//   1. Reset the Neon role's password in the Neon console first (the old one
//      was exposed in chat). Use the NEW strings below.
//   2. NEON_DIRECT_URL is the DIRECT string (no "-pooler" in the host): a
//      restore needs session state that transaction pooling does not carry.
//   3. After this says every table matches, set Render's DATABASE_URL to the
//      POOLED Neon string (the one WITH "-pooler"), redeploy, play one fight,
//      reload, and only then delete the Render database.
//
// Uses pg_dump/pg_restore from PATH (brew's postgresql@16 works). The dump is a
// temp file that is deleted on exit, whatever happens.
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import pg from "pg";

const RENDER = process.env.RENDER_URL;
const NEON = process.env.NEON_DIRECT_URL;
const CHECK_ONLY = process.argv.includes("--check");
if (!RENDER || !NEON) {
  console.error("[neonmove] set RENDER_URL and NEON_DIRECT_URL in the environment (never on the command line, never in a file that is committed).");
  process.exit(2);
}
if (/-pooler\./.test(new URL(NEON).host)) {
  console.error("[neonmove] NEON_DIRECT_URL is the POOLED string (its host has -pooler). A restore needs the direct one.");
  process.exit(2);
}
const TABLES = ["players", "seasons", "territories", "war_ledger", "war_flips", "match_history", "legacy_claims", "hearths"];

async function counts(url) {
  const c = new pg.Client({ connectionString: url, ssl: /neon\.tech/.test(url) ? { rejectUnauthorized: true } : undefined });
  await c.connect();
  const out = {};
  for (const t of TABLES) {
    try { out[t] = Number((await c.query(`select count(*) as n from ${t}`)).rows[0].n); }
    catch { out[t] = null; }
  }
  await c.end();
  return out;
}

const before = await counts(RENDER);
console.log("[neonmove] Render:", JSON.stringify(before));
if (!CHECK_ONLY) {
  const dir = mkdtempSync(join(tmpdir(), "neonmove-"));
  const file = join(dir, "render.dump");
  try {
    console.log("[neonmove] dumping Render (custom format, no owner/privilege statements)…");
    const d = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", file, RENDER], { stdio: "inherit" });
    if (d.status !== 0) { console.error("[neonmove] pg_dump failed"); process.exit(1); }
    console.log("[neonmove] restoring into Neon (direct host)…");
    const r = spawnSync("pg_restore", ["--no-owner", "--no-privileges", "--clean", "--if-exists", "--dbname", NEON, file], { stdio: "inherit" });
    if (r.status !== 0) { console.error("[neonmove] pg_restore reported errors — read them above; --clean/--if-exists warnings about missing objects on a fresh database are harmless, anything else is not"); }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const after = await counts(NEON);
console.log("[neonmove] Neon:  ", JSON.stringify(after));
let ok = true;
for (const t of TABLES) {
  if (before[t] === null) continue;
  const same = before[t] === after[t];
  ok &&= same;
  console.log(`  ${same ? "PASS" : "FAIL"}  ${t}: ${before[t]} on Render, ${after[t]} on Neon`);
}
console.log(ok ? "\n[neonmove] every table matches. Next: Render's DATABASE_URL = the POOLED Neon string, redeploy, play a fight, reload, then delete the Render database." : "\n[neonmove] counts differ — do not point Render at Neon yet.");
process.exit(ok ? 0 : 1);
