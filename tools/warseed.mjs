#!/usr/bin/env node
// ============================================================
// WARSEED — a season with a war already in it, for photographing.
//
//   WAR_TEST_DB=postgres://... node tools/warseed.mjs
//
// WHY THIS EXISTS. `tools/warshot.mjs` with no database photographs the
// opening map: sixteen territories on their 878 holders, no ledger, no flips,
// nobody sworn. That picture cannot show a progress-and-identity defect,
// because on it there IS no progress to be missing. The owner reported this
// defect from a phone that had fought matches and sworn an oath, and the only
// honest way to shoot the same screen is to put a fought-over season in front
// of it.
//
// NOTHING HERE INVENTS A RULE. The season, the sixteen rows and their opening
// holders come from `openingHoldings` and `TERRITORIES` in `src/game/war.mjs`;
// every point moved onto the map goes through `contestGround` from that same
// module, so the contests, the flips, the epochs and the cleared totals are
// the ones the real attribution write would have produced from the same
// matches. What is synthetic is WHICH matches were fought — nothing else. A
// fixture that computed its own contests would be a second copy of the flip
// rule, which is `docs/PROCESS.md` failure mode 3.
//
// Prints the credentials of the man it seeded, for `warshot --as`.
// ============================================================
import { Client } from "pg";
import { createHash } from "crypto";
import {
  TERRITORIES, PEOPLES, POINTS, SEASON_DAYS, openingHoldings, contestGround,
} from "../src/game/war.mjs";

const DB = process.env.WAR_TEST_DB || process.env.DATABASE_URL || "";
if (!DB) { console.error("[warseed] needs WAR_TEST_DB"); process.exit(1); }

const DAY = 86_400_000;
const hash = (s) => createHash("sha256").update(s).digest("hex");

/**
 * A seeded pseudo-random source. A fixture that photographs differently on
 * every run is a fixture whose before/after pair cannot be compared, and this
 * tool's entire output is a before/after pair.
 */
let seed = 20260815;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length) % a.length];

/**
 * The men of this season. THE FIRST ONE is the man the camera stands behind.
 *
 * Twenty of them, five to a people, and the count is load-bearing rather than
 * decorative. With six men the seed gave its subject FOUR HUNDRED AND TWENTY-SIX
 * matches in nine days — forty-seven a night — and a screenshot carrying a
 * number no human could have earned is evidence of nothing. Twenty men over
 * four hundred matches puts the busiest of them near a hundred, which is a
 * dozen three-minute rounds an evening: keen, and possible.
 */
const CAST = [
  { name: "Wulfstan",  people: "saxon"  }, { name: "Aethelred", people: "saxon"  },
  { name: "Eadric",    people: "saxon"  }, { name: "Beorhtwulf", people: "saxon" },
  { name: "Osgar",     people: "saxon"  },
  { name: "Halfdan",   people: "norse"  }, { name: "Ragnvald",  people: "norse"  },
  { name: "Guthrum",   people: "norse"  }, { name: "Sigurd",    people: "norse"  },
  { name: "Ivarr",     people: "norse"  },
  { name: "Cadwallon", people: "briton" }, { name: "Rhodri",    people: "briton" },
  { name: "Maredudd",  people: "briton" }, { name: "Elisedd",   people: "briton" },
  { name: "Gwriad",    people: "briton" },
  { name: "Nechtan",   people: "pict"   }, { name: "Drest",     people: "pict"   },
  { name: "Talorc",    people: "pict"   }, { name: "Bridei",    people: "pict"   },
  { name: "Uurad",     people: "pict"   },
];

