// ============================================================
// THE WAR — the third loop.
//
// `docs/WHAT-THIS-GAME-IS.md` §3: the game is three loops and only two are
// built. The fight is seconds, the match is minutes, and THE WAR IS WEEKS —
// territory shifts, a people rises, a Bretwalda is crowned. This file is that
// third loop's rules, and nothing else.
//
// WHAT IT IS AND IS NOT. It is PURE. Every function here takes a plain object
// and returns a plain object; there is no database, no clock it reads on its
// own, no engine, no fetch. That is deliberate and it is the whole reason
// `tools/wartest.mjs` can play four hundred matches into a season in
// milliseconds and state the invariants directly rather than hoping a played
// season hands them over.
//
// The persistence lives in `src/db/war.ts` and it is a MIRROR, not a second
// opinion: it loads a state, calls the functions below, and writes back what
// they returned. `docs/PROCESS.md` records four instances in `characters.ts`
// alone of the same rule written twice and edited once. The flip threshold is
// written HERE, and the database contains no arithmetic at all.
//
// ---------------------------------------------------------------------------
// THE LOAD-BEARING RULE, and this file is where it is most easily lost.
//
// `docs/FACTIONS.md` §3:
//
//   "Factions decide look, kit, flag and names. NOT stats. And a faction never
//    gates a match — twelve players split four ways is four empty queues
//    instead of one working room."
//
// So note what is NOT in the territory record below: no damage, no reach, no
// health, no speed, no bonus of any kind. A territory carries a name, a
// people, a threshold and a shape. `threshold` is the only number, and it is
// how hard the ground is to TAKE — a property of the map, spent by the men
// fighting over it, never carried into a fight by anybody.
//
// And note what the engine is never told: a man's people. `engine.mjs` deals a
// territory and reports points by PLAYER ID. Which people banks those points is
// resolved afterwards, from the sworn record in the database, by
// `src/db/war.ts`. The engine therefore cannot sort a queue by allegiance
// because it has never heard of allegiance, and `tools/wartest.mjs` §7 holds it
// to that with a conquered map in its hands.
//
// A MAN'S TEAM IS NOT HIS PEOPLE. Four Norse and four Saxons in one room is a
// normal, legal, GOOD match: the red and blue bands are the match's own sides,
// and each man banks what he earned for whichever people he swore to. That is
// what makes "allegiance never splits matchmaking" survivable rather than
// aspirational — there is nothing to split.
// ============================================================

/** The four peoples. `docs/FACTIONS.md` §2. Order is tie-break order. */
export const PEOPLES = Object.freeze(["saxon", "norse", "briton", "pict"]);

/* --------------------------------------------------------------------------
   THE PROJECTION

   The same Web Mercator fit `src/game/client/factionMap/britain.ts` documents,
   restated as arithmetic so a territory can be authored in the coordinates
   its history is recorded in — degrees — rather than in SVG units nobody can
   check.

   It is NOT a re-derivation. The two constants were recovered from the four
   seats britain.ts already publishes (Winchester, Jorvik, Tintagel, Burghead)
   and agree with all four to under two units in a thousand, and with the LAND
   path's own bounding box at the Lizard, at Lowestoft and at Dunnet Head.
   `tools/wartest.mjs` §1 holds them against britain.ts's Winchester so the two
   files cannot drift apart silently.

   The scale is the SAME in x and y, which is not a coincidence and not a
   choice: Mercator is conformal only when it is, and britain.ts's whole
   argument for using it — "Scotland keeps its shape and the Moray Firth stays
   a firth" — depends on it.
   -------------------------------------------------------------------------- */
const MERCATOR_SCALE = 3269.5;
const X_AT_GREENWICH = 513.45;
const Y_AT_EQUATOR = 4258.4;

/** Degrees of latitude and longitude to britain.ts's 639 x 1000 frame. */
export function project(lat, lon) {
  const latRad = (lat * Math.PI) / 180;
  return {
    x: MERCATOR_SCALE * ((lon * Math.PI) / 180) + X_AT_GREENWICH,
    y: Y_AT_EQUATOR - MERCATOR_SCALE * Math.log(Math.tan(Math.PI / 4 + latRad / 2)),
  };
}

