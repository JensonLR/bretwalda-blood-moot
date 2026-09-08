#!/usr/bin/env node
// FIGHTTEST — the fight's depth, held headless (backlog 7.7).
//
//   node tools/fighttest.mjs
//
// §1 THE EXECUTION (7.7a). Two humans over the real wire, the sim advanced
// by step(); the knockdown is earned the engine's own way (a light blow
// over a spent balance bar), the finish is a real heavy swung through
// processInput, and every counter-claim gets its own room because a landed
// execution ends the match it proves. This file grows with the wave:
// weapon choice and the directional guard land their sections here.
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { makeEngine, EXECUTION, ARMS, defaultArmsOf, swingDurationOf, WARRIOR_STATS, COMBO_WINDOW, HOOK } =
  await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);

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

/**
 * Two men, adjacent, mid-fight, grace spent — away from the fire at the
 * origin, because this section is about steel. Returns everything a claim
 * needs to swing and judge.
 */
const duelUp = (eng, kit = {}) => {
  const a = open(eng);
  a.send("create", { name: "Ecgbryht", mode: "blood_moot", bestOf: 1, friendly: true, awaitLoad: false });
  const code = a.last("join").code;
  const b = open(eng);
  b.send("join", { code, name: "Osric", awaitLoad: false });
  // Kit is chosen in the LOBBY — select_class is KIT-gated (lobby and
  // intermission only), and this fixture's first cut selected mid-fight,
  // was silently refused, and measured two wardens against each other.
  if (kit.a) a.send("select_class", kit.a);
  if (kit.b) b.send("select_class", kit.b);
  a.send("start", {});
  stepSeconds(eng, 6); // countdown + the spawn grace, fully burnt
  const room = eng._rooms.get(code);
  const pa = room.players.get(a.last("join").playerId);
  const pb = [...room.players.values()].find((p) => p.id !== pa.id);
  // Stood a stride apart on open turf, the attacker facing his man.
  pa.position = { x: 8, y: 0, z: 0 };
  pb.position = { x: 9.2, y: 0, z: 0 };
  pa.invincible = false; pb.invincible = false;
  const face = Math.atan2(pb.position.x - pa.position.x, pb.position.z - pa.position.z);
  return { a, b, room, pa, pb, face };
};
const swing = (client, face, heavy) => client.send("input", {
  moveX: 0, moveZ: 0, rotationY: face, attackDir: "overhead",
  ...(heavy ? { heavyAttack: true } : { attack: true }),
});
/**
 * The knockdown, earned, and NOT a second wasted: his poise is a sliver,
 * the light spends it, and the loop stops the tick he is floored — then
 * waits only for the attacker's own recovery, because the heavy input is
 * dropped (not queued) while `attackTimer` runs. This fixture's first cut
 * stepped a flat 1.5 s and measured the man STANDING BACK UP: the whole
 * window is down+rise = 1.3 s, and an executioner who dawdles loses it —
 * which is the design, and the fixture has to fight like a player.
 */
const floorHim = (eng, f) => {
  f.pb.balance = 1;
  swing(f.a, f.face, false);
  for (let i = 0; i < 40 && f.pb.state !== "knocked"; i++) eng.step();
  for (let i = 0; i < 40 && f.pa.attackTimer > 0; i++) eng.step();
};

console.log("[fight] the fight's depth, headless\n");

