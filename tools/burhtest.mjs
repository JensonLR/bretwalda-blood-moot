#!/usr/bin/env node
// BURHTEST — The Burh's law, held headless (backlog 7.4).
//
//   node tools/burhtest.mjs
//
// The wartest idiom exactly: `makeEngine({ autoTick: false })`, seats over
// the real wire, the sim advanced by `step()`, and men killed the engine's
// own way — into the fire at the origin — never by writing "dead" onto them.
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
  c.count = (t) => (c.byType.get(t) || []).length;
  return c;
};
const intoTheFire = (p, health) => {
  p.position = { x: 0, y: 0, z: 0 };
  p.invincible = false; p.invincibleTimer = 0;
  if (health !== undefined) p.health = Math.min(p.health, health);
};
const stepSeconds = (eng, s) => { for (let i = 0; i < Math.ceil(s * RATE); i++) eng.step(); };
const men = (room) => { const out = []; room.players.forEach((p) => out.push(p)); return out; };
const bots = (room) => men(room).filter((p) => p.bot);
const humans = (room) => men(room).filter((p) => !p.bot);

console.log("[burh] the stand against the here, headless\n");

// ---- the room's shape ----
{
  const eng = makeEngine({ autoTick: false });
  const host = open(eng);
  host.send("create", { name: "Weard", mode: "the_burh", bestOf: 5, awaitLoad: false });
  const j = host.last("join");
  const room = eng._rooms.get(j.code);
  check("a burh room is a burh room", j.mode === "the_burh" || room.mode === "the_burh");
  check("the format is forced to one stand whatever the host asked", room.bestOf === 1, `asked 5, got ${room.bestOf}`);
  const guests = [];
  for (let i = 0; i < 4; i++) {
    const g = open(eng);
    g.send("join", { code: j.code, name: `D${i}`, awaitLoad: false });
    guests.push(g);
  }
  check("four defenders seat; the fifth is refused — the rest of the room belongs to the waves",
    humans(room).length === 4 && !!guests[3].last("error"),
    `${humans(room).length} humans, refusal: "${guests[3].last("error")?.message ?? "none"}"`);
  check("a forged mode string lands in the moot, not in a mystery mode", (() => {
    const h2 = open(eng);
    h2.send("create", { name: "X", mode: "zzz_hostile", awaitLoad: false });
    return eng._rooms.get(h2.last("join").code).mode === "blood_moot";
  })());
}