/* --------------------------------------------------------------------------
   THE GROUND

   Sixteen territories, four to each people, and the heptarchy's names live
   here rather than in the roster — which is exactly the composition
   `docs/FACTIONS.md` §5 settled on: "four peoples fight over named territory,
   and the territory is where the heptarchy's names live on."

   `bounds` are rings of [lat, lon] in degrees. They are CLAIMS, not
   coastlines: each ring runs well out to sea and the map screen clips it to
   the real Natural Earth shoreline, which is the same technique britain.ts
   already uses for the four faction fields and the reason no boundary has to
   be traced by hand twice. The frontiers of 878 were approximate; so are
   these, and deliberately.

   ARRAY ORDER IS PAINT ORDER. Later entries are drawn over earlier ones, so
   rings may overlap generously and the small territory always wins its ground
   from the large one it sits inside. Kernow is painted after Wessex; Mann and
   the Hebrides are painted last of all. This is why there are no gaps.

   `threshold` is the lead in contested points a challenger needs to take the
   ground. The four seats of `docs/FACTIONS.md` §2 — Winchester, Jorvik,
   Tintagel, Burghead — cost a third more, because a people's own hall should
   be the last thing it loses. It is the ONLY number on a territory.
   -------------------------------------------------------------------------- */

const SEAT_THRESHOLD = 320;
const FIELD_THRESHOLD = 240;