// ---- §1 the execution ----
{
  // The finish itself: downed AND low, one heavy takes all of him.
  const eng = makeEngine({ autoTick: false });
  const f = duelUp(eng);
  floorHim(eng, f);
  check("the knockdown is earned the engine's way — poise spent, man floored",
    f.pb.state === "knocked" || f.pb.state === "rising", `state=${f.pb.state}`);
  f.pb.health = Math.floor(f.pb.maxHealth * EXECUTION.healthFrac) - 1;
  const scoreBefore = f.pa.score;
  swing(f.a, f.face, true);
  stepSeconds(eng, 2);
  check("a heavy over a downed, low man takes ALL of him", f.pb.state === "dead", `state=${f.pb.state}, hp=${f.pb.health}`);
  check("the death is NAMED an execution", f.pb.deathCause === "execution", `cause=${f.pb.deathCause}`);
  check("the kill message says so too", f.a.last("kill")?.cause === "execution");
  check("the feed can say 'executed'", f.room.killFeed[f.room.killFeed.length - 1]?.cause === "execution");
  check("the flourish is paid on top of the kill",
    f.pa.score - scoreBefore === 100 + EXECUTION.score, `+${f.pa.score - scoreBefore}`);
}
{
  // Downed but NOT low: the heavy is a blow, not a sentence. A knockdown
  // from full health must never be a death by rule — that would make
  // balance a second health bar.
  const eng = makeEngine({ autoTick: false });
  const f = duelUp(eng);
  floorHim(eng, f);
  const hpBefore = f.pb.health;
  swing(f.a, f.face, true);
  stepSeconds(eng, 2);
  check("a downed man ABOVE the threshold takes a heavy and lives",
    f.pb.state !== "dead" && f.pb.health < hpBefore && f.pb.deathCause == null,
    `hp ${hpBefore} -> ${f.pb.health}`);
}
{
  // A LIGHT on a downed low man is not an execution — the finish costs the
  // committed stroke, or the rule teaches nothing about the heavy.
  const eng = makeEngine({ autoTick: false });
  const f = duelUp(eng);
  floorHim(eng, f);
  f.pb.health = Math.floor(f.pb.maxHealth * EXECUTION.healthFrac) - 1;
  const hpBefore = f.pb.health;
  swing(f.a, f.face, false);
  stepSeconds(eng, 2);
  check("a light blow over the same man is only a blow",
    f.pb.deathCause !== "execution" && f.pb.health < hpBefore,
    `hp ${hpBefore} -> ${f.pb.health}, state=${f.pb.state}`);
}
{
  // A STANDING low man dies a plain death to the same heavy: helplessness
  // is the licence, not the health bar.
  const eng = makeEngine({ autoTick: false });
  const f = duelUp(eng);
  f.pb.health = 5;
  swing(f.a, f.face, true);
  stepSeconds(eng, 2);
  check("the same heavy on a STANDING low man is a death, not an execution",
    f.pb.state === "dead" && f.pb.deathCause === "blow", `cause=${f.pb.deathCause}`);
}

