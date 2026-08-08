#!/usr/bin/env node
// ============================================================
// LOCKTEST — the soft lock does not seize your own shield-brother.
//
//   node tools/locktest.mjs
//
// The owner: "can we stop the lock on from locking onto team mates in warband."
// It did, and the reason was one word doing no work — `liveEnemies` meant
// "everyone who is not me and not dead", with nothing about sides in it. On a
// phone the lock OWNS the yaw, so seizing a shield-brother turns the player
// away from the side he is fighting.
//
// INNER-LOOP TOOL: no browser, no build, no server. `src/game/client/input.ts`
// imports React and the binding layer and cannot load in a bare Node process,
// which is exactly why the rule was moved to `targeting.ts` — a module with one
// type import and nothing else. Milliseconds.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".locktest");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
spawnSync("npx", ["tsc", "src/game/client/targeting.ts", "--outDir", ".locktest",
  "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(d, e.name)) : e.name === "targeting.js" && found.push(resolve(d, e.name)); };
walk(OUT);
if (!found[0]) { console.error("[lock] tsc emitted nothing"); process.exit(2); }
const { liveEnemies, sameSide } = await import(pathToFileURL(found[0]).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};
const man = (team, state = "idle") => ({ team, state });

console.log("\n[locktest] who the soft lock may seize\n");

// A war band: me and one brother on red, two of theirs on blue.
const band = {
  me: man("red"), brother: man("red"), foeA: man("blue"), foeB: man("blue"),
};
{
  const got = liveEnemies(band, "me", band.me).sort();
  check("a war band offers only the other side", JSON.stringify(got) === '["foeA","foeB"]',
    `got [${got}] — the brother on red is not a target`);
}
{
  // The whole point, stated on its own so a regression names itself.
  const got = liveEnemies(band, "me", band.me);
  check("your own shield-brother is never a target", !got.includes("brother"),
    "on a phone the lock owns the yaw, so this one turns you away from the fight");
}
{
  // A free-for-all: everybody carries "none", and two men who are both "none"
  // are NOT team-mates. This is the clause that makes the fix cost nothing.
  const ffa = { me: man("none"), a: man("none"), b: man("none"), c: man("none") };
  const got = liveEnemies(ffa, "me", ffa.me).sort();
  check("a free-for-all still offers every other man", JSON.stringify(got) === '["a","b","c"]',
    `got [${got}] — "none" is not a side`);
}
{
  const withDead = { ...band, foeA: man("blue", "dead") };
  const got = liveEnemies(withDead, "me", withDead.me);
  check("the dead are still excluded", JSON.stringify(got) === '["foeB"]', `got [${got}]`);
}
{
  const got = liveEnemies(band, "me");
  check("with no local player the old behaviour stands", got.length === 3,
    "a caller that cannot say which side it is on is given everyone rather than nobody");
}
{
  check("sameSide is false across sides and false for two men with no side",
    !sameSide(man("red"), man("blue")) && !sameSide(man("none"), man("none"))
    && sameSide(man("red"), man("red")),
    "red/blue no, none/none no, red/red yes");
}

console.log(`\n[locktest] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