export const TERRITORIES = Object.freeze([
  {
    id: "mierce", name: "Mercia", native: "Mierce", people: "saxon",
    blurb: "The English Mercia the Danes did not take, west of Watling Street.",
    threshold: FIELD_THRESHOLD, anchor: [51.86, -2.24],
    bounds: [[[53.45, -3.35], [53.45, -2.55], [52.67, -2.65], [52.13, -0.99], [51.75, -0.34],
              [51.50, -0.20], [51.35, -2.40], [51.30, -3.70], [52.30, -3.30], [53.10, -3.35]]],
  },
  {
    id: "wessex", name: "Wessex", native: "Westseaxna rice", people: "saxon", seat: "Winchester",
    blurb: "Alfred's own kingdom, and the only one the Danes never held.",
    threshold: SEAT_THRESHOLD, anchor: [51.0632, -1.3080],
    bounds: [[[51.95, -3.80], [51.95, 0.25], [51.30, 0.60], [50.10, 0.60], [49.80, -2.20],
              [50.20, -4.60], [51.20, -4.40]]],
  },
  {
    id: "deira", name: "Deira", native: "Jorvik", people: "norse", seat: "Jorvik",
    blurb: "The kingdom of York, and the Danelaw's northern half.",
    threshold: SEAT_THRESHOLD, anchor: [53.9591, -1.0815],
    bounds: [[[54.70, -3.30], [54.70, -0.30], [53.50, 0.25], [53.50, -3.30]]],
  },
  {
    id: "bernicia", name: "Bernicia", native: "Bryneich", people: "saxon",
    blurb: "Northumbria above the Tees: Bamburgh, Lindisfarne and Lothian.",
    threshold: FIELD_THRESHOLD, anchor: [55.61, -1.71],
    bounds: [[[56.10, -3.20], [56.10, -1.20], [54.55, -0.40], [54.55, -2.60], [55.00, -3.30]]],
  },
  {
    id: "five_boroughs", name: "The Five Boroughs", native: "Fif Burgas", people: "norse",
    blurb: "Derby, Leicester, Nottingham, Lincoln and Stamford — Danish Mercia.",
    threshold: FIELD_THRESHOLD, anchor: [52.95, -1.15],
    bounds: [[[53.55, -2.60], [53.55, -0.10], [52.85, -0.15], [52.13, -0.99], [52.67, -2.65]]],
  },
  {
    id: "east_anglia", name: "East Anglia", native: "East Engle", people: "norse",
    blurb: "Guthrum's, settled by the treaty and farmed by his army.",
    threshold: FIELD_THRESHOLD, anchor: [52.41, 0.75],
    bounds: [[[53.10, -0.35], [53.10, 1.95], [51.70, 1.95], [51.55, 0.20], [52.20, -0.70]]],
  },
  {
    id: "kent", name: "Kent", native: "Cantware", people: "saxon",
    blurb: "The landing ground. Canterbury, and the shortest crossing there is.",
    threshold: FIELD_THRESHOLD, anchor: [51.28, 1.08],
    bounds: [[[51.75, 0.15], [51.75, 1.75], [50.85, 1.75], [50.85, 0.15]]],
  },
  {
    id: "ystrad_clud", name: "Ystrad Clud", native: "Ystrad Clud", people: "briton",
    blurb: "Strathclyde, out of Dumbarton Rock — Britons who outlasted the rest.",
    threshold: FIELD_THRESHOLD, anchor: [55.94, -4.56],
    bounds: [[[56.20, -5.60], [56.15, -3.55], [54.60, -2.90], [54.55, -5.20]]],
  },
  {
    id: "dyfed", name: "Dyfed", native: "Dyfed a Phowys", people: "briton",
    blurb: "The south and the middle of Wales, and the road to the Severn.",
    threshold: FIELD_THRESHOLD, anchor: [51.88, -5.27],
    // THE EAST EDGE IS OFFA'S DYKE AND NOT A ROUND NUMBER. It was -2.85, which
    // is east of Hereford and Gloucester, and the render showed a Welsh fill
    // laid across Somerset and the Cotswolds with a dead-straight border down
    // the middle of England. Nothing in `wartest` could see it and one PNG
    // could not miss it. The south edge is 51.42 for the same reason: the
    // Welsh coast of the Bristol Channel is at 51.4 and the Somerset coast at
    // 51.2, so anything lower puts Dyfed on the English shore.
    bounds: [[[52.70, -5.50], [52.70, -3.05], [51.90, -2.95], [51.42, -3.10], [51.42, -5.60]]],
  },
  {
    id: "gwynedd", name: "Gwynedd", native: "Gwynedd", people: "briton",
    blurb: "Snowdonia and Anglesey. Rhodri Mawr's, and hard country to take.",
    threshold: FIELD_THRESHOLD, anchor: [53.19, -4.47],
    bounds: [[[53.60, -5.00], [53.60, -3.00], [52.60, -3.05], [52.60, -4.95]]],
  },
  {
    id: "kernow", name: "Kernow", native: "Kernow", people: "briton", seat: "Tintagel",
    blurb: "Cornwall, the last British ground in the south, and Tintagel above it.",
    threshold: SEAT_THRESHOLD, anchor: [50.6667, -4.75],
    // The Tamar, near enough: Bude on the north coast down to the Plymouth
    // sound. The first cut ran its north edge along 51.25, which is the north
    // DEVON coast, and the render put a British fill on forty miles of
    // Wessex's shoreline.
    bounds: [[[51.05, -6.20], [50.95, -4.52], [50.30, -4.12], [49.80, -6.40]]],
  },
  {
    id: "fib", name: "Fib", native: "Fib", people: "pict",
    blurb: "Fife and the Tay, and Scone where the Picts made kings.",
    threshold: FIELD_THRESHOLD, anchor: [56.42, -3.44],
    bounds: [[[56.60, -4.40], [56.60, -2.35], [56.00, -2.20], [56.00, -4.30]]],
  },
  {
    id: "circinn", name: "Circinn", native: "Circinn", people: "pict",
    blurb: "Angus and the Mearns, where the symbol stones stand thickest.",
    threshold: FIELD_THRESHOLD, anchor: [56.65, -2.89],
    bounds: [[[57.15, -4.20], [57.15, -1.90], [56.45, -2.10], [56.45, -4.30]]],
  },
  {
    id: "fortriu", name: "Fortriu", native: "Fortriu", people: "pict", seat: "Burghead",
    blurb: "Moray and the great fort at Burghead. The Pictish heartland.",
    threshold: SEAT_THRESHOLD, anchor: [57.7017, -3.4906],
    bounds: [[[58.35, -6.60], [58.35, -1.90], [57.05, -1.85], [57.05, -6.20]]],
  },
  {
    id: "cait", name: "Cait", native: "Cait", people: "pict",
    blurb: "Caithness, Sutherland and Orkney — the far north, and the Norse at its door.",
    threshold: FIELD_THRESHOLD, anchor: [58.65, -3.37],
    bounds: [[[59.60, -6.00], [59.60, -2.20], [58.25, -2.20], [58.25, -6.00]]],
  },
  {
    id: "sudreyjar", name: "Sudreyjar", native: "Sudreyjar", people: "norse",
    blurb: "The Southern Isles: Mann and the Hebrides, held from the sea.",
    threshold: FIELD_THRESHOLD, anchor: [54.24, -4.55],
    bounds: [
      [[54.60, -5.10], [54.60, -4.05], [53.90, -4.05], [53.90, -5.10]],
      [[58.60, -8.10], [58.60, -6.15], [56.55, -6.00], [56.55, -8.10]],
    ],
  },
]);

const BY_ID = new Map(TERRITORIES.map((t) => [t.id, t]));