// ---- §2 the arms (7.7b) ----
{
  // The table's own law: every class offers a choice, every DEFAULT delta is
  // empty — the game as shipped moves by nothing when the table lands.
  const classes = Object.keys(WARRIOR_STATS);
  check("every class bears a choice of arms",
    classes.every((c) => ARMS[c] && Object.keys(ARMS[c]).length >= 2));
  check("every default is the class sheet untouched — the shipped game moves by nothing",
    classes.every((c) => Object.keys(ARMS[c][defaultArmsOf(c)].delta).length === 0));
  check("the stroke lean is real, both ways",
    swingDurationOf("huscarl", false, "dane_axe") > swingDurationOf("huscarl", false)
    && swingDurationOf("berserker", false, "twin_beards") < swingDurationOf("berserker", false),
    `huscarl ${swingDurationOf("huscarl", false).toFixed(2)}s -> axe ${swingDurationOf("huscarl", false, "dane_axe").toFixed(2)}s; `
    + `berserker ${swingDurationOf("berserker", false).toFixed(2)}s -> beards ${swingDurationOf("berserker", false, "twin_beards").toFixed(2)}s`);

  // The wire: a man is created with his class default; select_class carries
  // the choice; a forged id or a class change lands the new class's default.
  const eng = makeEngine({ autoTick: false });
  const a = open(eng);
  a.send("create", { name: "Wulf", mode: "blood_moot", awaitLoad: false });
  const room = eng._rooms.get(a.last("join").code);
  const me = room.players.get(a.last("join").playerId);
  check("a new man bears his class's own arm", me.arms === defaultArmsOf(me.warriorClass), me.arms);
  check("the join hands down the whole arms table with the balance sheet",
    !!a.last("join").armsTable && !!a.last("join").armsTable.huscarl);
  a.send("select_class", { warriorClass: "huscarl", arms: "dane_axe" });
  check("the choice rides select_class", me.arms === "dane_axe");
  check("the choice rides the snapshot", a.last("lobby_update")?.players?.[me.id]?.arms === "dane_axe");
  a.send("select_class", { warriorClass: "huscarl", arms: "gar" });
  check("a foreign arm is refused — the warden's gar lands the huscarl his default",
    me.arms === "sword_board", me.arms);
  a.send("select_class", { warriorClass: "huscarl", arms: "dane_axe" });
  a.send("select_class", { warriorClass: "berserker" });
  check("a class change always re-arms — no stale loadout crosses classes",
    me.arms === defaultArmsOf("berserker"), me.arms);
}
{
  // The reach lean, measured in the ring: stood where the sword falls short,
  // the dane axe bites. Same men, same ground, one variable. The gap is NOT
  // the table difference — a swing lunges (LUNGE_LIGHT 0.9 of impulse decays
  // through the windup), so the first cut's 2.4 m was inside BOTH weapons'
  // travel and measured only the damage lean. The honest gap sits between
  // the two weapons' lunge-carried bites, found empirically.
  const gap = 3.0;
  const reachTrial = (arms) => {
    const eng = makeEngine({ autoTick: false });
    const f = duelUp(eng, { a: { warriorClass: "huscarl", arms } });
    f.pa.position = { x: 8, y: 0, z: 0 };
    f.pb.position = { x: 8 + gap, y: 0, z: 0 };
    const hp = f.pb.health;
    swing(f.a, f.face, false);
    stepSeconds(eng, 2);
    return hp - f.pb.health;
  };
  const swordBite = reachTrial("sword_board");
  const axeBite = reachTrial("dane_axe");
  check("the dane axe bites where the sword falls short — reach is real",
    swordBite === 0 && axeBite > 0, `at ${gap}m: sword took ${swordBite}, axe took ${axeBite}`);
}
{
  // The guard trade, measured: the same blow leaks more through a haft-parry
  // than through the board it replaced.
  const guardTrial = (arms) => {
    const eng = makeEngine({ autoTick: false });
    const f = duelUp(eng, { b: { warriorClass: "huscarl", arms } });
    f.pa.position = { x: 8, y: 0, z: 0 };
    f.pb.position = { x: 9.2, y: 0, z: 0 };
    // The guard up and HELD — a single block message lapses with the intent
    // (INPUT_LAPSE_MS 600), and this trial's first cut sent one, watched it
    // lapse before contact, and measured two unguarded men leaking the same.
    const hold = () => f.b.send("input", { moveX: 0, moveZ: 0, rotationY: f.face + Math.PI, attackDir: "overhead", block: true });
    hold();
    stepSeconds(eng, 0.3);
    const hp = f.pb.health;
    swing(f.a, f.face, false);
    for (let i = 0; i < 40; i++) { if (i % 4 === 0) hold(); eng.step(); }
    return hp - f.pb.health;
  };
  const throughBoard = guardTrial("sword_board");
  const throughHaft = guardTrial("dane_axe");
  check("the dane axe's price is the guard — the same blow leaks harder through a haft",
    throughBoard >= 0 && throughHaft > throughBoard,
    `board let ${throughBoard} through, haft ${throughHaft}`);
}

