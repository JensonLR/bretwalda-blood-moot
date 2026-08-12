// Raising a real moot of a given SHAPE, shared by the two summary harnesses.
//
// The podium rule keys off the headcount and the mode, so every claim about it
// has to be made against a room of the right size that actually fought — not
// against a preset. Both `summaryreal.mjs` (which photographs) and
// `summaryflow.mjs` (which asserts) need the same three rooms, so they are
// built once, here.
//
// Nothing in this file poses anybody or touches the renderer: it clicks the
// shipped lobby UI, joins wire men on the shipped protocol, and then drives
// the doomed into the bonfire.

/** A wire opponent: plain WebSocket, the same protocol the page speaks. */
export function wireMan(port, name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const s = { ws, name, playerId: null, latest: null, open: false };
  ws.addEventListener("open", () => { s.open = true; });
  ws.addEventListener("message", (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m.type === "join") s.playerId = m.data.playerId;
      if (m.data && m.data.players) s.latest = m.data;
    } catch { }
  });
  s.send = (type, data = {}) => ws.send(JSON.stringify({ type, data }));
  s.move = (dx, dz) => {
    const d = Math.hypot(dx, dz) || 1;
    s.send("input", {
      moveX: dx / d, moveZ: dz / d, rotationY: Math.atan2(dx / d, dz / d),
      sprint: true, attack: false, heavyAttack: false, block: false,
      dodge: false, shove: false, attackDir: "right",
    });
  };
  s.me = () => s.latest?.players?.[s.playerId] ?? null;
  return s;
}

// Kit, so the tableau is a picture of eight DIFFERENT men. A corpse is the
// last frame anyone sees of what a player spent his gold on, so a harness that
// dressed the whole moot in the default kit could not show whether that
// survives being laid out dead.
const KIT = [
  { helm: "boar", cloak: "red", hairStyle: "braids", beardStyle: "forked", warPaint: "stripes", cls: "berserker" },
  { helm: "spectacle", cloak: "blue", hairStyle: "long", beardStyle: "full", warPaint: "half", cls: "huscarl" },
  { helm: "ridge", cloak: "gold", hairStyle: "short", beardStyle: "braided", warPaint: "cross", cls: "warden" },
  { helm: "hood", cloak: "brown", hairStyle: "shaved", beardStyle: "none", warPaint: "none", cls: "runekeeper" },
  { helm: "wyrm", cloak: "red", hairStyle: "long", beardStyle: "short", warPaint: "stripes", cls: "warden" },
  { helm: "nasal", cloak: "blue", hairStyle: "braids", beardStyle: "full", warPaint: "none", cls: "huscarl" },
  { helm: "crowned", cloak: "gold", hairStyle: "short", beardStyle: "forked", warPaint: "half", cls: "berserker" },
];

// Exported for `tools/roundbeat.mjs`, which raises its own best-of-three rather
// than going through `raiseMoot` (that one pins every match to a single round,
// so it can never produce an intermission to photograph).
export function dress(w, i) {
  const k = KIT[i % KIT.length];
  w.send("select_class", { warriorClass: k.cls });
  w.send("set_appearance", {
    appearance: {
      helm: k.helm, hairStyle: k.hairStyle, hairColor: 0x6b4a2f,
      beardStyle: k.beardStyle, beardColor: 0x6b4a2f, cloak: k.cloak,
      armorColor: [0x6d6f76, 0x7a5a3a, 0x4a5568, 0x5b4636][i % 4],
      warPaint: k.warPaint,
    },
  });
}

export const SHAPES = {
  // headcount includes the phone player and any AI.
  duel: { label: "HONOUR DUEL", wires: 1, bots: 0 },
  // Three real AI in the eight: they are the only thing in this harness that
  // deals damage, so they are the only thing that can out-SCORE the phone
  // player — and a phone player who ranks third stands on the podium, which is
  // the one seat from which the "the dead are offered no flourish" claim
  // cannot be tested. Four wire men burn; the AI settle the rest.
  ffa: { label: "BLOOD MOOT", wires: 4, bots: 3 },
  // The phone player picks BLUE and is given three AI to be outnumbered by:
  // the sim puts two of them on red and one beside him, so the side that loses
  // is HIS. That is the only shape in which the local man is reliably a corpse
  // on his own summary screen, which is what the emote row has to be judged
  // against — a winner is never offered the wrong thing.
  team: { label: "WAR BAND", wires: 0, bots: 3, team: "BLUE WAR BAND" },
};