/** A territory by id, or null. Null and not undefined: a caller has to choose. */
export function territory(id) {
  return BY_ID.get(id) || null;
}

/* --------------------------------------------------------------------------
   THE PURSE — what one match is worth to the war
   -------------------------------------------------------------------------- */

/**
 * The whole economy of the war, and it is four numbers.
 *
 * `cap` is the one that matters and it is not tuning: without it a single room
 * of eight men farming kills for an afternoon moves a border, and the war
 * stops being a record of what happened and becomes a record of who had the
 * afternoon. Forty is a shade under two clean wins, so the ceiling is only
 * reachable by a man who was going to be near it anyway.
 */
export const POINTS = Object.freeze({ turnout: 2, perKill: 1, victory: 12, cap: 40 });

/**
 * Contested points one man earned, from the row the match ledger already
 * printed for him. A pure function of a `MatchResult` and nothing else.
 *
 * Damage deliberately pays NOTHING. It is the noisiest number on the table and
 * the easiest to inflate against a recruit; the war is decided by the fight's
 * verdict — who died and who won — not by how loud it was.
 */
export function pointsFor(result) {
  if (!result) return 0;
  const kills = Math.max(0, Math.floor(Number(result.kills) || 0));
  const raw = POINTS.turnout + kills * POINTS.perKill + (result.isWinner ? POINTS.victory : 0);
  return Math.min(POINTS.cap, raw);
}

/* --------------------------------------------------------------------------
   THE DEAL — which ground a match is fought over
   -------------------------------------------------------------------------- */

/** How many of the most-contested territories a match can be dealt from. */
export const FRONT_WINDOW = 4;

/** FNV-1a. Not for cryptography and not for statistics — for repeatability. */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The ground this match decides.
 *
 * Deterministic in `seed`, so a replay of a match replays the war it fed, and
 * so a client cannot re-roll for a border it would rather fight on.
 *
 * `front.contested` is the war's own ranking, most contested first — the
 * database supplies it, and the engine only ever reads it here. Narrowing to
 * the top few is what makes the map move somewhere a player can SEE: sixteen
 * territories drifting a point a night is a map nobody watches, four of them
 * moving is a front.
 */
export function dealTerritory(seed, front) {
  const offered = (front && Array.isArray(front.contested) ? front.contested : [])
    .filter((id) => BY_ID.has(id));
  const pool = offered.length ? offered : TERRITORIES.map((t) => t.id);
  const window = pool.slice(0, FRONT_WINDOW);
  return window[hash32(String(seed)) % window.length];
}

/* --------------------------------------------------------------------------
   THE WAR STATE
   -------------------------------------------------------------------------- */

const zeroContest = () => Object.fromEntries(PEOPLES.map((p) => [p, 0]));

/**
 * A season, from nothing.
 *
 * `holdings` and `thresholds` default to the map as it stands in 878 — each
 * people on its own four — and are overridden at a season reset by
 * `openingHoldings`.
 */
export function newWar({ seasonIndex = 1, startedAt = 0, holdings = null, thresholds = null } = {}) {
  const territories = {};
  for (const t of TERRITORIES) {
    territories[t.id] = {
      holder: (holdings && holdings[t.id]) || t.people,
      threshold: (thresholds && thresholds[t.id]) || t.threshold,
      epoch: 0,
      contest: zeroContest(),
    };
  }
  return {
    seasonIndex,
    startedAt,
    endsAt: startedAt + SEASON_DAYS * 86_400_000,
    state: "running",
    territories,
    /** profileId (as a string) -> what one man has done this season. */
    contributions: {},
    /** Every flip, in order. This is "what moved while you were asleep". */
    flips: [],
    /** `${matchKey}:${playerId}` for everything already banked. THE replay guard. */
    seen: {},
    /** Running totals, so conservation is checkable without a second pass. */
    bankedTotal: 0,
    clearedTotal: 0,
    verdict: null,
    endedAt: 0,
  };
}

/** Four to six weeks, per `docs/WHAT-THIS-GAME-IS.md` §3. Five is the middle. */
export const SEASON_DAYS = 35;

/**
 * Bank one man's contested points into one territory, ONCE.
 *
 * IDEMPOTENCY IS A PROPERTY OF THIS RULE, not only of a unique index in
 * Postgres. `${matchKey}:${playerId}` is the key, and a repeat answers
 * `already_banked` and moves nothing. The database's unique index is the
 * second belt, for the case of two processes racing; this is the first, and it
 * is the one `tools/wartest.mjs` can hold without a database in the room.
 *
 * Returns `{ applied, reason, flip }`. `flip` is null unless this point was
 * the one that took the ground.
 */