// ---- §3 the directional guard (7.7c) ----
{
  // Same blow, two guards: the one that answers it and the one facing the
  // wrong way. The mismatched guard keeps half its worth (GUARD.mismatch).
  const guardLeak = (guardDir, swingDir, wall = false) => {
    const eng = makeEngine({ autoTick: false });
    const f = duelUp(eng, { b: { warriorClass: "huscarl", arms: "sword_board" } });
    f.pa.position = { x: 8, y: 0, z: 0 };
    f.pb.position = { x: 9.2, y: 0, z: 0 };
    if (wall) f.b.send("input", { moveX: 0, moveZ: 0, rotationY: f.face + Math.PI, attackDir: guardDir, ability: true });
    const hold = () => f.b.send("input", { moveX: 0, moveZ: 0, rotationY: f.face + Math.PI, attackDir: guardDir, block: true });
    hold();
    stepSeconds(eng, 0.3);
    const hp = f.pb.health;
    f.a.send("input", { moveX: 0, moveZ: 0, rotationY: f.face, attackDir: swingDir, attack: true });
    for (let i = 0; i < 40; i++) { if (i % 4 === 0) hold(); eng.step(); }
    return hp - f.pb.health;
  };
  const matched = guardLeak("overhead", "overhead");
  const wrong = guardLeak("right", "overhead");
  check("the guard holds its full worth only on the line it faces",
    matched >= 0 && wrong > matched,
    `matched guard let ${matched} through, wrong-way ${wrong}`);
  const walled = guardLeak("right", "overhead", true);
  check("SHIELD WALL covers every line at once — the ability is blind to direction",
    walled <= matched && walled < wrong, `wall let ${walled} through against the wrong line`);
}
{
  // THE PARRY STAYS A TIMING READ. A guard snapped up inside the window
  // with the WRONG direction still turns the blow — demanding the
  // direction too would price the hardest input in the game out of human
  // hands, and this claim is what keeps that a law rather than an intent.
  const eng = makeEngine({ autoTick: false });
  const f = duelUp(eng);
  f.pa.position = { x: 8, y: 0, z: 0 };
  f.pb.position = { x: 9.2, y: 0, z: 0 };
  f.a.send("input", { moveX: 0, moveZ: 0, rotationY: f.face, attackDir: "overhead", attack: true });
  stepSeconds(eng, 0.25);
  f.b.send("input", { moveX: 0, moveZ: 0, rotationY: f.face + Math.PI, attackDir: "stab", block: true });
  stepSeconds(eng, 1);
  const parried = (f.b.byType.get("hit") || []).some((h) => h.type === "parry");
  check("a parry is a timing read, never a direction test",
    parried && f.pa.state === "staggered" || parried,
    parried ? "wrong-direction guard inside the window still turned the blow" : `no parry seen; attacker=${f.pa.state}`);
}