// ---- the stand itself ----
{
  const eng = makeEngine({ autoTick: false });
  const host = open(eng);
  host.send("create", { name: "Weard", mode: "the_burh", awaitLoad: false });
  const code = host.last("join").code;
  const g2 = open(eng);
  g2.send("join", { code, name: "Thane", awaitLoad: false });
  const room = eng._rooms.get(code);
  // Lobby bots are cleared at the bell — prove it by trying to pre-stack.
  host.send("add_bot", { difficulty: "jarl" });
  host.send("start", {});
  stepSeconds(eng, 1.2);
  check("a lone party can start, and the burh opens EMPTY — lobby bots cleared",
    (room.state === "fighting" || room.state === "countdown") && bots(room).length === 0,
    `state=${room.state}, bots=${bots(room).length}`);
  // Through the countdown and the opening two heartbeats.
  stepSeconds(eng, 6);
  // The fixture's defenders are made of sterner stuff — wartest's own idiom
  // (it raises maxHealth to stage holds). The claims here are about the WAVE
  // MACHINERY; a fixture whose party dies to wave three is measuring its own
  // frailty. The final claim burns them from 1 hp, which ignores this.
  humans(room).forEach((p) => { p.maxHealth = 100000; p.health = 100000; });
  check("wave one walks in on its own", room.wave === 1 && bots(room).length === 2,
    `wave=${room.wave}, ${bots(room).length} raiders (1+wave)`);
  check("the first waves are recruits", bots(room).every((b) => b.difficulty === "recruit"));
  check("the wave rides the snapshot", (host.snapshot?.wave ?? 0) === 1);

  // THE HERE HUNTS DEFENDERS — and this claim could not see whether it did.
  //
  // It compared the raiders' distance from the ARENA ORIGIN before the step
  // against their distance from the DEFENDER after it, then allowed a metre of
  // slack on top. Two different measurements, so the bar it actually applied on
  // this fixture was `after < 5.87` against a here already standing at 1.07 m:
  // 4.8 m of slack before a single tick was taken. Both controls PASS it —
  // raiders pinned in place and not hunting at all, and raiders driven bodily
  // AWAY from the defender for the whole two seconds. A claim that green-lights
  // a here running away is not a gate, which is this project's own first law.
  //
  // Same measurement at both ends, and a gap worth closing to close. The
  // defender is put across the ring first because the nearest raider is already
  // in contact and cannot demonstrate approach; the FURTHEST is graded, so one
  // man already at the wall cannot answer for the here.
  // AND THE FIXTURE HAS TO MEAN IT TOO. The first cut of this repair moved ONE
  // defender across the ring and graded the distance to him — and it went red,
  // because there are TWO defenders and the raiders quite correctly walked to
  // the other one. A gate is not improved by breaking the stage; what "hunts
  // DEFENDERS" means is every raider closing on whichever defender is nearest
  // HIM, so that is what is measured, at both ends, with nobody teleported.
  {
    const gap = () => bots(room).map((b) =>
      Math.min(...humans(room).map((h) =>
        Math.hypot(b.position.x - h.position.x, b.position.z - h.position.z))));
    // AND THERE HAS TO BE A GAP TO CLOSE. Measured on the fixture as it stands,
    // both raiders are already within 1.5 m when this claim runs — they are
    // fighting, not approaching, and over two seconds they drift OUT to 1.8 as
    // they circle. Hunting is simply not observable from contact, which is the
    // deeper reason the old claim could never have worked whatever it compared.
    //
    // So the whole garrison is walked to one side of the ring first — BOTH of
    // them, because moving one and grading the distance to him only proves the
    // here prefers the other. Well inside the 18 m play disc, so nobody is
    // pinned on the palisade.
    humans(room).forEach((h) => { h.position = { x: 12, y: 0, z: 0 }; });
    // The FURTHEST such raider, not the nearest: one man already in contact
    // must not be allowed to answer for the whole here, which is how the old
    // claim let a frozen wave through.
    const before = Math.max(...gap());
    stepSeconds(eng, 2);
    const after = Math.max(...gap());
    check("the here closes on the defenders", after < before - 1.0,
      `the raider furthest from any defender came from ${before.toFixed(1)} m to ${after.toFixed(1)} m in two seconds`);
  }

  // Fell one defender, then clear the wave: the fallen must rise for wave 2.
  intoTheFire(humans(room)[1], 1);
  stepSeconds(eng, 3);
  check("one defender down does not end the stand", room.state === "fighting"
    && humans(room).some((p) => p.state === "dead"));
  for (const b of bots(room)) intoTheFire(b, 1);
  stepSeconds(eng, 3);
  check("the cleared wave announces itself", host.count("wave_cleared") >= 1);
  // THE RESPITE MENDS (owner's play report, 27 Aug 2026: "no sort of
  // health regen... just hit dodge & hope"). Wound the STANDING defender
  // before the wave turns: the mend must hand back BURH_MEND of his bar
  // and a full stamina draw — a breath, not a reset — while the fallen
  // man's own rule (rise at 62%) stands untouched beside it.
  const standing = humans(room).find((p) => p.state !== "dead");
  standing.health = 20000;
  standing.stamina = 5;
  for (let i = 0; i < 10 * RATE && room.wave < 2; i++) eng.step();
  check("wave two is larger and the fallen defender has risen",
    room.wave === 2 && bots(room).length === 3
      && humans(room).every((p) => p.state !== "dead"),
    `wave=${room.wave}, raiders=${bots(room).length}, dead=${humans(room).filter((p) => p.state === "dead").length}`);
  check("the risen man pays for his fall",
    humans(room).some((p) => Math.abs(p.health - Math.round(p.maxHealth * 0.62)) <= 1),
    "62% of full on the risen");
  check("the respite mends the standing man — two-fifths of his bar and a full stamina draw",
    Math.abs(standing.health - 60000) <= 1 && standing.stamina === standing.maxStamina,
    `health 20000 -> ${standing.health}, stamina ${standing.stamina}/${standing.maxStamina}`);
  check("last wave's corpses are cleared, not collected", men(room).length === humans(room).length + bots(room).length
    && bots(room).every((b) => b.state !== "dead"));

  // Climb to wave 5 and check the here hardens. Burn each wave, then step
  // until the next one stands — never a fixed clock, which drifts.
  while (room.wave < 5) {
    for (const b of bots(room)) intoTheFire(b, 1);
    const target = room.wave + 1;
    let guard = 0;
    while (room.wave < target && guard++ < 20 * RATE) eng.step();
    if (guard >= 20 * RATE) break;
  }
  check("by the fifth wave the here are jarls", room.wave === 5
    && bots(room).every((b) => b.difficulty === "jarl"),
    `wave=${room.wave}, ${bots(room)[0]?.difficulty}`);
  check("no last stand against the here — every wave is one", !room.lastStandTriggered);

  // The party falls together: the stand ends, the wave is on the verdict.
  for (const p of humans(room)) intoTheFire(p, 1);
  stepSeconds(eng, 4);
  check("the whole party down at once ends the stand", room.state === "finished", `state=${room.state}`);
  const end = host.last("match_end");
  check("the verdict carries the wave that took the burh", (end?.wave ?? 0) === 5, `wave=${end?.wave}`);
  check("the here wins nothing by name", end?.winnerKind === "none");
}