export function bank(state, entry) {
  const { matchKey, playerId, profileId, people, territoryId, points, at = 0 } = entry || {};
  if (!matchKey || !playerId) return { applied: false, reason: "no_key", flip: null };

  const key = `${matchKey}:${playerId}`;
  if (state.seen[key]) return { applied: false, reason: "already_banked", flip: null };

  const ground = state.territories[territoryId];
  if (!ground) return { applied: false, reason: "no_such_territory", flip: null };
  if (!PEOPLES.includes(people)) return { applied: false, reason: "no_such_people", flip: null };

  const n = Math.floor(Number(points) || 0);
  // A zero or negative entry is REMEMBERED and not applied. Remembering it is
  // the point: a retry of a match in which somebody scored nothing must not
  // become a route by which anything else is banked twice.
  if (n <= 0) {
    state.seen[key] = 1;
    return { applied: false, reason: "no_points", flip: null };
  }

  state.seen[key] = 1;
  state.bankedTotal += n;

  const pid = String(profileId);
  const contribution = state.contributions[pid] || (state.contributions[pid] = {
    profileId, people, points: 0, matches: 0, firstAt: at,
  });
  contribution.people = people;
  contribution.points += n;
  contribution.matches += 1;

  const { flip, cleared } = contestGround(ground, { people, points: n, at, seasonIndex: state.seasonIndex, territoryId });
  state.clearedTotal += cleared;
  if (flip) state.flips.push(flip);
  return { applied: true, reason: "banked", flip };
}

/**
 * THE FLIP RULE, and it is written here exactly once.
 *
 * `bank` above calls it with a territory out of an in-memory season;
 * `src/db/war.ts` calls it with a row it has just locked in Postgres. Both get
 * the same arithmetic because it is the same function — and that is the whole
 * reason it is a function. `docs/PROCESS.md` failure mode 3 is "the same
 * constant written twice, so editing one does nothing", recorded four times in
 * `characters.ts` alone; a threshold that lives in this file AND in a SQL
 * statement is that defect with a network hop in it.
 *
 * `ground` is `{ holder, threshold, epoch, contest }` and IS MUTATED. Returns
 * `{ flip, cleared }` — `cleared` being the points the flip consumed, which
 * the caller has to record somewhere or conservation stops reconciling.
 *
 * THE EDGE: a challenger takes the ground when his LEAD OVER THE HOLDER
 * reaches the threshold, not when his own tally does. So a people that fights
 * for its own border defends it, which is what makes a border worth defending
 * — and it is why a territory cannot be taken by two challengers pooling their
 * work, which would make alliances a mechanic nobody designed.
 */
export function contestGround(ground, { people, points, at = 0, seasonIndex = 0, territoryId = "" }) {
  ground.contest[people] += points;
  if (people === ground.holder) return { flip: null, cleared: 0 };

  const lead = ground.contest[people] - ground.contest[ground.holder];
  if (lead < ground.threshold) return { flip: null, cleared: 0 };

  // Cleared, not forgotten: the total is handed back so conservation still
  // reconciles after a flip. A war that cannot account for its own points is a
  // war nobody can audit.
  let cleared = 0;
  for (const p of PEOPLES) cleared += ground.contest[p];
  const flip = { territoryId, from: ground.holder, to: people, at, seasonIndex, epoch: ground.epoch };
  ground.contest = zeroContest();
  ground.holder = people;
  ground.epoch += 1;
  return { flip, cleared };
}

/**
 * The audit. `banked` is what was offered and taken; `held` is what is sitting
 * on the map now; `cleared` is what flips consumed. The three have to close.
 */
export function conservation(state) {
  let held = 0;
  for (const id of Object.keys(state.territories)) {
    for (const p of PEOPLES) held += state.territories[id].contest[p];
  }
  return {
    banked: state.bankedTotal,
    held,
    cleared: state.clearedTotal,
    ok: state.bankedTotal === held + state.clearedTotal,
  };
}

/**
 * The table on the map screen: who holds what, and who has worked hardest.
 *
 * Territory first, because territory is what the war is about. Points break a
 * tie, and the roster order breaks that — so the order is total and the screen
 * never shows two peoples in one place.
 */