// ---- §4 the chain is REACHABLE ------------------------------------------
//
// THE DEFECT THIS SECTION EXISTS FOR. `comboTimer` was set to `COMBO_WINDOW`
// at the START of a swing, and a light swing is `attackSpeed` seconds long —
// huscarl 1.02, warden 0.85, berserker 1.33, against a window of 0.8. The
// window lapsed before the man finished the stroke that opened it, so for
// three classes in four `comboCount` could never leave 1 and EVERYTHING built
// on the chain was dead code they could not reach: the damage ramp, the
// step-through and the pivot in `chainSwing`, and the cut cycle in
// `render/chain.ts`. The owner played it and said the moves felt boring and
// uninspired; for three men in four he had exactly one light attack.
//
// Nothing in this repository could see it. `chaintest` proves the SHAPES are
// different given a combo count, `playtest` proves a click reaches the sim,
// and neither asks the only question that matters: can a player holding the
// button actually get there. This does, on the real engine, per class.
{
  console.log("");
  // A man who cannot die and an attacker who cannot tire: this section is
  // about the WINDOW, and a fixture that ends on a corpse or a spent bar
  // measures stamina and health instead.
  const reached = (cls) => {
    const eng = makeEngine({ autoTick: false });
    const f = duelUp(eng, { a: { warriorClass: cls } });
    f.pb.health = 1e6; f.pb.maxHealth = 1e6;
    let max = 0;
    for (let i = 0; i < RATE * 6; i++) {
      f.pa.stamina = f.pa.maxStamina;
      f.a.send("input", { moveX: 0, moveZ: 0, rotationY: f.face, attack: true, attackDir: "right" });
      eng.step();
      max = Math.max(max, f.pa.comboCount);
    }
    return max;
  };
  // Three, because three is the whole authored vocabulary: `CHAIN_STEPS` is 3
  // and the cut cycle needs three blows to show three different strokes. A
  // class that can only ever reach 2 has half a combo system.
  for (const cls of ["huscarl", "warden", "runekeeper", "berserker"]) {
    const max = reached(cls);
    check(`${cls}: holding the attack reaches the whole chain`, max >= 3,
      `swing ${swingDurationOf(cls, false).toFixed(2)}s, window opens at the end + `
      + `${COMBO_WINDOW}s, comboCount reached ${max}`);
  }
  // AND THE WINDOW IS LONGER THAN NO TIME AT ALL. A grace of zero would make
  // the chain a frame-perfect input rather than a tempo, and every claim above
  // would still pass while holding the button.
  check("the combo grace is a tempo a hand can keep", COMBO_WINDOW >= 0.25 && COMBO_WINDOW <= 0.8,
    `${COMBO_WINDOW}s after the stroke ends`);
  // A DELIBERATE TAP CHAINS TOO. Holding the button is the easy case — the
  // sim fires the moment `attackTimer` hits zero. This is the player who
  // presses again a quarter of a second after his man has recovered.
  {
    const eng = makeEngine({ autoTick: false });
    const f = duelUp(eng, { a: { warriorClass: "huscarl" } });
    f.pb.health = 1e6; f.pb.maxHealth = 1e6;
    let max = 0;
    for (let blow = 0; blow < 3; blow++) {
      f.pa.stamina = f.pa.maxStamina;
      f.a.send("input", { moveX: 0, moveZ: 0, rotationY: f.face, attack: true, attackDir: "right" });
      eng.step();
      max = Math.max(max, f.pa.comboCount);
      f.a.send("input", { moveX: 0, moveZ: 0, rotationY: f.face, attack: false, attackDir: "right" });
      for (let i = 0; i < RATE * 2 && f.pa.attackTimer > 0; i++) eng.step();
      stepSeconds(eng, 0.25);                       // his hand, not the engine's
    }
    check("a deliberate tap a quarter-second after recovery keeps the chain", max >= 3,
      `comboCount reached ${max} over three tapped blows`);
  }
  // AND IT IS LOST BY ANYONE WHO DOES SOMETHING ELSE. A window that survives a
  // pause is not a window; the chain has to be a thing you keep, or the ramp
  // is a gift rather than a reward.
  {
    const eng = makeEngine({ autoTick: false });
    const f = duelUp(eng, { a: { warriorClass: "huscarl" } });
    f.pb.health = 1e6; f.pb.maxHealth = 1e6;
    f.a.send("input", { moveX: 0, moveZ: 0, rotationY: f.face, attack: true, attackDir: "right" });
    eng.step();
    f.a.send("input", { moveX: 0, moveZ: 0, rotationY: f.face, attack: false, attackDir: "right" });
    for (let i = 0; i < RATE * 3 && f.pa.attackTimer > 0; i++) eng.step();
    stepSeconds(eng, COMBO_WINDOW + 0.3);           // he hesitated
    f.pa.stamina = f.pa.maxStamina;
    f.a.send("input", { moveX: 0, moveZ: 0, rotationY: f.face, attack: true, attackDir: "right" });
    eng.step();
    check("a man who hesitates past the window opens a new chain", f.pa.comboCount === 1,
      `comboCount=${f.pa.comboCount} after waiting ${(COMBO_WINDOW + 0.3).toFixed(2)}s past recovery`);
  }
}