// ============================================================
// THE STAND IS A STAND AT ANY PARTY SIZE — the owner's report, second half
// ============================================================
//
// "the BURH needs a look into as its hard to hit multiple rounds especially
// SOLO" (27 Aug 2026). The respite mend answered the sustain half. This
// section is the half the mend could not reach, and it was an inversion
// rather than a difficulty:
//
//   `count` was `min(1 + wave, maxPlayers - humanCount)`. The second term is
//   FREE SEATS — a capacity fact — and it was doing the work of difficulty
//   scaling. A room seats eight and the burh admits four defenders, so a
//   party of four leaves four seats and a lone man leaves SEVEN. The lone
//   defender was therefore handed the larger here at every wave past the
//   third, and the gap widened as it climbed: at wave five he faced six
//   jarls where the full party faced four, and per defender that is six
//   against one.
//
// This drives two real rooms — one man, and a full four — to the same wave
// and compares them. It is written as the owner's own sentence: a man
// standing alone must never face MORE than the party does.
{
  const waveOf = (defenders, toWave) => {
    const eng = makeEngine({ autoTick: false });
    const host = open(eng);
    host.send("create", { name: "Alone", mode: "the_burh", awaitLoad: false });
    const j = host.last("join");
    const room = eng._rooms.get(j.code);
    for (let i = 1; i < defenders; i++) {
      const g = open(eng);
      g.send("join", { code: j.code, name: `D${i}`, awaitLoad: false });
    }
    // `start`, not `ready` — the idiom the stand fixture above uses and the
    // one the engine actually answers. The first cut of this helper sent
    // `ready`, no room ever left the lobby, and TWO of the claims below went
    // green on 0 <= 0: a gate green because the case is absent. The
    // "both fixtures actually reached the wave" claim exists to make that
    // impossible to repeat.
    host.send("start", {});
    stepSeconds(eng, 7);
    // Sterner stuff, the same way the stand fixture stages its holds: these
    // claims are about the WAVE ARITHMETIC, and a fixture whose defender
    // dies at wave four measures his frailty instead.
    humans(room).forEach((p) => { p.maxHealth = 100000; p.health = 100000; });
    while (room.wave < toWave) {
      for (const b of bots(room)) intoTheFire(b, 1);
      humans(room).forEach((p) => { p.health = p.maxHealth; });
      const target = room.wave + 1;
      let guard = 0;
      while (room.wave < target && guard++ < 20 * RATE) eng.step();
      if (guard >= 20 * RATE) break;
    }
    return { wave: room.wave, raiders: bots(room).length, defenders: humans(room).length };
  };

  const W = 5;
  const one = waveOf(1, W);
  const two = waveOf(2, W);
  const four = waveOf(4, W);
  check("all three fixtures actually reached the wave under test",
    one.wave === W && two.wave === W && four.wave === W,
    `waves ${one.wave}/${two.wave}/${four.wave} with ${one.defenders}/${two.defenders}/${four.defenders} defenders`);

  // THE LAW, and it is the defect stated as one: bringing a friend must
  // never SUMMON another enemy, and standing alone must never conjure two.
  check("the here never shrinks as defenders are added — no inversion",
    one.raiders <= two.raiders && two.raiders <= four.raiders,
    `wave ${W}: 1 defender faces ${one.raiders}, 2 face ${two.raiders}, 4 face ${four.raiders}`);
  check("a man standing ALONE never faces a larger here than a full party does",
    one.raiders <= four.raiders,
    `alone ${one.raiders}, party of ${four.defenders} ${four.raiders}`);

  // And the fix must not be "make it easy" wearing a defect's name: the here
  // still has to grow for the lone defender as the waves climb.
  const early = waveOf(1, 1);
  check("the here still grows for the lone defender as the waves climb",
    early.wave === 1 && one.raiders > early.raiders,
    `wave 1: ${early.raiders} raiders; wave ${W}: ${one.raiders}`);

  // WHAT THIS SECTION DELIBERATELY DOES NOT CLAIM, said out loud because a
  // silence here would read as a promise: past the fifth wave the here
  // neither grows (the seat ceiling) nor hardens (the difficulty ladder tops
  // out at jarl), for a lone man and for a full party alike. That is the
  // burh's shape today — an attrition stand, with the respite mend as the
  // only dial — and it is PRE-EXISTING, not something this fix introduced.
  // Recorded in docs/OPEN-DEFECTS.md for the owner rather than quietly
  // changed here.
  const late = waveOf(1, 12);
  console.log(`  NOTE  past the fifth wave nothing escalates: wave ${W} = ${one.raiders} raiders, `
    + `wave ${late.wave} = ${late.raiders}, both jarls — attrition is the whole late game`);
}

console.log(`\n[burh] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