export function standings(state) {
  const rows = PEOPLES.map((people) => ({
    people,
    held: Object.values(state.territories).filter((t) => t.holder === people).length,
    points: Object.values(state.contributions).filter((c) => c.people === people)
      .reduce((n, c) => n + c.points, 0),
    contesting: Object.values(state.territories)
      .filter((t) => t.holder !== people && t.contest[people] > 0).length,
  }));
  rows.sort((a, b) => b.held - a.held || b.points - a.points ||
    PEOPLES.indexOf(a.people) - PEOPLES.indexOf(b.people));
  return rows;
}

/**
 * End the season and crown exactly one Bretwalda.
 *
 * EXACTLY ONE is the requirement, and both halves of it are load bearing.
 * Never two: every tie-break below is total, ending at the profile id, so
 * there is no input on which two men can both come first. Never zero when a
 * man has fought: the crown goes to the winning people's highest contributor
 * whoever he is. A season nobody played crowns nobody and says so — an honest
 * null, rather than a crash or a stranger.
 *
 * Ending an ended season returns the verdict it already reached. A second
 * crowning is the same defect as a second banking.
 */
export function endSeason(state, now = 0) {
  if (state.state === "ended" && state.verdict) return state.verdict;

  const table = standings(state);
  const people = table[0].people;
  const men = Object.values(state.contributions).filter((c) => c.people === people && c.points > 0);
  men.sort((a, b) => b.points - a.points || a.firstAt - b.firstAt ||
    String(a.profileId).localeCompare(String(b.profileId)));

  const verdict = {
    seasonIndex: state.seasonIndex,
    people,
    standings: table,
    bretwalda: men.length ? {
      profileId: men[0].profileId, people, points: men[0].points, matches: men[0].matches,
    } : null,
    endedAt: now,
  };
  state.state = "ended";
  state.endedAt = now;
  state.verdict = verdict;
  return verdict;
}

/* --------------------------------------------------------------------------
   THE RESET
   -------------------------------------------------------------------------- */

/** How much cheaper the last champion's ground is to take. */
const TARGET_DISCOUNT = 0.75;

/**
 * The map the next season opens on.
 *
 * `docs/WHAT-THIS-GAME-IS.md` §3: "the map resets, with the previous
 * Bretwalda's kingdom starting at a small advantage and a large target on it."
 * Both halves, and they pull against each other on purpose:
 *
 *   THE ADVANTAGE is one extra territory — the first ground on the map that
 *   was not already theirs. Five against three, which is worth having and is
 *   nowhere near worth a season.
 *
 *   THE TARGET is a discount on their thresholds. Everything they hold is a
 *   quarter cheaper to take than the same ground would be in anyone else's
 *   hands. A champion defends more ground, held less firmly, against three
 *   peoples who can all see where he is.
 *
 * Note what the target is NOT: nobody's warrior is weaker for holding it and
 * nobody's is stronger for taking it. It is a property of the MAP. See the
 * header, and `docs/FACTIONS.md` §3.
 */
export function openingHoldings(previousWinner) {
  const holdings = {};
  const thresholds = {};
  for (const t of TERRITORIES) {
    holdings[t.id] = t.people;
    thresholds[t.id] = t.threshold;
  }
  if (!PEOPLES.includes(previousWinner)) return { holdings, thresholds };

  const spoil = TERRITORIES.find((t) => t.people !== previousWinner);
  if (spoil) holdings[spoil.id] = previousWinner;
  for (const id of Object.keys(holdings)) {
    if (holdings[id] === previousWinner) {
      thresholds[id] = Math.floor(territory(id).threshold * TARGET_DISCOUNT);
    }
  }
  return { holdings, thresholds };
}

/**
 * The front, for `dealTerritory`: the territories closest to changing hands,
 * most urgent first. A pure read of the state, so the engine and the map
 * screen name the same four borders.
 */
export function front(state) {
  const rows = Object.entries(state.territories).map(([id, t]) => {
    const best = PEOPLES.filter((p) => p !== t.holder)
      .reduce((n, p) => Math.max(n, t.contest[p]), 0);
    return { id, remaining: t.threshold - (best - t.contest[t.holder]), pressure: best };
  });
  rows.sort((a, b) => a.remaining - b.remaining || b.pressure - a.pressure || a.id.localeCompare(b.id));
  return {
    contested: rows.map((r) => r.id),
    holdings: Object.fromEntries(Object.entries(state.territories).map(([id, t]) => [id, t.holder])),
  };
}