// ---- §5 THE BIND — steel into a board moves BOTH men --------------------
//
// A blow into a shield is a COLLISION, and it was the quietest thing in the
// game: a blocked light moved the man behind the board fourteen centimetres and
// the man who threw it two. Two men in a shield wall trading blows stood
// exactly where they started, which is the one thing that never happens.
//
// It matters beyond the look. A shield-bearer who turtles now gives ground, so
// blocking is a decision rather than a damage discount — and driving a man
// backwards into the hearth becomes a real tactic with a real tool, which is
// what the fire in the middle of the arena is for.
{
  console.log("");
  const bind = (heavy) => {
    const eng = makeEngine({ autoTick: false });
    const f = duelUp(eng);
    // He holds his guard, facing the blow, and the line between them is +x.
    const hold = () => f.b.send("input", {
      moveX: 0, moveZ: 0, rotationY: f.face + Math.PI, block: true, attackDir: "overhead",
    });
    hold();
    stepSeconds(eng, 0.4);                      // past the parry window
    const ax0 = f.pa.position.x, bx0 = f.pb.position.x;
    swing(f.a, f.face, heavy);
    for (let i = 0; i < 40 && !(eng._rooms.size === 0); i++) { hold(); eng.step(); }
    return {
      target: f.pb.position.x - bx0,
      striker: f.pa.position.x - ax0,
      turned: (f.b.byType.get("hit") || []).some((h) => /^blocked/.test(h.type || "")),
    };
  };
  const L = bind(false), H = bind(true);
  check("a blocked blow was actually turned by the guard", L.turned && H.turned,
    `light ${L.turned}, heavy ${H.turned}`);
  // A third of a metre and three quarters. The bar is half of each, so the
  // claim survives the sim's own separation push and the tick's granularity.
  check("a blocked light drives the man behind the board back", L.target > 0.15,
    `${L.target.toFixed(2)}m`);
  check("a blocked heavy drives him back further still", H.target > L.target * 1.5,
    `${L.target.toFixed(2)}m -> ${H.target.toFixed(2)}m`);
  // AND THE STRIKER GIVES GROUND TOO — measured against a WHIFF, not against
  // where he started. A heavy lunges him 1.25 units forward whatever it meets,
  // so the bind's quarter-metre back never makes his net travel negative; the
  // first form of this claim asked for that and was simply wrong about the
  // arithmetic. What the bind does is take ground off the lunge, and the only
  // way to see it is to throw the same blow at nobody.
  const whiff = (() => {
    const eng = makeEngine({ autoTick: false });
    const f = duelUp(eng);
    f.pb.position = { x: 40, y: 0, z: 0 };      // out of every reach in the game
    const x0 = f.pa.position.x;
    swing(f.a, f.face, true);
    stepSeconds(eng, 2);
    return f.pa.position.x - x0;
  })();
  check("...and the man who threw it is put back on his heels",
    H.striker < whiff - 0.12,
    `he carries ${whiff.toFixed(2)}m through air and ${H.striker.toFixed(2)}m into a board`);
}