/**
 * Clicks a room of `shape` into existence through the shipped UI, joins its
 * wire men and starts the fight. Returns the wire men and the phone player's
 * id. `until` is the caller's polling helper.
 */
export async function raiseMoot(page, shape, { port, until, sleep }) {
  const spec = SHAPES[shape];
  if (!spec) throw new Error(`unknown shape ${shape}`);
  await page.getByText("CREATE BATTLE", { exact: false }).first().click();
  await page.getByText(spec.label, { exact: false }).first().click();
  // Best of ONE: the summary under test only rises at the MATCH's end, and a
  // best-of-three would need every round fought again.
  //
  // WHAT THAT COSTS, named because it cost a real defect. Every match raised
  // through here finishes with its entrants SEPARATED ON ROUNDS — one round,
  // one winner — and that is the single shape in which a ranking keyed on a
  // man's own kills and a placement keyed on his BAND's cannot be told apart.
  // A war band that finished level on rounds printed #1 #2 #2 #1 with the purse
  // running backwards down it, for a whole round of work, and no gate in this
  // tree could see it because no gate in this tree could produce it.
  //
  // Raising a best-of-three would NOT fix that: bands finish level only if a
  // round is drawn, and `tools/tiebreak.mjs` measures on a real stepped engine
  // that `checkRoundEnd` never deals a drawn round — it is called after every
  // single death, so the first band to lose its last man is judged while the
  // other still has one standing. So the case is covered by
  // `summaryflow.mjs` `levelOnRoundsPhase`, which fights a real war band here
  // and then hands the shipped page a ledger `buildLedger` built for a level
  // round tally. This line stays at ONE; what changed is that its consequence
  // is written down.
  await page.getByRole("button", { name: /^1\s*ROUND$/ }).click();
  await page.getByText("CREATE ROOM", { exact: false }).first().click();
  const code = await until(
    () => page.evaluate(() => window.__probe?.joinData?.code || null), "the war code", 60000);

  if (spec.team) await page.getByText(spec.team, { exact: false }).first().click();
  for (let i = 0; i < spec.bots; i++) {
    await page.getByText("ADD AI", { exact: false }).first().click();
    await sleep(250);
  }

  const wires = [];
  for (let i = 0; i < spec.wires; i++) {
    const w = wireMan(port, `Doomed${i + 1}`);
    await until(() => w.open, "a wire man's socket");
    w.send("join", { code, name: `Doomed${i + 1}` });
    await until(() => w.playerId, "a wire man to join");
    dress(w, i);
    wires.push(w);
  }
  await sleep(400);
  await page.getByText("START", { exact: true }).first().click();
  await until(() => page.evaluate(() => window.__probe?.latest?.state === "fighting"),
    "the fight", 30000);
  const playerId = await page.evaluate(() => window.__probe?.playerId);
  return { code, wires, playerId };
}

/**
 * Sends the doomed into the hearth until the match is over. `doomed` is which
 * wire men die; the rest stand still and are killed by whatever else is in the
 * room, or survive. Fire is used because it is the one kill a harness can
 * order without playing the game — the men still die on the server, in a real
 * fight, and are real corpses when they land.
 */
export function driveIntoTheFire(doomed) {
  return setInterval(() => {
    for (const w of doomed) {
      const me = w.me();
      if (!me || me.state === "dead") continue;
      const d = Math.hypot(me.position.x, me.position.z);
      if (d < 1.15) continue;              // stood in the hearth, burning
      w.move(-me.position.x / d, -me.position.z / d);
    }
  }, 50);
}
