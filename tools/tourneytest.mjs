#!/usr/bin/env node
// TOURNEYTEST — the Tournament Moot's law, held headless (backlog 7.3).
//
//   node tools/tourneytest.mjs
//
// Three rulers over one feature, each measuring what only it can:
//   §1 `bracket.mjs` alone — the tree's own law (byes, walkovers, voids,
//      draws, the champion), because the module is the one home of the rule
//      and a harness that re-implements it cannot fail when it changes.
//   §2 `buildLedger`'s crown — the one case the winner is NOT the tally's:
//      a bye can leave the tally level and the bracket must outrank it.
//   §3 the ENGINE, over the real wire in the wartest idiom — duels dealt two
//      men at a time, the hall on the mead-bench, draws refought, the
//      champion on the verdict.
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { makeEngine, buildLedger } = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);
const { buildBracket, settle, reportDuel, champion } = await import(pathToFileURL(resolve(ROOT, "src/game/bracket.mjs")).href);

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
const intoTheFire = (p, health) => {
  p.position = { x: 0, y: 0, z: 0 };
  p.invincible = false; p.invincibleTimer = 0;
  if (health !== undefined) p.health = Math.min(p.health, health);
};
const stepSeconds = (eng, s) => { for (let i = 0; i < Math.ceil(s * RATE); i++) eng.step(); };
const floorOf = (room) => [...room.players.keys()];

console.log("[tourney] the moot of champions, headless\n");

// ---- §1 the bracket's own law ----
{
  const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
  const b4 = buildBracket(["a", "b", "c", "d"], seq([0]));
  check("four men make two stages: semis and a final",
    b4.stages.length === 2 && b4.stages[0].length === 2 && b4.stages[1].length === 1);
  const all = new Set(b4.stages[0].flatMap((m) => [m.a, m.b]));
  check("every man stands in the first round exactly once",
    all.size === 4 && ["a", "b", "c", "d"].every((id) => all.has(id)));

  const b5 = buildBracket(["a", "b", "c", "d", "e"], seq([0]));
  check("five men need the eight-slot tree — three byes", b5.stages.length === 3
    && b5.stages[0].flatMap((m) => [m.a, m.b]).filter((x) => x == null).length === 3);
  const first5 = settle(b5, () => true);
  check("nobody duels a ghost: the byes settle themselves and the first duel has two named men",
    !!first5 && first5.a != null && first5.b != null,
    first5 ? `${first5.a} v ${first5.b}` : "no duel found");

  // A walkover: b left the room; b's OWN OPPONENT advances without steel.
  // (This claim's first fixture asserted on "a"'s match — a man b never
  // faced — and failed the module for doing exactly what the law says.)
  const bw = buildBracket(["a", "b", "c", "d"], seq([0]));
  const d1 = settle(bw, (id) => id !== "b");
  const bMatch = bw.stages[0].find((m) => m.a === "b" || m.b === "b");
  const bFoe = bMatch.a === "b" ? bMatch.b : bMatch.a;
  check("a man alone in his pairing advances by walkover",
    bMatch.done && bMatch.winner === bFoe && d1 && d1.a !== "b" && d1.b !== "b",
    `${bFoe} advances over the absent b`);

  // A void flows forward as a bye: both semifinalists of one side gone.
  const bv = buildBracket(["a", "b", "c", "d"], seq([0]));
  const only = (id) => id === bv.stages[0][1].a; // one man of match 2 stands
  const dv = settle(bv, only);
  check("a whole subtree emptying cascades to a champion without a single fight",
    dv === null && champion(bv) === bv.stages[0][1].a);

  // The draw: reportDuel with no winner leaves the match undone.
  const bd = buildBracket(["a", "b", "c", "d"], seq([0]));
  const dd = settle(bd, () => true);
  reportDuel(bd, dd.stage, dd.index, null);
  const again = settle(bd, () => true);
  check("a drawn duel stays undone and is dealt again — the moot demands an answer",
    again && again.stage === dd.stage && again.index === dd.index);

  // The verdict flows to the right slot, and the champion is the final's.
  const bf = buildBracket(["a", "b", "c", "d"], seq([0]));
  let duel;
  while ((duel = settle(bf, () => true))) reportDuel(bf, duel.stage, duel.index, duel.a);
  check("winners flow slot to slot and the final's winner is the champion",
    champion(bf) === bf.stages[1][0].winner && champion(bf) != null);
  check("the champion is null while the moot still runs",
    champion(buildBracket(["a", "b", "c", "d"], seq([0]))) === null);
}