// ---- §6 THE HOOK — what the beard of an axe is FOR -----------------------
//
// An axe with a beard is not a heavier sword. Its whole point, and the reason
// it is the weapon of this period rather than a curiosity, is that the hook
// behind the edge catches the RIM of a shield and drags it down — and the man
// behind it is then standing in the open with his arm pulled across him.
//
// Without it, the correct play against a man who turtles is to WAIT for his
// stamina, which is not a fight. This is the axe's answer, and these are the
// claims that keep it one: only a heavy, only a blow the guard turned, only a
// bearded head, and only against a board that still exists.
{
  console.log("");
  /**
   * One blow into a held guard. `arms` re-arms the attacker in the lobby —
   * `select_arms` is kit-gated the same way `select_class` is.
   */
  const intoGuard = (cls, arms, heavy) => {
    const eng = makeEngine({ autoTick: false });
    // THE MAN BEING HOOKED HAS TO HAVE A BOARD, and the first cut of this
    // fixture did not say so: the room dealt the defender whatever class it
    // liked, he came up carrying a spear in both hands, `target.shield` was
    // null and the hook correctly declined to catch a rim that did not exist.
    const f = duelUp(eng, { a: { warriorClass: cls }, b: { warriorClass: "huscarl" } });
    if (arms) { f.pa.arms = arms; }
    const hold = () => f.b.send("input", {
      moveX: 0, moveZ: 0, rotationY: f.face + Math.PI, block: true, attackDir: "overhead",
    });
    hold();
    stepSeconds(eng, 0.4);                        // past the parry window
    swing(f.a, f.face, heavy);
    // STOPPED ON THE BLOW, not run to the end of the swing. The window is 0.85 s
    // and a berserker's heavy is 1.66 s long — the first cut of this stepped
    // three seconds and then asked whether the guard was still hooked, which is
    // like checking a bruise next week.
    const seen = () => (f.b.byType.get("hit") || []).some((h) => /^blocked|^hook/.test(h.type || ""));
    for (let i = 0; i < 60 && !seen(); i++) { hold(); eng.step(); }
    const msgs = f.b.byType.get("hit") || [];
    return { f, eng, hold, hooked: msgs.some((h) => h.type === "hook"), timer: f.pb.hookedTimer || 0 };
  };

  const axe = intoGuard("berserker", "dane_axe", true);
  check("a bearded axe swung hard into a board hooks it down",
    axe.hooked && axe.timer > 0,
    `hookedTimer ${axe.timer.toFixed(2)}s, window ${HOOK.window}s; hits seen: `
    + `${(axe.f.b.byType.get("hit") || []).map((h) => h.type).join(",") || "none"}; `
    + `attacker arms=${axe.f.pa.arms} cls=${axe.f.pa.warriorClass} shield=${axe.f.pb.shield}`);
  // AND THE GUARD WILL NOT COME BACK UP. This is the whole payoff: the blow
  // itself does what a blocked heavy always did, and what it buys is the
  // opening.
  //
  // AND THE CLAIM IS MADE PAST THE STAGGER. A blocked heavy already staggers
  // him for 0.6 s and a staggered man cannot block anyway, so a hook window
  // inside that proves nothing — the first cut of this asserted the guard was
  // down eight ticks after the blow and would have passed with the hook deleted.
  {
    // Out the far side of the stagger, with him asking for his guard the whole
    // way.
    for (let i = 0; i < 16; i++) { axe.hold(); axe.eng.step(); }
    let raised = false;
    for (let i = 0; i < 8; i++) { axe.hold(); axe.eng.step(); if (axe.f.pb.state === "blocking") raised = true; }
    check("...and he cannot raise it once the stagger is over and the beard still has it",
      !raised && axe.f.pb.staggerTimer <= 0 && axe.f.pb.hookedTimer > 0,
      `state=${axe.f.pb.state}, stagger ${(axe.f.pb.staggerTimer || 0).toFixed(2)}s, `
      + `hook ${axe.f.pb.hookedTimer.toFixed(2)}s left`);
  }
  // AND IT COMES BACK. A guard broken for ever is a man deleted.
  {
    for (let i = 0; i < 60; i++) { axe.hold(); axe.eng.step(); }
    check("...and it comes back when the window is out",
      axe.f.pb.hookedTimer === 0 && axe.f.pb.state === "blocking",
      `state=${axe.f.pb.state}`);
  }
  // A SWORD SLIDES OFF A RIM. Without this claim the hook is not the axe's, it
  // is everyone's, and the trade `ARMS` prices — the best guard in the game
  // given away for the Dane axe — buys nothing.
  check("a sword's heavy does not hook", !intoGuard("huscarl", "sword_board", true).hooked);
  // AND A CONTROLLED CUT HAS NO WEIGHT BEHIND THE BEARD.
  check("a light axe blow does not hook", !intoGuard("berserker", "dane_axe", false).hooked);
}