async function main() {
  const db = new Client({ connectionString: DB });
  await db.connect();

  await db.query(`TRUNCATE war_flips, war_ledger, territories, seasons, players RESTART IDENTITY CASCADE`);

  // ---- the men -------------------------------------------------------------
  const men = [];
  for (const c of CAST) {
    const secret = `seed-${c.name.toLowerCase()}-secret`;
    const { rows } = await db.query(
      `INSERT INTO players (name, secret_hash, allegiance, sworn_at)
       VALUES ($1,$2,$3, now() - interval '9 days') RETURNING id`,
      [c.name, hash(secret), c.people],
    );
    men.push({ ...c, id: rows[0].id, secret });
  }

  // ---- the season, nine days in --------------------------------------------
  const startedAt = new Date(Date.now() - 9 * DAY);
  const endsAt = new Date(startedAt.getTime() + SEASON_DAYS * DAY);
  const { rows: sr } = await db.query(
    `INSERT INTO seasons (index, state, started_at, ends_at) VALUES (1,'running',$1,$2) RETURNING id`,
    [startedAt, endsAt],
  );
  const seasonId = sr[0].id;

  const { holdings, thresholds } = openingHoldings(null);
  /** The live map, in the exact shape `war.mjs` reasons about. */
  const ground = {};
  for (const t of TERRITORIES) {
    ground[t.id] = {
      holder: holdings[t.id] || t.people,
      threshold: thresholds[t.id] || t.threshold,
      epoch: 0,
      contest: Object.fromEntries(PEOPLES.map((p) => [p, 0])),
      cleared: 0,
    };
  }

  // ---- nine days of matches ------------------------------------------------
  // The ground a match is fought over is drawn from the front in production.
  // Here it is drawn from a fixed handful, which is what a front LOOKS like
  // after a week: a few borders taking almost all the traffic.
  //
  // AND EACH HOT BORDER HAS ONE PEOPLE PRESSING IT, for the whole nine days.
  // That is not flavour, it is the only arrangement that produces a flip: a
  // territory turns on a LEAD of 240, and if the people banking on it is
  // re-rolled every match then all four accumulate at the same rate and the
  // lead oscillates around zero for ever. The second run of this seed banked
  // 16,434 points and moved not one border, which is exactly that.
  const HOT = {
    mierce: "norse", deira: "saxon", five_boroughs: "saxon", dyfed: "saxon",
    bernicia: "norse", kent: "norse", fib: "saxon", east_anglia: "saxon",
  };
  const hotIds = Object.keys(HOT);
  const ids = TERRITORIES.map((t) => t.id);
  let flips = 0, rows = 0;

  // 420 matches over nine days is about forty-six a day across twenty men,
  // which is a small live deployment rather than a fantasy. A 240-point border
  // needs a sustained LEAD, so the eight flips this produces are a season
  // somebody actually played rather than a number typed into a fixture.
  const MATCHES = 420;
  for (let m = 0; m < MATCHES; m++) {
    // Newest matches last, so `created_at` climbs and the dispatch has an
    // order. Spread across the nine days the season has been running and NOT
    // past `now` — the first run of this seed divided by a match count it no
    // longer had, dated every flip a month into the future, and the map read
    // "0m ago" for three borders that had supposedly moved in September.
    const at = new Date(startedAt.getTime() + Math.floor(((m + 1) / (MATCHES + 1)) * 9 * DAY));
    const territoryId = rnd() < 0.8 ? pick(hotIds) : pick(ids);
    const matchKey = `SEED${String(m).padStart(3, "0")}`;

    // Two to four men per match, each banking a plausible purse. A match is
    // WEIGHTED towards one people rather than dealt evenly across four, and
    // that is not a thumb on the scale — it is the only way a border ever
    // moves. A territory turns on a LEAD of 240; four peoples banking evenly
    // on the same ground produce a lead of nearly zero for ever, which is the
    // flat map the first run of this seed printed.
    const dominant = HOT[territoryId] || pick(men).people;
    const fighters = [];
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const pool = rnd() < 0.7 ? men.filter((x) => x.people === dominant) : men;
      const man = pick(pool);
      if (man && !fighters.some((f) => f.id === man.id)) fighters.push(man);
    }
    for (const man of fighters) {
      const points = Math.min(
        POINTS.cap,
        POINTS.turnout + Math.floor(rnd() * 5) * POINTS.perKill + (rnd() < 0.4 ? POINTS.victory : 0),
      );
      if (points <= 0) continue;
      await db.query(
        `INSERT INTO war_ledger (season_id, match_key, player_id, profile_id, people, territory_id, points, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        [seasonId, matchKey, `p${man.id}`, man.id, man.people, territoryId, points, at],
      );
      rows++;

      // THE RULE, from war.mjs, on the same object the server keeps.
      const g = ground[territoryId];
      const { flip, cleared } = contestGround(g, {
        people: man.people, points, at: at.getTime(), seasonIndex: 1, territoryId,
      });
      g.cleared += cleared;
      if (flip) {
        flips++;
        await db.query(
          `INSERT INTO war_flips (season_id, territory_id, from_people, to_people, created_at)
           VALUES ($1,$2,$3,$4,$5)`,
          [seasonId, territoryId, flip.from, flip.to, at],
        );
      }
    }
  }

  for (const t of TERRITORIES) {
    const g = ground[t.id];
    await db.query(
      `INSERT INTO territories (season_id, territory_id, holder, threshold, epoch, contest, cleared)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [seasonId, t.id, g.holder, g.threshold, g.epoch, JSON.stringify(g.contest), g.cleared],
    );
  }

  // ---- the audit, before anybody photographs it -----------------------------
  const { rows: [bank] } = await db.query(
    `SELECT coalesce(sum(points),0)::int AS banked FROM war_ledger WHERE season_id=$1`, [seasonId]);
  let held = 0, cleared = 0;
  for (const t of TERRITORIES) {
    for (const p of PEOPLES) held += ground[t.id].contest[p];
    cleared += ground[t.id].cleared;
  }
  const ok = bank.banked === held + cleared;
  console.log(`[warseed] ${rows} ledger rows, ${flips} flips, ${men.length} men`);
  console.log(`[warseed] conservation: banked ${bank.banked} = held ${held} + cleared ${cleared} — ${ok ? "OK" : "BROKEN"}`);
  const counts = {};
  for (const t of TERRITORIES) counts[ground[t.id].holder] = (counts[ground[t.id].holder] || 0) + 1;
  console.log(`[warseed] map: ${Object.entries(counts).map(([p, n]) => `${p}:${n}`).join(", ")}`);
  console.log(`[warseed] --as ${men[0].id}:${men[0].secret}   (${men[0].name}, ${men[0].people})`);
  await db.end();
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error("[warseed]", e); process.exit(1); });