// ---- §2 the crown outranks the tally ----
{
  // The bye tie, exactly: the crowned man drew a first-round bye, so he and
  // the man his final beat are LEVEL on duels won — and the beaten man has
  // more kills, so every tiebreak the tally knows crowns the wrong head.
  const men = [
    { id: "champ", name: "C", team: "none", kills: 1, deaths: 0, damage: 10 },
    { id: "runner", name: "R", team: "none", kills: 5, deaths: 1, damage: 90 },
    { id: "semi", name: "S", team: "none", kills: 2, deaths: 1, damage: 40 },
  ];
  const roundWins = { champ: 2, runner: 2, semi: 1 };
  const bare = buildLedger({ roundWins, players: men, teamMode: false });
  const crowned = buildLedger({ roundWins, players: men, teamMode: false, crowned: "champ" });
  check("the fixture is the trap: without the crown, the tally seats the beaten man first",
    bare.winnerKey === "runner", `tally says ${bare.winnerKey}`);
  check("the bracket's crown outranks the tally", crowned.winnerKey === "champ" && crowned.winnerBy === "bracket");
  check("the champion heads the table and the rest keep the tally's order",
    crowned.results[0].id === "champ" && crowned.results[0].place === 1
    && crowned.results[1].id === "runner" && crowned.results[1].place === 2
    && crowned.results[2].id === "semi" && crowned.results[2].place === 3);
}

// ---- §3 the engine deals the moot ----
{
  const eng = makeEngine({ autoTick: false });
  const host = open(eng);
  host.send("create", { name: "Cyning", mode: "tournament_moot", bestOf: 5, awaitLoad: false });
  const j = host.last("join");
  const room = eng._rooms.get(j.code);
  check("a tournament room is dealt as one", room.mode === "tournament_moot" && room.maxPlayers === 8);
  check("the format is the bracket, whatever the host asked", room.bestOf === 1, `asked 5, got ${room.bestOf}`);
  host.send("set_rounds", { bestOf: 5 });
  check("a crafted set_rounds cannot re-arm the dial creation refused", room.bestOf === 1);

  for (let i = 0; i < 2; i++) host.send("add_bot", {});
  host.send("start", {});
  check("three men are refused — a tournament needs four",
    room.state === "lobby" && /four/i.test(host.last("error")?.message || ""),
    `"${host.last("error")?.message}"`);
  host.send("add_bot", {});
  host.send("start", {});
  stepSeconds(eng, 5);
  check("four start", room.state === "fighting", `state=${room.state}`);
  check("two men take the floor; the other two take the mead-bench",
    room.players.size === 2 && room.seats.size === 2,
    `floor ${room.players.size}, bench ${room.seats.size}`);
  check("the tree rides the snapshot with every name in its book",
    (host.snapshot?.bracket?.length ?? 0) === 2
    && Object.keys(host.snapshot?.bracketNames || {}).length === 4);

  // Duel one: burn one of the two on the floor. The winner is whoever stood.
  const [f1a, f1b] = floorOf(room);
  intoTheFire(room.players.get(f1b), 1);
  stepSeconds(eng, 3);
  check("a duel ends the round, not the match", room.state === "intermission", `state=${room.state}`);
  const semi1 = room.bracket.stages[0].find((m) => m.done);
  check("the verdict went into the tree", !!semi1 && semi1.winner === f1a,
    `winner ${semi1?.winner === f1a ? "is the man who stood" : semi1?.winner}`);

  // The break runs out; the OTHER pairing is dealt.
  stepSeconds(eng, 7);
  const floor2 = floorOf(room);
  check("the next duel is the other pairing — neither of the first two fights twice in a row",
    room.state === "fighting" && !floor2.includes(f1a) && !floor2.includes(f1b));
  check("the first duel's men watch from the bench",
    room.seats.has(f1a) && room.seats.has(f1b));

  // Duel two: burn one. Then THE FINAL: the two winners, the losers watching.
  const [f2a, f2b] = floor2;
  intoTheFire(room.players.get(f2b), 1);
  stepSeconds(eng, 10);
  const final = floorOf(room);
  check("the final seats the two winners", room.state === "fighting"
    && final.includes(f1a) && final.includes(f2a),
    `final: ${final.length} men, winners ${final.includes(f1a) && final.includes(f2a)}`);
  check("the hall watches the final", room.seats.has(f1b) && room.seats.has(f2b));

  // The crown.
  intoTheFire(room.players.get(f2a), 1);
  stepSeconds(eng, 3);
  const verdict = host.last("match_end");
  check("the bracket crowns the champion on the verdict",
    !!verdict && verdict.winnerId === f1a && verdict.winnerBy === "bracket",
    `winner ${verdict?.winnerId === f1a ? "is the final's winner" : verdict?.winnerId}, by ${verdict?.winnerBy}`);
  check("the whole FIELD stands in the reckoning, not just the final",
    (verdict?.results?.length ?? 0) === 4 && verdict.results[0].id === f1a && verdict.results[0].place === 1,
    `${verdict?.results?.length} rows`);
  check("duels won ride the tally", (verdict?.roundWins?.[f1a] ?? 0) === 2);

  // And the lobby again: the bench empties, the bracket is struck.
  stepSeconds(eng, 12);
  check("the room lobbies whole — every man on the floor, no bracket standing",
    room.state === "lobby" && room.players.size === 4 && room.seats.size === 0 && room.bracket == null);
}