// ---- §7 THE CHARGE — the first blow a man's FEET decide -----------------
//
// Every attack in this game was the same attack whether he was stood still or
// coming down the field at eight metres a second: the same lunge, the same
// damage, the same everything. That is the flattest thing a melee game can do,
// because closing the distance is the decision a fight is actually made of.
//
// The fixture RUNS HIM IN rather than writing a velocity onto him, because
// what is being tested is the path a player takes: sprint, arrive, swing.
{
  console.log("");
  const runIn = (heavy) => {
    const eng = makeEngine({ autoTick: false });
    const f = duelUp(eng);
    f.pa.position = { x: 3.4, y: 0, z: 0 };
    f.pb.position = { x: 9.2, y: 0, z: 0 };
    f.pb.health = 1e6; f.pb.maxHealth = 1e6;
    f.pb.balance = f.pb.maxBalance;
    const face = Math.atan2(1, 0);
    const run = (attack) => f.a.send("input", {
      moveX: 1, moveZ: 0, rotationY: face, sprint: true, attackDir: "right",
      ...(attack ? (heavy ? { heavyAttack: true } : { attack: true }) : {}),
    });
    // Up to speed, and close.
    for (let i = 0; i < 60 && f.pb.position.x - f.pa.position.x > 1.6; i++) { run(false); eng.step(); }
    const speed = Math.hypot(f.pa.velocity.x, f.pa.velocity.z);
    const stam0 = f.pa.stamina, x0 = f.pa.position.x, bal0 = f.pb.balance;
    run(true);
    eng.step();
    const charged = f.pa.swingCharge === true;
    const spent = stam0 - f.pa.stamina;
    for (let i = 0; i < 40 && f.pa.attackTimer > 0; i++) { run(false); eng.step(); }
    return { f, speed, charged, spent, carried: f.pa.position.x - x0, balance: bal0 - f.pb.balance,
      dmg: (f.b.byType.get("hit") || []).reduce((t, h) => t + (h.damage || 0), 0) };
  };
  const stood = (() => {
    const eng = makeEngine({ autoTick: false });
    const f = duelUp(eng);
    f.pb.health = 1e6; f.pb.maxHealth = 1e6;
    f.pb.balance = f.pb.maxBalance;
    const stam0 = f.pa.stamina, x0 = f.pa.position.x, bal0 = f.pb.balance;
    swing(f.a, f.face, false);
    for (let i = 0; i < 40 && f.pa.attackTimer > 0; i++) eng.step();
    return { spent: stam0 - f.pa.stamina, carried: Math.abs(f.pa.position.x - x0),
      balance: bal0 - f.pb.balance,
      dmg: (f.b.byType.get("hit") || []).reduce((t, h) => t + (h.damage || 0), 0) };
  })();

  const charge = runIn(false);
  check("a blow thrown at a run is marked as a charge",
    charge.charged, `he was doing ${charge.speed.toFixed(2)} u/s`);
  check("...and it carries him nearly three times as far",
    Math.abs(charge.carried) > stood.carried * 2,
    `${stood.carried.toFixed(2)}m stood against ${Math.abs(charge.carried).toFixed(2)}m at a run`);
  check("...and it lands harder", charge.dmg > stood.dmg,
    `${stood.dmg} stood against ${charge.dmg} at a run`);
  check("...and takes more of his balance", charge.balance > stood.balance * 1.2,
    `${stood.balance.toFixed(0)} against ${charge.balance.toFixed(0)}`);
  // AND IT IS PAID FOR. A charge that costs the same as a standing cut is a
  // free upgrade for anyone holding the sprint key, which is everyone.
  check("...and it costs him more than a standing cut", charge.spent > stood.spent,
    `${stood.spent.toFixed(0)} stamina stood against ${charge.spent.toFixed(0)} at a run`);
  // A HEAVY IS ITS OWN COMMITMENT. Stacking a run on it would make the answer
  // to everything "sprint and press E".
  check("a heavy does not also charge", runIn(true).charged === false);
}

console.log(`\n[fight] ${passed}/${passed + failed}${failed ? " — FAILING" : ""}`);
process.exit(failed ? 1 : 0);