// ---- §4 men who vanish mid-moot ----
//
// NOT the drawn duel: this ruler tried to stage one by burning both men at a
// hit point each, and the engine taught it that a duel between two PRESENT
// men cannot draw at all — `checkRoundEnd` runs per death (engine.mjs, the
// call inside `burnDeath`), so the first man to fall crowns the survivor
// before the second can follow. The tournament's draw branch is defensive
// law, held at the module level in §1. What production WILL do is lose men
// mid-moot — and that is what this section stages, with four humans so the
// wire's own leave path is the lever.
{
  const eng = makeEngine({ autoTick: false });
  const host = open(eng);
  host.send("create", { name: "Cyning", mode: "tournament_moot", awaitLoad: false });
  const code = host.last("join").code;
  const room = eng._rooms.get(code);
  const guests = {};
  for (const n of ["Beorn", "Cedd", "Dunn"]) {
    const g = open(eng);
    g.send("join", { code, name: n, awaitLoad: false });
    guests[g.last("join").playerId] = g;
  }
  const clients = (id) => guests[id] || host;
  host.send("start", {});
  stepSeconds(eng, 5);

  // A man flees the ring: the duel goes to the man who stood.
  const [fa, fb] = floorOf(room);
  clients(fa).send("leave", {});
  stepSeconds(eng, 1);
  const semi1 = room.bracket.stages[0].find((m) => m.done);
  check("fleeing the ring hands the duel to the man who stood",
    room.state === "intermission" && !!semi1 && semi1.winner === fb);

  // The other semi is settled by steel.
  stepSeconds(eng, 7);
  const [sa, sb] = floorOf(room);
  intoTheFire(room.players.get(sb), 0.5);
  stepSeconds(eng, 3);
  check("the other semi resolves by steel", room.state === "intermission"
    && room.bracket.stages[0].every((m) => m.done));

  // The finalist leaves during the break. The deal finds the final a
  // walkover and the moot ends WITHOUT another bell — this is startRound's
  // own "the bracket finished itself" door, the subtlest line in the deal.
  clients(fb).send("leave", {});
  stepSeconds(eng, 8);
  const verdict = host.last("match_end");
  check("a finalist who leaves crowns his opponent without a bell",
    room.state === "finished" && !!verdict && verdict.winnerId === sa && verdict.winnerBy === "bracket",
    `winner ${verdict?.winnerId === sa ? "is the standing finalist" : verdict?.winnerId}`);
}

// ---- §5 a visitor is not a duellist ----
{
  const eng = makeEngine({ autoTick: false });
  const host = open(eng);
  host.send("create", { name: "Cyning", mode: "tournament_moot", awaitLoad: false });
  const code = host.last("join").code;
  const room = eng._rooms.get(code);
  for (let i = 0; i < 3; i++) host.send("add_bot", {});
  host.send("start", {});
  stepSeconds(eng, 5);
  const w = open(eng);
  w.send("join", { code, name: "Gafol", awaitLoad: false });
  const wid = w.last("join").playerId;
  check("a friend joining mid-moot is seated, and the bracket does not know him",
    room.seats.has(wid) && !JSON.stringify(room.bracket.stages).includes(wid));
  // Run the moot down: burn a floor man until the crown is dealt.
  for (let guard = 0; guard < 8 && room.state !== "finished"; guard++) {
    if (room.state === "fighting") intoTheFire(room.players.get(floorOf(room)[1]), 1);
    stepSeconds(eng, 8);
  }
  const verdict = host.last("match_end");
  check("the reckoning is the FIELD's — the visitor is not in it",
    !!verdict && verdict.results.length === 4 && !verdict.results.some((r) => r.id === wid));
  stepSeconds(eng, 12);
  check("and then the lobby deals him in like any bench man",
    room.state === "lobby" && room.players.has(wid));
}

console.log(`\n[tourney] ${passed}/${passed + failed}${failed ? " — FAILING" : ""}`);
process.exit(failed ? 1 : 0);
